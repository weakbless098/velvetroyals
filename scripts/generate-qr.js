const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const args = require('minimist')(process.argv.slice(2));
const url = args.url || args.u || 'http://127.0.0.1:8080';
const out = args.out || args.o || path.join(__dirname, '..', 'src', 'images', 'review-qr.png');
const size = parseInt(args.size || args.s || '300', 10);

(async () => {
  try {
    await QRCode.toFile(out, url, { width: size });
    console.log(`QR saved to: ${out}`);
  } catch (err) {
    console.error('Failed to generate QR:', err);
    process.exit(1);
  }
})();
