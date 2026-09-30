# Merge Notes

This folder is a safe baseline merge of the two supplied projects.

## Kept from Login-student (primary application)
- `src/App.jsx` — Supabase Auth/session flow
- `src/StudentDashboard.jsx`
- `src/FacultyDashboard.jsx`
- `src/AdminDashboard.jsx`
- `src/lib/supabase.js`
- Login project CSS and Vite entry files

## Added from Frontend
- `src/ConnectedMessages.jsx`
- `src/api.js`
- `src/useHubData.js`
- `backend/` Express/PostgreSQL code
- `docker-compose.yml`
- `render.yaml`
- `IMPLEMENTATION_NOTES.md`
- Socket.IO client dependencies

## Important architecture note
The main React application still uses Supabase authentication and Supabase data access. The copied Express backend uses its older custom JWT/PostgreSQL authentication model, so it is preserved for migration/reference and is not wired into the Supabase login flow yet.

Do not replace the Supabase `App.jsx` with the old Frontend version. Migrate backend features one-by-one to Supabase, or update the Express backend to validate Supabase access tokens before wiring `api.js`/`ConnectedMessages.jsx` into the dashboards.

## Environment
Create a local `.env` from `.env.example` and fill in the Supabase URL and publishable key. Real `.env` files are intentionally excluded from Git.

## First local install
The original lockfile was intentionally removed after merging dependency lists because this environment could not regenerate it reliably. Run `npm install` once in the project root; this will install the merged dependencies and create a fresh `package-lock.json`. Commit that regenerated lockfile afterward.
