// QA for new features: Bundles, Delivery fee messaging, Occasion/Recipient Filters, Delivery Slots
//
// Strategy: let Firebase load normally, then call app._setProducts() to inject seed data
// with the new fields (occasion, recipient, bundle) that live Firebase doesn't have yet.
// Firebase won't re-fire .on('value') unless the DB changes, so seed data persists per test.
const { test, expect } = require('@playwright/test');

test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
});

const BASE_URL = 'https://flowershop-d26f4.web.app';

// Seed products with all new fields: occasion, recipient, bundle category
const SEED_PRODUCTS = [
    { id: 'qa1', name: 'Birthday Rose',      price: 45.00,  category: 'flower',      description: 'Red roses',       image: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=400', badge: 'bestseller', occasion: 'birthday',    recipient: 'her'    },
    { id: 'qa2', name: 'Anniversary Tulip',  price: 35.00,  category: 'flower',      description: 'Pink tulips',     image: 'https://images.unsplash.com/photo-1551074313-802101ec6b24?w=400', badge: '',            occasion: 'anniversary', recipient: 'her'    },
    { id: 'qa3', name: 'Wedding Bouquet',    price: 120.00, category: 'arrangement', description: 'Bridal bouquet',  image: 'https://images.unsplash.com/photo-1487530811015-780706c7d7d5?w=400', badge: 'new',         occasion: 'wedding',     recipient: 'her'    },
    { id: 'qa4', name: 'Gift for Him',       price: 60.00,  category: 'gift',        description: 'Plants for men',  image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400', badge: '',            occasion: '',            recipient: 'him'    },
    { id: 'qa5', name: 'Rose & Cake Bundle', price: 89.00,  category: 'bundle',      description: 'Roses + cake',    image: 'https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?w=400', badge: '',            occasion: 'birthday',    recipient: 'her'    },
    { id: 'qa6', name: 'Flower Gift Bundle', price: 75.00,  category: 'bundle',      description: 'Flowers + choc',  image: 'https://images.unsplash.com/photo-1548094990-c16ca90f1f0d?w=400', badge: '',            occasion: 'anniversary', recipient: 'him'    },
    { id: 'qa7', name: 'Graduation Flower',  price: 55.00,  category: 'flower',      description: 'Graduation gift', image: 'https://images.unsplash.com/photo-1597848848267-d4ef3798ecc2?w=400', badge: '',            occasion: 'graduation',  recipient: 'friend' },
];

// Cart data for free-shipping and checkout tests
const CART_BELOW = [{ id: 'qa1', name: 'Birthday Rose',   price: 45,  quantity: 4, image: '' }]; // total = 180
const CART_ABOVE = [{ id: 'qa3', name: 'Wedding Bouquet', price: 120, quantity: 2, image: '' }]; // total = 240

// Navigate to products page, wait for Firebase to load, then inject seed products.
// Injecting AFTER Firebase fires means Firebase won't re-fire and overwrite them.
async function loadProductsWithSeed(page) {
    await page.addInitScript(() => { localStorage.setItem('rv_popup_dismissed', '1'); });
    await page.goto(`${BASE_URL}/pages/products.html`);
    // Wait for initial product render (Firebase or cache — doesn't matter which)
    await page.waitForSelector('#product-list .product', { timeout: 15000 });
    // Give Firebase a moment to stabilize so it doesn't re-fire after we inject
    await page.waitForTimeout(600);
    // Inject seed products with occasion/recipient/bundle data
    await page.evaluate((prods) => { app._setProducts(prods); }, SEED_PRODUCTS);
    await page.waitForTimeout(200);
}

// Seed the cart in localStorage then navigate to cart.html
async function loadCartPage(page, cartItems) {
    await page.addInitScript((args) => {
        localStorage.setItem('rv_popup_dismissed', '1');
        localStorage.setItem('flowershop_cart', JSON.stringify(args));
    }, cartItems);
    await page.goto(`${BASE_URL}/pages/cart.html`);
    await page.waitForLoadState('networkidle');
}

// Open checkout modal by calling app._openCheckoutDirect() — bypasses auth check so tests
// can verify the checkout form UI features (slots, summary) without needing a logged-in user.
async function openCheckout(page, cartItems) {
    await loadCartPage(page, cartItems);
    // Wait for cart to render before opening modal
    await page.waitForSelector('#cart-items .cart-item', { timeout: 8000 });
    await page.evaluate(() => { app._openCheckoutDirect(); });
    await page.waitForSelector('#checkout-modal.active', { timeout: 5000 });
}

// ================================================================
// FEATURE 1 — Product Bundles
// ================================================================
test.describe('Bundles filter', () => {
    test.setTimeout(35000);

    test('Bundles tab is visible on products page', async ({ page }) => {
        await page.addInitScript(() => { localStorage.setItem('rv_popup_dismissed', '1'); });
        await page.goto(`${BASE_URL}/pages/products.html`);
        await page.waitForLoadState('networkidle');
        const bundleBtn = page.locator('.cat-filter-btn[data-cat="bundle"]');
        await expect(bundleBtn).toBeVisible();
        await expect(bundleBtn).toContainText('Bundles');
    });

    test('Bundles tab has gold accent class', async ({ page }) => {
        await page.addInitScript(() => { localStorage.setItem('rv_popup_dismissed', '1'); });
        await page.goto(`${BASE_URL}/pages/products.html`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('.cat-filter-btn.cat-filter-bundle')).toBeVisible();
    });

    test('clicking Bundles shows only bundle products', async ({ page }) => {
        await loadProductsWithSeed(page);

        await page.locator('.cat-filter-btn[data-cat="bundle"]').click();
        await page.waitForTimeout(300);

        const cards = page.locator('#product-list .product');
        const count = await cards.count();
        expect(count).toBe(2); // qa5 and qa6

        await expect(page.locator('#product-list')).toContainText('Rose & Cake Bundle');
        await expect(page.locator('#product-list')).toContainText('Flower Gift Bundle');
        await expect(page.locator('#product-list')).not.toContainText('Birthday Rose');
    });

    test('bundle products show BUNDLE ribbon badge', async ({ page }) => {
        await loadProductsWithSeed(page);

        await page.locator('.cat-filter-btn[data-cat="bundle"]').click();
        await page.waitForTimeout(300);

        const ribbon = page.locator('.product-ribbon.ribbon-bundle').first();
        await expect(ribbon).toBeVisible();
        await expect(ribbon).toContainText('BUNDLE');
    });

    test('All tab after Bundles restores full product list', async ({ page }) => {
        await loadProductsWithSeed(page);
        const total = await page.locator('#product-list .product').count();

        await page.locator('.cat-filter-btn[data-cat="bundle"]').click();
        await page.waitForTimeout(200);
        await page.locator('.cat-filter-btn[data-cat="all"]').click();
        await page.waitForTimeout(200);

        expect(await page.locator('#product-list .product').count()).toBe(total);
    });

    test('bundle tab count badge updates after seed inject', async ({ page }) => {
        await loadProductsWithSeed(page);
        // The count badge for bundles should show 2
        const badge = page.locator('#cat-count-bundle');
        const text = await badge.textContent();
        expect(parseInt(text)).toBe(2);
    });
});

// ================================================================
// FEATURE 2 — Delivery fee messaging
// ================================================================
test.describe('Delivery fee messaging', () => {
    test.setTimeout(30000);

    test('delivery message bar element exists on cart page', async ({ page }) => {
        await loadCartPage(page, CART_BELOW);
        await expect(page.locator('#free-shipping-bar')).toBeVisible();
    });

    test('delivery message explains fees apply by area', async ({ page }) => {
        await loadCartPage(page, CART_BELOW);
        await page.waitForSelector('#free-shipping-text', { timeout: 5000 });
        const text = await page.locator('#free-shipping-text').textContent();
        expect(text).toContain('Delivery fees apply based on selected area');
    });

    test('delivery message bar is not qualified for high cart totals', async ({ page }) => {
        await loadCartPage(page, CART_ABOVE);
        await page.waitForSelector('#free-shipping-bar', { timeout: 5000 });
        await expect(page.locator('#free-shipping-bar')).not.toHaveClass(/qualified/);
        const width = await page.locator('#free-shipping-fill').evaluate(el => el.style.width);
        expect(width).toBe('0%');
    });
});

// ================================================================
// FEATURE 3 — Occasion / Recipient Filters
// ================================================================
test.describe('Occasion & Recipient filters', () => {
    test.setTimeout(35000);

    test('Occasion filter bar is visible', async ({ page }) => {
        await page.addInitScript(() => { localStorage.setItem('rv_popup_dismissed', '1'); });
        await page.goto(`${BASE_URL}/pages/products.html`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#occasion-filter-bar')).toBeVisible();
    });

    test('Recipient filter bar is visible', async ({ page }) => {
        await page.addInitScript(() => { localStorage.setItem('rv_popup_dismissed', '1'); });
        await page.goto(`${BASE_URL}/pages/products.html`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#recipient-filter-bar')).toBeVisible();
    });

    test('all occasion buttons exist with correct data-occ values', async ({ page }) => {
        await page.addInitScript(() => { localStorage.setItem('rv_popup_dismissed', '1'); });
        await page.goto(`${BASE_URL}/pages/products.html`);
        await page.waitForLoadState('networkidle');
        for (const occ of ['all', 'birthday', 'anniversary', 'wedding', 'valentine', 'getwell', 'graduation', 'baby']) {
            await expect(page.locator(`.sub-filter-btn[data-occ="${occ}"]`)).toBeVisible();
        }
    });

    test('all recipient buttons exist with correct data-rec values', async ({ page }) => {
        await page.addInitScript(() => { localStorage.setItem('rv_popup_dismissed', '1'); });
        await page.goto(`${BASE_URL}/pages/products.html`);
        await page.waitForLoadState('networkidle');
        for (const rec of ['all', 'her', 'him', 'parents', 'baby', 'friend']) {
            await expect(page.locator(`.sub-filter-btn[data-rec="${rec}"]`)).toBeVisible();
        }
    });

    test('filtering by Birthday shows birthday products and hides others', async ({ page }) => {
        await loadProductsWithSeed(page);

        await page.locator('.sub-filter-btn[data-occ="birthday"]').click();
        await page.waitForTimeout(300);

        // qa1, qa5 are birthday
        await expect(page.locator('#product-list')).toContainText('Birthday Rose');
        await expect(page.locator('#product-list')).toContainText('Rose & Cake Bundle');
        // Non-birthday products should be hidden
        await expect(page.locator('#product-list')).not.toContainText('Wedding Bouquet');
        await expect(page.locator('#product-list')).not.toContainText('Graduation Flower');
    });

    test('filtering by "For Him" shows him products and hides others', async ({ page }) => {
        await loadProductsWithSeed(page);

        await page.locator('.sub-filter-btn[data-rec="him"]').click();
        await page.waitForTimeout(300);

        // qa4 (him/gift), qa6 (him/bundle)
        await expect(page.locator('#product-list')).toContainText('Gift for Him');
        await expect(page.locator('#product-list')).toContainText('Flower Gift Bundle');
        // her products hidden
        await expect(page.locator('#product-list')).not.toContainText('Birthday Rose');
        await expect(page.locator('#product-list')).not.toContainText('Wedding Bouquet');
    });

    test('occasion + category filters work together (AND logic)', async ({ page }) => {
        await loadProductsWithSeed(page);

        // flower category + birthday occasion → only qa1 (qa5 is bundle, not flower)
        await page.locator('.cat-filter-btn[data-cat="flower"]').click();
        await page.waitForTimeout(200);
        await page.locator('.sub-filter-btn[data-occ="birthday"]').click();
        await page.waitForTimeout(300);

        await expect(page.locator('#product-list')).toContainText('Birthday Rose');
        await expect(page.locator('#product-list')).not.toContainText('Rose & Cake Bundle');
        await expect(page.locator('#product-list')).not.toContainText('Wedding Bouquet');
    });

    test('clicking occasion button makes it active, deactivates All', async ({ page }) => {
        await loadProductsWithSeed(page);

        const birthdayBtn = page.locator('.sub-filter-btn[data-occ="birthday"]');
        const allBtn = page.locator('.sub-filter-btn[data-occ="all"]');

        await birthdayBtn.click();
        await page.waitForTimeout(200);

        await expect(birthdayBtn).toHaveClass(/active/);
        await expect(allBtn).not.toHaveClass(/active/);
    });

    test('clicking recipient button makes it active, deactivates All', async ({ page }) => {
        await loadProductsWithSeed(page);

        const himBtn = page.locator('.sub-filter-btn[data-rec="him"]');
        const allBtn = page.locator('.sub-filter-btn[data-rec="all"]');

        await himBtn.click();
        await page.waitForTimeout(200);

        await expect(himBtn).toHaveClass(/active/);
        await expect(allBtn).not.toHaveClass(/active/);
    });

    test('products with occasion field show occasion tag on card', async ({ page }) => {
        await loadProductsWithSeed(page);
        await expect(page.locator('.tag-occasion').first()).toBeVisible();
    });

    test('products with recipient field show recipient tag on card', async ({ page }) => {
        await loadProductsWithSeed(page);
        await expect(page.locator('.tag-recipient').first()).toBeVisible();
    });

    test('resetting occasion to All restores full product list', async ({ page }) => {
        await loadProductsWithSeed(page);
        const total = await page.locator('#product-list .product').count();

        await page.locator('.sub-filter-btn[data-occ="graduation"]').click();
        await page.waitForTimeout(200);
        await page.locator('.sub-filter-btn[data-occ="all"]').click();
        await page.waitForTimeout(200);

        expect(await page.locator('#product-list .product').count()).toBe(total);
    });

    test('empty state shown when no products match combined occasion+category filters', async ({ page }) => {
        await loadProductsWithSeed(page);

        // arrangement + graduation → qa3 is wedding/arrangement, no graduation/arrangement in seed
        await page.locator('.cat-filter-btn[data-cat="arrangement"]').click();
        await page.waitForTimeout(200);
        await page.locator('.sub-filter-btn[data-occ="graduation"]').click();
        await page.waitForTimeout(300);

        await expect(page.locator('#product-list .empty-state')).toBeVisible();
    });
});

// ================================================================
// FEATURE 4 — Delivery Time Slots + Pricing
// ================================================================
test.describe('Delivery time slots + pricing', () => {
    test.setTimeout(40000);

    test.beforeEach(async ({ page }) => {
        await openCheckout(page, CART_BELOW);
        await page.locator('#checkout-area').selectOption('Dubai|15');
        await page.waitForTimeout(300);
    });

    test('time slot select exists and has Standard / Express / Midnight optgroups', async ({ page }) => {
        const slot = page.locator('#checkout-timeslot');
        await expect(slot).toBeVisible();
        const html = await slot.innerHTML();
        expect(html).toContain('Standard Delivery');
        expect(html).toContain('Express');
        expect(html).toContain('Midnight');
    });

    test('standard slot adds no surcharge line to summary', async ({ page }) => {
        await page.locator('#checkout-timeslot').selectOption('9:00 AM - 12:00 PM|0');
        await page.waitForTimeout(300);
        const summary = await page.locator('#checkout-order-summary').textContent();
        expect(summary.toLowerCase()).not.toContain('surcharge');
    });

    test('Express slot adds AED 20 surcharge line to summary', async ({ page }) => {
        await page.locator('#checkout-timeslot').selectOption('Express: Within 2 Hours|20');
        await page.waitForTimeout(300);
        const summary = await page.locator('#checkout-order-summary').textContent();
        expect(summary).toContain('20.00');
        expect(summary.toLowerCase()).toContain('surcharge');
    });

    test('Midnight slot adds AED 25 surcharge line to summary', async ({ page }) => {
        await page.locator('#checkout-timeslot').selectOption('Midnight: 10PM - 12AM|25');
        await page.waitForTimeout(300);
        const summary = await page.locator('#checkout-order-summary').textContent();
        expect(summary).toContain('25.00');
        expect(summary.toLowerCase()).toContain('surcharge');
    });

    test('Express surcharge adds correctly to total (subtotal 180 + delivery 15 + express 20 = 215)', async ({ page }) => {
        await page.locator('#checkout-timeslot').selectOption('Express: Within 2 Hours|20');
        await page.waitForTimeout(300);
        const summary = await page.locator('#checkout-order-summary').textContent();
        expect(summary).toContain('215.00');
    });

    test('switching from Express back to standard removes surcharge', async ({ page }) => {
        await page.locator('#checkout-timeslot').selectOption('Express: Within 2 Hours|20');
        await page.waitForTimeout(200);
        await page.locator('#checkout-timeslot').selectOption('12:00 PM - 3:00 PM|0');
        await page.waitForTimeout(300);
        const summary = await page.locator('#checkout-order-summary').textContent();
        expect(summary.toLowerCase()).not.toContain('surcharge');
    });

    test('slot raw value contains | separator, split gives clean label', async ({ page }) => {
        await page.locator('#checkout-timeslot').selectOption('Express: Within 2 Hours|20');
        const rawVal = await page.locator('#checkout-timeslot').inputValue();
        expect(rawVal).toBe('Express: Within 2 Hours|20');
        expect(rawVal.split('|')[0]).toBe('Express: Within 2 Hours');
    });

    test('all 4 standard time slots are selectable', async ({ page }) => {
        for (const s of ['9:00 AM - 12:00 PM|0', '12:00 PM - 3:00 PM|0', '3:00 PM - 6:00 PM|0', '6:00 PM - 9:00 PM|0']) {
            await page.locator('#checkout-timeslot').selectOption(s);
            await page.waitForTimeout(100);
            expect(await page.locator('#checkout-timeslot').inputValue()).toBe(s);
        }
    });

    test('reopening checkout modal resets slot surcharge to 0', async ({ page }) => {
        // Select Express (+20)
        await page.locator('#checkout-timeslot').selectOption('Express: Within 2 Hours|20');
        await page.waitForTimeout(200);
        // Close via cancel button then reopen via direct function
        await page.locator('#checkout-cancel').click();
        await page.waitForTimeout(200);
        await page.evaluate(() => { app._openCheckoutDirect(); });
        await page.waitForSelector('#checkout-modal.active', { timeout: 5000 });
        await page.locator('#checkout-area').selectOption('Dubai|15');
        await page.waitForTimeout(300);
        // Summary should NOT contain Express surcharge (reset on reopen)
        const summary = await page.locator('#checkout-order-summary').textContent();
        expect(summary.toLowerCase()).not.toContain('surcharge');
    });
});
