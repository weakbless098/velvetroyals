const ordersModule = (() => {
    // Line-art SVG icons (feather-style) — stroke follows currentColor so
    // each container's text color styles them.
    const _ICON_PATHS = {
        receipt:  '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><line x1="9" y1="11" x2="15" y2="11"></line><line x1="9" y1="15" x2="13" y2="15"></line>',
        check:    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
        scissors: '<circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line>',
        truck:    '<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>',
        package:  '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>'
    };
    const _icon = (name, size = 18) =>
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + _ICON_PATHS[name] + '</svg>';

    const STEPS = [
        { key: 'pending',          label: 'Order Placed',      icon: 'receipt' },
        { key: 'confirmed',        label: 'Confirmed',         icon: 'check' },
        { key: 'preparing',        label: 'Preparing',         icon: 'scissors' },
        { key: 'out_for_delivery', label: 'Out for Delivery',  icon: 'truck' },
        { key: 'delivered',        label: 'Delivered',         icon: 'package' },
    ];

    const STEP_INDEX = {};
    STEPS.forEach((s, i) => { STEP_INDEX[s.key] = i; });

    const STATUS_META = {
        'pending':          { label: 'Order Placed',         desc: 'We’ve received your order',                icon: 'receipt' },
        'confirmed':        { label: 'Order Confirmed',      desc: 'Your order has been confirmed',                  icon: 'check' },
        'preparing':        { label: 'Preparing Your Order', desc: 'Our florists are crafting your arrangement',     icon: 'scissors' },
        'out_for_delivery': { label: 'Out for Delivery',     desc: 'Your order is on its way to you!',               icon: 'truck' },
        'delivered':        { label: 'Order Delivered',      desc: 'Your flowers have arrived — enjoy!',        icon: 'package' },
    };

    const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'out_for_delivery']);
    const DONE_STATUSES   = new Set(['delivered', 'completed']);
    const LS_KEY          = 'rv_archived_orders';

    let _allOrders     = [];
    let _currentFilter = 'all';
    let _unsubscribe   = null;

    const _norm = (order) => {
        const s = order.status || 'pending';
        return s === 'completed' ? 'delivered' : s;
    };

    const _getArchivedSet = () => {
        try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); }
        catch { return new Set(); }
    };
    const _saveArchivedSet = (set) => {
        localStorage.setItem(LS_KEY, JSON.stringify([...set]));
    };
    const _isArchived = (orderId) => _getArchivedSet().has(orderId);

    
    const init = () => {
        firebase.auth().onAuthStateChanged(user => {
            const gate       = document.getElementById('orders-auth-gate');
            const loading    = document.getElementById('orders-loading');
            const container  = document.getElementById('orders-container');
            const filterBar  = document.getElementById('orders-filter-bar');
            const empty      = document.getElementById('orders-empty');
            const guestPanel = document.getElementById('orders-guest-lookup');

            if (!user) {
                if (loading)    loading.style.display    = 'none';
                if (gate)       gate.style.display       = 'none';
                if (container)  container.style.display  = 'none';
                if (filterBar)  filterBar.style.display  = 'none';
                if (empty)      empty.style.display      = 'none';
                if (guestPanel) guestPanel.style.display = 'block';
                return;
            }

            if (guestPanel) guestPanel.style.display = 'none';
            if (gate)       gate.style.display       = 'none';
            if (loading)    loading.style.display    = 'block';

            if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }

            const _skeletonTimeout = setTimeout(() => {
                if (loading && loading.style.display !== 'none') {
                    loading.style.display = 'none';
                    _allOrders = [];
                    _renderFilterBar();
                    _applyFilter();
                }
            }, 6000);

            const userOrdersRef = firebase.database().ref('user-orders').child(user.uid);

            const _listener = (snapshot) => {
                clearTimeout(_skeletonTimeout);
                if (!snapshot.exists() || !Object.keys(snapshot.val() || {}).length) {
                    if (loading) loading.style.display = 'none';
                    _allOrders = [];
                    _renderFilterBar();
                    _applyFilter();
                    return;
                }

                const keys = Object.keys(snapshot.val());
                Promise.all(
                    keys.map(key => firebase.database().ref('orders').child(key).once('value'))
                ).then(snapshots => {
                    if (loading) loading.style.display = 'none';
                    const orders = snapshots
                        .filter(s => s.exists())
                        .map(s => ({ key: s.key, ...s.val() }));
                    orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    _allOrders = orders;
                    _renderFilterBar();
                    _applyFilter();
                });
            };

            userOrdersRef.on('value', _listener);
            _unsubscribe = () => userOrdersRef.off('value', _listener);
        });
    };

    
    const lookupGuestOrder = async () => {
        const input = document.getElementById('guest-order-id-input');
        const contactInput = document.getElementById('guest-order-contact-input');
        const resultEl = document.getElementById('guest-lookup-result');
        if (!input || !resultEl) return;

        const orderId = input.value.trim();
        const contact = contactInput ? contactInput.value.trim() : '';
        if (!orderId) {
            resultEl.innerHTML = '<p class="lookup-msg lookup-error">Please enter your Order ID.</p>';
            return;
        }
        if (!contact) {
            resultEl.innerHTML = '<p class="lookup-msg lookup-error">Please enter the email or phone number used on the order.</p>';
            return;
        }

        resultEl.innerHTML = '<p class="lookup-msg">Looking up order...</p>';

        try {
            // Look the order up server-side: the function matches by the short
            // Tracking ID (or the full internal key), verifies the contact, and
            // returns only the PII-free tracking data — so the order-tracking
            // collection itself is never exposed for scraping.
            const resp = await fetch('https://us-central1-flowershop-d26f4.cloudfunctions.net/lookupOrder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: orderId, contact })
            });
            const data = await resp.json();
            if (!data || !data.found) {
                resultEl.innerHTML = '<p class="lookup-msg lookup-error">No order found matching that ID and contact. Please check and try again.</p>';
                return;
            }
            const order = { key: data.key, ...data.order };
            resultEl.innerHTML = '<div class="guest-order-result">' + renderOrderCard(order) + '</div>';
        } catch (e) {
            resultEl.innerHTML = '<p class="lookup-msg lookup-error">Could not look up order. Please try again.</p>';
        }
    };

    // Ownership check: hash the entered contact the same way checkout did
    // (helpers in utils.js) and compare against the stored hashes.
    const _contactMatchesTracking = async (contact, tracking) => {
        const stored = (tracking && tracking.contactHashes) || [];
        if (!stored.length) return false;
        const candidates = [];
        const email = normalizeContactEmail(contact);
        if (email.includes('@')) candidates.push(await sha256Hex(email));
        const phone = normalizeContactPhone(contact);
        if (phone.length >= 7) candidates.push(await sha256Hex(phone));
        return candidates.some(h => stored.includes(h));
    };

    
    const _renderFilterBar = () => {
        const bar = document.getElementById('orders-filter-bar');
        if (!bar) return;
        if (_allOrders.length === 0) { bar.style.display = 'none'; return; }

        const archived = _getArchivedSet();
        const activeCount    = _allOrders.filter(o => ACTIVE_STATUSES.has(_norm(o)) && !archived.has(o.key)).length;
        const completedCount = _allOrders.filter(o => DONE_STATUSES.has(_norm(o)) || archived.has(o.key)).length;

        const tab = (key, label, count) => {
            const on = _currentFilter === key;
            return '<button class="orders-filter-tab' + (on ? ' filter-tab-active' : '') +
                '" onclick="ordersModule.setFilter(\'' + key + '\')">' +
                label +
                '<span class="filter-tab-count">' + count + '</span>' +
                '</button>';
        };

        bar.style.display = 'flex';
        bar.innerHTML =
            tab('all',       'All Orders',  _allOrders.length) +
            tab('active',    'Active',      activeCount) +
            tab('completed', 'Completed',   completedCount);
    };

    const setFilter = (filter) => {
        _currentFilter = filter;
        _renderFilterBar();
        _applyFilter();
    };

    
    const _applyFilter = () => {
        const container = document.getElementById('orders-container');
        const empty     = document.getElementById('orders-empty');

        const archived = _getArchivedSet();
        let filtered = _allOrders;
        if (_currentFilter === 'active') {
            filtered = _allOrders.filter(o => ACTIVE_STATUSES.has(_norm(o)) && !archived.has(o.key));
        } else if (_currentFilter === 'completed') {
            filtered = _allOrders.filter(o => DONE_STATUSES.has(_norm(o)) || archived.has(o.key));
        }

        if (filtered.length === 0) {
            if (container) { container.innerHTML = ''; container.style.display = 'none'; }
            if (empty) {
                empty.style.display = 'flex';
                const h3 = empty.querySelector('h3');
                const p  = empty.querySelector('p');
                if (h3) h3.textContent =
                    _currentFilter === 'active'    ? 'No active orders'         :
                    _currentFilter === 'completed' ? 'No completed orders yet'  : 'No orders yet';
                if (p)  p.textContent  =
                    _currentFilter === 'active'    ? 'All your orders have been completed.'  :
                    _currentFilter === 'completed' ? 'Completed orders will appear here.'    :
                                                     'When you place an order, it will appear here.';
            }
        } else {
            if (empty)     empty.style.display = 'none';
            if (container) { container.style.display = 'block'; container.innerHTML = filtered.map(renderOrderCard).join(''); }
        }
    };

    
    const archiveOrder = (orderId) => {
        const set = _getArchivedSet();
        set.add(orderId);
        _saveArchivedSet(set);
        _renderFilterBar();
        _applyFilter();
    };

    
    const renderOrderCard = (order) => {
        const date       = new Date(order.timestamp);
        const dateStr    = date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
        const timeStr    = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
        const status     = _norm(order);
        const currentIdx = STEP_INDEX[status] !== undefined ? STEP_INDEX[status] : 0;
        const isDelivered = status === 'delivered';
        const isArchived  = _isArchived(order.key);
        const meta       = STATUS_META[status] || STATUS_META['pending'];
        const items      = order.items || [];
        const itemCount  = items.reduce((n, it) => n + (it.quantity || 1), 0);

        const stepperHtml = STEPS.map((step, i) => {
            const done   = i < currentIdx;
            const active = i === currentIdx;
            const cls    = done ? 'step-done' : (active ? 'step-active' : 'step-future');
            return (
                '<div class="tracker-step ' + cls + '">' +
                    '<div class="tracker-dot">' + _icon(step.icon, 18) + '</div>' +
                    '<span class="tracker-label">' + step.label + '</span>' +
                    (i < STEPS.length - 1 ? '<div class="tracker-line' + (done ? ' line-done' : '') + '"></div>' : '') +
                '</div>'
            );
        }).join('');

        const itemsHtml = items.map(item =>
            '<span class="order-item-pill">' + escapeHtml(item.name) + ' \xd7' + item.quantity + '</span>'
        ).join('');

        const fulfillment = order.fulfillment || {};
        const isPickup    = fulfillment.type === 'pickup';
        const deliveryLine = isPickup
            ? 'Store Pickup — collect from our shop'
            : ['Delivery', fulfillment.area, fulfillment.address].filter(Boolean).join(' \xb7 ');

        const iconPickup = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>';
        const iconDeliv  = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6;"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>';
        const iconCal    = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
        const iconNote   = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
        const iconBox    = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>';

        const archiveBtn = (isDelivered && !isArchived)
            ? '<button class="order-archive-btn" onclick="ordersModule.archiveOrder(\'' + order.key + '\')">' +
                  iconBox + ' Archive Order' +
              '</button>'
            : '';

        const archivedBadge = isArchived
            ? '<span class="order-archived-badge">' + iconBox + ' Archived</span>'
            : '';

        return (
            '<div class="order-track-card' +
                (isDelivered ? ' order-track-delivered' : '') +
                (isArchived  ? ' order-archived' : '') +
                '" id="otc-' + order.key + '">' +

                '<div class="order-status-banner status-banner-' + status + '">' +
                    '<span class="order-status-icon">' + _icon(meta.icon, 26) + '</span>' +
                    '<div class="order-status-text">' +
                        '<span class="order-status-name">' + meta.label + '</span>' +
                        '<span class="order-status-desc">' + meta.desc + '</span>' +
                    '</div>' +
                    (archivedBadge ? '<div style="margin-left:auto;flex-shrink:0;">' + archivedBadge + '</div>' : '') +
                '</div>' +

                '<div class="order-card-body">' +
                    '<div class="order-track-header">' +
                        '<div class="order-track-meta">' +
                            '<div class="order-num-row">' +
                                '<span class="order-track-id">Order #' + rvTrackingId(order.key) + '</span>' +
                                '<span class="order-item-count">' + itemCount + '\xa0item' + (itemCount !== 1 ? 's' : '') + '</span>' +
                            '</div>' +
                            '<span class="order-track-date">' + dateStr + '\xa0\xb7\xa0' + timeStr + '</span>' +
                        '</div>' +
                        '<div class="order-track-amount">' +
                            '<span class="order-track-total-label">Order Total</span>' +
                            '<span class="order-track-total">AED\xa0' + parseFloat(order.total || 0).toFixed(2) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="order-track-stepper">' + stepperHtml + '</div>' +
                '</div>' +

                '<div class="order-track-details">' +
                    '<div class="order-details-section-label">Items Ordered</div>' +
                    '<div class="order-track-items">' + itemsHtml + '</div>' +
                    '<div class="order-track-divider"></div>' +
                    '<div class="order-details-section-label">Delivery Details</div>' +
                    '<div class="order-track-info">' +
                        '<span class="track-info-row">' + (isPickup ? iconPickup : iconDeliv) + escapeHtml(deliveryLine) + '</span>' +
                        (fulfillment.date
                            ? '<span class="track-info-row">' + iconCal + escapeHtml(fulfillment.date) + (fulfillment.timeSlot ? '\xa0\xb7\xa0' + escapeHtml(fulfillment.timeSlot) : '') + '</span>'
                            : '') +
                        (order.customer && order.customer.notes
                            ? '<span class="track-info-row">' + iconNote + escapeHtml(order.customer.notes) + '</span>'
                            : '') +
                    '</div>' +
                    archiveBtn +
                '</div>' +

            '</div>'
        );
    };

    const escapeHtml = (str) => {
        if (!str) return '';
        const d = document.createElement('div');
        d.appendChild(document.createTextNode(str));
        return d.innerHTML;
    };

    return { init, setFilter, archiveOrder, lookupGuestOrder };
})();
