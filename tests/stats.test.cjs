const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, utils, constants, rendered, fakeDocument, elements, fakeSupabase, plain } = require('./helpers.cjs');

const LOCAL = 'LAS BRISAS';
const STAT_IDS = ['statsMonth', 'exportStatsBtn', 'topProductsList', 'salesChart', 'statVentas', 'statMargen',
    'statDescuentos', 'statReembolsos', 'statReembolsosDetalle', 'statVentasDetalle'];

function setupStats({ ventas = [], month = '2026-10', rpc = {} } = {}) {
    const ids = elements(STAT_IDS);
    const supabase = fakeSupabase({ tables: { ventas }, rpc: { resumen_productos: () => [], ...rpc } });
    const alerts = [];
    const charts = [];
    const sheets = [];
    const files = [];
    class FakeChart {
        constructor(_ctx, config) { this.config = config; charts.push(this); }
        destroy() { this.destroyed = true; }
    }
    const XLSX = {
        utils: {
            book_new: () => ({}),
            aoa_to_sheet: rows => ({ rows }),
            book_append_sheet: (_wb, sheet, name) => sheets.push({ name, rows: sheet.rows })
        },
        writeFile: (_wb, name) => files.push(name)
    };
    const { exports } = loadModule('stats.js', {
        document: fakeDocument(ids), supabase,
        state: { currentLocal: LOCAL },
        customAlert: async message => { alerts.push(message); },
        localPorId: constants().localPorId,
        ...utils()
    });
    const stats = exports.setupStats({ loadChart: async () => ({ default: FakeChart }), loadXLSX: async () => XLSX });
    ids.statsMonth.value = month;
    return { ids, supabase, stats, alerts, charts, sheets, files };
}

function withTimezone(tz, fn) {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    return Promise.resolve(fn()).finally(() => {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    });
}

const sale = (id, fecha, overrides = {}) => ({ id, local: LOCAL, fecha, total: 1, descuento: 0, subtotal: 1, costo_total: 0.4, estado: null, metodo_pago: 'Efectivo', efectivo: 1, yape: 0, detalles: [{ qty: 1, nombre: 'Agua' }], ...overrides });

test('las estadísticas usan los límites del mes en hora local y ordenan para paginar', () => withTimezone('America/Bogota', async () => {
    const t = setupStats();
    await t.stats.calcularEstadisticas();
    const query = t.supabase.calls.find(c => c.table === 'ventas');
    assert.deepEqual(plain(query.filters), [
        ['eq', 'local', LOCAL],
        ['gte', 'fecha', '2026-10-01T05:00:00.000Z'],
        ['lt', 'fecha', '2026-11-01T05:00:00.000Z']
    ]);
    assert.deepEqual(plain(query.orders), [['fecha', true], ['id', true]]);
    assert.deepEqual(plain(query.range), [0, 999]);
}));

test('cuenta todas las ventas del mes aunque pasen de 1000', async () => {
    const ventas = Array.from({ length: 2500 }, (_, i) => sale(i + 1, new Date(Date.UTC(2026, 9, 2 + (i % 25), 15)).toISOString()));
    const t = setupStats({ ventas });
    await t.stats.calcularEstadisticas();
    assert.equal(t.ids.statVentas.textContent, 'S/ 2500.00');
    assert.equal(t.ids.statVentasDetalle.textContent, '2500 ventas');
    assert.equal(t.supabase.calls.filter(c => c.table === 'ventas').length, 3);
});

test('muestra margen y reembolsos, y el gráfico usa los nombres correctos', async () => {
    const t = setupStats({ ventas: [
        sale(1, '2026-10-05T15:00:00Z', { total: 10, costo_total: 4, descuento: 2 }),
        sale(2, '2026-10-06T15:00:00Z', { total: 8, costo_total: 3, estado: 'reembolsada' })
    ] });
    await t.stats.calcularEstadisticas();
    assert.equal(t.ids.statVentas.textContent, 'S/ 10.00');
    assert.equal(t.ids.statMargen.textContent, 'S/ 6.00');
    assert.equal(t.ids.statDescuentos.textContent, 'S/ 2.00');
    assert.equal(t.ids.statReembolsos.textContent, 'S/ 8.00');
    assert.equal(t.ids.statReembolsosDetalle.textContent, '1 venta');
    const config = t.charts[0].config;
    assert.deepEqual(plain(config.data.datasets.map(d => d.label)), ['Ventas (S/)', 'Margen (S/)', 'Descuentos (S/)']);
    assert.equal(config.data.labels.length, 31);
});

test('los productos más vendidos se muestran escapados', async () => {
    const t = setupStats({ rpc: { resumen_productos: () => [{ producto: '<img src=x onerror=alert(1)>', unidades: 3, total_vendido: 9, costo_total: 4 }] } });
    await t.stats.calcularEstadisticas();
    const html = rendered(t.ids.topProductsList);
    assert.equal(html.includes('<img src=x'), false);
    assert.match(html, /&lt;img src=x/);
    assert.match(html, /S\/ 5\.00/);
    assert.equal(t.supabase.rpcCalls[0].params.p_local, LOCAL);
});

test('el Excel incluye todas las ventas, separa los reembolsos y usa nombres correctos', () => withTimezone('America/Lima', async () => {
    const ventas = [
        ...Array.from({ length: 1100 }, (_, i) => sale(i + 1, new Date(Date.UTC(2026, 8, 1 + (i % 28), 15)).toISOString())),
        ...Array.from({ length: 100 }, (_, i) => sale(2000 + i, new Date(Date.UTC(2026, 9, 1 + (i % 28), 15)).toISOString())),
        sale(5000, '2026-10-10T15:00:00Z', { estado: 'reembolsada', total: 7, motivo_reembolso: 'Cobro duplicado', reembolsado_por_email: 'zzenisx1234@gmail.com', reembolsado_en: '2026-10-10T15:05:00Z' })
    ];
    const t = setupStats({ ventas });
    await t.stats.exportarExcel();
    assert.deepEqual(t.sheets.map(s => s.name), ['Resumen General', 'Setiembre 2026', 'Octubre 2026', 'Reembolsos']);
    const resumen = t.sheets[0].rows;
    assert.deepEqual(plain(resumen[2]), ['Mes', 'N° Ventas', 'Ventas (S/)', 'Descuentos (S/)', 'Margen (S/)', 'Reembolsos (N°)', 'Reembolsos (S/)']);
    const total = resumen.find(row => row[0] === 'TOTAL HISTÓRICO');
    assert.deepEqual(plain(total), ['TOTAL HISTÓRICO', 1200, 1200, 0, 720, 1, 7]);
    const septiembre = t.sheets[1].rows;
    assert.equal(septiembre.length - 11, 1100, 'todas las ventas de setiembre, aunque superen 1000');
    const octubre = t.sheets[2].rows;
    assert.equal(octubre.length - 11, 100, 'la venta reembolsada no está en el detalle del mes');
    const reembolsos = t.sheets[3].rows;
    assert.equal(reembolsos.length, 4);
    assert.deepEqual(plain(reembolsos[3].slice(-3, -2)), ['zzenisx1234']);
    assert.equal(reembolsos[3].at(-1), 'Cobro duplicado');
    assert.match(t.files[0], /^Reporte_Kalo_brisas_\d{4}-\d{2}-\d{2}\.xlsx$/);
    assert.equal(t.ids.exportStatsBtn.disabled, false);
}));

test('sin ventas, el Excel avisa en lugar de generar un archivo vacío', async () => {
    const t = setupStats();
    await t.stats.exportarExcel();
    assert.equal(t.files.length, 0);
    assert.match(t.alerts[0], /No hay ventas/);
});

test('el top muestra exactamente 10 productos, numerados en orden', async () => {
    const filas = Array.from({ length: 25 }, (_, i) => ({ producto: `Producto ${i + 1}`, unidades: 30 - i, total_vendido: 100 - i, costo_total: 10 }));
    const t = setupStats({ rpc: { resumen_productos: () => filas } });
    await t.stats.calcularEstadisticas();
    const html = rendered(t.ids.topProductsList);
    assert.equal((html.match(/<tr>/g) || []).length, 10);
    assert.match(html, /rank-badge is-podium">1<\/span><\/td>\s*<td class="top-product-name">Producto 1</);
    assert.match(html, /rank-badge">10<\/span><\/td>\s*<td class="top-product-name">Producto 10</);
    assert.equal(html.includes('Producto 11<'), false);
});
