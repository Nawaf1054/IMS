import { setupWorker } from 'msw/browser'

import { handlers } from './handlers'

/** Starts the in-browser mock API. Data lives in memory and resets on reload. */
export async function startMockApi(): Promise<void> {
  await setupWorker(...handlers).start({
    onUnhandledFrame: 'bypass',
    quiet: true,
  })
}
