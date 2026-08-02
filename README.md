# Pastepaste

Temporary, end-to-end encrypted text sharing between devices in the same room.

## Local development

Start the backend:

```bash
cd apps/server
dotnet run --urls http://localhost:8080
```

Start the frontend in another terminal:

```bash
cd apps/web
npm install
npm run dev
```

The frontend uses `http://localhost:8080` by default. Copy `.env.example` to `.env.local` if a different backend URL is needed.

## Architecture

- React, TypeScript, Vite, and Tailwind CSS frontend
- ASP.NET Core Minimal API and SignalR backend
- AES-GCM encryption in the browser
- In-memory room state; no clipboard text is persisted
- Docker deployment target for Azure Container Apps

Rooms disappear when the last connected device leaves or the backend restarts. Five-character room codes are convenient for the alpha but are not strong encryption secrets.
