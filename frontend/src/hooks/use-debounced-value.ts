import { useEffect, useState } from 'react'

import { SEARCH_DEBOUNCE_MS } from '@/config/constants'

/** Returns `value` once it has stopped changing for `delay` ms (search boxes). */
export function useDebouncedValue<T>(value: T, delay = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
