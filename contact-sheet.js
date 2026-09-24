// Builds a labeled contact sheet of all product images and screenshots it
// in chunks for visual review.
const { chromium } = require('playwright');
const https = require('https');

function fetchJson(url) {
  return new Promise((res, rej) => {
    https.get(url, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

(async () => {
  const flowers = await fetchJson('https://flowershop-d26f4-default-rtdb.asia-southeast1.firebasedatabase.app/flowers.json');
  const items = Object.entries(flowers || {}).map(([id, f], i) => ({ n: i + 1, id, name: f.name || id, img: f.image || '' }));
  console.log('products:', items.length);

  const cells = items.map(it =>
    `<div style="width:180px;"><img src="${it.img}" style="width:180px;height:180px;object-fit:cover;display:block;background:#eee;" loading="eager">` +
    `<div style="font:11px monospace;padding:2px 0 8px;">#${it.n} ${it.name.replace(/</g, '&lt;').slice(0, 30)}</div></div>`
  ).join('');
  const html = `<!DOCTYPE html><html><body style="margin:0;font-family:monospace;">` +
    `<div style="display:flex;flex-wrap:wrap;gap:6px;padding:6px;">${cells}</div></body></html>`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1160, height: 1260 } });
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(8000);
  const total = await page.evaluate(() => document.body.scrollHeight);
  let shot = 0;
  for (let y = 0; y < total; y += 1260) {
    await page.evaluate(v => window.scrollTo(0, v), y);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `qa-screenshots/sheet-${String(shot).padStart(2, '0')}.png` });
    shot++;
  }
  console.log('sheets:', shot, 'total height:', total);
  await browser.close();
})();
