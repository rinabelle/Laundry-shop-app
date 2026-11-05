(function () {
  'use strict';

  var LOGIN_URL = 'index.html';
  var token = localStorage.getItem('customerToken') || sessionStorage.getItem('customerToken');
  var SLOTS = [
    { label: '9–11 AM', hour: 9 },
    { label: '11 AM–1 PM', hour: 11 },
    { label: '1–3 PM', hour: 13 },
    { label: '3–5 PM', hour: 15 }
  ];
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var customer = null;
  var orders = [];
  var services = [];
  var shop = null;
  var bookings = [];
  var availabilityError = '';
  var state = {
    mode: 'Drop-off',
    days: [],
    dayIndex: 0,
    slotIndex: null,
    basket: null,
    filter: 'all',
    query: ''
  };
  var toastTimer;
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    views: {
      schedule: $('view-schedule'),
      history: $('view-history'),
      prices: $('view-prices'),
      settings: $('view-settings'),
      contact: $('view-contact')
    },
    navItems: document.querySelectorAll('.nav-item'),
    days: $('days'),
    slots: $('slots'),
    baskets: $('baskets'),
    hint: $('basketHint'),
    confirm: $('confirmBtn'),
    orders: $('orders'),
    empty: $('empty'),
    search: $('search'),
    toast: $('toast'),
    pickupDetails: $('pickupDetails'),
    pickupAddressSummary: $('pickupAddressSummary'),
    pickupPhoneSummary: $('pickupPhoneSummary'),
    settingsForm: $('customerSettingsForm'),
    settingsStatus: $('settingsStatus'),
    scheduleShopStatus: $('scheduleShopStatus'),
    progressOrderLabel: $('progressOrderLabel'),
    progressCurrentStatus: $('progressCurrentStatus'),
    progressSteps: document.querySelectorAll('[data-progress-step]'),
    progressDescription: $('progressDescription'),
    shopStatus: $('shopStatus'),
    shopStatusLabel: $('shopStatusLabel'),
    shopStatusDetail: $('shopStatusDetail'),
    logoutDialog: $('logoutDialog'),
    doneDialog: $('doneDialog')
  };

  if (!token) {
    window.location.replace(LOGIN_URL);
    return;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function peso(value) {
    return '₱' + Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function isValidPhone(value) {
    var phone = String(value || '').trim();
    var digits = phone.replace(/\D/g, '');
    return /^\+?[0-9\s()-]+$/.test(phone) && digits.length >= 10 && digits.length <= 13;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 3200);
  }

  async function api(path, options) {
    var settings = options || {};
    var response;
    try {
      response = await fetch(window.fnkApiUrl(path), {
        ...settings,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
          ...(settings.headers || {})
        }
      });
    } catch (error) {
      throw new Error('Cannot reach the server. Check your connection and try again.');
    }
    var data = await response.json().catch(function () { return {}; });
    if (response.status === 401) {
      localStorage.removeItem('customerToken');
      sessionStorage.removeItem('customerToken');
      localStorage.removeItem('fnk_session');
      sessionStorage.removeItem('fnk_session');
      window.location.replace(LOGIN_URL);
      throw new Error(data.error || 'Please log in again.');
    }
    if (!response.ok) {
      throw new Error(response.status === 404
        ? 'Customer API endpoint not found. Restart the backend or check its deployment.'
        : [data.error || 'Request failed.', data.detail].filter(Boolean).join(' '));
    }
    return data;
  }

  function datePartsInManila(date) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23'
    }).formatToParts(date);
    var result = {};
    parts.forEach(function (part) { result[part.type] = part.value; });
    return result;
  }

  function dateKey(date) {
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(date.getUTCDate()).padStart(2, '0');
  }

  function dateForDay(dayIndex) {
    var now = datePartsInManila(new Date());
    var base = new Date(Date.UTC(Number(now.year), Number(now.month) - 1, Number(now.day) + dayIndex, 12));
    return base;
  }

  function formatDate(date) {
    return MONTHS[date.getUTCMonth()] + ' ' + date.getUTCDate() + ', ' + date.getUTCFullYear();
  }

  function formatDateTime(value) {
    if (!value) return 'Schedule pending';
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function showView(name) {
    if (!els.views[name]) name = 'schedule';
    Object.keys(els.views).forEach(function (key) { els.views[key].hidden = key !== name; });
    els.navItems.forEach(function (item) {
      var active = item.dataset.view === name;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    window.scrollTo(0, 0);
  }

  function renderCustomer() {
    $('customerName').value = customer.full_name || '';
    $('customerPhone').value = customer.phone || '';
    $('customerEmail').value = customer.email || '';
    $('customerAddress').value = customer.address || '';
    $('customerInstructions').value = customer.instructions || '';
    document.querySelector('.user-name').textContent = customer.full_name || 'Customer';
    document.querySelector('.avatar').textContent = (customer.full_name || 'Customer')
      .split(/\s+/).map(function (part) { return part.charAt(0); }).join('').slice(0, 2).toUpperCase();
    renderPickupDetails();
  }

  function renderPickupDetails() {
    var hasPickupInfo = Boolean(customer && customer.address && customer.phone);
    els.pickupDetails.hidden = state.mode !== 'Pickup';
    els.pickupAddressSummary.textContent = hasPickupInfo
      ? customer.address
      : 'Add a pickup address and phone number in Settings.';
    els.pickupPhoneSummary.textContent = hasPickupInfo ? customer.phone : '';
  }

  async function loadProfile() {
    var result = await api('/api/customer/me');
    customer = result.customer;
    renderCustomer();
  }

  async function loadServices() {
    var result = await api('/api/customer/services');
    services = result.services;
    renderServicePrices();
  }

  function renderServicePrices() {
    $('servicePrices').innerHTML = services.length
      ? services.map(function (service) {
        var unit = service.unit === 'per piece' ? 'per piece' : 'per kg';
        return '<article class="service-price"><div class="service-copy">' +
          '<span class="service-type">' + esc(service.unit.toUpperCase()) + '</span>' +
          '<h2>' + esc(service.name) + '</h2>' +
          '<p>Available for your next scheduled laundry order.</p></div>' +
          '<p class="service-rate"><strong>' + peso(service.price) + '</strong><span> / ' + unit + '</span></p></article>';
      }).join('')
      : '<p class="empty">No services are currently available.</p>';
  }

  function updateConfirmButton() {
    els.confirm.disabled = state.slotIndex === null ||
      state.basket === null || Boolean(availabilityError) ||
      bookingsForSlot(state.slotIndex).indexOf(state.basket) !== -1 ||
      isSlotPast(state.dayIndex, state.slotIndex);
  }

  function renderShopSettings() {
    if (!shop) return;
    $('shopPhone').textContent = shop.contact_phone;
    $('shopPhoneLink').href = 'tel:' + shop.contact_phone.replace(/[^\d+]/g, '');
    $('shopEmail').textContent = shop.contact_email;
    $('shopEmailLink').href = 'mailto:' + shop.contact_email;
    $('shopAddress').textContent = shop.address;
    $('shopDirections').href = 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(shop.address);
    $('shopFaqs').innerHTML = (shop.faqs || []).map(function (faq) {
      return '<details class="faq-item"><summary>' + esc(faq.question) + '</summary><p>' +
        esc(faq.answer) + '</p></details>';
    }).join('');
    var status = shop.status;
    els.shopStatus.classList.toggle('is-open', status.is_open);
    els.shopStatusLabel.textContent = status.is_open ? 'Open now' : 'Closed now';
    els.shopStatusDetail.textContent = status.detail;
    els.scheduleShopStatus.textContent = status.is_open
      ? 'Shop is open · ' + status.detail
      : 'Shop is closed · ' + status.detail;
    els.scheduleShopStatus.classList.toggle('is-open', status.is_open);
  }

  async function loadShopSettings() {
    var response = await fetch(window.fnkApiUrl('/api/shop/settings'));
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(response.status === 404
        ? 'Shop API endpoint not found. Restart the backend or check its deployment.'
        : data.error || 'Could not load shop information.');
    }
    shop = data;
    renderShopSettings();
  }

  function orderDate(order) {
    return order.scheduled_at ? formatDateTime(order.scheduled_at) : formatDateTime(order.pending_at);
  }

  function renderOrders() {
    var query = state.query.trim().toLowerCase();
    var filtered = orders.filter(function (order) {
      var statusMatch = state.filter === 'all' || order.status === state.filter;
      var searchable = [order.order_code, order.service, order.status, order.fulfillment_type,
        orderDate(order), order.scheduled_at, order.pending_at].join(' ').toLowerCase();
      return statusMatch && (!query || searchable.indexOf(query) !== -1);
    });
    els.orders.innerHTML = '';
    els.empty.hidden = filtered.length > 0;
    filtered.forEach(function (order) {
      var listItem = document.createElement('li');
      listItem.className = 'order';
      var unit = order.unit === 'per piece' ? 'pcs' : 'kg';
      var statusClass = order.status.toLowerCase();
      var assessed = Boolean(order.service_id);
      listItem.innerHTML =
        '<div class="order-info"><p class="id">' + esc(order.order_code) + '</p><small>' +
        esc(orderDate(order)) + ' · ' + esc(assessed ? order.service : 'To be assessed') + ' · ' +
        esc(order.fulfillment_type || 'Order') + ' · Basket B' + esc(order.basket_no) + '</small></div>' +
        '<div class="order-weight"><p class="val">' + (assessed ? esc(order.weight_kg) + ' ' + unit : 'Pending') +
        '</p><small>' + (assessed ? 'Quantity' : 'Weigh-in') + '</small></div>' +
        '<div class="order-price"><p class="val">' + (assessed ? peso(order.price) : 'Pending') +
        '</p><small>' + (assessed ? 'Order total' : 'Assessment') + '</small></div>' +
        '<span class="status status-' + esc(statusClass) + '">' + esc(order.status) + '</span>' +
        '<button class="reorder" type="button" data-reorder="' + order.id + '">↻ Reorder</button>';
      listItem.querySelector('[data-reorder]').addEventListener('click', function () {
        state.slotIndex = null;
        state.basket = null;
        state.dayIndex = 0;
        loadAvailability().then(function () {
          renderAll();
          showView('schedule');
          showToast('Choose a new day, time, and basket for your order.');
        }).catch(function (error) { showToast(error.message); });
      });
      els.orders.appendChild(listItem);
    });
    renderOrderProgress();
  }

  function renderOrderProgress() {
    var order = orders.find(function (item) {
      return item.status === 'Pending' || item.status === 'Confirmed';
    }) || orders[0];
    var statusStages = { Pending: 0, Confirmed: 1, Completed: 2 };
    var labels = ['Pending', 'Confirmed', 'Completed'];
    var stage = order ? statusStages[order.status] : -1;
    els.progressOrderLabel.textContent = order
      ? order.order_code + ' · ' + (order.service_id ? order.service : 'Awaiting assessment')
      : 'No active order';
    els.progressCurrentStatus.textContent = order
      ? order.status === 'Cancelled' ? 'Cancelled' : labels[stage]
      : 'No active order';
    els.progressSteps.forEach(function (step, index) {
      var complete = stage >= 0 && index < stage;
      var current = stage >= 0 && index === stage;
      step.classList.toggle('is-complete', complete);
      step.classList.toggle('is-current', current);
      step.classList.toggle('is-upcoming', stage < 0 || index > stage);
      if (current) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    var descriptions = [
      'Your order is pending while the shop waits for your scheduled drop-off or pickup.',
      'The shop has confirmed receipt of your laundry and is processing it.',
      'Your order has been completed.'
    ];
    els.progressDescription.textContent = order
      ? order.status === 'Cancelled'
        ? 'This order was cancelled.'
        : descriptions[stage]
      : 'Schedule an order to follow its progress here.';
  }

  function selectedDayKey() {
    return dateKey(dateForDay(state.dayIndex));
  }

  async function loadAvailability(ownBooking) {
    var requestedDay = selectedDayKey();
    bookings = [];
    availabilityError = '';
    try {
      var result = await api('/api/customer/availability?date=' + encodeURIComponent(requestedDay));
      if (requestedDay !== selectedDayKey()) return;
      bookings = result.bookings;
      if (result.closed) availabilityError = 'The shop is closed for today. Please choose another day.';
      if (state.slotIndex !== null && state.basket !== null &&
          bookingsForSlot(state.slotIndex).indexOf(state.basket) !== -1) {
        state.basket = null;
        var selectedBookingIsOwn = ownBooking &&
          state.dayIndex === ownBooking.dayIndex &&
          state.slotIndex === ownBooking.slotIndex &&
          state.basket === ownBooking.basket &&
          bookingsForSlot(ownBooking.slotIndex).indexOf(ownBooking.basket) !== -1;
        if (!selectedBookingIsOwn) showToast('That basket was just booked. Please choose another.');
      }
    } catch (error) {
      if (requestedDay !== selectedDayKey()) return;
      availabilityError = error.message;
      throw error;
    }
  }

  function bookingsForSlot(slotIndex) {
    var slot = String(SLOTS[slotIndex].hour).padStart(2, '0') + ':00';
    return bookings.filter(function (booking) { return booking.slot === slot; })
      .map(function (booking) { return Number(booking.basket_no); });
  }

  function isSlotPast(dayIndex, slotIndex) {
    var now = datePartsInManila(new Date());
    var currentKey = now.year + '-' + now.month + '-' + now.day;
    var selectedKey = dateKey(dateForDay(dayIndex));
    if (selectedKey < currentKey) return true;
    if (selectedKey > currentKey) return false;
    return Number(now.hour) * 60 + Number(now.minute) >= (SLOTS[slotIndex].hour + 2) * 60;
  }

  function renderDays() {
    els.days.innerHTML = '';
    state.days.forEach(function (day, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'day' + (index === state.dayIndex ? ' active' : '');
      button.setAttribute('aria-pressed', String(index === state.dayIndex));
      button.innerHTML = '<span>' + DAY_NAMES[day.getUTCDay()] + '</span><strong>' +
        day.getUTCDate() + '</strong>';
      button.addEventListener('click', function () {
        state.dayIndex = index;
        state.slotIndex = null;
        state.basket = null;
        loadAvailability().then(renderAll).catch(function () { renderAll(); });
      });
      els.days.appendChild(button);
    });
  }

  function renderSlots() {
    els.slots.innerHTML = '';
    SLOTS.forEach(function (slot, index) {
      var taken = bookingsForSlot(index);
      var past = isSlotPast(state.dayIndex, index);
      var closed = Boolean(availabilityError);
      var free = 14 - new Set(taken).size;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot' + (index === state.slotIndex ? ' active' : '');
      button.disabled = past || closed || free === 0;
      button.setAttribute('aria-pressed', String(index === state.slotIndex));
      button.innerHTML = '<strong>' + slot.label + '</strong><span>' +
        (closed ? 'Unavailable' : past ? 'Closed' : free + ' baskets free') + '</span>';
      button.addEventListener('click', function () {
        state.slotIndex = index;
        state.basket = null;
        renderSlots();
        renderBaskets();
      });
      els.slots.appendChild(button);
    });
  }

  function renderBaskets() {
    if (state.slotIndex === null) {
      els.baskets.hidden = true;
      els.hint.hidden = false;
      els.hint.textContent = availabilityError || 'Choose a time slot to see which baskets are free.';
      els.confirm.disabled = true;
      return;
    }
    var taken = bookingsForSlot(state.slotIndex);
    els.hint.hidden = Boolean(availabilityError);
    els.hint.textContent = availabilityError;
    els.baskets.hidden = false;
    els.baskets.innerHTML = '';
    for (var number = 1; number <= 14; number++) {
      (function (basketNumber) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'basket' + (state.basket === basketNumber ? ' active' : '');
        button.textContent = 'B' + basketNumber;
        button.disabled = Boolean(availabilityError) || taken.indexOf(basketNumber) !== -1;
        button.setAttribute('aria-pressed', String(state.basket === basketNumber));
        button.setAttribute('aria-label', 'Basket ' + basketNumber + (button.disabled ? ' unavailable' : ''));
        button.addEventListener('click', function () {
          state.basket = basketNumber;
          renderBaskets();
        });
        els.baskets.appendChild(button);
      })(number);
    }
    updateConfirmButton();
  }

  function renderAll() {
    renderDays();
    renderSlots();
    renderBaskets();
  }

  function scheduledAt(dayIndex, slotIndex) {
    var day = dateForDay(dayIndex);
    return new Date(Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      SLOTS[slotIndex].hour - 8,
      0
    )).toISOString();
  }

  async function confirmSchedule() {
    if (state.slotIndex === null || state.basket === null) return;
    if (!customer.phone || (state.mode === 'Pickup' && !customer.address)) {
      showView('settings');
      showToast(state.mode === 'Pickup'
        ? 'Add your phone number and pickup address before confirming pickup.'
        : 'Add your phone number before scheduling.');
      return;
    }
    var bookingDay = state.dayIndex;
    var bookingSlot = state.slotIndex;
    var bookingBasket = state.basket;
    var bookingMode = state.mode;
    els.confirm.disabled = true;
    try {
      var result = await api('/api/customer/orders', {
        method: 'POST',
        body: JSON.stringify({
          basket_no: bookingBasket,
          fulfillment_type: bookingMode,
          scheduled_at: scheduledAt(bookingDay, bookingSlot)
        })
      });
      if (state.dayIndex === bookingDay && state.slotIndex === bookingSlot && state.basket === bookingBasket) {
        state.basket = null;
      }
      await Promise.all([
        loadOrders(),
        loadAvailability({ dayIndex: bookingDay, slotIndex: bookingSlot, basket: bookingBasket })
      ]);
      var order = result.order;
      $('doneTitle').textContent = 'Schedule confirmed';
      $('doneText').textContent = order.order_code + ' · ' + bookingMode + ' on ' +
        formatDate(dateForDay(bookingDay)) + ', ' + SLOTS[bookingSlot].label +
        '. Basket B' + bookingBasket + '. The shop will assess the laundry at handoff.';
      els.doneDialog.showModal();
      renderAll();
    } catch (error) {
      showToast(error.message);
      await loadAvailability().catch(function () {});
      renderAll();
    } finally {
      updateConfirmButton();
    }
  }

  function logOut() {
    els.logoutDialog.close();
    try {
      localStorage.removeItem('customerToken');
      localStorage.removeItem('fnk_session');
      localStorage.removeItem('customerName');
      Object.keys(localStorage).forEach(function (key) {
        if (key.indexOf('sb-') === 0 && /-auth-token$/.test(key)) localStorage.removeItem(key);
      });
      sessionStorage.clear();
    } catch (error) {
      console.error('Could not clear the local session:', error);
    }
    window.location.replace(LOGIN_URL);
  }

  async function saveCustomerSettings(event) {
    event.preventDefault();
    if (!isValidPhone($('customerPhone').value)) {
      els.settingsStatus.textContent = 'Enter a phone number with 10 to 13 digits.';
      $('customerPhone').focus();
      return;
    }
    els.settingsStatus.textContent = 'Saving...';
    try {
      var result = await api('/api/customer/me', {
        method: 'PUT',
        body: JSON.stringify({
          full_name: $('customerName').value.trim(),
          phone: $('customerPhone').value.trim(),
          address: $('customerAddress').value.trim(),
          instructions: $('customerInstructions').value.trim()
        })
      });
      customer = result.customer;
      renderCustomer();
      els.settingsStatus.textContent = 'Changes saved to your account.';
    } catch (error) {
      els.settingsStatus.textContent = error.message;
    }
  }

  function bindEvents() {
    els.navItems.forEach(function (item) {
      item.addEventListener('click', function () { showView(item.dataset.view); });
    });
    document.querySelectorAll('[data-mode]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.mode = button.dataset.mode;
        document.querySelectorAll('[data-mode]').forEach(function (modeButton) {
          var active = modeButton === button;
          modeButton.classList.toggle('active', active);
          modeButton.setAttribute('aria-pressed', String(active));
        });
        renderPickupDetails();
      });
    });
    $('customerPhone').addEventListener('input', function () {
      $('customerPhone').setCustomValidity(isValidPhone($('customerPhone').value)
        ? ''
        : 'Enter a phone number with 10 to 13 digits.');
    });
    els.settingsForm.addEventListener('submit', saveCustomerSettings);
    $('editCustomerDetails').addEventListener('click', function () { showView('settings'); });
    document.querySelectorAll('[data-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.filter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach(function (filterButton) {
          var active = filterButton === button;
          filterButton.classList.toggle('active', active);
          filterButton.setAttribute('aria-pressed', String(active));
        });
        renderOrders();
      });
    });
    els.search.addEventListener('input', function () {
      state.query = els.search.value;
      renderOrders();
    });
    els.confirm.addEventListener('click', confirmSchedule);
    $('logoutBtn').addEventListener('click', function () { els.logoutDialog.showModal(); });
    $('logoutCancel').addEventListener('click', function () { els.logoutDialog.close(); });
    $('logoutConfirm').addEventListener('click', logOut);
    $('doneStay').addEventListener('click', function () { els.doneDialog.close(); });
    $('doneHistory').addEventListener('click', function () {
      els.doneDialog.close();
      showView('history');
    });
    window.addEventListener('hashchange', function () { showView(location.hash.slice(1)); });
  }

  async function refreshOrders() {
    try {
      var result = await api('/api/customer/orders');
      orders = result.orders;
      renderOrders();
    } catch (error) {
      showToast(error.message);
    }
  }

  async function refreshAvailability() {
    await loadAvailability();
    renderSlots();
    renderBaskets();
  }

  async function initialize() {
    await Promise.all([
      loadProfile().catch(function (error) { showToast(error.message); }),
      loadServices().catch(function (error) { showToast(error.message); }),
      loadShopSettings().catch(function (error) { showToast(error.message); }),
      refreshOrders()
    ]);
    state.days = Array.from({ length: 7 }, function (_, index) { return dateForDay(index); });
    bindEvents();
    await loadAvailability().catch(function () {});
    renderAll();
    showView(location.hash.slice(1) || 'schedule');
    window.setInterval(refreshOrders, 5000);
    window.setInterval(function () { refreshAvailability().catch(function () {}); }, 5000);
    window.setInterval(function () { loadServices().catch(function (error) { showToast(error.message); }); }, 60000);
    window.setInterval(function () { loadShopSettings().catch(function (error) { showToast(error.message); }); }, 5000);
    window.addEventListener('focus', function () {
      loadShopSettings().catch(function (error) { showToast(error.message); });
      refreshAvailability().catch(function () {});
    });
  }

  initialize();
})();
