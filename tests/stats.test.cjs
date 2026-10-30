const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'stats.js'), 'utf8')
    .replace(/^import .*;\r?$/gm, '')
    .replace('export function setupStats', 'function setupStats');
const LOCAL = 'LAS BRISAS';

function createHarness({ products = [], sales = [], failQuery, confirm, onProductsChanged, monthInput } = {}) {
    const db = structuredClone({ productos: products, ventas: sales });
    const queries = [];
    const alerts = [];
    const errors = [];
    let confirmations = 0;
    const matches = (row, filters) => filters.every(([operator, key, value]) => {
        if (operator === 'in') return value.some(id => String(id) === String(row[key]));
        if (operator === 'gte') return row[key] >= value;
        if (operator === 'lt') return row[key] < value;
        if (operator === 'is') return row[key] == null && value === null;
        return String(row[key]) === String(value);
    });
    const supabase = {
        from(table) {
            return {
                table, operation: 'select', filters: [],
                select() { return this; },
                update(values) { this.operation = 'update'; this.values = values; return this; },
                eq(key, value) { this.filters.push(['eq', key, value]); return this; },
                is(key, value) { this.filters.push(['is', key, value]); return this; },
                in(key, value) { this.filters.push(['in', key, value]); return this; },
                gte(key, value) { this.filters.push(['gte', key, value]); return this; },
                lt(key, value) { this.filters.push(['lt', key, value]); return this; },
                order() { return this; },
                single() { this.singleResult = true; return this; },
                then(resolve, reject) {
                    return Promise.resolve().then(() => {
                        queries.push(this);
                        const failure = failQuery?.(this, db);
                        if (failure) return failure;
                        const rows = db[table].filter(row => matches(row, this.filters));
                        if (this.operation === 'update') rows.forEach(row => Object.assign(row, this.values));
                        if (this.singleResult && rows.length !== 1) return { data: null, error: new Error('Venta no encontrada') };
                        return { data: structuredClone(this.singleResult ? rows[0] : rows), error: null };
                    }).then(resolve, reject);
                }
            };
        }
    };
    const state = { currentLocal: LOCAL, globalProducts: products.map(product => ({ ...product, stock: 1 })) };
    const window = {};
    const context = {
        console: { error: (...args) => errors.push(args), warn() {} },
        document: { getElementById: id => id === 'statsMonth' ? monthInput || null : null },
        window, state, supabase,
        customConfirm: async () => { confirmations++; return confirm ? confirm() : true; },
        customAlert: async message => { alerts.push(message); }
    };
    vm.createContext(context);
    vm.runInContext(source + '\nthis.stats = setupStats({onProductsChanged});', Object.assign(context, { onProductsChanged }));
    return { db, queries, alerts, errors, window, stats: context.stats, get confirmations() { return confirmations; } };
}

const product = (id, stock) => ({ id, stock, local: LOCAL });
const sale = (detalles, extra = {}) => ({ id: 'sale-1', local: LOCAL, estado: 'completada', detalles, ...extra });

test('refund aggregates shared combo components and uses fresh database stock', async () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    let refreshes = 0;
    const harness = createHarness({
        products: [product(id, 20), product(2, 5), product(3, null)],
        sales: [sale([
            { id, qty: 2 },
            { codigo: `COMBO:${id}-3,2-2`, qty: 1 },
            { codigo: `COMBO:${id}-1`, qty: 2 },
            { id: 3, qty: 1 }
        ], { estado: null })],
        onProductsChanged: async () => { refreshes++; }
    });
    await harness.window.refundSale('sale-1');
    assert.equal(harness.db.productos[0].stock, 27);
    assert.equal(harness.db.productos[1].stock, 7);
    assert.equal(harness.db.productos[2].stock, null);
    assert.equal(harness.db.ventas[0].estado, 'reembolsada');
    assert.equal(harness.queries.filter(query => query.table === 'productos' && query.operation === 'update').length, 2);
    assert.equal(refreshes, 1);
    assert.match(harness.alerts[0], /con éxito/);
});

test('refund compensates already restored products when a later stock update fails', async () => {
    const harness = createHarness({
        products: [product(1, 10), product(2, 20)],
        sales: [sale([{ id: 1, qty: 2 }, { id: 2, qty: 3 }])],
        failQuery: query => query.table === 'productos' && query.operation === 'update' && query.values.stock === 23
            ? { data: null, error: new Error('Sin permiso para actualizar stock') } : null
    });
    await harness.window.refundSale('sale-1');
    assert.deepEqual(harness.db.productos.map(row => row.stock), [10, 20]);
    assert.equal(harness.db.ventas[0].estado, 'completada');
    assert.equal(harness.queries.some(query => query.table === 'ventas' && query.operation === 'update'), false);
    assert.equal(harness.alerts.some(message => /con éxito/.test(message)), false);
    assert.match(harness.alerts[0], /Sin permiso/);
});

test('refund compensates stock when persisting the refunded state fails', async () => {
    const harness = createHarness({
        products: [product(1, 10)],
        sales: [sale([{ id: 1, qty: 2 }])],
        failQuery: query => query.table === 'ventas' && query.operation === 'update'
            ? { data: null, error: new Error('No se pudo guardar la venta') } : null
    });
    await harness.window.refundSale('sale-1');
    assert.equal(harness.db.productos[0].stock, 10);
    assert.equal(harness.db.ventas[0].estado, 'completada');
    assert.match(harness.alerts[0], /No se pudo guardar/);
});

test('concurrent stock changes are detected instead of overwritten', async () => {
    let changed = false;
    const harness = createHarness({
        products: [product(1, 10)],
        sales: [sale([{ id: 1, qty: 2 }])],
        failQuery(query, db) {
            if (!changed && query.table === 'productos' && query.operation === 'update') {
                db.productos[0].stock = 9;
                changed = true;
            }
        }
    });
    await harness.window.refundSale('sale-1');
    assert.equal(harness.db.productos[0].stock, 9);
    assert.equal(harness.db.ventas[0].estado, 'completada');
    assert.match(harness.alerts[0], /inventario cambió/);
});

test('refund reports a failed compensation and preserves the concurrent stock value', async () => {
    const harness = createHarness({
        products: [product(1, 10)],
        sales: [sale([{ id: 1, qty: 2 }])],
        failQuery(query, db) {
            if (query.table === 'ventas' && query.operation === 'update') {
                db.productos[0].stock = 13;
                return { data: null, error: new Error('Fallo al guardar') };
            }
        }
    });
    await harness.window.refundSale('sale-1');
    assert.equal(harness.db.productos[0].stock, 13);
    assert.equal(harness.db.ventas[0].estado, 'completada');
    assert.match(harness.alerts[0], /revisa el inventario antes de reintentar/);
});

test('double click opens one confirmation and restores stock once', async () => {
    let accept;
    const confirmation = new Promise(resolve => { accept = resolve; });
    const harness = createHarness({
        products: [product(1, 10)], sales: [sale([{ id: 1, qty: 2 }])],
        confirm: () => confirmation
    });
    const first = harness.window.refundSale('sale-1');
    const second = harness.window.refundSale('sale-1');
    assert.equal(harness.confirmations, 1);
    accept(true);
    await Promise.all([first, second]);
    assert.equal(harness.db.productos[0].stock, 12);
    assert.equal(harness.db.ventas[0].estado, 'reembolsada');
});

test('a screen refresh failure does not reverse a recorded refund', async () => {
    const harness = createHarness({
        products: [product(1, 10)], sales: [sale([{ id: 1, qty: 2 }])],
        onProductsChanged: async () => { throw new Error('Sin conexión al recargar'); }
    });
    await harness.window.refundSale('sale-1');
    assert.equal(harness.db.productos[0].stock, 12);
    assert.equal(harness.db.ventas[0].estado, 'reembolsada');
    assert.match(harness.alerts.at(-1), /se registró/);
});

test('a refund cannot update a sale from another local', async () => {
    const harness = createHarness({
        products: [product(1, 10)],
        sales: [sale([{ id: 1, qty: 2 }], { local: 'LOS PINOS' })]
    });
    await harness.window.refundSale('sale-1');
    assert.equal(harness.db.productos[0].stock, 10);
    assert.equal(harness.db.ventas[0].estado, 'completada');
    assert.match(harness.alerts[0], /no encontrada/);
});

test('monthly statistics use local month boundaries and an exclusive next-month limit', async () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'America/Bogota';
    try {
        const monthInput = { value: '', addEventListener() {} };
        const harness = createHarness({ monthInput });
        monthInput.value = '2026-10';
        await harness.stats.calcularEstadisticas();
        const query = harness.queries[0];
        assert.deepEqual(query.filters, [
            ['eq', 'local', LOCAL],
            ['gte', 'fecha', '2026-10-01T05:00:00.000Z'],
            ['lt', 'fecha', '2026-11-01T05:00:00.000Z']
        ]);
        const endOfOctober = new Date('2026-11-01T01:00:00.000Z');
        assert.equal(endOfOctober.getMonth(), 9);
        assert.ok(endOfOctober.toISOString() < query.filters[2][2]);
    } finally {
        if (previousTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = previousTimezone;
    }
});
