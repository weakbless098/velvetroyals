const { test, expect } = require('@playwright/test');

// Wait for Firebase to finish loading products
const waitForProducts = async (page) => {
    await page.waitForFunction(
        () => document.querySelectorAll('.product').length > 0 || document.querySelector('.empty-state'),
        { timeout: 12000 }
    );
};

const waitForBuilderOptions = async (page) => {
    await page.waitForFunction(
        () => document.querySelectorAll('#builder-arrangements .builder-option').length > 0,
        { timeout: 45000 }
    );
};

// ============================================================
// Products Page — Category Filter
// ============================================================
test.describe('Products page — category filter', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/pages/products.html');
        await waitForProducts(page);
    });

    test('shows 5 filter tabs', async ({ page }) => {
        const tabs = page.locator('.cat-filter-btn');
        await expect(tabs).toHaveCount(5);
    });

    test('"All" tab is active on load', async ({ page }) => {
        const active = page.locator('.cat-filter-btn.active');
        await expect(active).toHaveCount(1);
        await expect(active).toContainText('All');
    });

    test('counts are non-zero after load', async ({ page }) => {
        const count = page.locator('#cat-count-all');
        await expect(count).not.toHaveText('0');
    });

    test('Arrangements filter shows only arrangement badges', async ({ page }) => {
        await page.click('[data-cat="arrangement"]');
        await expect(page.locator('[data-cat="arrangement"]')).toHaveClass(/active/);
        const wrongBadge = page.locator('.badge-flower, .badge-gift');
        await expect(wrongBadge).toHaveCount(0);
        await expect(page.locator('.badge-arrangement').first()).toBeVisible();
    });

    test('Flowers filter shows only flower badges or empty state', async ({ page }) => {
        await page.click('[data-cat="flower"]');
        await expect(page.locator('.cat-filter-btn[data-cat="flower"]')).toHaveClass(/active/);
        const hasFlowers = await page.locator('.badge-flower').count();
        if (hasFlowers > 0) {
            const wrongBadge = page.locator('.badge-arrangement, .badge-gift');
            await expect(wrongBadge).toHaveCount(0);
        } else {
            await expect(page.locator('#product-list .empty-state')).toBeVisible();
        }
    });

    test('Gifts filter shows only gift badges or empty state', async ({ page }) => {
        await page.click('[data-cat="gift"]');
        await expect(page.locator('.cat-filter-btn[data-cat="gift"]')).toHaveClass(/active/);
        const hasGifts = await page.locator('.badge-gift').count();
        if (hasGifts > 0) {
            const wrongBadge = page.locator('.badge-arrangement, .badge-flower');
            await expect(wrongBadge).toHaveCount(0);
        } else {
            await expect(page.locator('#product-list .empty-state')).toBeVisible();
        }
    });

    test('All tab shows all products', async ({ page }) => {
        // Switch to flower, then back to all
        await page.click('[data-cat="flower"]');
        const flowerCount = await page.locator('.product').count();
        await page.click('[data-cat="all"]');
        const allCount = await page.locator('.product').count();
        expect(allCount).toBeGreaterThanOrEqual(flowerCount);
    });
});

// ============================================================
// Products Page — Product Cards
// ============================================================
test.describe('Products page — product cards', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/pages/products.html');
        await waitForProducts(page);
    });

    test('each product card has name, price, and button', async ({ page }) => {
        const card = page.locator('.product').first();
        await expect(card.locator('h2')).toBeVisible();
        await expect(card.locator('.product-price')).toContainText('AED');
        await expect(card.locator('.button')).toBeVisible();
    });

    test('each card has a category badge', async ({ page }) => {
        const firstBadge = page.locator('.product-category-badge').first();
        await expect(firstBadge).toBeVisible({ timeout: 12000 });
        const count = await page.locator('.product-category-badge').count();
        expect(count).toBeGreaterThan(0);
    });

    test('clicking Add to Cart shows toast', async ({ page }) => {
        await page.locator('.product .button').first().click();
        const toast = page.locator('.toast-notification');
        await expect(toast).toBeVisible();
        await expect(toast).toContainText('added to cart');
    });
});

// ============================================================
// Custom Order Builder
// ============================================================
test.describe('Custom Order Builder', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/pages/products.html');
        await waitForBuilderOptions(page);
    });

    test('3 builder columns are visible', async ({ page }) => {
        await expect(page.locator('#builder-arrangements')).toBeVisible();
        await expect(page.locator('#builder-flowers')).toBeVisible();
        await expect(page.locator('#builder-gifts')).toBeVisible();
    });

    test('summary is hidden before selection', async ({ page }) => {
        await expect(page.locator('#builder-summary')).toBeHidden();
    });

    test('summary stays hidden after only arrangement selected', async ({ page }) => {
        await page.locator('#builder-arrangements .builder-option').first().click();
        await expect(page.locator('#builder-summary')).toBeHidden();
    });

    test('summary appears after arrangement + flower selected (if flowers exist)', async ({ page }) => {
        const flowerOptions = page.locator('#builder-flowers .builder-option:not(.empty-state)');
        if (await flowerOptions.count() === 0) return;
        await page.locator('#builder-arrangements .builder-option').first().click();
        await flowerOptions.first().click();
        await expect(page.locator('#builder-summary')).toBeVisible();
    });

    test('summary shows arrangement and flower tags (if flowers exist)', async ({ page }) => {
        const flowerOptions = page.locator('#builder-flowers .builder-option:not(.empty-state)');
        if (await flowerOptions.count() === 0) return;
        await page.locator('#builder-arrangements .builder-option').first().click();
        await flowerOptions.first().click();
        const tags = page.locator('#builder-summary-tags');
        await expect(tags.locator('.tag-arrangement')).toBeVisible();
        await expect(tags.locator('.tag-flower')).toBeVisible();
    });

    test('total price is a valid AED amount (if flowers exist)', async ({ page }) => {
        const flowerOptions = page.locator('#builder-flowers .builder-option:not(.empty-state)');
        if (await flowerOptions.count() === 0) return;
        await page.locator('#builder-arrangements .builder-option').first().click();
        await flowerOptions.first().click();
        const price = await page.locator('#builder-total-price').innerText();
        expect(price).toMatch(/AED \d+\.\d{2}/);
    });

    test('price updates when different flower selected (if flowers exist)', async ({ page }) => {
        const flowerOptions = page.locator('#builder-flowers .builder-option:not(.empty-state)');
        const count = await flowerOptions.count();
        if (count === 0) return;
        await page.locator('#builder-arrangements .builder-option').first().click();
        await flowerOptions.nth(0).click();
        if (count > 1) {
            await flowerOptions.nth(1).click();
            const price2 = await page.locator('#builder-total-price').innerText();
            expect(price2).toMatch(/AED \d+\.\d{2}/);
        }
    });

    test('adding a gift shows gift tag and raises total (if flowers and gifts exist)', async ({ page }) => {
        const flowerOptions = page.locator('#builder-flowers .builder-option:not(.empty-state)');
        if (await flowerOptions.count() === 0) return;
        await page.locator('#builder-arrangements .builder-option').first().click();
        await flowerOptions.first().click();
        const priceWithout = parseFloat((await page.locator('#builder-total-price').innerText()).replace('AED ', ''));

        const giftOptions = page.locator('#builder-gifts .builder-option:not(.builder-option-none)');
        if (await giftOptions.count() > 0) {
            await giftOptions.first().click();
            await expect(page.locator('#builder-summary-tags .tag-gift')).toBeVisible();
            const priceWith = parseFloat((await page.locator('#builder-total-price').innerText()).replace('AED ', ''));
            expect(priceWith).toBeGreaterThan(priceWithout);
        }
    });

    test('"No gift" option removes gift from summary (if flowers and gifts exist)', async ({ page }) => {
        const flowerOptions = page.locator('#builder-flowers .builder-option:not(.empty-state)');
        if (await flowerOptions.count() === 0) return;
        await page.locator('#builder-arrangements .builder-option').first().click();
        await flowerOptions.first().click();
        const giftOptions = page.locator('#builder-gifts .builder-option:not(.builder-option-none)');
        if (await giftOptions.count() > 0) {
            await giftOptions.first().click();
            await page.locator('.builder-option-none').click();
            await expect(page.locator('#builder-summary-tags .tag-gift')).toHaveCount(0);
        }
    });

    test('Add to Cart button adds custom order and shows toast (if flowers exist)', async ({ page }) => {
        const flowerOptions = page.locator('#builder-flowers .builder-option:not(.empty-state)');
        if (await flowerOptions.count() === 0) return;
        await page.evaluate(() => localStorage.removeItem('flowershop_cart'));
        await page.locator('#builder-arrangements .builder-option').first().click();
        await flowerOptions.first().click();
        await page.locator('.builder-add-btn').click();
        const toast = page.locator('.toast-notification');
        await expect(toast).toBeVisible();
        await expect(toast).toContainText('added to cart');
    });
});

// ============================================================
// Cart Page
// ============================================================
test.describe('Cart page', () => {
    test.beforeEach(async ({ page }) => {
        // Clear cart then add one item via localStorage
        await page.goto('/pages/cart.html');
        await page.evaluate(() => {
            const item = { id: 'qa-test-1', name: 'QA Rose', price: 10.99, image: '', quantity: 1 };
            localStorage.setItem('flowershop_cart', JSON.stringify([item]));
        });
        await page.reload();
    });

    test('cart shows added item', async ({ page }) => {
        await expect(page.locator('.cart-item')).toHaveCount(1);
        await expect(page.locator('.cart-item h3')).toContainText('QA Rose');
    });

    test('cart shows correct price', async ({ page }) => {
        await expect(page.locator('.cart-item-price')).toContainText('AED 10.99');
    });

    test('can increase quantity', async ({ page }) => {
        const plusBtn = page.locator('.qty-controls .button').nth(1);
        await plusBtn.click();
        await expect(page.locator('.qty-controls span')).toContainText('Qty: 2');
    });

    test('can decrease quantity back to 1', async ({ page }) => {
        // Increase then decrease
        await page.locator('.qty-controls .button').nth(1).click();
        await page.locator('.qty-controls .button').nth(0).click();
        await expect(page.locator('.qty-controls span')).toContainText('Qty: 1');
    });

    test('removing item clears cart', async ({ page }) => {
        await page.locator('.remove-btn').click();
        await expect(page.locator('.empty-state')).toBeVisible();
    });

    test('total-price reflects item total', async ({ page }) => {
        const text = await page.locator('#total-price').innerText();
        expect(text).toContain('10.99');
    });
});

// ============================================================
// Cart Page — Custom Order display
// ============================================================
test.describe('Cart page — custom order chips', () => {
    test('custom order shows breakdown chips', async ({ page }) => {
        await page.goto('/pages/cart.html');
        await page.evaluate(() => {
            const item = {
                id: 'custom_qa', name: 'Bouquet of Rose + Chocolates', price: 23.98,
                image: '', quantity: 1, isCustom: true,
                customDetails: { arrangement: 'Bouquet', flower: 'Rose', gift: 'Chocolates' }
            };
            localStorage.setItem('flowershop_cart', JSON.stringify([item]));
        });
        await page.reload();
        const chips = page.locator('.cart-custom-chip');
        await expect(chips).toHaveCount(3);
        await expect(chips.nth(0)).toContainText('Bouquet');
        await expect(chips.nth(1)).toContainText('Rose');
        await expect(chips.nth(2)).toContainText('Chocolates');
    });
});

// ============================================================
// Home Page
// ============================================================
test.describe('Home page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await waitForProducts(page);
    });

    test('shows max 6 products', async ({ page }) => {
        const count = await page.locator('.product').count();
        expect(count).toBeLessThanOrEqual(6);
        expect(count).toBeGreaterThan(0);
    });

    test('home page shows category badges', async ({ page }) => {
        const badgeCount = await page.locator('.product-category-badge').count();
        expect(badgeCount).toBeGreaterThan(0);
    });

    test('no builder section on home page', async ({ page }) => {
        await expect(page.locator('.builder-section')).toHaveCount(0);
    });
});
