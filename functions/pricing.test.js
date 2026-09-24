const assert = require('assert');
const { checkOrderTotal } = require('./pricing');

const flowers = {
    '-a1': { name: 'Blush Serenity', price: 200, salePrice: 100 },
    '-a2': { name: 'Blush Serenity', price: 140 },            // later duplicate name
    '-b1': { name: 'Rose Box', price: 300 },
    '-c1': { name: 'Teddy', price: 50, salePrice: 60 }         // "sale" above price: ignored
};
const coupons = {
    'VELVET10': { code: 'VELVET10', type: 'percent', value: 10, active: true },
    'OLD':      { code: 'OLD', type: 'fixed', value: 15, active: true, expiry: '2020-01-01' },
    'OFF':      { code: 'OFF', type: 'fixed', value: 15, active: false }
};
const today = '2026-09-24';
const order = (over) => Object.assign({
    items: [{ id: '-a1', name: 'Blush Serenity', quantity: 2 }],
    fulfillment: { type: 'delivery', area: 'Dubai', timeSlot: '09:00 - 12:00' },
    total: 225
}, over);

// 2 x 100 (sale) + 25 Dubai delivery
assert.deepStrictEqual(checkOrderTotal(order(), flowers, coupons, today).expected, 225);
assert.strictEqual(checkOrderTotal(order(), flowers, coupons, today).ok, true, 'honest order passes');

assert.strictEqual(checkOrderTotal(order({ total: 1 }), flowers, coupons, today).ok, false,
    'order total lowered in the browser is rejected');

assert.strictEqual(checkOrderTotal(order({ total: 240 }), flowers, coupons, today).ok, true,
    'paying more than expected (stale higher cart price) is allowed');

// Pickup: no delivery fee, but the express surcharge still applies.
assert.strictEqual(checkOrderTotal(order({
    fulfillment: { type: 'pickup', timeSlot: 'Express: Within 2 Hours' }, total: 220
}), flowers, coupons, today).ok, true, 'pickup + express = 200 + 20');

assert.strictEqual(checkOrderTotal(order({
    fulfillment: { type: 'delivery', area: 'Dubai', timeSlot: 'Midnight: 22:00 - 00:00' }, total: 250
}), flowers, coupons, today).expected, 250, 'midnight surcharge 25');

assert.strictEqual(checkOrderTotal(order({ coupon: 'velvet10', total: 205 }), flowers, coupons, today).ok, true,
    'percent coupon: 200 - 20 + 25');
assert.strictEqual(checkOrderTotal(order({ coupon: 'OLD', total: 210 }), flowers, coupons, today).ok, false,
    'expired coupon is not honoured');
assert.strictEqual(checkOrderTotal(order({ coupon: 'OFF', total: 210 }), flowers, coupons, today).ok, false,
    'disabled coupon is not honoured');

assert.strictEqual(checkOrderTotal(order({ items: [{ id: '-gone', name: 'X', quantity: 1 }], total: 999 }),
    flowers, coupons, today).ok, false, 'deleted product cannot be priced');

assert.strictEqual(checkOrderTotal(order({ fulfillment: { type: 'delivery', area: 'Mars' }, total: 999 }),
    flowers, coupons, today).ok, false, 'unknown delivery area');

// Custom bouquet: regular prices of the first product per name (200 + 300 + 50)
assert.strictEqual(checkOrderTotal(order({
    items: [{ id: 'custom_1', isCustom: true, quantity: 1,
        customDetails: { arrangement: 'Rose Box', flower: 'blush serenity', gift: 'Teddy' } }],
    total: 575
}), flowers, coupons, today).expected, 575);

assert.strictEqual(checkOrderTotal(order({ items: [{ id: '-c1', quantity: 1 }], total: 75 }),
    flowers, coupons, today).expected, 75, 'sale price above normal price is ignored');

console.log('pricing tests passed');
