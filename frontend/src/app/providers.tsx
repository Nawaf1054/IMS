/** Global providers every screen relies on: theme, data cache, sign-in session, tooltips and toasts. */
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth'
import { queryClient } from '@/lib/query-client'
import { ThemeProvider } from '@/lib/theme'

/** Wraps the app in theme → query cache → auth → tooltip providers, plus the toast area. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
