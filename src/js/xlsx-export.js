// Minimal Excel (.xlsx) writer for the admin exports — no external library.
//
// An .xlsx file is a zip of a few XML parts. This builds those parts for one
// or more sheets and packs them in an uncompressed ("stored") zip, which
// Excel, Google Sheets and Numbers all open.
//
// Usage:
//   xlsxExport.download('orders.xlsx', [{
//       name: 'Orders',
//       columns: [{ header: 'Date', type: 'datetime', width: 18 }, ...],
//       rows: [[new Date(), 'Sara', 120.5], ...]
//   }]);
//
// Column types: 'text' (default), 'number', 'money' (#,##0.00),
// 'date' (dd/mm/yyyy) and 'datetime' (dd/mm/yyyy hh:mm). Date columns take a
// Date or an ISO string; empty / null cells are left blank.
(function (global) {
    // ── XML helpers ──────────────────────────────────────────────────────
    const xmlEsc = (s) => String(s)
        // Control characters are illegal in XML and make Excel reject the file.
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const colName = (i) => {
        let s = '';
        for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
        return s;
    };

    // Excel counts days from 1899-12-30. Use the local clock so a 16:33
    // order shows as 16:33 in the sheet, not the UTC time.
    const excelDate = (d) => {
        const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
        return t / 86400000 + 25569;
    };

    const toDate = (v) => {
        if (v instanceof Date) return isNaN(v) ? null : v;
        if (typeof v !== 'string' || !v) return null;
        // A bare YYYY-MM-DD is a calendar day, not midnight UTC.
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
        const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
        return isNaN(d) ? null : d;
    };

    // Style indexes into cellXfs in STYLES below.
    const STYLE = { text: 0, header: 1, money: 2, date: 3, datetime: 4, number: 0 };

    const STYLES =
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="3">' +
            '<numFmt numFmtId="164" formatCode="#,##0.00"/>' +
            '<numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>' +
            '<numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm"/>' +
        '</numFmts>' +
        '<fonts count="2">' +
            '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
            '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
        '</fonts>' +
        '<fills count="3">' +
            '<fill><patternFill patternType="none"/></fill>' +
            '<fill><patternFill patternType="gray125"/></fill>' +
            '<fill><patternFill patternType="solid"><fgColor rgb="FFF3E9D2"/><bgColor indexed="64"/></patternFill></fill>' +
        '</fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="5">' +
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
            '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
            '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
            '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
            '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '</cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>';

    const cellXml = (ref, value, type) => {
        if (value === null || value === undefined || value === '') return '';
        if (type === 'date' || type === 'datetime') {
            const d = toDate(value);
            if (d) return '<c r="' + ref + '" s="' + STYLE[type] + '"><v>' + excelDate(d) + '</v></c>';
        } else if (type === 'money' || type === 'number') {
            const n = typeof value === 'number' ? value : parseFloat(value);
            if (isFinite(n)) return '<c r="' + ref + '" s="' + STYLE[type] + '"><v>' + n + '</v></c>';
        }
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(value) + '</t></is></c>';
    };

    const sheetXml = (sheet) => {
        const cols = sheet.columns;
        const last = colName(cols.length - 1);
        const lastRow = sheet.rows.length + 1;
        const header = '<row r="1">' + cols.map((c, i) =>
            '<c r="' + colName(i) + '1" t="inlineStr" s="' + STYLE.header + '"><is><t xml:space="preserve">' + xmlEsc(c.header) + '</t></is></c>'
        ).join('') + '</row>';
        const body = sheet.rows.map((row, r) =>
            '<row r="' + (r + 2) + '">' + cols.map((c, i) => cellXml(colName(i) + (r + 2), row[i], c.type)).join('') + '</row>'
        ).join('');
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
            '<dimension ref="A1:' + last + lastRow + '"/>' +
            // Keep the header row visible while scrolling.
            '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
            '<sheetFormatPr defaultRowHeight="15"/>' +
            '<cols>' + cols.map((c, i) =>
                '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.width || 14) + '" customWidth="1"/>'
            ).join('') + '</cols>' +
            '<sheetData>' + header + body + '</sheetData>' +
            '<autoFilter ref="A1:' + last + lastRow + '"/>' +
            '</worksheet>';
    };

    // Sheet names: max 31 chars, none of : \ / ? * [ ]
    const safeSheetName = (name, i) => (String(name || 'Sheet' + (i + 1)).replace(/[:\\/?*[\]]/g, ' ').trim() || 'Sheet' + (i + 1)).slice(0, 31);

    const buildParts = (sheets) => {
        const names = sheets.map((s, i) => safeSheetName(s.name, i));
        const files = {
            '[Content_Types].xml':
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                '<Default Extension="xml" ContentType="application/xml"/>' +
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
                '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
                sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
                '</Types>',
            '_rels/.rels':
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
                '</Relationships>',
            'xl/workbook.xml':
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
                '<sheets>' + names.map((n, i) => '<sheet name="' + xmlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' +
                // Excel expects a hidden name for each sheet's filter range.
                '<definedNames>' + sheets.map((s, i) =>
                    '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">' +
                    xmlEsc("'" + names[i].replace(/'/g, "''") + "'!$A$1:$" + colName(s.columns.length - 1) + '$' + (s.rows.length + 1)) +
                    '</definedName>').join('') + '</definedNames>' +
                '</workbook>',
            'xl/_rels/workbook.xml.rels':
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
                '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
                '</Relationships>',
            'xl/styles.xml': STYLES
        };
        sheets.forEach((s, i) => { files['xl/worksheets/sheet' + (i + 1) + '.xml'] = sheetXml(s); });
        return files;
    };

    // ── Stored (uncompressed) zip ────────────────────────────────────────
    const CRC_TABLE = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c >>> 0;
        }
        return t;
    })();
    const crc32 = (bytes) => {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    };

    const zip = (files) => {
        const enc = new TextEncoder();
        const now = new Date();
        const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        const chunks = [], central = [];
        let offset = 0;

        Object.keys(files).forEach(name => {
            const nameBytes = enc.encode(name);
            const data = enc.encode(files[name]);
            const crc = crc32(data);

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);   // local file header
            local.setUint16(4, 20, true);           // version needed
            local.setUint16(6, 0x0800, true);       // UTF-8 names
            local.setUint16(8, 0, true);            // stored
            local.setUint16(10, dosTime, true);
            local.setUint16(12, dosDate, true);
            local.setUint32(14, crc, true);
            local.setUint32(18, data.length, true);
            local.setUint32(22, data.length, true);
            local.setUint16(26, nameBytes.length, true);
            local.setUint16(28, 0, true);
            chunks.push(new Uint8Array(local.buffer), nameBytes, data);

            const cen = new DataView(new ArrayBuffer(46));
            cen.setUint32(0, 0x02014b50, true);     // central directory header
            cen.setUint16(4, 20, true);
            cen.setUint16(6, 20, true);
            cen.setUint16(8, 0x0800, true);
            cen.setUint16(10, 0, true);
            cen.setUint16(12, dosTime, true);
            cen.setUint16(14, dosDate, true);
            cen.setUint32(16, crc, true);
            cen.setUint32(20, data.length, true);
            cen.setUint32(24, data.length, true);
            cen.setUint16(28, nameBytes.length, true);
            cen.setUint32(42, offset, true);         // local header offset
            central.push(new Uint8Array(cen.buffer), nameBytes);

            offset += 30 + nameBytes.length + data.length;
        });

        const centralSize = central.reduce((n, c) => n + c.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);          // end of central directory
        end.setUint16(8, Object.keys(files).length, true);
        end.setUint16(10, Object.keys(files).length, true);
        end.setUint32(12, centralSize, true);
        end.setUint32(16, offset, true);

        return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]),
            { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    };

    const build = (sheets) => zip(buildParts(sheets));

    const download = (filename, sheets) => {
        const blob = build(sheets);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };

    global.xlsxExport = { build, download };
})(typeof window !== 'undefined' ? window : globalThis);
