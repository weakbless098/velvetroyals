// Which unpaid orders may be cleaned up automatically.
//
// Only orders that were sent to Geidea's payment page and then left unpaid
// count as abandoned. Orders that never got a payment session are the manual
// flow (the shop sends a payment link on WhatsApp), so they stay until the
// admin deals with them.

// Comfortably longer than a Geidea payment session, so a slow bank OTP can't
// complete a payment for an order that has already been removed.
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

const _time = (iso) => {
  const t = iso ? new Date(iso).getTime() : 0;
  return isNaN(t) ? 0 : t;
};

function shouldPreserveUnpaidOrder(order) {
  if (!order) return false;
  if (order.paymentStatus === 'paid') return true;
  if (order.paymentStatus === 'failed') return true;
  if (order.lastPaymentAttempt) return true;
  if (!order.paymentSession) return true;
  return false;
}

function shouldAutoRemoveUnpaidOrder(order, now = Date.now()) {
  if (!order || shouldPreserveUnpaidOrder(order)) return false;
  // Measure from the latest payment attempt start, not just order creation,
  // in case the customer reopened the payment page later.
  const started = Math.max(_time(order.timestamp), _time(order.paymentSession && order.paymentSession.createdAt));
  if (!started) return false;
  return now - started > ABANDONED_AFTER_MS;
}

module.exports = {
  ABANDONED_AFTER_MS,
  shouldAutoRemoveUnpaidOrder,
  shouldPreserveUnpaidOrder,
};
