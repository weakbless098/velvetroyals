const app = (() => {
    const esc = (str) => String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const HEART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    const HEART_FILLED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

    let cart = [];
    let wishlist = {};
    let wishlistCounts = {};
    let allProducts = [];
    // Multi-select: customers can combine category chips (e.g. Bouquets +
    // Gift Sets). Empty set = "All".
    let selectedCategories       = new Set();
    let currentOccasionFilter    = 'all';
    let currentRecipientFilter   = 'all';
    let currentArrangementType   = 'all';
    let currentSearchQuery     = '';
    const builderSelections = { arrangement: null, flower: null, gift: null };
    let _shopRating = null; 
    let _wishlistCountsLoaded = false;

    const _ATYPE_KEYWORDS = {
        teddybear:    ['teddy', 'bear', 'stuffed'],
        box:          ['box'],
        basket:       ['basket'],
        vase:         ['vase'],
        hundredroses: ['hundred rose', '100 rose', 'century of love'],
        bridal:       ['bridal', 'bride', 'wedding bouquet'],
        corsage:      ['corsage', 'wristlet', 'boutonniere', 'boutonnière'],
        handbouquet:  ['hand bouquet', 'hand-tied', 'handtied', 'hand tied'],
        foreverrose:  ['forever rose', 'preserved rose', 'eternal rose', 'infinity rose'],
        corporate:    ['corporate', 'centerpiece', 'center piece'],
    };
    const _BUNDLE_ATYPES = new Set(['teddybear', 'bundlechocolate', 'bundlecake', 'bundleperfume']);
    const _BABY_OCCASIONS = new Set(['baby', 'babygirl', 'babyboy', 'babyshower']);

    const inferArrangementType = (p) => {
        if (p.arrangementType) return p.arrangementType;
        const text = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
        for (const [type, kws] of Object.entries(_ATYPE_KEYWORDS)) {
            if (kws.some(kw => text.includes(kw))) return type;
        }
        return '';
    };

    const getCategory = (p) => {
        if (p.category) return p.category;
        const text = ((p.name || '') + ' ' + (p.description || '')).toLowerCase();
        const atype = inferArrangementType(p);
        if (_BUNDLE_ATYPES.has(atype)) return 'bundle';
        if (atype) return 'arrangement';
        if (text.includes('arrangement')) return 'arrangement';
        if (text.includes('gift') || text.includes('hamper')) return 'gift';
        return 'flower';
    };

    const catLabels = { flower: 'Flower', arrangement: 'Arrangement', gift: 'Gift', bundle: 'Bundle', chocolates: 'Chocolates', cakes: 'Cakes & Pastries' };

    const ensureProductsFilterControls = () => {
        const mainFilter = document.getElementById('main-category-filter');
        if (!mainFilter) return;

        const hasBundle = !!mainFilter.querySelector('[data-cat="bundle"]');
        if (!hasBundle) {
            const bundleBtn = document.createElement('button');
            bundleBtn.type = 'button';
            bundleBtn.className = 'cat-filter-btn cat-filter-bundle';
            bundleBtn.dataset.cat = 'bundle';
            bundleBtn.textContent = 'Bundles';
            bundleBtn.setAttribute('onclick', "app.filterByCategory('bundle')");
            bundleBtn.innerHTML = 'Bundles <span id="cat-count-bundle" class="filter-count-badge">0</span>';
            mainFilter.appendChild(bundleBtn);
        }

        if (!document.getElementById('occasion-filter-bar')) {
            const occWrap = document.createElement('div');
            occWrap.id = 'occasion-filter-bar';
            occWrap.className = 'sub-filters-group';
            occWrap.innerHTML = `
                <div class="sub-filter-bar">
                    <span class="sub-filter-label">Occasion</span>
                    <div class="sub-filter-pills">
                        <button type="button" class="sub-filter-btn active" data-occ="all">All</button>
                        <button type="button" class="sub-filter-btn" data-occ="birthday">Birthday</button>
                        <button type="button" class="sub-filter-btn" data-occ="anniversary">Anniversary</button>
                        <button type="button" class="sub-filter-btn" data-occ="wedding">Wedding</button>
                        <button type="button" class="sub-filter-btn" data-occ="valentine">Valentine</button>
                        <button type="button" class="sub-filter-btn" data-occ="getwell">Get Well</button>
                        <button type="button" class="sub-filter-btn" data-occ="graduation">Graduation</button>
                        <button type="button" class="sub-filter-btn" data-occ="baby">Baby</button>
                    </div>
                </div>`;
            mainFilter.parentNode.insertBefore(occWrap, mainFilter.nextSibling);
        }

        if (!document.getElementById('recipient-filter-bar')) {
            const recWrap = document.createElement('div');
            recWrap.id = 'recipient-filter-bar';
            recWrap.className = 'sub-filters-group';
            recWrap.innerHTML = `
                <div class="sub-filter-bar">
                    <span class="sub-filter-label">Recipient</span>
                    <div class="sub-filter-pills">
                        <button type="button" class="sub-filter-btn active" data-rec="all">All</button>
                        <button type="button" class="sub-filter-btn" data-rec="her">For Her</button>
                        <button type="button" class="sub-filter-btn" data-rec="him">For Him</button>
                        <button type="button" class="sub-filter-btn" data-rec="parents">For Parents</button>
                        <button type="button" class="sub-filter-btn" data-rec="baby">For Baby</button>
                        <button type="button" class="sub-filter-btn" data-rec="friend">For Friend</button>
                    </div>
                </div>`;
            mainFilter.parentNode.insertBefore(recWrap, (mainFilter.nextSibling && mainFilter.nextSibling.nextSibling) || mainFilter.nextSibling);
        }

        document.querySelectorAll('.sub-filter-btn[data-occ]').forEach(btn => {
            btn.onclick = () => filterByOccasion(btn.dataset.occ);
            btn.classList.toggle('active', (btn.dataset.occ || 'all') === currentOccasionFilter);
        });
        document.querySelectorAll('.sub-filter-btn[data-rec]').forEach(btn => {
            btn.onclick = () => filterByRecipient(btn.dataset.rec);
            btn.classList.toggle('active', (btn.dataset.rec || 'all') === currentRecipientFilter);
        });
    };

    const init = () => {
        ensureProductsFilterControls();
        setupEventListeners();
        const isProductDetailPage = !!document.getElementById('pd-wrapper');
        if (!isProductDetailPage) {
            loadProductsFromFirebase();
            loadShopRating();
        }
        loadCart();
        loadWishlist();
        loadWishlistCounts();
        if (document.getElementById('checkout-order-summary')) {
            showCheckoutForm();
            loadCoupons();
        }
        // Deep-link filters from the homepage rails:
        // ?cat=, ?atype= (arrangement subtype), ?q= (search), ?occasion=.
        const params = new URLSearchParams(window.location.search);
        const catParam   = params.get('cat');
        const atypeParam = params.get('atype');
        const qParam     = params.get('q');
        const occParam   = params.get('occasion');
        if (occParam && document.querySelector('#filter-occasion option[value="' + occParam + '"]')) {
            filterByOccasion(occParam);
        }
        if (catParam && document.querySelector('.cat-filter-btn[data-cat="' + catParam + '"]')) {
            filterByCategory(catParam);
        }
        if (atypeParam && document.querySelector('.cat-filter-btn[data-atype="' + atypeParam + '"]')) {
            filterByArrangementType(atypeParam);
        }
        if (qParam) {
            const searchInput = document.querySelector('.products-search-input');
            if (searchInput) searchInput.value = qParam;
            searchProducts(qParam);
        }
        document.querySelectorAll('.footer-year').forEach(function(el) {
            el.textContent = new Date().getFullYear();
        });
    };

    const loadShopRating = () => {
        if (typeof firebase === 'undefined') return;
        firebase.database().ref('reviews').once('value', snap => {
            if (!snap.exists()) return;
            let total = 0, count = 0;
            snap.forEach(child => {
                const r = child.val();
                if (r && typeof r.rating === 'number') { total += r.rating; count++; }
            });
            if (count > 0) {
                _shopRating = { avg: (total / count).toFixed(1), count };
                displayProducts(getFilteredProducts()); 
            }
        });
    };

    const setupEventListeners = () => {
        const productList = document.getElementById('product-list');
        if (productList) {
            productList.addEventListener('click', handleProductClick);
        }

        const checkoutForm = document.getElementById('checkout-form');
        if (checkoutForm) {
            checkoutForm.addEventListener('submit', handleCheckoutSubmit);
        }

        document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const val = radio.value;
                const bankBox  = document.getElementById('payment-details-bank');
                const gcashBox = document.getElementById('payment-details-gcash');
                if (bankBox)  bankBox.style.display  = val === 'bank'  ? 'block' : 'none';
                if (gcashBox) gcashBox.style.display  = val === 'gcash' ? 'block' : 'none';
            });
        });
    };

    const handleProductClick = (event) => {
        const cartBtn = event.target.closest('.button[data-id]');
        if (cartBtn) {
            addToCart(cartBtn.dataset.id, cartBtn.dataset.name, cartBtn.dataset.price, cartBtn.dataset.image);
            return;
        }
        const wlBtn = event.target.closest('.wishlist-btn[data-id]');
        if (wlBtn) {
            toggleWishlist(wlBtn.dataset.id, wlBtn.dataset.name, wlBtn.dataset.price, wlBtn.dataset.image);
            return;
        }
        const card = event.target.closest('.product[data-product-id]');
        if (card) {
            const inPagesDir = window.location.pathname.includes('/pages/');
            const base = inPagesDir ? '' : 'pages/';
            window.location.href = base + 'product.html?id=' + encodeURIComponent(card.dataset.productId);
        }
    };

    const CACHE_KEY = 'rv_products_v1';
    const CACHE_TTL = 5 * 60 * 1000;

    const _getCached = (ignoreTtl = false) => {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const { ts, data } = JSON.parse(raw);
            return (ignoreTtl || Date.now() - ts < CACHE_TTL) ? data : null;
        } catch { return null; }
    };

    const _setCache = (products) => {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: products })); }
        catch {}
    };

    const _applyProducts = (products) => {
        allProducts = products;
        updateCategoryFilterCounts();
        const isHomepage = !!document.getElementById('featured-products');
        if (!isHomepage || _wishlistCountsLoaded) {
            displayProducts(getFilteredProducts());
        }
        // Refresh the wishlist page too so it reflects live prices once the
        // catalog arrives, not just the saved snapshots.
        if (document.getElementById('wishlist-items')) displayWishlist();
        initBuilder();
        _repriceCart();
    };

    // Cart lines keep the price from when they were added. Bring them up to
    // the live catalogue price so the checkout total matches what the payment
    // step will accept (createGeideaSession re-checks every price).
    // Custom bouquets are priced like the builder does: arrangement + flower
    // (+ gift) at their regular price, looked up by name.
    const _repriceCart = () => {
        if (!cart.length || !allProducts.length) return;
        const byId = new Map(allProducts.map(p => [String(p.id), p]));
        const byName = new Map(allProducts.map(p => [(p.name || '').toLowerCase().trim(), p]));
        const named = (n) => byName.get(String(n || '').toLowerCase().trim());
        let changed = false;
        cart.forEach(item => {
            let price = null;
            if (item.isCustom && item.customDetails) {
                const d = item.customDetails;
                const a = named(d.arrangement), f = named(d.flower), g = d.gift ? named(d.gift) : null;
                if (a && f && (!d.gift || g)) {
                    price = parseFloat(a.price) + parseFloat(f.price) + (g ? parseFloat(g.price) : 0);
                }
            } else {
                const live = byId.get(String(item.id));
                if (live) {
                    price = parseFloat((live.salePrice && live.salePrice > 0 && live.salePrice < live.price)
                        ? live.salePrice : live.price);
                }
            }
            if (price !== null && !isNaN(price)) {
                price = parseFloat(price.toFixed(2));
                if (price !== item.price) { item.price = price; changed = true; }
            }
        });
        if (!changed) return;
        saveCart();
        displayCart();
        if (document.getElementById('cart-items')) {
            showNotification('Some prices in your cart changed — your total has been updated.', 'info');
        }
    };

    const loadProductsFromFirebase = () => {
        if (typeof flowersRef === 'undefined') {
            console.error('Firebase not initialized');
            const stale = _getCached(true);
            if (stale && stale.length > 0) _applyProducts(stale);
            return;
        }

        const cached = _getCached();
        let _prevFingerprint = '';
        if (cached && cached.length > 0) {
            _prevFingerprint = JSON.stringify(cached);
            _applyProducts(cached);
        }

        flowersRef.on('value', snapshot => {
            const newProducts = [];
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    newProducts.push({ id: child.key, ...child.val() });
                });
            }

            if (newProducts.length > 0) {
                const seenNames = new Set();
                const dedupedProducts = newProducts.filter(p => {
                    const key = (p.name || '').toLowerCase().trim();
                    if (seenNames.has(key)) return false;
                    seenNames.add(key);
                    return true;
                });

                // Fingerprint the full content (not just IDs) so edits to an
                // existing product — price, sale price, name, image, stock —
                // are detected and pushed live. An ID-only fingerprint would
                // treat a price change as "no change" and never update the
                // store or the cache.
                const fingerprint = JSON.stringify(dedupedProducts);
                if (fingerprint === _prevFingerprint) return;
                _prevFingerprint = fingerprint;

                allProducts = dedupedProducts;
                _setCache(allProducts);
                updateCategoryFilterCounts();
                const isHomepage = !!document.getElementById('featured-products');
                if (!isHomepage || _wishlistCountsLoaded) {
                    displayProducts(getFilteredProducts());
                }
                if (document.getElementById('wishlist-items')) displayWishlist();
                initBuilder();
                _repriceCart();
            }
        }, error => {
            console.error('Error loading from Firebase:', error);
            // Fall back to the last cached product list (even if expired)
            // rather than leaving the page empty.
            if (allProducts.length === 0) {
                const stale = _getCached(true);
                if (stale && stale.length > 0) _applyProducts(stale);
            }
        });
    };

    // ── Shop By Occasions (homepage) ─────────────────────────────────────
    // Photo tiles built from the catalog itself: each occasion that has at
    // least one product gets a tile using that product's photo, linking to
    // the pre-filtered products page. Self-maintaining as products change.
    const OCCASION_TILES = [
        ['birthday',        'Birthday'],
        ['anniversary',     'Anniversary'],
        ['romantic',        'Love & Romance'],
        ['valentine',       "Valentine's Day"],
        ['mothersday',      "Mother's Day"],
        ['fathersday',      "Father's Day"],
        ['congratulations', 'Congratulations'],
        ['wedding',         'Wedding'],
        ['bridalshower',    'Bridal Shower'],
        ['babyshower',      'New Born'],
        ['babygirl',        'Baby Girl'],
        ['babyboy',         'Baby Boy'],
        ['getwell',         'Get Well Soon'],
        ['sorry',           'I am Sorry'],
        ['graduation',      'Graduation'],
        ['sympathy',        'Sympathy'],
        ['christmas',       'Christmas'],
    ];

    // Newest-first comparator shared by both auto-curated homepage rows.
    // Products without a createdAt (added before this feature existed) sort
    // after ones that have it, oldest-first among themselves so they don't
    // all tie at position zero.
    const _byNewest = (a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
    };

    // Shop By Occasions (homepage): each tile's photo is the most recently
    // added product for that occasion, so the row automatically freshens
    // itself as new stock comes in — no need to manually swap tile photos.
    const _renderOccasionTiles = () => {
        const grid = document.getElementById('occasions-grid');
        if (!grid) return;
        const tiles = [];
        for (const [key, label] of OCCASION_TILES) {
            const candidates = allProducts.filter(pr => (pr.occasion || '') === key
                && pr.hidden !== true && pr.inStock !== false
                && (pr.image || '').startsWith('http'));
            if (!candidates.length) continue;
            const p = candidates.sort(_byNewest)[0];
            tiles.push('<a class="occasion-tile" href="pages/products.html?occasion=' + encodeURIComponent(key) + '">' +
                '<span class="occasion-tile-img"><img src="' + esc(p.image) + '" alt="' + esc(label) + '" loading="lazy" decoding="async"></span>' +
                '<span class="occasion-tile-label">' + esc(label) + '</span></a>');
        }
        grid.innerHTML = tiles.join('');
        const section = document.getElementById('occasions-section');
        if (section) section.style.display = tiles.length ? '' : 'none';
    };

    // "Hot Sale" row (homepage): fully automatic budget picks — every live
    // product whose customer-facing price is at or under the cap, cheapest
    // first. No admin action needed; adjusting a price moves an item in or
    // out of the row on its own. The price compared is the one the customer
    // actually pays (sale price when discounted, otherwise the normal price).
    const HOT_SALE_MAX_PRICE = 200;
    const _renderNewArrivals = () => {
        const row = document.getElementById('new-arrivals-row');
        if (!row) return;
        const payable = (p) => (p.salePrice && p.salePrice > 0 && p.salePrice < p.price) ? p.salePrice : p.price;
        const qualifies = (p) => {
            if (p.hidden === true || p.inStock === false || !(p.image || '').startsWith('http')) return false;
            const price = parseFloat(payable(p));
            return !isNaN(price) && price > 0 && price <= HOT_SALE_MAX_PRICE;
        };
        const picks = allProducts
            .filter(qualifies)
            .sort((a, b) => payable(a) - payable(b))
            .slice(0, 10);
        row.innerHTML = picks.map(p => {
            const price = payable(p);
            const onSale = p.salePrice && p.salePrice > 0 && p.salePrice < p.price;
            // Discounted items advertise how much is off; the rest simply
            // carry the section's "SALE" flag.
            const ribbon = onSale
                ? '-' + Math.round((1 - p.salePrice / p.price) * 100) + '%'
                : 'SALE';
            return '<a class="arrival-card" href="pages/product.html?id=' + encodeURIComponent(p.id) + '">' +
                '<span class="arrival-img"><span class="arrival-ribbon">' + ribbon + '</span>' +
                '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" onerror="this.onerror=null;this.src=\'https://storage.googleapis.com/flowershop-d26f4.firebasestorage.app/products/1.jpg\';"></span>' +
                '<span class="arrival-name">' + esc(p.name) + '</span>' +
                '<span class="arrival-price">' +
                    (onSale ? '<s class="arrival-price-was">AED ' + parseFloat(p.price).toFixed(2) + '</s> ' : '') +
                    'AED ' + parseFloat(price).toFixed(2) +
                '</span>' +
                '</a>';
        }).join('');
        const section = document.getElementById('new-arrivals-section');
        if (section) section.style.display = picks.length ? '' : 'none';
    };

    // Soft-opening popup photo: a real rose bouquet from the catalog (falls
    // back to any arrangement) so the launch popup shows an actual product,
    // not a placeholder.
    const _renderSoftOpeningPopupImage = () => {
        const img = document.getElementById('softopen-popup-img');
        if (!img) return;
        const isLive = (p) => p.hidden !== true && p.inStock !== false && (p.image || '').startsWith('http');
        const pick = allProducts.find(p => isLive(p) && /rose/i.test(p.name || ''))
            || allProducts.find(p => isLive(p) && getCategory(p) === 'arrangement');
        if (pick) img.src = pick.image;
    };

    const getFilteredProducts = () => {
        const q = currentSearchQuery.toLowerCase().trim();
        return allProducts.filter(p => {
            const cat   = getCategory(p);
            const atype = inferArrangementType(p);
            // Sub-type only narrows arrangements; other selected categories stay visible.
            const atypeMatch = currentArrangementType === 'all'
                || atype === currentArrangementType
                || (cat !== 'arrangement' && cat !== 'bundle');
            // A product can belong to more than one chip: an arrangement named
            // "... Bouquet" shows under Find Bouquets AND Custom Arrangements.
            const nameText = (p.name || '').toLowerCase();
            const matchesChip = (chip) => {
                if (chip === 'arrangement') return cat === 'arrangement' || cat === 'bundle';
                if (chip === 'flower')      return cat === 'flower' || nameText.includes('bouquet');
                if (chip === 'gift')        return cat === 'gift' || nameText.includes('gift');
                return cat === chip;
            };
            const catMatch = selectedCategories.size === 0
                || [...selectedCategories].some(matchesChip);
            // The "Baby" chip covers every baby occasion the admin can pick.
            const occMatch   = currentOccasionFilter   === 'all' || (p.occasion || '') === currentOccasionFilter
                || (currentOccasionFilter === 'baby' && _BABY_OCCASIONS.has(p.occasion));
            const recMatch   = currentRecipientFilter  === 'all' || (p.recipient || '') === currentRecipientFilter;
            const searchMatch = _matchesSearch(p, q);
            const stockMatch  = p.inStock !== false;
            const visibleMatch = p.hidden !== true;
            return catMatch && occMatch && recMatch && atypeMatch && searchMatch && stockMatch && visibleMatch;
        });
    };

    // Delegates to the shared matcher in utils.js so this page and the header
    // search agree on what counts as a match. Previously this looked only at
    // name/description/category, so a customer could be shown six suggestions
    // for "birthday" and then land here on a near-empty results page.
    const _matchesSearch = (p, q) => !q ||
        (typeof rvMatchesSearch === 'function'
            ? rvMatchesSearch(p, q)
            : (p.name || '').toLowerCase().includes(q)
              || (p.description || '').toLowerCase().includes(q)
              || getCategory(p).toLowerCase().includes(q));

    // Search and filters are independent and combine: a query narrows within
    // whatever chips/dropdowns are selected. If the combination is empty, the
    // empty state offers a one-tap "show matches from all categories".
    const searchProducts = (query) => {
        currentSearchQuery = query;
        displayProducts(getFilteredProducts());
    };

    const showAllSearchMatches = () => {
        _clearBrowseFilterState();
        displayProducts(getFilteredProducts());
    };

    const _updateResetBtn = () => {
        const btn = document.getElementById('filter-reset-btn');
        if (!btn) return;
        const active = selectedCategories.size > 0 || currentOccasionFilter !== 'all' || currentArrangementType !== 'all';
        btn.style.display = active ? '' : 'none';
    };

    const filterByCategory = (cat) => {
        if (cat === 'all') {
            selectedCategories.clear();
        } else if (selectedCategories.has(cat)) {
            selectedCategories.delete(cat);   // tap again to deselect
        } else {
            selectedCategories.add(cat);      // combines with other chips
        }
        const showAll = selectedCategories.size === 0;
        document.querySelectorAll('.cat-filter-btn[data-cat]').forEach(btn => {
            const c = btn.dataset.cat;
            btn.classList.toggle('active', c === 'all' ? showAll : selectedCategories.has(c));
        });
        const atypeWrap = document.getElementById('filter-atype-wrap');
        if (atypeWrap) {
            const hasArrangement = selectedCategories.has('arrangement');
            atypeWrap.style.display = hasArrangement ? '' : 'none';
            if (!hasArrangement) {
                currentArrangementType = 'all';
                document.querySelectorAll('.cat-filter-btn[data-atype]').forEach(b => b.classList.toggle('active', b.dataset.atype === 'all'));
            }
        }
        _updateResetBtn();
        displayProducts(getFilteredProducts());
    };

    const filterByArrangementType = (atype) => {
        currentArrangementType = atype;
        document.querySelectorAll('.cat-filter-btn[data-atype]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.atype === atype);
        });
        _updateResetBtn();
        displayProducts(getFilteredProducts());
    };

    const filterByOccasion = (occ) => {
        currentOccasionFilter = occ;
        document.querySelectorAll('.sub-filter-btn[data-occ]').forEach(btn => {
            btn.classList.toggle('active', (btn.dataset.occ || 'all') === occ);
        });
        const sel = document.getElementById('filter-occasion');
        if (sel) sel.value = occ;
        _updateResetBtn();
        displayProducts(getFilteredProducts());
    };

    const filterByRecipient = (rec) => {
        currentRecipientFilter = rec;
        document.querySelectorAll('.sub-filter-btn[data-rec]').forEach(btn => {
            btn.classList.toggle('active', (btn.dataset.rec || 'all') === rec);
        });
        displayProducts(getFilteredProducts());
    };

    // Clears every browse filter (state + chip/dropdown UI) without re-rendering.
    const _clearBrowseFilterState = () => {
        selectedCategories.clear();
        currentOccasionFilter  = 'all';
        currentRecipientFilter = 'all';
        currentArrangementType = 'all';
        document.querySelectorAll('.cat-filter-btn[data-cat]').forEach(btn => btn.classList.toggle('active', btn.dataset.cat === 'all'));
        document.querySelectorAll('.cat-filter-btn[data-atype]').forEach(btn => btn.classList.toggle('active', btn.dataset.atype === 'all'));
        const occSel = document.getElementById('filter-occasion');
        const atypeWrap = document.getElementById('filter-atype-wrap');
        if (occSel)    occSel.value = 'all';
        if (atypeWrap) atypeWrap.style.display = 'none';
        _updateResetBtn();
    };

    const resetFilters = () => {
        _clearBrowseFilterState();
        displayProducts(getFilteredProducts());
    };

    const updateCategoryFilterCounts = () => {
        const counts = {
            all: allProducts.length,
            flower: allProducts.filter(p => getCategory(p) === 'flower').length,
            arrangement: allProducts.filter(p => getCategory(p) === 'arrangement').length,
            gift: allProducts.filter(p => getCategory(p) === 'gift').length,
            bundle: allProducts.filter(p => getCategory(p) === 'bundle').length,
        };

        const allBtn = document.querySelector('[data-cat="all"]');
        if (allBtn && !allBtn.querySelector('.filter-count-badge')) {
            const badge = document.createElement('span');
            badge.className = 'filter-count-badge';
            badge.id = 'cat-count-all';
            allBtn.appendChild(badge);
        }

        Object.entries(counts).forEach(([key, value]) => {
            const badge = document.getElementById('cat-count-' + key) || document.querySelector('[data-cat="' + key + '"] .filter-count-badge');
            if (badge) badge.textContent = String(value);
        });

        const bundleBadge = document.getElementById('cat-count-bundle');
        if (bundleBadge) bundleBadge.textContent = String(counts.bundle || 0);
    };

    const displayProducts = (products) => {
        const productContainer = document.getElementById('product-list');
        if (!productContainer) return;

        const isIndexPage = !!document.getElementById('featured-products');
        if (isIndexPage) { _renderOccasionTiles(); _renderNewArrivals(); _renderSoftOpeningPopupImage(); }
        let toShow = isIndexPage
            ? [...products].sort((a, b) => (wishlistCounts[b.id] || 0) - (wishlistCounts[a.id] || 0)).slice(0, 14)
            : products;

        if (isIndexPage && toShow.length === 0) return;

        productContainer.innerHTML = '';

        if (toShow.length === 0) {
            const qRaw = currentSearchQuery.trim();
            const qLow = qRaw.toLowerCase();
            const filtersActive = selectedCategories.size > 0 || currentOccasionFilter !== 'all'
                || currentRecipientFilter !== 'all' || currentArrangementType !== 'all';
            const wideCount = (qRaw && filtersActive)
                ? allProducts.filter(p => _matchesSearch(p, qLow) && p.inStock !== false && p.hidden !== true).length
                : 0;
            let msg;
            if (qRaw && wideCount > 0) {
                msg = 'No matches for &ldquo;' + esc(qRaw) + '&rdquo; in the selected filters.' +
                    '<br><button class="button" style="margin-top:16px;width:auto;padding:11px 26px;" onclick="app.showAllSearchMatches()">' +
                    'Show ' + wideCount + ' match' + (wideCount !== 1 ? 'es' : '') + ' from all categories</button>';
            } else if (qRaw) {
                msg = 'No products match &ldquo;' + esc(qRaw) + '&rdquo;. Try a different name or browse the categories.';
            } else {
                msg = 'No products found in this category.';
            }
            productContainer.innerHTML = '<div class="empty-state">' + msg + '</div>';
            return;
        }

        const badgeLabels = { new: 'NEW', bestseller: 'BESTSELLER', hotpick: 'HOT PICK', sale: 'SALE', bundle: 'BUNDLE' };
        // Shared with the search matcher (utils.js) so a tag shown on a card
        // is always a term the search box actually understands.
        const occasionLabels  = (typeof RV_OCCASION_LABELS  !== 'undefined') ? RV_OCCASION_LABELS  : {};
        const recipientLabels = (typeof RV_RECIPIENT_LABELS !== 'undefined') ? RV_RECIPIENT_LABELS : {};

        toShow.forEach(product => {
            const cat = getCategory(product);
            const label = catLabels[cat] || 'Flower';
            const effectivePrice = (product.salePrice && product.salePrice > 0 && product.salePrice < product.price)
                ? product.salePrice : product.price;
            const isOnSale = effectivePrice < product.price;
            const badgeKey = cat === 'bundle' ? 'bundle' : (isOnSale ? 'sale' : (product.badge || ''));
            const badgeHtml = badgeKey
                ? `<span class="product-ribbon ribbon-${esc(badgeKey)}">${esc(badgeLabels[badgeKey] || badgeKey.toUpperCase())}</span>`
                : '';
            const occLabel = product.occasion ? `<span class="product-tag tag-occasion">${esc(occasionLabels[product.occasion] || product.occasion)}</span>` : '';
            const recLabel = product.recipient ? `<span class="product-tag tag-recipient">${esc(recipientLabels[product.recipient] || product.recipient)}</span>` : '';
            const tagsHtml = (occLabel || recLabel) ? `<div class="product-tags">${occLabel}${recLabel}</div>` : '';

            const rawImg = product.image || '';
            const imgSrc = (rawImg.startsWith('http') || rawImg.startsWith('/') || rawImg.startsWith('data:'))
                ? rawImg
                : 'https://storage.googleapis.com/flowershop-d26f4.firebasestorage.app/products/1.jpg';

            const ratingHtml = _shopRating
                ? `<div class="product-rating">
                    <span class="product-rating-stars">${'★'.repeat(Math.round(_shopRating.avg))}${'☆'.repeat(5 - Math.round(_shopRating.avg))}</span>
                    <span class="product-rating-value">${_shopRating.avg}</span>
                    <span class="product-rating-count">(${_shopRating.count})</span>
                  </div>`
                : '';

            const productElement = document.createElement('div');
            productElement.classList.add('product');
            productElement.dataset.productId = product.id;
            productElement.innerHTML = `
                <div class="product-img-wrap">
                    ${badgeHtml}
                    <img src="${imgSrc}" alt="${esc(product.name)}" class="product-card-img" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='https://storage.googleapis.com/flowershop-d26f4.firebasestorage.app/products/1.jpg';">
                    <button class="wishlist-btn${isInWishlist(product.id) ? ' wishlisted' : ''}" data-id="${esc(product.id)}" data-name="${esc(product.name)}" data-price="${esc(effectivePrice)}" data-image="${esc(product.image)}" aria-label="${isInWishlist(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}">${isInWishlist(product.id) ? HEART_FILLED_SVG : HEART_SVG}</button>
                    ${(wishlistCounts[product.id] || 0) > 0 ? `<span class="wl-count-pill" data-wl-count-id="${esc(product.id)}"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ${wishlistCounts[product.id]}</span>` : `<span class="wl-count-pill" data-wl-count-id="${esc(product.id)}" style="display:none;"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> 0</span>`}
                </div>
                <div class="product-body">
                    <h2>${esc(product.name)}</h2>
                    ${ratingHtml}
                    <p>${esc(product.description)}</p>
                    ${product.quantity ? `<p class="product-quantity"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> ${esc(product.quantity)}</p>` : ''}
                    ${isOnSale
                        ? `<div class="product-price-wrap">
                            <span class="product-price-original">AED ${parseFloat(product.price).toFixed(2)}</span>
                            <span class="product-price-sale">AED ${parseFloat(effectivePrice).toFixed(2)}</span>
                           </div>`
                        : `<p class="product-price">AED ${parseFloat(product.price).toFixed(2)}</p>`
                    }
                    <button class="button" data-id="${esc(product.id)}" data-name="${esc(product.name)}" data-price="${esc(effectivePrice)}" data-image="${esc(product.image)}">
                        Add to Cart
                    </button>
                </div>
            `;
            productContainer.appendChild(productElement);
        });

        productContainer.querySelectorAll('.product').forEach((el, i) => {
            const delay = Math.min(i * 0.05, 0.5);
            el.style.opacity = '0';
            el.style.animation = `cardFadeUp 0.45s ease ${delay}s both`;
            el.addEventListener('animationend', () => {
                el.style.animation = '';
                el.style.opacity = '';
            }, { once: true });
        });
    };

    const initBuilder = () => {
        if (!document.getElementById('builder-arrangements')) return;

        const inStock      = p => p.inStock !== false;
        const arrangements = allProducts.filter(p => getCategory(p) === 'arrangement' && inStock(p));
        const flowers      = allProducts.filter(p => getCategory(p) === 'flower'      && inStock(p));
        const gifts        = allProducts.filter(p => getCategory(p) === 'gift'        && inStock(p));

        renderBuilderOptions('builder-arrangements', 'arrangement', arrangements, false);
        renderBuilderOptions('builder-flowers',      'flower',      flowers,      false);
        renderBuilderOptions('builder-gifts',        'gift',        gifts,        true);
    };

    const renderBuilderOptions = (containerId, category, items, optional) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (optional) {
            const noGift = document.createElement('div');
            noGift.className = 'builder-option builder-option-none selected';
            noGift.innerHTML = '<span class="builder-option-name">No gift</span><span class="builder-option-price">—</span>';
            noGift.addEventListener('click', () => {
                container.querySelectorAll('.builder-option').forEach(o => o.classList.remove('selected'));
                noGift.classList.add('selected');
                builderSelections[category] = null;
                updateBuilderSummary();
            });
            container.appendChild(noGift);
        }

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.style.cssText = 'padding: 20px; font-size: 0.88em;';
            empty.textContent = 'No options available yet.';
            container.appendChild(empty);
            return;
        }

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'builder-option';
            el.innerHTML = `
                <span class="builder-option-name">${esc(item.name)}</span>
                <span class="builder-option-price">AED ${parseFloat(item.price).toFixed(2)}</span>
            `;
            el.addEventListener('click', () => {
                container.querySelectorAll('.builder-option').forEach(o => o.classList.remove('selected'));
                el.classList.add('selected');
                builderSelections[category] = item;
                updateBuilderSummary();
            });
            container.appendChild(el);
        });
    };

    const updateBuilderSummary = () => {
        const summaryEl = document.getElementById('builder-summary');
        if (!summaryEl) return;

        const { arrangement, flower, gift } = builderSelections;

        if (!arrangement || !flower) {
            summaryEl.style.display = 'none';
            return;
        }

        summaryEl.style.display = 'block';

        const total = parseFloat(arrangement.price) + parseFloat(flower.price) + (gift ? parseFloat(gift.price) : 0);

        const tagsEl = document.getElementById('builder-summary-tags');
        if (tagsEl) {
            tagsEl.innerHTML =
                `<span class="builder-summary-tag tag-arrangement">Arrangement: ${esc(arrangement.name)} — AED ${parseFloat(arrangement.price).toFixed(2)}</span>` +
                `<span class="builder-summary-tag tag-flower">Flower: ${esc(flower.name)} — AED ${parseFloat(flower.price).toFixed(2)}</span>` +
                (gift ? `<span class="builder-summary-tag tag-gift">Gift: ${esc(gift.name)} — AED ${parseFloat(gift.price).toFixed(2)}</span>` : '');
        }

        const priceEl = document.getElementById('builder-total-price');
        if (priceEl) priceEl.textContent = 'AED ' + total.toFixed(2);
    };

    const addCustomOrderToCart = () => {
        const { arrangement, flower, gift } = builderSelections;

        if (!arrangement || !flower) {
            showNotification('Please select an arrangement and a flower first', 'warning');
            return;
        }

        let name = arrangement.name + ' of ' + flower.name;
        if (gift) name += ' + ' + gift.name;

        const price = parseFloat(arrangement.price) + parseFloat(flower.price) + (gift ? parseFloat(gift.price) : 0);

        cart.push({
            id: 'custom_' + Date.now(),
            name,
            price: parseFloat(price.toFixed(2)),
            image: flower.image || arrangement.image || '',
            quantity: 1,
            isCustom: true,
            customDetails: {
                arrangement: arrangement.name,
                flower: flower.name,
                gift: gift ? gift.name : null
            }
        });

        saveCart();
        showNotification(name + ' added to cart');
    };

    const WISHLIST_KEY = 'flowershop_wishlist';

    const loadWishlist = () => {
        try {
            const saved = localStorage.getItem(WISHLIST_KEY);
            if (saved) wishlist = JSON.parse(saved);
        } catch { wishlist = {}; }

        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    firebase.database().ref(`users/${user.uid}/wishlist`).once('value', snap => {
                        const fbData = snap.val() || {};
                        wishlist = Object.assign({}, fbData, wishlist);
                        firebase.database().ref(`users/${user.uid}/wishlist`).set(
                            Object.keys(wishlist).length > 0 ? wishlist : null
                        );
                        localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
                        updateWishlistBadge();
                        if (document.getElementById('wishlist-items')) displayWishlist();
                        if (allProducts.length > 0) displayProducts(getFilteredProducts());
                    });
                } else {
                    updateWishlistBadge();
                }
            });
        }
        updateWishlistBadge();
        if (document.getElementById('wishlist-items')) displayWishlist();
    };

    const saveWishlist = () => {
        localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
        updateWishlistBadge();
        if (typeof firebase !== 'undefined' && firebase.auth) {
            const user = firebase.auth().currentUser;
            if (user) {
                firebase.database().ref(`users/${user.uid}/wishlist`).set(
                    Object.keys(wishlist).length > 0 ? wishlist : null
                );
            }
        }
    };

    const toggleWishlist = (productId, productName, price, image) => {
        const inList = !!wishlist[productId];
        const user = typeof firebase !== 'undefined' && firebase.auth ? firebase.auth().currentUser : null;

        if (inList) {
            delete wishlist[productId];
            showNotification(`${productName} removed from wishlist`, 'info');
            if (user) {
                firebase.database().ref(`productWishlists/${productId}/${user.uid}`).remove();
                wishlistCounts[productId] = Math.max(0, (wishlistCounts[productId] || 1) - 1);
            }
        } else {
            wishlist[productId] = { name: String(productName), price: parseFloat(price), image: String(image), addedAt: Date.now() };
            showNotification(`${productName} added to wishlist`);
            if (user) {
                firebase.database().ref(`productWishlists/${productId}/${user.uid}`).set(true);
                wishlistCounts[productId] = (wishlistCounts[productId] || 0) + 1;
            }
        }
        saveWishlist();
        document.querySelectorAll(`.wishlist-btn[data-id="${CSS.escape(productId)}"]`).forEach(btn => {
            const now = !inList;
            btn.classList.toggle('wishlisted', now);
            btn.setAttribute('aria-label', now ? 'Remove from wishlist' : 'Add to wishlist');
            btn.innerHTML = now ? HEART_FILLED_SVG : HEART_SVG;
        });
        updateWishlistCountPill(productId);
        if (document.getElementById('wishlist-items')) displayWishlist();
    };

    const isInWishlist = (productId) => !!wishlist[productId];

    const updateWishlistBadge = () => {
        const count = Object.keys(wishlist).length;
        document.querySelectorAll('.nav-wishlist-badge').forEach(badge => {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        });
    };

    const loadWishlistCounts = () => {
        if (typeof firebase === 'undefined' || !firebase.database) return;
        firebase.database().ref('productWishlists').once('value', snap => {
            const data = snap.val() || {};
            wishlistCounts = {};
            Object.entries(data).forEach(([productId, users]) => {
                if (users && typeof users === 'object') {
                    wishlistCounts[productId] = Object.keys(users).length;
                }
            });
            _wishlistCountsLoaded = true;
            if (allProducts.length > 0) displayProducts(getFilteredProducts());
        });
    };

    const updateWishlistCountPill = (productId) => {
        const count = wishlistCounts[productId] || 0;
        document.querySelectorAll(`[data-wl-count-id="${CSS.escape(productId)}"]`).forEach(pill => {
            if (count > 0) {
                pill.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ${count}`;
                pill.style.display = 'inline-flex';
            } else {
                pill.style.display = 'none';
            }
        });
    };

    // Wishlist items store a price snapshot from when they were saved. Resolve
    // against the live catalog so an admin price change shows here too (and is
    // used when moving to cart), falling back to the snapshot only if the
    // product no longer exists.
    const _wishlistResolve = (id, item) => {
        const live = allProducts.find(x => String(x.id) === String(id));
        if (!live) return { name: item.name, image: item.image, price: parseFloat(item.price) };
        const price = (live.salePrice && live.salePrice > 0 && live.salePrice < live.price)
            ? live.salePrice : live.price;
        return { name: live.name, image: live.image, price: parseFloat(price) };
    };

    const displayWishlist = () => {
        const container = document.getElementById('wishlist-items');
        if (!container) return;
        const items = Object.entries(wishlist);
        if (items.length === 0) {
            container.innerHTML = `
                <div class="wishlist-empty">
                    <div class="wishlist-empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </div>
                    <h3>Your wishlist is empty</h3>
                    <p>Save flowers you love by tapping the heart on any product card.</p>
                    <a href="products.html" class="button wishlist-empty-btn">Browse Collection</a>
                </div>`;
            return;
        }
        items.sort((a, b) => (b[1].addedAt || 0) - (a[1].addedAt || 0));
        container.innerHTML = '';
        items.forEach(([id, item]) => {
            const r = _wishlistResolve(id, item);
            const card = document.createElement('div');
            card.className = 'wishlist-card';
            card.innerHTML = `
                <div class="wishlist-card-img">
                    <img src="${esc(r.image)}" alt="${esc(r.name)}" onerror="this.onerror=null;this.src='https://storage.googleapis.com/flowershop-d26f4.firebasestorage.app/products/1.jpg';">
                    <button class="wishlist-card-remove" data-wl-id="${esc(id)}" aria-label="Remove from wishlist">
                        ${HEART_FILLED_SVG}
                    </button>
                </div>
                <div class="wishlist-card-body">
                    <h3 class="wishlist-card-name">${esc(r.name)}</h3>
                    <p class="wishlist-card-price">AED ${r.price.toFixed(2)}</p>
                    <button class="button wishlist-card-cart" data-wl-id="${esc(id)}" data-wl-action="cart">Move to Cart</button>
                </div>`;
            container.appendChild(card);
        });
        container.onclick = (e) => {
            const removeParent = e.target.closest('.wishlist-card-remove[data-wl-id]');
            const cartParent   = e.target.closest('.wishlist-card-cart[data-wl-id]');
            if (removeParent) {
                const id = removeParent.dataset.wlId;
                const item = wishlist[id];
                if (item) { const r = _wishlistResolve(id, item); toggleWishlist(id, r.name, r.price, r.image); }
            } else if (cartParent) {
                const id = cartParent.dataset.wlId;
                const item = wishlist[id];
                if (item) {
                    const r = _wishlistResolve(id, item);
                    addToCart(id, r.name, r.price, r.image);
                    toggleWishlist(id, r.name, r.price, r.image);
                }
            }
        };
    };

    const addToCart = (productId, productName, price, image) => {
        const existingItem = cart.find(item => item.id === productId);

        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ id: productId, name: productName, price: parseFloat(price), image, quantity: 1 });
        }

        saveCart();
        showNotification(`${productName} added to cart`);
    };

    const loadCart = () => {
        const savedCart = localStorage.getItem('flowershop_cart');
        if (savedCart) {
            try { cart = JSON.parse(savedCart); } catch { cart = []; }
            displayCart();
            _repriceCart();
        }
        updateCartBadge();
    };

    const saveCart = () => {
        localStorage.setItem('flowershop_cart', JSON.stringify(cart));
        updateCartBadge();
    };

    const updateCartBadge = () => {
        const count = cart.reduce((sum, item) => sum + item.quantity, 0);
        document.querySelectorAll('.nav-cart-badge').forEach(badge => {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        });
    };

    const displayCart = () => {
        const cartContainer = document.getElementById('cart-items');
        const totalPrice    = document.getElementById('total-price');
        const totalItems    = document.getElementById('total-items');
        const freeShippingBar = document.getElementById('free-shipping-bar');
        const freeShippingFill = document.getElementById('free-shipping-fill');
        const freeShippingText = document.getElementById('free-shipping-text');

        if (!cartContainer) return;

        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const threshold = 200;
        const freeShippingProgress = Math.min(100, Math.max(0, (subtotal / threshold) * 100));

        if (freeShippingBar) {
            if (cart.length === 0) {
                freeShippingBar.style.display = 'none';
            } else {
                freeShippingBar.style.display = 'block';
                if (subtotal >= threshold) {
                    freeShippingBar.classList.remove('qualified');
                    freeShippingBar.classList.add('not-qualified');
                    if (freeShippingFill) freeShippingFill.style.width = '0%';
                    if (freeShippingText) freeShippingText.textContent = 'Delivery fees apply based on selected area.';
                } else {
                    freeShippingBar.classList.remove('qualified');
                    freeShippingBar.classList.add('not-qualified');
                    if (freeShippingFill) freeShippingFill.style.width = `${freeShippingProgress}%`;
                    if (freeShippingText) freeShippingText.textContent = 'Delivery fees apply based on selected area.';
                }
            }
        }

        cartContainer.innerHTML = '';
        let total = 0;
        let itemCount = 0;

        if (cart.length === 0) {
            cartContainer.innerHTML = '<div class="empty-state">Your cart is empty. Browse our collection to add flowers.</div>';
        } else {
            cart.forEach(item => {
                const itemTotal = item.price * item.quantity;
                total += itemTotal;
                itemCount += item.quantity;

                const customDetailHtml = item.isCustom && item.customDetails
                    ? `<div class="cart-custom-detail">
                        <span class="cart-custom-chip">${esc(item.customDetails.arrangement)}</span>
                        <span class="cart-custom-chip">${esc(item.customDetails.flower)}</span>
                        ${item.customDetails.gift ? `<span class="cart-custom-chip">${esc(item.customDetails.gift)}</span>` : ''}
                       </div>`
                    : '';

                const cartItem = document.createElement('div');
                cartItem.className = 'cart-item';
                cartItem.innerHTML = `
                    <img src="${item.image || ''}" alt="${esc(item.name)}">
                    <div class="cart-item-details">
                        <h3>${esc(item.name)}</h3>
                        ${customDetailHtml}
                        <p class="cart-item-price">AED ${item.price.toFixed(2)}</p>
                        <div class="qty-controls">
                            <button onclick="app.updateQuantity('${esc(item.id)}', -1)" class="button" style="width: 32px; padding: 0;">−</button>
                            <span>Qty: ${item.quantity}</span>
                            <button onclick="app.updateQuantity('${esc(item.id)}', 1)" class="button" style="width: 32px; padding: 0;">+</button>
                            <button onclick="app.removeFromCart('${esc(item.id)}')" class="button secondary remove-btn">Remove</button>
                        </div>
                    </div>
                `;
                cartContainer.appendChild(cartItem);
            });
        }

        if (totalPrice) totalPrice.innerHTML = `<strong>Subtotal:</strong> AED ${total.toFixed(2)}`;
        if (totalItems) totalItems.innerHTML = `${itemCount} item${itemCount !== 1 ? 's' : ''}`;

        const subtotalRow = document.getElementById('cart-subtotal-row');
        if (subtotalRow) subtotalRow.style.display = cart.length > 0 ? 'flex' : 'none';

        updateCheckoutSummary();
    };

    const updateQuantity = (productId, change) => {
        const item = cart.find(i => i.id === productId);
        if (item) {
            item.quantity += change;
            if (item.quantity <= 0) {
                removeFromCart(productId);
            } else {
                saveCart();
                displayCart();
                updateCheckoutSummary();
            }
        }
    };

    const removeFromCart = (productId) => {
        cart = cart.filter(item => item.id !== productId);
        saveCart();
        displayCart();
        updateCheckoutSummary();
        showNotification('Item removed from cart');
    };

    let deliveryType = 'delivery';
    let deliveryFee = 0;
    let slotSurcharge = 0;
    let discountAmount = 0;
    let appliedCoupon = null;

    const _COUPON_DEFAULTS = {
        'VELVET10': { type: 'percent',  value: 10, label: '10% off',       active: true },
        'VELVET20': { type: 'percent',  value: 20, label: '20% off',       active: true },
        'WELCOME':  { type: 'fixed',    value: 15, label: 'AED 15 off',    active: true }
    };
    let couponsData = { ..._COUPON_DEFAULTS };

    const loadCoupons = () => {
        if (typeof firebase === 'undefined') return;
        firebase.database().ref('coupons').on('value', snap => {
            if (snap.exists()) {
                couponsData = {};
                snap.forEach(child => {
                    const c = child.val();
                    if (c && c.code) couponsData[c.code.toUpperCase()] = c;
                });
            } else {
                couponsData = { ..._COUPON_DEFAULTS };
            }
        });
    };

    const setDeliveryType = (type) => {
        deliveryType = type;
        const delivBtn  = document.getElementById('toggle-delivery');
        const pickupBtn = document.getElementById('toggle-pickup');
        const delivFields = document.getElementById('delivery-fields');
        const dateLabel = document.getElementById('checkout-date-label');
        const timeLabel = document.getElementById('checkout-time-label');
        const areaEl    = document.getElementById('checkout-area');
        const addrEl    = document.getElementById('checkout-address');

        if (type === 'delivery') {
            delivBtn  && delivBtn.classList.add('active');
            pickupBtn && pickupBtn.classList.remove('active');
            if (delivFields) delivFields.style.display = '';
            if (dateLabel) dateLabel.firstChild.textContent = 'Delivery Date ';
            if (timeLabel) timeLabel.firstChild.textContent = 'Delivery Time Slot ';
            if (areaEl)  areaEl.required = true;
            if (addrEl)  addrEl.required = true;
        } else {
            pickupBtn && pickupBtn.classList.add('active');
            delivBtn  && delivBtn.classList.remove('active');
            if (delivFields) delivFields.style.display = 'none';
            if (dateLabel) dateLabel.firstChild.textContent = 'Pickup Date ';
            if (timeLabel) timeLabel.firstChild.textContent = 'Pickup Time Slot ';
            if (areaEl)  areaEl.required = false;
            if (addrEl)  addrEl.required = false;
            deliveryFee = 0;
        }
        updateCheckoutSummary();
    };

    const updateDeliveryFee = () => {
        const areaEl = document.getElementById('checkout-area');
        if (!areaEl || !areaEl.value) { deliveryFee = 0; updateCheckoutSummary(); return; }
        const baseFee = parseFloat(areaEl.value.split('|')[1]) || 0;
        deliveryFee = baseFee;
        updateCheckoutSummary();
    };

    const updateTimeslotFee = () => {
        const slotEl = document.getElementById('checkout-timeslot');
        if (!slotEl || !slotEl.value) { slotSurcharge = 0; updateCheckoutSummary(); return; }
        slotSurcharge = parseFloat(slotEl.value.split('|')[1]) || 0;
        updateCheckoutSummary();
    };

    // Recomputed from the current subtotal whenever the summary redraws, so a
    // quantity change after applying a code can't leave a stale discount.
    // Mirrors couponDiscount() in functions/pricing.js, which re-checks it.
    const _couponDiscount = (subtotal) => {
        if (!appliedCoupon) return 0;
        if (appliedCoupon.type === 'percent') return parseFloat(((subtotal * appliedCoupon.value) / 100).toFixed(2));
        if (appliedCoupon.type === 'fixed') return Math.min(appliedCoupon.value, subtotal);
        return 0;
    };

    const applyCoupon = () => {
        const input = document.getElementById('checkout-coupon');
        const msg   = document.getElementById('coupon-msg');
        if (!input || !msg) return;
        const code = input.value.trim().toUpperCase();
        if (!code) return;

        const today = new Date().toISOString().slice(0, 10);
        const found = couponsData[code];
        if (found && found.active !== false && (!found.expiry || found.expiry >= today)) {
            if (found.type !== 'percent' && found.type !== 'fixed') {
                appliedCoupon = null;
                discountAmount = 0;
                msg.style.display = 'block';
                msg.className = 'coupon-msg coupon-error';
                msg.textContent = 'This coupon type is no longer accepted.';
                return;
            }
            appliedCoupon = { ...found, code };
            discountAmount = _couponDiscount(cart.reduce((s, i) => s + i.price * i.quantity, 0));
            msg.style.display = 'block';
            msg.className = 'coupon-msg coupon-success';
            msg.textContent = 'Coupon applied: ' + appliedCoupon.label;
            input.disabled = true;
            updateCheckoutSummary();
        } else {
            appliedCoupon = null;
            discountAmount = 0;
            msg.style.display = 'block';
            msg.className = 'coupon-msg coupon-error';
            msg.textContent = found && found.active === false ? 'This coupon has been disabled.'
                : found && found.expiry && found.expiry < today ? 'This coupon has expired.'
                : 'Invalid or expired coupon code.';
        }
    };

    // ── Sales-agent referral code ────────────────────────────────────────
    // Purely attribution: it records which agent sent the customer so their
    // commission can be paid. It does NOT change the price — the shop asked
    // for tracking, not a customer discount.
    let appliedReferral = null;

    const applyReferral = () => {
        const input = document.getElementById('checkout-referral');
        const msg   = document.getElementById('referral-msg');
        if (!input || !msg) return;
        const code = input.value.trim().toUpperCase();

        const show = (text, cls) => {
            msg.style.display = 'block';
            msg.className = 'coupon-msg ' + cls;
            msg.textContent = text;
        };

        if (!code) { appliedReferral = null; msg.style.display = 'none'; return; }
        // Agent codes are exactly 4 letters/numbers. Checking the shape here
        // gives a clearer message than "not recognised" and skips a pointless
        // database read; it also rules out characters illegal in a key.
        if (!/^[A-Z0-9]{4}$/.test(code)) {
            appliedReferral = null;
            show('Referral codes are 4 letters or numbers.', 'coupon-error');
            return;
        }
        if (typeof db === 'undefined') { show('Cannot check that code right now.', 'coupon-error'); return; }

        show('Checking…', 'coupon-msg-checking');
        db.ref('agent-codes/' + code).get()
            .then(snap => {
                const a = snap.exists() ? snap.val() : null;
                if (!a || a.active === false) {
                    appliedReferral = null;
                    show('That referral code wasn’t recognised.', 'coupon-error');
                    return;
                }
                appliedReferral = { code, name: a.name || '' };
                show('Referred by ' + (a.name || code) + ' ✓', 'coupon-success');
            })
            .catch(() => {
                appliedReferral = null;
                show('Could not check that code. You can still place your order.', 'coupon-error');
            });
    };

    const initDatePicker = () => {
        const dateEl = document.getElementById('checkout-date');
        if (!dateEl) return;
        const now = new Date();
        const cutoffHour = 14;
        const isAfterCutoff = now.getHours() >= cutoffHour;
        // Today is ALWAYS selectable — even after the 2 PM cutoff. Late
        // same-day requests aren't blocked; the shop confirms feasibility
        // with the customer over WhatsApp instead (see the hint below).
        const yyyy = now.getFullYear();
        const mm   = String(now.getMonth() + 1).padStart(2, '0');
        const dd   = String(now.getDate()).padStart(2, '0');
        dateEl.min = `${yyyy}-${mm}-${dd}`;
        dateEl.value = `${yyyy}-${mm}-${dd}`;

        const hint = document.getElementById('sameday-hint');
        if (hint) hint.style.display = isAfterCutoff ? 'block' : 'none';
    };

    const openCheckoutModal = () => {
        if (cart.length === 0) {
            showNotification('Your cart is empty', 'warning');
            return;
        }
        showCheckoutForm();
    };

    const showCheckoutForm = () => {
        deliveryType = 'delivery';
        deliveryFee = 0;
        discountAmount = 0;
        appliedCoupon = null;

        const couponInput = document.getElementById('checkout-coupon');
        const couponMsg   = document.getElementById('coupon-msg');
        if (couponInput) { couponInput.value = ''; couponInput.disabled = false; }
        if (couponMsg)   { couponMsg.style.display = 'none'; }

        appliedReferral = null;
        const refInput = document.getElementById('checkout-referral');
        const refMsg   = document.getElementById('referral-msg');
        if (refInput) { refInput.value = ''; refInput.disabled = false; }
        if (refMsg)   { refMsg.style.display = 'none'; }

        const areaEl = document.getElementById('checkout-area');
        if (areaEl) areaEl.value = '';

        slotSurcharge = 0;
        const slotEl = document.getElementById('checkout-timeslot');
        if (slotEl) slotEl.value = '';

        setDeliveryType('delivery');
        initDatePicker();
        updateCheckoutSummary();

        const user = firebase.auth().currentUser;
        if (user) {
            const nameEl  = document.getElementById('checkout-name');
            const emailEl = document.getElementById('checkout-email');
            if (nameEl  && !nameEl.value)  nameEl.value  = user.displayName || '';
            if (emailEl && !emailEl.value) emailEl.value = user.email || '';
        }
    };

    const updateCheckoutSummary = () => {
        const summaryEl = document.getElementById('checkout-order-summary');
        if (!summaryEl) return;
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        discountAmount = _couponDiscount(subtotal);
        const effectiveDeliveryFee = deliveryType === 'delivery' ? deliveryFee : 0;
        const total = Math.max(0, subtotal + effectiveDeliveryFee + slotSurcharge - discountAmount);

        const itemLines = cart.map(item =>
            `<div class="checkout-summary-row">
                <span>${esc(item.name)} × ${item.quantity}</span>
                <span>AED ${(item.price * item.quantity).toFixed(2)}</span>
            </div>`
        ).join('');

        let deliveryLine;
        if (deliveryType !== 'delivery') {
            deliveryLine = `<div class="checkout-summary-row"><span>In-store pickup</span><span>Free</span></div>`;
        } else {
            deliveryLine = `<div class="checkout-summary-row"><span>Delivery fee</span><span>${deliveryFee > 0 ? 'AED ' + deliveryFee.toFixed(2) : '—'}</span></div>`;
        }

        const slotLine = slotSurcharge > 0
            ? `<div class="checkout-summary-row"><span>Express/Midnight surcharge</span><span>AED ${slotSurcharge.toFixed(2)}</span></div>`
            : '';

        const discountLine = discountAmount > 0
            ? `<div class="checkout-summary-row checkout-summary-discount"><span>Discount (${appliedCoupon ? appliedCoupon.code : ''})</span><span>-AED ${discountAmount.toFixed(2)}</span></div>`
            : '';

        // Prices are VAT-inclusive: the 5% VAT is already inside the total,
        // so we only display how much of it is VAT (total × 5 / 105).
        const vatIncluded = total * 5 / 105;

        summaryEl.innerHTML = `
            <div class="checkout-summary-box">
                ${itemLines}
                ${deliveryLine}
                ${slotLine}
                ${discountLine}
                <div class="checkout-summary-total">
                    <span>Total</span>
                    <span>AED ${total.toFixed(2)}</span>
                </div>
                <div class="checkout-summary-vat">
                    <span>Includes 5% VAT</span>
                    <span>AED ${vatIncluded.toFixed(2)}</span>
                </div>
            </div>`;
    };

    const handleCheckoutSubmit = async (event) => {
        event.preventDefault();

        if (cart.length === 0) {
            showNotification('Your cart is empty — add some flowers first!', 'warning');
            return;
        }

        const name      = document.getElementById('checkout-name').value.trim();
        const email     = document.getElementById('checkout-email').value.trim();
        const phone     = document.getElementById('checkout-phone').value.trim();
        const notes     = document.getElementById('checkout-notes').value.trim();
        const dateEl    = document.getElementById('checkout-date');
        const slotEl    = document.getElementById('checkout-timeslot');
        const date      = dateEl ? dateEl.value : '';
        const timeSlot  = slotEl ? slotEl.value.split('|')[0] : '';

        let area = '', address = '';
        if (deliveryType === 'delivery') {
            const areaEl = document.getElementById('checkout-area');
            const addrEl = document.getElementById('checkout-address');
            area    = areaEl ? areaEl.value.split('|')[0] : '';
            address = addrEl ? addrEl.value.trim() : '';
            if (!area || !address) {
                showNotification('Please select your area and enter your delivery address', 'warning');
                return;
            }
        }

        if (!name || !phone || !date || !timeSlot) {
            showNotification('Please fill in all required fields', 'warning');
            return;
        }

        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        discountAmount = _couponDiscount(subtotal);
        const fee = deliveryType === 'delivery' ? deliveryFee : 0;
        const total = Math.max(0, subtotal + fee + slotSurcharge - discountAmount);

        const order = {
            customer: { name, email, phone, notes },
            uid: (firebase.auth().currentUser || {}).uid || null,
            fulfillment: {
                type: deliveryType,
                ...(deliveryType === 'delivery' ? { area, address, deliveryFee: fee } : {}),
                date,
                timeSlot
            },
            items: cart.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                subtotal: parseFloat((item.price * item.quantity).toFixed(2)),
                ...(item.isCustom ? { isCustom: true, customDetails: item.customDetails } : {})
            })),
            subtotal: parseFloat(subtotal.toFixed(2)),
            deliveryFee: fee,
            slotSurcharge: slotSurcharge,
            discount: discountAmount,
            coupon: appliedCoupon ? appliedCoupon.code : null,
            // Which sales agent referred this order, for their commission.
            agentCode: appliedReferral ? appliedReferral.code : null,
            agentName: appliedReferral ? appliedReferral.name : null,
            total: parseFloat(total.toFixed(2)),
            paymentMethod: 'geidea',
            paymentStatus: 'pending payment',
            timestamp: new Date().toISOString(),
            status: 'pending',
            statusHistory: [{ status: 'pending', ts: new Date().toISOString(), note: 'Order placed' }]
        };

        const submitBtn = document.getElementById('checkout-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Placing Order...'; }

        if (typeof ordersRef !== 'undefined') {
            ordersRef.push(order)
                .then(async (ref) => {
                    _writeOrderTracking(ref.key, order).catch(err => console.error('Order tracking write failed:', err));
                    if (order.uid && typeof db !== 'undefined') {
                        db.ref('user-orders').child(order.uid).child(ref.key).set(true).catch(() => {});
                    }
                    if (typeof firebase !== 'undefined' && firebase.functions) {
                        firebase.functions().httpsCallable('sendOrderNotifications')({ order, orderId: ref.key }).catch(() => {});
                    }
                    // Try the Geidea hosted payment page; when the gateway isn't
                    // configured (or errors), fall back to the manual flow.
                    const payUrl = await _createGeideaCheckout(ref.key);
                    if (payUrl) {
                        // Keep the cart intact through the payment. It's only
                        // cleared once payment succeeds (on the result page), so
                        // if the customer cancels they return to a full cart.
                        if (submitBtn) { submitBtn.textContent = 'Redirecting to payment...'; }
                        window.location.href = payUrl;
                        return;
                    }
                    clearCartAndShowSuccess(order, ref.key);
                })
                .catch(err => {
                    // The order never reached the shop, so say so and keep the
                    // cart — a "success" here would leave the customer waiting
                    // for flowers nobody knows about.
                    console.error('Firebase order error:', err);
                    _showOrderFailed();
                })
                .finally(() => { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Place Order'; } });
        } else {
            _showOrderFailed();
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Place Order'; }
        }
    };

    const _showOrderFailed = () => {
        showNotification('We couldn’t place your order. Please try again, or WhatsApp us on +971 50 744 3100.', 'error');
    };

    // Ask the backend for a Geidea hosted-payment-page session for this order.
    // Returns the checkout URL, or null when the gateway is unavailable /
    // not yet configured — in which case checkout keeps the manual flow.
    const _createGeideaCheckout = async (orderId) => {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 12000);
            const resp = await fetch('https://us-central1-flowershop-d26f4.cloudfunctions.net/createGeideaSession', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId }),
                signal: controller.signal
            });
            clearTimeout(timer);
            const data = await resp.json();
            if (data && data.enabled && data.checkoutUrl) return data.checkoutUrl;
        } catch (e) {
            console.warn('Geidea checkout unavailable, using manual flow:', e && e.message);
        }
        return null;
    };

    // Public, PII-free copy of the order for guest tracking: no name, phone,
    // email, address, or notes — just status/items/total plus contact hashes
    // so the guest lookup can verify ownership without exposing anything.
    const _writeOrderTracking = async (key, order) => {
        if (typeof db === 'undefined') return;
        const customer = order.customer || {};
        const contactHashes = [];
        const email = normalizeContactEmail(customer.email);
        const phone = normalizeContactPhone(customer.phone);
        if (email) contactHashes.push(await sha256Hex(email));
        if (phone) contactHashes.push(await sha256Hex(phone));
        const f = order.fulfillment || {};
        await db.ref('order-tracking').child(key).set({
            status: order.status || 'pending',
            // Short, customer-friendly code (last 6 of the key). Stored so the
            // guest Track page can look an order up by this instead of the long
            // internal ID. Matches the "#XXXXXX" the admin/customer already see.
            trackingId: rvTrackingId(key),
            timestamp: order.timestamp,
            total: order.total,
            items: (order.items || []).map(i => ({ name: i.name, quantity: i.quantity })),
            fulfillment: {
                type: f.type || 'delivery',
                ...(f.area ? { area: f.area } : {}),
                ...(f.date ? { date: f.date } : {}),
                ...(f.timeSlot ? { timeSlot: f.timeSlot } : {})
            },
            contactHashes
        });
    };

    const clearCartAndShowSuccess = (order, orderKey = null) => {
        cart = [];
        saveCart();
        displayCart();

        const reminder = document.getElementById('success-payment-reminder');
        if (reminder) {
            const fulfillmentLine = order.fulfillment.type === 'delivery'
                ? `<p>Delivery to <strong>${esc(order.fulfillment.area)}</strong> on <strong>${esc(order.fulfillment.date)}</strong>, ${esc(order.fulfillment.timeSlot)}</p>`
                : `<p>In-store pickup on <strong>${esc(order.fulfillment.date)}</strong>, ${esc(order.fulfillment.timeSlot)}</p>`;
            reminder.style.display = 'block';
            const paymentLine = `<p>We'll send you a <strong>Geidea payment link via WhatsApp</strong> shortly to complete your payment of <strong>AED ${order.total.toFixed(2)}</strong>.</p>`;
            reminder.innerHTML = `
                <div class="reminder-box">
                    ${fulfillmentLine}
                    ${paymentLine}
                </div>`;
        }

        const guestIdEl = document.getElementById('success-order-id');
        if (guestIdEl) {
            if (!order.uid && orderKey) {
                const trackingId = rvTrackingId(orderKey);
                guestIdEl.style.display = 'block';
                guestIdEl.innerHTML = `<div class="guest-order-id-box">
                    <p class="guest-order-id-label">Save your Tracking ID to track your order later:</p>
                    <code class="guest-order-id-code">${trackingId}</code>
                    <a href="orders.html" class="guest-track-link button secondary" style="display:inline-block;margin-top:10px;font-size:0.85em;">Track Order</a>
                </div>`;
            } else {
                guestIdEl.style.display = 'none';
            }
        }

        const successModal = document.getElementById('success-modal');
        if (successModal) successModal.classList.add('active');
    };

    const showNotification = (message, type = 'success') => {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => { toast.classList.add('show'); });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    return {
        init,
        updateQuantity,
        removeFromCart,
        addToCart,
        toggleWishlist,
        cart,
        filterByCategory,
        filterByOccasion,
        filterByRecipient,
        filterByArrangementType,
        resetFilters,
        searchProducts,
        showAllSearchMatches,
        addCustomOrderToCart,
        setDeliveryType,
        updateDeliveryFee,
        updateTimeslotFee,
        applyCoupon,
        applyReferral,
        _setProducts: (products) => {
            allProducts = products;
            updateCategoryFilterCounts();
            displayProducts(getFilteredProducts());
        },
        _openCheckoutDirect: showCheckoutForm
    };
})();

document.addEventListener('DOMContentLoaded', app.init);
