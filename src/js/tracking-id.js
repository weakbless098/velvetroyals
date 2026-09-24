/**
 * Customer-facing tracking code.
 *
 * Firebase order keys end in arbitrary characters including "_" and "-", so the
 * old "last 6 of the key" approach produced codes like "KQ1B_-" — awkward to
 * read out over the phone and easy to mistype. This maps an order key to a
 * clean 6-character alphanumeric code instead.
 *
 * The alphabet deliberately omits 0/O and 1/I/L so a code can be read aloud or
 * copied from a printed invoice without ambiguity (31^6 ≈ 887 million codes).
 *
 * It is a pure deterministic function of the key, which means:
 *   - the same order always yields the same code, everywhere (browser, Cloud
 *     Functions, printed invoice) with no coordination or stored counter;
 *   - existing orders can be backfilled just by recomputing.
 *
 * NOTE: an identical copy lives in functions/index.js (`rvTrackingId`) because
 * the server can't import this browser file. Keep the two in step.
 */
(function (global) {
    var ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 31 chars, no 0 1 I L O

    function rvTrackingId(key) {
        var s = String(key == null ? '' : key);
        if (!s) return '';
        // Two independent 32-bit hashes so the 6 characters don't correlate.
        var h1 = 0x811c9dc5, h2 = 0x9e3779b9;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
            h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
        }
        var out = '', x = h1 >>> 0, y = h2 >>> 0, n;
        for (n = 0; n < 3; n++) { out += ALPHABET.charAt(x % 31); x = Math.floor(x / 31); }
        for (n = 0; n < 3; n++) { out += ALPHABET.charAt(y % 31); y = Math.floor(y / 31); }
        return out;
    }

    global.rvTrackingId = rvTrackingId;
})(typeof window !== 'undefined' ? window : this);
