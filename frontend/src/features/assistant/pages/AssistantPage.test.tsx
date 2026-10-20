/** While the AI milestone is pending, the assistant page is a blurred, inert preview that never calls the API. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'

import { AI_ASSISTANT_ENABLED } from '@/config/constants'

import { AssistantPage } from './AssistantPage'

// The real session needs Supabase env vars; this page never signs in.
vi.mock('@/lib/auth-session', () => ({
  authSession: { hasStoredSession: () => false, getAccessToken: async () => null, refresh: async () => false, signIn: vi.fn(), signOut: vi.fn() },
}))

/** Renders the page with a fresh query cache. */
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AssistantPage />
    </QueryClientProvider>,
  )
}

describe('AssistantPage (M8 not released)', () => {
  it('is switched off', () => {
    expect(AI_ASSISTANT_ENABLED).toBe(false)
  })

  it('shows "Coming soon" over a blurred, inert preview without calling the API', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { container } = renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Assistant' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Coming soon')

    const preview = container.querySelector('[inert]')
    expect(preview).not.toBeNull()
    expect(preview).toHaveAttribute('aria-hidden', 'true')
    expect(preview).toHaveClass('blur-[6px]')

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
