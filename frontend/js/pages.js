
const page = document.body.dataset.page;

// Audit
if (page === "audit") {
    async function load() {
        showRows("auditRows", list(await api("/api/admin/audit-log")), [
            textCell("id"), textCell("action"), textCell("actor_role"),
            textCell("entity_type"), textCell("entity_id"), textCell("created_at")
        ]);
    }
    reloadData(load);
}

// Discounts
if (page === "discounts") {
    async function load() {
        enableAction("Create discount", "discount");
        const data = list(await api("/api/discounts"));

        showRows("discountRows", data, [
            textCell("id"), textCell("code"), textCell("discount_type"),
            textCell("discount_value"), row => escapeHtml(row.used_count) + " / " + escapeHtml(row.max_uses ?? "Unlimited"),
            textCell("expires_at"), row => status(row.active ? "Active" : "Inactive"),
            row => `<button class="inlinebtn" data-edit-discount="${escapeHtml(row.id)}">Edit</button> ` +
                   `<button class="inlinebtn" data-toggle-discount="${escapeHtml(row.id)}">${row.active ? "Deactivate" : "Activate"}</button>`
        ]);
        for (const button of document.querySelectorAll("[data-edit-discount]")) {
            button.onclick = () => {
                const discount = data.find(row => String(row.id) === button.dataset.editDiscount);
                if (!discount) return;
                openForm(`Edit discount ${discount.code}`, [
                    field("discount_type", "Type", "select", { options: ["Percentage", "Fixed"] }),
                    field("discount_value", "Value", "number", { step: "0.01" }),
                    field("max_uses", "Maximum uses (optional)", "number", { required: false }),
                    field("expires_at", "Expiry (optional)", "date", { required: false })
                ], values => api(`/api/discounts/${discount.id}`, "PATCH", values));
                $("#f_discount_type").value = discount.discount_type;
                $("#f_discount_value").value = discount.discount_value;
                $("#f_max_uses").value = discount.max_uses ?? "";
                $("#f_expires_at").value = discount.expires_at ? String(discount.expires_at).slice(0, 10) : "";
            };
        }
        for (const button of document.querySelectorAll("[data-toggle-discount]")) {
            button.onclick = async () => {
                const discount = data.find(row => String(row.id) === button.dataset.toggleDiscount);
                if (!discount || !confirm(`${discount.active ? "Deactivate" : "Activate"} discount ${discount.code}?`)) return;
                button.disabled = true;
                try {
                    await api(`/api/discounts/${discount.id}`, "PATCH", { active: !Boolean(discount.active) });
                    await load();
                    notice(`Discount ${discount.code} ${discount.active ? "deactivated" : "activated"}.`);
                } catch (error) { notice(error.message, true); button.disabled = false; }
            };
        }
    }

    reloadData(load);
}

// Earnings
if (page === "earnings") {
    async function load() {
        let url = "/api/finance/earnings";
        if (state.role === "Provider") url = "/api/providers/me/earnings";

        const data = await api(url);
        const summary = Array.isArray(data) ? data.reduce((sum, row) => {
            for (const key of ["gross_earnings", "net_earnings", "committed_withdrawals", "available_balance"])
                sum[key] = (sum[key] || 0) + Number(row[key] || 0);
            return sum;
        }, {}) : data;

        $("#earningsCards").innerHTML =
            card("Gross earnings", money(value(summary, "gross_earnings", "gross")), "Before commissions") +
            card("Net earnings", money(value(summary, "net_earnings", "net")), "After commissions") +
            card("Committed withdrawals", money(value(summary, "committed_withdrawals", "withdrawn_amount")), "Reserved or paid") +
            card("Available", money(value(summary, "available_balance", "available")), "Current balance");

        const rows = Array.isArray(data) ? data : (data.lines || []);
        showRows("earningsRows", rows, [
            row => escapeHtml(row.provider_id ?? state.id),
            row => escapeHtml(row.payment_id ?? "—"),
            row => money(row.gross_amount ?? row.gross_earnings),
            row => money(row.commission_amount ?? row.platform_commission),
            row => money(row.net_amount ?? row.net_earnings)
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
            row => escapeHtml(value(row, "created_at", "issued_at", "billing_date")),
            row => `<div class="invoice-actions"><button class="btn secondary" data-view-invoice="${Number(row.id)}">View</button>${state.role === "Admin" && row.status === "Unpaid" ? `<button class="btn secondary" data-cancel-invoice="${Number(row.id)}">Cancel invoice</button>` : ""}</div>`
        ]);
    }

    const dialog = document.getElementById("invoiceDetailsDialog");
    const details = document.getElementById("invoiceDetailsContent");
    document.getElementById("closeInvoiceDetails").onclick = () => dialog.close();
    document.getElementById("dismissInvoiceDetails").onclick = () => dialog.close();
    document.getElementById("invoiceRows").addEventListener("click", async event => {
        const view = event.target.closest("[data-view-invoice]");
        const cancel = event.target.closest("[data-cancel-invoice]");
        if (view) {
            try {
                const id = Number(view.dataset.viewInvoice);
                details.textContent = "Loading invoice...";
                dialog.showModal();
                const invoice = await api(state.role === "Customer" ? `/api/customers/me/invoices/${id}` : `/api/billing/invoices/${id}`);
                details.innerHTML = `<p><strong>${escapeHtml(invoice.invoice_number)}</strong> · ${status(invoice.status)}</p>
                    <p>Customer: ${escapeHtml(invoice.customer_id)}</p>
                    <p>Period: ${escapeHtml(invoice.period_start)} to ${escapeHtml(invoice.period_end)}</p>
                    <p>Subtotal: ${money(invoice.subtotal)} · Discount: ${money(invoice.discount_amount)} · Total: <strong>${money(invoice.total)}</strong></p>
                    <div class="invoice-details-table"><table><thead><tr><th>Resource</th><th>Class</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${(invoice.items || []).map(item => `<tr><td>${escapeHtml(item.resource_type)}</td><td>${escapeHtml(item.cloud_class)}</td><td>${escapeHtml(item.quantity)}</td><td>${money(item.unit_price)}</td><td>${money(item.line_total)}</td></tr>`).join("")}</tbody></table></div>`;
            } catch (error) { details.textContent = error.message; }
        }
        if (cancel && state.role === "Admin") {
            const id = Number(cancel.dataset.cancelInvoice);
            if (!window.confirm(`Cancel invoice #${id}? This keeps the invoice in history and prevents payment.`)) return;
            cancel.disabled = true;
            try {
                await api(`/api/billing/invoices/${id}/cancel`, "PATCH");
                notice(`Invoice #${id} cancelled.`);
                await load();
            } catch (error) { notice(error.message, true); cancel.disabled = false; }
        }
    });
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
                card("Total revenue", money(totals.revenue.platform_commission), "Platform revenue", "↗") +
                card("Payments", money(totals.payments.recorded_total), "Simulated payment volume", "↔") +
                card("Refunds", money(totals.refunds.total), "Refunded amount", "↶") +
                card("Provider earnings", money(totals.earnings.provider_net), "Provider allocations", "◫");

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
                if (invoice.status === "Unpaid")
                    outstanding += Number(invoice.total_amount || invoice.total || 0);
            }

            html =
                card("My invoices", invoices.length, "Billing history", "▤") +
                card("My payments", payments.length, "Simulated transactions", "↔") +
                card("Refund requests", refunds.length, "Submitted requests", "↶") +
                card("Outstanding", money(outstanding), "Based on invoice status", "◇");

            showDetails("Recent invoices", ["Invoice", "Total", "Status"], "recentInvoices");

            showRows("recentInvoices", invoices.slice(0, 8), [
                textCell("id"), moneyCell("total"), statusCell("status")
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

    ($("#overviewDetails") || $("#priceHistory")).innerHTML = `
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

// Payments: admins monitor; customers initiate their own simulated payments.
if (page === "payments") {
    let paymentRows = [];
    const detailDialog = $("#paymentDetailsDialog");
    const closeDetail = () => detailDialog.close();
    $("#closePaymentDetails").onclick = closeDetail;
    $("#dismissPaymentDetails").onclick = closeDetail;
    const dateValue = date => String(date || "").slice(0, 10);

    function renderPayments() {
        const search = $("#paymentSearch").value.trim().toLowerCase();
        const selectedStatus = $("#paymentStatus").value;
        const from = $("#paymentFrom").value;
        const to = $("#paymentTo").value;
        const filtered = paymentRows.filter(row => {
            const keywords = [row.id, row.payment_reference, row.invoice_id, row.invoice_number, row.customer_id].join(" ").toLowerCase();
            return (!search || keywords.includes(search)) && (!selectedStatus || row.status === selectedStatus) &&
                (!from || dateValue(row.created_at) >= from) && (!to || dateValue(row.created_at) <= to);
        });
        $("#paymentFilterCount").textContent = `${filtered.length} of ${paymentRows.length} transactions`;
        showRows("paymentRows", filtered, [
            textCell("id"), textCell("payment_reference"), row => escapeHtml(row.invoice_number || row.invoice_id),
            row => state.role === "Admin" ? escapeHtml(row.customer_id) : "You",
            row => money(row.amount), row => money(row.refunded_amount), statusCell("status"),
            row => escapeHtml(row.created_at),
            row => `<button type="button" class="inlinebtn" data-payment-detail="${Number(row.id)}">View</button>`
        ], "No payments match your filters.");
        for (const btn of document.querySelectorAll("[data-payment-detail]")) {
            btn.onclick = () => {
                const row = paymentRows.find(entry => String(entry.id) === btn.dataset.paymentDetail);
                if (!row) return;
                const items = [
                    ["Payment ID", row.id], ["Reference", row.payment_reference],
                    ["Invoice", row.invoice_number || row.invoice_id],
                    ["Customer ID", state.role === "Admin" ? row.customer_id : "Your account"],
                    ["Amount", money(row.amount)], ["Refunded", money(row.refunded_amount)],
                    ["Status", row.status], ["Payment method", row.simulated ? "Simulation (no real charge)" : "Not specified"],
                    ["Recorded", row.created_at]
                ];
                $("#paymentDetailsContent").innerHTML = `<dl class="payment-detail-list">${items.map(([key, val]) =>
                    `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(val)}</dd></div>`).join("")}</dl>`;
                detailDialog.showModal();
            };
        }
    }

    for (const id of ["paymentSearch", "paymentStatus", "paymentFrom", "paymentTo"])
        $("#" + id).addEventListener("input", renderPayments);
    $("#clearPaymentFilters").onclick = () => {
        for (const id of ["paymentSearch", "paymentStatus", "paymentFrom", "paymentTo"]) $("#" + id).value = "";
        renderPayments();
    };

    async function load() {
        paymentRows = list(await api(state.role === "Admin" ? "/api/finance/payments" : "/api/customers/me/payments"));
        const total = paymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const refunded = paymentRows.reduce((sum, row) => sum + Number(row.refunded_amount || 0), 0);
        $("#paymentSummary").innerHTML =
            card("Transactions", paymentRows.length, "Recorded payments", "↔") +
            card("Processed volume", money(total), "Simulated successful payments", "✓") +
            card("Refunded amount", money(refunded), "Completed refunds", "↶") +
            card("Net after refunds", money(total - refunded), "Simulated net volume", "◇");
        renderPayments();

        if (state.role === "Customer") {
            $("#unpaidInvoicesSection").hidden = false;
            const invoices = list(await api("/api/customers/me/invoices"))
                .filter(invoice => invoice.status === "Unpaid");
            showRows("unpaidPaymentRows", invoices, [
                row => escapeHtml(row.invoice_number || row.id), row => money(row.total),
                row => escapeHtml(row.created_at),
                row => `<button type="button" class="btn primary small" data-pay-invoice="${Number(row.id)}">Pay (simulate)</button>`
            ], "You have no unpaid invoices.");
            for (const btn of document.querySelectorAll("[data-pay-invoice]")) {
                btn.onclick = async () => {
                    const invoice = invoices.find(item => String(item.id) === btn.dataset.payInvoice);
                    if (!invoice || !confirm(`Simulate payment of ${money(invoice.total)} for invoice ${invoice.invoice_number || invoice.id}? No real money will be charged.`)) return;
                    btn.disabled = true;
                    try {
                        await api("/api/customers/me/payments", "POST", { invoice_id: invoice.id });
                        notice("Simulated payment successful. Invoice marked Paid.");
                        await load();
                    } catch (error) { notice(error.message, true); btn.disabled = false; }
                };
            }
        }
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
                ? `<button class="inlinebtn" data-edit-price="${escapeHtml(row.id)}">Edit</button> ` +
                  `<button class="inlinebtn" data-delete-price="${escapeHtml(row.id)}">Delete</button> ` +
                  `<button class="inlinebtn" data-history="${escapeHtml(row.id)}">History</button>` : "—"
        ]);

        for (const button of document.querySelectorAll("[data-edit-price]")) {
            button.onclick = () => {
                const rule = data.find(item => String(item.id) === button.dataset.editPrice);
                if (!rule) return;
                openForm(`Edit ${rule.resource_type} / ${rule.cloud_class}`, [
                    field("unit_price", "New unit price", "number", { step: "0.01" })
                ], values => api("/api/pricing/" + rule.id, "PUT", values));
                $("#f_unit_price").value = rule.unit_price;
            };
        }
        for (const button of document.querySelectorAll("[data-delete-price]")) {
            button.onclick = async () => {
                const rule = data.find(item => String(item.id) === button.dataset.deletePrice);
                if (!rule || !confirm(`Delete ${rule.resource_type} / ${rule.cloud_class} from active pricing? Its history will be kept.`)) return;
                try {
                    await api("/api/pricing/" + rule.id, "DELETE");
                    await load();
                    notice("Rule removed from active pricing. Its history was preserved.");
                } catch (error) { showError(error); }
            };
        }
        for (const button of document.querySelectorAll("[data-history]")) {
            button.onclick = async function() {
                try {
                    const id = button.dataset.history;
                    const history = list(await api("/api/pricing/" + id + "/history"));

                    showDetails("Pricing history for rule #" + escapeHtml(id),
                        ["Price", "Changed", "ID"], "historyRows");

                    showRows("historyRows", history, [
                        moneyCell("new_price"), textCell("changed_at"), textCell("id")
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
                    field("admin_note", "Admin note", "textarea", { required: false })
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

// Withdrawals: providers request; admins review and record simulated payouts.
if (page === "withdrawals") {
    async function load() {
        const provider = state.role === "Provider";
        if (provider) {
            enableAction("Request withdrawal", "withdrawal");
            const summary = await api("/api/providers/me/earnings");
            $("#withdrawalBalanceCards").hidden = false;
            $("#withdrawalBalanceCards").innerHTML =
                card("Net earnings", money(summary.net_earnings), "After commissions") +
                card("Reserved / paid", money(summary.committed_withdrawals), "Includes pending and completed withdrawals") +
                card("Available balance", money(summary.available_balance), "Maximum you can request now");
        } else {
            $("#headingAction").innerHTML = "";
            $("#withdrawalBalanceCards").hidden = true;
        }

        const rows = list(await api(provider ? "/api/providers/me/withdrawals" : "/api/finance/withdrawals"));
        const transitions = { Requested: ["Approved", "Rejected"], Approved: ["Paid", "Rejected"] };
        showRows("withdrawalRows", rows, [
            textCell("id"), textCell("provider_id"),
            moneyCell("amount"), statusCell("status"),
            row => !provider && transitions[row.status]
                ? `<button class="inlinebtn" data-withdraw="${escapeHtml(row.id)}">Review</button>` : "—"
        ]);

        for (const button of document.querySelectorAll("[data-withdraw]")) {
            button.onclick = () => {
                const request = rows.find(row => String(row.id) === button.dataset.withdraw);
                if (!request) return;
                openForm(`Review withdrawal #${request.id} (${money(request.amount)})`, [
                    field("status", "Decision", "select", { options: transitions[request.status] })
                ], async data => {
                    const action = data.status === "Paid" ? "Mark this payout as paid (simulated)" : data.status;
                    if (!confirm(`${action} for provider #${request.provider_id}, ${money(request.amount)}?`))
                        throw new Error("Action cancelled. No changes made.");
                    await api(`/api/finance/withdrawals/${request.id}`, "PATCH", data);
                });
            };
        }
    }
    reloadData(load);
}
