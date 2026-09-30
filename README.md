# UAEU Research Hub — Merged Baseline

This project merges the Supabase-enabled Login/Student project with the broader Frontend/Express project.

The active React application keeps Supabase authentication and the Supabase-connected dashboards as its foundation. Frontend-only modules and the Express backend are preserved for incremental migration. See `MERGE_NOTES.md` before wiring the legacy API modules into the active application.

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Run `npm install` in the project root.
4. Run `npm run dev`.
5. Only if you are working on the preserved Express backend, run `npm install` inside `backend/` and create `backend/.env` from `backend/.env.example`.

## Security

Real `.env` files are ignored and are not included in this merged package.

---

The original Login project README is preserved as `README.original.md`.
