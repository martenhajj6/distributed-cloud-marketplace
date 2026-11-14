# Finance integration tests

Run `npm run test:finance` with MySQL available and the normal project `.env` configured. The DB account needs permission to create and drop a separate test database.

The suite creates a uniquely named `finance_review_<timestamp>` database, builds the finance tables from `database/cloud_marketplace.sql`, inserts synthetic accounts, starts the real Express app on a temporary local port, and creates real admin/customer/provider sessions as setup. It never imports the SQL file wholesale, executes its DROP statements, or changes the configured application database. The temporary database is dropped after the suite finishes. Authentication features themselves are not tested.

Coverage includes all seven `/api/finance` operations, invalid query filters and body values, missing records, partial/full/over-refunds, multi-provider cent allocation, concurrent refunds, withdrawal transitions, duplicate approvals/payouts, concurrent withdrawal limits, payment allocations, duplicate payments, refund approvals, role restrictions, populated dashboard reconciliation, and transaction rollback after an injected notification failure.

The injected failures intentionally log errors while its rollback test passes. Set `FINANCE_TEST_REPORT` to an absolute JSON output path to save individual test results.

Limits: this is HTTP integration testing, not Swagger browser automation. It uses the finance subset of the schema, not the full infrastructure procedures/triggers. It does not prove all concurrency schedules, transport retry idempotency for partial refunds, dashboard snapshot consistency during simultaneous writes, infrastructure failures, production session storage, or external money movement. Payments and refunds are simulated. Repeating an intentional partial-refund request can create another refund up to the remaining balance; request-key replay requires the Idempotency-Key header on admin refund requests.

Refund JSON contract: `amount` must be a number. Optional `reason` must be a string of at most 255 characters or null; invalid types and excess length return HTTP 400 instead of conversion or truncation.

## Additional reliability checks

Run `npm.cmd run test:finance:customer` for the customer ownership, validation, payment, refund reservation and notification suite. Both suites create and remove isolated test databases.

Admin POST /api/finance/refunds accepts an optional Idempotency-Key header: 1–128 printable ASCII characters with no spaces. Use a unique key per intentional refund and reuse it for transport retries. The key is scoped to the actor; reusing it with different normalized refund data returns 409. Successful responses are cached atomically with the refund, notifications and audit record. Failed transactions do not consume keys. Without this header, each partial-refund call remains a separate operation. Customer refund requests and provider withdrawals also support request-key replay; invoice payment duplication is prevented by invoice state and its unique payment constraint.

Reporting now uses a read-only REPEATABLE READ snapshot on one connection. The admin suite verifies snapshot isolation while a concurrent refund commits. It also tests six concurrent same-key refund requests and a retry following an injected failure. Two intentional errors are logged by the rollback tests.

Customer payment/refund IDs must be JSON numbers representing positive safe integers. Explicit null refund amounts are rejected; omit the amount field to request the remaining refundable balance.

Existing deployments must have the api_idempotency table (included in the schema); apply database/migrations/finance_idempotency.sql before using the header if needed. Successful key records intentionally have no automatic expiry, so a delayed retry cannot silently execute a second refund. Database outages, production load, cross-process stress and a retention policy still need operational validation.

## Finance implementation refactor

Payment and refund allocations now use integer cents and BigInt intermediate products. Numeric money inputs reject strings and sub-cent values instead of silently converting/rounding them. Optional withdrawal notes reject invalid types and excess length. Run `npm.cmd run test:finance:money` for exact allocation and rounding checks.

Customer refund requests and provider withdrawals now support optional Idempotency-Key headers. Repeated requests with the same actor, key and normalized payload return the original result; changed payloads return 409. Use a new key for each intentional operation. Without a key, repeated calls remain separate requests.

Balance-changing payment/refund/withdrawal operations acquire stable provider guard rows in ascending provider order. Existing deployments need finance_locks; the additive database/migrations/finance_provider_locks.sql migration creates it. Provider-filtered earnings queries now restrict the withdrawal aggregation to the requested provider. No production-scale speedup is claimed without benchmarking.

Finance DAL methods now use descriptive operation names; external HTTP response shapes are unchanged. Usage-billing repository renames were statically checked, but the finance-only test database cannot validate infrastructure usage integration.
