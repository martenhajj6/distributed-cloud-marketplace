# Authentication integration review — V2

The uploaded `dev1-auth.zip` already shares its core authentication, verification, and 2FA code with V2. V2 additionally includes registration and 2FA enrollment routes. These were preserved rather than overwritten with older code. This archive does **not** include Developer 1’s original MySQL session storage (`sessionDAL.js`, `sessionConfig.js`), because Express memory sessions were explicitly requested.

Changes:
- Mounted `/api/instances` in `server.js`.
- Retained session-based login, 2FA, registration, and email verification.
- Added the missing Instances SQL migration at `database/migrations/instance_management.sql`.

## Run
1. From the project root, run `npm install`, then `npm start`.
2. Configure the existing `.env` (MySQL, SESSION_SECRET at least 32 chars, and email/2FA keys if testing those flows).
3. Ensure the `cloud_marketplace` database schema is installed. **Warning:** `database/cloud_marketplace.sql` drops existing databases; back up before running it. Apply `database/migrations/instance_management.sql` afterward to an existing database.
4. Open `http://127.0.0.1:3000/api-docs/`. Log in through `/api/auth/login` with a verified account (2FA if enabled). Browser cookie sessions are stored in server memory, not MySQL.

## Still not done
- No Developer 1 VM creation/capacity service is present in either upload. Instances must be initialized by calling `initializeVM()` after a real VM is created. Deletion deliberately returns 503 until `releaseCapacity` is integrated. Other Instances endpoints require initialized VM records.
- MySQL and actual browser login/Swagger were not available to test here. JavaScript syntax and static route checks were used instead.
- `express-session` MemoryStore is **development-only**. Server restarts log everyone out.
