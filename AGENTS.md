# AGENTS.md

Guidance for AI coding agents working in this repository.

## Overview

Pastepaste is a temporary, end-to-end-encrypted text sharing tool between devices in the same room. Monorepo with two apps:

- `apps/web` — React 19, TypeScript, Vite, Tailwind CSS v4
- `apps/server` — ASP.NET Core minimal API + SignalR, .NET 10

## Commands

### Web (`apps/web`)

```bash
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

### Server (`apps/server`)

```bash
dotnet run --urls http://localhost:5080
dotnet build
```

**Gotcha:** `dotnet run` does not hot-reload. Restart the server process (or use `dotnet watch run`) after backend changes — otherwise the running server serves stale routes.

## Configuration

- `VITE_API_URL` in `apps/web/.env.local` — backend base URL (default `http://localhost:5080`). Copy `.env.example` to `.env.local` to override.
- `AllowedOrigins` in `apps/server/appsettings.json` — CORS origins (default `http://localhost:5173`).

## Architecture

- Room codes are exactly 5 characters, uppercase CVCVC (consonant-vowel-consonant-vowel-consonant, e.g. `KURAT`). Consonants: `BCDFGHJKLMNPRSTVWXYZ`, vowels: `AEIOU`.
- Rooms are held in memory by `RoomService` (`ConcurrentDictionary`); they disappear when the last connection leaves or the server restarts.
- Clipboard text is encrypted with AES-GCM in the browser; the server only stores and relays the encrypted payload.
- SignalR hub at `/hubs/clipboard` with methods `JoinRoom`, `UpdateClipboard`, `LeaveRoom`.
- HTTP API routes:
  - `POST /api/rooms` — create a random room
  - `PUT /api/rooms/{code}` — create a specific room (409 if taken)
  - `POST /api/rooms/{code}/claim` — idempotent get-or-create (used for typed URLs)
  - `POST /api/rooms/{code}` — join an existing room (404 if missing)
  - `GET /health`

### Frontend routing behavior

- `/` auto-creates a room and redirects to `/{CODE}` via `history.replaceState`.
- `/{CODE}` claims/creates that exact room, so manually typed URLs always open an editor.

## Code conventions

- Do not add comments unless explicitly requested.
- Web: React function components with hooks (`useState`, `useRef`, `useEffect`). Styling uses Tailwind arbitrary hex values. Dark mode is class-based: toggle `.dark` on `<html>` and use `dark:` variants (`@custom-variant dark` is set in `src/index.css`).
- Server: file-scoped namespaces under `Pastepaste.Server`, sealed classes, primary constructors, minimal APIs with records for models.
- No test suite exists. Verification is `npm run lint`, `npm run build`, and `dotnet build`.
