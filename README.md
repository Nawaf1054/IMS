# IMS — Inventory Management System

A web application for small shops and warehouses to manage products, categories, stock movements and sales invoices, with Excel exports, printable bills, an analytics dashboard and an LLM-powered assistant.

| Layer    | Stack |
|----------|-------|
| Frontend | React + TypeScript, Vite, shadcn/ui + Tailwind CSS, TanStack Query, React Router, Recharts |
| Backend  | Python, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic |
| Database & Auth | Supabase (PostgreSQL + Supabase Auth) |
| DevOps   | Docker, docker-compose, GitHub Actions |

## Repository layout

```
IMS/
├── backend/     FastAPI service (feature modules under app/modules)
├── frontend/    React SPA (feature folders under src/features)
├── supabase/    Supabase CLI config for the local stack (Postgres + Auth)
├── docs/        PRD and architecture notes
└── .github/     CI workflows
```

See [docs/architecture.md](docs/architecture.md) for the full structure and conventions, and [docs/PRD.md](docs/PRD.md) for requirements.

## Getting started

The app always talks to the real backend and database; there is no mock mode. Needs Docker, Node and [uv](https://docs.astral.sh/uv/).

Implemented: sign-in, users, categories, products, settings, stock movements, invoices with PDF download, Excel exports and the analytics dashboard (M1–M7). The AI assistant (M8) isn't built yet: its page shows a "Coming soon" preview.

Invoice PDFs use WeasyPrint, which needs the Pango system library. The Docker image includes it; on Windows without it the PDF endpoint answers `PDF_UNAVAILABLE` (printing from the browser still works).

1. **Start Supabase locally** (Postgres + Auth in Docker; first run downloads the images):
   ```bash
   npx supabase start      # prints API URL, DB URL, publishable/secret keys and JWT secret
   npx supabase status     # shows them again
   ```
2. **Configure:** copy `.env.example` to `.env`. Fill in `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `SEED_ADMIN_PASSWORD`.
3. **Backend:**
   ```bash
   cd backend
   uv sync
   uv run alembic upgrade head
   uv run python -m scripts.seed           # the admin user from .env
   uv run python -m scripts.seed --demo    # optional: + demo users, catalog, opening stock and settings
   uv run uvicorn app.main:app --reload    # http://localhost:8000/api/docs
   ```
4. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev          # http://localhost:5173
   ```
   Sign in with the admin from `.env`. With `--demo`, these accounts also exist (password `demo1234`):

   | Role  | Email |
   |-------|-------|
   | Admin | `admin@a.com` |
   | Staff | `staff@a.com`, `majed@alnoor-supplies.sa` |

   The demo seed records an "Opening stock" movement per product, so quantities match the design. It creates no invoices, so the dashboard's sales figures start at zero.

Or run steps 3–4 in containers: `docker compose up --build` (Supabase still runs via `npx supabase start`).

| Frontend script | Does |
|-----------------|------|
| `npm run build` | Typecheck + production build |
| `npm run test` | Vitest unit tests |
| `npm run lint` / `npm run format` | ESLint / Prettier |

| Backend command | Does |
|-----------------|------|
| `uv run pytest --cov` | Tests (needs a Postgres; uses `<db>_test` on the `DATABASE_URL` server) |
| `uv run ruff check . && uv run ruff format .` | Lint / format |
| `uv run mypy app scripts` | Type check |
| `uv run alembic revision --autogenerate -m "..."` | New migration |

Supabase Studio (local DB browser) runs at http://127.0.0.1:54323.
