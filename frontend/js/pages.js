
const page = document.body.dataset.page;

// Audit
if (page === "audit") {
    // Audit records can be viewed through the API.
}

// Discounts
if (page === "discounts") {
    async function load() {
        enableAction("Create discount", "discount");
        const data = list(await api("/api/discounts"));

        showRows("discountRows", data, [
            textCell("id"), textCell("code"), textCell("discount_type"),
            textCell("discount_value"), textCell("max_uses"),
            textCell("expires_at"), textCell("active")
        ]);
    }

    reloadData(load);
}

// Earnings
if (page === "earnings") {
    async function load() {
        let url = "/api/finance/earnings";
        if (state.role === "Provider") url = "/api/providers/me/earnings";

        const data = await api(url);

        $("#earningsCards").innerHTML =
            card("Gross earnings", money(value(data, "gross_earnings", "gross")), "Before commissions") +
            card("Net earnings", money(value(data, "net_earnings", "net")), "After commissions") +
            card("Withdrawn", money(value(data, "withdrawn_amount", "withdrawn")), "Completed withdrawals") +
            card("Available", money(value(data, "available_balance", "available")), "Current balance");

        showRows("earningsRows", list(data.lines || data), [
            textCell("provider_id"), textCell("payment_id"),
            moneyCell("gross_amount"), moneyCell("commission_amount"),
            moneyCell("net_amount")
        ]);
    }

    reloadData(load);
}

// Invoices
if (page === "invoices") {
    async function load() {
        if (state.role === "Admin") enableAction("Create invoice", "invoice");

        let url = "/api/billing/invoices";
        if (state.role === "Customer") url = "/api/customers/me/invoices";

        const data = list(await api(url));

        showRows("invoiceRows", data, [
            textCell("id"),
            textCell("customer_id"),
            row => money(value(row, "total_amount", "total", "amount")),
            statusCell("status"),
            row => escapeHtml(value(row, "created_at", "issued_at", "billing_date"))
        ]);
    }

    reloadData(load);
}

// Overview
if (page === "overview") {
    async function load() {
        let html = "";

        if (state.role === "Admin") {
            const data = await api("/api/admin/dashboard");
            const totals = data.totals || data;
            const providers = list(data.providers);

            html =
                card("Total revenue", money(value(totals, "total_revenue", "platform_revenue", "revenue")), "Platform revenue", "↗") +
                card("Payments", money(value(totals, "total_payments", "gross_payments", "payments_total")), "Simulated payment volume", "↔") +
                card("Refunds", money(value(totals, "total_refunds", "refunds_total")), "Refunded amount", "↶") +
                card("Provider earnings", money(value(totals, "total_provider_earnings", "provider_earnings")), "Provider allocations", "◫");

            showDetails("Provider performance", ["Provider", "Gross", "Net", "Available"], "providerRows");

            showRows("providerRows", providers, [
                textCell("provider_id"), moneyCell("gross_earnings"),
                moneyCell("net_earnings"), moneyCell("available_balance")
            ]);
        } else if (state.role === "Customer") {
            const invoices = list(await api("/api/customers/me/invoices"));
            const payments = list(await api("/api/customers/me/payments"));
            const refunds = list(await api("/api/customers/me/refunds"));

            let outstanding = 0;

            for (const invoice of invoices) {
                if (String(invoice.status).toLowerCase() !== "paid")
                    outstanding += Number(invoice.total_amount || invoice.total || 0);
            }

            html =
                card("My invoices", invoices.length, "Billing history", "▤") +
                card("My payments", payments.length, "Simulated transactions", "↔") +
                card("Refund requests", refunds.length, "Submitted requests", "↶") +
                card("Outstanding", money(outstanding), "Based on invoice status", "◇");

            showDetails("Recent invoices", ["Invoice", "Total", "Status"], "recentInvoices");

            showRows("recentInvoices", invoices.slice(0, 8), [
                textCell("id"), moneyCell("total_amount"), statusCell("status")
            ]);
        } else {
            const earnings = await api("/api/providers/me/earnings");
            const withdrawals = list(await api("/api/providers/me/withdrawals"));

            html =
                card("Gross earnings", money(value(earnings, "gross_earnings", "gross")), "Provider gross amount", "↗") +
                card("Net earnings", money(value(earnings, "net_earnings", "net")), "After commissions", "◫") +
                card("Available balance", money(value(earnings, "available_balance", "available")), "Eligible for withdrawal", "◇") +
                card("Withdrawals", withdrawals.length, "Withdrawal requests", "⇧");

            showDetails("Recent withdrawals", ["Request", "Amount", "Status"], "recentWithdrawals");

            showRows("recentWithdrawals", withdrawals, [
                textCell("id"), moneyCell("amount"), statusCell("status")
            ]);
        }

        $("#summaryCards").innerHTML = html;
    }

    reloadData(load);
}

// Shared overview table design
function showDetails(title, columns, tableId) {
    let headers = "";

    for (const column of columns)
        headers += `<th>${column}</th>`;

    $("#overviewDetails").innerHTML = `
        <section class="panel">
            <div class="panelhead"><div><h3>${title}</h3></div></div>
            <div class="tablewrap">
                <table>
                    <thead><tr>${headers}</tr></thead>
                    <tbody id="${tableId}"></tbody>
                </table>
            </div>
        </section>`;
}

// Payments
if (page === "payments") {
    async function load() {
        if (state.role === "Admin") enableAction("Record payment", "payment");

        let url = "/api/finance/payments";
        if (state.role === "Customer") url = "/api/customers/me/payments";

        showRows("paymentRows", list(await api(url)), [
            textCell("id"), textCell("invoice_id"),
            row => money(value(row, "amount", "gross_amount", "total_amount")),
            statusCell("status"), textCell("created_at")
        ]);
    }

    reloadData(load);
}

// Pricing
if (page === "pricing") {
    async function load() {
        if (state.role === "Admin") enableAction("Add pricing rule", "addPrice");

        const data = list(await api("/api/pricing"));

        showRows("pricingRows", data, [
            textCell("id"), textCell("resource_type"), textCell("cloud_class"),
            row => money(value(row, "unit_price", "price", "price_per_hour")),
            row => state.role === "Admin"
                ? `<button class="inlinebtn" data-history="${escapeHtml(row.id)}">History</button>` : "—"
        ]);

        for (const button of document.querySelectorAll("[data-history]")) {
            button.onclick = async function() {
                try {
                    const id = button.dataset.history;
                    const history = list(await api("/api/pricing/" + id + "/history"));

                    showDetails("Pricing history for rule #" + escapeHtml(id),
                        ["Price", "Changed", "ID"], "historyRows");

                    showRows("historyRows", history, [
                        moneyCell("unit_price"), textCell("changed_at"), textCell("id")
                    ]);
                } catch (error) {
                    showError(error);
                }
            };
        }
    }

    reloadData(load);
}

// Refunds
if (page === "refunds") {
    async function load() {
        if (state.role === "Customer")
            enableAction("Request refund", "requestRefund");
        else
            enableAction("Record refund", "refund");

        let url = "/api/admin/refunds";
        if (state.role === "Customer") url = "/api/customers/me/refunds";

        showRows("refundRows", list(await api(url)), [
            textCell("id"), textCell("payment_id"),
            moneyCell("amount"), statusCell("status"),
            row => state.role === "Admin" && String(row.status).toLowerCase() === "pending"
                ? `<button class="inlinebtn" data-review="${escapeHtml(row.id)}">Review</button>` : "—"
        ]);

        for (const button of document.querySelectorAll("[data-review]")) {
            button.onclick = function() {
                openForm("Review refund #" + button.dataset.review, [
                    field("status", "Decision", "select", { options: ["Approved", "Rejected"] }),
                    field("adminNote", "Admin note", "textarea", { required: false })
                ], data => api("/api/admin/refunds/" + button.dataset.review, "PATCH", data));
            };
        }
    }

    reloadData(load);
}

// Settings
if (page === "settings") {
    $("#role").value = state.role;
    $("#userId").value = state.id;

    $("#settingsForm").onsubmit = function(event) {
        event.preventDefault();

        const data = new FormData(event.target);
        localStorage.setItem("cortex_role", data.get("role"));
        localStorage.setItem("cortex_id", data.get("id"));

        window.location.href = "/overview";
    };
}

// Withdrawals
if (page === "withdrawals") {
    async function load() {
        enableAction("Request withdrawal", "withdrawal");

        let url = "/api/finance/withdrawals";
        if (state.role === "Provider") url = "/api/providers/me/withdrawals";

        showRows("withdrawalRows", list(await api(url)), [
            textCell("id"), textCell("provider_id"),
            moneyCell("amount"), statusCell("status"),
            row => state.role === "Admin"
                ? `<button class="inlinebtn" data-withdraw="${escapeHtml(row.id)}">Update</button>` : "—"
        ]);

        for (const button of document.querySelectorAll("[data-withdraw]")) {
            button.onclick = function() {
                openForm("Update withdrawal #" + button.dataset.withdraw, [
                    field("status", "New status", "select", {
                        options: ["Approved", "Rejected", "Paid"]
                    })
                ], data => api("/api/finance/withdrawals/" + button.dataset.withdraw, "PATCH", data));
            };
        }
    }

    reloadData(load);
}
