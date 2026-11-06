// Shared functions used by the separate EJS pages.
const $ = selector => document.querySelector(selector);
const state = {
    role: localStorage.getItem('cortex_role') || 'Admin',
    id: localStorage.getItem('cortex_id') || '1'
};
// Escape API values before inserting them into HTML.
function escapeHtml(input) {
    return String(input ?? '—').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
}
function value(object, ...keys) {
    for (const key of keys) {
        if (object && object[key] !== undefined && object[key] !== null)
            return object[key];
    }
    return null;
}
function list(data) {
    if (Array.isArray(data))
        return data;
    if (Array.isArray(data?.rows))
        return data.rows;
    if (Array.isArray(data?.data))
        return data.data;
    return [];
}
function money(number) {
    return '$' + Number(number || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
}
function status(label) {
    const text = String(label ?? 'Unknown');
    const cssClass = text.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return `<span class="tag ${cssClass}">${escapeHtml(text)}</span>`;
}
function notice(message, isError = false) {
    const element = $('#notice');
    element.hidden = !message;
    element.className = 'notice' + (isError ? ' error' : '');
    element.textContent = message;
}
async function api(url, method = 'GET', body) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': state.id,
            'x-user-role': state.role
        }
    };
    if (body !== undefined)
        options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    const text = await response.text();
    let result;
    try {
        result = JSON.parse(text);
    }
    catch {
        result = { error: text };
    }
    if (!response.ok)
        throw new Error(result.error || result.message || `HTTP ${response.status}`);
    return result;
}
function showRows(tableId, items, cells, emptyText = 'No records found') {
    const tbody = document.getElementById(tableId);
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="${cells.length}" class="empty">${escapeHtml(emptyText)}</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(item => '<tr>' + cells.map(cell => `<td>${cell(item)}</td>`).join('') + '</tr>').join('');
}
function textCell(key) { return row => escapeHtml(row[key]); }
function moneyCell(key) { return row => money(row[key]); }
function statusCell(key) { return row => status(row[key]); }
function card(label, number, description, icon = '◈') {
    return `<div class="card"><span class="symbol">${icon}</span><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(number)}</div><div class="hint">${escapeHtml(description)}</div></div>`;
}
function actionButton(label, action) {
    return `<button class="btn primary" data-action="${action}">+ ${label}</button>`;
}
function showError(error) {
    notice(error.message + ' — Check MySQL, .env and the role/user ID in Settings.', true);
    document.querySelectorAll('tbody').forEach(tbody => {
        if (tbody.querySelector('.loading'))
            tbody.innerHTML = '<tr><td colspan="10">Unable to load data.</td></tr>';
    });
}
function reloadData(loader) {
    loader().catch(showError);
}
// Show only links belonging to the selected role. Server API routes enforce access.
for (const link of document.querySelectorAll('#nav a')) {
    if (!link.dataset.roles.split(' ').includes(state.role))
        link.hidden = true;
}
const page = document.body.dataset.page;
const allowed = {
    Admin: ['overview', 'pricing', 'invoices', 'payments', 'refunds', 'earnings', 'withdrawals', 'discounts', 'audit', 'settings'],
    Customer: ['overview', 'pricing', 'invoices', 'payments', 'refunds', 'settings'],
    Provider: ['overview', 'pricing', 'earnings', 'withdrawals', 'settings']
};
if (!allowed[state.role].includes(page))
    window.location.replace('/overview');
$('#eyebrow').textContent = state.role.toUpperCase() + ' PORTAL · FINANCIAL OPERATIONS';
$('#reload').onclick = () => window.location.reload();
