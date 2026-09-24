const functions = require('firebase-functions');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const nodemailer = require('nodemailer');
const https = require('https');
const crypto = require('crypto');

if (!getApps().length) initializeApp();

// ===== Geidea Payment Gateway (UAE) =====
// Flow: checkout calls createGeideaSession -> customer is redirected to
// Geidea's hosted payment page -> Geidea POSTs the result to geideaWebhook,
// which marks the order paid and confirmed.
// Until GEIDEA_PUBLIC_KEY / GEIDEA_API_PASSWORD are set in functions/.env,
// createGeideaSession returns { enabled: false } and the site keeps the
// manual WhatsApp-payment-link flow unchanged.
const GEIDEA_API_BASE = process.env.GEIDEA_API_BASE || 'https://api.geidea.ae';
const GEIDEA_HPP_BASE = process.env.GEIDEA_HPP_BASE || 'https://payments.geidea.ae';
const GEIDEA_WEBHOOK_URL = 'https://us-central1-flowershop-d26f4.cloudfunctions.net/geideaWebhook';
const GEIDEA_RETURN_URL = 'https://velvetroyals.com/pages/payment-result.html';

const ALLOWED_ORIGINS = [
    'https://velvetroyals.com',
    'https://www.velvetroyals.com',
    'https://flowershop-d26f4.web.app',
    'https://flowershop-d26f4.firebaseapp.com'
];

const setCors = (req, res) => {
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
};

// Geidea timestamp format: "yyyy/MM/dd HH:mm:ss" (UTC)
const geideaTimestamp = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};

const hmacBase64 = (data, key) =>
    crypto.createHmac('sha256', key).update(data).digest('base64');

// Order fields (names, notes, addresses) are typed by customers, so escape
// them before they go into any email HTML.
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const { checkOrderTotal } = require('./pricing');

// Customer-facing 6-character tracking code. MUST stay byte-identical to
// src/js/tracking-id.js so a code shown in the browser, printed on an invoice
// and quoted in an email all match. See that file for the full rationale.
const RV_TRACK_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0 1 I L O
const rvTrackingId = (key) => {
    const s = String(key == null ? '' : key);
    if (!s) return '';
    let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
    }
    let out = '', x = h1 >>> 0, y = h2 >>> 0;
    for (let n = 0; n < 3; n++) { out += RV_TRACK_ALPHABET.charAt(x % 31); x = Math.floor(x / 31); }
    for (let n = 0; n < 3; n++) { out += RV_TRACK_ALPHABET.charAt(y % 31); y = Math.floor(y / 31); }
    return out;
};

exports.createGeideaSession = functions.https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;
    if (!publicKey || !apiPassword) return res.json({ enabled: false });

    try {
        const orderId = String((req.body || {}).orderId || '').trim();
        if (!orderId || orderId.includes('/') || orderId.includes('.')) {
            return res.status(400).json({ error: 'Invalid orderId' });
        }

        const db = getDatabase();
        const snap = await db.ref(`orders/${orderId}`).get();
        if (!snap.exists()) return res.status(404).json({ error: 'Order not found' });
        const order = snap.val();
        if (order.paymentStatus === 'paid') return res.status(409).json({ error: 'Order already paid' });

        // The stored total was written by the customer's browser, so re-price
        // the order from the live catalogue before charging it. A mismatch
        // skips online payment (the checkout falls back to the WhatsApp
        // payment-link flow) and flags the order for the admin.
        const [flowersSnap, couponsSnap] = await Promise.all([db.ref('flowers').get(), db.ref('coupons').get()]);
        const check = checkOrderTotal(order, flowersSnap.val() || {}, couponsSnap.val() || {},
            new Date().toISOString().slice(0, 10));
        if (!check.ok) {
            await db.ref(`orders/${orderId}/priceCheck`).set({
                ok: false,
                expected: check.expected,
                charged: check.charged,
                problems: check.problems.slice(0, 10),
                at: new Date().toISOString()
            });
            console.warn('Price check failed for order', orderId, JSON.stringify(check));
            return res.json({ enabled: true, error: 'price-mismatch' });
        }

        // Amount comes from the stored (and now verified) order total.
        const amountStr = Number(order.total).toFixed(2);
        const currency = 'AED';
        const timestamp = geideaTimestamp();
        const signature = hmacBase64(publicKey + amountStr + currency + orderId + timestamp, apiPassword);

        const payload = {
            amount: amountStr,
            currency,
            timestamp,
            merchantReferenceId: orderId,
            signature,
            callbackUrl: GEIDEA_WEBHOOK_URL,
            returnUrl: `${GEIDEA_RETURN_URL}?order=${encodeURIComponent(orderId)}`,
            language: 'en',
            paymentOperation: 'Pay'
        };

        const resp = await fetch(`${GEIDEA_API_BASE}/payment-intent/api/v2/direct/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${publicKey}:${apiPassword}`).toString('base64')
            },
            body: JSON.stringify(payload)
        });
        const data = await resp.json().catch(() => ({}));
        const sessionId = (data.session && data.session.id) || data.sessionId || null;

        if (!resp.ok || !sessionId) {
            console.error('Geidea session creation failed:', resp.status, JSON.stringify(data).slice(0, 800));
            return res.json({ enabled: true, error: 'session-failed' });
        }

        await db.ref(`orders/${orderId}/paymentSession`).set({
            id: sessionId,
            createdAt: new Date().toISOString()
        });

        return res.json({
            enabled: true,
            sessionId,
            checkoutUrl: `${GEIDEA_HPP_BASE}/hpp/checkout/?${sessionId}`
        });
    } catch (e) {
        console.error('createGeideaSession error:', e);
        return res.status(500).json({ error: 'internal' });
    }
});

// Normalise a UAE phone to E.164 (+9715XXXXXXXX) for messaging APIs.
const _toE164 = (phone) => {
    let p = String(phone || '').replace(/\D/g, '');
    if (p.startsWith('00')) p = p.slice(2);
    if (p.startsWith('0')) p = '971' + p.slice(1);
    else if (p.length === 9) p = '971' + p;         // e.g. 50 744 3100
    else if (!p.startsWith('971') && p.length === 12) { /* already 971… */ }
    return p ? '+' + p : '';
};

// Send the customer an SMS payment confirmation via Twilio. No-op until the
// TWILIO_* env vars are set, so nothing breaks before setup is complete.
// From = a Twilio SMS number (or a registered alphanumeric sender ID).
const sendCustomerSMS = (to, body) => new Promise((resolve) => {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_SMS_FROM; // e.g. "+14155238886" or "VelvetR"
    if (!sid || !token || !from || !to) return resolve({ skipped: true });
    const params = new URLSearchParams({ From: from, To: to, Body: body }).toString();
    const reqOpts = {
        hostname: 'api.twilio.com',
        path: `/2010-04-01/Accounts/${sid}/Messages.json`,
        method: 'POST',
        auth: `${sid}:${token}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(params) }
    };
    const r = https.request(reqOpts, resp => {
        let b = ''; resp.on('data', d => b += d);
        resp.on('end', () => { console.log('Customer SMS:', resp.statusCode, b.slice(0, 200)); resolve({ status: resp.statusCode }); });
    });
    r.on('error', e => { console.error('Customer SMS error:', e.message); resolve({ error: e.message }); });
    r.write(params); r.end();
});

// Send the customer an email payment receipt via Gmail. No-op until GMAIL_*
// env vars are set to real values.
const sendCustomerEmail = async (order, trackingId) => {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASS;
    const to = (order.customer || {}).email;
    if (!gmailUser || !gmailPass || gmailPass === 'YOUR_16_CHAR_APP_PASSWORD' || !to) return { skipped: true };

    const customer = order.customer || {};
    const f = order.fulfillment || {};
    const total = parseFloat(order.total || 0).toFixed(2);
    const itemsHtml = (order.items || []).map(i =>
        `<tr><td style="padding:7px 0;border-bottom:1px solid #f0e8d8;color:#333;">${esc(i.name)}</td>
         <td style="padding:7px 0;border-bottom:1px solid #f0e8d8;text-align:center;color:#666;">×${esc(i.quantity)}</td></tr>`).join('');
    const delivHtml = esc(f.type === 'pickup'
        ? `In-store pickup${f.date ? ' · ' + f.date : ''}${f.timeSlot ? ' · ' + f.timeSlot : ''}`
        : `Delivery to ${f.area || '—'}${f.date ? ' · ' + f.date : ''}${f.timeSlot ? ' · ' + f.timeSlot : ''}`);

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#faf8f5;font-family:Georgia,serif;">
<div style="max-width:560px;margin:36px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
  <div style="background:#1A1005;padding:30px 40px;text-align:center;">
    <p style="color:#D4AF37;font-size:0.72em;letter-spacing:3px;margin:0 0 8px;text-transform:uppercase;">Velvet Royals Flowershop</p>
    <h1 style="color:#F3E9D2;font-size:1.5em;margin:0;font-weight:400;">Payment Received</h1>
  </div>
  <div style="padding:30px 40px;">
    <p style="color:#333;font-size:1.05em;margin:0 0 6px;">Hi <strong>${esc(customer.name || 'there')}</strong>,</p>
    <p style="color:#555;line-height:1.7;margin:6px 0 20px;">Thank you! We've received your payment of <strong>AED ${total}</strong> and your order is now confirmed. Our florists will begin preparing it. 💐</p>
    <div style="background:#faf6ec;border:1px solid #efe1c4;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
      <span style="font-size:0.72em;letter-spacing:1.5px;text-transform:uppercase;color:#a87010;">Tracking ID</span><br>
      <strong style="font-size:1.25em;color:#2c1a05;letter-spacing:1px;">${trackingId}</strong>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:0.92em;margin-bottom:16px;">${itemsHtml}</table>
    <p style="color:#666;font-size:0.9em;margin:0 0 2px;"><strong>Total paid:</strong> AED ${total}</p>
    <p style="color:#999;font-size:0.82em;margin:0 0 4px;">Includes 5% VAT: AED ${(parseFloat(total) * 5 / 105).toFixed(2)}</p>
    <p style="color:#666;font-size:0.9em;margin:0 0 20px;"><strong>${f.type === 'pickup' ? 'Pickup' : 'Delivery'}:</strong> ${delivHtml}</p>
    <a href="https://velvetroyals.com/pages/orders.html" style="display:inline-block;background:#6B4E11;color:#fff;text-decoration:none;font-size:0.85em;letter-spacing:1px;padding:12px 26px;border-radius:8px;">TRACK MY ORDER</a>
    <p style="color:#999;font-size:0.82em;margin-top:26px;line-height:1.6;">With love,<br>The Velvet Royals Team · velvetroyals.com</p>
  </div>
</div></body></html>`;

    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass } });
    await transporter.sendMail({
        from: `"Velvet Royals Flowershop" <${gmailUser}>`,
        to,
        subject: `Payment received — your order is confirmed 💐 (${trackingId})`,
        html
    });
    return { sent: true };
};

// Admin follow-up when a pending order actually gets paid. Without this the
// shop's inbox is stuck on the "AWAITING PAYMENT" alert from checkout while
// the admin panel already shows the order as paid — the two go out of sync.
const notifyAdminPaid = async (order, trackingId) => {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASS;
    const adminEmail = process.env.ADMIN_EMAIL || gmailUser;
    if (!gmailUser || !gmailPass || gmailPass === 'YOUR_16_CHAR_APP_PASSWORD' || !adminEmail) {
        return { skipped: true };
    }

    const customer = order.customer || {};
    const f = order.fulfillment || {};
    const total = parseFloat(order.total || 0).toFixed(2);
    const items = (order.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ');
    const when = [f.date, f.timeSlot].filter(Boolean).join(' · ');
    const where = f.type === 'pickup'
        ? 'In-store pickup'
        : ['Delivery', f.area, f.address].filter(Boolean).join(' · ');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#f4f2ee;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:28px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 14px rgba(0,0,0,0.07);">
  <div style="background:#1a7a40;padding:22px 30px;">
    <p style="color:#cdebd8;font-size:0.7em;letter-spacing:2.5px;margin:0 0 6px;text-transform:uppercase;">Velvet Royals · Admin</p>
    <h1 style="color:#fff;font-size:1.3em;margin:0;font-weight:600;">✅ Payment Received</h1>
  </div>
  <div style="padding:24px 30px;">
    <p style="margin:0 0 18px;color:#333;font-size:1.02em;">
      <strong>${esc(customer.name || 'A customer')}</strong> has paid
      <strong style="color:#1a7a40;">AED ${total}</strong>. This order is now confirmed and ready to prepare.
    </p>
    <table style="width:100%;font-size:0.93em;border-collapse:collapse;">
      <tr><td style="padding:5px 14px 5px 0;color:#888;white-space:nowrap;">Tracking ID</td>
          <td style="padding:5px 0;font-weight:700;color:#1A1005;font-family:monospace;">${esc(trackingId)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#888;">Items</td>
          <td style="padding:5px 0;color:#222;">${esc(items)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#888;">${f.type === 'pickup' ? 'Pickup' : 'Deliver to'}</td>
          <td style="padding:5px 0;color:#222;font-weight:600;">${esc(where)}</td></tr>
      ${when ? `<tr><td style="padding:5px 14px 5px 0;color:#888;">When</td>
          <td style="padding:5px 0;color:#222;font-weight:600;">${esc(when)}</td></tr>` : ''}
      <tr><td style="padding:5px 14px 5px 0;color:#888;">Phone</td>
          <td style="padding:5px 0;color:#222;">${esc(customer.phone || '—')}</td></tr>
    </table>
    <div style="margin-top:24px;">
      <a href="https://velvetroyals.com/pages/admin.html" style="display:inline-block;background:#6B4E11;color:#fff;text-decoration:none;font-size:0.82em;font-weight:700;letter-spacing:1px;padding:12px 22px;border-radius:8px;">OPEN ADMIN PANEL</a>
    </div>
  </div>
</div></body></html>`;

    const transporter = nodemailer.createTransport({
        service: 'gmail', auth: { user: gmailUser, pass: gmailPass }
    });
    await transporter.sendMail({
        from: `"Velvet Royals Orders" <${gmailUser}>`,
        to: adminEmail,
        subject: `✅ PAID · AED ${total} · ${customer.name || 'Customer'} (${trackingId})`,
        html
    });
    console.log('Admin payment alert sent to', adminEmail);
    return { sent: true };
};

// Admin alert when a customer tried to pay but the bank declined the card.
// These are warm leads — the customer wanted to buy — so the shop gets their
// details plus a one-tap WhatsApp link to send a fresh payment link.
const notifyAdminPaymentFailed = async (order, trackingId, reason) => {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASS;
    const adminEmail = process.env.ADMIN_EMAIL || gmailUser;
    if (!gmailUser || !gmailPass || gmailPass === 'YOUR_16_CHAR_APP_PASSWORD' || !adminEmail) {
        return { skipped: true };
    }

    const customer = order.customer || {};
    const f = order.fulfillment || {};
    const total = parseFloat(order.total || 0).toFixed(2);
    const items = (order.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ');
    const when = [f.date, f.timeSlot].filter(Boolean).join(' · ');
    const where = f.type === 'pickup'
        ? 'In-store pickup'
        : ['Delivery', f.area, f.address].filter(Boolean).join(' · ');

    const phoneE164 = _toE164(customer.phone);
    const waMsg = encodeURIComponent(
        `Hi ${customer.name || 'there'}, this is Velvet Royals Flowershop. ` +
        `We noticed your payment of AED ${total} didn't go through. ` +
        `Your order is still reserved — would you like us to send a fresh payment link?`
    );
    const waLink = phoneE164
        ? `https://api.whatsapp.com/send?phone=${phoneE164.replace('+', '')}&text=${waMsg}`
        : null;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#f4f2ee;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:28px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 14px rgba(0,0,0,0.07);">
  <div style="background:#b02a37;padding:22px 30px;">
    <p style="color:#f6d6d9;font-size:0.7em;letter-spacing:2.5px;margin:0 0 6px;text-transform:uppercase;">Velvet Royals · Admin</p>
    <h1 style="color:#fff;font-size:1.3em;margin:0;font-weight:600;">⚠️ Payment Failed</h1>
  </div>
  <div style="padding:24px 30px;">
    <p style="margin:0 0 8px;color:#333;font-size:1.02em;">
      <strong>${esc(customer.name || 'A customer')}</strong> tried to pay
      <strong>AED ${total}</strong> but their bank declined the card.
    </p>
    <p style="margin:0 0 18px;color:#666;font-size:0.92em;line-height:1.6;">
      Nothing was charged. The order is <strong>still saved</strong> in your admin panel —
      reach out and they'll likely complete it with another card.
    </p>

    <div style="background:#fdf1f2;border-left:3px solid #b02a37;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
      <span style="font-size:0.72em;letter-spacing:1.2px;text-transform:uppercase;color:#b02a37;font-weight:700;">Reason</span><br>
      <span style="color:#333;font-size:0.93em;">${esc(reason || 'Declined by bank')}</span>
    </div>

    <table style="width:100%;font-size:0.93em;border-collapse:collapse;">
      <tr><td style="padding:5px 14px 5px 0;color:#888;white-space:nowrap;">Tracking ID</td>
          <td style="padding:5px 0;font-weight:700;color:#1A1005;font-family:monospace;">${esc(trackingId)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#888;">Phone</td>
          <td style="padding:5px 0;color:#222;font-weight:600;">${esc(customer.phone || '—')}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#888;">Email</td>
          <td style="padding:5px 0;color:#222;">${esc(customer.email || '—')}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#888;">Items</td>
          <td style="padding:5px 0;color:#222;">${esc(items)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#888;">${f.type === 'pickup' ? 'Pickup' : 'Deliver to'}</td>
          <td style="padding:5px 0;color:#222;">${esc(where)}</td></tr>
      ${when ? `<tr><td style="padding:5px 14px 5px 0;color:#888;">When</td>
          <td style="padding:5px 0;color:#222;">${esc(when)}</td></tr>` : ''}
    </table>

    <div style="margin-top:26px;">
      ${waLink ? `<a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-size:0.82em;font-weight:700;letter-spacing:1px;padding:12px 22px;border-radius:8px;">MESSAGE CUSTOMER</a>` : ''}
      <a href="https://velvetroyals.com/pages/admin.html" style="display:inline-block;margin-left:${waLink ? '8px' : '0'};background:#6B4E11;color:#fff;text-decoration:none;font-size:0.82em;font-weight:700;letter-spacing:1px;padding:12px 22px;border-radius:8px;">OPEN ADMIN PANEL</a>
    </div>
  </div>
</div></body></html>`;

    const transporter = nodemailer.createTransport({
        service: 'gmail', auth: { user: gmailUser, pass: gmailPass }
    });
    await transporter.sendMail({
        from: `"Velvet Royals Orders" <${gmailUser}>`,
        to: adminEmail,
        replyTo: customer.email || undefined,
        subject: `⚠️ Payment Failed · AED ${total} · ${customer.name || 'Customer'} (${trackingId})`,
        html
    });
    console.log('Admin payment-failed alert sent to', adminEmail);
    return { sent: true };
};

// Admin alert for a successful payment whose order record is missing (for
// example removed before the bank finished). Money was taken, so this needs
// a human: check Geidea and either recreate the order or refund.
const notifyAdminOrphanPayment = async (orderId, amountStr, currency, geideaOrderId) => {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASS;
    const adminEmail = process.env.ADMIN_EMAIL || gmailUser;
    if (!gmailUser || !gmailPass || gmailPass === 'YOUR_16_CHAR_APP_PASSWORD' || !adminEmail) {
        return { skipped: true };
    }
    const transporter = nodemailer.createTransport({
        service: 'gmail', auth: { user: gmailUser, pass: gmailPass }
    });
    await transporter.sendMail({
        from: `"Velvet Royals Orders" <${gmailUser}>`,
        to: adminEmail,
        subject: `⚠️ Payment received for a missing order · ${currency} ${amountStr} (${rvTrackingId(orderId)})`,
        html: `<p>Geidea reported a <strong>successful payment</strong> of <strong>${esc(currency)} ${esc(amountStr)}</strong>
            for order <code>${esc(orderId)}</code> (Tracking ID <strong>${esc(rvTrackingId(orderId))}</strong>),
            but that order no longer exists in the database.</p>
            <p>Geidea order ID: <code>${esc(geideaOrderId || '—')}</code></p>
            <p>Please look the payment up in the Geidea dashboard and contact the customer to fulfil or refund it.</p>`
    });
    console.log('Admin orphan-payment alert sent for', orderId);
    return { sent: true };
};

// Fire the customer notifications *and* the admin follow-up after a payment.
const notifyCustomerPaid = async (order, key) => {
    const trackingId = rvTrackingId(key);
    const customer = order.customer || {};
    const total = parseFloat(order.total || 0).toFixed(2);
    // Plain text, kept short to stay within a couple of SMS segments.
    const smsBody =
        `Velvet Royals: Hi ${customer.name || 'there'}, your payment of AED ${total} is received & your order is confirmed! ` +
        `Tracking ID: ${trackingId}. Track: velvetroyals.com/pages/orders.html`;

    const labels = ['Customer SMS', 'Customer email', 'Admin payment alert'];
    const results = await Promise.allSettled([
        sendCustomerSMS(_toE164(customer.phone), smsBody),
        sendCustomerEmail(order, trackingId),
        notifyAdminPaid(order, trackingId)
    ]);
    results.forEach((r, i) => {
        if (r.status === 'rejected') console.error(labels[i] + ' failed:', r.reason);
    });
};

exports.geideaWebhook = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('POST only');

    const publicKey = process.env.GEIDEA_PUBLIC_KEY;
    const apiPassword = process.env.GEIDEA_API_PASSWORD;
    if (!publicKey || !apiPassword) return res.status(503).send('Gateway not configured');

    try {
        const body = req.body || {};
        // Log the raw payload (truncated) — invaluable for the first live test.
        console.log('Geidea callback received:', JSON.stringify(body).slice(0, 1500));

        const o = body.order || body;
        const merchantReferenceId = o.merchantReferenceId || body.merchantReferenceId;
        const geideaOrderId = o.orderId || body.orderId || '';
        const status = o.status || body.status || '';
        const amount = o.amount != null ? o.amount : o.totalAmount;
        const currency = o.currency || body.currency || '';
        const timestamp = body.timeStamp || body.timestamp || o.timeStamp || o.timestamp || '';
        const signature = body.signature || o.signature || '';
        const responseCode = String(body.responseCode || o.responseCode || '');
        const responseMessage = body.responseMessage || o.responseMessage || '';

        if (!merchantReferenceId) return res.status(400).send('Missing merchantReferenceId');
        if (/[.#$/[\]]/.test(String(merchantReferenceId))) return res.status(400).send('Invalid merchantReferenceId');

        // Verify callback authenticity per Geidea docs (before touching any
        // data): HMAC-SHA256(publicKey + amount + currency + geideaOrderId +
        // status + merchantReferenceId + timestamp, apiPassword), base64.
        const amountStr = Number(amount).toFixed(2);
        const expected = hmacBase64(
            publicKey + amountStr + currency + geideaOrderId + status + merchantReferenceId + timestamp,
            apiPassword
        );
        if (signature !== expected && process.env.GEIDEA_WEBHOOK_ALLOW_UNSIGNED !== '1') {
            console.error('Geidea callback signature mismatch for order', merchantReferenceId);
            return res.status(401).send('Invalid signature');
        }

        // Geidea's live callback signals success via order.status "Success"
        // with order.detailedStatus "Paid" (no responseCode field observed);
        // keep the documented responseCode "000" check as a fallback.
        const detailedStatus = o.detailedStatus || '';
        const isSuccess =
            (/^success$/i.test(status) && (!detailedStatus || /paid|captured/i.test(detailedStatus))) ||
            (responseCode === '000' && /success|paid|captured/i.test(status));

        const orderRef = getDatabase().ref(`orders/${merchantReferenceId}`);
        const snap = await orderRef.get();
        if (!snap.exists()) {
            console.error('Geidea callback for unknown order:', merchantReferenceId, 'success:', isSuccess);
            // A customer was charged for an order that no longer exists —
            // the shop must hear about it so they can fulfil or refund.
            if (isSuccess) {
                await notifyAdminOrphanPayment(merchantReferenceId, amountStr, currency, geideaOrderId)
                    .catch(err => console.error('notifyAdminOrphanPayment failed:', err));
            }
            return res.status(404).send('Unknown order');
        }
        const order = snap.val();

        if (!isSuccess) {
            const nowIso = new Date().toISOString();
            // Geidea retries callbacks — the same decline can arrive several
            // times. Only alert once per attempt by comparing the Geidea order
            // id we already recorded.
            const prior = order.lastPaymentAttempt || null;
            const alreadyAlerted = !!(prior && geideaOrderId && prior.geideaOrderId === geideaOrderId);

            await orderRef.child('lastPaymentAttempt').set({
                code: responseCode,
                status: status || null,
                detailedStatus: detailedStatus || null,
                message: responseMessage || null,
                geideaOrderId: geideaOrderId || null,
                at: nowIso
            });
            // Mirror the failure to the public tracking node so the customer's
            // result page shows a clear "payment didn't go through" instead of
            // an endless "processing" spinner.
            await getDatabase().ref(`order-tracking/${merchantReferenceId}`).update({
                paymentStatus: 'failed',
                updatedAt: nowIso
            }).catch(err => console.error('order-tracking failure sync failed:', err));

            // Tell the shop so they can win the sale back. The order is
            // deliberately kept (cancelUnpaidOrder refuses to delete it once
            // lastPaymentAttempt exists).
            if (!alreadyAlerted) {
                const reason = [detailedStatus, responseMessage].filter(Boolean).join(' — ') || status || 'Declined by bank';
                await notifyAdminPaymentFailed(order, rvTrackingId(merchantReferenceId), reason)
                    .catch(err => console.error('notifyAdminPaymentFailed failed:', err));
            } else {
                console.log('Duplicate Geidea failure callback — admin alert skipped for', merchantReferenceId);
            }

            console.log('Geidea payment not successful for', merchantReferenceId, responseCode, status);
            return res.status(200).json({ ok: true });
        }

        // Guard: the paid amount must match the order total.
        if (Math.abs(Number(amount) - Number(order.total)) > 0.01 || currency !== 'AED') {
            console.error('Geidea amount/currency mismatch for', merchantReferenceId,
                'got', amount, currency, 'expected', order.total, 'AED');
            return res.status(400).send('Amount mismatch');
        }

        const nowIso = new Date().toISOString();
        const newStatus = order.status === 'pending' ? 'confirmed' : order.status;
        const history = Array.isArray(order.statusHistory) ? order.statusHistory.slice() : [];
        if (newStatus !== order.status) {
            history.push({ status: newStatus, ts: nowIso, note: 'Payment received via Geidea — auto-confirmed' });
        }

        await orderRef.update({
            paymentStatus: 'paid',
            paidAt: nowIso,
            status: newStatus,
            statusHistory: history,
            geidea: {
                orderId: geideaOrderId || null,
                reference: body.reference || o.reference || null
            }
        });

        await getDatabase().ref(`order-tracking/${merchantReferenceId}`).update({
            status: newStatus,
            paymentStatus: 'paid',
            updatedAt: nowIso
        }).catch(err => console.error('order-tracking sync failed:', err));

        // Deduct stock for counted products now the sale is real.
        await applyStockForOrder(merchantReferenceId)
            .catch(err => console.error('applyStockForOrder failed:', err));

        // Notify the customer their payment went through (WhatsApp + email).
        // No-op until the provider credentials are configured, so it never
        // blocks or breaks the webhook response.
        await notifyCustomerPaid(order, merchantReferenceId)
            .catch(err => console.error('notifyCustomerPaid failed:', err));

        console.log('Order marked paid via Geidea:', merchantReferenceId);
        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('geideaWebhook error:', e);
        return res.status(500).send('internal');
    }
});

// ===== Stock deduction =====
// Runs when an order is actually PAID (not merely placed), so abandoned or
// declined checkouts never eat stock. Only products that opted into counting
// (a numeric stockQty) are touched — made-to-order bouquets left untracked are
// ignored. Guarded by a `stockApplied` flag on the order so a retried webhook
// or a double-click on "Mark as Paid" can't deduct twice.
const applyStockForOrder = async (orderId) => {
    const db = getDatabase();
    const orderRef = db.ref(`orders/${orderId}`);
    const snap = await orderRef.get();
    if (!snap.exists()) return { ok: false, reason: 'not-found' };
    const order = snap.val();
    if (order.stockApplied) return { ok: true, reason: 'already-applied' };
    // Only a genuinely paid order draws down stock. Without this the public
    // endpoint could be called on any freshly-placed order to drain inventory
    // without paying.
    if (order.paymentStatus !== 'paid') return { ok: false, reason: 'not-paid' };

    const changes = [];
    for (const item of (order.items || [])) {
        const pid = item && item.id;
        const qty = Math.max(1, parseInt(item && item.quantity, 10) || 1);
        if (!pid || /[.#$/[\]]/.test(String(pid))) continue;

        const stockRef = db.ref(`flowers/${pid}/stockQty`);
        // Transaction: safe if two orders for the same product land together.
        const res = await stockRef.transaction((current) => {
            if (current === null || current === undefined) return current; // untracked — leave alone
            return Math.max(0, current - qty);
        });
        const after = res.snapshot.val();
        if (after !== null && after !== undefined) {
            changes.push({ id: pid, left: after });
            // Nothing left to sell — take it off the storefront automatically.
            if (after <= 0) {
                await db.ref(`flowers/${pid}/inStock`).set(false).catch(() => {});
            }
        }
    }

    await orderRef.child('stockApplied').set(true);
    console.log('Stock applied for order', orderId, JSON.stringify(changes));
    return { ok: true, changes };
};

// Lets the admin panel trigger the same deduction when payment is recorded
// manually (cash, bank transfer, WhatsApp) rather than through Geidea.
exports.applyOrderStock = functions.https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    try {
        const orderId = String((req.body || {}).orderId || '').trim();
        if (!orderId || /[.#$/[\]]/.test(orderId)) return res.status(400).json({ error: 'Invalid orderId' });
        const r = await applyStockForOrder(orderId);
        return res.json(r);
    } catch (e) {
        console.error('applyOrderStock error:', e);
        return res.status(500).json({ error: 'internal' });
    }
});

// ===== Cancel / clean up unpaid orders =====
// Orders abandoned on Geidea's payment page are removed once they're clearly
// dead (see order-lifecycle.js). Paid, declined and WhatsApp-payment-link
// orders are never touched, so a genuine payment can't be wiped by mistake.
const { shouldAutoRemoveUnpaidOrder, shouldPreserveUnpaidOrder } = require('./order-lifecycle');

const removeOrderFromAllIndexes = async (orderId, order) => {
    const db = getDatabase();
    await db.ref(`orders/${orderId}`).remove().catch(() => {});
    await db.ref(`order-tracking/${orderId}`).remove().catch(() => {});
    if (order && order.uid) {
        await db.ref(`user-orders/${order.uid}/${orderId}`).remove().catch(() => {});
    }
    return { removed: true };
};

exports.cancelUnpaidOrder = functions.https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
        const orderId = String((req.body || {}).orderId || '').trim();
        if (!orderId || /[.#$/[\]]/.test(orderId)) return res.status(400).json({ error: 'Invalid orderId' });

        const ref = getDatabase().ref(`orders/${orderId}`);
        const snap = await ref.get();
        if (!snap.exists()) return res.json({ removed: false, reason: 'not-found' });

        const order = snap.val();
        if (shouldPreserveUnpaidOrder(order)) {
            return res.json({ removed: false, reason: order.paymentStatus === 'paid' ? 'already-paid' : 'payment-attempted' });
        }

        if (!shouldAutoRemoveUnpaidOrder(order)) {
            return res.json({ removed: false, reason: 'too-new' });
        }

        await removeOrderFromAllIndexes(orderId, order);
        console.log('Cancelled/abandoned unpaid order removed:', orderId);
        return res.json({ removed: true });
    } catch (e) {
        console.error('cancelUnpaidOrder error:', e);
        return res.status(500).json({ error: 'internal' });
    }
});

const removeAbandonedOrders = async () => {
    const snap = await getDatabase().ref('orders').once('value');
    const orders = snap.val() || {};
    const now = Date.now();
    let removed = 0;
    for (const [orderId, order] of Object.entries(orders)) {
        if (!shouldAutoRemoveUnpaidOrder(order, now)) continue;
        await removeOrderFromAllIndexes(orderId, order);
        removed += 1;
    }
    return removed;
};

exports.cleanupUnpaidOrders = functions.pubsub.schedule('every 15 minutes').onRun(async () => {
    console.log('Auto-cleaned stale unpaid orders:', await removeAbandonedOrders());
    return null;
});

// Public on-demand version of the scheduled job. It applies exactly the same
// rule and ignores any parameters, so calling it can only remove orders the
// schedule would remove anyway.
exports.cleanupUnpaidOrdersNow = functions.https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
        return res.json({ removed: await removeAbandonedOrders() });
    } catch (e) {
        console.error('cleanupUnpaidOrdersNow error:', e);
        return res.status(500).json({ error: 'internal' });
    }
});

// ===== Guest order lookup (by short Tracking ID or full key) =====
// Runs the match server-side so the public order-tracking collection is never
// exposed for enumeration/scraping. Verifies the customer's contact against the
// stored hashes and returns only the PII-free tracking data.
const _normEmail = (e) => String(e || '').trim().toLowerCase();
const _normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const _sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

exports.lookupOrder = functions.https.onRequest(async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
        const body = req.body || {};
        const idRaw = String(body.id || '').trim();
        const contact = String(body.contact || '').trim();
        if (!idRaw || !contact) return res.json({ found: false });

        let node = null, key = null;
        const looksFull = idRaw.startsWith('-') && idRaw.length > 10;

        if (looksFull) {
            if (/[.#$/[\]]/.test(idRaw)) return res.json({ found: false });
            const snap = await getDatabase().ref(`order-tracking/${idRaw}`).get();
            if (snap.exists()) { node = snap.val(); key = idRaw; }
        } else {
            const code = idRaw.replace(/[#\s]/g, '').toUpperCase();
            const q = await getDatabase().ref('order-tracking')
                .orderByChild('trackingId').equalTo(code).get();
            if (q.exists()) {
                const val = q.val();
                const k = Object.keys(val)[0];
                node = val[k]; key = k;
            }
        }
        if (!node) return res.json({ found: false });

        // Verify the entered contact against the stored hashes.
        const stored = node.contactHashes || [];
        const candidates = [];
        const email = _normEmail(contact);
        if (email.includes('@')) candidates.push(_sha256Hex(email));
        const phone = _normPhone(contact);
        if (phone.length >= 7) candidates.push(_sha256Hex(phone));
        if (!candidates.some(h => stored.includes(h))) return res.json({ found: false });

        // Strip the hashes; return only the PII-free tracking data.
        const { contactHashes, ...safe } = node;
        return res.json({ found: true, key, order: safe });
    } catch (e) {
        console.error('lookupOrder error:', e);
        return res.status(500).json({ error: 'internal' });
    }
});

// ===== Order Notifications (WhatsApp + Customer Email) =====
// The order is read from the database by ID — never taken from the caller —
// and each order is notified at most once. Otherwise anyone could use this
// endpoint to send emails with their own content from the shop's Gmail.
exports.sendOrderNotifications = functions.https.onCall(async (data, context) => {
    const orderId = String((data || {}).orderId || '').trim();
    if (!orderId || /[.#$/[\]]/.test(orderId)) return { ok: false, error: 'Invalid orderId' };

    const orderRef = getDatabase().ref(`orders/${orderId}`);
    const snap = await orderRef.get();
    if (!snap.exists()) return { ok: false, error: 'Order not found' };
    const claim = await orderRef.child('notifiedAt').transaction(cur => (cur ? undefined : new Date().toISOString()));
    if (!claim.committed) return { ok: true, skipped: 'already-notified' };

    const order = snap.val();
    const trackingId = rvTrackingId(orderId);

    const customer    = order.customer    || {};
    const fulfillment = order.fulfillment || {};
    const total       = parseFloat(order.total || 0).toFixed(2);
    const isPaid      = order.paymentStatus === 'paid';
    const delivType   = fulfillment.type === 'pickup' ? 'Pickup' : 'Delivery';
    const itemsList   = (order.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ');
    const delivInfo   = [fulfillment.area, fulfillment.date, fulfillment.timeSlot].filter(Boolean).join(' · ');
    const errors      = [];

    // ── WhatsApp alert to admin via CallMeBot ──
    const waPhone  = process.env.WHATSAPP_PHONE;
    const waApiKey = process.env.WHATSAPP_API_KEY;
    if (waPhone && waApiKey && waApiKey !== 'YOUR_CALLMEBOT_API_KEY') {
        try {
            const msg = [
                `🌸 NEW ORDER — Velvet Royals`,
                `👤 ${customer.name || 'Unknown'}  📞 ${customer.phone || '—'}`,
                `💰 AED ${total}  ${isPaid ? '✅ PAID' : '⏳ Awaiting Payment'}`,
                `📦 ${itemsList}`,
                `🚗 ${delivType}: ${delivInfo}`
            ].join('\n');
            const url = `https://api.callmebot.com/whatsapp.php?phone=${waPhone}&text=${encodeURIComponent(msg)}&apikey=${waApiKey}`;
            await new Promise(resolve => {
                https.get(url, res => {
                    let body = '';
                    res.on('data', d => body += d);
                    res.on('end', () => { console.log('WhatsApp sent:', res.statusCode, body.slice(0, 80)); resolve(); });
                }).on('error', err => { errors.push('WhatsApp: ' + err.message); resolve(); });
            });
        } catch (e) { errors.push('WhatsApp: ' + e.message); }
    }

    // ── Customer email confirmation ──
    const gmailUser  = process.env.GMAIL_USER;
    const gmailPass  = process.env.GMAIL_APP_PASS;
    const custEmail  = customer.email;
    if (gmailUser && gmailPass && gmailPass !== 'YOUR_16_CHAR_APP_PASSWORD' && custEmail) {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: gmailUser, pass: gmailPass }
            });

            const itemsHtml = (order.items || []).map(item =>
                `<tr>
                  <td style="padding:8px 0;border-bottom:1px solid #f0e8d8;color:#333;">${esc(item.name)}${item.isCustom ? ' <em style="font-size:0.82em;color:#aaa;">(Custom)</em>' : ''}</td>
                  <td style="padding:8px 0;border-bottom:1px solid #f0e8d8;text-align:center;color:#666;">×${esc(item.quantity)}</td>
                  <td style="padding:8px 0;border-bottom:1px solid #f0e8d8;text-align:right;color:#333;">AED ${(item.price * item.quantity).toFixed(2)}</td>
                </tr>`
            ).join('');

            const delivHtml = fulfillment.type === 'pickup'
                ? `<p><strong>In-Store Pickup</strong><br>Date: ${esc(fulfillment.date || '—')}<br>Time: ${esc(fulfillment.timeSlot || '—')}</p>`
                : `<p><strong>Delivery to ${esc(fulfillment.area || '—')}</strong><br>Address: ${esc(fulfillment.address || '—')}<br>Date: ${esc(fulfillment.date || '—')}<br>Time: ${esc(fulfillment.timeSlot || '—')}</p>`;

            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:Georgia,serif;">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
  <div style="background:#1A1005;padding:32px 40px;text-align:center;">
    <p style="color:#D4AF37;font-size:0.72em;letter-spacing:3px;margin:0 0 8px;text-transform:uppercase;">Velvet Royals Flowershop</p>
    <h1 style="color:#F3E9D2;font-size:1.5em;margin:0;font-weight:400;letter-spacing:0.5px;">Order Confirmed</h1>
  </div>
  <div style="padding:32px 40px;">
    <p style="color:#333;font-size:1.05em;margin-bottom:4px;">Hi <strong>${esc(customer.name || 'there')}</strong>,</p>
    <p style="color:#555;line-height:1.75;margin-top:6px;">${isPaid
        ? 'Your payment was received and your order is now confirmed.'
        : 'We have received your order and will contact you shortly to confirm payment.'
    } Thank you for choosing Velvet Royals!</p>

    <h3 style="color:#1A1005;font-size:0.85em;letter-spacing:1.5px;text-transform:uppercase;border-bottom:2px solid #D4AF37;padding-bottom:8px;margin-top:32px;">Your Order</h3>
    <table style="width:100%;border-collapse:collapse;font-size:0.92em;">
      <thead><tr>
        <th style="text-align:left;padding:8px 0;color:#aaa;font-weight:500;font-size:0.8em;border-bottom:2px solid #f0e8d8;">Item</th>
        <th style="text-align:center;padding:8px 0;color:#aaa;font-weight:500;font-size:0.8em;border-bottom:2px solid #f0e8d8;">Qty</th>
        <th style="text-align:right;padding:8px 0;color:#aaa;font-weight:500;font-size:0.8em;border-bottom:2px solid #f0e8d8;">Price</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot><tr>
        <td colspan="2" style="padding:14px 0 0;font-weight:600;color:#1A1005;">Total</td>
        <td style="padding:14px 0 0;text-align:right;font-weight:700;color:#D4AF37;font-size:1.2em;">AED ${total}</td>
      </tr></tfoot>
    </table>

    <h3 style="color:#1A1005;font-size:0.85em;letter-spacing:1.5px;text-transform:uppercase;border-bottom:2px solid #D4AF37;padding-bottom:8px;margin-top:32px;">Delivery Details</h3>
    <div style="color:#555;line-height:1.9;font-size:0.95em;">${delivHtml}</div>

    <div style="background:#faf8f5;border-radius:8px;padding:16px 20px;margin-top:24px;border-left:3px solid #D4AF37;">
      <p style="margin:0;color:#777;font-size:0.87em;line-height:1.6;">Questions? WhatsApp us or email <a href="mailto:${gmailUser}" style="color:#D4AF37;text-decoration:none;">${gmailUser}</a></p>
    </div>
  </div>
  <div style="background:#1A1005;padding:20px 40px;text-align:center;">
    <p style="color:rgba(243,233,210,0.45);font-size:0.76em;margin:0;">© 2026 Velvet Royals Flowershop · UAE</p>
  </div>
</div></body></html>`;

            await transporter.sendMail({
                from: `"Velvet Royals Flowershop" <${gmailUser}>`,
                to: custEmail,
                subject: `Order Confirmed – AED ${total} · Velvet Royals`,
                html
            });
            console.log('Confirmation email sent to', custEmail);
        } catch (e) { errors.push('Email: ' + e.message); }
    }

    // ── Admin "new order" alert email ──
    // Goes to ADMIN_EMAIL (falls back to the sending account). Sent for every
    // order — including ones where the customer left no email address — so the
    // shop always gets a copy with everything needed to start fulfilling.
    const adminEmail = process.env.ADMIN_EMAIL || gmailUser;
    if (gmailUser && gmailPass && gmailPass !== 'YOUR_16_CHAR_APP_PASSWORD' && adminEmail) {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: gmailUser, pass: gmailPass }
            });

            const rows = (order.items || []).map(i =>
                `<tr>
                   <td style="padding:7px 0;border-bottom:1px solid #eee;">${esc(i.name)}${i.isCustom ? ' <em style="color:#999;font-size:0.85em;">(Custom)</em>' : ''}</td>
                   <td style="padding:7px 0;border-bottom:1px solid #eee;text-align:center;">×${esc(i.quantity)}</td>
                   <td style="padding:7px 0;border-bottom:1px solid #eee;text-align:right;">AED ${(i.price * i.quantity).toFixed(2)}</td>
                 </tr>`).join('');

            const line = (label, value) => value
                ? `<tr><td style="padding:5px 14px 5px 0;color:#888;white-space:nowrap;">${label}</td>
                       <td style="padding:5px 0;color:#222;font-weight:600;">${esc(value)}</td></tr>`
                : '';

            const fulfilRows = fulfillment.type === 'pickup'
                ? line('Method', 'In-store pickup') + line('Date', fulfillment.date) + line('Time', fulfillment.timeSlot)
                : line('Method', 'Delivery') + line('Area', fulfillment.area) + line('Address', fulfillment.address) +
                  line('Date', fulfillment.date) + line('Time', fulfillment.timeSlot);

            const payPill = isPaid
                ? '<span style="background:#e8f6ec;color:#1a7a40;border:1px solid #b7e0c4;border-radius:20px;padding:4px 12px;font-size:0.82em;font-weight:700;">PAID</span>'
                : '<span style="background:#fdf0e3;color:#b35c00;border:1px solid #f0d3ad;border-radius:20px;padding:4px 12px;font-size:0.82em;font-weight:700;">AWAITING PAYMENT</span>';

            const waLink = customer.phone
                ? 'https://api.whatsapp.com/send?phone=' + String(customer.phone).replace(/\D/g, '').replace(/^0/, '971')
                : null;

            const adminHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#f4f2ee;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:28px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 14px rgba(0,0,0,0.07);">
  <div style="background:#1A1005;padding:22px 30px;">
    <p style="color:#D4AF37;font-size:0.7em;letter-spacing:2.5px;margin:0 0 6px;text-transform:uppercase;">Velvet Royals · Admin</p>
    <h1 style="color:#fff;font-size:1.3em;margin:0;font-weight:600;">🌸 New Order Received</h1>
  </div>
  <div style="padding:24px 30px;">
    <div style="display:block;margin-bottom:18px;">${payPill}
      ${trackingId ? `<span style="margin-left:10px;font-family:monospace;font-size:0.9em;color:#666;">Tracking ID: <strong style="color:#1A1005;">${esc(trackingId)}</strong></span>` : ''}
    </div>

    <h3 style="font-size:0.78em;letter-spacing:1.5px;text-transform:uppercase;color:#A87010;border-bottom:2px solid #f0e8d8;padding-bottom:6px;margin:0 0 10px;">Customer</h3>
    <table style="width:100%;font-size:0.92em;border-collapse:collapse;margin-bottom:22px;">
      ${line('Name', customer.name)}
      ${line('Phone', customer.phone)}
      ${line('Email', customer.email)}
      ${line('Notes', customer.notes)}
    </table>

    <h3 style="font-size:0.78em;letter-spacing:1.5px;text-transform:uppercase;color:#A87010;border-bottom:2px solid #f0e8d8;padding-bottom:6px;margin:0 0 10px;">${fulfillment.type === 'pickup' ? 'Pickup' : 'Delivery'}</h3>
    <table style="width:100%;font-size:0.92em;border-collapse:collapse;margin-bottom:22px;">${fulfilRows}</table>

    <h3 style="font-size:0.78em;letter-spacing:1.5px;text-transform:uppercase;color:#A87010;border-bottom:2px solid #f0e8d8;padding-bottom:6px;margin:0 0 10px;">Items</h3>
    <table style="width:100%;font-size:0.92em;border-collapse:collapse;">
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="2" style="padding:12px 0 0;font-weight:700;color:#1A1005;">Total</td>
            <td style="padding:12px 0 0;text-align:right;font-weight:800;color:#1A1005;font-size:1.15em;">AED ${total}</td></tr>
        <tr><td colspan="2" style="padding:2px 0;color:#999;font-size:0.85em;">Includes 5% VAT</td>
            <td style="padding:2px 0;text-align:right;color:#999;font-size:0.85em;">AED ${(parseFloat(total) * 5 / 105).toFixed(2)}</td></tr>
      </tfoot>
    </table>

    <div style="margin-top:26px;">
      <a href="https://velvetroyals.com/pages/admin.html" style="display:inline-block;background:#6B4E11;color:#fff;text-decoration:none;font-size:0.82em;font-weight:700;letter-spacing:1px;padding:12px 22px;border-radius:8px;">OPEN ADMIN PANEL</a>
      ${waLink ? `<a href="${waLink}" style="display:inline-block;margin-left:8px;background:#25D366;color:#fff;text-decoration:none;font-size:0.82em;font-weight:700;letter-spacing:1px;padding:12px 22px;border-radius:8px;">MESSAGE CUSTOMER</a>` : ''}
    </div>
  </div>
</div></body></html>`;

            await transporter.sendMail({
                from: `"Velvet Royals Orders" <${gmailUser}>`,
                to: adminEmail,
                replyTo: customer.email || undefined,
                subject: `🌸 New Order · AED ${total} · ${customer.name || 'Customer'}${isPaid ? ' (PAID)' : ''}`,
                html: adminHtml
            });
            console.log('Admin order alert sent to', adminEmail);
        } catch (e) { errors.push('Admin email: ' + e.message); }
    }

    if (errors.length) console.error('Notification errors:', errors.join(' | '));
    return { ok: true, errors };
});
