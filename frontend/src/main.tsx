import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import { env } from './config/env'

async function bootstrap() {
  // Until the backend exists, the API is served in the browser (see src/mocks).
  if (env.useMocks) {
    const { startMockApi } = await import('./mocks/browser')
    await startMockApi()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
