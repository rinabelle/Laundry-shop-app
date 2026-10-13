(function () {
  var LOGIN_URL = "login_signup.html";
  var CUSTOMER_KEY = "freshNKleanCustomer";
  var TOTAL_BASKETS = 14;
  var SLOTS = [
    { label: "9–11 AM", end: 11 },
    { label: "11 AM–1 PM", end: 13 },
    { label: "1–3 PM", end: 15 },
    { label: "3–5 PM", end: 17 }
  ];
  var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var orders = [
    { id: "LDR-0011", date: "Sep 28, 2026", service: "Wash & Fold", weight: "4.5 kg", price: "₱360", note: "Paid", status: "completed" },
    { id: "LDR-0009", date: "Sep 21, 2026", service: "Wash, Dry & Press", weight: "6 kg", price: "₱618", note: "Paid", status: "completed" },
    { id: "LDR-0007", date: "Sep 14, 2026", service: "Dry Cleaning", weight: "3 kg", price: "₱0", note: "Not charged", status: "cancelled" },
    { id: "LDR-0005", date: "Sep 7, 2026", service: "Wash & Fold", weight: "5 kg", price: "₱400", note: "Paid", status: "completed" },
    { id: "LDR-0003", date: "Aug 30, 2026", service: "Wash, Dry & Press", weight: "2.5 kg", price: "₱258", note: "Paid", status: "completed" }
  ];
  var nextOrderNumber = 13;
  var defaultCustomer = {
    name: "Rinabelle Cayton",
    phone: "0969 454 3360",
    email: "rinatone@gmail.com",
    address: "20 Acapulco St., Commonwealth, Quezon City",
    instructions: "Dun oh"
  };
  var legacyCustomer = {
    name: "Maria Santos",
    email: "maria.santos@example.com"
  };

  function loadCustomer() {
    try {
      var saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY));
      if (saved && typeof saved === "object") {
        if (saved.name === legacyCustomer.name && saved.email === legacyCustomer.email) {
          localStorage.setItem(CUSTOMER_KEY, JSON.stringify(defaultCustomer));
        } else {
          Object.keys(defaultCustomer).forEach(function (key) {
            if (typeof saved[key] === "string") defaultCustomer[key] = saved[key];
          });
        }
      }
    } catch (e) {}
    return defaultCustomer;
  }

  var customer = loadCustomer();

  var state = { mode: "Drop-off", dayIndex: 0, slotIndex: null, basket: null, filter: "all", query: "" };
  var days = [];

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    views: { schedule: $("view-schedule"), history: $("view-history"), prices: $("view-prices"), settings: $("view-settings"), contact: $("view-contact") },
    navItems: document.querySelectorAll(".nav-item"),
    days: $("days"),
    slots: $("slots"),
    baskets: $("baskets"),
    hint: $("basketHint"),
    confirm: $("confirmBtn"),
    orders: $("orders"),
    empty: $("empty"),
    search: $("search"),
    toast: $("toast"),
    pickupDetails: $("pickupDetails"),
    pickupAddressSummary: $("pickupAddressSummary"),
    pickupPhoneSummary: $("pickupPhoneSummary"),
    settingsForm: $("customerSettingsForm"),
    settingsStatus: $("settingsStatus"),
    progressOrderLabel: $("progressOrderLabel"),
    progressCurrentStatus: $("progressCurrentStatus"),
    progressSteps: document.querySelectorAll("[data-progress-step]"),
    progressDescription: $("progressDescription"),
    shopStatus: $("shopStatus"),
    shopStatusLabel: $("shopStatusLabel"),
    shopStatusDetail: $("shopStatusDetail"),
    logoutDialog: $("logoutDialog"),
    doneDialog: $("doneDialog"),
    signedOut: $("signedOut")
  };

  var toastTimer;
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove("show"); }, 3200);
  }

  function showView(name) {
    if (!els.views[name]) name = "schedule";
    Object.keys(els.views).forEach(function (key) { els.views[key].hidden = key !== name; });
    els.navItems.forEach(function (item) {
      var active = item.dataset.view === name;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    window.scrollTo(0, 0);
  }

  function renderCustomer() {
    $("customerName").value = customer.name;
    $("customerPhone").value = customer.phone;
    $("customerEmail").value = customer.email;
    $("customerAddress").value = customer.address;
    $("customerInstructions").value = customer.instructions;
    document.querySelector(".user-name").textContent = customer.name;
    document.querySelector(".avatar").textContent = customer.name.split(/\s+/).map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase();
    renderPickupDetails();
  }

  function renderPickupDetails() {
    var hasPickupInfo = customer.address.trim() && customer.phone.trim();
    els.pickupDetails.hidden = state.mode !== "Pickup";
    els.pickupAddressSummary.textContent = hasPickupInfo ? customer.address : "Add a pickup address and phone number in Settings.";
    els.pickupPhoneSummary.textContent = hasPickupInfo ? customer.phone : "";
  }

  function formatShopHour(hour) {
    return (hour % 12 || 12) + ":00 " + (hour < 12 ? "AM" : "PM");
  }

  function updateShopStatus() {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());
    var current = {};
    parts.forEach(function (part) { current[part.type] = part.value; });

    var week = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var dayIndex = week.indexOf(current.weekday);
    var openHour = dayIndex === 0 ? 9 : 8;
    var closeHour = dayIndex === 0 ? 17 : 20;
    var currentMinutes = Number(current.hour) * 60 + Number(current.minute);
    var isOpen = currentMinutes >= openHour * 60 && currentMinutes < closeHour * 60;

    els.shopStatus.classList.toggle("is-open", isOpen);
    els.shopStatusLabel.textContent = isOpen ? "Open now" : "Closed now";
    if (isOpen) {
      els.shopStatusDetail.textContent = "Closes at " + formatShopHour(closeHour);
      return;
    }

    var nextOpenDay = currentMinutes < openHour * 60 ? dayIndex : (dayIndex + 1) % week.length;
    var nextOpenHour = nextOpenDay === 0 ? 9 : 8;
    var nextOpenText = "Opens " + formatShopHour(nextOpenHour);
    if (nextOpenDay !== dayIndex) nextOpenText = "Opens " + week[nextOpenDay] + " at " + formatShopHour(nextOpenHour);
    els.shopStatusDetail.textContent = nextOpenText;
  }

  function buildDays() {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d);
    }
  }

  function isSlotPast(dayIndex, slotIndex) {
    return dayIndex === 0 && new Date().getHours() >= SLOTS[slotIndex].end;
  }

  function takenBaskets(dayIndex, slotIndex) {
    var seed = (days[dayIndex].getDate() * 31 + slotIndex * 17 + days[dayIndex].getMonth() * 7) % 97;
    var count = seed % 6;
    var taken = [];
    for (var i = 0; i < count; i++) {
      seed = (seed * 37 + 11) % 101;
      var n = (seed % TOTAL_BASKETS) + 1;
      if (taken.indexOf(n) === -1) taken.push(n);
    }
    return taken;
  }

  function renderDays() {
    els.days.innerHTML = "";
    days.forEach(function (d, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "day" + (i === state.dayIndex ? " active" : "");
      b.setAttribute("aria-pressed", i === state.dayIndex);
      b.innerHTML = "<span>" + DAY_NAMES[d.getDay()] + "</span><strong>" + d.getDate() + "</strong>";
      b.addEventListener("click", function () {
        state.dayIndex = i;
        state.slotIndex = null;
        state.basket = null;
        renderAll();
      });
      els.days.appendChild(b);
    });
  }

  function renderSlots() {
    els.slots.innerHTML = "";
    SLOTS.forEach(function (slot, i) {
      var past = isSlotPast(state.dayIndex, i);
      var free = TOTAL_BASKETS - takenBaskets(state.dayIndex, i).length;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "slot" + (i === state.slotIndex ? " active" : "");
      b.disabled = past;
      b.setAttribute("aria-pressed", i === state.slotIndex);
      b.innerHTML = "<strong>" + slot.label + "</strong><span>" + (past ? "Closed" : free + " baskets free") + "</span>";
      b.addEventListener("click", function () {
        state.slotIndex = i;
        state.basket = null;
        renderSlots();
        renderBaskets();
      });
      els.slots.appendChild(b);
    });
  }

  function renderBaskets() {
    if (state.slotIndex === null) {
      els.baskets.hidden = true;
      els.hint.hidden = false;
      els.confirm.disabled = true;
      return;
    }
    var taken = takenBaskets(state.dayIndex, state.slotIndex);
    els.hint.hidden = true;
    els.baskets.hidden = false;
    els.baskets.innerHTML = "";
    for (var n = 1; n <= TOTAL_BASKETS; n++) {
      (function (num) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "basket" + (state.basket === num ? " active" : "");
        b.textContent = "B" + num;
        b.disabled = taken.indexOf(num) !== -1;
        b.setAttribute("aria-pressed", state.basket === num);
        b.setAttribute("aria-label", "Basket " + num + (b.disabled ? " taken" : ""));
        b.addEventListener("click", function () {
          state.basket = num;
          renderBaskets();
        });
        els.baskets.appendChild(b);
      })(n);
    }
    els.confirm.disabled = state.basket === null;
  }

  function renderAll() {
    renderDays();
    renderSlots();
    renderBaskets();
  }

  function formatDate(d) {
    return MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  function renderOrders() {
    var q = state.query.trim().toLowerCase();
    var list = orders.filter(function (o) {
      var matchFilter = state.filter === "all" || o.status === state.filter;
      var matchQuery = !q || o.id.toLowerCase().indexOf(q) !== -1 || o.date.toLowerCase().indexOf(q) !== -1;
      return matchFilter && matchQuery;
    });
    els.orders.innerHTML = "";
    els.empty.hidden = list.length > 0;
    list.forEach(function (o) {
      var li = document.createElement("li");
      li.className = "order";
      var statusLabel = o.status === "completed" ? "✓ Completed" : o.status === "cancelled" ? "✕ Cancelled" : "Scheduled";
      li.innerHTML =
        "<div class='order-info'><p class='id'>" + o.id + "</p><small>" + o.date + " · " + o.service + "</small></div>" +
        "<div class='order-weight'><p class='val'>" + o.weight + "</p><small>Weight</small></div>" +
        "<div class='order-price'><p class='val'>" + o.price + "</p><small>" + o.note + "</small></div>" +
        "<span class='status " + o.status + "'>" + statusLabel + "</span>" +
        "<button class='reorder' type='button'>↻ Reorder</button>";
      li.querySelector(".reorder").addEventListener("click", function () {
        state.slotIndex = null;
        state.basket = null;
        state.dayIndex = 0;
        renderAll();
        showView("schedule");
        showToast("Reordering " + o.id + ". Pick a day, time slot and basket.");
      });
      els.orders.appendChild(li);
    });
  }

  function renderOrderProgress() {
    var order = orders.find(function (item) { return item.status !== "cancelled"; });
    var stageByStatus = { scheduled: 0, processing: 1, ready: 2, completed: 3 };
    var stageLabels = ["In queue", "Processing", "Ready for pickup", "Completed"];
    var stage = order ? stageByStatus[order.status] : -1;
    els.progressOrderLabel.textContent = order ? order.id + " · " + order.service : "No active orders";
    els.progressCurrentStatus.textContent = stage >= 0 ? stageLabels[stage] : "No active order";
    els.progressSteps.forEach(function (step, index) {
      var complete = stage >= 0 && index < stage;
      var current = stage >= 0 && index === stage;
      step.classList.toggle("is-complete", complete);
      step.classList.toggle("is-current", current);
      step.classList.toggle("is-upcoming", stage < 0 || index > stage);
      if (current) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });

    var descriptions = [
      "Your order is in the queue and waiting to be washed.",
      "Your laundry is being washed and dried.",
      "Your clean laundry is ready for pickup.",
      "This order has been completed."
    ];
    els.progressDescription.textContent = stage >= 0 ? descriptions[stage] : "Schedule an order to follow its progress here.";
  }

  function confirmSchedule() {
    if (state.slotIndex === null || state.basket === null) return;
    if (state.mode === "Pickup" && (!customer.phone.trim() || !customer.address.trim())) {
      showView("settings");
      showToast("Add your phone number and pickup address before confirming.");
      return;
    }
    var id = "LDR-" + String(nextOrderNumber++).padStart(4, "0");
    var date = days[state.dayIndex];
    var slot = SLOTS[state.slotIndex].label;
    orders.unshift({ id: id, date: formatDate(new Date()), service: state.mode, weight: "—", price: "₱0", note: "Pending", status: "scheduled", customer: { name: customer.name, phone: customer.phone, address: customer.address, instructions: customer.instructions } });
    $("doneTitle").textContent = "Schedule confirmed";
    var confirmation = id + " · " + state.mode + " on " + DAY_NAMES[date.getDay()] + ", " + formatDate(date) + ", " + slot + ". Your basket is B" + state.basket + ". Contact: " + customer.phone + ".";
    if (state.mode === "Pickup") confirmation += " Pickup address: " + customer.address + (customer.instructions ? ". Instructions: " + customer.instructions : "");
    $("doneText").textContent = confirmation;
    els.doneDialog.showModal();
    state.slotIndex = null;
    state.basket = null;
    renderAll();
    renderOrders();
    renderOrderProgress();
  }

  function logOut() {
    els.logoutDialog.close();
    try { sessionStorage.clear(); } catch (e) {}
    if (LOGIN_URL) {
      window.location.href = LOGIN_URL;
      return;
    }
    els.signedOut.hidden = false;
  }

  els.navItems.forEach(function (item) {
    item.addEventListener("click", function () { showView(item.dataset.view); });
  });

  document.querySelectorAll("[data-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.mode = btn.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on);
      });
      renderPickupDetails();
    });
  });

  els.settingsForm.addEventListener("submit", function (event) {
    event.preventDefault();
    customer = {
      name: $("customerName").value.trim(),
      phone: $("customerPhone").value.trim(),
      email: $("customerEmail").value.trim(),
      address: $("customerAddress").value.trim(),
      instructions: $("customerInstructions").value.trim()
    };
    try {
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
      els.settingsStatus.textContent = "Changes saved.";
    } catch (e) {
      els.settingsStatus.textContent = "Could not save on this device. Your changes will apply until you leave this page.";
    }
    renderCustomer();
  });

  $("editCustomerDetails").addEventListener("click", function () { showView("settings"); });

  document.querySelectorAll("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.filter = btn.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on);
      });
      renderOrders();
    });
  });

  els.search.addEventListener("input", function () {
    state.query = els.search.value;
    renderOrders();
  });

  els.confirm.addEventListener("click", confirmSchedule);
  $("logoutBtn").addEventListener("click", function () { els.logoutDialog.showModal(); });
  $("logoutCancel").addEventListener("click", function () { els.logoutDialog.close(); });
  $("logoutConfirm").addEventListener("click", logOut);
  $("doneStay").addEventListener("click", function () { els.doneDialog.close(); });
  $("doneHistory").addEventListener("click", function () {
    els.doneDialog.close();
    showView("history");
  });
  $("loginAgain").addEventListener("click", function () {
    els.signedOut.hidden = true;
    showView("schedule");
  });
  window.addEventListener("hashchange", function () { showView(location.hash.slice(1)); });

  buildDays();
  renderCustomer();
  updateShopStatus();
  window.setInterval(updateShopStatus, 60000);
  renderAll();
  renderOrders();
  renderOrderProgress();
  showView(location.hash.slice(1) || "schedule");
})();