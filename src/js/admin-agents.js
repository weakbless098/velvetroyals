// Sales-agent referral codes and commission tracking.
//
// Each agent gets a short code (e.g. SALES01). A customer types it at
// checkout, the order records it, and this module totals up what each agent
// has earned.
//
// Two nodes on purpose:
//   agents/$CODE       full record incl. commission rate — admin-only read
//   agent-codes/$CODE  { name, active } — world-readable so the checkout page
//                      can validate a code without exposing pay rates or the
//                      full agent roster.
// Both are written in one atomic multi-path update so they can never drift.
const agentsAdmin = (() => {
    const esc = (str) => String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const db = () => firebase.database();

    // Referral codes are exactly 4 letters/numbers — short enough for an agent
    // to say over the phone, and 36^4 (1.6m) combinations is far more than a
    // flower shop will ever need.
    const CODE_LENGTH = 4;
    const CODE_PATTERN = /^[A-Z0-9]{4}$/;

    let agents = {};
    let orders = [];
    let currentMonth = 'all';

    const init = () => {
        db().ref('agents').on('value', snap => {
            agents = {};
            if (snap.exists()) {
                snap.forEach(child => { agents[child.key] = { key: child.key, ...child.val() }; });
            }
            render();
        }, err => {
            const list = document.getElementById('agents-list');
            if (list) list.innerHTML = '<div class="empty-state" style="padding:20px 0;color:#dc2626;">Permission denied. Check database rules.</div>';
            console.error('Agents read error:', err);
        });

        // Orders drive the commission report. Read-only here; the orders
        // section owns its own listener.
        db().ref('orders').on('value', snap => {
            orders = [];
            if (snap.exists()) snap.forEach(c => { orders.push({ key: c.key, ...c.val() }); });
            render();
        }, () => {});

        setupForm();
    };

    const setupForm = () => {
        const form = document.getElementById('agent-form');
        if (form) form.addEventListener('submit', handleAdd);

        const codeEl = document.getElementById('agent-code');
        if (codeEl) {
            codeEl.addEventListener('input', () => {
                // Codes live as database keys, so restrict to characters that
                // are legal there and unambiguous when read aloud to a
                // customer. Capped at CODE_LENGTH so typing simply stops.
                codeEl.value = codeEl.value.toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, CODE_LENGTH);
            });
        }

        const monthEl = document.getElementById('agent-month-filter');
        if (monthEl) monthEl.addEventListener('change', () => { currentMonth = monthEl.value; render(); });
    };

    const handleAdd = (e) => {
        e.preventDefault();
        const code = (document.getElementById('agent-code')?.value || '').trim().toUpperCase();
        const name = (document.getElementById('agent-name')?.value || '').trim();
        const rate = parseFloat(document.getElementById('agent-rate')?.value || '');

        if (!code) { toast('Enter a referral code', 'warning'); return; }
        if (!CODE_PATTERN.test(code)) {
            toast('Referral code must be exactly ' + CODE_LENGTH + ' letters or numbers', 'warning'); return;
        }
        if (!name) { toast('Enter the agent’s name', 'warning'); return; }
        if (isNaN(rate) || rate < 0 || rate > 100) { toast('Commission must be between 0 and 100%', 'warning'); return; }
        if (agents[code]) { toast('That code already exists', 'warning'); return; }

        const now = new Date().toISOString();
        db().ref().update({
            ['agents/' + code]:      { code, name, commissionRate: rate, active: true, createdAt: now },
            ['agent-codes/' + code]: { name, active: true }
        }).then(() => {
            toast('Agent added');
            document.getElementById('agent-form')?.reset();
        }).catch(err => toast('Error: ' + err.message, 'error'));
    };

    const toggle = (code) => {
        const a = agents[code];
        if (!a) return;
        const next = !a.active;
        db().ref().update({
            ['agents/' + code + '/active']: next,
            ['agent-codes/' + code + '/active']: next
        }).then(() => toast(next ? 'Agent enabled' : 'Agent disabled'))
          .catch(err => toast('Error: ' + err.message, 'error'));
    };

    const editRate = (code) => {
        const a = agents[code];
        if (!a) return;
        const input = prompt('Commission rate for ' + a.name + ' (%)', a.commissionRate);
        if (input === null) return;
        const rate = parseFloat(input);
        if (isNaN(rate) || rate < 0 || rate > 100) { toast('Enter a number between 0 and 100', 'warning'); return; }
        db().ref('agents/' + code + '/commissionRate').set(rate)
            .then(() => toast('Commission rate updated'))
            .catch(err => toast('Error: ' + err.message, 'error'));
    };

    const remove = (code) => {
        const a = agents[code];
        if (!a) return;
        if (!confirm('Delete agent "' + a.name + '" (' + code + ')?\n\nOrders already referred by this code keep their record.')) return;
        db().ref().update({
            ['agents/' + code]: null,
            ['agent-codes/' + code]: null
        }).then(() => toast('Agent deleted'))
          .catch(err => toast('Error: ' + err.message, 'error'));
    };

    // Commission is paid on the value of the goods — the item subtotal less
    // any coupon discount. Delivery fees and time-slot surcharges are pass-
    // through costs, not agent-earned revenue.
    const commissionBase = (o) => {
        const sub = parseFloat(o.subtotal);
        const disc = parseFloat(o.discount) || 0;
        const base = !isNaN(sub) ? sub - disc : (parseFloat(o.total) || 0);
        return Math.max(0, base);
    };

    const monthKey = (o) => (o.timestamp || '').slice(0, 7);

    const render = () => {
        renderMonths();
        renderList();
    };

    const renderMonths = () => {
        const sel = document.getElementById('agent-month-filter');
        if (!sel) return;
        const months = [...new Set(orders.filter(o => o.agentCode).map(monthKey).filter(Boolean))].sort().reverse();
        const opts = ['<option value="all">All time</option>'].concat(months.map(m => {
            const d = new Date(m + '-01T00:00:00');
            const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
            return '<option value="' + m + '">' + esc(label) + '</option>';
        }));
        const keep = currentMonth;
        sel.innerHTML = opts.join('');
        if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
        else { sel.value = 'all'; currentMonth = 'all'; }
    };

    const renderList = () => {
        const list = document.getElementById('agents-list');
        if (!list) return;

        const arr = Object.values(agents).sort((a, b) => {
            if (a.active !== b.active) return b.active ? 1 : -1;
            return (a.name || '').localeCompare(b.name || '');
        });

        // Only paid orders count toward commission — an unpaid or failed
        // order hasn't earned the shop anything yet.
        const scoped = orders.filter(o =>
            o.agentCode &&
            o.paymentStatus === 'paid' &&
            o.status !== 'cancelled' &&
            (currentMonth === 'all' || monthKey(o) === currentMonth));

        const byAgent = {};
        scoped.forEach(o => {
            const c = String(o.agentCode).toUpperCase();
            (byAgent[c] = byAgent[c] || []).push(o);
        });

        // Totals strip
        const statsEl = document.getElementById('agents-stats');
        if (statsEl) {
            const totalSales = scoped.reduce((n, o) => n + commissionBase(o), 0);
            const totalComm = Object.keys(byAgent).reduce((n, code) => {
                const rate = agents[code] ? (parseFloat(agents[code].commissionRate) || 0) : 0;
                return n + byAgent[code].reduce((m, o) => m + commissionBase(o) * rate / 100, 0);
            }, 0);
            const tile = (cls, value, label, sub) =>
                '<div class="stat-tile ' + cls + '">' +
                    '<div class="stat-tile-value">' + value + '</div>' +
                    '<div class="stat-tile-label">' + label + '</div>' +
                    (sub ? '<div class="stat-tile-sub">' + sub + '</div>' : '') +
                '</div>';
            statsEl.innerHTML =
                tile('stat-today',   arr.filter(a => a.active).length, 'Active Agents', arr.length + ' total') +
                tile('stat-pending', scoped.length,                    'Referred Orders', 'paid orders only') +
                tile('stat-revenue', 'AED ' + totalSales.toFixed(2),   'Referred Sales', 'goods value') +
                tile('stat-reviews', 'AED ' + totalComm.toFixed(2),    'Commission Owed', 'at current rates');
        }

        if (!arr.length) {
            list.innerHTML = '<div class="empty-state" style="padding:20px 0;">No agents yet. Add one above.</div>';
            return;
        }

        list.innerHTML = '';
        arr.forEach(a => {
            const mine = byAgent[a.key] || [];
            const sales = mine.reduce((n, o) => n + commissionBase(o), 0);
            const rate = parseFloat(a.commissionRate) || 0;
            const comm = sales * rate / 100;

            const row = document.createElement('div');
            row.className = 'admin-agent-row' + (!a.active ? ' inactive' : '');
            row.innerHTML =
                '<div class="agent-code-chip">' + esc(a.key) + '</div>' +
                '<div class="agent-details">' +
                    '<span class="agent-name-text">' + esc(a.name) + '</span>' +
                    '<span class="agent-meta-text">' + rate + '% commission' +
                        (a.active ? '' : ' · <strong>disabled</strong>') + '</span>' +
                '</div>' +
                '<div class="agent-figures">' +
                    '<div class="agent-figure">' +
                        '<span class="agent-figure-value">' + mine.length + '</span>' +
                        '<span class="agent-figure-label">orders</span>' +
                    '</div>' +
                    '<div class="agent-figure">' +
                        '<span class="agent-figure-value">' + sales.toFixed(2) + '</span>' +
                        '<span class="agent-figure-label">sales AED</span>' +
                    '</div>' +
                    '<div class="agent-figure agent-figure-comm">' +
                        '<span class="agent-figure-value">' + comm.toFixed(2) + '</span>' +
                        '<span class="agent-figure-label">commission</span>' +
                    '</div>' +
                '</div>' +
                '<div class="agent-actions">' +
                    '<button class="agent-rate-btn" data-code="' + esc(a.key) + '">Rate</button>' +
                    '<button class="agent-toggle-btn ' + (a.active ? 'is-active' : 'is-inactive') + '" data-code="' + esc(a.key) + '">' +
                        (a.active ? 'Disable' : 'Enable') + '</button>' +
                    '<button class="agent-delete-btn" data-code="' + esc(a.key) + '">Delete</button>' +
                '</div>';

            row.querySelector('.agent-rate-btn').addEventListener('click', () => editRate(a.key));
            row.querySelector('.agent-toggle-btn').addEventListener('click', () => toggle(a.key));
            row.querySelector('.agent-delete-btn').addEventListener('click', () => remove(a.key));
            list.appendChild(row);
        });
    };

    // Commission statement, one row per referred order — what you'd hand the
    // agent when paying them.
    const exportCsv = () => {
        const scoped = orders.filter(o =>
            o.agentCode &&
            o.paymentStatus === 'paid' &&
            o.status !== 'cancelled' &&
            (currentMonth === 'all' || monthKey(o) === currentMonth));

        if (!scoped.length) { toast('No referred orders to export', 'warning'); return; }

        const header = ['Date', 'Agent Code', 'Agent Name', 'Order ID', 'Customer',
            'Goods Value (AED)', 'Commission Rate (%)', 'Commission (AED)', 'Order Status'];
        const rows = scoped
            .sort((a, b) => String(a.agentCode).localeCompare(String(b.agentCode))
                || new Date(a.timestamp) - new Date(b.timestamp))
            .map(o => {
                const code = String(o.agentCode).toUpperCase();
                const a = agents[code];
                const rate = a ? (parseFloat(a.commissionRate) || 0) : 0;
                const base = commissionBase(o);
                return [
                    o.timestamp ? new Date(o.timestamp).toLocaleDateString('en-GB') : '',
                    code,
                    (a && a.name) || o.agentName || '',
                    o.key,
                    (o.customer && o.customer.name) || '',
                    base.toFixed(2),
                    rate,
                    (base * rate / 100).toFixed(2),
                    o.status || ''
                ];
            });

        const csv = [header].concat(rows)
            .map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','))
            .join('\r\n');

        const blob = new Blob([String.fromCharCode(0xFEFF) + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'velvet-royals-commissions-' +
            (currentMonth === 'all' ? 'all-time' : currentMonth) + '.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 5000);
        toast('Exported ' + rows.length + ' referred order' + (rows.length !== 1 ? 's' : ''));
    };

    const toast = (message, type = 'success') => {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();
        const t = document.createElement('div');
        t.className = 'toast-notification ' + type;
        t.textContent = message;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
    };

    return { init, exportCsv };
})();
