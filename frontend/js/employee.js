/* Employee page - talks to the backend (Supabase database) instead of localStorage. */
const TOKEN_KEY = "employeeToken";
const STATUSES = [
    { value: "Pending",   cls: "pending" },
    { value: "Confirmed", cls: "washing" },
    { value: "Completed", cls: "ready" },
    { value: "Cancelled", cls: "claimed" }
];

const els = {
    table: document.getElementById("customerTable"),
    search: document.getElementById("searchInput"),
    service: document.getElementById("serviceFilter"),
    sort: document.getElementById("sortBy"),
    chips: document.getElementById("statusChips"),
    count: document.getElementById("resultCount"),
    pagination: document.getElementById("orderPagination"),
    pageSize: document.getElementById("pageSize"),
    pageInfo: document.getElementById("pageInfo"),
    previousPage: document.getElementById("previousPage"),
    nextPage: document.getElementById("nextPage"),
    clear: document.getElementById("clearFilters"),
    overlay: document.getElementById("orderForm"),
    form: document.getElementById("newOrderForm"),
    error: document.getElementById("formError"),
    formService: document.getElementById("service"),
    shopPanel: document.getElementById("shopSettingsPanel"),
    shopForm: document.getElementById("shopSettingsForm"),
    shopError: document.getElementById("shopSettingsError")
};

let orders = [];
let services = [];
let shopSettings = null;
let statusFilter = "";
let assessmentOrderId = null;
let currentPage = 1;

/* ---------- api ---------- */
async function api(path, opts = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { window.location.href = "index.html"; throw new Error("Please log in again."); }
    let res;
    try {
        res = await fetch(window.fnkApiUrl(path), {
            ...opts,
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(opts.headers || {}) }
        });
    } catch {
        throw new Error("Cannot reach the server. Make sure the backend is running.");
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        alert(data.error || "Please log in again.");
        window.location.href = "index.html";
        throw new Error(data.error || "Unauthorized");
    }
    if (!res.ok) {
        throw new Error(res.status === 404
            ? "Employee API endpoint not found. Restart the backend or check its deployment."
            : data.error || "Request failed.");
    }
    return data;
}

async function loadOrders() {
    try {
        orders = (await api("/api/employee/orders")).orders;
    } catch (e) {
        els.count.textContent = e.message;
    }
    render();
}

async function loadServices() {
    try {
        services = (await api("/api/employee/services")).services;
    } catch (e) {
        els.count.textContent = e.message;
        return;
    }
    els.formService.innerHTML = `<option value="">Select service</option>` +
        services.map(s => `<option value="${esc(s.name)}" data-id="${s.id}">${esc(s.name)} (${peso(s.price)} ${esc(s.unit)})</option>`).join("");
    els.service.innerHTML = `<option value="">All services</option>` +
        services.map(s => `<option>${esc(s.name)}</option>`).join("");
}

async function loadShopSettings() {
    shopSettings = await api("/api/shop/settings");
    renderShopSettings();
}

function renderShopSettings() {
    if (!shopSettings) return;
    document.getElementById("shopPhoneInput").value = shopSettings.contact_phone || "";
    document.getElementById("shopEmailInput").value = shopSettings.contact_email || "";
    document.getElementById("shopAddressInput").value = shopSettings.address || "";
    document.getElementById("shopFaqInput").value = (shopSettings.faqs || [])
        .map(item => `${item.question} | ${item.answer}`).join("\n");
    const status = shopSettings.status;
    document.getElementById("shopSettingsStatus").textContent = status.is_open ? "Open now" : "Closed now";
    document.getElementById("shopSettingsStatusDetail").textContent = status.detail;
    document.getElementById("shopOpenNow").disabled = status.emergency_status === "open";
    document.getElementById("shopCloseNow").disabled = status.emergency_status === "closed";
}

function applyShopSettings(data) {
    shopSettings = {
        ...data.settings,
        status: data.status
    };
    renderShopSettings();
}

async function setEmergencyStatus(status) {
    try {
        const result = await api("/api/employee/shop/settings", {
            method: "PATCH",
            body: JSON.stringify({ emergency_status: status })
        });
        applyShopSettings(result);
        els.shopError.hidden = true;
    } catch (err) {
        els.shopError.textContent = err.message;
        els.shopError.hidden = false;
    }
}

function formatScheduled(o) {
    if (!o.scheduled_at) return "Walk-in";
    const date = new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(new Date(o.scheduled_at));
    return `${date} · ${o.fulfillment_type || "Scheduled"}`;
}

/* ---------- helpers ---------- */
function esc(v) {
    const d = document.createElement("div");
    d.textContent = v == null ? "" : v;
    return d.innerHTML;
}
const peso = n => "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusClass = s => (STATUSES.find(x => x.value === s) || STATUSES[0]).cls;
const isValidPhone = value => {
    const phone = String(value || "").trim();
    const digits = phone.replace(/\D/g, "");
    return /^\+?[0-9\s()-]+$/.test(phone) && digits.length >= 10 && digits.length <= 13;
};

/* ---------- filtering ---------- */
function getFiltered() {
    const q = els.search.value.trim().toLowerCase();
    const list = orders.filter(o =>
        (!statusFilter || o.status === statusFilter) &&
        (!els.service.value || o.service === els.service.value) &&
        (!q || [o.order_code, o.customer_name, o.contact, String(o.basket_no)].some(f => String(f || "").toLowerCase().includes(q)))
    );
    const t = o => new Date(o.pending_at).getTime();
    const sorters = {
        newest: (a, b) => t(b) - t(a),
        oldest: (a, b) => t(a) - t(b),
        name: (a, b) => a.customer_name.localeCompare(b.customer_name),
        weight: (a, b) => b.weight_kg - a.weight_kg,
        price: (a, b) => b.price - a.price
    };
    return list.sort(sorters[els.sort.value]);
}

function renderChips() {
    const tabs = [{ value: "", label: "All" }, ...STATUSES.map(s => ({ value: s.value, label: s.value }))];
    els.chips.innerHTML = tabs.map(t => {
        const n = t.value ? orders.filter(o => o.status === t.value).length : orders.length;
        return `<button type="button" class="chip" data-status="${t.value}" aria-pressed="${statusFilter === t.value}">
            ${t.label}<span class="count">${n}</span></button>`;
    }).join("");
}

function render() {
    const filteredRows = getFiltered();
    const pageSize = Number(els.pageSize.value);
    const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    currentPage = Math.min(currentPage, pageCount);
    const start = (currentPage - 1) * pageSize;
    const rows = filteredRows.slice(start, start + pageSize);
    renderChips();
    els.pagination.hidden = filteredRows.length <= pageSize;
    els.pageInfo.textContent = filteredRows.length
        ? `Showing ${start + 1}–${Math.min(start + pageSize, filteredRows.length)} of ${filteredRows.length} · Page ${currentPage} of ${pageCount}`
        : "Showing 0 orders";
    els.previousPage.disabled = currentPage === 1;
    els.nextPage.disabled = currentPage === pageCount;

    if (!rows.length) {
        const msg = orders.length
            ? "No orders match your filters. Try clearing them."
            : "No records yet. Add a new order to get started.";
        els.table.innerHTML = `<tr><td colspan="10" class="empty-message">${esc(msg)}</td></tr>`;
    } else {
        els.table.innerHTML = rows.map(o => {
            const open = o.status === "Pending" || o.status === "Confirmed";
            return `
            <tr>
                <td class="id">${esc(o.order_code)}</td>
                <td>${esc(o.customer_name)}</td>
                <td>${esc(o.contact)}</td>
                <td>${esc(o.service || "To be assessed")}</td>
                <td class="num">${o.service_id ? `${o.weight_kg} ${o.unit === "per piece" ? "pcs" : "kg"}` : "Pending weigh-in"}</td>
                <td class="num">${o.service_id ? peso(o.price) : "Pending"}</td>
                <td class="num">${o.basket_no}</td>
                <td>${esc(formatScheduled(o))}${o.notes ? `<br><small>${esc(o.notes)}</small>` : ""}</td>
                <td>
                    <select class="status-select status-${statusClass(o.status)}" data-id="${o.id}" ${open ? "" : "disabled"} aria-label="Status for ${esc(o.order_code)}">
                        ${STATUSES.map(s => `<option ${s.value === o.status ? "selected" : ""}>${s.value}</option>`).join("")}
                    </select>
                </td>
                <td>${open ? `${o.scheduled_at && !o.service_id ? `<button type="button" class="assess-btn" data-assess="${o.id}">Assess</button>` : ""} <button type="button" class="delete-btn" data-cancel="${o.id}">Cancel</button>` : ""}</td>
            </tr>`;
        }).join("");
    }

    els.count.textContent = filteredRows.length
        ? `${filteredRows.length} matching order${filteredRows.length === 1 ? "" : "s"}`
        : "View and manage laundry transactions.";
}

/* ---------- events ---------- */
function resetPageAndRender() {
    currentPage = 1;
    render();
}

els.search.addEventListener("input", resetPageAndRender);
els.service.addEventListener("change", resetPageAndRender);
els.sort.addEventListener("change", resetPageAndRender);
els.pageSize.addEventListener("change", resetPageAndRender);
els.previousPage.addEventListener("click", () => {
    currentPage = Math.max(1, currentPage - 1);
    render();
});
els.nextPage.addEventListener("click", () => {
    currentPage += 1;
    render();
});

els.chips.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    statusFilter = chip.dataset.status;
    resetPageAndRender();
});

els.clear.addEventListener("click", () => {
    els.search.value = "";
    els.service.value = "";
    els.sort.value = "newest";
    statusFilter = "";
    resetPageAndRender();
});

document.getElementById("employeeLogout").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("employeeName");
    window.location.replace("index.html");
});

const ACTIONS = {
    Confirmed: id => api(`/api/employee/orders/${id}/confirm`, { method: "PATCH" }),
    Completed: id => api(`/api/employee/orders/${id}/complete`, { method: "PATCH" }),
    Cancelled: id => api(`/api/employee/orders/${id}`, { method: "DELETE" })
};

async function changeStatus(id, status) {
    try {
        if (!ACTIONS[status]) throw new Error("Orders can only move forward: Pending, Confirmed, Completed (or Cancelled).");
        if (status === "Cancelled" && !confirm("Cancel this order? This can't be undone.")) return loadOrders();
        await ACTIONS[status](id);
    } catch (err) {
        alert(err.message);
    }
    loadOrders();
}

els.table.addEventListener("change", e => {
    const sel = e.target.closest(".status-select");
    if (sel) changeStatus(sel.dataset.id, sel.value);
});

els.table.addEventListener("click", e => {
    const assess = e.target.closest("[data-assess]");
    if (assess) openAssessmentForm(assess.dataset.assess);
    const btn = e.target.closest("[data-cancel]");
    if (btn) changeStatus(btn.dataset.cancel, "Cancelled");
});

document.getElementById("shopSettingsOpen").addEventListener("click", async () => {
    els.shopError.hidden = true;
    els.shopPanel.hidden = false;
    try {
        await loadShopSettings();
    } catch (err) {
        els.shopError.textContent = err.message;
        els.shopError.hidden = false;
    }
});

function closeShopSettings() {
    els.shopPanel.hidden = true;
}

document.getElementById("shopSettingsClose").addEventListener("click", closeShopSettings);
document.getElementById("shopSettingsCancel").addEventListener("click", closeShopSettings);
els.shopPanel.addEventListener("click", e => {
    if (e.target === els.shopPanel) closeShopSettings();
});
document.getElementById("shopOpenNow").addEventListener("click", () => setEmergencyStatus("open"));
document.getElementById("shopCloseNow").addEventListener("click", () => setEmergencyStatus("closed"));
document.getElementById("shopNormalHours").addEventListener("click", () => setEmergencyStatus("normal"));

els.shopForm.addEventListener("submit", async e => {
    e.preventDefault();
    try {
        const faqs = document.getElementById("shopFaqInput").value.split(/\r?\n/)
            .filter(line => line.trim())
            .map(line => {
                const separator = line.indexOf("|");
                if (separator < 1 || !line.slice(separator + 1).trim()) {
                    throw new Error("Write each FAQ as a question and answer separated by |.");
                }
                return {
                    question: line.slice(0, separator).trim(),
                    answer: line.slice(separator + 1).trim()
                };
            });
        const result = await api("/api/employee/shop/settings", {
            method: "PATCH",
            body: JSON.stringify({
                contact_phone: document.getElementById("shopPhoneInput").value.trim(),
                contact_email: document.getElementById("shopEmailInput").value.trim(),
                address: document.getElementById("shopAddressInput").value.trim(),
                faqs
            })
        });
        applyShopSettings(result);
        els.shopError.hidden = true;
    } catch (err) {
        els.shopError.textContent = err.message;
        els.shopError.hidden = false;
    }
});

/* ---------- form ---------- */
function openForm() {
    assessmentOrderId = null;
    els.form.reset();
    document.getElementById("orderCustomerNameGroup").style.display = "";
    document.getElementById("orderContactGroup").style.display = "";
    document.getElementById("orderBasketGroup").style.display = "";
    document.getElementById("formTitle").textContent = "Add Laundry Order";
    document.querySelector("#orderForm .form-heading p").textContent = "Enter the customer's laundry information.";
    document.querySelector("#newOrderForm .save-btn").textContent = "Save Order";
    els.error.hidden = true;
    els.overlay.hidden = false;
    document.getElementById("customerName").focus();
}
function openAssessmentForm(id) {
    const order = orders.find(item => String(item.id) === String(id));
    if (!order) return;
    assessmentOrderId = order.id;
    els.form.reset();
    document.getElementById("formTitle").textContent = "Assess Scheduled Laundry";
    document.querySelector("#orderForm .form-heading p").textContent = `${order.order_code} · ${order.customer_name}`;
    document.querySelector("#newOrderForm .save-btn").textContent = "Save assessment";
    document.getElementById("orderCustomerNameGroup").style.display = "none";
    document.getElementById("orderContactGroup").style.display = "none";
    document.getElementById("orderBasketGroup").style.display = "none";
    document.getElementById("customerName").value = order.customer_name;
    document.getElementById("contact").value = order.contact;
    document.getElementById("basket").value = order.basket_no;
    els.error.hidden = true;
    els.overlay.hidden = false;
    els.formService.focus();
}
function closeForm() {
    els.overlay.hidden = true;
    els.form.reset();
    assessmentOrderId = null;
    document.getElementById("orderCustomerNameGroup").style.display = "";
    document.getElementById("orderContactGroup").style.display = "";
    document.getElementById("orderBasketGroup").style.display = "";
    document.getElementById("formTitle").textContent = "Add Laundry Order";
    document.querySelector("#orderForm .form-heading p").textContent = "Enter the customer's laundry information.";
    document.querySelector("#newOrderForm .save-btn").textContent = "Save Order";
}
els.overlay.addEventListener("click", e => { if (e.target === els.overlay) closeForm(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !els.overlay.hidden) closeForm(); });

function suggestPrice() {
    const opt = els.formService.selectedOptions[0];
    const svc = opt && services.find(s => String(s.id) === opt.dataset.id);
    const kilo = parseFloat(document.getElementById("kilo").value);
    if (!svc || !(kilo > 0)) return;
    const total = svc.price * (svc.unit === "per piece" ? Math.ceil(kilo) : kilo);
    document.getElementById("price").value = total.toFixed(2);
}
els.formService.addEventListener("change", suggestPrice);
document.getElementById("kilo").addEventListener("input", suggestPrice);
document.getElementById("contact").addEventListener("input", event => {
    event.target.setCustomValidity(isValidPhone(event.target.value)
        ? ""
        : "Enter a phone number with 10 to 13 digits.");
});
els.form.addEventListener("reset", () => document.getElementById("contact").setCustomValidity(""));
els.formService.addEventListener("change", () => {
    const option = els.formService.selectedOptions[0];
    const service = option && services.find(item => String(item.id) === option.dataset.id);
    const input = document.getElementById("kilo");
    const label = document.querySelector('label[for="kilo"]');
    const perPiece = service && service.unit === "per piece";
    label.textContent = perPiece ? "Quantity (pieces)" : "Weight (kg)";
    input.min = perPiece ? "1" : "0.1";
    input.step = perPiece ? "1" : "0.1";
    if (perPiece && Number(input.value) < 1) input.value = "1";
    suggestPrice();
});

els.form.addEventListener("submit", async e => {
    e.preventDefault();
    const opt = els.formService.selectedOptions[0];
    try {
        if (assessmentOrderId) {
            await api(`/api/employee/orders/${assessmentOrderId}/details`, {
                method: "PATCH",
                body: JSON.stringify({
                    service_id: opt ? opt.dataset.id : null,
                    quantity: parseFloat(document.getElementById("kilo").value)
                })
            });
        } else {
            await api("/api/employee/orders", {
                method: "POST",
                body: JSON.stringify({
                customer_name: document.getElementById("customerName").value.trim(),
                contact: document.getElementById("contact").value.trim(),
                service: els.formService.value,
                service_id: opt ? opt.dataset.id : null,
                weight_kg: parseFloat(document.getElementById("kilo").value),
                price: parseFloat(document.getElementById("price").value),
                basket_no: parseInt(document.getElementById("basket").value, 10)
                })
            });
        }
        closeForm();
        loadOrders();
    } catch (err) {
        els.error.textContent = err.message;
        els.error.hidden = false;
    }
});

Promise.all([loadServices(), loadShopSettings()]).then(loadOrders).catch(err => {
    els.count.textContent = err.message;
});
