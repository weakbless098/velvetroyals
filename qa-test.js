const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://flowershop-d26f4.web.app';
const SHOTS = path.join(__dirname, 'qa-screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let shotIdx = 0;

async function shot(page, label) {
  const file = path.join(SHOTS, `${String(shotIdx++).padStart(3,'0')}-${label.replace(/[^a-z0-9]/gi,'_')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

function log(status, feature, detail) {
  const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️', PROBE: '🔍' }[status] || '•';
  console.log(`${icon} [${feature}] ${detail}`);
  results.push({ status, feature, detail });
}

async function dismissPopups(page) {
  await page.evaluate(() => {
    const popup = document.getElementById('email-popup');
    if (popup) popup.style.display = 'none';
    const warn = document.getElementById('session-warn-modal');
    if (warn) warn.style.display = 'none';
    // Prevent popup from reappearing on scroll during the test session
    try { localStorage.setItem('rv_popup_dismissed', '1'); } catch {}
  });
  await page.waitForTimeout(300);
}

async function waitForProducts(page, timeout = 10000) {
  try {
    await page.waitForFunction(() => {
      const list = document.getElementById('product-list');
      return list && list.querySelectorAll('.product').length > 0;
    }, { timeout });
    return true;
  } catch { return false; }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124'
  });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  // ══════════════════════════════════════════════
  // 1. HOMEPAGE
  // ══════════════════════════════════════════════
  console.log('\n── 1. HOMEPAGE ──');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await dismissPopups(page);

  const heroActive = await page.$('.hero-carousel-slide.active');
  log(heroActive ? 'PASS' : 'FAIL', 'Hero carousel - active slide', heroActive ? 'Found' : 'Missing');

  const nextBtn = await page.$('.hero-carousel-next');
  if (nextBtn) {
    await nextBtn.click({ force: true });
    await page.waitForTimeout(1200);
    log('PASS', 'Hero carousel - next arrow', 'Clicked without crash');
  } else {
    log('FAIL', 'Hero carousel - next arrow', 'Button not found');
  }

  const dots = await page.$$('.hero-dot');
  log(dots.length > 0 ? 'PASS' : 'FAIL', 'Hero carousel - dots', `${dots.length} dots`);
  if (dots.length > 1) {
    await dots[0].click({ force: true });
    await page.waitForTimeout(600);
    log('PASS', 'Hero carousel - dot click', 'Dot 1 clicked');
  }

  const ticker = await page.$('.ticker-track');
  log(ticker ? 'PASS' : 'FAIL', 'Homepage - ticker', ticker ? 'Present' : 'Missing');

  const collCards = await page.$$('.collection-card');
  log(collCards.length > 0 ? 'PASS' : 'FAIL', 'Homepage - collections', `${collCards.length} cards`);

  const prodsLoaded = await waitForProducts(page);
  const prodCount = await page.$$eval('.product', els => els.length).catch(() => 0);
  log(prodsLoaded ? 'PASS' : 'FAIL', 'Homepage - featured products', `${prodCount} loaded from Firebase`);

  await page.waitForTimeout(1500);
  const reviewCards = await page.$$('.review-card');
  log(reviewCards.length > 0 ? 'PASS' : 'WARN', 'Homepage - reviews', `${reviewCards.length} review cards`);

  const writeReviewBtn = await page.$('button[onclick*="openReviewModal"], button[onclick*="reviewsModule"]');
  log(writeReviewBtn ? 'PASS' : 'WARN', 'Homepage - write review button', writeReviewBtn ? 'Present' : 'Not found');

  await shot(page, 'homepage');

  // ══════════════════════════════════════════════
  // 2. PRODUCTS PAGE
  // ══════════════════════════════════════════════
  console.log('\n── 2. PRODUCTS PAGE ──');
  await page.goto(`${BASE}/pages/products.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await dismissPopups(page);

  const allProds = await waitForProducts(page);
  const totalProds = await page.$$eval('.product', els => els.length).catch(() => 0);
  log(allProds ? 'PASS' : 'FAIL', 'Products - grid loads', `${totalProds} products`);

  const flowerBtn = await page.$('.cat-filter-btn[data-cat="flower"]');
  if (flowerBtn) {
    await flowerBtn.click({ force: true });
    await page.waitForTimeout(800);
    const after = await page.$$eval('.product', els => els.length).catch(() => 0);
    const isActive = await flowerBtn.evaluate(el => el.classList.contains('active'));
    log(isActive ? 'PASS' : 'FAIL', 'Products - flower filter', `${after} shown, active: ${isActive}`);
  } else {
    log('FAIL', 'Products - flower filter', 'Button missing');
  }

  const arrBtn = await page.$('.cat-filter-btn[data-cat="arrangement"]');
  if (arrBtn) {
    await arrBtn.click({ force: true });
    await page.waitForTimeout(700);
    const atypeWrap = await page.$('#filter-atype-wrap');
    const display = atypeWrap ? await atypeWrap.evaluate(el => getComputedStyle(el).display) : 'missing';
    log(display !== 'none' && display !== 'missing' ? 'PASS' : 'FAIL', 'Products - arrangement sub-filter', `atype wrap: ${display}`);
  }

  const resetBtn = await page.$('#filter-reset-btn');
  if (resetBtn) {
    const vis = await resetBtn.evaluate(el => getComputedStyle(el).display);
    log(vis !== 'none' ? 'PASS' : 'WARN', 'Products - reset filter btn', `display: ${vis}`);
    await resetBtn.click({ force: true });
    await page.waitForTimeout(500);
  }

  const giftBtn = await page.$('.cat-filter-btn[data-cat="gift"]');
  if (giftBtn) {
    await giftBtn.click({ force: true });
    await page.waitForTimeout(700);
    const giftCount = await page.$$eval('.product', els => els.length).catch(() => 0);
    log('PASS', 'Products - gift filter', `${giftCount} results`);
  }

  const allBtn = await page.$('.cat-filter-btn[data-cat="all"]');
  if (allBtn) { await allBtn.click({ force: true }); await page.waitForTimeout(600); }

  const searchInput = await page.$('.products-search-input');
  if (searchInput) {
    await searchInput.fill('rose');
    await page.waitForTimeout(800);
    const searchRes = await page.$$eval('.product', els => els.length).catch(() => 0);
    log(true, 'Products - search "rose"', `${searchRes} results`);
    await searchInput.fill('');
    await page.waitForTimeout(400);
  } else {
    log('FAIL', 'Products - search bar', 'Input not found');
  }

  if (searchInput) {
    await searchInput.fill('ZZZZNOTEXIST');
    await page.waitForTimeout(600);
    const zeroRes = await page.$$eval('.product', els => els.length).catch(() => 0);
    const emptyState = await page.$('.empty-state');
    log(zeroRes === 0 ? 'PASS' : 'WARN', 'Products - search no results', `${zeroRes} products, empty state: ${!!emptyState}`);
    await searchInput.fill('');
    await page.waitForTimeout(400);
  }

  if (allBtn) { await allBtn.click({ force: true }); await page.waitForTimeout(600); }

  const wlBtn = await page.$('.wishlist-btn');
  if (wlBtn) {
    await wlBtn.click({ force: true });
    await page.waitForTimeout(700);
    const toast = await page.$('.toast-notification');
    const toastText = toast ? (await toast.textContent()).trim() : '';
    log(toast ? 'PASS' : 'WARN', 'Products - wishlist heart', `Toast: "${toastText}"`);
  } else {
    log('FAIL', 'Products - wishlist heart', 'Not found');
  }

  const cartBtn = await page.$('.product .button[data-id]');
  if (cartBtn) {
    await cartBtn.click({ force: true });
    await page.waitForTimeout(700);
    const toast = await page.$('.toast-notification');
    const toastText = toast ? (await toast.textContent()).trim() : '';
    log(toast ? 'PASS' : 'WARN', 'Products - add to cart', `"${toastText}"`);
  } else {
    log('FAIL', 'Products - add to cart', 'Button not found');
  }

  const cartBadge = await page.$('.nav-cart-badge');
  const badgeVal = cartBadge ? (await cartBadge.textContent()).trim() : '0';
  log(parseInt(badgeVal) > 0 ? 'PASS' : 'WARN', 'Products - cart badge', `Badge: ${badgeVal}`);

  await shot(page, 'products-page');

  // ══════════════════════════════════════════════
  // 3. PRODUCT DETAIL PAGE
  // ══════════════════════════════════════════════
  console.log('\n── 3. PRODUCT DETAIL ──');
  await page.goto(`${BASE}/pages/products.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await waitForProducts(page, 10000);
  await page.waitForTimeout(1000);
  await dismissPopups(page);

  const firstCard = await page.$('.product[data-product-id]');
  if (firstCard) {
    const pid = await firstCard.getAttribute('data-product-id');
    await page.goto(`${BASE}/pages/product.html?id=${encodeURIComponent(pid)}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await dismissPopups(page);

    const pdName = await page.$('.pd-name');
    const pdNameText = pdName ? (await pdName.textContent()).trim() : '';
    log(pdNameText.length > 0 ? 'PASS' : 'FAIL', 'Product detail - name', pdNameText || 'Empty');

    const pdPrice = await page.$('.pd-price, .pd-price-wrap');
    log(pdPrice ? 'PASS' : 'FAIL', 'Product detail - price', pdPrice ? 'Found' : 'Missing');

    const pdDesc = await page.$('.pd-description, .pd-desc');
    log(pdDesc ? 'PASS' : 'WARN', 'Product detail - description', pdDesc ? 'Found' : 'Not found');

    const pdQty = await page.$('.pd-quantity');
    log(pdQty ? 'PASS' : 'WARN', 'Product detail - quantity badge', pdQty ? (await pdQty.textContent()).trim() : 'Not shown');

    const stemPills = await page.$$('.pd-stem-pill');
    log(true, 'Product detail - stem price pills', `${stemPills.length} pills`);

    const pdImg = await page.$('.pd-gallery img, .pd-main-img');
    log(pdImg ? 'PASS' : 'FAIL', 'Product detail - image', pdImg ? 'Found' : 'Missing');

    const anyBtn = await page.$$('button.button, a.button, .pd-add-btn, button[onclick*="Cart"]');
    log(anyBtn.length > 0 ? 'PASS' : 'FAIL', 'Product detail - action button', `${anyBtn.length} button(s)`);

    await shot(page, 'product-detail');
  } else {
    log('FAIL', 'Product detail', 'No product cards found on products page');
  }

  // ══════════════════════════════════════════════
  // 4. CART PAGE
  // ══════════════════════════════════════════════
  console.log('\n── 4. CART PAGE ──');
  await page.goto(`${BASE}/pages/cart.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await dismissPopups(page);

  const cartItemEls = await page.$$('.cart-item');
  log(cartItemEls.length > 0 ? 'PASS' : 'WARN', 'Cart - items displayed', `${cartItemEls.length} items`);

  const freeBar = await page.$('#free-shipping-bar');
  log(freeBar ? 'PASS' : 'FAIL', 'Cart - delivery fee bar', freeBar ? 'Present' : 'Missing');

  if (cartItemEls.length > 0) {
    // qty controls: [− button] [Qty span] [+ button] [Remove button]
    const plusBtn = await page.$('.qty-controls button:nth-child(3)');
    if (plusBtn) {
      await plusBtn.click({ force: true });
      await page.waitForTimeout(600);
      log('PASS', 'Cart - qty + button', 'Clicked');
    } else {
      log('FAIL', 'Cart - qty + button', 'Not found');
    }
    const minusBtn = await page.$('.qty-controls button:first-child');
    if (minusBtn) {
      await minusBtn.click({ force: true });
      await page.waitForTimeout(500);
      log('PASS', 'Cart - qty - button', 'Clicked');
    } else {
      log('FAIL', 'Cart - qty - button', 'Not found');
    }
    const removeBtn = await page.$('.remove-btn');
    log(removeBtn ? 'PASS' : 'FAIL', 'Cart - remove button', removeBtn ? 'Present' : 'Not found');

    const totalPriceEl2 = await page.$('#total-price');
    const totalText2 = totalPriceEl2 ? (await totalPriceEl2.textContent()).trim() : 'missing';
    log(totalPriceEl2 ? 'PASS' : 'FAIL', 'Cart - subtotal display', totalText2);
  } else {
    log('WARN', 'Cart - qty/remove', 'No items to test');
  }

  if (freeBar) {
    const fill = await page.$('#free-shipping-fill');
    const fillWidth = fill ? await fill.evaluate(el => el.style.width) : 'unknown';
    log(fill ? 'PASS' : 'FAIL', 'Cart - shipping bar fill', `width: ${fillWidth}`);
  }

  await shot(page, 'cart-page');

  // ══════════════════════════════════════════════
  // 5. CHECKOUT FLOW
  // ══════════════════════════════════════════════
  console.log('\n── 5. CHECKOUT FLOW ──');
  const cartItemsNow = await page.$$('.cart-item');
  if (cartItemsNow.length === 0) {
    await page.goto(`${BASE}/pages/products.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForProducts(page, 10000);
    await page.waitForTimeout(800);
    await dismissPopups(page);
    const btn = await page.$('.product .button[data-id]');
    if (btn) { await btn.click({ force: true }); await page.waitForTimeout(600); }
    await page.goto(`${BASE}/pages/cart.html`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await dismissPopups(page);
  }

  const checkoutBtn = await page.$('a[href*="checkout"], .checkout-btn, .btn-checkout');
  if (checkoutBtn) {
    await checkoutBtn.click({ force: true });
    await page.waitForTimeout(2000);
    await dismissPopups(page);
    log('PASS', 'Checkout - navigation', `Now at: ${page.url()}`);
  } else {
    log('WARN', 'Checkout - navigation', 'No checkout button found on cart page');
  }

  const checkoutForm = await page.$('#checkout-form');
  log(checkoutForm ? 'PASS' : 'WARN', 'Checkout - form present', checkoutForm ? 'Found' : `URL: ${page.url()}`);

  if (checkoutForm) {
    const delivBtn = await page.$('#toggle-delivery');
    const pickupBtn = await page.$('#toggle-pickup');
    log(delivBtn && pickupBtn ? 'PASS' : 'FAIL', 'Checkout - delivery/pickup toggles', `delivery: ${!!delivBtn}, pickup: ${!!pickupBtn}`);

    if (pickupBtn) {
      await pickupBtn.click({ force: true });
      await page.waitForTimeout(600);
      const delivFields = await page.$('#delivery-fields');
      const display = delivFields ? await delivFields.evaluate(el => getComputedStyle(el).display) : 'missing';
      log(display === 'none' ? 'PASS' : 'FAIL', 'Checkout - pickup hides delivery fields', `display: ${display}`);
      if (delivBtn) { await delivBtn.click({ force: true }); await page.waitForTimeout(400); }
    }

    const areaEl = await page.$('#checkout-area');
    if (areaEl) {
      const opts = await areaEl.$$('option');
      if (opts.length > 1) {
        await areaEl.selectOption({ index: 1 });
        await page.waitForTimeout(500);
        const summaryEl = await page.$('#checkout-order-summary');
        const sumText = summaryEl ? (await summaryEl.textContent()).replace(/\s+/g,' ').trim() : '';
        log(sumText.includes('Delivery') || sumText.includes('AED') ? 'PASS' : 'WARN', 'Checkout - area → delivery fee', sumText.slice(0,80));
      }
    } else {
      log('WARN', 'Checkout - area dropdown', 'Not found');
    }

    const slotEl = await page.$('#checkout-timeslot');
    if (slotEl) {
      const slotOpts = await slotEl.$$('option');
      for (const opt of slotOpts) {
        const val = await opt.getAttribute('value');
        if (val && val.includes('|') && parseFloat(val.split('|')[1]) > 0) {
          await slotEl.selectOption({ value: val });
          await page.waitForTimeout(500);
          const sumEl = await page.$('#checkout-order-summary');
          const sumTxt = sumEl ? (await sumEl.textContent()).replace(/\s+/g,' ') : '';
          log('PASS', 'Checkout - timeslot surcharge', sumTxt.slice(0,100));
          break;
        }
      }
    }

    for (const code of ['VELVET10', 'VELVET20', 'WELCOME']) {
      if (code !== 'VELVET10') {
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1500);
        await dismissPopups(page);
      }
      const inp = await page.$('#checkout-coupon');
      const btn = await page.$('button[onclick*="applyCoupon"]');
      if (inp && btn) {
        const disabled = await inp.evaluate(el => el.disabled);
        if (!disabled) {
          await inp.fill(code);
          await btn.click({ force: true });
          await page.waitForTimeout(500);
          const msgEl = await page.$('#coupon-msg');
          const msgTxt = msgEl ? (await msgEl.textContent()).trim() : '';
          const isSuccess = msgEl ? await msgEl.evaluate(el => el.classList.contains('coupon-success')) : false;
          log(isSuccess ? 'PASS' : 'FAIL', `Checkout - coupon ${code}`, `"${msgTxt}"`);
        }
      }
    }

    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await dismissPopups(page);

    const sumEl = await page.$('#checkout-order-summary');
    const sumHtml = sumEl ? await sumEl.innerHTML() : '';
    log(sumHtml.includes('Total') && sumHtml.includes('AED') ? 'PASS' : 'FAIL', 'Checkout - order summary math', sumHtml.includes('Total') ? 'Total row present' : 'Missing Total');

    const nameEl2 = await page.$('#checkout-name');
    const phoneEl2 = await page.$('#checkout-phone');
    const emailEl2 = await page.$('#checkout-email');
    if (nameEl2) await nameEl2.fill('Test QA Customer');
    if (emailEl2) await emailEl2.fill('qa@test.com');
    if (phoneEl2) await phoneEl2.fill('+971501234567');

    const submitBtn = await page.$('#checkout-submit');
    log(submitBtn ? 'PASS' : 'FAIL', 'Checkout - submit button', submitBtn ? 'Present' : 'Missing');

    await shot(page, 'checkout-filled');
  }

  // ══════════════════════════════════════════════
  // 6. WISHLIST PAGE
  // ══════════════════════════════════════════════
  console.log('\n── 6. WISHLIST PAGE ──');
  await page.goto(`${BASE}/pages/wishlist.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await dismissPopups(page);

  const wlContainer = await page.$('#wishlist-items');
  log(wlContainer ? 'PASS' : 'FAIL', 'Wishlist - page loads', wlContainer ? 'Container found' : 'Missing');

  const wlCards = await page.$$('.wishlist-card');
  const wlEmpty = await page.$('.wishlist-empty');
  if (wlCards.length > 0) {
    log('PASS', 'Wishlist - items shown', `${wlCards.length} saved items`);
    const moveBtn = await page.$('.wishlist-card-cart');
    log(moveBtn ? 'PASS' : 'WARN', 'Wishlist - move to cart btn', moveBtn ? 'Present' : 'Missing');
    const removeHeart = await page.$('.wishlist-card-remove');
    log(removeHeart ? 'PASS' : 'WARN', 'Wishlist - remove heart btn', removeHeart ? 'Present' : 'Missing');
  } else if (wlEmpty) {
    log('PASS', 'Wishlist - empty state', 'Empty state shown correctly');
  } else {
    log('WARN', 'Wishlist - content', 'Neither items nor empty state found');
  }

  await shot(page, 'wishlist-page');

  // ══════════════════════════════════════════════
  // 7. ORDERS PAGE
  // ══════════════════════════════════════════════
  console.log('\n── 7. ORDERS PAGE ──');
  await page.goto(`${BASE}/pages/orders.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await dismissPopups(page);

  const guestPanel = await page.$('#orders-guest-lookup');
  const guestVis = guestPanel ? await guestPanel.evaluate(el => getComputedStyle(el).display) : 'missing';
  log(guestVis !== 'none' && guestVis !== 'missing' ? 'PASS' : 'FAIL', 'Orders - guest lookup panel visible', `display: ${guestVis}`);

  const guestInput = await page.$('#guest-order-id-input');
  log(guestInput ? 'PASS' : 'FAIL', 'Orders - guest order ID input', guestInput ? 'Found' : 'Missing');

  if (guestInput) {
    await guestInput.fill('FAKEORDERID999');
    const lookupBtn = await page.$('button[onclick*="lookupGuestOrder"]');
    if (lookupBtn) {
      await lookupBtn.click({ force: true });
      await page.waitForTimeout(2500);
      const resultEl = await page.$('#guest-lookup-result');
      const resultTxt = resultEl ? (await resultEl.textContent()).trim() : '';
      log(resultTxt.length > 0 ? 'PASS' : 'WARN', 'Orders - bad ID lookup response', `"${resultTxt.slice(0,80)}"`);
    } else {
      log('FAIL', 'Orders - lookup button', 'Not found');
    }
  }

  await shot(page, 'orders-guest');

  // ══════════════════════════════════════════════
  // 8. AUTH / LOGIN PAGE
  // ══════════════════════════════════════════════
  console.log('\n── 8. AUTH ──');
  await page.goto(`${BASE}/pages/login.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await dismissPopups(page);

  const emailInp = await page.$('input[type="email"]');
  const pwInp = await page.$('input[type="password"]');
  log(emailInp && pwInp ? 'PASS' : 'FAIL', 'Auth - login inputs', `email: ${!!emailInp}, pw: ${!!pwInp}`);

  if (emailInp && pwInp) {
    await emailInp.fill('wrong@example.com');
    await pwInp.fill('wrongpassword');
    const loginSubmit = await page.$('#login-submit, button[type="submit"]');
    if (loginSubmit) {
      await loginSubmit.click({ force: true });
      await page.waitForTimeout(3000);
      // Error message appears in #auth-message with class 'error'
      const errEl = await page.$('#auth-message.error');
      const errTxt = errEl ? (await errEl.textContent()).trim() : '';
      log(errEl && errTxt.length > 0 ? 'PASS' : 'WARN', 'Auth - bad credentials error', errTxt || 'No error shown yet');
    }
  }

  const guestBtn = await page.$('button[onclick*="continueAsGuest"]');
  log(guestBtn ? 'PASS' : 'WARN', 'Auth - continue as guest btn', guestBtn ? 'Found' : 'Not found');

  // Register tab is #tab-register with onclick="setTab('register')"
  const registerLink = await page.$('#tab-register');
  log(registerLink ? 'PASS' : 'WARN', 'Auth - register tab', registerLink ? 'Found' : 'Not found');

  await shot(page, 'login-page');

  // ══════════════════════════════════════════════
  // 9. ADMIN AUTH GUARD
  // ══════════════════════════════════════════════
  console.log('\n── 9. ADMIN AUTH GUARD ──');
  await page.goto(`${BASE}/pages/admin.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  const adminUrl = page.url();
  const redirected = adminUrl.includes('login');
  log(redirected ? 'PASS' : 'WARN', 'Admin - auth redirect', redirected ? `Redirected to: ${adminUrl}` : `Stayed at admin: ${adminUrl}`);

  await shot(page, 'admin-auth-guard');

  // ══════════════════════════════════════════════
  // 10. REVIEWS MODAL
  // ══════════════════════════════════════════════
  console.log('\n── 10. REVIEWS ──');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await dismissPopups(page);

  const reviewSection = await page.$('.reviews-section-wrap, #reviews');
  if (reviewSection) await reviewSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  const rvBtn = await page.$('button[onclick*="openReviewModal"], button[onclick*="reviewsModule.open"]');
  if (rvBtn) {
    await rvBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await rvBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const overlay = await page.$('#rv-review-overlay');
    log(overlay ? 'PASS' : 'FAIL', 'Reviews - modal opens', overlay ? 'Overlay created' : 'Not found');

    if (overlay) {
      const stars = await page.$$('.rv-star-pick-btn');
      log(stars.length === 5 ? 'PASS' : 'FAIL', 'Reviews - star picker', `${stars.length} stars`);

      if (stars.length >= 5) {
        await stars[4].click({ force: true });
        await page.waitForTimeout(300);
        const rvLabel = await page.$('#rv-rating-label');
        const lblTxt = rvLabel ? (await rvLabel.textContent()).trim() : '';
        log(lblTxt.length > 0 ? 'PASS' : 'WARN', 'Reviews - rating label', `"${lblTxt}"`);
      }

      const nameInput = await page.$('#rv-name-input');
      const textInput = await page.$('#rv-text-input');
      log(nameInput && textInput ? 'PASS' : 'FAIL', 'Reviews - form inputs', `name: ${!!nameInput}, text: ${!!textInput}`);

      if (textInput) {
        await textInput.fill('Short');
        const submitBtn = await page.$('#rv-submit-btn');
        if (submitBtn) {
          await submitBtn.click({ force: true });
          await page.waitForTimeout(400);
          const errEl = await page.$('#rv-review-error');
          const errTxt = errEl ? (await errEl.textContent()).trim() : '';
          log(errTxt.length > 0 ? 'PASS' : 'WARN', 'Reviews - validation (short text)', `Error: "${errTxt}"`);
        }
      }

      await shot(page, 'review-modal');

      const closeBtn = await page.$('.rv-review-close');
      if (closeBtn) { await closeBtn.click({ force: true }); await page.waitForTimeout(400); }
    }
  } else {
    log('WARN', 'Reviews - write review btn', 'Not visible on homepage');
  }

  // ══════════════════════════════════════════════
  // 11. MOBILE RESPONSIVENESS
  // ══════════════════════════════════════════════
  console.log('\n── 11. MOBILE ──');
  const mobilePage = await ctx.newPage();
  mobilePage.on('pageerror', e => jsErrors.push('MOBILE: ' + e.message));
  await mobilePage.setViewportSize({ width: 390, height: 844 });

  await mobilePage.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await mobilePage.waitForTimeout(2000);
  await mobilePage.evaluate(() => {
    const el = document.getElementById('email-popup');
    if (el) el.style.display = 'none';
  });
  await mobilePage.waitForTimeout(400);

  const burger = await mobilePage.$('.nav-burger, #nav-burger');
  const burgerVis = burger ? await burger.isVisible() : false;
  log(burgerVis ? 'PASS' : 'FAIL', 'Mobile - burger btn visible', burgerVis ? 'Visible at 390px' : 'Not visible');

  if (burger && burgerVis) {
    await burger.click({ force: true });
    await mobilePage.waitForTimeout(600);
    const navOpen = await mobilePage.$('nav.open, #main-nav.open, .nav-links.open');
    log(navOpen ? 'PASS' : 'FAIL', 'Mobile - burger opens nav', navOpen ? 'Nav opened' : 'Nav not opened');
    await shot(mobilePage, 'mobile-nav-open');

    await burger.click({ force: true });
    await mobilePage.waitForTimeout(600);
    const navStillOpen = await mobilePage.$('nav.open, #main-nav.open, .nav-links.open');
    log(!navStillOpen ? 'PASS' : 'FAIL', 'Mobile - burger closes nav', !navStillOpen ? 'Closed' : 'Still open');
  }

  await mobilePage.goto(`${BASE}/pages/products.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await waitForProducts(mobilePage, 10000);
  await mobilePage.waitForTimeout(800);
  await mobilePage.evaluate(() => { const el = document.getElementById('email-popup'); if (el) el.style.display = 'none'; });

  const mobileGrid = await mobilePage.$('#product-list');
  if (mobileGrid) {
    const cols = await mobileGrid.evaluate(el => getComputedStyle(el).gridTemplateColumns);
    log(cols.includes('px') ? 'PASS' : 'WARN', 'Mobile - product grid', `cols: ${cols.slice(0,80)}`);
  }
  await shot(mobilePage, 'mobile-products');

  await mobilePage.goto(`${BASE}/pages/cart.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await mobilePage.waitForTimeout(1500);
  const mobileCartOk = await mobilePage.$('.cart-section, #cart-items');
  log(mobileCartOk ? 'PASS' : 'FAIL', 'Mobile - cart page loads', mobileCartOk ? 'Section found' : 'Missing');
  await shot(mobilePage, 'mobile-cart');

  await mobilePage.close();

  // ══════════════════════════════════════════════
  // 12. TOAST NOTIFICATIONS
  // ══════════════════════════════════════════════
  console.log('\n── 12. TOAST NOTIFICATIONS ──');
  await page.goto(`${BASE}/pages/products.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await waitForProducts(page, 10000);
  await page.waitForTimeout(800);
  await dismissPopups(page);

  const toastAddBtn = await page.$('.product .button[data-id]');
  if (toastAddBtn) {
    await toastAddBtn.click({ force: true });
    await page.waitForTimeout(500);
    const toast = await page.$('.toast-notification');
    const toastTxt = toast ? (await toast.textContent()).trim() : '';
    log(toast && toastTxt.length > 0 ? 'PASS' : 'FAIL', 'Toast - add to cart', `"${toastTxt}"`);
    await shot(page, 'toast-cart');
  }

  const wlToastBtn = await page.$('.wishlist-btn');
  if (wlToastBtn) {
    await wlToastBtn.click({ force: true });
    await page.waitForTimeout(500);
    const wlToast = await page.$('.toast-notification');
    const wlTxt = wlToast ? (await wlToast.textContent()).trim() : '';
    log(wlToast ? 'PASS' : 'WARN', 'Toast - wishlist toggle', `"${wlTxt}"`);
  }

  // ══════════════════════════════════════════════
  // 13. NAVIGATION LINKS
  // ══════════════════════════════════════════════
  console.log('\n── 13. NAVIGATION ──');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await dismissPopups(page);

  const navLinks = await page.$$eval('nav a[href]', links =>
    links.map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') }))
  );
  log(navLinks.length > 0 ? 'PASS' : 'FAIL', 'Nav - links present', `${navLinks.length} links: ${navLinks.map(l=>l.text).join(', ')}`);

  const htmlLinks = navLinks.filter(l => l.href && (l.href.includes('.html') || l.href === '/' || l.href === 'index.html'));
  for (const link of htmlLinks) {
    const fullUrl = link.href.startsWith('http') ? link.href : `${BASE}/${link.href.replace(/^\//, '')}`;
    const resp = await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    const status = resp ? resp.status() : 0;
    log(status === 200 ? 'PASS' : 'FAIL', `Nav link: "${link.text}"`, `HTTP ${status}`);
    await page.waitForTimeout(300);
  }

  await page.goto(`${BASE}/pages/products.html`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const activeLink = await page.$('nav a.active');
  log(activeLink ? 'PASS' : 'WARN', 'Nav - active link highlight', activeLink ? (await activeLink.textContent()).trim() : 'No .active class on nav link');

  // ══════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log('                  RESULTS                  ');
  console.log('══════════════════════════════════════════');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  console.log(`Total checks : ${results.length}`);
  console.log(`✅ PASS      : ${passed}`);
  console.log(`❌ FAIL      : ${failed}`);
  console.log(`⚠️  WARN      : ${warned}`);

  if (failed > 0) {
    console.log('\n❌ FAILED:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`   [${r.feature}] ${r.detail}`));
  }
  if (warned > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.filter(r => r.status === 'WARN').forEach(r => console.log(`   [${r.feature}] ${r.detail}`));
  }

  if (jsErrors.length > 0) {
    console.log('\n🔴 JS ERRORS:');
    [...new Set(jsErrors)].slice(0, 15).forEach(e => console.log('   ', e.slice(0, 120)));
  } else {
    console.log('\n✅ No JS runtime errors captured.');
  }

  console.log(`\nScreenshots → ${SHOTS}`);

  await browser.close();
})();
