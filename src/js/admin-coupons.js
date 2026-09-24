const couponsAdmin = (() => {
    const esc = (str) => String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const ref = () => firebase.database().ref('coupons');

    let coupons = {};
    let seeded = false;

    const DEFAULTS = [
        { code: 'VELVET10', type: 'percent',  value: 10, label: '10% off',       active: true },
        { code: 'VELVET20', type: 'percent',  value: 20, label: '20% off',       active: true },
        { code: 'WELCOME',  type: 'fixed',    value: 15, label: 'AED 15 off',    active: true }
    ];

    const init = () => {
        ref().on('value', snap => {
            coupons = {};
            if (snap.exists()) {
                snap.forEach(child => {
                    const c = child.val();
                    coupons[child.key] = { key: child.key, ...c };
                });
            }
            if (!seeded && Object.keys(coupons).length === 0) {
                seeded = true;
                // Keyed by code (not push()) so concurrent seeding from two
                // admin sessions is idempotent instead of duplicating.
                DEFAULTS.forEach(c => {
                    ref().child(c.code).set({ ...c, createdAt: new Date().toISOString() });
                });
                return;
            }
            render();
        }, err => {
            const list = document.getElementById('coupons-list');
            if (list) list.innerHTML = '<div class="empty-state" style="padding:20px 0;color:#dc2626;">Permission denied. Check database rules.</div>';
            console.error('Coupons read error:', err);
        });
        setupForm();
    };

    const setupForm = () => {
        const form = document.getElementById('coupon-form');
        if (!form) return;
        form.addEventListener('submit', handleAdd);

        const typeEl = document.getElementById('coupon-type');
        const valGroup = document.getElementById('coupon-value-group');
        if (typeEl && valGroup) {
            typeEl.addEventListener('change', () => {
                valGroup.style.display = '';
            });
        }

        const codeEl    = document.getElementById('coupon-code');
        const previewEl = document.getElementById('coupon-code-preview');
        if (codeEl) {
            codeEl.addEventListener('input', () => {
                codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (previewEl) {
                    const v = codeEl.value.trim();
                    previewEl.textContent = v || '';
                    previewEl.classList.toggle('visible', v.length > 0);
                }
            });
        }
    };

    const handleAdd = (e) => {
        e.preventDefault();
        const code   = (document.getElementById('coupon-code')?.value || '').trim().toUpperCase();
        const type   = document.getElementById('coupon-type')?.value || 'percent';
        const rawVal = parseFloat(document.getElementById('coupon-value')?.value || '0');
        const value  = rawVal;
        const expiry = document.getElementById('coupon-expiry')?.value || null;

        if (!code) { toast('Enter a coupon code', 'warning'); return; }
        if (type !== 'percent' && type !== 'fixed') {
            toast('Unsupported coupon type.', 'warning'); return;
        }
        if (isNaN(value) || value <= 0) {
            toast('Enter a valid discount value', 'warning'); return;
        }
        if (type === 'percent' && value > 100) {
            toast('Percent discount cannot exceed 100', 'warning'); return;
        }

        const duplicate = Object.values(coupons).find(c => c.code === code);
        if (duplicate) { toast('That code already exists', 'warning'); return; }

        const label = type === 'percent'  ? value + '% off'
                    : type === 'fixed'    ? 'AED ' + value + ' off'
                    : 'Unsupported coupon type';

        ref().push().set({
            code, type, value, label, active: true,
            expiry: expiry || null,
            createdAt: new Date().toISOString()
        }).then(() => {
            toast('Coupon added');
            document.getElementById('coupon-form')?.reset();
            const valGroup  = document.getElementById('coupon-value-group');
            const previewEl = document.getElementById('coupon-code-preview');
            if (valGroup)  valGroup.style.display = '';
            if (previewEl) { previewEl.textContent = ''; previewEl.classList.remove('visible'); }
        }).catch(err => toast('Error: ' + err.message, 'error'));
    };

    const toggle = (key) => {
        const c = coupons[key];
        if (!c) return;
        ref().child(key).update({ active: !c.active })
            .then(() => toast(c.active ? 'Coupon disabled' : 'Coupon enabled'))
            .catch(err => toast('Error: ' + err.message, 'error'));
    };

    const remove = (key) => {
        const c = coupons[key];
        if (!c) return;
        if (!confirm('Delete coupon "' + c.code + '"? This cannot be undone.')) return;
        ref().child(key).remove()
            .then(() => toast('Coupon deleted'))
            .catch(err => toast('Error: ' + err.message, 'error'));
    };

    const render = () => {
        const list = document.getElementById('coupons-list');
        if (!list) return;

        const arr = Object.values(coupons).sort((a, b) => {
            if (a.active !== b.active) return b.active ? 1 : -1;
            return (a.code || '').localeCompare(b.code || '');
        });

        if (!arr.length) {
            list.innerHTML = '<div class="empty-state" style="padding:20px 0;">No coupons yet.</div>';
            return;
        }

        const today = new Date().toISOString().slice(0, 10);
        list.innerHTML = '';

        arr.forEach(c => {
            const expired = c.expiry && c.expiry < today;
            const typeLabel = c.type === 'percent'  ? c.value + '% off'
                            : c.type === 'fixed'    ? 'AED ' + c.value + ' off'
                            : 'Unsupported coupon type';
            const expiryBadge = expired
                ? ' <span class="coupon-expired-tag">EXPIRED</span>'
                : c.expiry
                    ? ' · expires ' + c.expiry
                    : '';

            const row = document.createElement('div');
            row.className = 'admin-coupon-row' + (!c.active ? ' inactive' : '');
            row.innerHTML =
                '<div class="coupon-code-chip">' + esc(c.code) + '</div>' +
                '<div class="coupon-details">' +
                    '<span class="coupon-label-text">' + esc(c.label) + '</span>' +
                    '<span class="coupon-meta-text">' + esc(typeLabel) + expiryBadge + '</span>' +
                '</div>' +
                '<div class="coupon-actions">' +
                    '<button class="coupon-toggle-btn ' + (c.active ? 'is-active' : 'is-inactive') + '" ' +
                        'data-key="' + esc(c.key) + '">' +
                        (c.active ? 'Disable' : 'Enable') +
                    '</button>' +
                    '<button class="coupon-delete-btn" data-key="' + esc(c.key) + '">Delete</button>' +
                '</div>';

            row.querySelector('.coupon-toggle-btn').addEventListener('click', () => toggle(c.key));
            row.querySelector('.coupon-delete-btn').addEventListener('click', () => remove(c.key));
            list.appendChild(row);
        });
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

    return { init, toggle, delete: remove };
})();
