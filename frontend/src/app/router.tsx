/** URL → screen mapping for the whole app, including which routes need sign-in or an admin. */
import { createBrowserRouter } from 'react-router'

import { AppLayout } from './layout/AppLayout'
import { NotFoundPage } from './pages/NotFoundPage'
import { RouteErrorPage } from './pages/RouteErrorPage'
import { RequireAdmin, RequireAuth } from './route-guards'

/**
 * Route table (PRD §9). Feature pages load on demand, so the dashboard's chart
 * library isn't downloaded until it is needed.
 */
export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/login', lazy: async () => ({ Component: (await import('@/features/auth/pages/LoginPage')).LoginPage }) },
      {
        element: <RequireAuth />,
        children: [
          // Printable invoice renders without the app shell.
          { path: '/invoices/:id/print', lazy: async () => ({ Component: (await import('@/features/invoices/pages/InvoicePrintPage')).InvoicePrintPage }) },
          {
            element: <AppLayout />,
            children: [
              { index: true, lazy: async () => ({ Component: (await import('@/features/dashboard/pages/DashboardPage')).DashboardPage }) },
              { path: 'products', lazy: async () => ({ Component: (await import('@/features/products/pages/ProductsPage')).ProductsPage }) },
              {
                path: 'products/new',
                lazy: async () => {
                  const { NewProductPage } = await import('@/features/products/pages/ProductFormPage')
                  return {
                    element: (
                      <RequireAdmin subject="Products">
                        <NewProductPage />
                      </RequireAdmin>
                    ),
                  }
                },
              },
              { path: 'products/:id', lazy: async () => ({ Component: (await import('@/features/products/pages/ProductDetailPage')).ProductDetailPage }) },
              {
                path: 'products/:id/edit',
                lazy: async () => {
                  const { EditProductPage } = await import('@/features/products/pages/ProductFormPage')
                  return {
                    element: (
                      <RequireAdmin subject="Products">
                        <EditProductPage />
                      </RequireAdmin>
                    ),
                  }
                },
              },
              { path: 'categories', lazy: async () => ({ Component: (await import('@/features/categories/pages/CategoriesPage')).CategoriesPage }) },
              { path: 'stock', lazy: async () => ({ Component: (await import('@/features/stock/pages/StockPage')).StockPage }) },
              { path: 'invoices', lazy: async () => ({ Component: (await import('@/features/invoices/pages/InvoicesPage')).InvoicesPage }) },
              { path: 'invoices/new', lazy: async () => ({ Component: (await import('@/features/invoices/pages/NewInvoicePage')).NewInvoicePage }) },
              { path: 'invoices/:id', lazy: async () => ({ Component: (await import('@/features/invoices/pages/InvoiceDetailPage')).InvoiceDetailPage }) },
              { path: 'assistant', lazy: async () => ({ Component: (await import('@/features/assistant/pages/AssistantPage')).AssistantPage }) },
              {
                path: 'users',
                lazy: async () => {
                  const { UsersPage } = await import('@/features/users/pages/UsersPage')
                  return {
                    element: (
                      <RequireAdmin subject="Users and roles">
                        <UsersPage />
                      </RequireAdmin>
                    ),
                  }
                },
              },
              {
                path: 'settings',
                lazy: async () => {
                  const { SettingsPage } = await import('@/features/settings/pages/SettingsPage')
                  return {
                    element: (
                      <RequireAdmin subject="Business settings">
                        <SettingsPage />
                      </RequireAdmin>
                    ),
                  }
                },
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
])
