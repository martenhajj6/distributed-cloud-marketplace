# CortexOps structural refactor

This work uses the supplied ZIP's working snapshot on
`feature/three-tier-architecture`, extracted into `fix/distributed-cloud-marketplace`.
The ZIP and sibling checkout were not modified. The snapshot already contained
modified `backend/routes/authRoutes.js` and `database/schema.sql`, untracked
`backend/BLL/auth/userService.js`, `backend/DAL/auth/usersDAL.js`, and untracked
frontend files. Their content was used as the starting point, not replaced with
Git HEAD. No commit, branch merge, reset, push, database initialization or seed
execution was performed.

## Final project tree

Git metadata and installation artifacts are omitted.

```text
distributed-cloud-marketplace/
├── server.js
├── package.json
├── package-lock.json
├── .gitignore
├── .dockerignore
├── Dockerfile
├── compose.yaml
├── README.md
├── RESTRUCTURING.md
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/main.js
├── backend/
│   ├── PL/
│   │   ├── routes/authRoutes.js
│   │   └── middleware/authMiddleware.js
│   ├── BLL/
│   │   ├── healthService.js
│   │   └── auth/
│   │       ├── userService.js
│   │       ├── verificationService.js
│   │       ├── verificationToken.js
│   │       ├── twoFactorService.js
│   │       ├── twoFactorDbService.js
│   │       └── emailService.js
│   ├── DAL/
│   │   ├── db.js
│   │   ├── healthDAL.js
│   │   ├── transaction.js
│   │   └── auth/
│   │       ├── usersDAL.js
│   │       ├── verificationDAL.js
│   │       ├── twoFactorDAL.js
│   │       └── sessionDAL.js
│   ├── config/sessionConfig.js
│   └── test-email.js
├── database/
│   ├── schema.sql
│   ├── seed.sql
│   ├── build-sql.js
│   ├── schema/
│   │   ├── 00_database.sql
│   │   ├── 01_auth.sql
│   │   ├── 02_providers.sql
│   │   ├── 03_networking.sql
│   │   ├── 04_resources.sql
│   │   ├── 05_usage_and_logs.sql
│   │   ├── 07_procedures.sql
│   │   ├── 08_triggers.sql
│   │   └── 09_views.sql
│   └── seed/
│       ├── 01_demo_users.sql
│       ├── 02_demo_providers.sql
│       └── 03_demo_resources.sql
└── tests/architecture.test.js
```

No resource/finance JavaScript modules, financial SQL files, migrations, or empty
placeholder modules were added: no corresponding runtime implementation or new
migration is part of this snapshot. `test-email.js` is an existing standalone
email helper and remains untouched. Frontend files, `.gitignore`, `.dockerignore`
and `compose.yaml` are untouched.

## Every moved file

Paths below are relative to this project root. A move includes necessary import
changes where indicated.

| Original | Destination and changes |
| --- | --- |
| backend/server.js | server.js — root imports, frontend path, early environment loading, BLL health call |
| backend/db.js | backend/DAL/db.js — same pool options; explicit backend/.env path |
| backend/routes/authRoutes.js | backend/PL/routes/authRoutes.js — one set of imports, corrected paths, BLL 2FA account lookup |
| backend/middleware/authMiddleware.js | backend/PL/middleware/authMiddleware.js — BLL role decision replaces direct query |
| backend/verificationService.js | backend/BLL/auth/verificationService.js — DAL query and transaction calls |
| backend/verificationToken.js | backend/BLL/auth/verificationToken.js — unchanged implementation |
| backend/twoFactorService.js | backend/BLL/auth/twoFactorService.js — unchanged crypto/TOTP implementation |
| backend/twoFactorDbService.js | backend/BLL/auth/twoFactorDbService.js — DAL query and transaction calls; redundant export removed |
| backend/emailService.js | backend/BLL/auth/emailService.js — unchanged implementation |
| backend/sessionConfig.js | backend/config/sessionConfig.js — session storage factory in DAL; cookie/session options retained |
| backend/package.json | package.json — authoritative backend dependencies/start scripts moved to root; SQL build/check scripts added |
| backend/package-lock.json | package-lock.json — authoritative backend lockfile moved intact to root |

The two old root manifests were replaced by the backend manifests because the
backend already supplied the actual runtime and Docker dependency set. No package
was added to that set and no locked dependency version was changed.

## Other modified files

- `backend/BLL/auth/userService.js`: added existing RBAC decisions using fresh DAL account data.
- `backend/DAL/auth/usersDAL.js`: shared-pool import corrected; existing role lookup extracted.
- `database/schema.sql`: generated executable aggregate of canonical schema modules.
- `database/seed.sql`: generated executable aggregate; original seed content and order retained.
- `Dockerfile`: root work directory/manifests/startup and backend/frontend copy paths.
- `README.md`: root startup and executable SQL workflow.

## Created files

- `backend/BLL/healthService.js`
- `backend/DAL/healthDAL.js`
- `backend/DAL/transaction.js`
- `backend/DAL/auth/verificationDAL.js`
- `backend/DAL/auth/twoFactorDAL.js`
- `backend/DAL/auth/sessionDAL.js`
- `database/build-sql.js`
- `database/schema/00_database.sql`
- `database/schema/01_auth.sql`
- `database/schema/02_providers.sql`
- `database/schema/03_networking.sql`
- `database/schema/04_resources.sql`
- `database/schema/05_usage_and_logs.sql`
- `database/schema/07_procedures.sql`
- `database/schema/08_triggers.sql`
- `database/schema/09_views.sql`
- `database/seed/01_demo_users.sql`
- `database/seed/02_demo_providers.sql`
- `database/seed/03_demo_resources.sql`
- `tests/architecture.test.js`
- `RESTRUCTURING.md`

## SQL groups and DAL ownership

Tables remain in MySQL. DAL JavaScript contains the application's existing
parameterized queries; creating a table does not require inventing a DAL API.

| Canonical schema module | Existing objects | JavaScript DAL |
| --- | --- | --- |
| 00_database | Database and USE statement | db.js supplies environment-based shared pool |
| 01_auth | Users, EmailVerificationTokens, UserTwoFactor, sessions | usersDAL.js (login/profile/2FA eligibility/RBAC); verificationDAL.js (Users + tokens); twoFactorDAL.js (Users + enrollment/replay state); sessionDAL.js (existing MySQL session adapter) |
| 02_providers | ProviderHosts, ResourceGroups | No resource runtime queries exist in this snapshot |
| 03_networking | VirtualNetworks, Subnets | No runtime DAL needed |
| 04_resources | VirtualMachines, LoadBalancers, LoadBalancerTargets, BlobStorage, FileStorage, ManagedDatabases, WebApps, ResourceRegistry, HostCapacityAllocations | No resource runtime DAL exists; existing stored procedures retained |
| 05_usage_and_logs | VmUsage, ResourceUsagePeriods, ResourceActivityLogs, Notifications | No runtime DAL needed |
| 07_procedures | sp_CreateVmWithAllocation, sp_RegisterResource, sp_AddLoadBalancerTarget, sp_CancelResource | Existing database routines; no new JS callers |
| 08_triggers | Eight original validation triggers | Database integrity rules retained |
| 09_views | vw_ProviderCapacity | No new runtime caller |

`ResourceGroups` precedes networking because networks reference groups.
`HostCapacityAllocations` follows VMs inside `04_resources` because its composite
foreign key references VMs. Usage/log tables follow the resource registry.
Sessions are now grouped with authentication. All other table definitions retain
their complete SQL, including constraints, indexes and inline comments.

The seed's user section remains first, providers second, and resources/usage/logs/
notifications/read-only checks third. The last module keeps the original temporary
helper's creation, invocation and removal together. Duplicate prevention, shared
variables, demo IDs resolved by queries, password hash, and application-generated
token/TOTP requirements remain unchanged. There is no finance seed content.

## Layer flow and references

- Root `server.js` performs application composition and existing health HTTP
  handling. `/api/db-health` calls BLL `healthService` → DAL `healthDAL` → pool.
- Auth PL routes call BLL user, verification and 2FA services. PL middleware calls
  the BLL for fresh role authorization. No PL or BLL file executes SQL.
- BLL owns authentication, verification and TOTP decisions. It selects transaction
  boundaries through DAL transaction access. Every query in each multi-table
  operation receives the same acquired connection; commit/rollback/release order
  and original `FOR UPDATE` locks are preserved.
- `usersDAL` imports `../db`; auth BLL services import `../../DAL/auth/...`;
  PL routes/middleware import `../../BLL/auth/...`. Verification/TOTP/mail helpers
  now resolve within BLL/auth.
- Session configuration imports `../DAL/auth/sessionDAL`. The session adapter uses
  the same promise pool as auth/health, retains the sessions table and expiry
  settings, and does not create tables. Passing an existing connection/pool is
  supported by the pinned adapter's [v3.0.3 source](https://github.com/chill117/express-mysql-session/blob/v3.0.3/index.js).
- Root package scripts and Docker use the sole root server. Compose continues
  loading `backend/.env`; no compose change was needed.

## Actual validation results

- `node --test tests/architecture.test.js`: **10 passed, 0 failed**. Uses isolated
  dependency stubs, not live MySQL or HTTP integration. Includes JavaScript syntax
  checks and relative module resolution; SQL boundary checks; unknown-account
  bcrypt invocation and verified-email gate; profiles and role changes; email
  token success/failure and transaction sequencing; enrollment, confirmation and
  replay update behavior; route registration and login session sequencing; root
  health responses/frontend/bind/port; shared session-pool configuration.
- `npm run db:check`: both generated aggregates match their canonical modules.
- A separate snapshot comparison against the supplied dirty files confirmed all
  **21 tables, 4 procedures, 8 triggers and 1 view** are preserved verbatim.
  (The original comments saying 20 tables omit the sessions table.) Every foreign
  key target precedes its dependent table in the aggregate.
- Snapshot comparison confirmed seed content/order is identical except for the
  generated-file header; verification/2FA SQL statements were extracted verbatim,
  in original order; root manifest dependencies match the moved lockfile.
- `git diff --check`: passed; only Git's Windows LF/CRLF informational warnings.
- Static startup inspection: one `app.listen`, one `mysql.createPool`, unchanged
  auth endpoint paths and one `/api/auth` registration. Docker COPY/start paths
  point at existing root files.
- `npm ci --ignore-scripts`: failed with registry DNS `ENOTFOUND`. Authorized
  network retries failed with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, including a retry
  using the system certificate store. TLS verification was not disabled. External
  module loading, native bcrypt/TOTP integration and live server startup therefore
  remain unverified. The isolated bcrypt test checks invocation/gating only.
- MySQL CLI and Docker are unavailable on PATH. No live authentication, database
  health, session persistence, schema execution or Docker build test was run.
  No existing database was reset or recreated for testing.

## Deferred financial integration — separate decision required

The available `origin/feature/financial-system` snapshot was inspected read-only
with `git show`; it was not checked out or merged.

1. Its `database/schema.sql` drops/recreates `cloud_marketplace`, while core uses
   `DistributedCloudMarketplace`. Integration needs a reviewed additive migration
   into the chosen database, with financial demo inserts separated. Never use its
   reset script against core.
2. Its `resource_usage_periods` and `vm_usage` overlap core `ResourceUsagePeriods`
   and `VmUsage` conceptually but have different names, columns, IDs and rules.
   Core references the resource registry and permits zero quantities/equal interval
   endpoints; finance records customer/provider IDs, pricing dimensions and stricter
   quantities/times. Choose a single usage source and explicit mapping without
   double billing or changing core semantics. Naming differences must not be
   resolved through cosmetic renames.
3. Financial customer/provider/actor IDs lack core identity foreign keys in several
   tables. Demo IDs (customers 1/2, providers 10/11, actor 99, VMs 101/102/103/201,
   resource 501) are unvalidated against core. Resolve real references and design
   integrity constraints in a separate reviewed migration before copying data.
4. Finance resource dimensions CPU/RAM/Storage/GPU and `cloud_class` do not directly
   match the core registry's service types, hosting_class, and usage units. Pricing,
   attribution and lifecycle/usage ownership require explicit reconciliation.
5. Finance uses `req.user = {id, role}` with capitalized roles and an optional
   development-header auth path. Core uses verified, session-backed
   `req.session.user = {userId, role}` and lowercase roles. Future integration must
   adapt the trusted core session/role checks without weakening verification/2FA.
6. Finance has its own database pool/configuration and server/router stack. It
   cannot be combined by copying its entry point over core. Its financial code
   still needs scoped PL/BLL/DAL extraction before integration.
7. `payment_notifications` and `financial_audit_log` overlap core notification/
   activity responsibilities but have different recipients, entity references,
   and payloads. Decide whether/how to map them rather than silently replacing
   core tables.

No financial tables, endpoints, UI, demo data, or financial backend behavior were
introduced. Runtime integration testing requires the existing locked dependencies
to install successfully and an explicitly supplied, safe test service environment.
