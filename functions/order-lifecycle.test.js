const assert = require('assert');
const { shouldAutoRemoveUnpaidOrder, shouldPreserveUnpaidOrder } = require('./order-lifecycle');

const now = Date.now();
const ago = (min) => new Date(now - min * 60 * 1000).toISOString();

assert.strictEqual(
  shouldAutoRemoveUnpaidOrder({ timestamp: ago(61), paymentSession: { id: 's', createdAt: ago(61) } }, now),
  true,
  'order abandoned on the Geidea page for over an hour should be removed'
);

assert.strictEqual(
  shouldAutoRemoveUnpaidOrder({ timestamp: ago(30), paymentSession: { id: 's', createdAt: ago(30) } }, now),
  false,
  'order still within a possible payment session should remain'
);

assert.strictEqual(
  shouldAutoRemoveUnpaidOrder({ timestamp: ago(120), paymentSession: { id: 's', createdAt: ago(20) } }, now),
  false,
  'age counts from the latest payment session, not order creation'
);

assert.strictEqual(
  shouldAutoRemoveUnpaidOrder({ timestamp: ago(600) }, now),
  false,
  'order that never reached Geidea (WhatsApp payment link flow) must be kept'
);

assert.strictEqual(
  shouldPreserveUnpaidOrder({ lastPaymentAttempt: { status: 'Failed' }, paymentSession: { id: 's' } }),
  true,
  'payment-failed orders must be preserved for follow-up'
);

assert.strictEqual(
  shouldPreserveUnpaidOrder({ paymentStatus: 'failed', paymentSession: { id: 's' } }),
  true,
  'failed payment statuses must be preserved'
);

assert.strictEqual(
  shouldAutoRemoveUnpaidOrder({ paymentStatus: 'paid', timestamp: ago(600), paymentSession: { id: 's' } }, now),
  false,
  'paid orders are never removed'
);

console.log('order-lifecycle tests passed');
