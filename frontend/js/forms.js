// Shared modal form used for payments, invoices, refunds and other actions.
function field(key, label, type = 'text', extra = {}) {
    return { key, label, type, ...extra };
}
function openForm(title, fields, submit) {
    $('#modalTitle').textContent = title;
    $('#fields').innerHTML = fields.map(item => {
        const label = `<label for="f_${item.key}">${escapeHtml(item.label)}</label>`;
        let input;
        if (item.type === 'select') {
            input = `<select id="f_${item.key}" name="${item.key}">${item.options.map(option => `<option>${escapeHtml(option)}</option>`).join('')}</select>`;
        }
        else if (item.type === 'textarea') {
            input = `<textarea id="f_${item.key}" name="${item.key}" ${item.required === false ? '' : 'required'} placeholder="${escapeHtml(item.placeholder || '')}"></textarea>`;
        }
        else {
            input = `<input id="f_${item.key}" name="${item.key}" type="${item.type}" ${item.required === false ? '' : 'required'} ${item.step ? `step="${item.step}"` : ''} placeholder="${escapeHtml(item.placeholder || '')}">`;
        }
        return `<div class="field">${label}${input}</div>`;
    }).join('');
    $('#dynamicForm').onsubmit = async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.target));
        for (const item of fields) {
            if (item.required === false && data[item.key] === '')
                delete data[item.key];
            else if (item.type === 'number')
                data[item.key] = Number(data[item.key]);
        }
        try {
            await submit(data);
            $('#modal').close();
            window.location.reload();
        }
        catch (error) {
            // Keep the form open so the user can correct mistakes.
            notice(error.message, true);
        }
    };
    $('#modal').showModal();
}
function runAction(name) {
    let title, endpoint, fields, transform = data => data;
    switch (name) {
        case 'addPrice':
            title = 'Add pricing rule';
            endpoint = '/api/pricing';
            fields = [field('resource_type', 'Resource type', 'select', { options: ['CPU', 'RAM', 'Storage', 'GPU'] }), field('cloud_class', 'Cloud class', 'select', { options: ['Economy', 'Business', 'Critical'] }), field('unit_price', 'Unit price', 'number', { step: '0.0001' })];
            break;
        case 'invoice':
            title = 'Generate invoice';
            endpoint = '/api/billing/invoices';
            fields = [field('customer_id', 'Customer ID', 'number'), field('billing_period_start', 'Period start', 'date'), field('billing_period_end', 'Period end', 'date'), field('resources', 'Resources (JSON)', 'textarea', { placeholder: '[{"resource_type":"CPU","cloud_class":"Economy","quantity":2}]' }), field('discount_code', 'Discount code (optional)', 'text', { required: false })];
            transform = data => ({ ...data, resources: JSON.parse(data.resources) });
            break;
        case 'payment':
            title = 'Record simulated payment';
            endpoint = '/api/finance/payments';
            fields = [field('invoice_id', 'Invoice ID', 'number'), field('provider_allocations', 'Provider allocations (JSON; optional for usage invoice)', 'textarea', { required: false, placeholder: '[{"provider_id":1,"gross_amount":100}]' })];
            transform = data => { if (data.provider_allocations)
                data.provider_allocations = JSON.parse(data.provider_allocations); return data; };
            break;
        case 'refund':
            title = 'Record simulated refund';
            endpoint = '/api/finance/refunds';
            fields = [field('payment_id', 'Payment ID', 'number'), field('amount', 'Refund amount', 'number', { step: '0.01' }), field('reason', 'Reason', 'text', { required: false })];
            break;
        case 'requestRefund':
            title = 'Request a refund';
            endpoint = '/api/customers/me/refunds';
            fields = [field('payment_id', 'Payment ID', 'number'), field('amount', 'Amount (optional)', 'number', { step: '0.01', required: false }), field('reason', 'Reason', 'textarea')];
            break;
        case 'withdrawal':
            title = 'Request withdrawal';
            endpoint = state.role === 'Provider' ? '/api/providers/me/withdrawals' : '/api/finance/withdrawals';
            fields = [...(state.role === 'Admin' ? [field('provider_id', 'Provider ID', 'number')] : []), field('amount', 'Amount', 'number', { step: '0.01' }), field('note', 'Note', 'text', { required: false })];
            break;
        case 'discount':
            title = 'Create discount';
            endpoint = '/api/discounts';
            fields = [field('code', 'Code'), field('discount_type', 'Discount type', 'select', { options: ['Percentage', 'Fixed'] }), field('discount_value', 'Value', 'number', { step: '0.01' }), field('max_uses', 'Maximum uses (optional)', 'number', { required: false }), field('expires_at', 'Expiry (optional)', 'date', { required: false })];
            break;
        default: return;
    }
    openForm(title, fields, data => api(endpoint, 'POST', transform(data)));
}
function enableAction(label, name) {
    $('#headingAction').innerHTML = actionButton(label, name);
    $('#headingAction button').onclick = () => runAction(name);
}
$('#closeModal').onclick = () => $('#modal').close();
$('#cancelModal').onclick = () => $('#modal').close();
