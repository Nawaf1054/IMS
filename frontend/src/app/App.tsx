/** Root component: global providers around the router. */
import { RouterProvider } from 'react-router/dom'

import { AppProviders } from './providers'
import { router } from './router'

/** The whole application. */
export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
