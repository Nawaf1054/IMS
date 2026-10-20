/** Vitest setup: jest-dom matchers, cleanup between tests, and stubs for browser APIs jsdom lacks. */
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// jsdom lacks the layout APIs that charts, Radix and the theme provider use.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList

Element.prototype.scrollIntoView ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
