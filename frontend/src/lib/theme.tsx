/** Light/dark theme: the provider that applies it to <html> and the hook to read or change it. */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { STORAGE_KEYS } from '@/config/constants'

import { readStorage, writeStorage } from './storage'

/** The two colour themes. */
export type Theme = 'light' | 'dark'

/** What useTheme() returns. */
interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** The saved theme, or the system preference when none was saved. */
function initialTheme(): Theme {
  const stored = readStorage(STORAGE_KEYS.theme)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Light is the default theme; dark is toggled from the top bar and remembered per browser. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    writeStorage(STORAGE_KEYS.theme, next)
  }, [])

  const value = useMemo(() => ({ theme, setTheme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') }), [theme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** The current theme and functions to change it. Must be used inside ThemeProvider. */
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}
