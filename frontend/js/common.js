
const $ = selector => document.querySelector(selector);

const state = {
    role: localStorage.getItem("cortex_role") || "Admin",
    id: localStorage.getItem("cortex_id") || "1"
};

// Helpers
function escapeHtml(input) {
    const chars = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(input ?? "—").replace(/[&<>"']/g, char => chars[char]);
}

function value(obj, ...keys) {
    return keys.map(key => obj?.[key]).find(v => v != null) ?? null;
}

function list(data) {
    if (Array.isArray(data)) return data;
    return data?.rows || data?.data || [];
}

function money(number) {
    return "$" + Number(number || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function status(label) {
    const text = String(label ?? "Unknown");
    return `<span class="tag ${text.toLowerCase().replace(/[^a-z0-9_-]/g, "")}">${escapeHtml(text)}</span>`;
}

function notice(message, isError = false) {
    const el = $("#notice");
    el.hidden = !message;
    el.className = "notice" + (isError ? " error" : "");
    el.textContent = message;
}

// API requests
async function api(url, method = "GET", body) {
    const options = {
        method,
        headers: {
            "Content-Type": "application/json",
            "x-user-id": state.id,
            "x-user-role": state.role
        }
    };

    if (body !== undefined) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const text = await response.text();

    let result;
    try {
        result = JSON.parse(text);
    } catch {
        // Express's default 404 is HTML, not a useful message to display in forms.
        result = { error: response.status === 404
            ? `Endpoint not found (${method} ${url}). Restart the updated backend.`
            : `Unexpected server response (HTTP ${response.status}).` };
    }

    if (!response.ok)
        throw new Error(result.error || result.message || `HTTP ${response.status}`);

    return result;
}

// Tables
function showRows(tableId, items, cells, emptyText = "No records found") {
    const tbody = document.getElementById(tableId);

    tbody.innerHTML = items.length
        ? items.map(item => `<tr>${cells.map(cell => `<td>${cell(item)}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${cells.length}" class="empty">${escapeHtml(emptyText)}</td></tr>`;
}

const textCell = key => row => escapeHtml(row[key]);
const moneyCell = key => row => money(row[key]);
const statusCell = key => row => status(row[key]);

function card(label, number, description, icon = "◈") {
    return `<div class="card"><span class="symbol">${icon}</span>
        <div class="label">${escapeHtml(label)}</div>
        <div class="value">${escapeHtml(number)}</div>
        <div class="hint">${escapeHtml(description)}</div></div>`;
}

function actionButton(label, action) {
    return `<button class="btn primary" data-action="${action}">+ ${label}</button>`;
}

// Errors and reload
function showError(error) {
    notice(error.message || "Request failed.", true);

    document.querySelectorAll("tbody .loading").forEach(el => {
        el.closest("tbody").innerHTML = '<tr><td colspan="10">Unable to load data.</td></tr>';
    });
}

function reloadData(loader) {
    loader().catch(showError);
}

// Role navigation
const allowed = {
    Admin: ["overview", "pricing", "invoices", "payments", "refunds", "earnings", "withdrawals", "discounts", "audit", "settings"],
    Customer: ["overview", "pricing", "invoices", "payments", "refunds", "settings"],
    Provider: ["overview", "pricing", "earnings", "withdrawals", "settings"]
};

document.querySelectorAll("#nav a").forEach(link => {
    link.hidden = !link.dataset.roles.split(" ").includes(state.role);
});

if (!allowed[state.role]?.includes(document.body.dataset.page))
    window.location.replace("/overview");

$("#eyebrow").textContent = state.role.toUpperCase() + " PORTAL · FINANCIAL OPERATIONS";
$("#reload").onclick = () => window.location.reload();
