// Server-side re-check of an order's total before taking payment.
//
// The storefront works the total out in the browser and writes it into the
// order, so on its own that figure can't be trusted: anyone can edit the order
// before it's saved. createGeideaSession runs this first and refuses to open a
// payment page for less than the order is actually worth.
//
// The fee tables and rules here MUST stay in step with the checkout:
//   - DELIVERY_FEES / slotSurcharge  <->  the <select> options in src/pages/cart.html
//   - payablePrice / couponDiscount  <->  app.js (_repriceCart, _couponDiscount)

const DELIVERY_FEES = {
    'Dubai': 25,
    'Sharjah': 35,
    'Ajman': 70,
    'Umm Al Quwain': 90,
    'Ras Al Khaimah': 90,
    'Abu Dhabi': 150,
    'Al Ain': 150,
    'Fujairah': 150
};

// The stored time slot is the option label before the "|", e.g.
// "Express: Within 2 Hours" or "Midnight: 22:00 - 00:00".
const slotSurcharge = (timeSlot) => {
    const s = String(timeSlot || '');
    if (/^express/i.test(s)) return 20;
    if (/^midnight/i.test(s)) return 25;
    return 0;
};

const round2 = (n) => Math.round(n * 100) / 100;

// What the customer pays for a product: the sale price when it's a real
// discount, otherwise the normal price.
const payablePrice = (p) => {
    const price = Number(p.price);
    const sale = Number(p.salePrice);
    return (sale > 0 && sale < price) ? sale : price;
};

const couponDiscount = (coupon, subtotal) => {
    if (!coupon) return 0;
    if (coupon.type === 'percent') return round2(subtotal * Number(coupon.value) / 100);
    if (coupon.type === 'fixed') return Math.min(Number(coupon.value), subtotal);
    return 0;
};

const findCoupon = (coupons, code) => {
    if (!code) return null;
    const want = String(code).toUpperCase();
    return Object.values(coupons || {})
        .find(c => c && String(c.code || '').toUpperCase() === want) || null;
};

// Custom bouquets reference products by name. The storefront keeps the first
// product (by key) for each name, so the lookup must pick the same one.
const indexByName = (flowers) => {
    const idx = new Map();
    Object.keys(flowers || {}).sort().forEach(k => {
        const p = flowers[k];
        const n = String((p && p.name) || '').toLowerCase().trim();
        if (n && !idx.has(n)) idx.set(n, p);
    });
    return idx;
};

// Returns { ok, expected, charged, problems }. `ok` is false when any line
// can't be priced, or the order total is below what it should be. Paying a
// little more than expected (a price dropped since it went in the cart) is
// allowed — the customer is only ever charged what they were shown.
function checkOrderTotal(order, flowers, coupons, today) {
    const problems = [];
    const byName = indexByName(flowers);
    const named = (n) => byName.get(String(n || '').toLowerCase().trim());

    let subtotal = 0;
    for (const item of (order && order.items) || []) {
        const qty = parseInt(item && item.quantity, 10);
        if (!(qty >= 1)) { problems.push('bad quantity for ' + (item && item.name)); continue; }

        let unit = null;
        if (item.isCustom && item.customDetails) {
            const d = item.customDetails;
            const a = named(d.arrangement), f = named(d.flower), g = d.gift ? named(d.gift) : null;
            if (a && f && (!d.gift || g)) {
                unit = Number(a.price) + Number(f.price) + (g ? Number(g.price) : 0);
            }
        } else {
            const p = (flowers || {})[String(item.id)];
            if (p) unit = payablePrice(p);
        }

        if (unit === null || isNaN(unit)) { problems.push('cannot price item: ' + (item && item.name)); continue; }
        subtotal += unit * qty;
    }
    if (!((order && order.items) || []).length) problems.push('order has no items');

    const f = (order && order.fulfillment) || {};
    let fee = 0;
    if (f.type !== 'pickup') {
        fee = DELIVERY_FEES[f.area];
        if (fee === undefined) { problems.push('unknown delivery area: ' + f.area); fee = 0; }
    }
    const surcharge = slotSurcharge(f.timeSlot);

    let discount = 0;
    if (order && order.coupon) {
        const c = findCoupon(coupons, order.coupon);
        const valid = c && c.active !== false && (!c.expiry || c.expiry >= today) &&
            (c.type === 'percent' || c.type === 'fixed');
        if (valid) discount = couponDiscount(c, subtotal);
        else problems.push('coupon not valid: ' + order.coupon);
    }

    const expected = round2(Math.max(0, subtotal + fee + surcharge - discount));
    const charged = round2(Number(order && order.total));
    const ok = problems.length === 0 && charged + 0.05 >= expected;
    return { ok, expected, charged, problems };
}

module.exports = {
    DELIVERY_FEES,
    slotSurcharge,
    payablePrice,
    couponDiscount,
    checkOrderTotal
};
