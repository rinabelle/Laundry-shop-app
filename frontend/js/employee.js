const STORAGE_KEY = "fk_orders";
const STATUSES = [
    { value: "Pending", cls: "pending" },
    { value: "Washing", cls: "washing" },
    { value: "Ready for pickup", cls: "ready" },
    { value: "Claimed", cls: "claimed" }
];

const els = {
    table: document.getElementById("customerTable"),
    search: document.getElementById("searchInput"),
    service: document.getElementById("serviceFilter"),
    sort: document.getElementById("sortBy"),
    chips: document.getElementById("statusChips"),
    count: document.getElementById("resultCount"),
    clear: document.getElementById("clearFilters"),
    overlay: document.getElementById("orderForm"),
    form: document.getElementById("newOrderForm"),
    error: document.getElementById("formError")
};

let orders = load();
let statusFilter = "";

function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
}
function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(orders)); } catch {}
}
function esc(v) {
    const d = document.createElement("div");
    d.textContent = v;
    return d.innerHTML;
}
const peso = n => "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusClass = s => (STATUSES.find(x => x.value === s) || STATUSES[0]).cls;

/* ---------- filtering ---------- */
function getFiltered() {
    const q = els.search.value.trim().toLowerCase();
    const list = orders.filter(o =>
        (!statusFilter || o.status === statusFilter) &&
        (!els.service.value || o.service === els.service.value) &&
        (!q || [o.id, o.name, o.contact, String(o.basket)].some(f => f.toLowerCase().includes(q)))
    );
    const sorters = {
        newest: (a, b) => b.created - a.created,
        oldest: (a, b) => a.created - b.created,
        name: (a, b) => a.name.localeCompare(b.name),
        weight: (a, b) => b.kilo - a.kilo,
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
    const rows = getFiltered();
    renderChips();

    if (!rows.length) {
        const msg = orders.length
            ? "No orders match your filters. Try clearing them."
            : "No records yet. Add a new order to get started.";
        els.table.innerHTML = `<tr><td colspan="9" class="empty-message">${msg}</td></tr>`;
    } else {
        els.table.innerHTML = rows.map(o => `
            <tr>
                <td class="id">${esc(o.id)}</td>
                <td>${esc(o.name)}</td>
                <td>${esc(o.contact)}</td>
                <td>${esc(o.service)}</td>
                <td class="num">${o.kilo}</td>
                <td class="num">${peso(o.price)}</td>
                <td class="num">${o.basket}</td>
                <td>
                    <select class="status-select status-${statusClass(o.status)}" data-id="${o.id}" aria-label="Status for ${esc(o.id)}">
                        ${STATUSES.map(s => `<option ${s.value === o.status ? "selected" : ""}>${s.value}</option>`).join("")}
                    </select>
                </td>
                <td><button type="button" class="delete-btn" data-delete="${o.id}">Delete</button></td>
            </tr>`).join("");
    }

    els.count.textContent = orders.length
        ? `Showing ${rows.length} of ${orders.length} order${orders.length === 1 ? "" : "s"}`
        : "View and manage laundry transactions.";
}

/* ---------- events ---------- */
els.search.addEventListener("input", render);
els.service.addEventListener("change", render);
els.sort.addEventListener("change", render);

els.chips.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    statusFilter = chip.dataset.status;
    render();
});

els.clear.addEventListener("click", () => {
    els.search.value = "";
    els.service.value = "";
    els.sort.value = "newest";
    statusFilter = "";
    render();
});

els.table.addEventListener("change", e => {
    const sel = e.target.closest(".status-select");
    if (!sel) return;
    const order = orders.find(o => o.id === sel.dataset.id);
    if (order) { order.status = sel.value; save(); render(); }
});

els.table.addEventListener("click", e => {
    const btn = e.target.closest("[data-delete]");
    if (!btn) return;
    if (confirm(`Delete order ${btn.dataset.delete}? This can't be undone.`)) {
        orders = orders.filter(o => o.id !== btn.dataset.delete);
        save(); render();
    }
});

/* ---------- form ---------- */
function openForm() {
    els.error.hidden = true;
    els.overlay.hidden = false;
    document.getElementById("customerName").focus();
}
function closeForm() {
    els.overlay.hidden = true;
    els.form.reset();
}
els.overlay.addEventListener("click", e => { if (e.target === els.overlay) closeForm(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !els.overlay.hidden) closeForm(); });

els.form.addEventListener("submit", e => {
    e.preventDefault();
    const basket = parseInt(document.getElementById("basket").value, 10);
    const inUse = orders.find(o => o.basket === basket && o.status !== "Claimed");

    if (inUse) {
        els.error.textContent = `Basket ${basket} is in use by ${inUse.id}. Choose another basket or mark that order as Claimed.`;
        els.error.hidden = false;
        return;
    }

    const next = orders.reduce((m, o) => Math.max(m, parseInt(o.id.slice(3), 10)), 0) + 1;
    orders.push({
        id: "FK-" + String(next).padStart(4, "0"),
        name: document.getElementById("customerName").value.trim(),
        contact: document.getElementById("contact").value.trim(),
        service: document.getElementById("service").value,
        kilo: parseFloat(document.getElementById("kilo").value),
        price: parseFloat(document.getElementById("price").value),
        basket,
        status: "Pending",
        created: Date.now()
    });
    save();
    closeForm();
    render();
});

render();