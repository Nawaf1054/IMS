/** Top-bar button that switches between light and dark themes. */
import { MoonIcon, SunIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'

/** Sun / moon button that flips the theme. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <Button variant="outline" size="icon" aria-label={label} title={label} onClick={toggleTheme} className="text-subtle-foreground">
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
