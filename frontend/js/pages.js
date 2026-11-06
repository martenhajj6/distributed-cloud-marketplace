// Page-specific code. Each section runs only on its matching EJS page.
// ===== AUDIT PAGE =====
if (document.body.dataset.page === 'audit') {
    // Audit page: load data and handle page-specific actions.
    // Audit records are accessible through the API documentation by entity ID.
}
// ===== DISCOUNTS PAGE =====
if (document.body.dataset.page === 'discounts') {
    // Discounts page: load data and handle page-specific actions.
    async function load() {
        enableAction('Create discount', 'discount');
        const rows = list(await api('/api/discounts'));
        showRows('discountRows', rows, [textCell('id'), textCell('code'), textCell('discount_type'), textCell('discount_value'), textCell('max_uses'), textCell('expires_at'), textCell('active')]);
    }
    reloadData(load);
}
// ===== EARNINGS PAGE =====
if (document.body.dataset.page === 'earnings') {
    // Earnings page: load data and handle page-specific actions.
    async function load() {
        const url = state.role === 'Provider' ? '/api/providers/me/earnings' : '/api/finance/earnings';
        const data = await api(url);
        $('#earningsCards').innerHTML = card('Gross earnings', money(value(data, 'gross_earnings', 'gross')), 'Before commissions') + card('Net earnings', money(value(data, 'net_earnings', 'net')), 'After commissions') + card('Withdrawn', money(value(data, 'withdrawn_amount', 'withdrawn')), 'Completed withdrawals') + card('Available', money(value(data, 'available_balance', 'available')), 'Current balance');
        const rows = list(data.lines || data);
        showRows('earningsRows', rows, [textCell('provider_id'), textCell('payment_id'), moneyCell('gross_amount'), moneyCell('commission_amount'), moneyCell('net_amount')]);
    }
    reloadData(load);
}
// ===== INVOICES PAGE =====
if (document.body.dataset.page === 'invoices') {
    // Invoices page: load data and handle page-specific actions.
    async function load() {
        if (state.role === 'Admin')
            enableAction('Create invoice', 'invoice');
        const url = state.role === 'Customer' ? '/api/customers/me/invoices' : '/api/billing/invoices';
        const rows = list(await api(url));
        showRows('invoiceRows', rows, [textCell('id'), textCell('customer_id'), row => money(value(row, 'total_amount', 'total', 'amount')), statusCell('status'), row => escapeHtml(value(row, 'created_at', 'issued_at', 'billing_date'))]);
    }
    reloadData(load);
}
// ===== OVERVIEW PAGE =====
if (document.body.dataset.page === 'overview') {
    // Overview page: load data and handle page-specific actions.
    async function load() {
        if (state.role === 'Admin') {
            const data = await api('/api/admin/dashboard');
            const totals = data.totals || data;
            const providers = list(data.providers);
            $('#summaryCards').innerHTML = card('Total revenue', money(value(totals, 'total_revenue', 'platform_revenue', 'revenue')), 'Platform revenue', '↗') + card('Payments', money(value(totals, 'total_payments', 'gross_payments', 'payments_total')), 'Simulated payment volume', '↔') + card('Refunds', money(value(totals, 'total_refunds', 'refunds_total')), 'Refunded amount', '↶') + card('Provider earnings', money(value(totals, 'total_provider_earnings', 'provider_earnings')), 'Provider allocations', '◫');
            $('#overviewDetails').innerHTML = `<section class="panel"><div class="panelhead"><div><h3>Provider performance</h3><p>Earnings and withdrawals by provider</p></div></div><div class="tablewrap"><table><thead><tr><th>Provider</th><th>Gross</th><th>Net</th><th>Available</th></tr></thead><tbody id="providerRows"></tbody></table></div></section>`;
            showRows('providerRows', providers, [textCell('provider_id'), moneyCell('gross_earnings'), moneyCell('net_earnings'), moneyCell('available_balance')]);
        }
        else if (state.role === 'Customer') {
            const [invoices, payments, refunds] = await Promise.all([api('/api/customers/me/invoices'), api('/api/customers/me/payments'), api('/api/customers/me/refunds')]);
            const i = list(invoices), p = list(payments), r = list(refunds);
            const outstanding = i.filter(item => String(item.status).toLowerCase() !== 'paid').reduce((sum, item) => sum + Number(item.total_amount || item.total || 0), 0);
            $('#summaryCards').innerHTML = card('My invoices', i.length, 'Billing history', '▤') + card('My payments', p.length, 'Simulated transactions', '↔') + card('Refund requests', r.length, 'Submitted requests', '↶') + card('Outstanding', money(outstanding), 'Based on invoice status', '◇');
            $('#overviewDetails').innerHTML = `<section class="panel"><div class="panelhead"><div><h3>Recent invoices</h3></div></div><div class="tablewrap"><table><thead><tr><th>Invoice</th><th>Total</th><th>Status</th></tr></thead><tbody id="recentInvoices"></tbody></table></div></section>`;
            showRows('recentInvoices', i.slice(0, 8), [textCell('id'), moneyCell('total_amount'), statusCell('status')]);
        }
        else {
            const [earnings, withdrawals] = await Promise.all([api('/api/providers/me/earnings'), api('/api/providers/me/withdrawals')]);
            $('#summaryCards').innerHTML = card('Gross earnings', money(value(earnings, 'gross_earnings', 'gross')), 'Provider gross amount', '↗') + card('Net earnings', money(value(earnings, 'net_earnings', 'net')), 'After commissions', '◫') + card('Available balance', money(value(earnings, 'available_balance', 'available')), 'Eligible for withdrawal', '◇') + card('Withdrawals', list(withdrawals).length, 'Withdrawal requests', '⇧');
            $('#overviewDetails').innerHTML = `<section class="panel"><div class="panelhead"><div><h3>Recent withdrawals</h3></div></div><div class="tablewrap"><table><thead><tr><th>Request</th><th>Amount</th><th>Status</th></tr></thead><tbody id="recentWithdrawals"></tbody></table></div></section>`;
            showRows('recentWithdrawals', list(withdrawals), [textCell('id'), moneyCell('amount'), statusCell('status')]);
        }
    }
    reloadData(load);
}
// ===== PAYMENTS PAGE =====
if (document.body.dataset.page === 'payments') {
    // Payments page: load data and handle page-specific actions.
    async function load() {
        if (state.role === 'Admin')
            enableAction('Record payment', 'payment');
        const url = state.role === 'Customer' ? '/api/customers/me/payments' : '/api/finance/payments';
        const rows = list(await api(url));
        showRows('paymentRows', rows, [textCell('id'), textCell('invoice_id'), row => money(value(row, 'amount', 'gross_amount', 'total_amount')), statusCell('status'), textCell('created_at')]);
    }
    reloadData(load);
}
// ===== PRICING PAGE =====
if (document.body.dataset.page === 'pricing') {
    // Pricing page: load data and handle page-specific actions.
    async function load() {
        if (state.role === 'Admin')
            enableAction('Add pricing rule', 'addPrice');
        const rows = list(await api('/api/pricing'));
        showRows('pricingRows', rows, [textCell('id'), textCell('resource_type'), textCell('cloud_class'), row => money(value(row, 'unit_price', 'price', 'price_per_hour')), row => state.role === 'Admin' ? `<button class="inlinebtn" data-history="${escapeHtml(row.id)}">History</button>` : '—']);
        document.querySelectorAll('[data-history]').forEach(button => button.onclick = async () => {
            try {
                const id = button.dataset.history;
                const history = list(await api('/api/pricing/' + id + '/history'));
                $('#priceHistory').innerHTML = `<section class="panel"><div class="panelhead"><div><h3>Pricing history for rule #${escapeHtml(id)}</h3></div></div><div class="tablewrap"><table><thead><tr><th>Price</th><th>Changed</th><th>ID</th></tr></thead><tbody id="historyRows"></tbody></table></div></section>`;
                showRows('historyRows', history, [moneyCell('unit_price'), textCell('changed_at'), textCell('id')]);
            }
            catch (error) {
                showError(error);
            }
        });
    }
    reloadData(load);
}
// ===== REFUNDS PAGE =====
if (document.body.dataset.page === 'refunds') {
    // Refunds page: load data and handle page-specific actions.
    async function load() {
        enableAction(state.role === 'Customer' ? 'Request refund' : 'Record refund', state.role === 'Customer' ? 'requestRefund' : 'refund');
        const url = state.role === 'Customer' ? '/api/customers/me/refunds' : '/api/admin/refunds';
        const rows = list(await api(url));
        showRows('refundRows', rows, [textCell('id'), textCell('payment_id'), moneyCell('amount'), statusCell('status'), row => state.role === 'Admin' && String(row.status).toLowerCase() === 'pending' ? `<button class="inlinebtn" data-review="${escapeHtml(row.id)}">Review</button>` : '—']);
        document.querySelectorAll('[data-review]').forEach(button => button.onclick = () => openForm('Review refund #' + button.dataset.review, [field('status', 'Decision', 'select', { options: ['Approved', 'Rejected'] }), field('adminNote', 'Admin note', 'textarea', { required: false })], data => api('/api/admin/refunds/' + button.dataset.review, 'PATCH', data)));
    }
    reloadData(load);
}
// ===== SETTINGS PAGE =====
if (document.body.dataset.page === 'settings') {
    // Settings page: load data and handle page-specific actions.
    $('#role').value = state.role;
    $('#userId').value = state.id;
    $('#settingsForm').onsubmit = event => {
        event.preventDefault();
        const data = new FormData(event.target);
        localStorage.setItem('cortex_role', data.get('role'));
        localStorage.setItem('cortex_id', data.get('id'));
        window.location.href = '/overview';
    };
}
// ===== WITHDRAWALS PAGE =====
if (document.body.dataset.page === 'withdrawals') {
    // Withdrawals page: load data and handle page-specific actions.
    async function load() {
        enableAction('Request withdrawal', 'withdrawal');
        const url = state.role === 'Provider' ? '/api/providers/me/withdrawals' : '/api/finance/withdrawals';
        const rows = list(await api(url));
        showRows('withdrawalRows', rows, [textCell('id'), textCell('provider_id'), moneyCell('amount'), statusCell('status'), row => state.role === 'Admin' ? `<button class="inlinebtn" data-withdraw="${escapeHtml(row.id)}">Update</button>` : '—']);
        document.querySelectorAll('[data-withdraw]').forEach(button => button.onclick = () => openForm('Update withdrawal #' + button.dataset.withdraw, [field('status', 'New status', 'select', { options: ['Approved', 'Rejected', 'Paid'] })], data => api('/api/finance/withdrawals/' + button.dataset.withdraw, 'PATCH', data)));
    }
    reloadData(load);
}
