// Removes product photos from Firebase Storage that nothing uses any more
// (admin → Inventory → Clean Up Photos), and removes a product's photo when
// the product is deleted or its photo is replaced.
//
// A photo is always kept when:
//  • any product uses it (hidden products included, unless the admin chooses
//    to delete those products too);
//  • the website's own pages or scripts point at it (homepage collection
//    tiles, the fallback picture) — read live, so later edits are covered;
//  • it was uploaded in the last 24 hours, because it may belong to a product
//    someone is still filling in.
(function (global) {
    const esc = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const $ = (id) => document.getElementById(id);
    // crud is a top-level const in crud.js, so it is not a property of window.
    const toast = (msg, type) => (typeof crud !== 'undefined' && crud.showToast) ? crud.showToast(msg, type) : console.log(msg);
    const mb = (bytes) => (bytes / 1048576).toFixed(1) + ' MB';
    const plural = (n, word) => n + ' ' + word + (n !== 1 ? 's' : '');

    const RECENT_MS = 24 * 60 * 60 * 1000;
    // Pages and files whose HTML, JS or CSS may link straight to a Storage photo.
    const SITE_FILES = ['/', '/products', '/product', '/about', '/contact', '/cart', '/wishlist', '/orders',
        '/404.html', '/js/app.js', '/js/utils.js', '/js/reviews.js', '/css/styles.css'];

    const bucket = () => firebase.app().options.storageBucket;

    // "products/<file>" for a photo in this project's bucket, otherwise null.
    const storagePath = (url) => {
        const s = String(url || '');
        const m = s.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?#]+)/)
               || s.match(/storage\.googleapis\.com\/([^/]+)\/(products\/[^?#]+)/);
        if (!m || m[1] !== bucket()) return null;
        let path;
        try { path = decodeURIComponent(m[2]); } catch (e) { return null; }
        return path.startsWith('products/') ? path : null;
    };

    const publicUrl = (path) =>
        'https://firebasestorage.googleapis.com/v0/b/' + bucket() + '/o/' + encodeURIComponent(path) + '?alt=media';

    // Photos the website itself links to. Throws when a file can't be read, so
    // nothing is deleted on a guess.
    let _sitePhotos = null;
    const sitePhotos = () => {
        if (!_sitePhotos) {
            _sitePhotos = Promise.all(SITE_FILES.map(f =>
                fetch(f, { cache: 'no-store' }).then(r => {
                    if (!r.ok) throw new Error('Could not read ' + f + ' (' + r.status + ')');
                    return r.text();
                })))
                .then(texts => {
                    const found = new Set();
                    const re = /products(?:\/|%2F)([^"'?#&)\s\\`<>]+)/gi;
                    texts.forEach(t => {
                        for (const m of t.matchAll(re)) {
                            try { found.add('products/' + decodeURIComponent(m[1])); } catch (e) { /* not a file name */ }
                        }
                    });
                    return found;
                })
                .catch(e => { _sitePhotos = null; throw e; });
        }
        return _sitePhotos;
    };

    // Map of Storage path → products using it.
    const usedByProducts = (flowers) => {
        const used = new Map();
        Object.entries(flowers || {}).forEach(([id, p]) => {
            const path = p && storagePath(p.image);
            if (!path) return;
            if (!used.has(path)) used.set(path, []);
            used.get(path).push({ id, name: String(p.name || '').trim(), hidden: p.hidden === true });
        });
        return used;
    };

    // Deleting needs the admin claim that auth.js refreshes on page load.
    const claimReady = () => (typeof authModule !== 'undefined' && authModule.adminClaimReady) ? authModule.adminClaimReady() : Promise.resolve();

    const readFlowers = async () => (await firebase.database().ref('flowers').once('value')).val() || {};

    // Deletes the photo behind `url` unless a product or the website still uses
    // it. Reads the catalogue fresh, so call it after the product change is saved.
    const deleteIfUnused = async (url) => {
        const path = storagePath(url);
        if (!path) return false;
        try {
            if (usedByProducts(await readFlowers()).has(path)) return false;
            if ((await sitePhotos()).has(path)) return false;
            await claimReady();
            await firebase.storage().ref(path).delete();
            return true;
        } catch (e) {
            if (e && e.code === 'storage/object-not-found') return false;
            console.warn('Photo kept — could not check or delete it:', path, e);
            return false;
        }
    };

    const inBatches = async (items, size, fn) => {
        const out = [];
        for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
        return out;
    };

    const listAllFiles = async (ref) => {
        const res = await ref.listAll();
        const nested = await Promise.all(res.prefixes.map(listAllFiles));
        return res.items.concat(...nested);
    };

    const scan = async () => {
        _sitePhotos = null;
        const [files, flowers, site] = await Promise.all([
            listAllFiles(firebase.storage().ref('products')), readFlowers(), sitePhotos()
        ]);
        const used = usedByProducts(flowers);
        const plan = { total: files.length, inUse: 0, site: 0, recent: [], unused: [], hiddenOnly: [], hiddenProducts: [] };
        const candidates = [];
        files.forEach(ref => {
            const users = used.get(ref.fullPath);
            if (users && users.some(u => !u.hidden)) plan.inUse++;
            else if (site.has(ref.fullPath)) plan.site++;
            else candidates.push({ ref, path: ref.fullPath, users });
        });
        const now = Date.now();
        (await inBatches(candidates, 20, async c => {
            const m = await c.ref.getMetadata();
            return { ...c, size: +m.size || 0, created: Date.parse(m.timeCreated) || now };
        })).forEach(c => {
            if (c.users) plan.hiddenOnly.push(c);
            else if (now - c.created < RECENT_MS) plan.recent.push(c);
            else plan.unused.push(c);
        });
        plan.unused.sort((a, b) => a.created - b.created);
        plan.hiddenProducts = Object.entries(flowers)
            .filter(([, p]) => p && p.hidden === true)
            .map(([id, p]) => ({ id, name: String(p.name || '').trim() || '(no name)' }));
        return plan;
    };

    // ── Admin window ─────────────────────────────────────────────────────
    let plan = null;
    let busy = false;

    const targets = () => {
        if (!plan) return [];
        return plan.unused.concat($('photo-cleanup-hidden') && $('photo-cleanup-hidden').checked ? plan.hiddenOnly : []);
    };

    const setApply = () => {
        const btn = $('photo-cleanup-apply');
        if (!btn) return;
        const list = targets();
        const withHidden = plan && $('photo-cleanup-hidden') && $('photo-cleanup-hidden').checked && plan.hiddenProducts.length;
        btn.disabled = busy || !(list.length || withHidden);
        btn.textContent = list.length || withHidden
            ? 'Delete ' + plural(list.length, 'photo') + ' (' + mb(list.reduce((s, c) => s + c.size, 0)) + ')' +
              (withHidden ? ' + ' + plural(plan.hiddenProducts.length, 'hidden product') : '')
            : 'Delete photos';
    };

    const renderPlan = () => {
        const unusedBytes = plan.unused.reduce((s, c) => s + c.size, 0);
        const kept = [];
        if (plan.site) kept.push(plural(plan.site, 'photo') + ' the website pages link to directly (homepage tiles, fallback picture)');
        if (plan.recent.length) kept.push(plural(plan.recent.length, 'photo') + ' uploaded in the last 24 hours — possibly for a product still being added');
        $('photo-cleanup-body').innerHTML =
            '<div class="price-import-summary">' +
                '<span class="pi-chip">' + plural(plan.total, 'photo') + ' in storage</span>' +
                '<span class="pi-chip">' + plan.inUse + ' used by products</span>' +
                '<span class="pi-chip ' + (plan.unused.length ? 'pi-chip-bad' : 'pi-chip-change') + '">' + plan.unused.length + ' unused (' + mb(unusedBytes) + ')</span>' +
            '</div>' +
            (plan.unused.length
                ? '<p class="price-import-hint">These photos don’t belong to any product on the website — left behind by deleted products, replaced photos or uploads that were never saved.</p>' +
                  '<div class="photo-cleanup-grid">' + plan.unused.map(c =>
                      '<figure title="' + esc(c.path.replace('products/', '')) + ' — ' + esc(mb(c.size)) + '">' +
                          '<img src="' + esc(publicUrl(c.path)) + '" alt="" loading="lazy" decoding="async">' +
                      '</figure>').join('') + '</div>'
                : '<p class="price-import-empty">Every photo in storage is used. Nothing to clean up.</p>') +
            (plan.hiddenProducts.length
                ? '<label class="photo-cleanup-hidden">' +
                      '<input type="checkbox" id="photo-cleanup-hidden" onchange="photoCleanup._refresh()">' +
                      '<span><strong>Also delete the ' + plural(plan.hiddenProducts.length, 'hidden product') + ' and ' + (plan.hiddenOnly.length === 1 ? 'its photo' : 'their photos') + '</strong>' +
                      '<small>Hidden products are not shown on the website: ' + plan.hiddenProducts.map(p => esc(p.name)).join(', ') + '</small></span>' +
                  '</label>'
                : '') +
            (kept.length ? '<p class="photo-cleanup-kept"><strong>Kept automatically:</strong> ' + kept.map(esc).join('; ') + '.</p>' : '') +
            '<p class="photo-cleanup-warning">Deleted photos can’t be restored from here.</p>';
        setApply();
    };

    const showError = (message) => {
        $('photo-cleanup-body').innerHTML =
            '<div class="price-import-error">' + esc(message) + '</div>' +
            '<button type="button" class="price-import-again" onclick="photoCleanup.open()">Try again</button>';
        plan = null;
        setApply();
    };

    const open = async () => {
        const modal = $('photo-cleanup-modal');
        if (!modal) return;
        modal.classList.add('active');
        plan = null;
        setApply();
        $('photo-cleanup-body').innerHTML = '<p class="price-import-file">Checking every photo in storage…</p>';
        try {
            plan = await scan();
            renderPlan();
        } catch (e) {
            console.error('Photo check failed:', e);
            showError('Couldn’t check the photos, so nothing was deleted. ' + (e.message || e));
        }
    };

    const close = () => {
        if (busy) return;
        const modal = $('photo-cleanup-modal');
        if (modal) modal.classList.remove('active');
        plan = null;
    };

    const apply = async () => {
        if (!plan || busy) return;
        const removeHidden = !!($('photo-cleanup-hidden') && $('photo-cleanup-hidden').checked);
        busy = true;
        setApply();
        const status = (text) => { $('photo-cleanup-body').innerHTML = '<p class="price-import-file">' + esc(text) + '</p>'; };
        try {
            // Re-read everything right before deleting, so a photo that a product
            // started using since the check is kept.
            status('Double-checking the catalogue…');
            _sitePhotos = null;
            const [flowers, site] = await Promise.all([readFlowers(), sitePhotos(), claimReady()]);
            let removedProducts = 0;
            if (removeHidden) {
                const updates = {};
                plan.hiddenProducts.forEach(p => {
                    if (flowers[p.id] && flowers[p.id].hidden === true) {
                        updates['flowers/' + p.id] = null;
                        delete flowers[p.id];
                        removedProducts++;
                    }
                });
                if (removedProducts) await firebase.database().ref().update(updates);
            }
            const used = usedByProducts(flowers);
            const list = plan.unused.concat(removeHidden ? plan.hiddenOnly : [])
                .filter(c => !used.has(c.path) && !site.has(c.path));
            let done = 0, freed = 0;
            const failed = [];
            await inBatches(list, 6, async c => {
                try { await c.ref.delete(); freed += c.size; }
                catch (e) { if (!e || e.code !== 'storage/object-not-found') failed.push(c.path.replace('products/', '')); }
                done++;
                status('Deleting photos… ' + done + ' / ' + list.length);
            });
            const deleted = list.length - failed.length;
            $('photo-cleanup-body').innerHTML =
                '<div class="price-import-summary">' +
                    '<span class="pi-chip pi-chip-change">' + plural(deleted, 'photo') + ' deleted — ' + mb(freed) + ' freed</span>' +
                    (removedProducts ? '<span class="pi-chip pi-chip-change">' + plural(removedProducts, 'hidden product') + ' deleted</span>' : '') +
                    (failed.length ? '<span class="pi-chip pi-chip-bad">' + failed.length + ' could not be deleted</span>' : '') +
                '</div>' +
                (failed.length ? '<div class="price-import-problems"><strong>Not deleted:</strong><ul>' + failed.slice(0, 30).map(f => '<li>' + esc(f) + '</li>').join('') + '</ul></div>' : '') +
                '<button type="button" class="price-import-again" onclick="photoCleanup.open()">Check again</button>';
            toast(plural(deleted, 'unused photo') + ' deleted' + (removedProducts ? ' and ' + plural(removedProducts, 'hidden product') + ' removed' : ''));
            plan = null;
        } catch (e) {
            console.error('Photo clean-up failed:', e);
            showError('The clean-up stopped: ' + (e.message || e) + '. Photos still in use were not touched.');
        } finally {
            busy = false;
            setApply();
        }
    };

    global.photoCleanup = {
        open, close, apply, deleteIfUnused,
        _refresh: setApply,
        // exposed for tests
        _storagePath: storagePath, _usedByProducts: usedByProducts
    };
})(typeof window !== 'undefined' ? window : globalThis);
