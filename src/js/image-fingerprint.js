// Perceptual fingerprint of a product photo, used to refuse a photo that is
// already on another product even when it was re-uploaded, resized or
// recompressed (e.g. sent through WhatsApp) and so has a different link.
//
// Two parts, both needed to call photos "the same":
//  - shape: a 256-bit difference hash — scale to a 17x16 grid of grey levels
//    and record whether brightness rises or falls between neighbours;
//  - colour: the average colour of each cell of a 4x4 grid. Brightness alone
//    can't tell a red rose from the same photo recoloured purple, and the
//    shop sells colour variants made exactly that way.
//
// Each product stores its fingerprint as `imageHash` ("<64 hex>-<96 hex>"),
// written when the product is saved, so new photos are compared without
// re-downloading every existing image.
//
// Thresholds measured on the shop's 250 catalogue photos:
//   same photo re-uploaded: 0 · resized/recompressed (incl. WhatsApp-style): shape <= 11
//   same photo in Chrome, Firefox and Safari: identical fingerprints
//   different photos: 0 of 31,120 pairs within the limits; the only close
//   shape (11) was a recoloured colour variant, told apart by colour (47).
(function (global) {
    const COLS = 17, ROWS = 16;                    // 16 comparisons x 16 rows = 256 bits
    const TINT = 4;                                // 4x4 colour grid
    const SHAPE_MAX = 16;                          // differing shape bits allowed
    const COLOUR_MAX = 24;                         // largest per-cell colour change allowed (0-255)

    // Browsers shrink images in different ways, so the heavy shrinking is
    // done here: draw the photo at (close to) its real size and average the
    // pixels into the grid by hand. Only photos larger than MAX_SIDE are
    // scaled by the browser first, and only by a small factor.
    const MAX_SIDE = 1600;
    const hashFromDrawable = (source, width, height) => {
        const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(COLS, Math.round(width * scale));
        canvas.height = Math.max(ROWS, Math.round(height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#fff';                        // transparent PNGs → white
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
        const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;   // throws if the image is cross-origin

        const W = canvas.width, Hh = canvas.height;
        const grey = new Float64Array(COLS * ROWS), greyN = new Float64Array(COLS * ROWS);
        const tint = new Float64Array(TINT * TINT * 3), tintN = new Float64Array(TINT * TINT);
        const colOf = new Int32Array(W), tcolOf = new Int32Array(W);
        for (let x = 0; x < W; x++) { colOf[x] = Math.floor(x * COLS / W); tcolOf[x] = Math.floor(x * TINT / W); }
        for (let y = 0; y < Hh; y++) {
            const row = Math.floor(y * ROWS / Hh) * COLS, trow = Math.floor(y * TINT / Hh) * TINT;
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2];
                const c = row + colOf[x];
                grey[c] += 0.299 * r + 0.587 * g + 0.114 * b; greyN[c]++;
                const tc = trow + tcolOf[x];
                tint[tc * 3] += r; tint[tc * 3 + 1] += g; tint[tc * 3 + 2] += b; tintN[tc]++;
            }
        }
        for (let c = 0; c < grey.length; c++) grey[c] /= greyN[c] || 1;
        let hex = '', nibble = 0, bits = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS - 1; c++) {
                nibble = (nibble << 1) | (grey[r * COLS + c] < grey[r * COLS + c + 1] ? 1 : 0);
                if (++bits === 4) { hex += nibble.toString(16); nibble = 0; bits = 0; }
            }
        }
        const colour = Array.from(tint, (v, i) => Math.min(255, Math.round(v / (tintN[Math.floor(i / 3)] || 1))).toString(16).padStart(2, '0')).join('');
        return hex + '-' + colour;
    };

    // From a File/Blob the admin picked — always readable, no network.
    const fromBlob = async (blob) => {
        let bmp;
        try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
        catch (e) { bmp = await createImageBitmap(blob); }     // older browsers without the option
        try { return hashFromDrawable(bmp, bmp.width, bmp.height); }
        finally { bmp.close && bmp.close(); }
    };

    // From an image link. Returns null when the host doesn't allow reading
    // the pixels (no CORS) or the image can't load — callers then fall back
    // to comparing links.
    const fromUrl = (url) => new Promise((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const timer = setTimeout(() => resolve(null), 15000);
        img.onload = () => {
            clearTimeout(timer);
            try { resolve(hashFromDrawable(img, img.naturalWidth, img.naturalHeight)); }
            catch (e) { resolve(null); }
        };
        img.onerror = () => { clearTimeout(timer); resolve(null); };
        img.src = url;
    });

    const POPCOUNT = Array.from({ length: 16 }, (_, n) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1));
    const parts = (fp) => {
        const [shape, colour] = String(fp || '').split('-');
        return (shape && shape.length === 64 && colour && colour.length === TINT * TINT * 6) ? { shape, colour } : null;
    };

    // Shape: number of differing bits (0 = identical, 256 = opposite).
    // Colour: the largest change in any colour channel of any grid cell.
    const distance = (a, b) => {
        const pa = parts(a), pb = parts(b);
        if (!pa || !pb) return { shape: Infinity, colour: Infinity };
        let shape = 0, colour = 0;
        for (let i = 0; i < 64; i++) shape += POPCOUNT[parseInt(pa.shape[i], 16) ^ parseInt(pb.shape[i], 16)];
        for (let i = 0; i < pa.colour.length; i += 2) {
            colour = Math.max(colour, Math.abs(parseInt(pa.colour.substr(i, 2), 16) - parseInt(pb.colour.substr(i, 2), 16)));
        }
        return { shape, colour };
    };

    const isSamePhoto = (a, b) => {
        const d = distance(a, b);
        return d.shape <= SHAPE_MAX && d.colour <= COLOUR_MAX;
    };

    global.imageFingerprint = { fromBlob, fromUrl, distance, isSamePhoto, SHAPE_MAX, COLOUR_MAX };
})(typeof window !== 'undefined' ? window : globalThis);
