# CortexOps Financial Frontend

This frontend is integrated into the existing Express financial backend, using static HTML/CSS/JavaScript (no new packages required). It follows the CortexOps shared design direction with a sidebar, light panels, role-specific navigation, tables and action forms.

## Run

1. `npm install`
2. Copy `.env.example` to `.env`, configure MySQL and set `DEV_AUTH=true` for **local development only**.
3. Run the project SQL scripts against your test MySQL database, as documented in README.md.
4. `npm start` and visit `http://localhost:3000`.
5. Open **Settings** to select Admin/Customer/Provider and a real test user ID.

## Included

- Admin overview, pricing, invoices, payments, refunds, earnings, withdrawals, discount codes, notifications, settings.
- Customer overview, pricing, own invoices/payments/refunds and notifications.
- Provider overview, pricing, own earnings/withdrawals and notifications.
- API-backed forms and tables, request errors and responsive layout.

## Integration limitations

- This is the **Developer 2 financial frontend**, not the complete 11-resource marketplace frontend.
- Authentication pages from the design PDF are **not implemented** because Developer 1 owns real authentication. Settings only supply development headers, not real login. Never enable DEV_AUTH in production.
- All values come from the existing APIs; no fake sample transactions. Empty tables are normal until MySQL has data.
- The frontend has not been validated end-to-end against a running MySQL database here. Some form payloads may require adjustments to match backend validation; consult Swagger at `/api-docs`.
- The PDF is a proposed shared design system, not proof that any backend endpoint exists.
