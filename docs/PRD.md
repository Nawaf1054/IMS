# PRD: Inventory Management System

## 1. Overview

A web application for small shops and warehouses to manage products, categories, stock, and sales invoices. It provides Excel exports, printable bills, an analytics dashboard, and an LLM-powered assistant that answers questions and writes insights based on system data.

**Purpose:** Portfolio project demonstrating full-stack development (React, Python, PostgreSQL) and responsible LLM integration.

## 2. Goals

- Manage products and categories through a simple interface.
- Track every stock change as a recorded movement (no silent quantity edits).
- Create invoices that automatically reduce stock, and print them.
- Export data to Excel.
- Show accurate business analytics on a dashboard.
- Let users ask questions in natural language and receive written insights via an LLM.

## 3. Non-Goals (v1)

- Multiple warehouses or branches.
- Supplier management and purchase orders.
- Barcode scanner hardware integration.
- Online payments.
- Mobile native apps (web must be responsive only).
- Multi-tenancy (one business per deployment).

## 4. Users and Roles

| Role  | Permissions |
|-------|-------------|
| Admin | Full access: users, products, categories, stock, invoices, exports, dashboard, AI assistant. Can delete records. |
| Staff | View products and categories, record stock movements, create and print invoices, view dashboard. Cannot delete records, manage users, or change prices. |

## 5. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript, Vite, TanStack Query, React Router, component library (MUI / Ant Design / shadcn/ui), Recharts |
| Backend | Python, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic |
| Database | PostgreSQL (hosted on Supabase) |
| Auth | Supabase Auth (email + password; JWT access + refresh tokens). The backend verifies tokens and enforces roles. |
| Excel | openpyxl (or pandas) |
| PDF | WeasyPrint (HTML template → PDF) |
| LLM | External LLM API with tool calling |
| Testing | pytest (backend), Vitest + React Testing Library (frontend) |
| DevOps | Docker, docker-compose, GitHub Actions CI |

## 6. Functional Requirements

### 6.1 Authentication
- **AUTH-1** Users log in with email and password.
- **AUTH-2** Passwords are stored hashed, never in plain text (handled by Supabase Auth).
- **AUTH-3** All endpoints except login require a valid token.
- **AUTH-4** Role is checked on every protected action (backend enforced, not only hidden in UI).
- **AUTH-5** Admin can create, edit, deactivate users and assign roles.

### 6.2 Categories
- **CAT-1** Create, read, update, delete categories.
- **CAT-2** A category can have an optional parent (one level of subcategories is enough for v1).
- **CAT-3** A category with products cannot be deleted; return a clear error.

### 6.3 Products
- **PRD-1** Fields: name, SKU (unique), category, cost price, sell price, quantity, minimum quantity, description, active flag.
- **PRD-2** Create, read, update, delete (soft delete via `is_active = false` if the product appears in invoices).
- **PRD-3** List view supports search (name, SKU), filter (category, low stock), sort, and pagination.
- **PRD-4** Quantity is NOT editable directly; it changes only through stock movements or invoices.
- **PRD-5** Products with `quantity <= min_quantity` are flagged as low stock.

### 6.4 Stock Movements
- **STK-1** Types: `IN` (received), `OUT` (removed/damaged), `ADJUSTMENT` (correction after counting), `SALE` (created automatically by invoices).
- **STK-2** Each movement records product, type, quantity, note, user, timestamp.
- **STK-3** Creating a movement updates product quantity in the same transaction.
- **STK-4** Quantity can never go below zero; reject the operation with an error.
- **STK-5** Movement history is viewable per product and globally, filterable by date and type.
- **STK-6** Movements are immutable; corrections are made with a new `ADJUSTMENT`.

### 6.5 Invoices (Bills)
- **INV-1** User selects products and quantities; system shows unit price, line totals, subtotal, discount, tax, total.
- **INV-2** Tax rate is a configurable setting (default value in config).
- **INV-3** Each invoice gets a unique sequential number (e.g. `INV-2026-00001`).
- **INV-4** Saving an invoice, creating `SALE` movements, and reducing stock happen in ONE database transaction. Any failure rolls back everything.
- **INV-5** Invoice items store the unit price at time of sale (later price changes don't affect old invoices).
- **INV-6** Invoices cannot be edited after creation. Admin can cancel an invoice, which restores stock via reverse movements and marks it `CANCELLED`.
- **INV-7** Invoices are listable and searchable by number, date range, customer name.
- **INV-8** Print: printable invoice view (print CSS) and PDF download.

### 6.6 Excel Export
- **EXP-1** Export products (with category, prices, quantity, low-stock flag).
- **EXP-2** Export stock movements for a date range.
- **EXP-3** Export invoices / sales for a date range.
- **EXP-4** Files are `.xlsx` with bold headers, proper number/currency/date formats, and auto column widths.
- **EXP-5** Exports respect current filters applied in the UI.

### 6.7 Analytics Dashboard
All numbers are computed by the backend using SQL. The LLM never calculates dashboard figures.
- **DSH-1** KPI cards: total products, total stock value (cost), today's sales, this month's sales, low-stock count.
- **DSH-2** Line chart: sales revenue over time (daily/weekly/monthly toggle).
- **DSH-3** Bar chart: top 10 best-selling products by quantity and by revenue.
- **DSH-4** Pie/bar chart: revenue by category.
- **DSH-5** Table: low-stock products.
- **DSH-6** Date range filter applies to all time-based widgets.

### 6.8 AI Assistant (LLM)
- **AI-1** Chat panel where users ask questions in natural language (e.g. "Which products sold least this month?").
- **AI-2** Implemented with tool calling. The LLM can only call predefined backend functions, for example:
  - `get_sales_summary(start_date, end_date)`
  - `get_top_products(start_date, end_date, limit, order)`
  - `get_low_stock_products()`
  - `get_category_revenue(start_date, end_date)`
  - `search_products(query)`
- **AI-3** The LLM MUST NOT generate or execute raw SQL, and has read-only access through the tools.
- **AI-4** "Generate insights" button: backend computes a summary for the selected period, sends it to the LLM, and displays a short written report.
- **AI-5** Optional helper: generate a product description from name and category.
- **AI-6** API key is stored server-side only (environment variable), never sent to the frontend.
- **AI-7** If the LLM API fails, the app shows an error message; all other features keep working.
- **AI-8** Rate limit AI requests per user (e.g. 20 per hour, configurable).

## 7. Data Model

```
profiles         (id, auth_user_id UUID UNIQUE → Supabase auth.users, name, email UNIQUE, role ENUM[admin, staff],
                  is_active, last_active_at, created_at)   -- credentials live in Supabase Auth
categories       (id, name UNIQUE, parent_id FK→categories NULL, created_at)
products         (id, name, sku UNIQUE, category_id FK, cost_price NUMERIC(12,2), sell_price NUMERIC(12,2),
                  quantity INT ≥ 0, min_quantity INT ≥ 0, description, is_active, created_at, updated_at)
stock_movements  (id, product_id FK, type ENUM[IN, OUT, ADJUSTMENT, SALE], quantity INT,
                  note, invoice_id FK NULL, user_id FK, created_at)
invoices         (id, invoice_number UNIQUE, customer_name NULL, subtotal, discount, tax_rate, tax_amount,
                  total, status ENUM[COMPLETED, CANCELLED], user_id FK, created_at)
invoice_items    (id, invoice_id FK, product_id FK, quantity INT > 0, unit_price NUMERIC(12,2), line_total)
settings         (key, value)   -- e.g. tax_rate, business_name, business_address, currency
```

Rules:
- All money uses `NUMERIC` in PostgreSQL and `Decimal` in Python. Never floats.
- Index: `products.sku`, `products.category_id`, `stock_movements(product_id, created_at)`, `invoices.created_at`.
- All timestamps stored in UTC.

## 8. API Endpoints (v1)

Prefix: `/api/v1`

| Method | Path | Role |
|--------|------|------|
| — | Sign-in / refresh: Supabase Auth (not this API) | Public |
| GET | `/auth/me` | All |
| GET/POST | `/users` · PATCH `/users/{id}` | Admin |
| GET/POST | `/categories` · PATCH/DELETE `/categories/{id}` | Read: all · Write: Admin |
| GET/POST | `/products` · GET/PATCH/DELETE `/products/{id}` | Read: all · Write: Admin |
| GET/POST | `/stock-movements` · GET `/products/{id}/movements` | All |
| GET/POST | `/invoices` · GET `/invoices/{id}` | All |
| POST | `/invoices/{id}/cancel` | Admin |
| GET | `/invoices/{id}/pdf` | All |
| GET | `/exports/products`, `/exports/movements`, `/exports/invoices` | All |
| GET | `/dashboard/kpis`, `/dashboard/sales-over-time`, `/dashboard/top-products`, `/dashboard/category-revenue` | All |
| POST | `/ai/chat`, `/ai/insights`, `/ai/product-description` | All (rate limited) |
| GET/PATCH | `/settings` | Read: all · Write: Admin |

Error format: `{ "detail": "message", "code": "ERROR_CODE" }` with correct HTTP status codes.

## 9. Frontend Pages

| Route | Page |
|-------|------|
| `/login` | Login |
| `/` | Dashboard |
| `/products`, `/products/new`, `/products/:id` | Product list, create, detail/edit + movement history |
| `/categories` | Category management |
| `/stock` | Stock movements list + new movement form |
| `/invoices`, `/invoices/new`, `/invoices/:id` | Invoice list, create, detail + print |
| `/assistant` | AI chat and insights |
| `/users` | User management (Admin) |
| `/settings` | Business settings (Admin) |

UI requirements: responsive layout, sidebar navigation, loading and empty states, form validation messages, confirmation dialog before destructive actions, toast notifications for success/error.

## 10. Non-Functional Requirements

- **Security:** input validation via Pydantic; parameterized queries via ORM; CORS restricted to frontend origin; secrets in `.env`; no secrets committed.
- **Performance:** paginated lists (default 20, max 100); dashboard queries < 1s on 10k products / 100k movements.
- **Reliability:** all stock-changing operations are transactional.
- **Testing:** backend coverage ≥ 70%, required tests for invoice transaction, stock rules, and permissions.
- **Code quality:** linting (ruff, ESLint), formatting (ruff format, Prettier), type hints, CI runs lint + tests on every push.
- **Deployment:** `npx supabase start` runs the database and auth locally; `docker compose up` runs frontend and backend. Seed script creates an admin user and sample data.

## 11. Milestones

| # | Milestone | Done when |
|---|-----------|-----------|
| M1 | Project setup | Repo, Docker, FastAPI + React skeletons, DB connection, Alembic, CI running |
| M2 | Auth & users | Login works, roles enforced on backend |
| M3 | Categories & products | Full CRUD, search, filter, pagination |
| M4 | Stock movements | Movements update quantity transactionally, low-stock flag works |
| M5 | Invoices | Create, cancel, transaction tested, print view, PDF download |
| M6 | Excel export | All three exports download correctly formatted files |
| M7 | Dashboard | All KPIs and charts with date filter |
| M8 | AI assistant | Tool-calling chat, insights, rate limit, graceful failure |
| M9 | Polish & deploy | Tests passing, deployed live, README with screenshots/demo GIF |

Build in order. Do not start M8 before M7 is complete.

## 12. Open Questions

- Currency and tax rate defaults for the target market?
- Should the UI support Arabic (RTL) in addition to English?
- Which LLM provider to use? (decide at M8)
- Is customer management (saved customers, customer history) needed in v1 or later?
