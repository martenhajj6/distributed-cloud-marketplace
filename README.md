# distributed-cloud-marketplace
Cloud infrastructure marketplace and resource management simulation

Run the existing application from the repository root:

```sh
npm ci
npm start
```

The only Express entry point is `server.js`. Existing environment variables are
read from `backend/.env` (exported environment variables take precedence). Keep
the existing DB, session, SMTP, APP_BASE_URL and TOTP configuration; no credentials
are supplied by this restructuring. `npm run dev` also starts the root server.
Docker builds install the root lockfile and start that same entry point.
`compose.yaml` retains its existing environment configuration and persistent volume.

SQL modules in `database/schema/` and `database/seed/` are canonical. After editing
them, run `npm run db:build`; run `npm run db:check` to detect stale aggregate files.
These commands only read/write SQL files and never connect to MySQL.

For an explicitly approved, empty development database, use the MySQL CLI in a
single connection per script (substitute your existing connection options):

```sql
SOURCE database/schema.sql;
-- Optional demo data, only with explicit permission:
SOURCE database/seed.sql;
```

Run those commands from the project root inside the MySQL client. The aggregates
contain complete SQL, including DELIMITER directives; they do not require nested
SOURCE resolution. Do not run schema initialization against an existing database;
it is not a migration. Seed modules share connection-scoped SQL variables and a
temporary helper procedure, so do not run modules in separate connections. No
database initialization or seeds were executed during this refactor.

Run isolated validation with `node --test tests/architecture.test.js`.
See [RESTRUCTURING.md](RESTRUCTURING.md) for the directory tree, full change
inventory, SQL/DAL mapping, actual validation results, and deferred financial work.
