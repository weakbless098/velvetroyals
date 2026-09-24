const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 900, height: 1400 });
  await page.goto('https://flowershop-d26f4.web.app/pages/orders.html');
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    document.getElementById('orders-auth-gate').style.display = 'none';
    document.getElementById('orders-loading').style.display = 'none';
    const container = document.getElementById('orders-container');
    container.style.display = 'block';
    container.innerHTML = [
      '<div class="order-track-card" id="dbg">',
        '<div class="order-status-banner status-banner-confirmed"><span>TEST BANNER</span></div>',
        '<div class="order-card-body" id="dbg-body">',
          '<div class="order-track-header" id="dbg-header">',
            '<div class="order-track-meta"><span class="order-track-id">Order #TEST</span></div>',
            '<div class="order-track-amount"><span class="order-track-total">AED 100</span></div>',
          '</div>',
          '<div class="order-track-stepper" id="dbg-stepper">',
            '<div class="tracker-step step-done"><div class="tracker-dot">A</div><span class="tracker-label">Step A</span></div>',
            '<div class="tracker-step step-active"><div class="tracker-dot">B</div><span class="tracker-label">Step B</span></div>',
          '</div>',
        '</div>',
        '<div class="order-track-details">FOOTER</div>',
      '</div>'
    ].join('');
  });

  const info = await page.evaluate(() => {
    const body = document.getElementById('dbg-body');
    const header = document.getElementById('dbg-header');
    const stepper = document.getElementById('dbg-stepper');
    const getInfo = el => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return { display: s.display, flexDirection: s.flexDirection, top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
    };
    return { body: getInfo(body), header: getInfo(header), stepper: getInfo(stepper) };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
