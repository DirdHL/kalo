const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { loadModule, utils, constants, rendered, fakeDocument, elements, fakeSupabase, plain } = require('./helpers.cjs');

const { exports: reporte } = loadModule('reporte.js', { ...utils(), ...constants(), Date });

const LOCAL = 'LAS BRISAS';
const STAT_IDS = ['statsMonth', 'exportStatsBtn', 'topProductsList', 'salesChart', 'statVentas', 'statMargen',
    'statDescuentos', 'statReembolsos', 'statReembolsosDetalle', 'statVentasDetalle', 'reportPeriod'];

function setupStats({ ventas = [], productos = [], month = '2026-10', rpc = {}, period = 'mes', local = LOCAL } = {}) {
    const ids = elements(STAT_IDS);
    const supabase = fakeSupabase({ tables: { ventas, productos }, rpc: { resumen_productos: () => [], ...rpc } });
    const alerts = [];
    const charts = [];
    const files = [];
    class FakeChart {
        constructor(_ctx, config) { this.config = config; charts.push(this); }
        destroy() { this.destroyed = true; }
    }
    const { exports } = loadModule('stats.js', {
        document: fakeDocument(ids), supabase,
        state: { currentLocal: local },
        customAlert: async message => { alerts.push(message); },
        ...constants(),
        ...reporte,
        ...utils()
    });
    const stats = exports.setupStats({
        loadChart: async () => ({ default: FakeChart }),
        loadExcel: async () => ExcelJS,
        descargar: async (contenido, nombre) => { files.push({ contenido, nombre }); }
    });
    ids.statsMonth.value = month;
    ids.reportPeriod.value = period;
    return { ids, supabase, stats, alerts, charts, files };
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

const ventaConItems = (id, fecha, overrides = {}) => sale(id, fecha, {
    total: 10, subtotal: 10, costo_total: 4, efectivo: 10,
    venta_items: [{ producto_id: 1, nombre: 'Agua', cantidad: 2, precio_unitario: 5, costo_unitario: 2, componentes: null }],
    ...overrides
});
const productosBrisas = [{ id: 1, nombre: 'Agua', categoria: 'Bebidas', local: LOCAL, stock: 8, alerta_stock: 2, precio_compra: 2, precio_venta: 5, lotes: null, activo: true }];

async function abrir(file) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.contenido);
    return wb;
}

test('el reporte del mes pide ventas con su detalle, compara con el mes anterior y descarga un Excel con diseño', () => withTimezone('America/Lima', async () => {
    const ventas = [
        ...Array.from({ length: 1200 }, (_, i) => ventaConItems(i + 1, new Date(Date.UTC(2026, 9, 1 + (i % 28), 15)).toISOString())),
        ventaConItems(5000, '2026-10-10T15:00:00Z', { estado: 'reembolsada', motivo_reembolso: 'Cobro duplicado', reembolsado_por_email: 'zzenisx1234@gmail.com', reembolsado_en: '2026-10-10T15:05:00Z' }),
        ventaConItems(6000, '2026-09-10T15:00:00Z', { total: 300 })
    ];
    const t = setupStats({ ventas, productos: productosBrisas });
    await t.stats.exportarExcel();
    assert.deepEqual(t.alerts, []);
    assert.equal(t.files.length, 1);
    assert.equal(t.files[0].nombre, 'Kalo_Reporte_2026-10_Las-Brisas.xlsx');

    const consultas = t.supabase.calls.filter(c => c.table === 'ventas');
    assert.match(consultas[0].columns, /venta_items\(producto_id, nombre, cantidad, precio_unitario, costo_unitario, componentes\)/);
    assert.deepEqual(plain(consultas[0].filters), [['eq', 'local', LOCAL], ['gte', 'fecha', '2026-10-01T05:00:00.000Z'], ['lt', 'fecha', '2026-11-01T05:00:00.000Z']]);
    assert.equal(consultas.filter(c => c.filters.some(f => f[2] === '2026-10-01T05:00:00.000Z' && f[0] === 'gte')).length, 2, 'pagina: 1201 ventas en 2 páginas');
    assert.ok(consultas.some(c => c.filters.some(f => f[0] === 'gte' && f[2] === '2026-09-01T05:00:00.000Z')), 'pide el mes anterior para comparar');
    assert.deepEqual(plain(t.supabase.calls.find(c => c.table === 'productos').filters), [['eq', 'activo', true], ['eq', 'local', LOCAL]]);

    const wb = await abrir(t.files[0]);
    assert.deepEqual(wb.worksheets.map(ws => ws.name), ['Resumen', 'Por día', 'Productos', 'Categorías', 'Vendedoras', 'Pérdidas y alertas', 'Ventas', 'Reembolsos', 'Inventario']);
    const resumen = wb.getWorksheet('Resumen');
    assert.equal(resumen.getCell('A6').value, 12000, 'todas las ventas del mes, aunque pasen de 1000');
    assert.equal(resumen.getCell('A1').fill.fgColor.argb, 'FF233E3A', 'encabezado con el color de Kalo');
    assert.equal(wb.getWorksheet('Ventas').rowCount >= 1201 + 5, true);
    assert.equal(t.ids.exportStatsBtn.disabled, false);
}));

test('cada local es aparte: desde El Polideportivo el reporte trae solo sus ventas', async () => {
    const t = setupStats({
        local: 'EL POLIDEPORTIVO',
        ventas: [ventaConItems(1, '2026-10-05T15:00:00Z', { local: 'EL POLIDEPORTIVO' }), ventaConItems(2, '2026-10-06T15:00:00Z'), ventaConItems(3, '2026-10-07T15:00:00Z', { local: 'LOS PINOS' })]
    });
    await t.stats.exportarExcel();
    for (const consulta of t.supabase.calls.filter(c => c.table === 'ventas' || c.table === 'productos')) {
        assert.ok(consulta.filters.some(f => f[0] === 'eq' && f[1] === 'local' && f[2] === 'EL POLIDEPORTIVO'), consulta.table);
        assert.equal(consulta.filters.some(f => f[0] === 'in'), false);
    }
    const wb = await abrir(t.files[0]);
    assert.equal(wb.getWorksheet('Locales'), undefined);
    assert.equal(wb.getWorksheet('Resumen').getCell('A2').value, 'Octubre 2026 · El Polideportivo');
    assert.equal(wb.getWorksheet('Resumen').getCell('A6').value, 10, 'solo la venta de Poli');
    assert.equal(t.files[0].nombre, 'Kalo_Reporte_2026-10_El-Polideportivo.xlsx');
});

test('el año completo pide todo el año y agrupa por mes', () => withTimezone('America/Lima', async () => {
    const t = setupStats({ ventas: [ventaConItems(1, '2026-03-05T15:00:00Z'), ventaConItems(2, '2026-10-06T15:00:00Z')], period: 'anio' });
    await t.stats.exportarExcel();
    const consulta = t.supabase.calls.find(c => c.table === 'ventas');
    assert.deepEqual(plain(consulta.filters.slice(1)), [['gte', 'fecha', '2026-01-01T05:00:00.000Z'], ['lt', 'fecha', '2027-01-01T05:00:00.000Z']]);
    const wb = await abrir(t.files[0]);
    assert.ok(wb.getWorksheet('Por mes'));
    assert.equal(t.files[0].nombre, 'Kalo_Reporte_2026_Las-Brisas.xlsx');
}));

test('sin ventas en el periodo, el reporte avisa en lugar de generar un archivo vacío', async () => {
    const t = setupStats();
    await t.stats.exportarExcel();
    assert.equal(t.files.length, 0);
    assert.match(t.alerts[0], /No hay ventas registradas en Octubre 2026/);
    assert.equal(t.ids.exportStatsBtn.disabled, false);
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
