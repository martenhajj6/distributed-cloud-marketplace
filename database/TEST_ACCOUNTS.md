# Local Swagger test accounts

These are real development users in MySQL, not authentication bypasses. No database schema change is required.

## Create and delete

From the project root, with MySQL and `.env` configured:

```powershell
npm install
npm run seed:test-users
npm start
```

Accounts: `admin@test.com`, `customer@test.com`, `provider@test.com`; password `Test12345!`.

To delete tracked accounts whenever they are no longer needed:

```powershell
npm run delete:test-users
```

The seeder records the exact IDs it created in `database/.test-users.json` (ignored by Git). Keep this file until cleanup. It does NOT overwrite existing users with the same emails. The delete script checks ID, email, role, and test naming to avoid removing regular users. If an account owns financial, VM, or other records, foreign-key restrictions may block deletion; the script reports that rather than deleting unrelated data. For a disposable development database, you can reset the database after backing up any needed work. Never disable foreign-key checks to force deletion. Logged-in sessions may persist in Express memory until logout or server restart.

## Swagger test flow

1. Open `http://127.0.0.1:3000/api-docs/` in the same browser used for the login request.
2. Execute `POST /api/auth/login` with a test email/password.
3. Execute `GET /api/auth/me`; it should return that user.
4. Call a finance or Instances endpoint allowed for the role. Expected responses depend on other data and permissions.
5. Execute `POST /api/auth/logout` before changing role.

**The browser automatically stores/sends the HTTP-only `cortexops.sid` cookie. Swagger Authorize cannot manually set this cookie.** Use HTTP, same host (`127.0.0.1` rather than switching to `localhost`), and same browser for the whole test. The login endpoint is rate-limited to ten attempts per 15 minutes.

Development only. Known passwords, local MemoryStore, and test accounts must not be deployed to production. Live MySQL authentication and API tests still need to be run locally.
