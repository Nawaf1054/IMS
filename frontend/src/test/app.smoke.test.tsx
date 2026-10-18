/**
 * End-to-end smoke test: the real app (router, providers, every page) running
 * against the mock API in Node. Signs in as admin, then as staff, and checks that
 * each screen renders its data and that role restrictions show up in the UI.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'

import { App } from '@/app/App'
import { router } from '@/app/router'
import { authStorage } from '@/lib/auth-storage'
import { queryClient } from '@/lib/query-client'
import { SEED_PASSWORD } from '@/mocks/data/seed'
import { handlers } from '@/mocks/handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterAll(() => server.close())
afterEach(() => {
  authStorage.clear()
  queryClient.clear()
})

const go = (path: string) => act(() => router.navigate(path))
const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name }, { timeout: 5000 })

async function signIn(email: string) {
  const user = userEvent.setup()
  render(<App />)
  await go('/login')
  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), SEED_PASSWORD)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

describe('IMS app', () => {
  it('rejects wrong credentials with a clear message', async () => {
    const user = userEvent.setup()
    render(<App />)
    await go('/login')
    await user.type(await screen.findByLabelText('Email'), 'fahad@alnoor-supplies.sa')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Incorrect email or password/)).toBeInTheDocument()
  })

  it('lets an admin reach every screen', async () => {
    await signIn('fahad@alnoor-supplies.sa')

    await heading('Dashboard')
    expect(await screen.findByText('Total products')).toBeInTheDocument()
    expect(await screen.findByText(/^\d+ products$/, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument()

    await go('/products')
    await heading('Products')
    expect(await screen.findByRole('link', { name: 'Portland cement 50kg bag' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /New product/ })).toBeInTheDocument()

    await go('/products/6')
    await heading('Cordless drill 18V')
    expect(await screen.findByText('Movement history')).toBeInTheDocument()

    await go('/products/6/edit')
    await heading('Edit product')
    expect(await screen.findByDisplayValue('TL-PWR-D18')).toBeInTheDocument()

    await go('/categories')
    await heading('Categories')
    expect(await screen.findByText('Power Tools', {}, { timeout: 5000 })).toBeInTheDocument()

    await go('/stock')
    await heading('Stock movements')
    expect(await screen.findAllByText(/^(IN|OUT|SALE|ADJUSTMENT)$/, {}, { timeout: 5000 })).not.toHaveLength(0)

    await go('/invoices')
    await heading('Invoices')
    const firstInvoice = (await screen.findAllByRole('link', { name: /^INV-\d{4}-\d{5}$/ }, { timeout: 5000 }))[0]

    await go(firstInvoice.getAttribute('href')!)
    await heading(/^INV-\d{4}-\d{5}$/)
    expect(await screen.findByText('Stock movements')).toBeInTheDocument()

    await go('/invoices/new')
    await heading('New invoice')

    await go('/assistant')
    await heading('Assistant')
    expect(await screen.findByText('Insights report')).toBeInTheDocument()

    await go('/users')
    await heading('Users')
    expect(await screen.findByText('noura@alnoor-supplies.sa', {}, { timeout: 5000 })).toBeInTheDocument()

    await go('/settings')
    await heading('Settings')
    expect(await screen.findByDisplayValue('Al Noor Building Supplies', {}, { timeout: 5000 })).toBeInTheDocument()
  }, 30_000)

  it('creates an invoice that reduces stock', async () => {
    const user = await signIn('fahad@alnoor-supplies.sa')
    await heading('Dashboard')

    await go('/invoices/new')
    await heading('New invoice')
    const tiles = await screen.findByLabelText('Add products')
    await user.type(within(tiles).getByPlaceholderText('Add product by name or SKU'), 'cement')
    await user.click(await within(tiles).findByRole('button', { name: /Portland cement 50kg bag/ }, { timeout: 5000 }))
    await user.click(await screen.findByRole('button', { name: /Save invoice/ }))

    await heading(/^INV-\d{4}-\d{5}$/)
    expect(await screen.findByText('Portland cement 50kg bag', { selector: 'a' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('SALE').length).toBeGreaterThan(0))
  }, 20_000)

  it('shows staff a view-only catalog and blocks admin pages', async () => {
    await signIn('noura@alnoor-supplies.sa')
    await heading('Dashboard')
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()

    await go('/products')
    await heading('Products')
    expect(await screen.findByText(/View only/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /New product/ })).not.toBeInTheDocument()

    await go('/users')
    expect(await screen.findByText('Admins only')).toBeInTheDocument()
  }, 20_000)
})
