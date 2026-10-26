# Cloud Marketplace API

A beginner-friendly Express/MySQL API for resource pricing and history, simulated billing and invoices, simulated payments/refunds, platform commissions, provider earnings, and withdrawal requests. **All money movement is simulated; this project does not charge or transfer real money.**

## 1. Requirements and setup

- Node.js LTS
- MySQL Server 8 and MySQL Workbench
- VS Code

1. Extract the ZIP and open the `cloudmarketplace` folder in VS Code.
2. Run `npm install` in the terminal.
3. Copy `.env.example` to `.env` and set your MySQL credentials. Keep `.env` private.
4. If your team already has a shared database, use that schema rather than creating a separate one. These scripts target `cloud_marketplace`; confirm with your teammate before running them.
5. Run the SQL scripts in MySQL Workbench **in this order**:
   - `sql/01_create_pricing_tables.sql`
   - `sql/02_create_billing_tables.sql`
   - `sql/03_create_finance_tables.sql`
   - `sql/04_discounts_notifications_dashboard.sql` (Task 5; run once after Task 4)
   - `sql/usage_refunds_audit.sql` (Task 6: usage billing, refund requests, audit log; safe to re-run)
   - optional, development only: `sql/seed_usage_test_data.sql` (fake VM/storage usage for testing)
6. Start the API with `npm run dev`.

Check `http://localhost:3000/`, `http://localhost:3000/api/health`, and `http://localhost:3000/api/pricing`.

## 2. Pricing and history

- `GET /api/pricing` — list current rules.
- `POST /api/pricing/calculate` — calculate a monthly estimate.
- `POST /api/pricing` — add a pricing rule and initial history entry.
- `PUT /api/pricing/:id` — update a rule and record its history.
- `GET /api/pricing/:id/history` — view price history.

Example `POST /api/pricing/calculate` body:
```json
{
  "cloud_class": "Business",
  "cpu_cores": 4,
  "ram_gb": 8,
  "storage_gb": 100,
  "gpu_units": 0
}
```

## 3. Billing and invoices

Run `sql/02_create_billing_tables.sql` after the pricing script. The database name is `cloud_marketplace` (not `marketplace`).

- `POST /api/billing/invoices` — create a billing period and simulated invoice.
- `GET /api/billing/invoices` — list invoices.
- `GET /api/billing/invoices?customer_id=1` — filter by customer.
- `GET /api/billing/invoices/:id` — view invoice and line items.

Example `POST /api/billing/invoices` body:
```json
{
  "customer_id": 1,
  "billing_period_start": "2026-10-01",
  "billing_period_end": "2026-11-01",
  "resources": [
    { "resource_type": "CPU", "cloud_class": "Business", "quantity": 4 },
    { "resource_type": "RAM", "cloud_class": "Business", "quantity": 8 },
    { "resource_type": "Storage", "cloud_class": "Business", "quantity": 100 }
  ]
}
```

The starter rates make this example total `$30.00`. `customer_id` is currently a placeholder until the API is connected to the team's customer table. Only one invoice is allowed per customer and billing period.

## 4. Simulated payments, refunds, earnings and withdrawals

Run `sql/03_create_finance_tables.sql` **after** the billing script. Configure the platform commission percentage in `.env` using `PLATFORM_COMMISSION_RATE=15` (the default is 15%). A provider's net earning is its allocated gross amount minus the platform commission.

### Simulate a payment

First create an unpaid invoice using Task 3. Then call `POST /api/finance/payments`:
```json
{
  "invoice_id": 1,
  "provider_allocations": [
    { "provider_id": 10, "gross_amount": 20 },
    { "provider_id": 11, "gross_amount": 10 }
  ]
}
```

Provider allocations must add up exactly to the invoice total. The endpoint records a successful simulated payment, marks the invoice `Paid`, calculates each provider's commission/net earnings, and returns the payment reference. One payment per invoice is allowed.

### Refund a payment

`POST /api/finance/refunds`:
```json
{
  "payment_id": 1,
  "amount": 5,
  "reason": "Partial service refund"
}
```

Refunds may be partial or full, but cannot exceed the remaining refundable amount. Provider gross earnings, commission and net earnings are reduced proportionally. A refund is rejected if it would conflict with an existing requested, approved, or paid withdrawal.

### View financial records

- `GET /api/finance/payments` or `GET /api/finance/payments?invoice_id=1`
- `GET /api/finance/refunds` or `GET /api/finance/refunds?payment_id=1`
- `GET /api/finance/earnings` — earnings summary for all providers.
- `GET /api/finance/earnings?provider_id=10` — one provider's gross earnings, platform commission, net earnings and available balance.
- `GET /api/finance/withdrawals` or `GET /api/finance/withdrawals?provider_id=10`

### Request a withdrawal

`POST /api/finance/withdrawals`:
```json
{
  "provider_id": 10,
  "amount": 10,
  "note": "Monthly withdrawal"
}
```

A request is rejected if it exceeds the provider's available balance. Requests start with status `Requested` and reserve that balance.

### Simulate reviewing a withdrawal

`PATCH /api/finance/withdrawals/1` with one of these JSON bodies:
```json
{ "status": "Approved" }
```
```json
{ "status": "Rejected" }
```
```json
{ "status": "Paid" }
```

Allowed transitions are `Requested` → `Approved` or `Rejected`, then `Approved` → `Paid` or `Rejected`. This endpoint updates an administrative record and is written to the audit log.

## 5. Discounts, payment notifications and admin dashboard

Run `sql/discounts_notifications_dashboard.sql` after `sql/finance_tables.sql`, then run `sql/usage_refunds_audit.sql` so the notification types and financial audit log are available. The migration is safe to re-run on MySQL 8.

### Admin discount-code management

- `GET /api/discounts` — list all codes, including inactive codes and usage counts (Admin).
- `POST /api/discounts` — create a code (Admin).
- `PATCH /api/discounts/:id` — update code details or activate/deactivate a code (Admin).
- `POST /api/discounts/validate` — validate a code and optionally calculate a subtotal (any caller); validation does not consume a use.

Example `POST /api/discounts` body:
```json
{
  "code": "WELCOME10",
  "discount_type": "Percentage",
  "discount_value": 10,
  "max_uses": 100,
  "expires_at": "2026-12-31 23:59:59",
  "active": true
}
```
Percentage discounts must be between 0 and 100. Fixed discounts cannot reduce an invoice below zero. Codes are normalized to uppercase and usage is counted when an invoice is created.

### Payment/refund notifications

Successful simulated payments and refunds create in-app notifications for the affected customer and providers.

- `GET /api/notifications` — your own notifications; add `?unread_only=true` to filter unread items (Customer or Provider).
- `PATCH /api/notifications/:id/read` — mark one of your own notifications as read.

### Admin dashboard

- `GET /api/admin/dashboard` — financial totals for invoices, payments, refunds, revenue, provider earnings, commissions, withdrawals, discount code/redemption counts and notification/unread counts; includes per-provider earnings.
- `GET /api/admin/audit-log?entity_type=discount_code&limit=50` — inspect recorded administrative/financial changes.

These endpoints are open in this development version. Money movement is simulated; no real payments or transfers occur.

## 6. Usage billing, refund requests and audit log

All endpoints are open in this development version. User-scoped demo endpoints use user ID `1` by default; customer and provider routes apply their corresponding demo context. Do not expose this development API publicly.

### Role-specific endpoints

- `GET /api/customers/me/invoices`, `GET /api/customers/me/invoices/:id`, `GET /api/customers/me/payments`
- `POST /api/customers/me/refunds` `{ payment_id, reason, amount? }` creates a **Pending** request; `GET /api/customers/me/refunds` lists mine.
- `PATCH /api/admin/refunds/:id` `{ status: "Approved" | "Rejected", admin_note? }`; `GET /api/admin/refunds?status=Pending` lists requests. Approving records a normal refund (same code as `POST /api/finance/refunds`). If a provider already withdrew the money the approval fails with 409 and the request stays Pending.
- `GET /api/providers/me/earnings`, `GET /api/providers/me/withdrawals`, `POST /api/providers/me/withdrawals` `{ amount, note? }`
- `POST /api/discounts/validate` `{ code, subtotal? }` checks a code without using it up.
- `GET /api/admin/dashboard` totals incl. revenue, commissions, refunds, pending refund requests/withdrawals and a per-provider list. `GET /api/admin/audit-log?entity_type=&entity_id=&limit=`.

### Usage-based invoices

`POST /api/billing/usage-invoices` (Admin) with `{ customer_id, billing_period_start, billing_period_end, discount_code?, dry_run? }`.

- Prices are monthly, so usage becomes unit-months: `quantity x hours used / 720` (`BILLING_HOURS_PER_MONTH`).
- VMs: only the intervals in `vm_usage` (running time) are billed, for CPU, RAM and GPU. A stopped VM has no open interval, so it costs nothing.
- Other resources (`resource_usage_periods`, such as storage volumes) are billed while they exist.
- The period must be over to create a real invoice; `dry_run: true` previews usage so far without saving.
- Each invoice line stores its `provider_id`, so `POST /api/finance/payments` can be called with only `invoice_id` and the payment is split between providers automatically (discounts shared proportionally).
- `vm_usage` and `resource_usage_periods` are created by `sql/usage_refunds_audit.sql` only if they do not exist. If Developer 1 uses other column names, adapt the two SELECTs in `services/usageBillingService.js`.

### Audit log

`financial_audit_log` records who did what for pricing changes, refund request decisions, direct admin refunds, withdrawal decisions, discount code changes and usage-invoice generation. Entries are written in the same transaction as the change.

### Code layout

Business rules live in `services/` (`financeService`, `billingService`, `usageBillingService`, `discountService`, `audit`); route files only validate input and call them, so admin and role-specific routes share one implementation.

## Notes and limitations

- Payments, refunds, commissions and withdrawals are records for coursework/demo purposes only; no real payment gateway or bank transfer is connected.
- `provider_id` is a placeholder integer until integrated with the team's provider table. The API currently accepts provider allocations supplied by the caller; a production system must derive and validate these allocations from the actual services/order records.
- Audit logging is described in section 6. Integration with the team's real customer/provider tables is still to do: `customer_id`/`provider_id` currently use the default demo user ID.

## Swagger / interactive API testing

1. Copy `.env.example` to `.env` and set your local MySQL credentials. Do not commit `.env`.
2. Install dependencies: `npm install`
3. Ensure the database and SQL schema files are applied, then start the API with `npm run dev` (or `npm start`).
4. Open Swagger UI at `http://localhost:3000/api-docs`. The raw OpenAPI document is at `http://localhost:3000/api-docs.json`.

Swagger documents the routes implemented in `routes/pricing.js`, `routes/billing.js`, and `routes/finance.js`, including request-body fields and query/path parameters. The payment and refund routes are simulated and do not transfer real money.

