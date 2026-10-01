# Security

This is a private app for one teacher and two students. It is not meant for public sign-up.

## Secrets (server-side only)

| Secret | Where | Notes |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Vercel env | Full database and storage access (bypasses RLS). Never put it in client code or share it. |
| `SESSION_SECRET` | Vercel env | Signs login cookies. Changing it signs everyone out. |
| `ADMIN_PASSWORD` | Vercel env | Only used for the very first admin login; afterwards the hashed password in the database is used. |
| `JARVIS_API_TOKEN` | Vercel env + Jarvis's `.env` | Full admin access through `/api/jarvis`. |

Every table has Row Level Security switched on with no policies, so the public anon key can read nothing. All data access goes through the server with the secret key.

## Rotating the Jarvis token

1. Generate a new one: `python -c "import secrets; print(secrets.token_urlsafe(40))"`.
2. Replace `JARVIS_API_TOKEN` in Vercel and redeploy.
3. Put the same value in Jarvis's `.env` (`HOMEWORK_API_TOKEN`) and restart Jarvis.

To cut Jarvis off immediately, delete `JARVIS_API_TOKEN` in Vercel and redeploy. To allow reading only, set `JARVIS_API_READ_ONLY=1`.

## Reporting

If you find a problem, tell the teacher directly. Don't open a public issue with details.
