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

### Frontend (works today, no backend needed)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The UI runs against an in-browser mock of the API (see [docs/architecture.md](docs/architecture.md#mock-api)). Demo accounts, password `demo1234`:

| Role  | Email |
|-------|-------|
| Admin | `fahad@alnoor-supplies.sa` |
| Staff | `noura@alnoor-supplies.sa` |

| Script | Does |
|--------|------|
| `npm run build` | Typecheck + production build |
| `npm run test` | Vitest (unit tests + app smoke test) |
| `npm run lint` / `npm run format` | ESLint / Prettier |

### Full stack (backend + Supabase)

Needs Docker, Node and [uv](https://docs.astral.sh/uv/). Implemented so far: sign-in, users, categories, products and settings (M1–M3). Stock, invoices, exports, dashboard and the assistant still need the mock until their milestones land. Seeded products start at quantity 0 until M4 adds stock movements.

1. **Start Supabase locally** (Postgres + Auth in Docker; first run downloads the images):
   ```bash
   npx supabase start      # prints API URL, DB URL, publishable/secret keys and JWT secret
   npx supabase status     # shows them again
   ```
2. **Configure:** copy `.env.example` to `.env`. Fill in `SUPABASE_SECRET_KEY`, `SUPABASE_JWT_SECRET`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `SEED_ADMIN_PASSWORD`, then set `VITE_USE_MOCKS=false`.
3. **Backend:**
   ```bash
   cd backend
   uv sync
   uv run alembic upgrade head
   uv run python -m scripts.seed --demo   # admin from .env + demo accounts, catalog and settings
   uv run uvicorn app.main:app --reload   # http://localhost:8000/api/docs
   ```
4. **Frontend:** `cd frontend && npm run dev`, then sign in with a seeded account.

Or run steps 3–4 in containers: `docker compose up --build` (Supabase still runs via `npx supabase start`).

| Backend command | Does |
|-----------------|------|
| `uv run pytest --cov` | Tests (needs a Postgres; uses `<db>_test` on the `DATABASE_URL` server) |
| `uv run ruff check . && uv run ruff format .` | Lint / format |
| `uv run mypy app scripts` | Type check |
| `uv run alembic revision --autogenerate -m "..."` | New migration |

Supabase Studio (local DB browser) runs at http://127.0.0.1:54323.
