/**
 * Seed script — adds QA test products to Firebase via REST API.
 * Uses Node 20 built-in fetch. Requires open database rules.
 * If this fails with permission errors, use src/seed.html instead.
 *
 * Run: node scripts/seed.js
 */

const DB_URL = 'https://flowershop-d26f4-default-rtdb.asia-southeast1.firebasedatabase.app';

const QA_PRODUCTS = [
    { name: 'QA Rose',       price: 10.99, category: 'flower',      description: 'QA test flower — vibrant red rose.',      image: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=400&h=400&fit=crop' },
    { name: 'QA Tulip',      price: 8.49,  category: 'flower',      description: 'QA test flower — elegant pink tulip.',     image: 'https://images.unsplash.com/photo-1551074313-802101ec6b24?w=400&h=400&fit=crop' },
    { name: 'QA Sunflower',  price: 12.00, category: 'flower',      description: 'QA test flower — bright sunflower.',       image: 'https://images.unsplash.com/photo-1597848848267-d4ef3798ecc2?w=400&h=400&fit=crop' },
    { name: 'QA Bouquet',    price: 5.00,  category: 'arrangement', description: 'QA test arrangement — classic bouquet.',   image: 'https://images.unsplash.com/photo-1563241527-3004b7be0b1f?w=400&h=400&fit=crop' },
    { name: 'QA Gift Box',   price: 8.00,  category: 'arrangement', description: 'QA test arrangement — elegant gift box.',  image: 'https://images.unsplash.com/photo-1595152452543-e5fc28ebc2b8?w=400&h=400&fit=crop' },
    { name: 'QA Basket',     price: 10.00, category: 'arrangement', description: 'QA test arrangement — wicker basket.',     image: 'https://images.unsplash.com/photo-1487530811015-780aebfeeb3b?w=400&h=400&fit=crop' },
    { name: 'QA Chocolates', price: 7.99,  category: 'gift',        description: 'QA test gift — assorted chocolates.',      image: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=400&h=400&fit=crop' },
    { name: 'QA Mug',        price: 5.99,  category: 'gift',        description: 'QA test gift — ceramic mug.',              image: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400&h=400&fit=crop' },
    { name: 'QA Stuff Toy',  price: 9.99,  category: 'gift',        description: 'QA test gift — plush toy bear.',           image: 'https://images.unsplash.com/photo-1570464197285-9949814674a7?w=400&h=400&fit=crop' },
];

async function dbGet(path) {
    const res = await fetch(`${DB_URL}${path}.json`);
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
    return res.json();
}

async function dbPost(path, body) {
    const res = await fetch(`${DB_URL}${path}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Write failed: ${data.error}`);
    return data;
}

async function seed() {
    console.log('---- Royal Velvet QA Seed ----\n');

    // Check current state
    const existing = await dbGet('/flowers').catch(() => null);
    const existingNames = existing ? Object.values(existing).map(p => p.name) : [];
    console.log(`Found ${existingNames.length} existing products.`);

    const toInsert = QA_PRODUCTS.filter(p => !existingNames.includes(p.name));

    if (toInsert.length === 0) {
        console.log('All QA products already in database.\n');
    } else {
        console.log(`\nAdding ${toInsert.length} products...\n`);
        for (const product of toInsert) {
            try {
                const res = await dbPost('/flowers', product);
                console.log(`  [+] ${product.category.padEnd(12)} ${product.name.padEnd(18)} $${product.price.toFixed(2)}  (id: ${res.name})`);
            } catch (err) {
                console.error(`  [!] ${product.name}: ${err.message}`);
                if (err.message.includes('Permission denied')) {
                    console.error('\n  Firebase rules block unauthenticated writes.');
                    console.error('  Open src/seed.html in your browser instead:\n');
                    console.error('  https://flowershop-d26f4.web.app/seed.html\n');
                    process.exit(1);
                }
            }
        }
    }

    // Summary
    const after = await dbGet('/flowers').catch(() => null);
    const all = after ? Object.values(after) : [];
    const counts = all.reduce((acc, p) => {
        const cat = p.category || 'flower';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
    }, { arrangement: 0, flower: 0, gift: 0 });

    console.log('\n---- Database summary ----');
    console.log(`  Arrangements : ${counts.arrangement}`);
    console.log(`  Flowers      : ${counts.flower}`);
    console.log(`  Gifts        : ${counts.gift}`);
    console.log(`  Total        : ${all.length}`);
    console.log('\nDone.\n');
}

seed().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
