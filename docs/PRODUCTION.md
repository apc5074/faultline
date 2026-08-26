# Production

The production application is `apps/web`, deployed on Vercel. `main` will be the production branch and other branches will use Vercel Preview deployments once configured.

Supabase will provide Postgres and Vercel AI Gateway will provide model access through server-only configuration. Official submissions will be re-simulated server-side before they can be ranked.

Deployment configuration, environment locations, migration workflow, provider setup, and verification dates are not yet recorded; they will be added by the corresponding Phase 0 tickets.
