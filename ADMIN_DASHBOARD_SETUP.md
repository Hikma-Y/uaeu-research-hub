# Admin dashboard upgrade

This upgrade replaces the placeholder Admin dashboard with live Supabase-backed pages:

- Overview and attention queue
- Project Management
- User Management
- Progress Tracking and milestones
- Project Oversight / risk view
- Impact Analytics
- Announcements
- Notifications and admin activity log

## 1. Run the SQL migration

Open Supabase -> SQL Editor and run:

`supabase/admin_dashboard.sql`

The migration adds `profiles.account_status`, `research_opportunities.status`, and the new `project_milestones`, `announcements`, and `admin_activity_log` tables. It also adds admin RLS policies.

## 2. Replace the frontend files

Use the upgraded:

- `src/AdminDashboard.jsx`
- `src/admin.css`

No additional NPM package is required.

## 3. Optional but recommended: deploy secure admin user creation

The Add User form calls a Supabase Edge Function named `admin-create-user`.

With the Supabase CLI installed and linked to the project:

```powershell
supabase functions deploy admin-create-user
```

Do NOT put `SUPABASE_SERVICE_ROLE_KEY` in Vite `.env` or any frontend file. Supabase provides the service role secret securely to the Edge Function environment.

Until the function is deployed, all other dashboard pages work, but the Add User form will return a function-not-found error. You can continue creating Auth users from the Supabase Dashboard manually.

## 4. Prevent suspended users from entering the application

In `src/App.jsx`, immediately before the block that checks `profile.role === 'admin'`, add:

```jsx
if (
  session &&
  profile &&
  profile.account_status === 'suspended'
) {
  return (
    <main className="page-shell">
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div>
          <h2>Account suspended</h2>
          <p>
            Your UAEU Research Hub account has been suspended.
            Contact a research administrator if you believe this is an error.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  )
}
```

You may add a similar screen for `account_status === 'pending'` if you plan to approve new accounts before use.

## 5. Commit the changes

```powershell
git switch develop
git pull
git switch -c feature/admin-dashboard

git add src/AdminDashboard.jsx src/admin.css supabase ADMIN_DASHBOARD_SETUP.md src/App.jsx
git commit -m "Build Supabase admin dashboard"
git push -u origin feature/admin-dashboard
```

Then open a Pull Request into `develop`.
