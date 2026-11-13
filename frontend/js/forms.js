
const field = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });

function openForm(title, fields, submit) {
    $("#modalTitle").textContent = title;
    const modalError = $("#modalError");
    modalError.hidden = true;
    modalError.textContent = "";

    $("#fields").innerHTML = fields.map(item => {
        const id = `f_${item.key}`;
        const required = item.required === false ? "" : "required";
        const placeholder = escapeHtml(item.placeholder || "");
        let input;

        if (item.type === "select") {
            input = `<select id="${id}" name="${item.key}">
                ${item.options.map(option => `<option>${escapeHtml(option)}</option>`).join("")}
            </select>`;
        } else if (item.type === "textarea") {
            input = `<textarea id="${id}" name="${item.key}" ${required}
                placeholder="${placeholder}"></textarea>`;
        } else {
            input = `<input id="${id}" name="${item.key}" type="${item.type}" ${required}
                ${item.step ? `step="${item.step}"` : ""} ${item.type === "number" ? 'min="0"' : ""} placeholder="${placeholder}">`;
        }

        return `<div class="field"><label for="${id}">${escapeHtml(item.label)}</label>${input}</div>`;
    }).join("");

    $("#dynamicForm").onsubmit = async event => {
        event.preventDefault();

        const data = Object.fromEntries(new FormData(event.target));

        for (const item of fields) {
            if (item.required === false && data[item.key] === "")
                delete data[item.key];
            else if (item.type === "number")
                data[item.key] = Number(data[item.key]);
        }

        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        modalError.hidden = true;
        try {
            await submit(data);
            $("#modal").close();
            window.location.reload();
        } catch (error) {
            modalError.textContent = error.message || "Request failed.";
            modalError.hidden = false;
            modalError.setAttribute("role", "alert");
            modalError.scrollIntoView({ block: "nearest" });
        } finally {
            submitButton.disabled = false;
        }
    };

    $("#modal").showModal();
}

// Invoice resource rows are ordinary form inputs; only the API receives JSON.
function openInvoiceForm() {
    openForm("Generate invoice", [
        field("customer_id", "Customer ID", "number"),
        field("billing_period_start", "Period start", "date"),
        field("billing_period_end", "Period end", "date"),
        field("discount_code", "Discount code (optional)", "text", { required: false })
    ], async data => {
        const resources = [...$("#invoiceResources").querySelectorAll(".invoice-resource")].map(row => ({
            resource_type: row.querySelector(".invoice-resource-type").value,
            cloud_class: row.querySelector(".invoice-cloud-class").value,
            quantity: Number(row.querySelector(".invoice-quantity").value),
            provider_id: Number(row.querySelector(".invoice-provider-id").value)
        }));
        if (!Number.isSafeInteger(data.customer_id) || data.customer_id <= 0)
            throw new Error("Customer ID must be a positive whole number.");
        if (data.billing_period_end <= data.billing_period_start)
            throw new Error("Period end must be after period start.");
        if (!resources.length)
            throw new Error("Add at least one resource.");
        if (resources.some(item => !Number.isSafeInteger(item.provider_id) || item.provider_id <= 0))
            throw new Error("Each resource needs a valid Provider ID for payment allocation.");
        if (resources.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0 ||
            item.quantity > 9999999999.9999 ||
            Math.abs(item.quantity * 10000 - Math.round(item.quantity * 10000)) > 0.00001))
            throw new Error("Resource quantity must be positive and have at most 4 decimal places.");
        const combinations = resources.map(item => `${item.resource_type}|${item.cloud_class}`);
        if (new Set(combinations).size !== combinations.length)
            throw new Error("The same resource type and cloud class cannot be added twice.");
        await api("/api/billing/invoices", "POST", { ...data, resources });
    });

    const section = document.createElement("div");
    section.className = "invoice-resources-section";
    section.innerHTML = `<div class="invoice-resources-title">Resources</div>
        <div id="invoiceResources"></div>
        <button type="button" class="btn secondary" id="addInvoiceResource">+ Add another resource</button>`;
    const discountField = $("#f_discount_code").closest(".field");
    discountField.before(section);

    function addRow() {
        const row = document.createElement("div");
        row.className = "invoice-resource";
        row.innerHTML = `<div class="invoice-resource-head"><strong>Resource</strong>
            <button type="button" class="invoice-remove" aria-label="Remove resource">Remove</button></div>
            <div class="invoice-resource-grid">
                <div class="field"><label>Resource type</label><select class="invoice-resource-type" required>
                    <option>CPU</option><option>RAM</option><option>Storage</option><option>GPU</option>
                </select></div>
                <div class="field"><label>Cloud class</label><select class="invoice-cloud-class" required>
                    <option>Economy</option><option>Business</option><option>Critical</option>
                </select></div>
            </div>
            <div class="field"><label>Provider ID</label><input class="invoice-provider-id" type="number" min="1" step="1" required placeholder="Provider user ID"></div>
            <div class="field"><label>Quantity</label><input class="invoice-quantity" type="number" min="0.0001" max="9999999999.9999" step="0.0001" value="1" required></div>`;
        row.querySelector(".invoice-remove").onclick = () => {
            row.remove();
            updateRows();
        };
        $("#invoiceResources").append(row);
        updateRows();
    }
    function updateRows() {
        $("#invoiceResources").querySelectorAll(".invoice-resource").forEach((row, index) => {
            row.querySelector("strong").textContent = `Resource ${index + 1}`;
        });
    }
    $("#addInvoiceResource").onclick = addRow;
    addRow();
    $("#dynamicForm .modalfoot button[type=submit]").textContent = "Generate invoice";
}

async function openProviderWithdrawalForm() {
    if (state.role !== "Provider") return;
    try {
        const earnings = await api("/api/providers/me/earnings");
        const available = Math.max(0, Math.floor((Number(earnings.available_balance) + 1e-8) * 100) / 100);
        openForm("Request withdrawal", [
            field("amount", "Amount (USD)", "number", { step: "0.01" }),
            field("note", "Note (optional)", "text", { required: false })
        ], async data => {
            if (!Number.isFinite(data.amount) || data.amount <= 0 ||
                Math.round(data.amount * 100) !== data.amount * 100 &&
                Math.abs(data.amount * 100 - Math.round(data.amount * 100)) > 1e-7)
                throw new Error("Enter an amount greater than $0.00 with at most 2 decimal places.");
            if (data.amount > available)
                throw new Error(`Requested ${money(data.amount)} exceeds your available balance of ${money(available)}.`);
            await api("/api/providers/me/withdrawals", "POST", data);
        });
        const amountInput = $("#f_amount");
        amountInput.min = "0.01";
        amountInput.max = available.toFixed(2);
        const balanceBox = document.createElement("div");
        balanceBox.className = "withdraw-balance";
        balanceBox.innerHTML = `<strong>Available balance: ${money(available)}</strong><small>Requested and approved withdrawals are already reserved.</small>`;
        amountInput.closest(".field").before(balanceBox);
        const maxButton = document.createElement("button");
        maxButton.type = "button";
        maxButton.className = "btn secondary";
        maxButton.textContent = "Withdraw maximum";
        maxButton.disabled = available < 0.01;
        maxButton.onclick = () => { amountInput.value = available.toFixed(2); };
        amountInput.closest(".field").append(maxButton);
        const submitButton = $("#dynamicForm button[type=submit]");
        submitButton.textContent = "Request withdrawal";
        submitButton.disabled = available < 0.01;
        if (available < 0.01) {
            const warning = document.createElement("p");
            warning.className = "withdraw-empty";
            warning.textContent = "There is no available balance to withdraw.";
            balanceBox.after(warning);
        }
    } catch (error) {
        notice(error.message || "Could not load your available balance.", true);
    }
}

function runAction(name) {
    const f = field;
    let title, endpoint, fields, transform = data => data;

    switch (name) {
        case "addPrice":
            title = "Add pricing rule";
            endpoint = "/api/pricing";
            fields = [
                f("resource_type", "Resource type", "select", { options: ["CPU", "RAM", "Storage", "GPU"] }),
                f("cloud_class", "Cloud class", "select", { options: ["Economy", "Business", "Critical"] }),
                f("unit_price", "Unit price", "number", { step: "0.01" })
            ];
            break;

        case "invoice":
            openInvoiceForm();
            return;

        case "refund":
            title = "Record simulated refund";
            endpoint = "/api/finance/refunds";
            fields = [
                f("payment_id", "Payment ID", "number"),
                f("amount", "Refund amount", "number", { step: "0.01" }),
                f("reason", "Reason", "text", { required: false })
            ];
            break;

        case "requestRefund":
            title = "Request a refund";
            endpoint = "/api/customers/me/refunds";
            fields = [
                f("payment_id", "Payment ID", "number"),
                f("amount", "Amount (optional)", "number", { step: "0.01", required: false }),
                f("reason", "Reason", "textarea")
            ];
            break;

        case "withdrawal":
            // Providers request payouts from their own account; admins only review.
            openProviderWithdrawalForm();
            return;

        case "discount":
            title = "Create discount";
            endpoint = "/api/discounts";
            fields = [
                f("code", "Code"),
                f("discount_type", "Discount type", "select", { options: ["Percentage", "Fixed"] }),
                f("discount_value", "Value", "number", { step: "0.01" }),
                f("max_uses", "Maximum uses (optional)", "number", { required: false }),
                f("expires_at", "Expiry (optional)", "date", { required: false })
            ];
            break;

        default:
            return;
    }

    openForm(title, fields, data => api(endpoint, "POST", transform(data)));
}

function enableAction(label, name) {
    $("#headingAction").innerHTML = actionButton(label, name);
    $("#headingAction button").onclick = () => runAction(name);
}

$("#closeModal").onclick = $("#cancelModal").onclick = () => $("#modal").close();
