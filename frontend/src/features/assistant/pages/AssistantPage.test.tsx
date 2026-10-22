/** The assistant page against a stubbed backend that answers with the real /ai payload shapes (types.ts). */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AI_ASSISTANT_ENABLED } from '@/config/constants'
import type { AiQuota } from '@/types/models'

import type { ChatReply, ChatTurn, InsightsReport } from '../types'
import { AssistantPage } from './AssistantPage'

// The real session needs Supabase env vars; these tests never sign in.
vi.mock('@/lib/auth-session', () => ({
  authSession: { hasStoredSession: () => false, getAccessToken: async () => 'token', refresh: async () => false, signIn: vi.fn(), signOut: vi.fn() },
}))
// Toasts are irrelevant here and need a Toaster.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const QUOTA: AiQuota = { limit: 20, remaining: 14, resets_at: '2026-10-20T10:00:00Z' }

type Handler = (body: unknown) => { status: number; body: unknown }

/** Stubs fetch: GET /ai/quota answers QUOTA (or `quota`), POSTs go to `handlers` by path. Returns the spy. */
function stubApi(handlers: Record<string, Handler>, quota: () => AiQuota = () => QUOTA) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input).replace(/^.*\/api\/v1/, '')
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    if (path === '/ai/quota') return reply(200, quota())
    const handler = handlers[path]
    if (!handler) return reply(404, { detail: 'Not found.', code: 'NOT_FOUND' })
    const { status, body } = handler(init?.body ? JSON.parse(String(init.body)) : undefined)
    return reply(status, body)
  })
}

/** Renders the page with a fresh query cache. */
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AssistantPage />
    </QueryClientProvider>,
  )
}

/** Types a question and presses Enter. */
async function ask(question: string) {
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: /ask about sales/i }), `${question}{Enter}`)
}

afterEach(() => vi.restoreAllMocks())

describe('AssistantPage (M8)', () => {
  it('is switched on', () => {
    expect(AI_ASSISTANT_ENABLED).toBe(true)
  })

  it('shows the chat, the insights panel and the quota meter instead of "Coming soon"', async () => {
    stubApi({})
    const { container } = renderPage()

    expect(await screen.findByLabelText('14 AI requests left this hour')).toHaveTextContent('14 of 20 requests left')
    expect(screen.getByText('Ask about sales, stock or products', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Insights report' })).toBeInTheDocument()
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
    expect(container.querySelector('[inert]')).toBeNull()
  })

  it('sends the question and shows the answer with its rows, data sources and new quota', async () => {
    let sent: ChatTurn[] = []
    const reply: ChatReply = {
      message: {
        role: 'assistant',
        content: 'Two products are low.',
        rows: [
          { label: 'Hammer', value: '0 / min 5' },
          { label: 'Hammer', value: '3 / min 10' },
        ],
        sources: [{ tool: 'get_low_stock_products', label: 'Low-stock products · now' }],
      },
      quota: { ...QUOTA, remaining: 13 },
    }
    stubApi({
      '/ai/chat': (body) => {
        sent = (body as { messages: ChatTurn[] }).messages
        return { status: 200, body: reply }
      },
    })
    renderPage()

    await ask('What’s running low?')

    expect(await screen.findByText('Two products are low.')).toBeInTheDocument()
    expect(sent).toEqual([{ role: 'user', content: 'What’s running low?' }])
    expect(screen.getByText('0 / min 5')).toBeInTheDocument()
    expect(screen.getByText('3 / min 10')).toBeInTheDocument()
    expect(screen.getByText('Data used')).toBeInTheDocument()
    expect(screen.getByTitle('Read-only tool: get_low_stock_products')).toHaveTextContent('Low-stock products · now')
    expect(screen.getByLabelText('13 AI requests left this hour')).toBeInTheDocument()
  })

  it('hides "Data used" when the answer used no tools', async () => {
    stubApi({
      '/ai/chat': () => ({ status: 200, body: { message: { role: 'assistant', content: 'I only know about IMS.', rows: [], sources: [] }, quota: QUOTA } }),
    })
    renderPage()

    await ask('Weather?')

    expect(await screen.findByText('I only know about IMS.')).toBeInTheDocument()
    expect(screen.queryByText('Data used')).not.toBeInTheDocument()
  })

  it('explains an outage and offers to retry (AI_UNAVAILABLE)', async () => {
    stubApi({ '/ai/chat': () => ({ status: 503, body: { detail: 'The AI service isn’t responding. Try again in a moment.', code: 'AI_UNAVAILABLE' } }) })
    renderPage()

    await ask('Sales today?')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The AI service isn’t responding')
    expect(alert).toHaveTextContent('wasn’t counted against your limit')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows the hourly limit and refreshes the quota after RATE_LIMITED', async () => {
    let quota = QUOTA
    stubApi(
      {
        '/ai/chat': () => {
          quota = { ...QUOTA, remaining: 0 }
          return { status: 429, body: { detail: 'You’ve used all 20 AI requests this hour.', code: 'RATE_LIMITED' } }
        },
      },
      () => quota,
    )
    renderPage()
    await screen.findByLabelText('14 AI requests left this hour')

    await ask('One more?')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Hourly limit reached')
    expect(alert).toHaveTextContent('You’ve used all 20 AI requests this hour.')
    expect(within(alert).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(await screen.findByLabelText('0 AI requests left this hour')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /ask about sales/i })).toBeDisabled()
  })

  it('sends at most 20 turns of history', async () => {
    let sent: ChatTurn[] = []
    let n = 0
    stubApi({
      '/ai/chat': (body) => {
        sent = (body as { messages: ChatTurn[] }).messages
        n += 1
        return { status: 200, body: { message: { role: 'assistant', content: `Answer ${n}`, rows: [], sources: [] }, quota: QUOTA } }
      },
    })
    renderPage()

    for (let i = 1; i <= 11; i++) {
      await ask(`Question ${i}`)
      await screen.findByText(`Answer ${i}`)
    }

    expect(sent).toHaveLength(20)
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'Question 11' })
  })

  it('generates an insights report from the selected period', async () => {
    let period: unknown
    const report: InsightsReport = {
      start_date: '2026-10-01',
      end_date: '2026-10-20',
      figures: [
        { label: 'Revenue', value: 'SAR 250.00', tone: null },
        { label: 'Low stock', value: '1 product', tone: 'warning' },
      ],
      sections: [{ heading: 'Sales are up', body: 'Revenue rose 25.0%.' }],
      generated_at: '2026-10-20T09:00:00Z',
      quota: { ...QUOTA, remaining: 12 },
    }
    stubApi({
      '/ai/insights': (body) => {
        period = body
        return { status: 200, body: report }
      },
    })
    renderPage()

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Generate' }))

    expect(await screen.findByText('Sales are up')).toBeInTheDocument()
    expect(screen.getByText('Revenue rose 25.0%.')).toBeInTheDocument()
    expect(screen.getByText('SAR 250.00')).toBeInTheDocument()
    expect(screen.getByText('1 product')).toHaveClass('text-warning')
    expect(period).toEqual({ start_date: expect.stringMatching(/^\d{4}-\d{2}-01$/), end_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect(screen.getByLabelText('12 AI requests left this hour')).toBeInTheDocument()
  })
})
