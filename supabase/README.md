# PostgreSQL foundation

`migrations/` contains the proposed Supabase schema. The initial filename was created with `supabase migration new knowledge_foundation` (CLI 2.81.3). No remote project has been linked and no migration has been deployed.

The migration targets PostgreSQL 15+ and expects Supabase's `auth.users`, `auth.uid()` and `anon`, `authenticated`, `service_role` roles. It applies explicit grants and RLS to every exposed table. Before connecting a hosted project, inspect its schema and default privileges, review the migration, and run full Supabase tests and database advisors in an isolated development project.

Run `npm run test:db` for local PGlite PostgreSQL verification. Tests supply minimal Auth stubs and switch actual database roles; they do not verify GoTrue, PostgREST, JWT verification, service credentials or hosted project configuration.

The application currently uses a browser-local repository. A transactional remote repository and a server-side progress projector must be implemented before this schema serves the live UI. Do not expose stale projection rows after a dispute. A future write use case must persist an observation and update/rebuild its projection in one transaction using a user-scoped idempotency key.

No personal library content or licensed dictionary data is seeded. The browser example dictionary is original authored content. Account deletion cascades to owned data; deleting a saved sense also deletes its evidence, disputes and projections. Unsaving is therefore destructive at database level and requires explicit product semantics before the remote adapter is enabled. Deleting a document preserves saved senses and clears the document link; its short context excerpt remains until the sense is deleted or the excerpt is cleared.
