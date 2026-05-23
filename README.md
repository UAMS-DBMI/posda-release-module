# POSDA Distribution UI

A React + Vite web application for managing biomedical datasets, recordsets, releases, and data transfers within the POSDA (POSDA Object Storage and Distribution Architecture) ecosystem.

## What It Does

This app provides a UI for browsing and managing the distribution side of POSDA:

- **Datasets** — create, search, and edit datasets with DOI, type, and active status; link datasets to WordPress collections or analysis results
- **Recordsets** — manage data records within datasets, including license and type metadata
- **Releases** — view versioned releases of datasets
- **Transfers** — browse and manage data distribution operations for dataset releases

## Tech Stack

- **React 19** with React Router 7 (client-side SPA)
- **Vite 7** for bundling and dev server
- **TypeScript 5** (strict mode)
- **Tailwind CSS 4** for styling, with light/dark theme support

## Backend

The app connects to a POSDA API (PAPI) backend. All requests to `/papi` are proxied by Vite's dev server to the configured backend host.

The API exposes three namespaces used by this app:
- `/papi/v1/distribution/` — datasets, recordsets, releases, transfers, lookups
- `/papi/v1/manager/` — WordPress object maps, collections, analysis results
- `/papi/v1/download/` — data file downloads

## Getting Started

### Prerequisites

- Node.js 18+
- A running POSDA API instance

### Environment

Create a `.env.local` file:

```env
PAPI_TARGET=http://localhost    # Base URL of the POSDA API backend
PAPI_BEARER_TOKEN=<token>       # Bearer token for API authentication
```

### Development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`.

### Build

```bash
npm run build    # Type-check + Vite production build
npm run preview  # Serve the production build locally
```
