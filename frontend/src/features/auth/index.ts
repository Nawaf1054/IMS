/**
 * Public API of this feature for other features and the app shell.
 * Pages are not exported here: the router lazy-loads them from ./pages.
 */
export { AuthProvider } from './components/AuthProvider'
export { useAuth, useCurrentUser, useIsAdmin } from './hooks/use-auth'
