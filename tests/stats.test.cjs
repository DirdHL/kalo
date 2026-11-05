const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { loadModule, utils, constants, rendered, fakeDocument, elements, fakeSupabase, plain } = require('./helpers.cjs');

const { exports: reporte } = loadModule('reporte.js', { ...utils(), ...constants(), Date });

const LOCAL = 'LAS BRISAS';
const STAT_IDS = ['statsView', 'statsMonth', 'statsMonthLabel', 'prevMonthBtn', 'nextMonthBtn', 'thisMonthBtn',
    'exportStatsBtn', 'exportYearBtn', 'reportBoxTitle', 'topProductsList', 'salesChart', 'chartEmpty',
    'statsDaysList', 'statsDaysTotal', 'statVentas', 'statMargen', 'statDescuentos', 'statReembolsos',
    'statReembolsosDetalle', 'statVentasDetalle'];

// "Hoy" fijo para las pruebas: jueves 5 de noviembre de 2026, 10:00 (hora local).
const HOY = () => new Date(2026, 10, 5, 10, 0);

function setupStats({ ventas = [], productos = [], month = '2026-10', rpc = {}, local = LOCAL, fail = {} } = {}) {
    const ids = elements(STAT_IDS);
    const supabase = fakeSupabase({ tables: { ventas, productos }, rpc: { resumen_productos: () => [], ...rpc }, fail });
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
        descargar: async (contenido, nombre) => { files.push({ contenido, nombre }); },
        ahora: HOY
    });
    ids.statsMonth.value = month;
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

test('muestra margen y reembolsos; el gráfico tiene barras de ventas y una línea de margen', async () => {
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
    assert.deepEqual(plain(config.data.datasets.map(d => [d.type, d.label])), [['bar', 'Ventas'], ['line', 'Margen']]);
    assert.equal(config.data.labels.length, 31);
    assert.equal(config.data.labels[0], '1', 'el eje muestra solo el número del día');
    assert.equal(config.data.datasets[0].data[4], 10);
    assert.equal(config.data.datasets[1].data[4], 6);
    assert.equal(config.data.datasets[0].data[5], 0, 'el día del reembolso no suma ventas');
    assert.equal(config.options.plugins.legend.display, false, 'la leyenda va escrita en la página y no oculta líneas');
    assert.equal(config.options.scales.x.title.text, 'Días de octubre');
    assert.equal(t.ids.chartEmpty.classList.contains('hidden'), true);
    assert.equal(t.ids.statsView.classList.contains('is-loading'), false);
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

test('el botón del año descarga todo el año, agrupado por mes', () => withTimezone('America/Lima', async () => {
    const t = setupStats({ ventas: [ventaConItems(1, '2026-03-05T15:00:00Z'), ventaConItems(2, '2026-10-06T15:00:00Z')] });
    await t.ids.exportYearBtn.click();
    const consulta = t.supabase.calls.find(c => c.table === 'ventas');
    assert.deepEqual(plain(consulta.filters.slice(1)), [['gte', 'fecha', '2026-01-01T05:00:00.000Z'], ['lt', 'fecha', '2027-01-01T05:00:00.000Z']]);
    const wb = await abrir(t.files[0]);
    assert.ok(wb.getWorksheet('Por mes'));
    assert.equal(t.files[0].nombre, 'Kalo_Reporte_2026_Las-Brisas.xlsx');
    assert.equal(t.ids.exportYearBtn.disabled, false);
    assert.equal(t.ids.exportStatsBtn.disabled, false);
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

// --- Filtro de mes y gráfico más claros ---

test('el mes en curso no dibuja los días que faltan y la tabla llega hasta hoy', () => withTimezone('America/Lima', async () => {
    const t = setupStats({ month: '2026-11', ventas: [
        sale(1, '2026-11-01T15:00:00Z', { total: 20, costo_total: 12 }),
        sale(2, '2026-11-05T14:00:00Z', { total: 8, costo_total: 5, descuento: 2 }),
        sale(3, '2026-11-05T14:30:00Z', { total: 4, costo_total: 1 })
    ] });
    await t.stats.calcularEstadisticas();
    const config = t.charts[0].config;
    const [ventas, margen] = config.data.datasets.map(d => d.data);
    assert.equal(config.data.labels.length, 30);
    assert.deepEqual(plain(ventas.slice(0, 5)), [20, 0, 0, 0, 12]);
    assert.deepEqual(plain(margen.slice(0, 5)), [8, 0, 0, 0, 6]);
    assert.ok(ventas.slice(5).every(v => v === null), 'del 6 al 30 no hay barras: todavía no llegan');
    assert.ok(margen.slice(5).every(v => v === null), 'ni puntos de margen que caigan a cero');

    const { tooltip } = config.options.plugins;
    const item = (dataIndex, datasetIndex = 0) => ({ dataIndex, datasetIndex, raw: config.data.datasets[datasetIndex].data[dataIndex], dataset: config.data.datasets[datasetIndex] });
    assert.equal(tooltip.callbacks.title([item(4)]), 'Hoy, jueves, 5 de noviembre');
    assert.equal(tooltip.callbacks.title([item(0)]), 'Domingo, 1 de noviembre');
    assert.equal(tooltip.callbacks.label(item(4)), 'Ventas: S/ 12.00');
    assert.equal(tooltip.callbacks.label(item(4, 1)), 'Margen: S/ 6.00');
    assert.equal(tooltip.callbacks.footer([item(4)]), '2 ventas · Descuentos: S/ 2.00');
    assert.equal(tooltip.callbacks.footer([item(1)]), 'Sin ventas este día');
    assert.equal(tooltip.filter(item(10)), false, 'un día que todavía no llega no muestra montos');
    assert.equal(tooltip.callbacks.title([]), '', 'sin datos (día futuro) no hay recuadro ni error');
    assert.ok(tooltip.itemSort(item(4), item(4, 1)) < 0, 'en el recuadro, Ventas va antes que Margen');
    assert.equal(tooltip.callbacks.footer([]), '');

    assert.equal(t.ids.statsMonthLabel.textContent, 'Noviembre de 2026 (mes en curso)');
    assert.equal(t.ids.nextMonthBtn.disabled, true, 'no se puede ir a un mes que no llega');
    assert.equal(t.ids.thisMonthBtn.disabled, true);
    const tabla = rendered(t.ids.statsDaysList);
    assert.equal((tabla.match(/<tr>/g) || []).length, 5, 'del 1 al 5 de noviembre');
    assert.match(tabla, /<td>Dom 1<\/td>/);
    assert.match(tabla, /<td>Jue 5 \(hoy\)<\/td>/);
    assert.match(tabla, /Mar 3<\/td><td colspan="4" class="is-empty">Sin ventas/);
    const total = rendered(t.ids.statsDaysTotal);
    assert.match(total, /Total del mes<\/td>\s*<td class="money-cell">S\/ 32\.00<\/td>\s*<td class="money-cell">3<\/td>\s*<td class="money-cell">S\/ 14\.00/);
}));

test('las flechas cambian de mes, cruzan de año y no dejan pasar al futuro', async () => {
    const t = setupStats({ month: '2026-11' });
    await t.stats.calcularEstadisticas();
    assert.equal(t.ids.exportStatsBtn.textContent, 'Noviembre 2026');
    assert.equal(t.ids.exportYearBtn.textContent, 'Todo el año 2026');
    assert.equal(t.ids.reportBoxTitle.textContent, 'Descargar reporte en Excel de Las Brisas');

    await t.ids.prevMonthBtn.click();
    assert.equal(t.ids.statsMonth.value, '2026-10');
    assert.equal(t.ids.statsMonthLabel.textContent, 'Octubre de 2026');
    assert.equal(t.ids.nextMonthBtn.disabled, false);
    assert.equal(t.ids.thisMonthBtn.disabled, false);
    assert.equal(t.ids.exportStatsBtn.textContent, 'Octubre 2026', 'el botón del reporte sigue al mes elegido');
    const ultima = t.supabase.calls.filter(c => c.table === 'ventas').at(-1);
    assert.equal(ultima.filters.find(f => f[0] === 'gte')[2], new Date(2026, 9, 1).toISOString());

    t.ids.statsMonth.value = '2026-01';
    await t.ids.prevMonthBtn.click();
    assert.equal(t.ids.statsMonth.value, '2025-12');
    assert.equal(t.ids.statsMonthLabel.textContent, 'Diciembre de 2025');
    assert.equal(t.ids.exportYearBtn.textContent, 'Todo el año 2025');

    await t.ids.nextMonthBtn.click();
    assert.equal(t.ids.statsMonth.value, '2026-01');
    await t.ids.thisMonthBtn.click();
    assert.equal(t.ids.statsMonth.value, '2026-11');

    for (const escrito of ['2027-03', '2026-13', 'marzo', '']) {
        t.ids.statsMonth.value = escrito;
        await t.stats.calcularEstadisticas();
        assert.equal(t.ids.statsMonth.value, '2026-11', `"${escrito}" vuelve al mes actual`);
    }
    assert.equal(t.ids.statsMonth.max, '2026-11');
});

test('un mes sin ventas muestra un aviso en lugar de un gráfico vacío', async () => {
    const t = setupStats({ month: '2026-09' });
    await t.stats.calcularEstadisticas();
    assert.equal(t.charts.length, 0);
    assert.equal(t.ids.chartEmpty.classList.contains('hidden'), false);
    assert.equal(t.ids.chartEmpty.textContent, 'No hay ventas registradas en setiembre 2026.');
    assert.equal((rendered(t.ids.statsDaysList).match(/Sin ventas/g) || []).length, 30);
});

test('si las ventas no cargan, no queda el gráfico del mes anterior', async () => {
    let fallar = false;
    const t = setupStats({
        ventas: [sale(1, '2026-10-05T15:00:00Z')],
        fail: { ventas: () => (fallar ? { data: null, error: { message: 'Failed to fetch' } } : null) }
    });
    await t.stats.calcularEstadisticas();
    assert.equal(t.charts.length, 1);
    fallar = true;
    await t.ids.prevMonthBtn.click();
    assert.equal(t.charts[0].destroyed, true);
    assert.equal(t.ids.chartEmpty.classList.contains('hidden'), false);
    assert.equal(t.ids.chartEmpty.textContent, 'No se pudieron cargar las ventas de este mes.');
    assert.equal(t.ids.statVentas.textContent, 'S/ 0.00');
    assert.equal(t.alerts.length, 1);
    assert.equal(t.ids.statsView.classList.contains('is-loading'), false);
});
