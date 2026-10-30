const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element(value = '', attributes = {}) {
    const classes = new Set();
    return {
        value, attributes, textContent: '', disabled: false, style: {}, children: [], events: {},
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        getAttribute(name) { return this.attributes[name]; },
        addEventListener(name, handler) { this.events[name] = handler; },
        appendChild(child) { this.children.push(child); },
        querySelectorAll() { return []; },
        set innerHTML(value) { this.html = value; this.children = []; },
        get innerHTML() { return this.html || ''; }
    };
}

const product = (id = 1, overrides = {}) => ({ id, nombre: `Producto ${id}`, stock: 10, precio_compra: 4, precio_venta: 10, local: 'LAS BRISAS', ...overrides });

function database(products = [], options = {}) {
    const rows = products.map(p => ({ ...p }));
    const updates = [];
    const inserts = [];
    return {
        rows, updates, inserts,
        from(table) {
            return {
                update(payload) {
                    const conditions = [];
                    const query = {
                        eq(key, value) { conditions.push([key, value]); return query; },
                        async select() {
                            const operation = { table, payload, conditions };
                            updates.push(operation);
                            const result = options.onUpdate && await options.onUpdate(operation, updates.length, rows);
                            if (result) return result;
                            const matched = rows.filter(row => conditions.every(([key, value]) => row[key] === value));
                            matched.forEach(row => Object.assign(row, payload));
                            return { data: matched.map(({ id }) => ({ id })), error: null };
                        }
                    };
                    return query;
                },
                async insert(payload) {
                    inserts.push({ table, payload });
                    if (options.onInsert) return options.onInsert(table, payload);
                    return { error: null };
                },
                select() {
                    return { eq: () => ({ order: async () => ({ data: rows, error: null }) }) };
                }
            };
        }
    };
}

function load(file, ids, state, db, selectors = {}) {
    const alerts = [];
    const timers = new Map();
    const window = { addEventListener() {}, removeEventListener() {}, print() {} };
    const context = {
        state, supabase: db, window,
        document: {
            getElementById: id => ids[id] || null,
            querySelector: () => null,
            querySelectorAll: selector => selectors[selector] || [],
            createElement: () => element()
        },
        customAlert: async message => { alerts.push(message); }, customConfirm: async () => true,
        resolveImage: () => '', AVAILABLE_IMAGES: [],
        console: { error() {}, log() {} },
        setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); }
    };
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
        .replace(/^import .*\r?\n/gm, '').replace(/export function /g, 'function ');
    vm.runInContext(source, context, { filename: file });
    return { context, alerts, timers, window };
}

function setupPos({ products = [product()], items = [product()], dbOptions = {}, receipt = false, onSaleCompleted } = {}) {
    const ids = Object.fromEntries(['cobrarBtn', 'cartItems', 'cartTotalValue', 'cartDiscount', 'paymentMethod', 'splitEfectivo', 'splitYape', 'splitPaymentSection', 'posGrid', 'posSearch', 'posPrevPageBtn', 'posNextPageBtn', 'posPaginationInfo'].map(id => [id, element()]));
    ids.paymentMethod.value = 'Efectivo';
    ids.splitPaymentSection.classList.add('hidden');
    if (receipt) {
        for (const id of ['receiptModal', 'receiptLocalName', 'receiptDate', 'receiptItems', 'receiptSubtotal', 'receiptDiscountRow', 'receiptDiscount', 'receiptTotal', 'receiptPaymentMethod', 'closeReceiptBtn', 'printReceiptBtn']) ids[id] = element();
        ids.receiptModal.classList.add('hidden');
    }
    const discountButton = element('', { 'data-percent': '10' });
    const categoryButton = element('', { 'data-cat': 'Bebidas' });
    const state = { cart: items.map(item => ({ ...item, qty: item.qty ?? 1 })), globalProducts: products.map(p => ({ ...p })), currentLocal: 'LAS BRISAS' };
    const db = database(products, dbOptions);
    const loaded = load('pos.js', ids, state, db, { '.discount-btn': [discountButton], '.cat-filter-btn': [categoryButton] });
    const pos = loaded.context.setupPOS({ onSaleCompleted });
    return { ...loaded, ids, state, db, pos, discountButton, categoryButton, checkout: () => ids.cobrarBtn.events.click() };
}

function setupInventory() {
    const ids = Object.fromEntries(['addProductBtn', 'productName', 'productCode', 'categoria', 'precioCompra', 'precioVenta', 'stock', 'alertaStock', 'productStatusMsg', 'loteQtyInput', 'loteExpInput', 'addLoteBtn', 'saveComboBtn', 'comboNameInput', 'comboPriceInput', 'comboStatusMsg', 'comboProductList'].map(id => [id, element()]));
    ids.productName.value = 'Agua';
    ids.comboNameInput.value = 'Combo';
    ids.comboPriceInput.value = '12';
    let quantities = ['1', '1'];
    ids.comboProductList.querySelectorAll = () => quantities.map((quantity, index) => ({ value: String(index + 1), parentElement: { nextElementSibling: { querySelector: () => ({ value: quantity }) } } }));
    const state = { globalProducts: [], currentLocal: 'LAS BRISAS' };
    const db = database();
    const loaded = load('inventory.js', ids, state, db);
    loaded.context.setupInventory({});
    return { ...loaded, ids, db, setQuantities(value) { quantities = value; }, save: () => ids.addProductBtn.events.click(), saveCombo: () => ids.saveComboBtn.events.click() };
}

test('inventory preserves explicit zero values and leaves empty values null', async () => {
    const t = setupInventory();
    for (const id of ['precioCompra', 'precioVenta', 'stock', 'alertaStock']) t.ids[id].value = '0';
    await t.save();
    const saved = t.db.inserts[0].payload[0];
    assert.equal(saved.stock, 0);
    assert.equal(saved.alerta_stock, 0);
    assert.equal(saved.precio_compra, 0);
    assert.equal(saved.precio_venta, 0);
    const empty = setupInventory();
    await empty.save();
    assert.equal(empty.db.inserts[0].payload[0].stock, null);
});

test('inventory rejects negative prices and noninteger stock', async () => {
    for (const [field, value] of [['precioCompra', '-1'], ['precioVenta', 'Infinity'], ['stock', '1.5'], ['stock', '-1'], ['alertaStock', '0.5']]) {
        const t = setupInventory();
        t.ids[field].value = value;
        await t.save();
        assert.equal(t.db.inserts.length, 0, `${field}=${value}`);
        assert.match(t.ids.productStatusMsg.textContent, /mayor o igual a cero/);
    }
});

test('a pending lot with only a date does not silently save without the lot', async () => {
    const t = setupInventory();
    t.ids.loteExpInput.value = '2026-12-01';
    t.ids.addLoteBtn.click = () => t.ids.addLoteBtn.events.click();
    await t.save();
    assert.equal(t.db.inserts.length, 0);
    assert.equal(t.alerts.length, 1);
});

test('combos accept only positive integer component quantities', async () => {
    for (const value of ['-1', '0', '1.5', '', 'Infinity']) {
        const t = setupInventory();
        t.setQuantities([value, '1']);
        await t.saveCombo();
        assert.equal(t.db.inserts.length, 0, `quantity=${value}`);
    }
    const t = setupInventory();
    t.setQuantities(['2', '3']);
    await t.saveCombo();
    assert.equal(t.db.inserts[0].payload[0].codigo, 'COMBO:1-2,2-3');
});

test('percentage discounts follow quantity changes and manual discounts stay fixed', () => {
    const t = setupPos();
    t.discountButton.events.click({ target: t.discountButton });
    t.pos.addToCart(product());
    assert.equal(t.ids.cartDiscount.value, '2.00');
    assert.equal(t.ids.cartTotalValue.textContent, 'S/ 18.00');
    t.ids.cartDiscount.value = '3';
    t.ids.cartDiscount.events.input();
    t.pos.addToCart(product());
    assert.equal(t.ids.cartDiscount.value, '3');
    assert.equal(t.ids.cartTotalValue.textContent, 'S/ 27.00');
});

test('checkout rejects invalid discounts and split payments before changing stock', async () => {
    for (const discount of ['-1', '11', 'Infinity']) {
        const t = setupPos();
        t.ids.cartDiscount.value = discount;
        await t.checkout();
        assert.equal(t.db.updates.length, 0);
        assert.equal(t.db.inserts.length, 0);
        assert.equal(t.state.cart.length, 1);
    }
    const t = setupPos();
    t.ids.paymentMethod.value = 'Ambos';
    t.ids.splitEfectivo.value = '-5';
    t.ids.splitYape.value = '15';
    await t.checkout();
    assert.equal(t.db.inserts.length, 0);
    assert.match(t.alerts[0], /mayores o iguales a cero/);
    const short = setupPos();
    short.ids.paymentMethod.value = 'Ambos';
    short.ids.splitEfectivo.value = '0';
    short.ids.splitYape.value = '9.99';
    await short.checkout();
    assert.equal(short.db.inserts.length, 0);
    assert.match(short.alerts[0], /no coinciden/);
});

test('checkout rejects exhausted inventory and invalid combo quantities', async () => {
    const exhausted = setupPos({ products: [product(1, { stock: 0 })] });
    await exhausted.checkout();
    assert.equal(exhausted.db.updates.length, 0);
    assert.match(exhausted.alerts[0], /Stock insuficiente/);
    const malformed = setupPos({ items: [product(5, { codigo: 'COMBO:1-1.5,2-1' })] });
    await malformed.checkout();
    assert.equal(malformed.db.updates.length, 0);
    assert.equal(malformed.db.inserts.length, 0);
});

test('a rejected sale restores stock, retains the ticket and does not open a receipt', async () => {
    const t = setupPos({ receipt: true, dbOptions: { onInsert: async () => ({ error: { message: 'Venta rechazada' } }) } });
    await t.checkout();
    assert.equal(t.db.rows[0].stock, 10);
    assert.equal(t.db.updates.length, 2);
    assert.equal(t.state.cart.length, 1);
    assert.equal(t.ids.receiptModal.classList.contains('hidden'), true);
    assert.equal(t.ids.cobrarBtn.disabled, false);
    assert.match(t.alerts[0], /Venta rechazada/);
});

test('a stock error restores earlier changes and prevents recording the sale', async () => {
    const t = setupPos({ products: [product(), product(2)], items: [product(), product(2)], dbOptions: { onUpdate: async (_operation, count) => count === 2 ? { data: null, error: { message: 'Stock rechazado' } } : null } });
    await t.checkout();
    assert.equal(t.db.rows[0].stock, 10);
    assert.equal(t.db.rows[1].stock, 10);
    assert.equal(t.db.inserts.length, 0);
    assert.equal(t.state.cart.length, 2);
    assert.match(t.alerts[0], /Stock rechazado/);
});

test('concurrent stock changes are detected and rollback conflicts are visible', async () => {
    const conflict = setupPos({ dbOptions: { onUpdate: async (_op, count, rows) => { if (count === 1) rows[0].stock = 8; } } });
    await conflict.checkout();
    assert.equal(conflict.db.rows[0].stock, 8);
    assert.equal(conflict.db.inserts.length, 0);
    assert.match(conflict.alerts[0], /otra caja/);
    const rollback = setupPos({ dbOptions: {
        onInsert: async () => ({ error: { message: 'Venta rechazada' } }),
        onUpdate: async (_op, count, rows) => { if (count === 2) rows[0].stock = 7; }
    } });
    await rollback.checkout();
    assert.equal(rollback.db.rows[0].stock, 7);
    assert.match(rollback.alerts[0], /No se pudo restaurar todo el stock/);
});

test('checkout locks the ticket while saving and prevents duplicate submissions', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const t = setupPos({ dbOptions: { onUpdate: async () => { await pending; } } });
    const checkout = t.checkout();
    t.pos.addToCart(product(2));
    t.window.updateQty(0, 1);
    await t.checkout();
    assert.equal(t.state.cart.length, 1);
    assert.equal(t.state.cart[0].qty, 1);
    release();
    await checkout;
    assert.equal(t.db.inserts.length, 1);
    assert.equal(t.db.rows[0].stock, 9);
});

test('checkout aggregates overlapping combo products including UUID identifiers', async () => {
    const id = 'a5ad946d-3d32-4a44-92e1-69c4bce6200f';
    const component = product(id);
    const t = setupPos({ products: [component], items: [component, product(9, { codigo: `COMBO:${id}-2` })] });
    await t.checkout();
    assert.equal(t.db.rows[0].stock, 7);
    assert.equal(t.db.updates.length, 1);
    assert.equal(t.db.inserts[0].payload[0].costo_total, 12);
});

test('completed receipts preserve payment details and closing them keeps the next ticket', async () => {
    const t = setupPos({ receipt: true });
    t.ids.paymentMethod.value = 'Ambos';
    t.ids.splitEfectivo.value = '4';
    t.ids.splitYape.value = '6';
    await t.checkout();
    assert.equal(t.state.cart.length, 0);
    assert.equal(t.ids.paymentMethod.value, 'Efectivo');
    assert.equal(t.ids.receiptPaymentMethod.textContent, 'S/ 4.00 Efvo | S/ 6.00 Yape');
    assert.equal(t.ids.receiptItems.children.length, 1);
    t.pos.addToCart(product(2));
    t.ids.closeReceiptBtn.onclick();
    assert.equal(t.state.cart.length, 1);
    assert.equal(t.timers.size, 0);
});

test('product reloads preserve POS filters and clamp pages after the list shrinks', () => {
    const products = Array.from({ length: 30 }, (_, index) => product(index + 1, { categoria: 'Bebidas' }));
    const t = setupPos({ products });
    t.pos.renderPosGrid(products);
    t.ids.posNextPageBtn.events.click();
    assert.equal(t.ids.posPaginationInfo.textContent, 'Página 2 de 2');
    t.pos.renderPosGrid([products[0]]);
    assert.equal(t.ids.posPaginationInfo.textContent, 'Página 1 de 1');
    assert.equal(t.ids.posGrid.children.length, 1);
    t.categoryButton.events.click({ target: t.categoryButton });
    t.pos.renderPosGrid([...products, product(99, { categoria: 'Snacks' })]);
    assert.equal(t.ids.posGrid.children.some(child => child.innerHTML.includes('Producto 99')), false);
    t.ids.posSearch.value = 'Producto 30';
    t.ids.posSearch.events.input();
    t.pos.renderPosGrid(products);
    assert.equal(t.ids.posGrid.children.length, 1);
    assert.match(t.ids.posGrid.children[0].innerHTML, /Producto 30/);
});
