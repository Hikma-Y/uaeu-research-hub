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

## Private project invitations

After the existing project, messaging, and group-chat SQL setup, run
`supabase/migrations/20261003_private_project_invitation_membership.sql` in the
Supabase SQL Editor before using this frontend. Pending invitations expose private
project details only to their recipients. Acceptance creates an accepted
application, reserves one place, and joins any existing project group chat.
Invitation and acceptance messages appear in the recipient's bell and open Projects.
The dashboards refresh invitations, memberships, and remaining places every 12 seconds.

The migration also repairs previously accepted invitations. If these exceed a
project's capacity, it rolls back with an error naming the project; increase that
project's capacity and rerun. The public opportunities view remains public only.

Then run `supabase/migrations/20261003_faculty_remove_project_student.sql` to
enable Remove beside registered students. Only the project owner can remove a
registration. Removal frees the place and deletes that student's invitation and
project group membership, revoking private-project access. Faculty can invite
the student again later.

Database regression tests use temporary PGlite databases, without live Supabase access:

```powershell
npm.cmd install --prefix "$env:TEMP/uaeu-invitation-db-tests" --no-audit --no-fund --ignore-scripts --package-lock=false @electric-sql/pglite
$env:PGLITE_MODULE_PATH = Join-Path $env:TEMP 'uaeu-invitation-db-tests/node_modules/@electric-sql/pglite/dist/index.js'
node --test supabase/tests/private_project_invitations.test.mjs
```

---

The original Login project README is preserved as `README.original.md`.
