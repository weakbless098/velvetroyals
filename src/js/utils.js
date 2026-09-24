function formatCurrency(amount) {
    return `AED ${parseFloat(amount).toFixed(2)}`;
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

function getElementById(id) {
    return document.getElementById(id);
}

// ── Guest order tracking: contact hashing ──
// The public order-tracking node stores SHA-256 hashes of the customer's
// email/phone instead of the values themselves. Checkout (app.js) writes
// them and guest lookup (orders.js) compares them — the normalization here
// must stay identical on both sides.
function normalizeContactEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeContactPhone(phone) {
    // Last 9 digits so "+971 50 744 3100" and "0507443100" hash the same.
    return String(phone || '').replace(/\D/g, '').slice(-9);
}

async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showAlert(message) {
    alert(message);
}

// Adds a brand header and social footer to the slide-in drawer.
// Injected here so every page gets it without editing each HTML file;
// visible only at mobile widths (see responsive.css).
function decorateMobileDrawer(nav) {
    if (nav.querySelector('.drawer-brand')) return;

    const brand = document.createElement('div');
    brand.className = 'drawer-brand';
    brand.innerHTML =
        '<span class="drawer-brand-name">Velvet Royals</span>' +
        '<span class="drawer-brand-tagline">FLOWERS · GIFTS</span>';
    nav.insertBefore(brand, nav.firstChild);

    const social = document.createElement('div');
    social.className = 'drawer-social';
    social.innerHTML =
        '<div class="drawer-social-icons">' +
            '<a href="https://www.instagram.com/velvet_royals.ae?utm_source=qr&igsh=MW10NWowcXU5bXMyeA%3D%3D" aria-label="Instagram" target="_blank" rel="noopener"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>' +
            '<a href="https://api.whatsapp.com/send?phone=971507443100&text=Hi%20Velvet%20Royals!" aria-label="WhatsApp" target="_blank" rel="noopener"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg></a>' +
            '<a href="https://www.tiktok.com/@velvet.royals_flowershop?_r=1&_t=ZS-97RZqcRzIDS" aria-label="TikTok" target="_blank" rel="noopener"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.16 8.16 0 0 0 4.77 1.52V6.73a4.85 4.85 0 0 1-1-.04z"/></svg></a>' +
        '</div>' +
        '<span class="drawer-contact">+971 50 744 3100 · Dubai, UAE</span>';
    nav.appendChild(social);
}

function initMobileNav() {
    const burger  = document.getElementById('nav-burger');
    const nav     = document.getElementById('main-nav');
    const overlay = document.getElementById('nav-overlay');
    if (!burger || !nav) return;

    decorateMobileDrawer(nav);

    const open = () => {
        nav.classList.add('open');
        overlay && overlay.classList.add('open');
        burger.classList.add('open');
        burger.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    };

    const close = () => {
        nav.classList.remove('open');
        overlay && overlay.classList.remove('open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    };

    burger.addEventListener('click', () => {
        nav.classList.contains('open') ? close() : open();
    });

    overlay && overlay.addEventListener('click', close);

    nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', close);
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') close();
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) close();
    });
}

function closeNav() {
    const nav     = document.getElementById('main-nav');
    const overlay = document.getElementById('nav-overlay');
    const burger  = document.getElementById('nav-burger');
    if (nav)     nav.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    if (burger)  { burger.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
    document.body.style.overflow = '';
}

// Sitewide announcement bar — injected here (not copy-pasted into every
// page) so one change updates the whole site. Dismiss is remembered for the
// browser session only, so it reappears on a fresh visit.
// The shop opened on 1 August 2026; this now announces that it's trading,
// not that it's about to.
function initAnnouncementBar() {
    // New key: anyone who dismissed the old "opening next week" bar still
    // gets to see the "now open" one.
    const SESSION_KEY = 'rv_promo_nowopen_dismissed';
    const EXCLUDE = ['admin.html', 'login.html', 'cart.html', 'auth-action.html'];
    const file = (window.location.pathname.split('/').pop() || 'index.html');
    if (EXCLUDE.includes(file)) return;
    if (sessionStorage.getItem(SESSION_KEY) === '1') return;

    const isInPages = window.location.pathname.includes('/pages/');
    const shopUrl = (isInPages ? '' : 'pages/') + 'products.html?cat=arrangement';

    const bar = document.createElement('div');
    bar.className = 'rv-promo-bar';
    bar.innerHTML =
        '<a class="rv-promo-bar-link" href="' + shopUrl + '">' +
            '<span class="rv-promo-bar-badge">Now Open</span>' +
            '<span class="rv-promo-bar-text">We&rsquo;re open and ready to serve you &mdash; enjoy <strong>20&ndash;50% OFF</strong> premium arrangements</span>' +
            '<span class="rv-promo-bar-cta">Shop Now →</span>' +
        '</a>' +
        '<button class="rv-promo-bar-close" aria-label="Dismiss announcement">&times;</button>';

    document.body.insertBefore(bar, document.body.firstChild);

    bar.querySelector('.rv-promo-bar-close').addEventListener('click', () => {
        bar.remove();
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
    });
}

// ── Shared product-search vocabulary ─────────────────────────────────────
// Defined here because utils.js loads on every page, ahead of app.js. Both
// the header search and the products page use these, so the suggestions a
// customer sees can never promise more than the results page delivers.
const RV_OCCASION_LABELS = {
    birthday: 'Birthday', anniversary: 'Anniversary', wedding: 'Wedding',
    valentine: "Valentine's", getwell: 'Get Well', graduation: 'Graduation',
    baby: 'New Baby', romantic: 'Romantic', mothersday: "Mother's Day",
    fathersday: "Father's Day", congratulations: 'Congrats',
    bridalshower: 'Bridal Shower', babygirl: 'Baby Girl', babyboy: 'Baby Boy',
    babyshower: 'Baby Shower', corporate: 'Corporate', sympathy: 'Sympathy',
    christmas: 'Christmas', sorry: "I'm Sorry"
};
const RV_RECIPIENT_LABELS = {
    her: 'For Her', him: 'For Him', parents: 'For Parents',
    baby: 'For Baby', friend: 'For Friend'
};

// Free text a customer might type: the words actually printed on the card.
function rvSearchText(p) {
    return [p.name, p.description, p.category, p.perfectFor]
        .map(v => String(v || '')).join(' ').toLowerCase();
}

// Short metadata tags. Kept separate from the free text because these are
// matched with separators stripped, which is safe on a handful of short
// keywords but would invent false hits across a long description.
function rvSearchTags(p) {
    const occ = String(p.occasion || '');
    const rec = String(p.recipient || '');
    return [
        occ, RV_OCCASION_LABELS[occ] || '',
        rec, RV_RECIPIENT_LABELS[rec] || '',
        p.arrangementType
    ].map(v => String(v || '')).join(' ').toLowerCase();
}

// One matcher for both search boxes. Ignoring separators on the tags is what
// lets "baby shower" find occasion "babyshower" and "get well" find "getwell".
function rvMatchesSearch(p, q) {
    if (!q) return true;
    const term = String(q).toLowerCase().trim();
    if (!term) return true;
    if (rvSearchText(p).includes(term)) return true;
    const squash = (s) => s.replace(/[^a-z0-9]/g, '');
    return squash(rvSearchTags(p)).includes(squash(term));
}

// Sitewide search — a magnifier button beside the Velvet Royals brand that
// opens a slide-down search box with live product suggestions as you type.
// Submitting goes to the products page, which already reads ?q=.
// Injected here so every page gets it without editing each HTML file.
function initNavSearch() {
    const EXCLUDE = ['admin.html', 'login.html', 'auth-action.html'];
    const file = (window.location.pathname.split('/').pop() || 'index.html');
    if (EXCLUDE.includes(file)) return;

    const headerInner = document.querySelector('.header-inner');
    if (!headerInner || headerInner.querySelector('.rv-header-search-btn')) return;

    const isInPages = window.location.pathname.includes('/pages/');
    const productsUrl = (isInPages ? '' : 'pages/') + 'products.html';
    const productUrl  = (isInPages ? '' : 'pages/') + 'product.html';

    const magnifier = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

    // Button lives right beside the brand (h1), before the burger/nav.
    const btn = document.createElement('button');
    btn.className = 'rv-header-search-btn';
    btn.setAttribute('aria-label', 'Search products');
    btn.innerHTML = magnifier;
    const brandH1 = headerInner.querySelector('h1');
    if (brandH1) { brandH1.insertAdjacentElement('afterend', btn); }
    else { headerInner.insertBefore(btn, headerInner.firstElementChild); }

    const panel = document.createElement('div');
    panel.className = 'rv-search-overlay';
    panel.setAttribute('hidden', '');
    panel.innerHTML =
        '<div class="rv-search-panel" role="dialog" aria-label="Search products">' +
            '<form class="rv-search-form" action="' + productsUrl + '" method="get">' +
                magnifier +
                '<input type="search" name="q" class="rv-search-input" placeholder="Search flowers, gifts, occasions..." autocomplete="off" aria-label="Search products">' +
                '<button type="submit" class="rv-search-submit">Search</button>' +
                '<button type="button" class="rv-search-close" aria-label="Close search">&times;</button>' +
            '</form>' +
            '<div class="rv-search-suggest" hidden></div>' +
        '</div>';
    document.body.appendChild(panel);

    const input = panel.querySelector('.rv-search-input');
    const suggestBox = panel.querySelector('.rv-search-suggest');

    // Live suggestions: product catalog is fetched once, the first time the
    // search opens, then filtered locally on every keystroke.
    let catalog = null;
    let catalogLoading = false;
    const loadCatalog = () => {
        if (catalog || catalogLoading) return;
        if (typeof firebase === 'undefined' || !firebase.database) return;
        catalogLoading = true;
        firebase.database().ref('flowers').once('value')
            .then(snap => {
                const data = snap.val() || {};
                catalog = Object.keys(data)
                    .map(k => Object.assign({ id: k }, data[k]))
                    .filter(p => p && p.name && p.hidden !== true);
                renderSuggestions(input.value.trim());
            })
            .catch(() => { catalogLoading = false; });
    };

    const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const renderSuggestions = (term) => {
        if (!catalog || term.length < 2) {
            suggestBox.setAttribute('hidden', '');
            suggestBox.innerHTML = '';
            return;
        }
        const q = term.toLowerCase();
        const scored = [];
        for (const p of catalog) {
            // Name matches rank above everything else; the wider match uses the
            // same rule the products page applies, so pressing Enter shows at
            // least what was suggested here.
            const name = String(p.name || '').toLowerCase();
            if (name.includes(q)) scored.push([0, p]);
            else if (rvMatchesSearch(p, q)) scored.push([1, p]);
        }
        scored.sort((a, b) => a[0] - b[0]);
        const top = scored.slice(0, 6).map(x => x[1]);
        if (!top.length) {
            suggestBox.innerHTML = '<div class="rv-search-none">No matches for &ldquo;' + escHtml(term) + '&rdquo; &mdash; press Enter to browse all products</div>';
            suggestBox.removeAttribute('hidden');
            return;
        }
        suggestBox.innerHTML = top.map(p => {
            const price = (p.salePrice || p.salePrice === 0) ? p.salePrice : p.price;
            return '<a class="rv-search-item" href="' + productUrl + '?id=' + encodeURIComponent(p.id) + '">' +
                '<img src="' + escHtml(p.image || '') + '" alt="" loading="lazy">' +
                '<span class="rv-search-item-name">' + escHtml(p.name) + '</span>' +
                '<span class="rv-search-item-price">' + formatCurrency(price) + '</span>' +
            '</a>';
        }).join('');
        suggestBox.removeAttribute('hidden');
    };

    input.addEventListener('input', debounce(() => renderSuggestions(input.value.trim()), 180));

    const openSearch = () => {
        closeNav();
        panel.removeAttribute('hidden');
        document.body.classList.add('rv-search-open');
        loadCatalog();
        setTimeout(() => input.focus(), 60);
    };
    const closeSearch = () => {
        panel.setAttribute('hidden', '');
        document.body.classList.remove('rv-search-open');
    };

    btn.addEventListener('click', openSearch);
    panel.querySelector('.rv-search-close').addEventListener('click', closeSearch);
    panel.addEventListener('click', e => { if (e.target === panel) closeSearch(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !panel.hasAttribute('hidden')) closeSearch();
    });
    panel.querySelector('.rv-search-form').addEventListener('submit', e => {
        const term = input.value.trim();
        if (!term) { e.preventDefault(); input.focus(); return; }
        // If already on the products page, search in place instead of reloading.
        if (file === 'products.html' && window.app && typeof window.app.searchProducts === 'function') {
            e.preventDefault();
            const pageInput = document.querySelector('.products-search-input');
            if (pageInput) pageInput.value = term;
            window.app.searchProducts(term);
            closeSearch();
        }
    });
}

document.addEventListener('DOMContentLoaded', initMobileNav);
document.addEventListener('DOMContentLoaded', initAnnouncementBar);
document.addEventListener('DOMContentLoaded', initNavSearch);