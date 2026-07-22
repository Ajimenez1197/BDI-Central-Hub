# BDI Central Hub

An internal Azure Static Web App that consolidates BDI's departmental reporting
into a single, Entra-authenticated UI. Modeled on the BDI Data Hub, it uses the
same stack and authentication.

## Departments (tabs)

Each department is a collection of **reports**, shown as a secondary sub-nav
under the department tab. Add a report by dropping a component into that
department's `reports` array in `client/src/App.jsx`; empty departments show a
placeholder until their first report lands.

| Tab | Status |
|---|---|
| **Digital** | Live — **New & Reactivated Donors** report |
| Project Management | Placeholder |
| **Client Service** | Live — **QBR**, **Blue Books**, **Donor Pyramid** |
| Creative | Placeholder |

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   React Frontend    │────▶│  Node.js Azure Func  │────▶│   SQL Server    │
│  (Static Web App)   │◀────│   (API backend)      │◀────│  (Entra Auth)   │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
```

- **Frontend:** React 18 + Vite (`/client`)
- **Backend:** Node.js Azure Functions v4 (`/api`)
- **Database:** Azure SQL, connected with an Entra ID service principal
- **Auth:** Static Web App requires Entra ID (Azure AD) login — same tenant as
  the Data Hub (see `client/public/staticwebapp.config.json`)

## Digital › New & Reactivated Donors

Ranks each donor's gift history to flag **New** donors (first-ever gift) and
**Reactivated** donors (a gift 3+ years after their prior gift), split by
channel (Online / Print). Ranking runs over each donor's full history; only the
reporting output is limited to gifts from **Jan 2023** onward.

- **Client filter** — labeled **Client**; lists any single client where
  `P_Clients.Production = 1`.
- **Monthly view** (default) — one row per calendar month.
- **FYTD view** — rolls the months up into one row per **fiscal year**, using
  each client's `P_Clients.FY_Month_Start`. Fiscal years are labeled by their
  end year (e.g. a July-start client's Jul 2023–Jun 2024 year is `FY2024`).
- **Download CSV** of whichever view is on screen.

## Client Service › Donor Pyramid

Buckets each donor by their **cumulative giving in the window** — **Mass**
`$0.01–999.99`, **Middle** `$1,000–9,999.99`, **Major** `$10,000+` (donors
netting ≤ $0 are excluded) — then charts the distribution as stacked
trapezoids.

- **Client filter** — labeled **Client**; `P_Clients.Production = 1` only.
- **Giving period** toggle, all ending at today (`GETDATE()`):
  - **Calendar Year** — from Jan 1 of the current year.
  - **Rolling 12 Mo** — the trailing 12 months.
  - **FYTD** — from the client's `P_Clients.FY_Month_Start`.
- **4 charts** — Client and Benchmark, each in a donor-count and a revenue
  version. The **benchmark** pools every `Production = 1` client (including the
  selected one); each donor is bucketed by their giving to each client, and
  FYTD uses each client's own fiscal-year start.
- **Chart shape** — tiers always stack Major (top) → Middle → Mass (bottom) as
  flat-topped trapezoids whose widths track each tier's **share of revenue**, so
  every tier stays visible: a pyramid when Mass leads, an inverted trapezoid
  when Major leads, a box when they're even. Labels show each chart's own metric
  (donor counts + donor % vs. dollars + revenue %).
- **Download CSV** — all four series (client + benchmark, donors + revenue),
  one row per tier plus a totals row.

## Client Service › Blue Books

For a selected **client** + **appeal**, computes per-RFM-segment
response-rate and ROI (Mailed, Responses, Response %, Revenue, Cost, ROI),
matching direct and matchback gifts against the appeal code. ROI cells are
color-shaded (green > 1, yellow 0–1, red ≤ 0).

- **Client filter** — the full `P_Clients` roster (`/api/clients?source=all`),
  since Blue Books reports on historical data for any client.
- **Appeal filter** — cultivation campaigns from `c_jobs`, grouped by the
  per-client appeal-code length (see `api/src/lib/client-config.js`).
- **Download Excel** — a styled `.xlsx` is written to blob storage and served
  via a time-limited SAS URL.

## Setup

### Prerequisites
- Node.js 18+
- Azure Functions Core Tools (for local API)
- Azure subscription with: Static Web App, Azure SQL (Entra admin configured)

### Environment Variables (API)

Set in the Static Web App **Application Settings** (and in
`api/local.settings.json` for local dev):

| Variable | Description |
|---|---|
| `SQL_SERVER` | e.g. `yourserver.database.windows.net` |
| `SQL_DATABASE` | e.g. `YourDB` |
| `AAD_TENANT_ID` | Entra tenant ID (service principal) |
| `AAD_CLIENT_ID` | App registration client ID |
| `AAD_CLIENT_SECRET` | App registration client secret |
| `BLOB_CONNECTION_STRING` | Storage account connection string (Blue Books Excel export) |
| `BLOB_CONTAINER` | Container/prefix for generated workbooks |

`AAD_CLIENT_ID` / `AAD_CLIENT_SECRET` are also used by the Static Web App's
Entra login (referenced in `staticwebapp.config.json`).

### Local Development

```bash
# Install dependencies
cd client && npm install
cd ../api && npm install

# Run frontend + API together (from repo root)
npm install
npm run dev

# …or individually
cd client && npm run dev     # http://localhost:3000  (proxies /api → :7071)
cd api && func start         # http://localhost:7071
```

### Deployment

Push to `main`. The GitHub Actions workflow
(`.github/workflows/azure-static-web-apps.yml`) builds `/client` and deploys it
with `/api`. Create the repository secret **`AZURE_STATIC_WEB_APPS_API_TOKEN`**
from the new Static Web App's deployment token first.
