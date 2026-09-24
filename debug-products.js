const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('rv_popup_dismissed', '1');
    localStorage.setItem('rv_newsletter_shown', '1');
  });
  const page = await ctx.newPage();

  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('error') || t.includes('Firebase') || t.includes('product') || t.includes('Error')) {
      console.log('[CONSOLE]', msg.type(), t.slice(0, 150));
    }
  });
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  await page.goto('https://flowershop-d26f4.web.app/pages/products.html', { waitUntil: 'networkidle', timeout: 30000 });

  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const count = await page.$$eval('.product-card', els => els.length);
    console.log(`t=${(i+1)*2}s  product-card count: ${count}`);
    if (count > 0) break;
  }

  const finalCount = await page.$$eval('.product-card', els => els.length);
  console.log('Final count:', finalCount);

  // Check if allProducts is loaded in JS
  const jsState = await page.evaluate(() => {
    return {
      allProductsLength: typeof app !== 'undefined' ? 'app defined' : 'app NOT defined',
      productListChildren: document.getElementById('product-list') ? document.getElementById('product-list').children.length : 'no product-list',
    };
  });
  console.log('JS state:', JSON.stringify(jsState));

  await page.screenshot({ path: 'debug-products.png' });
  await browser.close();
})();
