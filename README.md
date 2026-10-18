# IMS — Inventory Management System

A web application for small shops and warehouses to manage products, categories, stock movements and sales invoices, with Excel exports, printable bills, an analytics dashboard and an LLM-powered assistant.

| Layer    | Stack |
|----------|-------|
| Frontend | React + TypeScript, Vite, shadcn/ui + Tailwind CSS, TanStack Query, React Router, Recharts |
| Backend  | Python, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic |
| Database | PostgreSQL |
| DevOps   | Docker, docker-compose, GitHub Actions |

## Repository layout

```
IMS/
├── backend/     FastAPI service (feature modules under app/modules)
├── frontend/    React SPA (feature folders under src/features)
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

### Full stack

> Backend, database and Docker setup arrive with the backend milestones (M1–M2).

1. Copy `.env.example` to `.env` and fill in the values.
2. `docker-compose up`
