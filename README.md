# Strata Dev

Strata Dev is a desktop AI coding GUI MVP built with Electron + React + TypeScript.

## MVP Features

- Single-folder workspace with secure path sandboxing.
- File tree + Monaco editor.
- AI chat with streaming responses via OpenAI Responses API.
- AI patch proposals with diff preview and explicit apply/discard.
- Workspace-scoped terminal command proposals and confirmed execution.
- Local persistence (SQLite) and API key storage in OS keychain (`keytar`).

## Quick Start

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev`: start the desktop app in dev mode.
- `npm run build`: build renderer + Electron bundles.
- `npm run dist`: create Linux AppImage via electron-builder.
- `npm run typecheck`: run TypeScript checks.
- `npm run lint`: run ESLint.
- `npm run test`: run unit/integration tests.
- `npm run test:e2e`: run Playwright Electron tests (`E2E_ELECTRON=1` and built bundles required).

## Project Layout

- `app/main`: Electron main process services + IPC.
- `app/preload`: typed context bridge APIs.
- `app/renderer`: React UI (file tree, editor, chat, diff, terminal, settings).
- `app/shared`: shared contracts and runtime validation schemas.
- `tests`: unit + integration tests.
- `e2e`: Playwright desktop e2e scaffolding.

## Troubleshooting

### Native module mismatch

If startup fails with a `NODE_MODULE_VERSION` mismatch (for example from `better-sqlite3`), rebuild native modules for Electron:

```bash
npm run native:rebuild:electron
```

`npm run test` rebuilds `better-sqlite3` for your system Node runtime, so launch paths that use Electron (`npm run dev`, `npm run test:e2e`, `npm run dist`) should run the Electron rebuild step afterward.
