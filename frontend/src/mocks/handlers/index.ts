import { aiHandlers } from './ai'
import { authHandlers } from './auth'
import { categoryHandlers } from './categories'
import { dashboardHandlers } from './dashboard'
import { exportHandlers } from './exports'
import { invoiceHandlers } from './invoices'
import { productHandlers } from './products'
import { settingsHandlers } from './settings'
import { stockHandlers } from './stock'
import { userHandlers } from './users'

/** The whole `/api/v1` surface from PRD §8, served in the browser. */
export const handlers = [
  ...authHandlers,
  ...userHandlers,
  ...categoryHandlers,
  ...productHandlers,
  ...stockHandlers,
  ...invoiceHandlers,
  ...exportHandlers,
  ...dashboardHandlers,
  ...aiHandlers,
  ...settingsHandlers,
]
