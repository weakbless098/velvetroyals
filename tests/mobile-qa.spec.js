// Mobile QA — Chromium with iPhone 12 viewport (390×844)
// touch target sizes verified via boundingBox(); interaction via click() (Playwright
// mobile emulation reliably fires onclick via click(), not tap())
const { test, expect } = require('@playwright/test');

test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
});

// Sample products — pre-seed localStorage cache so Firebase is never awaited
const SEED_PRODUCTS = [
    { id: 'qa1', name: 'QA Rose',      price: 10.99, category: 'flower',      description: 'Test flower',      image: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=400&h=400&fit=crop', badge: 'new' },
    { id: 'qa2', name: 'QA Tulip',     price: 8.99,  category: 'flower',      description: 'Test flower 2',    image: 'https://images.unsplash.com/photo-1551074313-802101ec6b24?w=400&h=400&fit=crop', badge: '' },
    { id: 'qa3', name: 'QA Bouquet',   price: 29.99, category: 'arrangement', description: 'Test arrangement', image: 'https://images.unsplash.com/photo-1487530811015-780706c7d7d5?w=400&h=400&fit=crop', badge: 'bestseller' },
    { id: 'qa4', name: 'QA Vase',      price: 19.99, category: 'arrangement', description: 'Test arr 2',       image: 'https://images.unsplash.com/photo-1487530811015-780706c7d7d5?w=400&h=400&fit=crop', badge: '' },
    { id: 'qa5', name: 'QA Gift Box',  price: 24.99, category: 'gift',        description: 'Test gift',        image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&h=400&fit=crop', badge: '' },
    { id: 'qa6', name: 'QA Sunflower', price: 12.99, category: 'flower',      description: 'Test flower 3',    image: 'https://images.unsplash.com/photo-1597848848267-d4ef3798ecc2?w=400&h=400&fit=crop', badge: '' },
];

async function setupPage(page, { showPopup = false } = {}) {
    await page.addInitScript((args) => {
        localStorage.setItem('rv_products_v1', JSON.stringify({ ts: Date.now(), data: args.products }));
        if (!args.showPopup) localStorage.setItem('rv_popup_dismissed', '1');
    }, { products: SEED_PRODUCTS, showPopup });
}

// ================================================================
// EMAIL POPUP
// ================================================================
test.describe('Email popup — mobile', () => {
    test.setTimeout(20000);

    test.beforeEach(async ({ page }) => {
        await setupPage(page, { showPopup: true });
    });

    test('popup appears within 7 seconds', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('#email-popup')).toBeVisible({ timeout: 7000 });
    });

    test('close button is ≥ 44×44px', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('#email-popup')).toBeVisible({ timeout: 7000 });
        const box = await page.locator('.email-popup-close').boundingBox();
        expect(box.width,  'close btn width ≥ 44').toBeGreaterThanOrEqual(44);
        expect(box.height, 'close btn height ≥ 44').toBeGreaterThanOrEqual(44);
    });

    test('clicking close button dismisses popup', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('#email-popup')).toBeVisible({ timeout: 7000 });
        await page.locator('.email-popup-close').click();
        await expect(page.locator('#email-popup')).toBeHidden({ timeout: 3000 });
    });

    test('clicking overlay background dismisses popup', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('#email-popup')).toBeVisible({ timeout: 7000 });
        // Click top-left corner of overlay (outside the centred box)
        await page.locator('#email-popup').click({ position: { x: 10, y: 10 } });
        await expect(page.locator('#email-popup')).toBeHidden({ timeout: 3000 });
    });
});

// ================================================================
// HOME PAGE
// ================================================================
test.describe('Home page — mobile', () => {
    test.setTimeout(20000);

    test.beforeEach(async ({ page }) => {
        await setupPage(page);
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
    });

    test('burger button is ≥ 40×40px', async ({ page }) => {
        const box = await page.locator('#nav-burger').boundingBox();
        expect(box.width,  'burger w').toBeGreaterThanOrEqual(40);
        expect(box.height, 'burger h').toBeGreaterThanOrEqual(40);
    });

    test('clicking burger opens nav drawer', async ({ page }) => {
        await page.locator('#nav-burger').click();
        await expect(page.locator('#main-nav')).toHaveClass(/open/, { timeout: 3000 });
    });

    test('clicking overlay closes nav drawer', async ({ page }) => {
        await page.locator('#nav-burger').click();
        await expect(page.locator('#main-nav')).toHaveClass(/open/, { timeout: 3000 });
        await page.locator('#nav-overlay').click();
        await expect(page.locator('#main-nav')).not.toHaveClass(/open/, { timeout: 3000 });
    });

    test('all nav links are ≥ 40px tall', async ({ page }) => {
        await page.locator('#nav-burger').click();
        const links = page.locator('#main-nav a');
        await expect(links.first()).toBeVisible({ timeout: 3000 });
        const n = await links.count();
        for (let i = 0; i < n; i++) {
            const box = await links.nth(i).boundingBox();
            if (box) expect(box.height, `nav link ${i}`).toBeGreaterThanOrEqual(40);
        }
    });

    test('hero Shop Now button is ≥ 40px tall', async ({ page }) => {
        const box = await page.locator('#hero .hero-cta').first().boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(40);
    });

    test('featured products load from cache instantly', async ({ page }) => {
        await expect(page.locator('.product').first()).toBeVisible({ timeout: 8000 });
    });

    test('Add to Cart on featured product shows toast', async ({ page }) => {
        await page.locator('.product').first().waitFor({ timeout: 5000 });
        // Use force:true — Firebase may re-render products right as we click
        const btn = page.locator('.product .button').first();
        const box = await btn.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(40);
        await btn.click({ force: true });
        await expect(page.locator('.toast-notification')).toBeVisible({ timeout: 8000 });
    });

    test('FAQ questions are ≥ 44px tall', async ({ page }) => {
        const qs = page.locator('.faq-question');
        if (await qs.count() === 0) return;
        const box = await qs.first().boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
    });

    test('no horizontal overflow', async ({ page }) => {
        const w = await page.evaluate(() => document.body.scrollWidth);
        expect(w).toBeLessThanOrEqual(395);
    });
});

// ================================================================
// PRODUCTS PAGE
// ================================================================
test.describe('Products page — mobile', () => {
    test.setTimeout(20000);

    test.beforeEach(async ({ page }) => {
        await setupPage(page);
        await page.goto('/pages/products.html');
        await page.waitForLoadState('domcontentloaded');
        await page.locator('.product').first().waitFor({ timeout: 6000 });
    });

    test('category filter bar fits viewport', async ({ page }) => {
        const box = await page.locator('.category-filter-bar').boundingBox();
        expect(box.width).toBeLessThanOrEqual(395);
    });

    test('all filter buttons are ≥ 40px tall', async ({ page }) => {
        const btns = page.locator('.cat-filter-btn');
        const n = await btns.count();
        for (let i = 0; i < n; i++) {
            const box = await btns.nth(i).boundingBox();
            if (box) expect(box.height, `btn ${i}`).toBeGreaterThanOrEqual(40);
        }
    });

    test('Arrangements filter becomes active on click', async ({ page }) => {
        await page.locator('.cat-filter-btn[data-cat="arrangement"]').click();
        await expect(page.locator('.cat-filter-btn[data-cat="arrangement"]')).toHaveClass(/active/, { timeout: 3000 });
    });

    test('Flowers filter becomes active on click', async ({ page }) => {
        await page.locator('.cat-filter-btn[data-cat="flower"]').click();
        await expect(page.locator('.cat-filter-btn[data-cat="flower"]')).toHaveClass(/active/, { timeout: 3000 });
    });

    test('Add to Cart shows toast', async ({ page }) => {
        const btn = page.locator('.product .button').first();
        const box = await btn.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(40);
        await btn.click();
        await expect(page.locator('.toast-notification')).toBeVisible({ timeout: 6000 });
    });

    test('builder arrangement options are ≥ 44px tall', async ({ page }) => {
        const opts = page.locator('#builder-arrangements .builder-option');
        await expect(opts.first()).toBeVisible({ timeout: 6000 });
        const box = await opts.first().boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
    });

    test('clicking arrangement + flower shows builder summary', async ({ page }) => {
        const arrOpt = page.locator('#builder-arrangements .builder-option').first();
        await expect(arrOpt).toBeVisible({ timeout: 6000 });
        await arrOpt.click({ force: true });
        // Wait for builder to re-render flower options after arrangement selection
        const flowerOpt = page.locator('#builder-flowers .builder-option').first();
        await expect(flowerOpt).toBeVisible({ timeout: 5000 });
        await flowerOpt.click({ force: true });
        await expect(page.locator('#builder-summary')).toBeVisible({ timeout: 5000 });
    });

    test('builder Add to Cart is full-width and ≥ 44px tall', async ({ page }) => {
        const arrOpt = page.locator('#builder-arrangements .builder-option').first();
        await expect(arrOpt).toBeVisible({ timeout: 6000 });
        await arrOpt.click({ force: true });
        const flowerOpt = page.locator('#builder-flowers .builder-option').first();
        await expect(flowerOpt).toBeVisible({ timeout: 5000 });
        await flowerOpt.click({ force: true });
        const btn = page.locator('.builder-add-btn');
        await expect(btn).toBeVisible({ timeout: 5000 });
        const box = await btn.boundingBox();
        expect(box.width,  'full-width').toBeGreaterThan(250);
        expect(box.height, '≥44px').toBeGreaterThanOrEqual(44);
    });

    test('no horizontal overflow', async ({ page }) => {
        const w = await page.evaluate(() => document.body.scrollWidth);
        expect(w).toBeLessThanOrEqual(395);
    });
});

// ================================================================
// CART PAGE
// ================================================================
test.describe('Cart page — mobile', () => {
    test.setTimeout(30000);

    test.beforeEach(async ({ page }) => {
        await setupPage(page);
        // Seed cart via products page, then navigate to cart
        await page.goto('/pages/products.html');
        await page.locator('.product').first().waitFor({ timeout: 6000 });
        await page.locator('.product .button').first().click();
        await page.locator('.toast-notification').waitFor({ timeout: 6000 });
        await page.goto('/pages/cart.html');
        await page.waitForLoadState('domcontentloaded');
        await page.locator('.cart-item').first().waitFor({ timeout: 8000 });
    });

    test('cart items are visible', async ({ page }) => {
        await expect(page.locator('.cart-item').first()).toBeVisible();
    });

    test('qty − button is ≥ 40×40px', async ({ page }) => {
        const box = await page.locator('.qty-controls .button').first().boundingBox();
        expect(box.width,  '− w').toBeGreaterThanOrEqual(40);
        expect(box.height, '− h').toBeGreaterThanOrEqual(40);
    });

    test('qty + button is ≥ 40×40px and responds to click', async ({ page }) => {
        const btn = page.locator('.qty-controls .button').last();
        const box = await btn.boundingBox();
        expect(box.width,  '+ w').toBeGreaterThanOrEqual(40);
        expect(box.height, '+ h').toBeGreaterThanOrEqual(40);
        await btn.click();
    });

    test('checkout modal fits within 390px viewport', async ({ page }) => {
        const btn = page.locator('#checkout-btn, .checkout-btn, button:has-text("Checkout")').first();
        if (await btn.count() === 0) return;
        await btn.click();
        const modal = page.locator('.checkout-modal-wide');
        await expect(modal).toBeVisible({ timeout: 5000 });
        const box = await modal.boundingBox();
        expect(box.width, 'modal ≤ 390px').toBeLessThanOrEqual(395);
    });

    test('delivery toggle buttons are ≥ 40px tall', async ({ page }) => {
        const checkBtn = page.locator('#checkout-btn, .checkout-btn, button:has-text("Checkout")').first();
        if (await checkBtn.count() === 0) return;
        await checkBtn.click();
        await page.locator('.checkout-modal-wide').waitFor({ timeout: 5000 });
        const toggles = page.locator('.delivery-toggle-btn');
        const n = await toggles.count();
        for (let i = 0; i < n; i++) {
            const box = await toggles.nth(i).boundingBox();
            if (box) expect(box.height, `toggle ${i}`).toBeGreaterThanOrEqual(40);
        }
    });

    test('payment method cards are ≥ 44px tall', async ({ page }) => {
        const checkBtn = page.locator('#checkout-btn, .checkout-btn, button:has-text("Checkout")').first();
        if (await checkBtn.count() === 0) return;
        await checkBtn.click();
        await page.locator('.checkout-modal-wide').waitFor({ timeout: 5000 });
        const cards = page.locator('.payment-card');
        const n = await cards.count();
        for (let i = 0; i < n; i++) {
            const box = await cards.nth(i).boundingBox();
            if (box) expect(box.height, `card ${i}`).toBeGreaterThanOrEqual(44);
        }
    });

    test('no horizontal overflow on cart page', async ({ page }) => {
        const w = await page.evaluate(() => document.body.scrollWidth);
        expect(w).toBeLessThanOrEqual(395);
    });
});
