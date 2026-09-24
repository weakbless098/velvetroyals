// Messages sent through the Contact page (contactMessages). Only admins can
// read them — see database.rules.json.
const messagesAdmin = (() => {
    const esc = (str) => String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const ref = () => firebase.database().ref('contactMessages');

    let messages = [];

    const init = () => {
        ref().orderByChild('sentAt').on('value', snap => {
            messages = [];
            snap.forEach(child => { messages.unshift({ key: child.key, ...child.val() }); });
            render();
        }, err => {
            const list = document.getElementById('admin-messages-list');
            if (list) list.innerHTML = '<div class="empty-state" style="color:#dc2626;">Permission denied. Check database rules.</div>';
            console.error('Messages read error:', err);
        });
    };

    // Same normalisation the order cards use, so "050 744 3100" opens the
    // right WhatsApp chat.
    const waNumber = (phone) => {
        let p = String(phone || '').replace(/\D/g, '');
        if (p.startsWith('00')) p = p.slice(2);
        if (p.startsWith('0')) p = '971' + p.slice(1);
        else if (p.length === 9) p = '971' + p;
        return p;
    };

    const render = () => {
        const list  = document.getElementById('admin-messages-list');
        const badge = document.getElementById('messages-badge');
        const label = document.getElementById('messages-count-label');
        const unread = messages.filter(m => m.status !== 'read').length;
        if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'inline-flex' : 'none'; }
        if (label) { label.textContent = unread > 0 ? '(' + unread + ' unread)' : ''; label.style.display = unread > 0 ? '' : 'none'; }
        if (!list) return;

        if (!messages.length) {
            list.innerHTML = '<div class="empty-state">No messages yet.</div>';
            return;
        }

        list.innerHTML = messages.map(m => {
            const isUnread = m.status !== 'read';
            const when = m.sentAt ? new Date(m.sentAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
            const wa = waNumber(m.phone);
            return '<div class="admin-review-card admin-message-card' + (isUnread ? ' admin-message-unread' : '') + '">' +
                '<div class="admin-review-left"><div class="admin-review-avatar">' + esc((m.name || '?').charAt(0).toUpperCase()) + '</div></div>' +
                '<div class="admin-review-body">' +
                    '<div class="admin-review-top">' +
                        '<span class="admin-review-name">' + esc(m.name) + '</span>' +
                        (m.subject ? '<span class="admin-review-badge badge-member">' + esc(m.subject) + '</span>' : '') +
                        '<span class="admin-review-date">' + esc(when) + '</span>' +
                        (isUnread ? '<span class="admin-review-badge badge-guest">New</span>' : '') +
                    '</div>' +
                    '<div class="admin-message-contact">' +
                        (m.phone ? '<span>' + esc(m.phone) + '</span>' : '') +
                        (m.email ? '<a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a>' : '') +
                    '</div>' +
                    '<p class="admin-review-text admin-message-text">' + esc(m.message) + '</p>' +
                    '<div class="admin-message-actions">' +
                        (wa ? '<a class="admin-status-btn btn-whatsapp-pay" href="https://api.whatsapp.com/send?phone=' + wa + '" target="_blank" rel="noopener">Reply on WhatsApp</a>' : '') +
                        (isUnread ? '<button type="button" class="admin-status-btn btn-advance" data-read="' + esc(m.key) + '">Mark as read</button>' : '') +
                    '</div>' +
                '</div>' +
                '<button class="admin-review-delete" data-delete="' + esc(m.key) + '" aria-label="Delete message" title="Delete">' +
                    '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
                '</button>' +
            '</div>';
        }).join('');

        list.querySelectorAll('[data-read]').forEach(btn =>
            btn.addEventListener('click', () => ref().child(btn.dataset.read).update({ status: 'read' })));
        list.querySelectorAll('[data-delete]').forEach(btn =>
            btn.addEventListener('click', () => {
                if (!confirm('Delete this message? This cannot be undone.')) return;
                ref().child(btn.dataset.delete).remove();
            }));
    };

    return { init };
})();
