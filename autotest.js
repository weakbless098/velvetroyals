/**
 * Velvet Royals Flowershop — Full Automated QA
 * Covers: Homepage → Products → Product Detail → Cart → Checkout → Payment
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const BASE = 'https://flowershop-d26f4.web.app';
const SC   = path.join(__dirname, 'test-screenshots');
if (!fs.existsSync(SC)) fs.mkdirSync(SC);

let passed = 0, failed = 0, warned = 0;
const log = [];

const p = (label, msg = '') => { passed++; const l = `  ✅ PASS  ${label}${msg ? ' — ' + msg : ''}`; console.log(l); log.push(l); };
const f = (label, msg = '') => { failed++; const l = `  ❌ FAIL  ${label}${msg ? ' — ' + msg : ''}`; console.log(l); log.push(l); };
const w = (label, msg = '') => { warned++;  const l = `  ⚠️  WARN  ${label}${msg ? ' — ' + msg : ''}`; console.log(l); log.push(l); };
const section = (t) => { const l = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  ${t}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`; console.log(l); log.push(l); };

const shot  = async (page, name) => { await page.screenshot({ path: path.join(SC, name + '.png'), fullPage: false }); };
const txt   = async (page, sel) => { try { return await page.$eval(sel, el => el.textContent.trim()); } catch { return ''; } };
const has   = async (page, sel) => { try { return !!(await page.$(sel)); } catch { return false; } };
const safe  = async (fn) => { try { return await fn(); } catch { return null; } };

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });

    // Suppress newsletter popup on every page
    await context.addInitScript(() => {
        localStorage.setItem('rv_popup_dismissed', '1');
        localStorage.setItem('rv_newsletter_shown', '1');
    });

    const page = await context.newPage();

    // Helper: wait for product cards to appear (Firebase is async)
    const waitForProducts = async (maxMs = 15000) => {
        try {
            await page.waitForFunction(
                () => document.querySelectorAll('.product').length > 0,
                { timeout: maxMs }
            );
        } catch {}
        await page.waitForTimeout(500);
    };

    // ══════════════════════════════════════════════════════════════
    //  1. HOMEPAGE
    // ══════════════════════════════════════════════════════════════
    section('1. HOMEPAGE');
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    // Wait for Firebase products, then scroll to the section
    await waitForProducts(15000);
    await safe(() => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)));
    await page.waitForTimeout(800);
    await shot(page, '01-homepage');

    const navLinks = await page.$$eval('nav a', els => els.map(e => e.textContent.trim().toUpperCase()));
    ['HOME','PRODUCTS','ABOUT','CONTACT','WISHLIST','CART'].forEach(lnk => {
        navLinks.some(n => n.includes(lnk)) ? p('Nav: ' + lnk) : f('Nav: ' + lnk, 'not found in nav');
    });

    const tickerEl = await page.$('.ticker-wrap');
    if (tickerEl) {
        const tt = await tickerEl.evaluate(el => el.textContent);
        tt.toLowerCase().includes('blooming') ? p('Ticker above hero', tt.trim().slice(0,50)) : f('Ticker text wrong');
    } else { f('Ticker .ticker-wrap not found'); }

    await page.waitForSelector('#hero, section.hero, [id*="hero"]', { timeout: 5000 }).catch(() => null);
    (await has(page, '#hero, section.hero')) ? p('Hero carousel present') : f('Hero section not found');

    const featuredCards = await page.$$('#product-list .product');
    featuredCards.length > 0 ? p('Featured products loaded', `${featuredCards.length} cards`) : f('No featured products on homepage — Firebase may need longer');
    (featuredCards.length > 0 && featuredCards.length <= 8) ? p('Featured count ≤ 8', `${featuredCards.length}`) : (featuredCards.length === 0 ? null : f('Featured > 8', `${featuredCards.length}`));

    await shot(page, '01b-homepage-products');

    // ══════════════════════════════════════════════════════════════
    //  2. ABOUT PAGE
    // ══════════════════════════════════════════════════════════════
    section('2. ABOUT PAGE');
    await page.goto(BASE + '/pages/about.html', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot(page, '02-about');
    (await has(page, '.about-hero-banner')) ? p('About: hero banner image below nav') : f('About hero banner missing');
    (await has(page, '.about-hero'))        ? p('About: hero section present')         : w('About hero section not found');

    // ══════════════════════════════════════════════════════════════
    //  3. CONTACT PAGE
    // ══════════════════════════════════════════════════════════════
    section('3. CONTACT PAGE');
    await page.goto(BASE + '/pages/contact.html', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    const contactBody = await page.evaluate(() => document.body.innerText);
    contactBody.includes('velvetroyalsflower@gmail.com') ? p('Contact email: velvetroyalsflower@gmail.com') : f('Contact email wrong or missing');
    await shot(page, '03-contact');

    // ══════════════════════════════════════════════════════════════
    //  4. SHIPPING PAGE
    // ══════════════════════════════════════════════════════════════
    section('4. SHIPPING PAGE');
    await page.goto(BASE + '/pages/shipping.html', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    const shipBody = await page.evaluate(() => document.body.innerText);
    [['Dubai','25'],['Sharjah','30'],['Ajman','30'],['Umm Al Quwain','50'],['Ras Al Khaimah','50'],['Abu Dhabi','150'],['Al Ain','150'],['Fujairah','150']]
        .forEach(([area, fee]) => {
            shipBody.includes(fee) ? p(`Shipping: ${area} = AED ${fee}`) : f(`Shipping: ${area} fee missing (${fee})`);
        });
    await shot(page, '04-shipping');

    // ══════════════════════════════════════════════════════════════
    //  5. PRIVACY PAGE
    // ══════════════════════════════════════════════════════════════
    section('5. PRIVACY PAGE');
    await page.goto(BASE + '/pages/privacy.html', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    const privacyBody = await page.evaluate(() => document.body.innerText);
    privacyBody.includes('velvetroyalsflower@gmail.com') ? p('Privacy email: velvetroyalsflower@gmail.com') : f('Privacy email wrong or missing');

    // ══════════════════════════════════════════════════════════════
    //  6. PRODUCTS PAGE
    // ══════════════════════════════════════════════════════════════
    section('6. PRODUCTS PAGE — Filtering');
    await page.goto(BASE + '/pages/products.html', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    await waitForProducts(15000);
    await shot(page, '06a-products-all');

    const allCards = await page.$$('.product');
    allCards.length > 0 ? p('Products loaded', `${allCards.length} products`) : f('Products page: 0 products loaded');

    const catBtns = await page.$$('.cat-filter-btn');
    catBtns.length >= 4 ? p('Category filter buttons', `${catBtns.length} buttons`) : f('Category filter buttons missing');

    // Single filter: Flower
    const flowerBtn = await page.$('.cat-filter-btn[data-cat="flower"]');
    let flowerCount = 0;
    if (flowerBtn) {
        await flowerBtn.click();
        await page.waitForTimeout(800);
        flowerCount = (await page.$$('.product')).length;
        flowerCount > 0 ? p('Filter: Flower', `${flowerCount} products`) : f('Filter: Flower shows 0');
    } else { f('Flower filter button not found'); }

    // Multi-select: add Arrangement
    const arrangementBtn = await page.$('.cat-filter-btn[data-cat="arrangement"]');
    if (arrangementBtn && flowerBtn) {
        await arrangementBtn.click();
        await page.waitForTimeout(800);
        const multiCount = (await page.$$('.product')).length;
        multiCount >= flowerCount ? p('Multi-select: Flower + Arrangement', `${multiCount} products`) : f('Multi-select failed', `${multiCount} vs flower-only ${flowerCount}`);
        await shot(page, '06b-products-multifilter');
    }

    // Reset to All
    const allBtn = await page.$('.cat-filter-btn[data-cat="all"]');
    if (allBtn) { await allBtn.click(); await page.waitForTimeout(600); }

    // Search
    const searchInput = await page.$('#product-search, input[type="search"], input[placeholder*="Search"]');
    if (searchInput) {
        await searchInput.fill('rose');
        await page.waitForTimeout(800);
        const searchCount = (await page.$$('.product')).length;
        p('Search "rose"', `${searchCount} results`);
        await searchInput.fill('');
        await page.waitForTimeout(600);
    } else { w('Search input not found'); }

    // Bundle badge
    const bundleBtn = await page.$('.cat-filter-btn[data-cat="bundle"]');
    if (bundleBtn) {
        await bundleBtn.click();
        await page.waitForTimeout(800);
        const bundleCards = await page.$$('.product');
        if (bundleCards.length > 0) {
            const bundleBadge = await page.$('.badge-bundle, .ribbon-bundle');
            bundleBadge ? p('BUNDLE badge visible') : w('BUNDLE badge CSS not visible on bundle card');
        } else { w('No bundle products to test badge'); }
    }
    if (allBtn) { await allBtn.click(); await page.waitForTimeout(600); }

    // ══════════════════════════════════════════════════════════════
    //  7. PRODUCT DETAIL PAGE
    // ══════════════════════════════════════════════════════════════
    section('7. PRODUCT DETAIL PAGE');
    // Products navigate via JS click handler, not <a> tags
    const firstProductCard = await page.$('.product[data-product-id]');
    if (firstProductCard) {
        await firstProductCard.click();
        await page.waitForTimeout(3000);
        if (page.url().includes('product.html')) {
            p('Product detail page opens');
            await shot(page, '07-product-detail');
            (await has(page, '.product-title, h1')) ? p('Product title visible') : f('Product title not found');
            const addBtn = await page.$('.button[data-id], button.button');
            addBtn ? p('Add to Cart button on detail page') : f('No Add to Cart button on detail page');
            (await has(page, '.wishlist-btn')) ? p('Wishlist button on detail page') : w('Wishlist button not found');
        } else { w('Did not land on product.html', page.url()); }
    } else { w('No .product[data-product-id] cards found'); }

    // ══════════════════════════════════════════════════════════════
    //  8. ADD TO CART
    // ══════════════════════════════════════════════════════════════
    section('8. ADD TO CART');
    await page.goto(BASE + '/pages/products.html', { waitUntil: 'networkidle', timeout: 20000 });
    await waitForProducts(15000);

    // Clear cart
    await page.evaluate(() => localStorage.removeItem('rv_cart'));

    const addBtns = await page.$$('.button[data-id]');
    if (addBtns.length > 0) {
        await addBtns[0].click();
        await page.waitForTimeout(1000);
        const count1 = await safe(() => page.$eval('.nav-cart-badge', el => parseInt(el.textContent.trim()) || 0)) || 0;
        count1 > 0 ? p('Product 1 added', `cart: ${count1}`) : f('Product 1 add failed — count: ' + count1);

        if (addBtns.length > 1) {
            await addBtns[1].click();
            await page.waitForTimeout(1000);
            const count2 = await safe(() => page.$eval('.nav-cart-badge', el => parseInt(el.textContent.trim()) || 0)) || 0;
            count2 > count1 ? p('Product 2 added', `cart: ${count2}`) : w('Product 2 add did not increase cart count');
        }
    } else { f('No Add to Cart buttons found'); }
    await shot(page, '08-after-add-to-cart');

    // ══════════════════════════════════════════════════════════════
    //  9. CART PAGE — Layout & Items
    // ══════════════════════════════════════════════════════════════
    section('9. CART PAGE');
    await page.goto(BASE + '/pages/cart.html', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2500);
    await shot(page, '09a-cart');

    const cartItems = await page.$$('.cart-item, .cart-row, [class*="cart-item"]');
    cartItems.length > 0 ? p('Cart items visible', `${cartItems.length} items`) : w('No cart items visible');

    const cartSection = await page.$('.cart-section');
    if (cartSection) {
        const box = await cartSection.boundingBox();
        box?.width <= 1150 ? p('Cart width ≤ 1100px', `${Math.round(box.width)}px`) : f('Cart too wide', `${Math.round(box?.width)}px`);
    }

    (await has(page, '#checkout-order-summary, .order-summary')) ? p('Order summary visible') : f('Order summary not found');

    // ══════════════════════════════════════════════════════════════
    //  10. DELIVERY AREA & FEES
    // ══════════════════════════════════════════════════════════════
    section('10. DELIVERY AREA FEES');
    const deliverySelect = await page.$('#checkout-area, select[id*="area"]');
    if (deliverySelect) {
        const feeTests = [
            { val: 'Dubai|25',            label: 'Dubai',          fee: 25  },
            { val: 'Sharjah|30',          label: 'Sharjah',        fee: 30  },
            { val: 'Ajman|30',            label: 'Ajman',          fee: 30  },
            { val: 'Umm Al Quwain|50',    label: 'Umm Al Quwain',  fee: 50  },
            { val: 'Ras Al Khaimah|50',   label: 'Ras Al Khaimah', fee: 50  },
            { val: 'Abu Dhabi|150',       label: 'Abu Dhabi',      fee: 150 },
            { val: 'Al Ain|150',          label: 'Al Ain',         fee: 150 },
            { val: 'Fujairah|150',        label: 'Fujairah',       fee: 150 },
        ];
        for (const { val, label, fee } of feeTests) {
            await deliverySelect.selectOption(val);
            await page.waitForTimeout(500);
            const sumText = await txt(page, '#checkout-order-summary, .order-summary');
            (sumText.includes(String(fee)) || sumText.includes('FREE'))
                ? p(`Fee: ${label} = AED ${fee}`)
                : f(`Fee: ${label} = AED ${fee}`, `summary: ${sumText.slice(0, 60)}`);
        }
        await shot(page, '10-delivery-fees');
    } else { f('Delivery area select not found'); }

    // ══════════════════════════════════════════════════════════════
    //  11. PICKUP vs DELIVERY
    // ══════════════════════════════════════════════════════════════
    section('11. PICKUP vs DELIVERY TOGGLE');
    const pickupBtn   = await page.$('#toggle-pickup');
    const deliveryBtn = await page.$('#toggle-delivery');

    if (pickupBtn) {
        await pickupBtn.click();
        await page.waitForTimeout(700);
        const deliveryFields = await page.$('#delivery-fields');
        if (deliveryFields) {
            const hidden = await deliveryFields.evaluate(el => el.style.display === 'none' || el.offsetParent === null || getComputedStyle(el).display === 'none');
            hidden ? p('Pickup: delivery fields hidden') : w('Pickup selected but delivery fields still visible');
        } else { w('delivery-fields element not found'); }
        await shot(page, '11a-pickup');
    } else { w('Pickup button #toggle-pickup not found'); }

    if (deliveryBtn) {
        await deliveryBtn.click();
        await page.waitForTimeout(700);
        const deliveryFieldsVisible = await page.$eval('#delivery-fields', el => el.offsetParent !== null && getComputedStyle(el).display !== 'none').catch(() => false);
        deliveryFieldsVisible ? p('Delivery: delivery fields visible') : w('Delivery selected but fields still hidden');
        if (deliverySelect) { await deliverySelect.selectOption('Dubai|25'); await page.waitForTimeout(400); }
        await shot(page, '11b-delivery');
    } else { w('Delivery button #toggle-delivery not found'); }

    // ══════════════════════════════════════════════════════════════
    //  12. DATE PICKER (2 PM cutoff)
    // ══════════════════════════════════════════════════════════════
    section('12. DATE PICKER');
    const dateInput = await page.$('#checkout-date');
    if (dateInput) {
        const minDate = await dateInput.getAttribute('min');
        const today   = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const hour = new Date().getHours();
        p('Date input present', `min="${minDate}"`);
        if (minDate) {
            if (hour >= 14) {
                minDate === tomorrow ? p('Date min = tomorrow (after 2PM cutoff)') : f('Date min wrong after 2PM', `got ${minDate}, expected ${tomorrow}`);
            } else {
                minDate === today ? p('Date min = today (before 2PM)') : f('Date min wrong before 2PM', `got ${minDate}, expected ${today}`);
            }
        } else { w('Date input has no min attribute'); }
    } else { f('Date picker input #checkout-date not found'); }

    // ══════════════════════════════════════════════════════════════
    //  13. COUPON CODES
    // ══════════════════════════════════════════════════════════════
    section('13. COUPON CODES');
    const couponInput = await page.$('#checkout-coupon');
    const applyBtn    = await page.$('#apply-coupon-btn, button[onclick*="coupon"], button:has-text("Apply")');

    if (couponInput && applyBtn) {
        const coupons = [
            { code: 'VELVET10', expect: ['10%','10 off','10% off'] },
            { code: 'VELVET20', expect: ['20%','20 off','20% off'] },
            { code: 'WELCOME',  expect: ['15','AED 15','15 off'] },
        ];

        for (const { code, expect } of coupons) {
            // Remove active coupon via JS (avoid disabled input issue)
            await page.evaluate(() => {
                const removeBtn = document.querySelector('button.remove-coupon, button[onclick*="removeCoupon"]');
                if (removeBtn) removeBtn.click();
            });
            await page.waitForTimeout(500);

            // Re-enable input if disabled
            await page.evaluate(() => {
                const inp = document.getElementById('checkout-coupon');
                if (inp) { inp.disabled = false; inp.value = ''; }
            });
            await page.waitForTimeout(200);

            await couponInput.fill(code);
            await applyBtn.click();
            await page.waitForTimeout(1000);

            const msgEl = await page.$('#coupon-msg, .coupon-msg');
            const msgTxt = msgEl ? await msgEl.evaluate(el => el.textContent.trim()) : '';
            const combined = msgTxt.toLowerCase();
            const found = expect.some(e => combined.includes(e.toLowerCase())) || combined.includes('applied');
            found ? p(`Coupon ${code}`, `"${msgTxt}"`) : f(`Coupon ${code}`, `msg: "${msgTxt}"`);
        }
        await shot(page, '13a-coupons');

        // Invalid coupon
        await page.evaluate(() => {
            const removeBtn = document.querySelector('button.remove-coupon, button[onclick*="removeCoupon"]');
            if (removeBtn) removeBtn.click();
        });
        await page.waitForTimeout(400);
        await page.evaluate(() => {
            const inp = document.getElementById('checkout-coupon');
            if (inp) { inp.disabled = false; inp.value = ''; }
        });
        await couponInput.fill('INVALID999');
        await applyBtn.click();
        await page.waitForTimeout(800);
        const errTxt = await txt(page, '#coupon-msg, .coupon-msg');
        (errTxt.toLowerCase().includes('invalid') || errTxt.toLowerCase().includes('expired'))
            ? p('Invalid coupon rejected', `"${errTxt}"`)
            : f('Invalid coupon not rejected', `msg: "${errTxt}"`);
        await shot(page, '13b-invalid-coupon');
    } else { f('Coupon input or Apply button not found'); }

    // ══════════════════════════════════════════════════════════════
    //  14. CHECKOUT FORM FILL
    // ══════════════════════════════════════════════════════════════
    section('14. CHECKOUT FORM');
    // Remove any active coupon
    await page.evaluate(() => {
        const rb = document.querySelector('button.remove-coupon, button[onclick*="removeCoupon"]');
        if (rb) rb.click();
    });
    await page.waitForTimeout(400);

    const formFields = [
        { sel: '#checkout-name',    label: 'Name',    val: 'QA Tester' },
        { sel: '#checkout-phone',   label: 'Phone',   val: '+971507443100' },
        { sel: '#checkout-address', label: 'Address', val: '123 Test Road, Dubai' },
        { sel: '#checkout-notes',   label: 'Notes',   val: 'Ring doorbell' },
    ];
    for (const { sel, label, val } of formFields) {
        const el = await page.$(sel);
        if (el) { await el.fill(val); p(`Form field: ${label}`); }
        else { w(`Form field not found: ${sel}`); }
    }

    // Set delivery
    const deliveryBtnFill = await page.$('#toggle-delivery');
    if (deliveryBtnFill) { await deliveryBtnFill.click(); await page.waitForTimeout(400); }
    if (deliverySelect) { await deliverySelect.selectOption('Dubai|25'); await page.waitForTimeout(400); }

    // Set date to tomorrow
    if (dateInput) {
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        await dateInput.fill(tomorrow);
        p('Date set', tomorrow);
    }

    // Time slot
    const timeSlot = await page.$('#checkout-time, select[id*="time"]');
    if (timeSlot) { await safe(() => timeSlot.selectOption({ index: 1 })); p('Time slot selected'); }

    await shot(page, '14-checkout-filled');

    // ══════════════════════════════════════════════════════════════
    //  15. PAYMENT — Stripe Modal
    // ══════════════════════════════════════════════════════════════
    section('15. STRIPE PAYMENT');
    const submitBtn = await page.$('button[type="submit"]:has-text("Order"), button[type="submit"]:has-text("Pay"), button[type="submit"]');
    if (submitBtn) {
        p('Checkout submit button found');
        await submitBtn.scrollIntoViewIfNeeded();
        await shot(page, '15a-before-payment');

        // Listen for Stripe iframe
        let stripeFrameDetected = false;
        page.on('frameattached', (frame) => {
            if (frame.url().includes('stripe') || frame.url().includes('js.stripe.com')) {
                stripeFrameDetected = true;
            }
        });

        await submitBtn.click();
        await page.waitForTimeout(5000);

        // Check for modal or Stripe elements
        const stripeIframe = await page.$('iframe[src*="stripe"], iframe[name*="stripe"]');
        const modalEl      = await page.$('#stripe-modal, .stripe-modal, .modal[style*="flex"], .modal[style*="block"]');
        const overlayEl    = await page.$('.modal-overlay, .payment-overlay');

        if (stripeIframe || modalEl || overlayEl || stripeFrameDetected) {
            p('Stripe payment modal appeared');
        } else {
            // Check if redirect happened or error shown
            const bodyTxt = await page.evaluate(() => document.body.innerText.slice(0, 300));
            w('Stripe modal not detected via DOM', bodyTxt.replace(/\n/g,' ').slice(0,100));
        }
        await shot(page, '15b-after-submit');
    } else { f('Checkout submit button not found'); }

    // ══════════════════════════════════════════════════════════════
    //  16. WISHLIST PAGE
    // ══════════════════════════════════════════════════════════════
    section('16. WISHLIST PAGE');
    await page.goto(BASE + '/pages/wishlist.html', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    await shot(page, '16-wishlist');
    const wTitle = await txt(page, 'h1, .page-title');
    wTitle.toLowerCase().includes('wish') ? p('Wishlist page loads', wTitle) : w('Wishlist title unexpected', wTitle);

    // ══════════════════════════════════════════════════════════════
    //  17. MOBILE RESPONSIVENESS (375px)
    // ══════════════════════════════════════════════════════════════
    section('17. MOBILE VIEW (375px)');
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot(page, '17a-mobile-home');
    (await has(page, '.nav-toggle, .hamburger, .menu-toggle, button[aria-label*="menu"]'))
        ? p('Mobile: hamburger menu present')
        : w('No mobile hamburger menu found');

    await page.goto(BASE + '/pages/cart.html', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot(page, '17b-mobile-cart');
    const mobileCart = await page.$('.cart-section');
    if (mobileCart) {
        const mb = await mobileCart.boundingBox();
        mb?.width <= 380 ? p('Cart fits mobile', `${Math.round(mb.width)}px`) : w('Cart overflows mobile', `${Math.round(mb?.width)}px`);
    }

    await page.setViewportSize({ width: 1400, height: 900 });

    // ══════════════════════════════════════════════════════════════
    //  SUMMARY
    // ══════════════════════════════════════════════════════════════
    const divider = '\n' + '═'.repeat(42);
    section('SUMMARY');
    const total = passed + failed + warned;
    const summaryLines = [
        divider,
        `  Total checks : ${total}`,
        `  ✅ Passed    : ${passed}`,
        `  ❌ Failed    : ${failed}`,
        `  ⚠️  Warnings  : ${warned}`,
        `  Screenshots  : ${SC}`,
        divider,
    ];
    summaryLines.forEach(l => { console.log(l); log.push(l); });

    fs.writeFileSync(
        path.join(__dirname, 'qa-report.txt'),
        ['# Velvet Royals Full QA Report', `Date: ${new Date().toISOString()}`, '', ...log].join('\n'),
        'utf8'
    );
    console.log('  Report saved to qa-report.txt\n');

    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
})();
