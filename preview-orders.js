const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 900, height: 1600 });
  await page.goto('https://flowershop-d26f4.web.app/pages/orders.html');
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    document.getElementById('orders-auth-gate').style.display = 'none';
    document.getElementById('orders-loading').style.display = 'none';

    // Show filter bar with All selected
    const bar = document.getElementById('orders-filter-bar');
    bar.style.display = 'flex';
    bar.innerHTML =
      '<button class="orders-filter-tab filter-tab-active">All Orders <span class="filter-tab-count">3</span></button>' +
      '<button class="orders-filter-tab">Active <span class="filter-tab-count">1</span></button>' +
      '<button class="orders-filter-tab">Completed <span class="filter-tab-count">2</span></button>';

    const container = document.getElementById('orders-container');
    container.style.display = 'block';

    const step = (cls, icon, label, hasLine, lineDone) =>
      `<div class="tracker-step ${cls}"><div class="tracker-dot">${icon}</div><span class="tracker-label">${label}</span>${hasLine ? `<div class="tracker-line${lineDone ? ' line-done' : ''}"></div>` : ''}</div>`;

    const iconBox = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>';

    // Active order
    const card1 = `
    <div class="order-track-card">
      <div class="order-status-banner status-banner-out_for_delivery">
        <span class="order-status-icon">🚚</span>
        <div class="order-status-text">
          <span class="order-status-name">Out for Delivery</span>
          <span class="order-status-desc">Your order is on its way to you!</span>
        </div>
      </div>
      <div class="order-card-body">
        <div class="order-track-header">
          <div class="order-track-meta">
            <div class="order-num-row"><span class="order-track-id">Order #A7F3C1</span><span class="order-item-count">3 items</span></div>
            <span class="order-track-date">Tue, June 17, 2026 &middot; 06:21 PM</span>
          </div>
          <div class="order-track-amount">
            <span class="order-track-total-label">Order Total</span>
            <span class="order-track-total">AED&nbsp;215.00</span>
          </div>
        </div>
        <div class="order-track-stepper">
          ${step('step-done','🧾','Order Placed',true,true)}
          ${step('step-done','✅','Confirmed',true,true)}
          ${step('step-done','🌸','Preparing',true,true)}
          ${step('step-active','🚚','Out for Delivery',true,false)}
          ${step('step-future','🎁','Delivered',false,false)}
        </div>
      </div>
      <div class="order-track-details">
        <div class="order-details-section-label">Items Ordered</div>
        <div class="order-track-items">
          <span class="order-item-pill">🌸 Red Rose Bouquet &times;2</span>
          <span class="order-item-pill">🌸 Sunflower Arrangement &times;1</span>
        </div>
        <div class="order-track-divider"></div>
        <div class="order-details-section-label">Delivery Details</div>
        <div class="order-track-info">
          <span class="track-info-row">Delivery &middot; Dubai Marina &middot; Villa 42, Street 5</span>
          <span class="track-info-row">Wednesday, June 18, 2026 &middot; 3:00 PM &ndash; 6:00 PM</span>
        </div>
      </div>
    </div>`;

    // Delivered (not archived) — shows Archive button
    const card2 = `
    <div class="order-track-card order-track-delivered">
      <div class="order-status-banner status-banner-delivered">
        <span class="order-status-icon">🎁</span>
        <div class="order-status-text">
          <span class="order-status-name">Order Delivered</span>
          <span class="order-status-desc">Your flowers have arrived &mdash; enjoy!</span>
        </div>
      </div>
      <div class="order-card-body">
        <div class="order-track-header">
          <div class="order-track-meta">
            <div class="order-num-row"><span class="order-track-id">Order #B2E9D4</span><span class="order-item-count">1 item</span></div>
            <span class="order-track-date">Sun, June 14, 2026 &middot; 11:00 AM</span>
          </div>
          <div class="order-track-amount">
            <span class="order-track-total-label">Order Total</span>
            <span class="order-track-total">AED&nbsp;85.00</span>
          </div>
        </div>
        <div class="order-track-stepper">
          ${step('step-done','🧾','Order Placed',true,true)}
          ${step('step-done','✅','Confirmed',true,true)}
          ${step('step-done','🌸','Preparing',true,true)}
          ${step('step-done','🚚','Out for Delivery',true,true)}
          ${step('step-active','🎁','Delivered',false,false)}
        </div>
      </div>
      <div class="order-track-details">
        <div class="order-details-section-label">Items Ordered</div>
        <div class="order-track-items"><span class="order-item-pill">🌸 White Lily Bunch &times;1</span></div>
        <div class="order-track-divider"></div>
        <div class="order-details-section-label">Delivery Details</div>
        <div class="order-track-info"><span class="track-info-row">Store Pickup &mdash; collect from our shop</span></div>
        <button class="order-archive-btn">${iconBox} Archive Order</button>
      </div>
    </div>`;

    // Archived order
    const card3 = `
    <div class="order-track-card order-track-delivered order-archived">
      <div class="order-status-banner status-banner-delivered">
        <span class="order-status-icon">🎁</span>
        <div class="order-status-text">
          <span class="order-status-name">Order Delivered</span>
          <span class="order-status-desc">Your flowers have arrived &mdash; enjoy!</span>
        </div>
        <div style="margin-left:auto;flex-shrink:0;"><span class="order-archived-badge">${iconBox} Archived</span></div>
      </div>
      <div class="order-card-body">
        <div class="order-track-header">
          <div class="order-track-meta">
            <div class="order-num-row"><span class="order-track-id">Order #C3F8A2</span><span class="order-item-count">2 items</span></div>
            <span class="order-track-date">Mon, June 10, 2026 &middot; 02:30 PM</span>
          </div>
          <div class="order-track-amount">
            <span class="order-track-total-label">Order Total</span>
            <span class="order-track-total">AED&nbsp;140.00</span>
          </div>
        </div>
        <div class="order-track-stepper">
          ${step('step-done','🧾','Order Placed',true,true)}
          ${step('step-done','✅','Confirmed',true,true)}
          ${step('step-done','🌸','Preparing',true,true)}
          ${step('step-done','🚚','Out for Delivery',true,true)}
          ${step('step-active','🎁','Delivered',false,false)}
        </div>
      </div>
      <div class="order-track-details">
        <div class="order-details-section-label">Items Ordered</div>
        <div class="order-track-items">
          <span class="order-item-pill">🌸 Purple Orchid Vase &times;1</span>
          <span class="order-item-pill">🌸 Rose Gift Box &times;1</span>
        </div>
        <div class="order-track-divider"></div>
        <div class="order-details-section-label">Delivery Details</div>
        <div class="order-track-info"><span class="track-info-row">Delivery &middot; Jumeirah &middot; Apt 12B</span></div>
      </div>
    </div>`;

    container.innerHTML = card1 + card2 + card3;
  });

  await page.screenshot({ path: 'orders-cards-screenshot.png', fullPage: true });
  await browser.close();
  console.log('Done');
})();
