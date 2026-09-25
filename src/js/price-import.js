// Bulk price update from a spreadsheet (admin → Inventory → Update Prices).
//
// Flow: choose a .xlsx or .csv → each row is matched to a product (by the
// Product ID column, or by exact name when that name is unique) → a preview
// lists every price change and every problem → "Apply" writes all changes in
// one database update, together with an undo record under priceImports/.
//
// The expected file is the one "Download Excel" produces, so the routine is:
// download, edit Original Price / Sale Price, upload. Other files work too as
// long as they have an ID or name column plus a price column.
(function (global) {
    const esc = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const round2 = (n) => Math.round(n * 100) / 100;
    const aed = (n) => (n === null || n === undefined) ? '—' : 'AED ' + n.toFixed(2);

    // ── Reading .xlsx ────────────────────────────────────────────────────
    // An .xlsx is a zip of XML parts. Excel compresses them with DEFLATE,
    // which the browser can undo natively (DecompressionStream).
    const inflateRaw = async (bytes) => {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    };

    const zipEntries = (buf) => {
        const view = new DataView(buf);
        let eocd = -1;
        for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
            if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('This file is not a valid .xlsx workbook.');
        const count = view.getUint16(eocd + 10, true);
        let p = view.getUint32(eocd + 16, true);
        const dec = new TextDecoder();
        const entries = {};
        for (let n = 0; n < count; n++) {
            if (view.getUint32(p, true) !== 0x02014b50) throw new Error('This .xlsx file looks damaged.');
            const nameLen = view.getUint16(p + 28, true);
            const extraLen = view.getUint16(p + 30, true);
            const commentLen = view.getUint16(p + 32, true);
            entries[dec.decode(new Uint8Array(buf, p + 46, nameLen))] = {
                method: view.getUint16(p + 10, true),
                size: view.getUint32(p + 20, true),     // compressed size
                offset: view.getUint32(p + 42, true)    // local header
            };
            p += 46 + nameLen + extraLen + commentLen;
        }
        return entries;
    };

    const readEntry = async (buf, entry) => {
        const view = new DataView(buf);
        const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
        const data = new Uint8Array(buf, start, entry.size);
        const bytes = entry.method === 0 ? data
            : entry.method === 8 ? await inflateRaw(data)
            : null;
        if (!bytes) throw new Error('This .xlsx uses an unsupported compression method.');
        return new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
    };

    const byTag = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
    const colIndex = (ref) => {
        const letters = (/^[A-Z]+/i.exec(ref || '') || [''])[0].toUpperCase();
        let n = 0;
        for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
        return n - 1;
    };

    // Rows of the first worksheet, as arrays of strings/numbers.
    const readXlsx = async (buf) => {
        const entries = zipEntries(buf);
        const need = (name) => {
            if (!entries[name]) throw new Error('This .xlsx is missing ' + name + '.');
            return readEntry(buf, entries[name]);
        };

        const workbook = await need('xl/workbook.xml');
        const firstSheet = byTag(workbook, 'sheet')[0];
        if (!firstSheet) throw new Error('This workbook has no sheets.');
        const relId = firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
            || firstSheet.getAttribute('r:id');
        const rels = await need('xl/_rels/workbook.xml.rels');
        const rel = byTag(rels, 'Relationship').find(r => r.getAttribute('Id') === relId);
        if (!rel) throw new Error('Could not find the first sheet in this workbook.');
        let target = rel.getAttribute('Target').replace(/^\.\//, '');
        target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;

        // Shared strings: the text of a cell is all its <t> runs, except the
        // phonetic guides (<rPh>) Excel stores for some languages.
        let shared = [];
        if (entries['xl/sharedStrings.xml']) {
            const sst = await need('xl/sharedStrings.xml');
            shared = byTag(sst, 'si').map(si =>
                byTag(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join(''));
        }

        const sheet = await need(target);
        const rows = [];
        byTag(sheet, 'row').forEach((rowEl, i) => {
            const r = parseInt(rowEl.getAttribute('r'), 10) - 1;
            const rowIdx = isNaN(r) ? i : r;
            const row = rows[rowIdx] = [];
            byTag(rowEl, 'c').forEach((c, j) => {
                const ref = c.getAttribute('r');
                const col = ref ? colIndex(ref) : j;
                const type = c.getAttribute('t');
                const v = byTag(c, 'v')[0];
                const raw = v ? v.textContent : '';
                let value;
                if (type === 's') value = shared[parseInt(raw, 10)] ?? '';
                else if (type === 'inlineStr') value = byTag(c, 't').map(t => t.textContent).join('');
                else if (type === 'str') value = raw;
                else if (type === 'b') value = raw === '1';
                else if (type === 'e') value = '';
                else value = raw === '' ? '' : Number(raw);
                row[col] = value;
            });
        });
        for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
        return rows;
    };

    // ── Reading .csv ─────────────────────────────────────────────────────
    // Excel writes ";" instead of "," in some regions, so pick whichever
    // separator the first line actually uses.
    const readCsv = (text) => {
        text = String(text).replace(/^﻿/, '');
        const firstLine = text.split(/\r?\n/).find(l => l.trim()) || '';
        const outside = firstLine.replace(/"[^"]*"/g, '');
        const sep = [',', ';', '\t'].map(s => [s, outside.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];

        const rows = [];
        let row = [], cell = '', quoted = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (quoted) {
                if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
                else if (ch === '"') quoted = false;
                else cell += ch;
            } else if (ch === '"') quoted = true;
            else if (ch === sep) { row.push(cell); cell = ''; }
            else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                row.push(cell); rows.push(row); row = []; cell = '';
            } else cell += ch;
        }
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        return rows;
    };

    const readSpreadsheet = async (file) => {
        const name = (file.name || '').toLowerCase();
        if (file.size > 5 * 1024 * 1024) throw new Error('This file is larger than 5 MB — is it the right one?');
        if (name.endsWith('.xls')) throw new Error('This is an old-style .xls file. In Excel choose File → Save As → Excel Workbook (.xlsx), then upload that.');
        if (name.endsWith('.csv')) return readCsv(await file.text());
        if (name.endsWith('.xlsx')) return readXlsx(await file.arrayBuffer());
        throw new Error('Please choose an Excel (.xlsx) or CSV (.csv) file.');
    };

    // ── Understanding the rows ───────────────────────────────────────────
    const norm = (s) => String(s ?? '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const HEADERS = {
        id:    ['product id', 'id', 'product key'],
        name:  ['item name', 'name', 'product', 'product name', 'item'],
        price: ['original price', 'price', 'regular price', 'normal price', 'new price'],
        sale:  ['sale price', 'sale', 'discount price', 'discounted price', 'new sale price']
    };

    // The header row is the first of the top 10 rows that names a price
    // column and a way to identify the product.
    const findHeader = (rows) => {
        for (let r = 0; r < Math.min(10, rows.length); r++) {
            const cols = {};
            (rows[r] || []).forEach((cell, i) => {
                const n = norm(cell);
                Object.keys(HEADERS).forEach(key => {
                    if (cols[key] === undefined && HEADERS[key].includes(n)) cols[key] = i;
                });
            });
            if ((cols.price !== undefined || cols.sale !== undefined) && (cols.id !== undefined || cols.name !== undefined)) {
                return { row: r, cols };
            }
        }
        return null;
    };

    // Accepts 120, "120", "AED 1,234.50", the "12,50" decimal comma and the
    // "1.234" / "1.234,50" European thousands dot (AED never has 3 decimals).
    // Returns null for an empty cell and NaN for anything unreadable.
    const parseMoney = (v) => {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'number') return isFinite(v) ? v : NaN;
        let s = String(v).trim();
        if (!s) return null;
        s = s.replace(/[^0-9.,-]/g, '');
        if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
        else if (s.includes('.')) s = s.replace(/,/g, '');
        else if (/,\d{1,2}$/.test(s)) s = s.replace(',', '.');
        else s = s.replace(/,/g, '');
        const n = parseFloat(s);
        return isNaN(n) ? NaN : n;
    };

    // The sale price the storefront actually honours (a real discount).
    const liveSale = (p) => {
        const s = Number(p.salePrice), price = Number(p.price);
        return (s > 0 && s < price) ? round2(s) : null;
    };

    // products: { id: { name, price, salePrice } } straight from /flowers.
    const planChanges = (rows, header, products) => {
        const names = new Map();
        Object.entries(products).forEach(([id, p]) => {
            const n = String((p && p.name) || '').toLowerCase().trim();
            if (n) names.set(n, (names.get(n) || []).concat(id));
        });

        const { cols } = header;
        const changes = [], problems = [];
        const seen = new Set();
        let unchanged = 0, rowsRead = 0;

        for (let r = header.row + 1; r < rows.length; r++) {
            const row = rows[r] || [];
            const cell = (key) => cols[key] === undefined ? undefined : row[cols[key]];
            const idCell = String(cell('id') ?? '').trim();
            const nameCell = String(cell('name') ?? '').trim();
            if (!idCell && !nameCell) continue;
            rowsRead++;
            const line = r + 1;       // the row number Excel shows
            const label = nameCell || idCell;

            let id = null;
            if (idCell) {
                if (products[idCell]) id = idCell;
                else { problems.push({ line, text: '"' + label + '": no product with ID ' + idCell }); continue; }
            } else {
                const ids = names.get(nameCell.toLowerCase()) || [];
                if (ids.length === 1) id = ids[0];
                else if (!ids.length) { problems.push({ line, text: 'No product is called "' + nameCell + '"' }); continue; }
                else { problems.push({ line, text: ids.length + ' products are called "' + nameCell + '" — use the Product ID column (download the latest Excel file)' }); continue; }
            }
            if (seen.has(id)) { problems.push({ line, text: '"' + label + '" appears more than once — only the first row was used' }); continue; }
            seen.add(id);

            const p = products[id];
            const oldPrice = round2(Number(p.price));
            const oldSale = liveSale(p);
            const notes = [];

            let newPrice = oldPrice;
            if (cols.price !== undefined) {
                const v = parseMoney(cell('price'));
                if (v !== null) {
                    if (!(v > 0)) { problems.push({ line, text: '"' + p.name + '": original price "' + cell('price') + '" is not a valid price' }); continue; }
                    newPrice = round2(v);
                }
            }

            let newSale = oldSale;
            if (cols.sale !== undefined) {
                const v = parseMoney(cell('sale'));
                if (v === null) newSale = null;          // empty cell = no sale
                else if (!(v > 0)) { problems.push({ line, text: '"' + p.name + '": sale price "' + cell('sale') + '" is not a valid price' }); continue; }
                else if (round2(v) >= newPrice) { problems.push({ line, text: '"' + p.name + '": sale price ' + aed(round2(v)) + ' must be lower than the original price ' + aed(newPrice) }); continue; }
                else newSale = round2(v);
            } else if (oldSale !== null && oldSale >= newPrice) {
                newSale = null;
                notes.push('Sale price ' + aed(oldSale) + ' removed — it is no longer below the new price');
            }

            if (newPrice === oldPrice && newSale === oldSale) { unchanged++; continue; }
            if (oldPrice > 0 && Math.abs(newPrice - oldPrice) / oldPrice > 0.5) notes.push('Original price changes by more than 50% — please double-check');
            if (oldSale !== null && newSale !== null && Math.abs(newSale - oldSale) / oldSale > 0.5) notes.push('Sale price changes by more than 50% — please double-check');
            changes.push({ id, name: String(p.name || '').trim(), line, oldPrice, newPrice, oldSale, newSale, notes });
        }
        return { changes, problems, unchanged, rowsRead };
    };

    // ── Admin UI ─────────────────────────────────────────────────────────
    let plan = null;

    const $ = (id) => document.getElementById(id);
    const db = () => firebase.database();

    const toast = (message, type = 'success') => {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();
        const t = document.createElement('div');
        t.className = 'toast-notification ' + type;
        t.textContent = message;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
    };

    const setApply = (count) => {
        const btn = $('price-import-apply');
        if (!btn) return;
        btn.disabled = !count;
        btn.textContent = count ? 'Apply ' + count + ' price change' + (count !== 1 ? 's' : '') : 'Apply changes';
    };

    const lastImport = async () => {
        const snap = await db().ref('priceImports').orderByKey().limitToLast(1).once('value');
        let found = null;
        snap.forEach(c => { found = { key: c.key, ...c.val() }; });
        return found;
    };

    const renderStart = async () => {
        plan = null;
        setApply(0);
        const body = $('price-import-body');
        body.innerHTML =
            '<ol class="price-import-steps">' +
                '<li>Click <strong>Download Excel</strong> to get the current price list.</li>' +
                '<li>Change the <strong>Original Price</strong> and/or <strong>Sale Price</strong> columns. Leave <strong>Product ID</strong> as it is. An empty Sale Price means no sale.</li>' +
                '<li>Save the file and choose it below. You’ll see every change before anything is saved.</li>' +
            '</ol>' +
            '<button type="button" class="button price-import-choose" onclick="document.getElementById(\'price-import-file\').click()">Choose Excel or CSV file</button>' +
            '<div id="price-import-last" class="price-import-last"></div>';
        try {
            const last = await lastImport();
            const box = $('price-import-last');
            if (!box || !last) return;
            const when = new Date(last.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
            box.innerHTML = 'Last upload: <strong>' + esc(last.count) + ' price' + (last.count !== 1 ? 's' : '') + '</strong> changed on ' + esc(when) +
                (last.file ? ' from <em>' + esc(last.file) + '</em>' : '') +
                (last.undoneAt ? ' — <strong>undone</strong>'
                    : ' <button type="button" class="price-import-undo" onclick="priceImport.undoLast()">Undo this upload</button>');
        } catch (e) { /* history is optional for the start screen */ }
    };

    const renderPreview = () => {
        const { changes, problems, unchanged, rowsRead } = plan;
        const flagged = changes.filter(c => c.notes.length).length;
        // Empty sale prices read as "no sale" rather than a struck-out dash.
        const show = (v) => v === null ? 'no sale' : aed(v);
        const cell = (oldV, newV) => oldV === newV
            ? '<span class="pi-same">' + show(newV) + '</span>'
            : (oldV === null ? '<span class="pi-same">no sale</span>' : '<span class="pi-old">' + aed(oldV) + '</span>') +
              ' → <strong>' + show(newV) + '</strong>';

        $('price-import-body').innerHTML =
            '<p class="price-import-file">' + esc(plan.fileName) + ' — ' + rowsRead + ' product row' + (rowsRead !== 1 ? 's' : '') + ' read</p>' +
            '<div class="price-import-summary">' +
                '<span class="pi-chip pi-chip-change">' + changes.length + ' to change</span>' +
                '<span class="pi-chip">' + unchanged + ' unchanged</span>' +
                (flagged ? '<span class="pi-chip pi-chip-warn">' + flagged + ' to double-check</span>' : '') +
                (problems.length ? '<span class="pi-chip pi-chip-bad">' + problems.length + ' skipped</span>' : '') +
            '</div>' +
            (changes.length
                ? '<div class="price-import-table-wrap"><table class="price-import-table">' +
                    '<thead><tr><th>Product</th><th>Original price</th><th>Sale price</th></tr></thead><tbody>' +
                    changes.map(c =>
                        '<tr' + (c.notes.length ? ' class="pi-flag"' : '') + '>' +
                            '<td>' + esc(c.name) + (c.notes.length ? '<div class="pi-note">' + c.notes.map(esc).join('<br>') + '</div>' : '') + '</td>' +
                            '<td>' + cell(c.oldPrice, c.newPrice) + '</td>' +
                            '<td>' + cell(c.oldSale, c.newSale) + '</td>' +
                        '</tr>').join('') +
                  '</tbody></table></div>'
                : '<p class="price-import-empty">No price changes found in this file.</p>') +
            (problems.length
                ? '<div class="price-import-problems"><strong>Skipped rows (not changed):</strong><ul>' +
                    problems.slice(0, 50).map(p => '<li>Row ' + p.line + ': ' + esc(p.text) + '</li>').join('') +
                    (problems.length > 50 ? '<li>…and ' + (problems.length - 50) + ' more</li>' : '') +
                  '</ul></div>'
                : '') +
            '<button type="button" class="price-import-again" onclick="priceImport.open()">Choose a different file</button>';
        setApply(changes.length);
    };

    const showError = (message) => {
        $('price-import-body').innerHTML =
            '<div class="price-import-error">' + esc(message) + '</div>' +
            '<button type="button" class="price-import-again" onclick="priceImport.open()">Try another file</button>';
        setApply(0);
    };

    const open = () => {
        const modal = $('price-import-modal');
        if (!modal) return;
        modal.classList.add('active');
        renderStart();
    };

    const close = () => {
        const modal = $('price-import-modal');
        if (modal) modal.classList.remove('active');
        plan = null;
    };

    const onFile = async (input) => {
        const file = input.files && input.files[0];
        input.value = '';             // let the same file be chosen again
        if (!file) return;
        $('price-import-modal').classList.add('active');
        $('price-import-body').innerHTML = '<p class="price-import-file">Reading ' + esc(file.name) + '…</p>';
        setApply(0);
        try {
            const rows = await readSpreadsheet(file);
            const header = findHeader(rows);
            if (!header) throw new Error('Couldn’t find the columns. The file needs a "Product ID" or "Item Name" column and an "Original Price" or "Sale Price" column in its first rows — the Download Excel file has all of them.');
            const snap = await db().ref('flowers').once('value');
            plan = { fileName: file.name, ...planChanges(rows, header, snap.val() || {}) };
            renderPreview();
        } catch (e) {
            console.error('Price import failed:', e);
            showError(e.message || 'Could not read this file.');
        }
    };

    const apply = async () => {
        if (!plan || !plan.changes.length) return;
        const btn = $('price-import-apply');
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
            // Someone may have edited a price since the preview was built.
            const live = (await db().ref('flowers').once('value')).val() || {};
            const moved = plan.changes.filter(c => !live[c.id] ||
                round2(Number(live[c.id].price)) !== c.oldPrice || liveSale(live[c.id]) !== c.oldSale);
            if (moved.length) {
                showError(moved.length + ' of these prices changed since you uploaded the file (for example "' + moved[0].name + '"). Nothing was saved — please upload the file again to see the latest prices.');
                return;
            }

            const user = firebase.auth().currentUser;
            const key = db().ref('priceImports').push().key;
            const record = { at: new Date().toISOString(), by: (user && user.email) || '', file: plan.fileName, count: plan.changes.length, changes: {} };
            const updates = {};
            plan.changes.forEach(c => {
                updates['flowers/' + c.id + '/price'] = c.newPrice;
                updates['flowers/' + c.id + '/salePrice'] = c.newSale;
                record.changes[c.id] = { name: c.name, oldPrice: c.oldPrice, newPrice: c.newPrice, oldSale: c.oldSale, newSale: c.newSale };
            });
            // One update: every price and the undo record are saved together,
            // or nothing is.
            updates['priceImports/' + key] = record;
            await db().ref().update(updates);

            const n = plan.changes.length;
            close();
            toast(n + ' price' + (n !== 1 ? 's' : '') + ' updated — the website shows them now');
        } catch (e) {
            console.error('Price import save failed:', e);
            showError('Saving failed: ' + (e.message || e) + '. Nothing was changed.');
        }
    };

    const undoLast = async () => {
        try {
            const last = await lastImport();
            if (!last || last.undoneAt) { toast('There is no upload to undo', 'warning'); return; }
            if (!confirm('Put back the ' + last.count + ' price' + (last.count !== 1 ? 's' : '') + ' changed by this upload?')) return;

            const live = (await db().ref('flowers').once('value')).val() || {};
            const updates = {};
            let restored = 0, skipped = 0;
            Object.entries(last.changes || {}).forEach(([id, c]) => {
                const p = live[id];
                const newSale = c.newSale ?? null;
                // Only undo prices nobody has edited since the upload.
                if (!p || round2(Number(p.price)) !== c.newPrice || liveSale(p) !== newSale) { skipped++; return; }
                updates['flowers/' + id + '/price'] = c.oldPrice;
                updates['flowers/' + id + '/salePrice'] = c.oldSale ?? null;
                restored++;
            });
            updates['priceImports/' + last.key + '/undoneAt'] = new Date().toISOString();
            await db().ref().update(updates);
            toast(restored + ' price' + (restored !== 1 ? 's' : '') + ' restored' +
                (skipped ? ' (' + skipped + ' left alone — edited since the upload)' : ''));
            renderStart();
        } catch (e) {
            console.error('Undo failed:', e);
            toast('Undo failed: ' + (e.message || e), 'error');
        }
    };

    global.priceImport = {
        open, close, onFile, apply, undoLast,
        // exposed for tests
        _readCsv: readCsv, _readXlsx: readXlsx, _findHeader: findHeader, _parseMoney: parseMoney, _planChanges: planChanges
    };
})(typeof window !== 'undefined' ? window : globalThis);
