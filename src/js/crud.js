const crud = (() => {
    const esc = (str) => String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    let flowers = {};
    let wishlistCounts = {};
    let allOrders = [];
    let currentFilter = 'all';
    let currentProductFilter = 'all';
    let currentProductSearch = '';
    let currentOrderSearch   = '';
    let calYear  = new Date().getFullYear();
    let calMonth = new Date().getMonth();
    let selectedCalDate = null;

    const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
    const isHistorical = (order) => {
        if (!order.timestamp) return false;
        return (Date.now() - new Date(order.timestamp).getTime()) >= ONE_MONTH_MS;
    };

    const catLabels = { flower: 'Flower', arrangement: 'Arrangement', gift: 'Gift', bundle: 'Bundle', chocolates: 'Chocolates', cakes: 'Cakes & Pastries' };
    const badgeLabels = { new: 'NEW', bestseller: 'BESTSELLER', hotpick: 'HOT PICK', sale: 'SALE' };
    const badgeColors = { new: '#27ae60', bestseller: '#b68d40', hotpick: '#e74c3c', sale: '#e67e22' };
    // Products with stockQty at or below this are flagged LOW in the admin.
    const LOW_STOCK_THRESHOLD = 3;
    const payLabels   = { geidea: 'Geidea', nomod: 'Nomod', cod: 'Cash on Delivery', bank: 'Bank Transfer', gcash: 'GCash', adcb: 'Online Card (ADCB)', applepay: 'Apple Pay',
        deliveroo: 'Paid via Deliveroo', walkin: 'Paid in store', whatsapp: 'Paid via WhatsApp', phone: 'Paid by phone', instagram: 'Paid via Instagram' };
    // Third-party courier used to fulfill the order (separate from payment method).
    const deliveryCompanyLabels = { deliveroo: 'Deliveroo Normal', deliveroo_marketplace: 'Deliveroo (Market Place)', slider: 'Slider' };
    // Where a sale came from. Absent on storefront orders — those are the
    // website itself. Set only on orders keyed in by hand from another channel.
    const SOURCE_LABELS = { deliveroo: 'Deliveroo', walkin: 'Walk-in', whatsapp: 'WhatsApp', phone: 'Phone', instagram: 'Instagram' };
    // Lower-cased so an oddly-cased legacy row ("Gift") groups with "gift"
    // instead of becoming its own category in the filters and inventory list.
    const getCategory = (p) => String(p.category || 'flower').toLowerCase();

    // ── Product-name title casing ────────────────────────────────────────
    // Short joining words stay lowercase unless they open or close the name,
    // which is what keeps "Reign of Roses Bouquet" and "Fleur de Lumière"
    // reading correctly instead of "Reign Of Roses" and "Fleur De Lumière".
    const TITLE_MINOR_WORDS = new Set([
        'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into',
        'nor', 'of', 'on', 'onto', 'or', 'over', 'per', 'the', 'to', 'up',
        'via', 'vs', 'with',
        // French/Spanish particles used in several arrangement names
        'de', 'del', 'des', 'du', 'la', 'le', 'les', 'y'
    ]);

    const _capWord = (w) => {
        // Capitalise after a hyphen too ("Rose-Gold"), but not after an
        // apostrophe ("Mother's", never "Mother'S").
        return w.replace(/([^\s-]+)/g, (part) =>
            part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
    };

    const toTitleCase = (raw) => {
        const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
        if (!s) return '';
        // A name typed entirely in capitals is being shouted, not abbreviated —
        // title-case the whole thing. In a mixed name, an ALL-CAPS word is
        // almost certainly an acronym or size code (XL, VIP), so leave it be.
        const shouting = s === s.toUpperCase() && /[A-Z]{2}/.test(s);
        const words = s.split(' ');
        return words.map((w, i) => {
            const bare = w.replace(/[^A-Za-z]/g, '');
            if (!shouting && bare.length >= 2 && bare === bare.toUpperCase()) return w;
            const lower = w.toLowerCase();
            const isEdge = i === 0 || i === words.length - 1;
            if (!isEdge && TITLE_MINOR_WORDS.has(lower.replace(/[^a-z]/g, ''))) return lower;
            return _capWord(lower);
        }).join(' ');
    };

    const STEM_PRICES = [
        { keywords: ['hydrangea'],                              label: 'Hydrangea',     price: 35 },
        { keywords: ['philonopsis','phalaenopsis','orchid'],    label: 'Orchid',        price: 25 },
        { keywords: ['sunflower'],                              label: 'Sunflower',     price: 25 },
        { keywords: ['lily','lilies'],                          label: 'Lily',          price: 25 },
        { keywords: ['tulip'],                                  label: 'Tulip',         price: 12 },
        { keywords: ['gerbera'],                                label: 'Gerbera',       price: 12 },
        { keywords: ['spray rose','baby rose','spray roses'],   label: 'Spray Rose',    price: 10 },
        { keywords: ['sweetheart rose','sweetheart roses','rose','roses'], label: 'Rose', price: 10 },
        { keywords: ['carnation'],                              label: 'Carnation',     price: 10 },
        { keywords: ['lisianthus'],                             label: 'Lisianthus',    price: 10 },
        { keywords: ['chrysanthemum'],                          label: 'Chrysanthemum', price: 10 },
        { keywords: ['matthiolla','matthiola'],                 label: 'Matthiolla',    price: 10 },
        { keywords: ['pingpong','ping pong'],                   label: 'Pingpong',      price: 10 },
        { keywords: ['snapdragon'],                             label: 'Snapdragon',    price: 8  },
        { keywords: ['eucalyptus','filler','fillers','greens'], label: 'Fillers',       price: 5  },
    ];

    const inferAllStemPrices = (product) => {
        const text = ((product.name || '') + ' ' + (product.description || '')).toLowerCase();
        const matched = [];
        const usedLabels = new Set();
        for (const entry of STEM_PRICES) {
            if (usedLabels.has(entry.label)) continue;
            if (entry.keywords.some(kw => text.includes(kw))) {
                matched.push(entry);
                usedLabels.add(entry.label);
            }
        }
        return matched;
    };

    const init = () => {
        loadFlowersFromFirebase();
        loadWishlistCounts();
        setupFormListener();
        loadOrdersFromFirebase();
    };

    const loadWishlistCounts = () => {
        if (typeof firebase === 'undefined' || !firebase.database) return;
        firebase.database().ref('productWishlists').on('value', snap => {
            const data = snap.val() || {};
            wishlistCounts = {};
            Object.entries(data).forEach(([productId, users]) => {
                if (users && typeof users === 'object') {
                    wishlistCounts[productId] = Object.keys(users).length;
                }
            });
            displayFlowers();
        });
    };

    const loadFlowersFromFirebase = () => {
        if (typeof flowersRef === 'undefined') {
            console.error('Firebase not initialized');
            return;
        }

        flowersRef.on('value', snapshot => {
            flowers = {};
            if (snapshot.exists()) {
                snapshot.forEach(childSnapshot => {
                    // The database key is the product's real ID; a stored
                    // `id` field must never override it.
                    flowers[childSnapshot.key] = {
                        ...childSnapshot.val(),
                        id: childSnapshot.key
                    };
                });
            }
            displayFlowers();
        });
    };

    // Splits text into list items: commas OR newlines separate, and a number
    // starting a new entry ("2 hydrangea white 5 spray rose") also splits —
    // no commas needed. "20cm" style numbers inside an item don't split.
    const parseQuantityItems = (raw) => {
        if (!raw) return [];
        return String(raw)
            .split(/[,\n]/)
            .flatMap(chunk => chunk.split(/\s+(?=\d+\s)/g))
            .map(s => s.trim())
            .filter(Boolean);
    };

    // Live bullet preview shared by the Quantity and Perfect-For fields.
    const _renderItemsPreview = (inputId, previewId, label) => {
        const input   = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        if (!input || !preview) return;
        const items = parseQuantityItems(input.value);
        if (items.length === 0) {
            preview.style.display = 'none';
            preview.innerHTML = '';
            return;
        }
        preview.style.display = 'block';
        preview.innerHTML = '<span class="quantity-preview-label">' + label + '</span><ul>' +
            items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>';
    };
    const _renderQuantityPreview  = () => _renderItemsPreview('product-quantity', 'quantity-preview', 'What\'s Included preview');
    const _renderPerfectForPreview = () => _renderItemsPreview('product-perfect-for', 'perfect-for-preview', 'Perfect For preview');

    const setupFormListener = () => {
        const form = document.getElementById('product-form');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        // Tidy the product name when the field loses focus rather than on
        // every keystroke, so capitalisation never fights the admin mid-word.
        const nameEl = document.getElementById('product-name');
        if (nameEl) {
            nameEl.addEventListener('blur', () => {
                const tidy = toTitleCase(nameEl.value);
                if (tidy !== nameEl.value) nameEl.value = tidy;
            });
        }

        // Wire the two list fields: live preview on input, tidy commas on blur.
        [['product-quantity', _renderQuantityPreview],
         ['product-perfect-for', _renderPerfectForPreview]].forEach(([id, render]) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', render);
            el.addEventListener('blur', () => {
                const items = parseQuantityItems(el.value);
                if (items.length) el.value = items.join(', ');
                render();
            });
        });

        const updateBtn = document.getElementById('update-button');
        if (updateBtn) {
            updateBtn.addEventListener('click', () => {
                const form = document.getElementById('product-form');
                if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            });
        }

        const cancelBtn = document.getElementById('cancel-button');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', exitEditMode);
        }
    };

    // The .editing class turns the form panel into a modal (see styles.css);
    // backdrop click and Escape both cancel out of it.
    const _openEditBackdrop = () => {
        let bd = document.getElementById('edit-modal-backdrop');
        if (!bd) {
            bd = document.createElement('div');
            bd.id = 'edit-modal-backdrop';
            bd.addEventListener('click', exitEditMode);
            document.body.appendChild(bd);
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && document.body.classList.contains('edit-modal-open')) exitEditMode();
            });
        }
        bd.classList.add('active');
        document.body.classList.add('edit-modal-open');
        const panel = document.getElementById('form-panel');
        if (panel) panel.scrollTop = 0;
    };

    const _closeEditBackdrop = () => {
        const bd = document.getElementById('edit-modal-backdrop');
        if (bd) bd.classList.remove('active');
        document.body.classList.remove('edit-modal-open');
    };

    const enterEditMode = (flowerName) => {
        const title = document.getElementById('form-panel-title');
        const badge = document.getElementById('edit-mode-badge');
        const addBtn = document.getElementById('add-button');
        const updateBtn = document.getElementById('update-button');
        const cancelBtn = document.getElementById('cancel-button');
        const panel = document.getElementById('form-panel');

        if (title) title.textContent = `Edit: ${flowerName}`;
        if (badge) badge.style.display = 'flex';
        if (addBtn) addBtn.style.display = 'none';
        if (updateBtn) updateBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
        if (panel) panel.classList.add('editing');
        _openEditBackdrop();
    };

    const exitEditMode = () => {
        const form = document.getElementById('product-form');
        const title = document.getElementById('form-panel-title');
        const badge = document.getElementById('edit-mode-badge');
        const addBtn = document.getElementById('add-button');
        const updateBtn = document.getElementById('update-button');
        const cancelBtn = document.getElementById('cancel-button');
        const panel = document.getElementById('form-panel');

        if (form) form.reset();
        document.getElementById('product-id').value = '';
        if (title) title.textContent = 'Add New Product';
        if (badge) badge.style.display = 'none';
        if (addBtn) addBtn.style.display = 'inline-block';
        if (updateBtn) updateBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (panel) panel.classList.remove('editing');
        document.querySelectorAll('.discount-chip').forEach(b => b.classList.remove('active'));
        _renderQuantityPreview();
        _renderPerfectForPreview();
        _closeEditBackdrop();
        const previewWrap = document.getElementById('edit-preview-wrap');
        if (previewWrap) previewWrap.style.display = 'none';

        if (typeof imgInput !== 'undefined') imgInput.reset();
    };

    const handleFormSubmit = (event) => {
        event.preventDefault();

        const id          = document.getElementById('product-id').value;
        // Normalised on save as well as on blur, so a pasted or
        // autofilled name is tidied even if the field never lost focus.
        const name        = toTitleCase(document.getElementById('product-name').value);
        const price       = parseFloat(document.getElementById('product-price').value);
        const salePriceRaw = parseFloat(document.getElementById('product-sale-price')?.value);
        const salePrice   = (!isNaN(salePriceRaw) && salePriceRaw > 0 && salePriceRaw < price) ? salePriceRaw : null;
        const description = document.getElementById('product-description').value;
        const image       = document.getElementById('product-image').value;
        const category        = document.getElementById('product-category')?.value || 'flower';
        const arrangementType = (category === 'arrangement' || category === 'bundle') ? (document.getElementById('product-arrangement-type')?.value || '') : '';
        // Normalize: bullets split on numbers/commas, stored comma-separated
        // (the product page's What's Included list splits on commas).
        const quantity        = parseQuantityItems(document.getElementById('product-quantity')?.value).join(', ');
        const perfectFor      = parseQuantityItems(document.getElementById('product-perfect-for')?.value).join(', ');
        const badge           = document.getElementById('product-badge')?.value || '';
        const occasion        = document.getElementById('product-occasion')?.value || '';
        const recipient       = document.getElementById('product-recipient')?.value || '';
        const inStock         = document.getElementById('product-available')?.checked !== false;
        const hidden          = document.getElementById('product-hidden')?.checked === true;
        // Stock is opt-in per product. A blank box means "don't count this one"
        // (stored as null) — NOT zero, so existing products aren't marked sold
        // out the moment this ships. Made-to-order bouquets can stay untracked
        // while gift items and ready-made boxes are counted.
        const stockRaw        = (document.getElementById('product-stock')?.value ?? '').trim();
        const stockQty        = stockRaw === '' ? null : Math.max(0, Math.floor(Number(stockRaw) || 0));

        if (!name || !price || !description || !image) {
            showToast('Please fill in all fields', 'warning');
            return;
        }

        if (salePrice !== null && salePrice >= price) {
            showToast('Sale price must be less than original price', 'warning');
            return;
        }

        const duplicate = Object.values(flowers).find(p => p.image === image && p.id !== id);
        if (duplicate) {
            showToast(`This image is already used by "${duplicate.name}". Please use a different image.`, 'error');
            return;
        }

        // The storefront shows only one product per name, so a second product
        // with the same name would silently never appear in the shop.
        const sameName = Object.entries(flowers).find(([key, p]) =>
            key !== id && String(p.name || '').toLowerCase().trim() === name.toLowerCase());
        if (sameName) {
            showToast(`Another product is already called "${sameName[1].name}". Please give this one a different name — the shop only shows one product per name.`, 'error');
            return;
        }

        // A tracked item at zero is sold out regardless of the toggle.
        const effectiveInStock = (stockQty !== null && stockQty === 0) ? false : inStock;

        if (id) {
            updateFlower(id, { name, price, salePrice, description, image, category, arrangementType, quantity, perfectFor, badge, occasion, recipient, inStock: effectiveInStock, hidden, stockQty });
        } else {
            addFlower({ name, price, salePrice, description, image, category, arrangementType, quantity, perfectFor, badge, occasion, recipient, inStock: effectiveInStock, hidden, stockQty });
        }

        exitEditMode();
    };

    const addFlower = (flowerData) => {
        if (typeof flowersRef === 'undefined') {
            console.error('Firebase not initialized');
            showToast('Firebase not connected', 'error');
            return;
        }

        const newFlowerId = flowersRef.push().key;
        flowersRef.child(newFlowerId).set({
            id: newFlowerId,
            createdAt: new Date().toISOString(),
            ...flowerData
        }).then(() => {
            console.log('Flower added to Firebase');
            showToast('Product added successfully');
        }).catch(error => {
            console.error('Error adding flower:', error);
            showToast('Error adding product: ' + error.message, 'error');
        });
    };

    const updateFlower = (id, flowerData) => {
        if (typeof flowersRef === 'undefined') {
            console.error('Firebase not initialized');
            showToast('Firebase not connected', 'error');
            return;
        }

        flowersRef.child(id).update({
            ...flowerData
        }).then(() => {
            console.log('Flower updated in Firebase');
            showToast('Product updated successfully');
        }).catch(error => {
            console.error('Error updating flower:', error);
            showToast('Error updating product: ' + error.message, 'error');
        });
    };

    const deleteFlower = (id) => {
        if (typeof flowersRef === 'undefined') {
            console.error('Firebase not initialized');
            showToast('Firebase not connected', 'error');
            return;
        }

        const flower = flowers[id];
        const flowerName = flower ? flower.name : 'this product';

        openDeleteModal(flowerName, () => {
            flowersRef.child(id).remove().then(() => {
                console.log('Flower deleted from Firebase');
                showToast('Product deleted successfully');
            }).catch(error => {
                console.error('Error deleting flower:', error);
                showToast('Error deleting product: ' + error.message, 'error');
            });
        });
    };

    const openDeleteModal = (flowerName, onConfirm) => {
        const overlay = document.getElementById('delete-modal');
        const nameEl = document.getElementById('modal-flower-name');
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');

        if (!overlay) return;

        nameEl.textContent = flowerName;
        overlay.classList.add('active');

        const close = () => {
            overlay.classList.remove('active');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', close);
            overlay.removeEventListener('click', handleBackdrop);
            document.removeEventListener('keydown', handleEsc);
        };

        const handleConfirm = () => {
            close();
            onConfirm();
        };

        const handleBackdrop = (e) => {
            if (e.target === overlay) close();
        };

        const handleEsc = (e) => {
            if (e.key === 'Escape') close();
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', close);
        overlay.addEventListener('click', handleBackdrop);
        document.addEventListener('keydown', handleEsc);
    };

    const editFlower = (id) => {
        const flower = flowers[id];
        if (!flower) {
            showToast('Product not found', 'error');
            return;
        }

        document.getElementById('product-id').value = id;
        document.getElementById('product-name').value = flower.name;
        document.getElementById('product-price').value = flower.price;
        const salePriceEl = document.getElementById('product-sale-price');
        if (salePriceEl) salePriceEl.value = (flower.salePrice && flower.salePrice > 0) ? flower.salePrice : '';
        document.getElementById('product-description').value = flower.description;
        document.getElementById('product-image').value = flower.image;
        const catEl = document.getElementById('product-category');
        if (catEl) catEl.value = flower.category || 'flower';
        const atypeGroup = document.getElementById('arrangement-type-group');
        const atypeEl    = document.getElementById('product-arrangement-type');
        if (atypeGroup && atypeEl) {
            const showAtype = (flower.category === 'arrangement' || flower.category === 'bundle');
            atypeGroup.style.display = showAtype ? '' : 'none';
            atypeEl.value = flower.arrangementType || '';
        }
        const qtyEl = document.getElementById('product-quantity');
        if (qtyEl) qtyEl.value = flower.quantity || '';
        _renderQuantityPreview();
        const pfEl = document.getElementById('product-perfect-for');
        if (pfEl) pfEl.value = flower.perfectFor || '';
        _renderPerfectForPreview();
        const badgeEl = document.getElementById('product-badge');
        if (badgeEl) badgeEl.value = flower.badge || '';
        const occEl = document.getElementById('product-occasion');
        if (occEl) occEl.value = flower.occasion || '';
        const recEl = document.getElementById('product-recipient');
        if (recEl) recEl.value = flower.recipient || '';
        const stockEl = document.getElementById('product-stock');
        // null/undefined means untracked — show an empty box, not "0".
        if (stockEl) stockEl.value = (flower.stockQty === null || flower.stockQty === undefined) ? '' : flower.stockQty;
        const availEl = document.getElementById('product-available');
        const availLabel = document.getElementById('availability-label');
        if (availEl) {
            availEl.checked = flower.inStock !== false;
            if (availLabel) {
                availLabel.textContent = availEl.checked ? 'In Stock' : 'Sold Out';
                availLabel.className   = 'avail-label ' + (availEl.checked ? 'avail-in-stock' : 'avail-sold-out');
            }
        }
        const hiddenEl = document.getElementById('product-hidden');
        const hiddenLabel = document.getElementById('hidden-label');
        if (hiddenEl) {
            hiddenEl.checked = flower.hidden === true;
            if (hiddenLabel) {
                hiddenLabel.textContent = hiddenEl.checked ? 'Hidden from store' : 'Visible in store';
                hiddenLabel.className   = 'avail-label ' + (hiddenEl.checked ? 'avail-sold-out' : 'avail-in-stock');
            }
        }

        const previewWrap = document.getElementById('edit-preview-wrap');
        const previewImg  = document.getElementById('edit-preview-img');
        const previewName = document.getElementById('edit-preview-name');
        if (previewWrap && previewImg && previewName) {
            previewImg.src = flower.image || '';
            previewImg.alt = flower.name || '';
            previewName.textContent = flower.name || '';
            previewWrap.style.display = flower.image ? '' : 'none';
        }

        document.querySelectorAll('.discount-chip').forEach(b => b.classList.remove('active'));
        enterEditMode(flower.name);
    };

    const filterProducts = (cat) => {
        currentProductFilter = cat;
        document.querySelectorAll('.admin-pf-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.cat === cat);
        });
        displayFlowers();
    };

    const searchAdminProducts = (query) => {
        currentProductSearch = query;
        displayFlowers();
    };

    // ── Catalogue export (for the delivery company) ──────────────────────
    // Order categories the way the shop thinks about them rather than
    // alphabetically, so the sheet reads the same every time it's produced.
    const CATALOGUE_CAT_ORDER = ['arrangement', 'flower', 'gift', 'bundle', 'chocolates', 'cakes'];

    // Every product grouped by category, each group sorted by name.
    // `price` is the ORIGINAL price — the pre-discount figure the delivery
    // company needs for declaring the value of the goods. `salePrice` is
    // carried alongside it so nothing is hidden, never in place of it.
    // A handful of product names carry stray leading/trailing spaces from data
    // entry. The browser hides that on the storefront, but it throws off
    // alphabetical order and looks careless in a document sent to a courier,
    // so the export always uses the tidied name.
    const _cleanName = (p) => String(p.name || '').replace(/\s+/g, ' ').trim();

    const _catalogueGroups = () => {
        const byCat = {};
        Object.values(flowers).forEach(p => {
            const c = getCategory(p);
            (byCat[c] = byCat[c] || []).push(p);
        });
        const known = CATALOGUE_CAT_ORDER.filter(c => byCat[c]);
        const rest  = Object.keys(byCat).filter(c => CATALOGUE_CAT_ORDER.indexOf(c) === -1).sort();
        return known.concat(rest).map(c => ({
            key: c,
            label: catLabels[c] || c,
            items: byCat[c].sort((a, b) => _cleanName(a).localeCompare(_cleanName(b)))
        }));
    };

    const _origPrice = (p) => {
        const n = parseFloat(p.price);
        return isNaN(n) ? 0 : n;
    };
    const _salePrice = (p) => {
        const s = parseFloat(p.salePrice);
        const o = _origPrice(p);
        return (!isNaN(s) && s > 0 && s < o) ? s : null;
    };
    const _statusLabel = (p) => p.hidden === true ? 'Hidden'
        : p.inStock === false ? 'Sold out'
        : 'Available';

    const exportCatalogueXlsx = () => {
        const groups = _catalogueGroups();
        const count  = groups.reduce((n, g) => n + g.items.length, 0);
        if (!count) { showToast('No products to export', 'error'); return; }

        const rows = [];
        groups.forEach(g => {
            g.items.forEach(p => {
                rows.push([
                    p.id,
                    g.label,
                    _cleanName(p),
                    _origPrice(p),
                    _salePrice(p),
                    (p.stockQty === null || p.stockQty === undefined) ? null : p.stockQty,
                    _statusLabel(p)
                ]);
            });
        });

        xlsxExport.download('velvet-royals-catalogue-' + new Date().toISOString().slice(0, 10) + '.xlsx', [{
            name: 'Price List',
            columns: [
                // Lets "Update Prices" match rows back to products exactly,
                // even when two products share a name.
                { header: 'Product ID', width: 23 },
                { header: 'Category', width: 18 },
                { header: 'Item Name', width: 40 },
                { header: 'Original Price (AED)', type: 'money', width: 20 },
                { header: 'Sale Price (AED)', type: 'money', width: 17 },
                { header: 'Stock Qty', type: 'number', width: 11 },
                { header: 'Status', width: 12 }
            ],
            rows
        }]);
        showToast('Exported ' + count + ' item' + (count !== 1 ? 's' : '') + ' to Excel');
    };

    // Presentable one-document version — this is what actually gets handed to
    // or emailed to the courier. Print to PDF from the browser dialog.
    const printCatalogue = () => {
        const groups = _catalogueGroups();
        const count  = groups.reduce((n, g) => n + g.items.length, 0);
        if (!count) { showToast('No products to export', 'error'); return; }

        const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
        let grand = 0;

        const body = groups.map(g => {
            const subtotal = g.items.reduce((n, p) => n + _origPrice(p), 0);
            grand += subtotal;
            const rows = g.items.map(p => {
                const sale = _salePrice(p);
                return '<tr>' +
                    '<td>' + esc(_cleanName(p)) + '</td>' +
                    '<td class="num">' + _origPrice(p).toFixed(2) + '</td>' +
                    '<td class="num muted">' + (sale === null ? '—' : sale.toFixed(2)) + '</td>' +
                    '<td class="num muted">' + ((p.stockQty === null || p.stockQty === undefined) ? '—' : p.stockQty) + '</td>' +
                    '<td class="muted">' + esc(_statusLabel(p)) + '</td>' +
                '</tr>';
            }).join('');
            return '<h2>' + esc(g.label) + ' <span class="cnt">' + g.items.length + ' item' + (g.items.length !== 1 ? 's' : '') + '</span></h2>' +
                '<table><thead><tr>' +
                    '<th>Item Name</th><th class="num">Original Price (AED)</th>' +
                    '<th class="num">Sale Price (AED)</th><th class="num">Stock</th><th>Status</th>' +
                '</tr></thead><tbody>' + rows +
                '<tr class="subtotal"><td>Subtotal &mdash; ' + esc(g.label) + '</td>' +
                '<td class="num">' + subtotal.toFixed(2) + '</td><td colspan="3"></td></tr>' +
                '</tbody></table>';
        }).join('');

        const html = '<html><head><title>Velvet Royals — Product Price List</title><style>' +
            'body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:28px;font-size:12px;}' +
            'h1{font-size:19px;margin:0 0 2px;}' +
            '.sub{color:#666;font-size:11px;margin-bottom:4px;}' +
            '.rule{border-top:2px solid #222;margin:12px 0 16px;}' +
            'h2{font-size:13px;margin:20px 0 6px;padding-bottom:3px;border-bottom:1px solid #bbb;}' +
            'h2 .cnt{font-weight:400;color:#777;font-size:11px;}' +
            'table{width:100%;border-collapse:collapse;margin-bottom:6px;}' +
            'th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#555;' +
            'border-bottom:1px solid #ddd;padding:5px 6px;}' +
            'td{padding:5px 6px;border-bottom:1px solid #f0f0f0;}' +
            '.num{text-align:right;}.muted{color:#777;}' +
            'tr.subtotal td{font-weight:bold;border-top:1px solid #bbb;border-bottom:none;background:#fafafa;}' +
            '.grand{margin-top:22px;border-top:2px solid #222;padding-top:10px;' +
            'display:flex;justify-content:space-between;font-size:14px;font-weight:bold;}' +
            '.note{margin-top:14px;color:#666;font-size:10.5px;line-height:1.5;}' +
            '@media print{body{margin:0 auto;} h2{page-break-after:avoid;} tr{page-break-inside:avoid;}}' +
            '</style></head><body>' +
            '<h1>Velvet Royals Flowershop</h1>' +
            '<div class="sub">Oud Metha St., Inside Supersaver Supermarket, Dubai &middot; +971 50 744 3100</div>' +
            '<div class="sub">Product Price List &mdash; ' + esc(today) + ' &middot; ' + count + ' items</div>' +
            '<div class="rule"></div>' + body +
            '<div class="grand"><span>Total value of listed items</span><span>AED ' + grand.toFixed(2) + '</span></div>' +
            '<div class="note">Prices shown are original list prices in AED, inclusive of 5% VAT. ' +
            'Where a sale price is shown, that is the current promotional price; the original price remains the declared value.</div>' +
            '</body></html>';

        const w = window.open('', '_blank');
        if (!w) { showToast('Allow pop-ups to print the price list', 'error'); return; }
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 400);
    };

    // Inventory overview. Reads the same live `flowers` data the product list
    // uses, so it always agrees with what's on screen and needs no refresh.
    const renderInventory = () => {
        const statsEl = document.getElementById('inventory-stats');
        if (!statsEl) return;
        const all = Object.values(flowers);

        const tracked   = all.filter(p => p.stockQty !== null && p.stockQty !== undefined);
        const soldOut   = all.filter(p => p.inStock === false);
        const hidden    = all.filter(p => p.hidden === true);
        const lowStock  = tracked.filter(p => p.stockQty > 0 && p.stockQty <= LOW_STOCK_THRESHOLD);
        const outTracked = tracked.filter(p => p.stockQty <= 0);
        const live      = all.filter(p => p.hidden !== true && p.inStock !== false);
        // Units on hand, and what they're worth at the price customers pay.
        const units     = tracked.reduce((n, p) => n + (Number(p.stockQty) || 0), 0);
        const payable   = (p) => (p.salePrice && p.salePrice > 0 && p.salePrice < p.price) ? p.salePrice : p.price;
        const stockValue = tracked.reduce((n, p) => n + (Number(p.stockQty) || 0) * (parseFloat(payable(p)) || 0), 0);

        const tile = (cls, value, label, sub) =>
            '<div class="stat-tile ' + cls + '">' +
                '<div class="stat-tile-value">' + value + '</div>' +
                '<div class="stat-tile-label">' + label + '</div>' +
                (sub ? '<div class="stat-tile-sub">' + sub + '</div>' : '') +
            '</div>';

        statsEl.innerHTML =
            tile('stat-today',   all.length,      'Total Products', live.length + ' live in store') +
            tile('stat-pending', units || '—',    'Units In Stock', tracked.length + ' of ' + all.length + ' counted') +
            tile('stat-reviews', lowStock.length, 'Low Stock',      'at or below ' + LOW_STOCK_THRESHOLD) +
            tile('stat-revenue', 'AED ' + stockValue.toFixed(2), 'Stock Value', 'counted items only');

        // Per-category counts
        const catEl = document.getElementById('inventory-by-category');
        if (catEl) {
            const counts = {};
            all.forEach(p => { const c = getCategory(p); counts[c] = (counts[c] || 0) + 1; });
            const rows = Object.keys(counts)
                .sort((a, b) => counts[b] - counts[a])
                .map(c =>
                    '<div class="inv-row">' +
                        '<span class="inv-row-label">' + esc(catLabels[c] || c) + '</span>' +
                        '<span class="inv-row-bar"><span style="width:' + Math.round((counts[c] / all.length) * 100) + '%"></span></span>' +
                        '<span class="inv-row-count">' + counts[c] + '</span>' +
                    '</div>').join('');
            catEl.innerHTML = rows || '<p class="inv-empty">No products yet.</p>';
        }

        // Things the shop should act on
        const attEl = document.getElementById('inventory-attention');
        if (attEl) {
            // Built most-urgent first, then deduped by product id: an item that
            // is both low on stock and hidden should be listed once, under the
            // reason that matters more.
            const seen = new Set();
            const items = []
                .concat(outTracked.map(p => ({ p, tag: 'OUT',    cls: 'stock-chip-out', note: '0 left' })))
                .concat(lowStock.map(p =>   ({ p, tag: 'LOW',    cls: 'stock-chip-low', note: p.stockQty + ' left' })))
                .concat(soldOut.filter(p => p.stockQty === null || p.stockQty === undefined)
                               .map(p => ({ p, tag: 'SOLD OUT', cls: 'stock-chip-out', note: 'marked sold out' })))
                .concat(hidden.map(p =>     ({ p, tag: 'HIDDEN', cls: 'stock-chip-hidden', note: 'not visible in store' })))
                .filter(i => {
                    const k = i.p.id || i.p.name;
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
            attEl.innerHTML = items.length
                ? items.slice(0, 25).map(i =>
                    '<div class="inv-row inv-row-item">' +
                        '<span class="inv-row-label">' + esc(i.p.name) + '</span>' +
                        '<span class="stock-chip ' + i.cls + '">' + i.note + '</span>' +
                    '</div>').join('')
                : '<p class="inv-empty">Everything looks good — nothing low or hidden.</p>';
        }
    };

    const displayFlowers = () => {
        renderInventory();
        const productsList = document.getElementById('products');
        if (!productsList) return;

        productsList.innerHTML = '';

        let flowersList = Object.values(flowers);
        if (currentProductFilter !== 'all') {
            flowersList = flowersList.filter(p => getCategory(p) === currentProductFilter);
        }
        const pq = currentProductSearch.toLowerCase().trim();
        if (pq) {
            flowersList = flowersList.filter(p =>
                (p.name        || '').toLowerCase().includes(pq) ||
                (p.description || '').toLowerCase().includes(pq) ||
                getCategory(p).toLowerCase().includes(pq)
            );
        }

        if (flowersList.length === 0) {
            const msg = pq
                ? `No products match "${currentProductSearch}".`
                : currentProductFilter === 'all'
                    ? 'No products yet. Add your first product above.'
                    : `No ${currentProductFilter}s yet. Add one using the form.`;
            productsList.innerHTML = `<li class="empty-state" style="padding: 30px; text-align: center;">${msg}</li>`;
        } else {
            flowersList.forEach(flower => {
                const cat        = getCategory(flower);
                const label      = catLabels[cat] || 'Flower';
                const b          = flower.badge || '';
                const soldOut    = flower.inStock === false;
                const isHidden   = flower.hidden === true;
                const badgeHtml  = b
                    ? `<span style="background:${badgeColors[b] || '#888'};color:#fff;font-size:0.65em;font-weight:800;padding:2px 8px;border-radius:10px;vertical-align:middle;margin-left:5px;letter-spacing:0.5px;">${badgeLabels[b] || b.toUpperCase()}</span>`
                    : '';
                const soldBadge  = soldOut
                    ? `<span style="background:#e74c3c;color:#fff;font-size:0.65em;font-weight:800;padding:2px 8px;border-radius:10px;vertical-align:middle;margin-left:5px;letter-spacing:0.5px;">SOLD OUT</span>`
                    : '';
                // Stock chip — only for products that opted into counting.
                const stockBadge = (() => {
                    const q = flower.stockQty;
                    if (q === null || q === undefined) return '';
                    if (q <= 0)  return `<span class="stock-chip stock-chip-out">0 left</span>`;
                    if (q <= LOW_STOCK_THRESHOLD) return `<span class="stock-chip stock-chip-low">${q} left · LOW</span>`;
                    return `<span class="stock-chip stock-chip-ok">${q} left</span>`;
                })();
                const hiddenBadge = isHidden
                    ? `<span style="background:#6b5240;color:#fff;font-size:0.65em;font-weight:800;padding:2px 8px;border-radius:10px;vertical-align:middle;margin-left:5px;letter-spacing:0.5px;">HIDDEN</span>`
                    : '';

                const thumbSrc = (flower.image && (flower.image.startsWith('http') || flower.image.startsWith('data:')))
                    ? flower.image
                    : 'https://storage.googleapis.com/flowershop-d26f4.firebasestorage.app/products/1.jpg';

                const wlCount = wishlistCounts[flower.id] || 0;
                const li = document.createElement('li');
                li.className = 'admin-product-item' + (soldOut ? ' admin-product-sold-out' : '') + (isHidden ? ' admin-product-hidden' : '');
                li.innerHTML = `
                    <div class="admin-product-row">
                        <div class="admin-product-thumb-link" title="View full image"
                             onclick="setAdminLightboxImage(this.dataset.src, this.dataset.name, this.dataset.file || getCurrentProductFileName(this.dataset.src));"
                             data-src="${esc(thumbSrc)}" data-name="${esc(flower.name)}" data-file="${esc(getCurrentProductFileName(thumbSrc))}">
                            <img class="admin-product-thumb" src="${esc(thumbSrc)}" alt="${esc(flower.name)}"
                                 onerror="this.src='https://storage.googleapis.com/flowershop-d26f4.firebasestorage.app/products/1.jpg'">
                        </div>
                        <div class="admin-product-info">
                            <span class="admin-product-name">${esc(flower.name)}</span>
                            <div class="admin-product-badges">
                                <span class="admin-cat-badge admin-cat-${esc(cat)}">${esc(label)}</span>
                                ${badgeHtml}${soldBadge}${hiddenBadge}${stockBadge}
                            </div>
                            ${flower.description ? `<span class="admin-product-desc">${esc(flower.description)}</span>` : ''}
                            ${(() => {
                                const price = parseFloat(flower.price);
                                const sale = parseFloat(flower.salePrice);
                                const onSale = !isNaN(sale) && sale > 0 && sale < price;
                                if (onSale) {
                                    const pct = Math.round((1 - sale / price) * 100);
                                    return `<span class="admin-product-price">
                                        <span class="admin-price-was">AED ${price.toFixed(2)}</span>
                                        <span class="admin-price-now">AED ${sale.toFixed(2)}</span>
                                        <span class="admin-price-off">-${pct}%</span>
                                    </span>`;
                                }
                                return `<span class="admin-product-price">AED ${price.toFixed(2)}</span>`;
                            })()}
                            ${(() => {
                                const stems = inferAllStemPrices(flower);
                                if (!stems.length) return '';
                                return `<div class="admin-stem-prices">${stems.map(s => `<span class="admin-stem-pill">${esc(s.label)} <strong>AED ${s.price}</strong>/stem</span>`).join('')}</div>`;
                            })()}
                        </div>
                        <div class="admin-product-right">
                            <div class="admin-wl-count" title="Wishlisted by ${wlCount} user${wlCount !== 1 ? 's' : ''}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="${wlCount > 0 ? '#e05c7a' : 'none'}" stroke="#e05c7a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                                <span>${wlCount}</span>
                            </div>
                            <div class="admin-product-actions">
                                <button data-id="${esc(flower.id)}" data-action="edit" class="admin-btn-edit">Edit</button>
                                <button data-id="${esc(flower.id)}" data-action="delete" class="admin-btn-delete">Del</button>
                            </div>
                        </div>
                    </div>
                `;
                li.querySelectorAll('button[data-action]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const id = btn.dataset.id;
                        if (btn.dataset.action === 'edit') crud.edit(id);
                        else crud.delete(id);
                    });
                });
                productsList.appendChild(li);
            });
        }

        const allList    = Object.values(flowers);
        const hasFlowers = allList.some(p => getCategory(p) === 'flower');
        const hasGifts   = allList.some(p => getCategory(p) === 'gift');
        const seedBtn    = document.getElementById('seed-btn');
        if (seedBtn) seedBtn.style.display = (!hasFlowers || !hasGifts) ? 'inline-block' : 'none';
    };

    const showToast = (message, type = 'success') => {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    const loadOrdersFromFirebase = () => {
        if (typeof ordersRef === 'undefined') return;

        ordersRef.on('value', snapshot => {
            allOrders = [];
            const toAutoConfirm = [];

            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const order = { key: child.key, ...child.val() };
                    allOrders.push(order);

                    if (order.paymentStatus === 'paid' && order.status === 'pending') {
                        toAutoConfirm.push(order.key);
                    }
                });
            }

            toAutoConfirm.forEach(key => {
                const order = allOrders.find(o => o.key === key);
                const history = [...(order.statusHistory || []), {
                    status: 'confirmed',
                    ts: new Date().toISOString(),
                    note: 'Auto-confirmed: Geidea payment received'
                }];
                ordersRef.child(key).update({
                    status: 'confirmed',
                    updatedAt: new Date().toISOString(),
                    statusHistory: history
                }).then(() => {
                    _syncOrderTracking(key, 'confirmed');
                    showToast('Order auto-confirmed — payment received ✓');
                }).catch(err => console.error('Auto-confirm error:', err));
            });

            allOrders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            _alertOnNewOrders();
            updateFilterCounts();
            displayOrders(getFilteredOrders());
            updateOrdersBadge(allOrders);
            updateDashboardStats();
            renderCalendar();
        });
    };

    // ── New-order alerting ──
    // Compares order keys between snapshots; anything unseen after the first
    // load gets a toast + chime so the admin notices even in another tab.
    let _knownOrderKeys = null;

    const _alertOnNewOrders = () => {
        const keys = new Set(allOrders.map(o => o.key));
        if (_knownOrderKeys !== null) {
            const fresh = allOrders.filter(o => !_knownOrderKeys.has(o.key));
            if (fresh.length > 0) {
                const first = fresh[0];
                const who = (first.customer && first.customer.name) ? first.customer.name : 'Customer';
                showToast('New order from ' + who + ' — AED ' + parseFloat(first.total || 0).toFixed(2) +
                    (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' more)' : ''));
                _playOrderChime();
            }
        }
        _knownOrderKeys = keys;
    };

    const _playOrderChime = () => {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
            const note = (freq, t0, dur) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.type = 'sine';
                o.frequency.value = freq;
                g.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
                g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + t0 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur);
                o.connect(g);
                g.connect(ctx.destination);
                o.start(ctx.currentTime + t0);
                o.stop(ctx.currentTime + t0 + dur + 0.05);
            };
            note(880, 0, 0.18);
            note(1174.66, 0.16, 0.24);
            setTimeout(() => ctx.close().catch(() => {}), 1200);
        } catch (e) { /* audio blocked until first interaction — fine */ }
    };

    const getFilteredOrders = () => {
        if (currentFilter === 'history') return allOrders.filter(o => isHistorical(o));
        const recent = allOrders.filter(o => !isHistorical(o));
        if (currentFilter === 'all')       return recent;
        if (currentFilter === 'completed') return recent.filter(o => o.status === 'delivered' || o.status === 'completed');
        if (currentFilter === 'pending')   return recent.filter(o => o.status !== 'delivered' && o.status !== 'completed');
        return recent.filter(o => o.status === currentFilter);
    };

    const filterOrders = (filter) => {
        currentFilter = filter;
        document.querySelectorAll('.orders-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        displayOrders(getFilteredOrders());
    };

    const updateFilterCounts = () => {
        const recent    = allOrders.filter(o => !isHistorical(o));
        const historical = allOrders.filter(o => isHistorical(o));
        const el = id => document.getElementById(id);
        if (el('filter-count-all'))       el('filter-count-all').textContent       = recent.length;
        if (el('filter-count-pending'))   el('filter-count-pending').textContent   = recent.filter(o => o.status !== 'delivered' && o.status !== 'completed').length;
        if (el('filter-count-completed')) el('filter-count-completed').textContent = recent.filter(o => o.status === 'delivered' || o.status === 'completed').length;
        if (el('filter-count-history'))   el('filter-count-history').textContent   = historical.length;
    };

    const searchAdminOrders = (query) => {
        currentOrderSearch = query;
        displayOrders(getFilteredOrders());
    };

    const _applyOrderSearch = (orders) => {
        const oq = currentOrderSearch.toLowerCase().trim();
        if (!oq) return orders;
        return orders.filter(o => {
            const c = o.customer || {};
            return (o.key             || '').toLowerCase().includes(oq) ||
                (c.name               || '').toLowerCase().includes(oq) ||
                (c.email              || '').toLowerCase().includes(oq) ||
                (c.phone              || '').toLowerCase().includes(oq) ||
                (o.status             || '').toLowerCase().includes(oq);
        });
    };

    const displayOrders = (orders) => {
        const container = document.getElementById('orders-list');
        if (!container) return;

        const oq = currentOrderSearch.toLowerCase().trim();
        orders = _applyOrderSearch(orders);

        if (orders.length === 0) {
            const msg = oq
                ? `No orders match "${currentOrderSearch}".`
                : currentFilter === 'history'
                    ? 'No historical orders yet. Orders older than 30 days will appear here.'
                    : 'No orders yet. Orders will appear here in real time.';
            container.innerHTML = '<div class="empty-state">' + msg + '</div>';
            return;
        }

        const STATUS_STEPS = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];
        const STATUS_LABELS = {
            pending:          'Pending',
            confirmed:        'Confirmed',
            preparing:        'Preparing',
            out_for_delivery: 'Out for Delivery',
            delivered:        'Delivered',
            completed:        'Delivered'
        };
        const STATUS_COLORS = {
            pending:          'badge-pending',
            confirmed:        'badge-confirmed',
            preparing:        'badge-preparing',
            out_for_delivery: 'badge-out-delivery',
            delivered:        'badge-delivered',
            completed:        'badge-delivered'
        };

        container.innerHTML = '';
        orders.forEach(order => {
            const rawStatus = order.status || 'pending';
            const status    = rawStatus === 'completed' ? 'delivered' : rawStatus;
            const customer  = order.customer || {};
            const fulfillment = order.fulfillment || {};
            const date      = new Date(order.timestamp);
            const dateStr   = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            // 24-hour clock throughout — the UAE convention, and it matches the
        // delivery slots shown at checkout.
        const timeStr   = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
            const currentIdx= STATUS_STEPS.indexOf(status);

            const itemsHtml = (order.items || []).map(item => {
                let tag = '<span class="order-item-tag">' + esc(item.name) + ' ×' + parseInt(item.quantity || 1, 10);
                if (item.isCustom && item.customDetails) {
                    const d = item.customDetails;
                    tag += ' <span class="order-custom-chips">'
                        + '<span class="order-custom-chip-sm">' + esc(d.arrangement) + '</span>'
                        + '<span class="order-custom-chip-sm">' + esc(d.flower) + '</span>'
                        + (d.gift ? '<span class="order-custom-chip-sm">' + esc(d.gift) + '</span>' : '')
                        + '</span>';
                }
                tag += '</span>';
                return tag;
            }).join('');

            const payMethod = order.paymentMethod || '';
            const payLabel  = payLabels[payMethod] || esc(payMethod);
            const payHtml   = payLabel ? '<span class="order-pay-badge">' + payLabel + '</span>' : '';
            const isPaid    = order.paymentStatus === 'paid';
            // Surface a failed online payment attempt so the admin knows the
            // customer tried but the card didn't go through (vs. simply not
            // having paid yet). Reads the webhook's lastPaymentAttempt record.
            const lastAttempt = order.lastPaymentAttempt || null;
            const failedAttempt = !isPaid && lastAttempt &&
                /fail/i.test(String(lastAttempt.status || '') + ' ' + String(lastAttempt.detailedStatus || ''));
            let payStatusClass, payStatusText;
            if (isPaid) {
                payStatusClass = 'pay-status-paid'; payStatusText = '✓ Payment Received';
            } else if (failedAttempt) {
                payStatusClass = 'pay-status-failed'; payStatusText = '⚠ Payment Failed — awaiting payment';
            } else {
                payStatusClass = 'pay-status-pending'; payStatusText = '⏳ Awaiting Payment';
            }
            const payStatusHtml = '<span class="order-payment-status-badge ' + payStatusClass + '">'
                + payStatusText + '</span>';

            // Set by createGeideaSession when the order total didn't match the
            // live prices, so online payment was skipped. Check before sending
            // a payment link.
            const pc = order.priceCheck;
            const priceWarnHtml = (pc && pc.ok === false)
                ? '<span class="order-payment-status-badge pay-status-failed" title="' + esc((pc.problems || []).join('; ')) + '">'
                    + '⚠ Price check failed — order says AED ' + parseFloat(pc.charged || 0).toFixed(2)
                    + ', prices add up to AED ' + parseFloat(pc.expected || 0).toFixed(2) + '</span>'
                : '';

            // Channel the sale came through, for orders keyed in by hand.
            const sourceHtml = order.source && SOURCE_LABELS[order.source]
                ? '<span class="order-source-badge order-source-' + esc(order.source) + '">'
                    + esc(SOURCE_LABELS[order.source]) + '</span>'
                : '';

            // Sales agent who referred this order, if any.
            const agentHtml = order.agentCode
                ? '<span class="order-agent-badge" title="Referred by a sales agent">'
                    + esc(order.agentName || order.agentCode) + ' · ' + esc(order.agentCode) + '</span>'
                : '';

            const addrParts = [fulfillment.area, fulfillment.address].filter(Boolean).map(esc);
            const deliveryHtml = (fulfillment.date || addrParts.length)
                ? '<div class="order-delivery-row">'
                    + '<span class="order-delivery-label">' + (fulfillment.type === 'pickup' ? 'Pickup' : 'Delivery') + ':</span>'
                    + (addrParts.length ? ' <strong>' + addrParts.join(', ') + '</strong>' : '')
                    + (fulfillment.date ? ' · ' + esc(fulfillment.date) : '')
                    + (fulfillment.timeSlot ? ' · ' + esc(fulfillment.timeSlot) : '')
                    + '</div>'
                : '';

            const discountHtml = order.coupon
                ? '<span class="order-discount-badge">Code: ' + esc(order.coupon) + '</span>'
                : '';

            // Which courier fulfills this order — set by the admin, not the customer.
            const currentCourier = order.deliveryCompany || '';
            const courierOptions = ['<option value="">— Not assigned —</option>']
                .concat(Object.entries(deliveryCompanyLabels).map(([val, label]) =>
                    '<option value="' + val + '"' + (val === currentCourier ? ' selected' : '') + '>' + esc(label) + '</option>'));
            const courierHtml = '<div class="order-courier-row">' +
                '<span class="order-courier-label">Delivery Company</span>' +
                '<select class="order-courier-select" onchange="crud.setDeliveryCompany(\'' + order.key + '\', this.value)">' +
                    courierOptions.join('') +
                '</select>' +
            '</div>';

            const miniStepper = STATUS_STEPS.map((s, i) => {
                const cls = i < currentIdx ? 'mini-done' : (i === currentIdx ? 'mini-active' : 'mini-future');
                return '<div class="mini-step ' + cls + '" title="' + STATUS_LABELS[s] + '"></div>'
                     + (i < STATUS_STEPS.length - 1 ? '<div class="mini-line ' + (i < currentIdx ? 'mini-line-done' : '') + '"></div>' : '');
            }).join('');

            const nextIdx   = currentIdx + 1;
            const nextStatus= STATUS_STEPS[nextIdx];
            const advanceBtn= nextStatus
                ? '<button class="admin-status-btn btn-advance" onclick="crud.advanceOrder(\'' + order.key + '\',\'' + nextStatus + '\')">'
                    + 'Mark as <strong>' + STATUS_LABELS[nextStatus] + '</strong>'
                  + '</button>'
                : '<span class="order-delivered-tag">✓ Delivered</span>';

            const forceBtn  = status !== 'delivered'
                ? '<button class="admin-status-btn btn-force-complete" onclick="crud.forceComplete(\'' + order.key + '\')" title="Force mark as Delivered">Force Complete</button>'
                : '';

            // WhatsApp needs full international format with no leading 0 —
            // "050 744 3100" must become "971507443100" or wa.me rejects it.
            let rawPhone = (customer.phone || '').replace(/\D/g, '');
            if (rawPhone.startsWith('00'))     rawPhone = rawPhone.slice(2);
            if (rawPhone.startsWith('0'))      rawPhone = '971' + rawPhone.slice(1);
            else if (rawPhone.length === 9)    rawPhone = '971' + rawPhone;
            const waItems  = (order.items || []).map(i => '• ' + (i.name || '') + ' ×' + (i.quantity || 1)).join('\n');
            const waDelivery = fulfillment.type === 'pickup' ? 'In-Store Pickup' : 'Delivery';
            const waMsg = encodeURIComponent(
                'Hi ' + (customer.name || 'Customer') + '! 🌸\n\n' +
                'Thank you for your order with *Velvet Royals Flowershop*.\n\n' +
                '🧾 *Order ID:* ' + order.key + '\n' +
                '🛍️ *Items:*\n' + waItems + '\n' +
                '💰 *Total:* AED ' + parseFloat(order.total || 0).toFixed(2) + '\n' +
                '📅 *' + waDelivery + ':* ' + (fulfillment.date || '') + (fulfillment.timeSlot ? ' · ' + fulfillment.timeSlot : '') + '\n\n' +
                'To complete your order, please pay using the link below:\n' +
                '👉 [Paste payment link here]\n\n' +
                'Thank you! We look forward to delivering your flowers. 🌹\n' +
                '— Velvet Royals Flowershop\n' +
                '📞 +971 50 744 3100'
            );
            const waBtn = !isPaid && rawPhone
                ? '<a class="admin-status-btn btn-whatsapp-pay" href="https://api.whatsapp.com/send?phone=' + rawPhone + '&text=' + waMsg + '" target="_blank" rel="noopener">💬 Send Payment Link</a>'
                : '';

            const markPaidBtn = !isPaid
                ? '<button class="admin-status-btn btn-mark-paid" onclick="crud.markPaid(\'' + order.key + '\')">✓ Mark as Paid</button>'
                : '';

            const printBtn = '<button class="admin-status-btn btn-print-order" onclick="crud.printOrder(\'' + order.key + '\')" title="Generate and print invoice">Print Invoice</button>';

            const archived = isHistorical(order);
            const card = document.createElement('div');
            card.className = 'order-card order-status-' + status + (archived ? ' order-history-card' : '');
            card.innerHTML =
                '<div class="order-card-header">' +
                    '<div class="order-meta">' +
                        (archived ? '<span class="history-archived-tag">Archived</span>' : '') +
                        '<span class="order-status-badge ' + (STATUS_COLORS[status] || 'badge-pending') + '">' +
                            (STATUS_LABELS[status] || status) +
                        '</span>' +
                        '<span class="order-time">' + dateStr + ' at ' + timeStr + '</span>' +
                        sourceHtml + agentHtml + payHtml + payStatusHtml + priceWarnHtml + discountHtml +
                    '</div>' +
                    '<div class="order-total">AED ' + parseFloat(order.total || 0).toFixed(2) + '</div>' +
                '</div>' +
                '<div class="order-tracking-row">' +
                    '<span class="order-tracking-label">Tracking ID</span>' +
                    '<span class="order-tracking-short">#' + rvTrackingId(order.key) + '</span>' +
                    '<code class="order-tracking-id">' + order.key + '</code>' +
                    '<button type="button" class="order-copy-btn" onclick="crud.copyTrackingId(\'' + order.key + '\', this)">Copy</button>' +
                '</div>' +
                '<div class="admin-order-stepper">' + miniStepper + '</div>' +
                '<div class="order-card-body">' +
                    '<div class="order-customer">' +
                        '<strong>' + esc(customer.name || 'Unknown') + '</strong>' +
                        '<span>' + esc(customer.email || '') + '</span>' +
                        '<span>' + esc(customer.phone || '') + '</span>' +
                        (customer.notes ? '<em class="order-notes">"' + esc(customer.notes) + '"</em>' : '') +
                    '</div>' +
                    '<div class="order-items">' + itemsHtml + '</div>' +
                '</div>' +
                deliveryHtml +
                courierHtml +
                '<div class="order-card-footer admin-status-footer">' +
                    advanceBtn + markPaidBtn + printBtn + forceBtn + waBtn +
                '</div>';
            container.appendChild(card);
        });
    };

    const updateOrdersBadge = (orders) => {
        const pendingCount = orders.filter(o => o.status !== 'delivered' && o.status !== 'completed').length;
        // Pending count in the tab title so it's visible from other tabs.
        document.title = (pendingCount > 0 ? '(' + pendingCount + ') ' : '') + 'Admin Panel | Velvet Royals Flowershop';
        const badge = document.getElementById('orders-badge');
        const label = document.getElementById('orders-count-label');

        if (badge) {
            badge.textContent = pendingCount;
            badge.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
            if (pendingCount > 0) {
                badge.classList.add('pulse');
                setTimeout(() => badge.classList.remove('pulse'), 2000);
            }
        }
        if (label) {
            label.textContent = pendingCount > 0 ? '(' + pendingCount + ' pending)' : '';
            label.style.display = pendingCount > 0 ? 'inline' : 'none';
        }
    };

    // Export the currently visible orders (filter + search applied) as an
    // Excel sheet for accounting / bank records.
    const exportOrdersXlsx = () => {
        const orders = _applyOrderSearch(getFilteredOrders());
        if (orders.length === 0) { showToast('No orders to export', 'error'); return; }

        const num = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);
        const rows = orders.map(o => {
            const c = o.customer || {};
            const f = o.fulfillment || {};
            const items = (o.items || []).map(i => (i.name || '') + ' x' + (i.quantity || 1)).join('; ');
            return [
                o.timestamp || null,
                SOURCE_LABELS[o.source] || 'Website',
                rvTrackingId(o.key), o.key, c.name || '', c.phone || '', c.email || '', items,
                num(o.subtotal), num(o.deliveryFee), num(o.slotSurcharge), num(o.discount) || 0,
                o.coupon || '', num(o.total),
                payLabels[o.paymentMethod] || o.paymentMethod || '', o.paymentStatus || '',
                o.status || '', o.agentCode || '', o.agentName || '',
                deliveryCompanyLabels[o.deliveryCompany] || o.deliveryCompany || '',
                f.type || '', f.date || null, f.timeSlot || '', f.area || '', f.address || '',
                c.notes || ''
            ];
        });

        xlsxExport.download('velvet-royals-orders-' + new Date().toISOString().slice(0, 10) + '.xlsx', [{
            name: 'Orders',
            columns: [
                { header: 'Date', type: 'datetime', width: 17 },
                { header: 'Source', width: 11 },
                { header: 'Invoice #', width: 11 },
                { header: 'Tracking ID', width: 23 },
                { header: 'Customer', width: 22 },
                { header: 'Phone', width: 16 },
                { header: 'Email', width: 26 },
                { header: 'Items', width: 40 },
                { header: 'Subtotal (AED)', type: 'money', width: 15 },
                { header: 'Delivery Fee (AED)', type: 'money', width: 17 },
                { header: 'Slot Surcharge (AED)', type: 'money', width: 19 },
                { header: 'Discount (AED)', type: 'money', width: 15 },
                { header: 'Coupon', width: 11 },
                { header: 'Total (AED)', type: 'money', width: 13 },
                { header: 'Payment Method', width: 18 },
                { header: 'Payment Status', width: 16 },
                { header: 'Order Status', width: 15 },
                { header: 'Referral Code', width: 13 },
                { header: 'Agent', width: 18 },
                { header: 'Delivery Company', width: 20 },
                { header: 'Fulfillment', width: 11 },
                { header: 'Date Requested', type: 'date', width: 15 },
                { header: 'Time Slot', width: 22 },
                { header: 'Area', width: 15 },
                { header: 'Address', width: 32 },
                { header: 'Notes', width: 40 }
            ],
            rows
        }]);
        showToast('Exported ' + orders.length + ' order' + (orders.length !== 1 ? 's' : '') + ' to Excel');
    };

    // ── Printed tax invoices ─────────────────────────────────────────────
    // One layout for both the order invoice and the manual invoice.
    // `meta` is a list of [label, value, valueClass?] with values already
    // escaped; `rows` is the escaped <tr> markup for the items table.
    const INVOICE_TRN = '10417534900033';

    const _invoiceHtml = ({ title, topLeft, topRight, meta, rows, total, notes }) =>
            '<!DOCTYPE html><html><head><title>' + title + '</title>' +
            '<style>' +
            // Zero page margin stops the browser printing its own header/footer
            // strip (the "about:blank" URL, date and page count). The sheet's
            // padding supplies the margins instead.
            '@page{margin:0;}' +
            'html,body{margin:0;padding:0;}' +
            'body{font-family:Georgia,serif;color:#2c1a05;}' +
            '.sheet{max-width:760px;min-height:calc(100vh - 2px);margin:0 auto;padding:18px 26px 16px;box-sizing:border-box;display:flex;flex-direction:column;}' +
            '.topline{display:flex;justify-content:space-between;font-size:0.76em;color:#5a4638;line-height:1.5;margin-bottom:22px;}' +
            '.brand{text-align:center;}' +
            'h1{font-size:1.3em;text-align:center;margin:0;font-weight:700;letter-spacing:0.02em;line-height:1.25;}' +
            '.rule{border-top:1.5px solid #c8a43a;margin:14px 0 14px;}' +
            '.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:0.82em;line-height:1.5;margin:4px 0 12px;}' +
            '.meta-row{display:grid;grid-template-columns:86px 1fr;column-gap:8px;align-items:baseline;}' +
            '.meta-row strong{line-height:1.2;}' +
            '.meta-row .track{font-family:Consolas,monospace;font-size:0.78em;word-break:break-all;}' +
            'table{width:100%;border-collapse:collapse;font-size:0.84em;margin:10px 0 0;}' +
            'th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #eee2c8;vertical-align:top;}' +
            'th{font-weight:700;color:#2f1d0c;}' +
            '.qty{text-align:center;width:40px;}.amt{text-align:right;white-space:nowrap;}' +
            '.total td{font-weight:bold;border-top:2px solid #c8a43a;border-bottom:none;font-size:1.02em;padding-top:8px;}' +
            '.vat td{font-size:0.8em;color:#777;border-bottom:none;padding-top:2px;}' +
            '.notes{font-size:0.8em;font-style:italic;background:#faf7f0;padding:10px 12px;border-radius:6px;margin-top:14px;}' +
            '.footer{margin-top:auto;padding-top:24px;text-align:center;}' +
            '.closing{font-size:0.8em;font-style:italic;margin:0;}' +
            '.closing + .closing{margin-top:10px;}' +
            '.company{margin-top:22px;}' +
            '.company-name{font-weight:700;font-size:0.85em;letter-spacing:0.04em;padding-bottom:3px;}' +
            '.company-details{border-top:1px solid #d8caa9;padding-top:3px;font-size:0.8em;line-height:1.5;color:#5a4638;}' +
            '@media (max-width: 560px){.meta-grid{grid-template-columns:1fr;}}' +
            '</style></head><body><div class="sheet">' +
            '<div class="topline"><span>' + topLeft + '</span><span>' + topRight + '</span></div>' +
            '<div class="brand"><h1>Tax Invoice</h1><h1>Velvet Royals Flowershop</h1></div>' +
            '<div class="rule"></div>' +
            '<div class="meta-grid">' +
            meta.map(([label, value, cls]) =>
                '<div class="meta-row"><strong>' + label + '</strong><span' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</span></div>'
            ).join('') +
            '</div>' +
            '<table><tr><th>Item</th><th class="qty">Qty</th><th class="amt">Amount</th></tr>' + rows +
            '<tr class="total"><td colspan="2">Total (incl. VAT)</td><td class="amt">AED ' + total.toFixed(2) + '</td></tr>' +
            '<tr class="vat"><td colspan="2">VAT (5%) included</td><td class="amt">AED ' + (total * 5 / 105).toFixed(2) + '</td></tr></table>' +
            (notes ? '<div class="notes">Note: ' + esc(notes) + '</div>' : '') +
            '<div class="footer">' +
                '<p class="closing">Thank you for choosing Velvet Royals Flowershop. We look forward to serving you again.</p>' +
                '<p class="closing">This is a system generated invoice, no signature required</p>' +
                '<div class="company">' +
                    '<div class="company-name">VELVET ROYALS TRADING LLC</div>' +
                    '<div class="company-details">Oud Metha St., Inside Supersaver Supermarket, Dubai · +971 50 744 3100<br>TRN ' + INVOICE_TRN + '</div>' +
                '</div>' +
            '</div>' +
            '</div></body></html>';

    const _printHtml = (html, features) => {
        const w = window.open('', '_blank', features);
        if (!w) { showToast('Pop-up blocked — allow pop-ups to print', 'error'); return false; }
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
        return true;
    };

    const _invoiceRow = (name, qty, amount) =>
        '<tr><td>' + esc(name) + '</td><td class="qty">' + esc(qty) + '</td>' +
        '<td class="amt">AED ' + parseFloat(amount || 0).toFixed(2) + '</td></tr>';

    // Printable tax invoice for an order.
    const printOrder = (orderId) => {
        const o = allOrders.find(x => x.key === orderId);
        if (!o) { showToast('Order not found', 'error'); return; }
        const c = o.customer || {};
        const f = o.fulfillment || {};
        const rows = (o.items || []).map(i =>
            _invoiceRow(i.name || '', i.quantity || 1, i.subtotal != null ? i.subtotal : (i.price || 0) * (i.quantity || 1))
        ).join('') +
            (f.type !== 'pickup'
                ? '<tr><td colspan="2">Delivery fee</td><td class="amt">AED ' + parseFloat(o.deliveryFee || 0).toFixed(2) + '</td></tr>'
                : '') +
            (o.slotSurcharge
                ? '<tr><td colspan="2">Express/Midnight surcharge</td><td class="amt">AED ' + parseFloat(o.slotSurcharge).toFixed(2) + '</td></tr>'
                : '') +
            (o.discount
                ? '<tr><td colspan="2">Discount' + (o.coupon ? ' (' + esc(o.coupon) + ')' : '') + '</td><td class="amt">− AED ' + parseFloat(o.discount).toFixed(2) + '</td></tr>'
                : '');
        const invoiceNo = esc(rvTrackingId(o.key));
        const placed = o.timestamp ? new Date(o.timestamp).toLocaleString('en-GB') : '—';
        _printHtml(_invoiceHtml({
            title: 'Order ' + invoiceNo + ' — Velvet Royals',
            topLeft: placed,
            topRight: 'Order ' + invoiceNo + ' · Velvet Royals',
            meta: [
                ['Invoice Number', invoiceNo],
                ['Tracking ID', esc(o.key), 'track'],
                ['TRN', INVOICE_TRN],
                ['Placed', placed],
                ['Customer', esc(c.name || '—')],
                ['Phone', esc(c.phone || '—')],
                [f.type === 'pickup' ? 'Pickup' : 'Delivery',
                    esc([f.area, f.address].filter(Boolean).join(', ') || (f.type === 'pickup' ? 'In-store pickup' : '—')) +
                    (f.date ? ' · ' + esc(f.date) : '') + (f.timeSlot ? ' · ' + esc(f.timeSlot) : '')],
                ['Payment', (o.paymentStatus === 'paid' ? 'PAID' : 'AWAITING PAYMENT') +
                    ' (' + esc(payLabels[o.paymentMethod] || o.paymentMethod || '—') + ')']
            ],
            rows,
            total: parseFloat(o.total || 0),
            notes: c.notes
        }), 'width=460,height=640');
    };

    // Quick-discount chips on the product form: compute the sale price
    // from the original price (e.g. 360 with −20% → 288).
    const applyQuickDiscount = (pct, btn) => {
        const priceEl = document.getElementById('product-price');
        const saleEl  = document.getElementById('product-sale-price');
        if (!priceEl || !saleEl) return;
        const price = parseFloat(priceEl.value);
        if (isNaN(price) || price <= 0) {
            showToast('Enter the original price first', 'error');
            return;
        }
        const sale = Math.round(price * (1 - pct / 100) * 100) / 100;
        saleEl.value = sale;
        document.querySelectorAll('.discount-chip').forEach(b => b.classList.toggle('active', b === btn));
        // Editing an existing product: save straight to the store so the
        // admin form and the live site can never show different prices.
        const editingId = (document.getElementById('product-id') || {}).value;
        if (editingId && typeof flowersRef !== 'undefined') {
            flowersRef.child(editingId).update({ salePrice: sale })
                .then(() => showToast(pct + '% off saved — store price is now AED ' + sale.toFixed(2)))
                .catch(err => showToast('Error saving discount: ' + err.message, 'error'));
        } else {
            showToast(pct + '% off — sale price AED ' + sale.toFixed(2));
        }
    };

    const clearQuickDiscount = () => {
        const saleEl = document.getElementById('product-sale-price');
        if (saleEl) saleEl.value = '';
        document.querySelectorAll('.discount-chip').forEach(b => b.classList.remove('active'));
        // Mirror the instant-save behaviour when editing an existing product.
        const editingId = (document.getElementById('product-id') || {}).value;
        if (editingId && typeof flowersRef !== 'undefined') {
            flowersRef.child(editingId).update({ salePrice: null })
                .then(() => showToast('Sale removed — store shows the original price again'))
                .catch(err => showToast('Error removing sale: ' + err.message, 'error'));
        }
    };

    // Copy a customer's tracking ID (the order key they use on the Track
    // Order page) so it can be matched against customer inquiries.
    const copyTrackingId = (id, btn) => {
        const done = () => {
            if (btn) {
                btn.textContent = 'Copied ✓';
                setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
            }
            showToast('Tracking ID copied');
        };
        const fallback = () => {
            const ta = document.createElement('textarea');
            ta.value = id;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { showToast('Could not copy', 'error'); }
            ta.remove();
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(id).then(done).catch(fallback);
        } else {
            fallback();
        }
    };

    // Record payment received. The orders listener sees paymentStatus 'paid'
    // and auto-advances pending orders to Confirmed, so the progress bar
    // moves on its own from here.
    // ── Offline orders (Deliveroo, walk-in, WhatsApp…) ───────────────────
    // Deliveroo will not hand its orders to us — its Order API is granted
    // through a Deliveroo account manager, not self-serve. Until that exists,
    // keying a sale in here is what keeps stock counts and revenue honest
    // across every channel instead of only the website's share.
    let offlineItems = [];

    const openOfflineOrder = () => {
        offlineItems = [];
        const modal = document.getElementById('offline-order-modal');
        if (!modal) return;

        const sel = document.getElementById('offline-item-select');
        if (sel) {
            const opts = Object.values(flowers)
                .map(p => ({ id: p.id, name: _cleanName(p), price: _payablePrice(p) }))
                .filter(p => p.id && p.name)
                .sort((a, b) => a.name.localeCompare(b.name));
            sel.innerHTML = '<option value="">-- choose an item --</option>' +
                opts.map(o => '<option value="' + esc(o.id) + '" data-price="' + o.price +
                    '" data-name="' + esc(o.name) + '">' + esc(o.name) +
                    ' — AED ' + o.price.toFixed(2) + '</option>').join('');
        }
        const d = document.getElementById('offline-date');
        if (d) d.value = new Date().toISOString().slice(0, 10);
        ['offline-name', 'offline-notes', 'offline-total'].forEach(id => {
            const e = document.getElementById(id); if (e) e.value = '';
        });
        // Clear the manual-override flag too, or a total typed on a previous
        // order would stop every later one from auto-filling.
        const totalEl = document.getElementById('offline-total');
        if (totalEl) delete totalEl.dataset.touched;
        const src = document.getElementById('offline-source'); if (src) src.value = 'deliveroo';
        const st  = document.getElementById('offline-status'); if (st) st.value = 'delivered';
        _renderOfflineItems();
        modal.classList.add('active');
    };

    const closeOfflineOrder = () => {
        const modal = document.getElementById('offline-order-modal');
        if (modal) modal.classList.remove('active');
    };

    const _payablePrice = (p) => {
        const price = parseFloat(p.price) || 0;
        const sale  = parseFloat(p.salePrice);
        return (!isNaN(sale) && sale > 0 && sale < price) ? sale : price;
    };

    const _offlineComputedTotal = () => offlineItems.reduce((n, i) => n + i.price * i.quantity, 0);

    const _renderOfflineItems = () => {
        const list = document.getElementById('offline-items-list');
        if (!list) return;
        list.innerHTML = offlineItems.length
            ? offlineItems.map((i, idx) =>
                '<div class="offline-item-row">' +
                    '<span class="offline-item-name">' + esc(i.name) + '</span>' +
                    '<span class="offline-item-qty">x' + i.quantity + '</span>' +
                    '<span class="offline-item-sub">AED ' + (i.price * i.quantity).toFixed(2) + '</span>' +
                    '<button type="button" class="offline-item-remove" onclick="crud.removeOfflineItem(' + idx + ')" aria-label="Remove">&times;</button>' +
                '</div>').join('')
            : '<p class="offline-items-empty">No items added yet.</p>';

        const computed = _offlineComputedTotal();
        const hint = document.getElementById('offline-total-hint');
        if (hint) hint.textContent = offlineItems.length
            ? 'Your shop price for these items is AED ' + computed.toFixed(2) + '.'
            : 'Add items and this fills in automatically.';
        // Keep the total in step with the items until the admin overrides it.
        const totalEl = document.getElementById('offline-total');
        if (totalEl && !totalEl.dataset.touched) {
            totalEl.value = computed > 0 ? computed.toFixed(2) : '';
        }
    };

    const addOfflineItem = () => {
        const sel = document.getElementById('offline-item-select');
        const qtyEl = document.getElementById('offline-item-qty');
        if (!sel || !sel.value) { showToast('Choose an item first', 'error'); return; }
        const qty = Math.max(1, parseInt(qtyEl && qtyEl.value, 10) || 1);
        const opt = sel.options[sel.selectedIndex];
        const id = sel.value;
        const existing = offlineItems.find(i => i.id === id);
        if (existing) {
            existing.quantity += qty;
        } else {
            offlineItems.push({
                id,
                name: opt.dataset.name || opt.textContent,
                price: parseFloat(opt.dataset.price) || 0,
                quantity: qty
            });
        }
        sel.value = '';
        if (qtyEl) qtyEl.value = '1';
        _renderOfflineItems();
    };

    const removeOfflineItem = (idx) => {
        offlineItems.splice(idx, 1);
        _renderOfflineItems();
    };

    const onOfflineTotalEdited = (el) => { el.dataset.touched = '1'; };

    const _manualInvoiceRowMarkup = (index, item = {}) => {
        const name = item.name || '';
        const qty = item.quantity || 1;
        const price = item.price || 0;
        return '<div class="manual-invoice-row" data-index="' + index + '">' +
            '<input type="text" class="manual-invoice-name" placeholder="Item name" value="' + esc(name) + '" oninput="crud.refreshManualInvoiceTotal()">' +
            '<input type="number" class="manual-invoice-qty" min="1" step="1" value="' + qty + '" oninput="crud.refreshManualInvoiceTotal()">' +
            '<input type="number" class="manual-invoice-price" min="0" step="0.01" value="' + parseFloat(price).toFixed(2) + '" oninput="crud.refreshManualInvoiceTotal()">' +
            '<button type="button" class="offline-item-remove" onclick="crud.removeManualInvoiceRow(' + index + ')" aria-label="Remove item">&times;</button>' +
        '</div>';
    };

    const renderManualInvoiceRows = () => {
        const list = document.getElementById('manual-invoice-items');
        if (!list) return;
        const items = Array.from(list.querySelectorAll('.manual-invoice-row')).map((row, idx) => ({
            name: row.querySelector('.manual-invoice-name')?.value || '',
            quantity: Math.max(1, parseInt(row.querySelector('.manual-invoice-qty')?.value || '1', 10) || 1),
            price: parseFloat(row.querySelector('.manual-invoice-price')?.value || '0') || 0
        }));

        if (!items.length) {
            list.innerHTML = _manualInvoiceRowMarkup(0);
            return;
        }

        list.innerHTML = items.map((item, idx) => _manualInvoiceRowMarkup(idx, item)).join('');
    };

    const addManualInvoiceRow = () => {
        const list = document.getElementById('manual-invoice-items');
        if (!list) return;
        const curr = Array.from(list.querySelectorAll('.manual-invoice-row')).map((row) => ({
            name: row.querySelector('.manual-invoice-name')?.value || '',
            quantity: Math.max(1, parseInt(row.querySelector('.manual-invoice-qty')?.value || '1', 10) || 1),
            price: parseFloat(row.querySelector('.manual-invoice-price')?.value || '0') || 0
        }));
        curr.push({ name: '', quantity: 1, price: 0 });
        list.innerHTML = curr.map((item, idx) => _manualInvoiceRowMarkup(idx, item)).join('');
        refreshManualInvoiceTotal();
    };

    const removeManualInvoiceRow = (idx) => {
        const list = document.getElementById('manual-invoice-items');
        if (!list) return;
        const rows = Array.from(list.querySelectorAll('.manual-invoice-row'));
        if (rows.length <= 1) {
            rows[0] && rows[0].remove();
            list.innerHTML = _manualInvoiceRowMarkup(0);
            refreshManualInvoiceTotal();
            return;
        }
        rows[idx]?.remove();
        refreshManualInvoiceTotal();
    };

    const refreshManualInvoiceTotal = () => {
        const list = document.getElementById('manual-invoice-items');
        const totalEl = document.getElementById('manual-invoice-total');
        if (!list || !totalEl) return;
        const total = Array.from(list.querySelectorAll('.manual-invoice-row')).reduce((sum, row) => {
            const qty = Math.max(1, parseInt(row.querySelector('.manual-invoice-qty')?.value || '1', 10) || 1);
            const price = parseFloat(row.querySelector('.manual-invoice-price')?.value || '0') || 0;
            return sum + (qty * price);
        }, 0);
        totalEl.value = total.toFixed(2);
    };

    const openManualInvoiceModal = () => {
        const modal = document.getElementById('manual-invoice-modal');
        if (!modal) return;
        const fields = ['manual-invoice-customer', 'manual-invoice-phone', 'manual-invoice-email', 'manual-invoice-notes'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const date = document.getElementById('manual-invoice-date');
        if (date) date.value = new Date().toISOString().slice(0, 10);
        const total = document.getElementById('manual-invoice-total');
        if (total) total.value = '0.00';
        const list = document.getElementById('manual-invoice-items');
        if (list) {
            list.innerHTML = _manualInvoiceRowMarkup(0); 
            refreshManualInvoiceTotal();
        }
        modal.classList.add('active');
    };

    const closeManualInvoiceModal = () => {
        const modal = document.getElementById('manual-invoice-modal');
        if (modal) modal.classList.remove('active');
    };

    const printManualInvoice = () => {
        const customer = document.getElementById('manual-invoice-customer')?.value?.trim() || 'Walk-in customer';
        const phone = document.getElementById('manual-invoice-phone')?.value?.trim() || '—';
        const email = document.getElementById('manual-invoice-email')?.value?.trim() || '—';
        const date = document.getElementById('manual-invoice-date')?.value || new Date().toISOString().slice(0, 10);
        const notes = document.getElementById('manual-invoice-notes')?.value?.trim() || '';
        const rows = Array.from(document.querySelectorAll('#manual-invoice-items .manual-invoice-row'));
        if (!rows.length) { showToast('Add at least one item to the invoice', 'error'); return; }

        const items = rows.map((row) => {
            const name = row.querySelector('.manual-invoice-name')?.value?.trim() || 'Untitled item';
            const qty = Math.max(1, parseInt(row.querySelector('.manual-invoice-qty')?.value || '1', 10) || 1);
            const price = parseFloat(row.querySelector('.manual-invoice-price')?.value || '0') || 0;
            const subtotal = qty * price;
            return { name, qty, price, subtotal };
        }).filter(item => item.name && item.price >= 0);

        if (!items.length) { showToast('Add at least one valid item to the invoice', 'error'); return; }

        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        // Manual invoices aren't saved as orders, so they get a time-based
        // number (M-YYYYMMDD-HHMMSS) rather than an order tracking code.
        const now = new Date();
        const p2 = n => String(n).padStart(2, '0');
        const invoiceNo = 'M-' + now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) +
            '-' + p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds());
        const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-GB');
        const printed = _printHtml(_invoiceHtml({
            title: 'Invoice ' + invoiceNo + ' — Velvet Royals',
            topLeft: esc(dateLabel),
            topRight: 'Invoice ' + invoiceNo + ' · Velvet Royals',
            meta: [
                ['Invoice Number', invoiceNo],
                ['Date', esc(dateLabel)],
                ['TRN', INVOICE_TRN],
                ['Customer', esc(customer)],
                ['Phone', esc(phone)],
                ['Email', esc(email)]
            ],
            rows: items.map(item => _invoiceRow(item.name, item.qty, item.subtotal)).join(''),
            total,
            notes
        }), 'width=500,height=700');
        if (!printed) return;
        closeManualInvoiceModal();
        showToast('Manual invoice ready to print');
    };

    const saveOfflineOrder = () => {
        if (typeof ordersRef === 'undefined') { showToast('Not connected', 'error'); return; }
        if (!offlineItems.length) { showToast('Add at least one item', 'error'); return; }

        const source = (document.getElementById('offline-source') || {}).value || 'deliveroo';
        const status = (document.getElementById('offline-status') || {}).value || 'delivered';
        const dateVal = (document.getElementById('offline-date') || {}).value || '';
        const name  = ((document.getElementById('offline-name') || {}).value || '').trim();
        const notes = ((document.getElementById('offline-notes') || {}).value || '').trim();

        const computed = _offlineComputedTotal();
        const typed = parseFloat((document.getElementById('offline-total') || {}).value);
        const total = (!isNaN(typed) && typed > 0) ? typed : computed;
        if (!(total > 0)) { showToast('Enter a total greater than zero', 'error'); return; }

        const btn = document.getElementById('offline-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

        // Dated to the chosen day so it lands in the right revenue month; the
        // time of day is now, since only the date is captured.
        const ts = dateVal
            ? new Date(dateVal + 'T' + new Date().toTimeString().slice(0, 8)).toISOString()
            : new Date().toISOString();

        const order = {
            source,
            offline: true,
            customer: {
                name: name || (SOURCE_LABELS[source] || 'Offline') + ' customer',
                email: '', phone: '', notes
            },
            items: offlineItems.map(i => ({
                id: i.id, name: i.name, price: i.price, quantity: i.quantity,
                subtotal: parseFloat((i.price * i.quantity).toFixed(2))
            })),
            subtotal: parseFloat(computed.toFixed(2)),
            deliveryFee: 0,
            discount: 0,
            total: parseFloat(total.toFixed(2)),
            paymentMethod: source,
            paymentStatus: 'paid',
            paidAt: ts,
            status,
            timestamp: ts,
            updatedAt: new Date().toISOString(),
            statusHistory: [{ status, ts, note: 'Recorded by admin (' + (SOURCE_LABELS[source] || source) + ')' }]
        };

        const ref = ordersRef.push();
        ref.set(order)
            .then(() => {
                // Same server-side deduction the online payments use, so a
                // Deliveroo sale draws stock down exactly like a website one.
                return fetch('https://us-central1-flowershop-d26f4.cloudfunctions.net/applyOrderStock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: ref.key })
                }).catch(() => {});
            })
            .then(() => {
                showToast((SOURCE_LABELS[source] || 'Offline') + ' order recorded ✓');
                closeOfflineOrder();
            })
            .catch(err => {
                console.error('Offline order save failed:', err);
                showToast('Could not save: ' + (err && err.message ? err.message : 'unknown error'), 'error');
            })
            .then(() => {
                if (btn) { btn.disabled = false; btn.textContent = 'Record Order'; }
            });
    };

    const markPaid = (orderId) => {
        if (typeof ordersRef === 'undefined') return;
        if (!confirm('Mark this order as PAID? Pending orders will automatically advance to Confirmed.')) return;
        ordersRef.child(orderId).update({ paymentStatus: 'paid', paidAt: new Date().toISOString() })
            .then(() => {
                showToast('Payment recorded ✓');
                // Same deduction the Geidea webhook performs, so manually
                // recorded payments (cash, transfer, WhatsApp) also draw down
                // stock. Safe to call twice — the server ignores repeats.
                return fetch('https://us-central1-flowershop-d26f4.cloudfunctions.net/applyOrderStock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId })
                }).catch(() => {});
            })
            .catch(err => showToast('Error: ' + err.message, 'error'));
    };

    // Record which third-party courier is fulfilling this order.
    const setDeliveryCompany = (orderId, value) => {
        if (typeof ordersRef === 'undefined') return;
        ordersRef.child(orderId).update({ deliveryCompany: value || null })
            .then(() => showToast(value ? 'Delivery company set to ' + (deliveryCompanyLabels[value] || value) : 'Delivery company cleared'))
            .catch(err => showToast('Error: ' + err.message, 'error'));
    };

    const advanceOrder = (orderId, newStatus) => {
        if (typeof ordersRef === 'undefined') return;
        const LABELS = { confirmed: 'Confirmed', preparing: 'Preparing', out_for_delivery: 'Out for Delivery', delivered: 'Delivered' };
        const order = allOrders.find(o => o.key === orderId);
        const history = [...(order?.statusHistory || []), {
            status: newStatus,
            ts: new Date().toISOString(),
            note: 'Updated by admin'
        }];
        ordersRef.child(orderId).update({ status: newStatus, updatedAt: new Date().toISOString(), statusHistory: history })
            .then(() => {
                _syncOrderTracking(orderId, newStatus);
                showToast('Order status → ' + (LABELS[newStatus] || newStatus));
            })
            .catch(err => showToast('Error: ' + err.message, 'error'));
    };

    // Keep the public guest-tracking copy in step with the admin status change.
    const _syncOrderTracking = (orderId, status) => {
        if (typeof firebase === 'undefined') return;
        firebase.database().ref('order-tracking').child(orderId)
            .update({ status, updatedAt: new Date().toISOString() })
            .catch(() => {});
    };

    const forceComplete = (orderId) => {
        if (typeof ordersRef === 'undefined') return;
        if (!confirm('Mark this order as Delivered immediately?')) return;
        const order = allOrders.find(o => o.key === orderId);
        const history = [...(order?.statusHistory || []), {
            status: 'delivered',
            ts: new Date().toISOString(),
            note: 'Force-completed by admin'
        }];
        ordersRef.child(orderId).update({ status: 'delivered', updatedAt: new Date().toISOString(), statusHistory: history })
            .then(() => {
                _syncOrderTracking(orderId, 'delivered');
                showToast('Order force-completed');
            })
            .catch(err => showToast('Error: ' + err.message, 'error'));
    };

    const completeOrder = (orderId) => advanceOrder(orderId, 'delivered');

    const updateDashboardStats = () => {
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        const today = new Date().toISOString().slice(0, 10);
        const now   = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const todayCount    = allOrders.filter(o => o.timestamp && o.timestamp.slice(0, 10) === today).length;
        const pendingCount  = allOrders.filter(o => !isHistorical(o) && o.status !== 'delivered' && o.status !== 'completed').length;
        const monthRevenue  = allOrders
            .filter(o => o.timestamp && o.timestamp >= monthStart)
            .reduce((s, o) => s + parseFloat(o.total || 0), 0);

        setEl('stat-today-orders',   todayCount);
        setEl('stat-pending-orders', pendingCount);
        setEl('stat-monthly-revenue', 'AED ' + monthRevenue.toFixed(0));

        if (typeof firebase !== 'undefined') {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            firebase.database().ref('reviews').orderByChild('timestamp').startAt(sevenDaysAgo).once('value', snap => {
                setEl('stat-new-reviews', snap.numChildren());
            });
        }
    };

    const normalizeDeliveryDate = (dateStr) => {
        if (!dateStr) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().slice(0, 10);
    };

    const renderCalendar = () => {
        const container  = document.getElementById('admin-calendar');
        const monthLabel = document.getElementById('cal-month-label');
        if (!container) return;

        const monthNames = ['January','February','March','April','May','June',
                            'July','August','September','October','November','December'];
        if (monthLabel) monthLabel.textContent = monthNames[calMonth] + ' ' + calYear;

        const deliveriesByDate = {};
        allOrders.forEach(order => {
            const raw = (order.fulfillment || {}).date;
            const d   = normalizeDeliveryDate(raw);
            if (!d) return;
            if (!deliveriesByDate[d]) deliveriesByDate[d] = [];
            deliveriesByDate[d].push(order);
        });

        const firstDow     = new Date(calYear, calMonth, 1).getDay();
        const daysInMonth  = new Date(calYear, calMonth + 1, 0).getDate();
        const today        = new Date().toISOString().slice(0, 10);
        const dayHeaders   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

        let html = '<div class="cal-grid">';
        dayHeaders.forEach(d => { html += '<div class="cal-day-header">' + d + '</div>'; });
        for (let i = 0; i < firstDow; i++) html += '<div class="cal-day other-month"></div>';

        for (let d = 1; d <= daysInMonth; d++) {
            const ds   = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            const dayO = deliveriesByDate[ds] || [];
            const cls  = 'cal-day'
                + (ds === today         ? ' today'       : '')
                + (dayO.length          ? ' has-orders'  : '')
                + (ds === selectedCalDate ? ' selected'  : '');
            html += '<div class="' + cls + '"' + (dayO.length ? ' onclick="crud.selectCalDay(\'' + ds + '\')"' : '') + '>';
            html += '<span class="cal-day-num">' + d + '</span>';
            if (dayO.length) html += '<span class="cal-order-count">' + dayO.length + '</span>';
            html += '</div>';
        }
        html += '</div>';
        container.innerHTML = html;

        if (selectedCalDate && deliveriesByDate[selectedCalDate]) {
            renderCalDayOrders(selectedCalDate, deliveriesByDate[selectedCalDate]);
        } else {
            const panel = document.getElementById('cal-day-orders');
            if (panel) panel.style.display = 'none';
        }
    };

    const renderCalDayOrders = (dateStr, orders) => {
        const panel = document.getElementById('cal-day-orders');
        if (!panel) return;

        const STATUS_LABELS = {
            pending: 'Pending', confirmed: 'Confirmed', preparing: 'Preparing',
            out_for_delivery: 'Out for Delivery', delivered: 'Delivered', completed: 'Delivered'
        };
        const STATUS_COLORS = {
            pending: 'badge-pending', confirmed: 'badge-confirmed', preparing: 'badge-preparing',
            out_for_delivery: 'badge-out-delivery', delivered: 'badge-delivered', completed: 'badge-delivered'
        };

        const d = new Date(dateStr + 'T00:00:00');
        const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        let html = '<h4>'
            + '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>'
            + formatted + ' &mdash; ' + orders.length + ' deliver' + (orders.length === 1 ? 'y' : 'ies')
            + '</h4>';

        orders.forEach(o => {
            const c      = o.customer || {};
            const f      = o.fulfillment || {};
            const status = o.status || 'pending';
            html += '<div class="cal-order-row">'
                + '<span class="order-status-badge ' + (STATUS_COLORS[status] || 'badge-pending') + '" style="flex-shrink:0;">' + (STATUS_LABELS[status] || status) + '</span>'
                + '<div>'
                + '<div class="cal-order-customer">' + esc(c.name || 'Unknown') + '</div>'
                + '<div class="cal-order-meta">'
                + 'AED ' + parseFloat(o.total || 0).toFixed(2)
                + (f.timeSlot ? ' &middot; ' + esc(f.timeSlot) : '')
                + (f.area     ? ' &middot; ' + esc(f.area)     : '')
                + '</div>'
                + '</div>'
                + '</div>';
        });

        panel.innerHTML = html;
        panel.style.display = 'block';
    };

    const selectCalDay  = (dateStr) => { selectedCalDate = dateStr; renderCalendar(); };
    const calPrev = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } selectedCalDate = null; renderCalendar(); };
    const calNext = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } selectedCalDate = null; renderCalendar(); };

    const seedStarterProducts = () => {
        if (!confirm('This will add 6 starter flower products and 5 gift products to your store. Continue?')) return;
        const starters = [
            { name: 'Red Roses Bunch', category: 'flower', price: 89, description: 'A classic bunch of 12 fresh red roses, perfect for any romantic occasion.', badge: 'bestseller', inStock: true },
            { name: 'Pink Peonies Bouquet', category: 'flower', price: 119, description: 'Lush pink peonies arranged in an elegant wrap, great for birthdays and celebrations.', badge: 'new', inStock: true },
            { name: 'Sunflower Delight', category: 'flower', price: 75, description: 'Bright sunflowers mixed with greenery for a cheerful, joyful arrangement.', badge: '', inStock: true },
            { name: 'White Lily Elegance', category: 'flower', price: 95, description: 'Pristine white lilies symbolizing purity and grace, beautifully arranged.', badge: '', inStock: true },
            { name: 'Mixed Wildflower Wrap', category: 'flower', price: 65, description: 'A vibrant seasonal mix of wildflowers in a rustic paper wrap.', badge: 'sale', inStock: true },
            { name: 'Lavender Dreams', category: 'flower', price: 85, description: 'Soft lavender and white blooms evoking calm and tranquility.', badge: '', inStock: true },
            { name: 'Luxury Scented Candle', category: 'gift', price: 55, description: 'Hand-poured soy candle with a warm floral scent — pairs beautifully with any bouquet.', badge: '', inStock: true },
            { name: 'Gift Box — Sweet & Floral', category: 'gift', price: 145, description: 'A curated gift box with chocolates, a mini bouquet, and a personal card.', badge: 'bestseller', inStock: true },
            { name: 'Vase — Gold Rim', category: 'gift', price: 79, description: 'Elegant glass vase with a gold rim, perfect for displaying fresh flowers at home.', badge: '', inStock: true },
            { name: 'Teddy Bear & Flowers Set', category: 'gift', price: 125, description: 'A plush teddy bear paired with a hand-tied flower bouquet — ideal for anniversaries or new babies.', badge: 'new', inStock: true },
            { name: 'Chocolate & Rose Box', category: 'gift', price: 160, description: 'Premium Belgian chocolates nestled with a dozen mini roses in a keepsake box.', badge: '', inStock: true }
        ];

        let added = 0;
        starters.forEach(product => {
            const newRef = flowersRef.push();
            newRef.set({
                id: newRef.key,
                name: product.name,
                category: product.category,
                price: product.price,
                description: product.description,
                badge: product.badge,
                inStock: product.inStock,
                image: '',
                createdAt: new Date().toISOString()
            }).then(() => {
                added++;
                if (added === starters.length) showToast(`${starters.length} starter products added!`);
            }).catch(err => showToast('Seed error: ' + err.message, 'error'));
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

    return {
        init,
        addFlower,
        updateFlower,
        deleteFlower,
        edit: editFlower,
        delete: deleteFlower,
        exitEditMode,
        displayFlowers,
        completeOrder,
        advanceOrder,
        forceComplete,
        markPaid,
        setDeliveryCompany,
        copyTrackingId,
        exportOrdersXlsx,
        exportCatalogueXlsx,
        printCatalogue,
        printOrder,
        openOfflineOrder,
        closeOfflineOrder,
        openManualInvoiceModal,
        closeManualInvoiceModal,
        addManualInvoiceRow,
        removeManualInvoiceRow,
        refreshManualInvoiceTotal,
        printManualInvoice,
        addOfflineItem,
        removeOfflineItem,
        onOfflineTotalEdited,
        saveOfflineOrder,
        applyQuickDiscount,
        clearQuickDiscount,
        filterOrders,
        filterProducts,
        searchAdminProducts,
        searchAdminOrders,
        seedStarterProducts,
        selectCalDay,
        calPrev,
        calNext
    };
})();

function editFlower(id) {
    crud.edit(id);
}

function deleteFlower(id) {
    crud.delete(id);
}
