
const field = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });

function openForm(title, fields, submit) {
    $("#modalTitle").textContent = title;

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
                ${item.step ? `step="${item.step}"` : ""} placeholder="${placeholder}">`;
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

        try {
            await submit(data);
            $("#modal").close();
            window.location.reload();
        } catch (error) {
            notice(error.message, true);
        }
    };

    $("#modal").showModal();
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
            title = "Generate invoice";
            endpoint = "/api/billing/invoices";
            fields = [
                f("customer_id", "Customer ID", "number"),
                f("billing_period_start", "Period start", "date"),
                f("billing_period_end", "Period end", "date"),
                f("resources", "Resources (JSON)", "textarea", {
                    placeholder: '[{"resource_type":"CPU","cloud_class":"Economy","quantity":2}]'
                }),
                f("discount_code", "Discount code (optional)", "text", { required: false })
            ];
            transform = data => ({ ...data, resources: JSON.parse(data.resources) });
            break;

        case "payment":
            title = "Record simulated payment";
            endpoint = "/api/finance/payments";
            fields = [
                f("invoice_id", "Invoice ID", "number"),
                f("provider_allocations", "Provider allocations (JSON; optional for usage invoice)", "textarea", {
                    required: false,
                    placeholder: '[{"provider_id":1,"gross_amount":100}]'
                })
            ];
            transform = data => {
                if (data.provider_allocations)
                    data.provider_allocations = JSON.parse(data.provider_allocations);
                return data;
            };
            break;

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
            title = "Request withdrawal";
            endpoint = state.role === "Provider" ? "/api/providers/me/withdrawals" : "/api/finance/withdrawals";
            fields = [
                ...(state.role === "Admin" ? [f("provider_id", "Provider ID", "number")] : []),
                f("amount", "Amount", "number", { step: "0.01" }),
                f("note", "Note", "text", { required: false })
            ];
            break;

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
