const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'https://velvetroyals.com';
const OUT  = path.join(__dirname, 'mobile-screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const PAGES = [
  { name: '01-home',     url: '/' },
  { name: '02-products', url: '/pages/products.html' },
  { name: '03-product-detail', url: '/pages/product.html' },
  { name: '04-cart',     url: '/pages/cart.html' },
  { name: '05-about',    url: '/pages/about.html' },
  { name: '06-contact',  url: '/pages/contact.html' },
  { name: '07-login',    url: '/pages/login.html' },
  { name: '08-wishlist', url: '/pages/wishlist.html' },
  { name: '09-orders',   url: '/pages/orders.html' },
  { name: '10-shipping', url: '/pages/shipping.html' },
  { name: '11-privacy',  url: '/pages/privacy.html' },
  { name: '12-terms',    url: '/pages/terms.html' },
  { name: '13-returns',  url: '/pages/returns.html' },
];

(async () => {
  const browser = await chromium.launch();
  // iPhone 14 dimensions
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });

  for (const p of PAGES) {
    console.log(`Checking: ${p.name}`);
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + p.url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1500);

      // Check for ACTUAL horizontal scrollable overflow (visible to user)
      const overflow = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const scrollW = document.documentElement.scrollWidth;
        const hasScroll = scrollW > vw + 2;
        // Find culprit — skip fixed/sticky positioned elements (off-screen by design)
        let culprit = '';
        if (hasScroll) {
          document.querySelectorAll('*').forEach(el => {
            const pos = getComputedStyle(el).position;
            if (pos === 'fixed' || pos === 'sticky') return;
            const parent = el.parentElement;
            if (parent) {
              const pOver = getComputedStyle(parent).overflowX;
              if (pOver === 'hidden' || pOver === 'clip') return; // clipped by parent
            }
            const r = el.getBoundingClientRect();
            if (r.right > vw + 5 && !culprit) {
              culprit = el.tagName + (el.className ? '.' + [...el.classList].join('.') : '') + (el.id ? '#'+el.id : '');
            }
          });
        }
        return { overflowWidth: hasScroll ? scrollW : 0, culprit };
      });

      if (overflow.overflowWidth > 0) {
        console.log(`  ⚠️  OVERFLOW: ${overflow.overflowWidth}px wide — caused by: ${overflow.culprit}`);
      } else {
        console.log(`  ✅ No horizontal overflow`);
      }

      // Full-page screenshot
      await page.screenshot({ path: path.join(OUT, p.name + '.png'), fullPage: true });

    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
    }
    await page.close();
  }

  await browser.close();
  console.log(`\nDone! Screenshots saved to: ${OUT}`);
})();
