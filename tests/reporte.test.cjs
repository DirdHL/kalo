// Reporte Excel: cálculos y libro real con ExcelJS (se escribe y se vuelve a leer).
process.env.TZ = 'America/Lima';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { loadModule, utils, constants, plain } = require('./helpers.cjs');

const { exports: reporte } = loadModule('reporte.js', { ...utils(), ...constants(), Date });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const productos = [
    { id: 1, nombre: 'Agua_Cielo', categoria: 'Bebidas', local: 'LAS BRISAS', stock: 2, alerta_stock: 5, precio_compra: 1.2, precio_venta: 2.5, lotes: [{ qty: 3, vencimiento: '2026-10-01' }, { qty: 4, vencimiento: '2026-11-05' }] },
    { id: 2, nombre: 'Galleta', categoria: 'Snacks', local: 'LAS BRISAS', stock: 0, alerta_stock: 2, precio_compra: 0.8, precio_venta: 1.5, lotes: null },
    { id: 3, nombre: 'Chicle', categoria: 'Dulces', local: 'LAS BRISAS', stock: 50, alerta_stock: null, precio_compra: null, precio_venta: 0.5, lotes: null },
    { id: 9, nombre: 'Combo Lonchera', categoria: 'Combos', local: 'LAS BRISAS', stock: null, alerta_stock: null, precio_compra: 0, precio_venta: 6, lotes: null }
];
const item = (producto_id, nombre, cantidad, precio_unitario, costo_unitario, componentes = null) => ({ producto_id, nombre, cantidad, precio_unitario, costo_unitario, componentes });
const ventas = [
    { id: 101, fecha: '2026-10-05T15:00:00Z', local: 'LAS BRISAS', subtotal: 10, descuento: 0, total: 10, costo_total: 4.6, metodo_pago: 'Efectivo', efectivo: 10, yape: 0, estado: null, creado_por_email: 'lasbrisas_kalo@gmail.com',
        venta_items: [item(1, 'Agua Cielo', 2, 2.5, 1.2), item(9, 'Combo Lonchera', 1, 5, 2.2, [{ producto_id: '1', cantidad: 2 }])] },
    { id: 102, fecha: '2026-10-05T23:30:00Z', local: 'LAS BRISAS', subtotal: 2.5, descuento: 0.5, total: 2, costo_total: 1.6, metodo_pago: 'Yape', efectivo: 0, yape: 2, estado: null, creado_por_email: 'caja1@kalo.pe',
        venta_items: [item(2, 'Galleta', 2, 0.5, 0.8), item(3, 'Chicle', 3, 0.5, 0)] },
    { id: 103, fecha: '2026-10-12T16:00:00Z', local: 'LAS BRISAS', subtotal: 5, descuento: 0, total: 5, costo_total: 2.4, metodo_pago: 'Efectivo', efectivo: 5, yape: 0, estado: 'reembolsada', creado_por_email: 'lasbrisas_kalo@gmail.com',
        reembolsado_por_email: 'zzenisx1234@gmail.com', reembolsado_en: '2026-10-12T16:05:00Z', motivo_reembolso: 'Cobro duplicado', venta_items: [item(1, 'Agua Cielo', 2, 2.5, 1.2)] },
    { id: 104, fecha: '2026-10-20T20:00:00Z', local: 'LAS BRISAS', subtotal: null, descuento: 0, total: 2.5, costo_total: 1.2, metodo_pago: 'Efectivo', efectivo: null, yape: null, estado: null, creado_por_email: null,
        detalles: [{ id: 1, qty: 1, nombre: 'Agua_Cielo', precio_venta: 2.5, precio_compra: 1.2 }] }
];
const ventasPrevias = [
    { id: 90, total: 8, descuento: 0, costo_total: 3, estado: null, efectivo: 8, yape: 0 },
    { id: 91, total: 2, descuento: 0, costo_total: 1, estado: 'reembolsada', efectivo: 2, yape: 0 }
];
const ahora = new Date(2026, 9, 15, 12, 0);

function modelo(opciones = {}) {
    const rango = reporte.rangoPeriodo(opciones.periodo || 'mes', '2026-10');
    return reporte.calcularReporte({ ventas, ventasPrevias, productos, rango, locales: ['LAS BRISAS'], generadoPor: 'zzenisx1234@gmail.com', ahora, ...opciones, rango });
}

async function releer(wb) {
    const copia = new ExcelJS.Workbook();
    await copia.xlsx.load(await wb.xlsx.writeBuffer());
    return copia;
}

const buscarFila = (ws, columna, texto) => {
    let encontrada = null;
    ws.eachRow(row => { if (!encontrada && row.getCell(columna).value === texto) encontrada = row; });
    return encontrada;
};

test('el periodo se arma bien para un mes, un año y el mes anterior', () => {
    const mes = reporte.rangoPeriodo('mes', '2026-01');
    assert.equal(mes.titulo, 'Enero 2026');
    assert.equal(mes.tituloAnterior, 'Diciembre 2025');
    assert.equal(mes.anteriorDesde.getFullYear(), 2025);
    const anio = reporte.rangoPeriodo('anio', '2026-10');
    assert.equal(anio.titulo, 'Año 2026');
    assert.equal(anio.hasta.getFullYear(), 2027);
    assert.equal(reporte.rangoPeriodo('mes', 'basura'), null);
});

test('los totales cuentan ventas válidas, separan reembolsos y comparan con el mes anterior', () => {
    const m = modelo();
    const t = m.totales;
    assert.deepEqual([t.cantidad, t.ventas, t.descuentos, t.costo, t.margen, t.efectivo, t.yape], [3, 14.5, 0.5, 7.4, 7.1, 12.5, 2]);
    assert.deepEqual([t.reembolsos, t.cantidadReembolsos, t.unidades, t.subtotal, t.conDescuento, t.ticket], [5, 1, 9, 15, 1, 4.83]);
    const ventasFila = m.comparacion.find(c => c.clave === 'ventas');
    assert.equal(ventasFila.anterior, 8);
    assert.ok(Math.abs(ventasFila.variacion - 0.8125) < 1e-9);
    assert.match(m.periodoTexto, /^Del 1 de octubre de 2026 al 15 de octubre de 2026 \(periodo en curso\)$/);
    assert.equal(m.alcanceNombre, 'Las Brisas');
});

test('productos, categorías y vendedoras', () => {
    const m = modelo();
    assert.deepEqual(plain(m.productos.map(p => [p.producto, p.unidades, p.ventas, p.costo, p.margen])), [
        ['Agua Cielo', 3, 7.5, 3.6, 3.9], ['Combo Lonchera', 1, 5, 2.2, 2.8], ['Chicle', 3, 1.5, 0, 1.5], ['Galleta', 2, 1, 1.6, -0.6]
    ]);
    const galleta = m.productos.find(p => p.producto === 'Galleta');
    assert.equal(galleta.observacion, 'Vendido por debajo de su costo');
    assert.equal(m.productos.find(p => p.producto === 'Chicle').observacion, 'Sin precio de compra registrado');
    assert.equal(m.productos[0].participacion, 0.5);
    assert.equal(m.productos.find(p => p.producto === 'Combo Lonchera').categoria, 'Combos');
    assert.deepEqual(plain(m.categorias.map(c => c.categoria)), ['Bebidas', 'Combos', 'Dulces', 'Snacks']);
    const brisas = m.vendedoras.find(v => v.nombre === 'lasbrisas_kalo');
    assert.deepEqual([brisas.cantidad, brisas.ventas, brisas.reembolsadas, brisas.montoReembolsado], [1, 10, 1, 5]);
    assert.ok(m.vendedoras.some(v => v.nombre === 'Sin registrar (ventas antiguas)'));
});

test('serie diaria, días de la semana, horas y destacados', () => {
    const m = modelo();
    assert.equal(m.serie.length, 31);
    const dia5 = m.serie[4];
    assert.deepEqual([dia5.etiqueta, dia5.cantidad, dia5.ventas, dia5.descuentos, dia5.costo, dia5.margen], ['Lunes', 2, 12, 0.5, 6.2, 5.8]);
    assert.equal(m.serie[11].reembolsos, 5);
    assert.deepEqual([m.serie[14].futuro, m.serie[15].futuro], [false, true], 'los días que aún no llegan quedan marcados (el gráfico los deja vacíos)');
    assert.deepEqual(plain(m.porHora.map(h => h.hora)), [10, 15, 18]);
    assert.equal(m.porDiaSemana[0].dia, 'Lunes');
    assert.equal(m.porDiaSemana[0].dias, 2, 'lunes 5 y 12 de octubre; el 19 aún no llega');
    assert.match(m.destacados[0], /^Mejor día: lunes 5 de octubre de 2026, con S\/ 12\.00 en 2 ventas\.$/);
    assert.ok(m.destacados.some(d => /Producto más vendido: Agua Cielo \(3 unidades\)/.test(d)));
    assert.ok(m.destacados.some(d => /Pérdidas reales: S\/ 4\.20/.test(d)));
});

test('pérdidas: bajo costo, vencido, por vencer y stock bajo', () => {
    const p = modelo().perdidas;
    assert.deepEqual(plain(p.bajoCosto), [{ producto: 'Galleta', unidades: 2, ventas: 1, costo: 1.6, perdida: 0.6 }]);
    assert.deepEqual([p.vencidos.length, p.totalVencidos, p.porVencer.length, p.totalPorVencer, p.totalReales], [1, 3.6, 1, 4.8, 4.2]);
    assert.deepEqual(plain(p.stockBajo.map(s => [s.producto, s.estado])), [['Galleta', 'Sin stock'], ['Agua Cielo', 'Stock bajo']]);
    assert.equal(p.sinCosto[0].producto, 'Chicle');
});

test('el Excel tiene las hojas, cifras, formatos y enlaces esperados (y se puede volver a abrir)', async () => {
    const m = modelo();
    const wb = await releer(reporte.construirExcel(ExcelJS, m, { serie: PNG, top: PNG }));
    assert.deepEqual(wb.worksheets.map(ws => ws.name), ['Resumen', 'Por día', 'Productos', 'Categorías', 'Vendedoras', 'Pérdidas y alertas', 'Ventas', 'Reembolsos', 'Inventario']);
    const resumen = wb.getWorksheet('Resumen');
    assert.equal(resumen.getCell('A1').value, 'KALO · Reporte de ventas');
    assert.equal(resumen.getCell('A2').value, 'Octubre 2026 · Las Brisas');
    assert.equal(resumen.getCell('A6').value, 14.5);
    assert.match(resumen.getCell('A6').numFmt, /"S\/" #,##0\.00/);
    assert.equal(resumen.getImages().length, 2, 'los gráficos van como imágenes');
    let enlace = null;
    resumen.eachRow(row => row.eachCell(cell => { if (cell.value?.hyperlink === "#'Productos'!A1") enlace = cell; }));
    assert.ok(enlace, 'el índice enlaza a la hoja Productos');

    const productosWs = wb.getWorksheet('Productos');
    const galleta = buscarFila(productosWs, 2, 'Galleta');
    assert.equal(galleta.getCell(7).value, -0.6);
    assert.equal(galleta.getCell(10).value, 'Vendido por debajo de su costo');
    assert.equal(productosWs.views[0].state, 'frozen');
    assert.ok(productosWs.autoFilter);

    const ventasWs = wb.getWorksheet('Ventas');
    const v101 = buscarFila(ventasWs, 1, 101);
    assert.equal(v101.getCell(2).value.getTime(), Date.UTC(2026, 9, 5, 10, 0), 'la hora se ve como en Perú (10:00)');
    assert.equal(v101.getCell(2).numFmt, 'dd/mm/yyyy');
    const total = buscarFila(ventasWs, 1, 'TOTAL');
    assert.equal(total.getCell(9).value, 14.5);
    assert.equal(buscarFila(ventasWs, 1, 103).getCell(12).value, 'Reembolsada');

    const perdidas = wb.getWorksheet('Pérdidas y alertas');
    assert.equal(buscarFila(perdidas, 1, 'Mercadería vencida que sigue en stock (a precio de compra)').getCell(4).value, 3.6);
    assert.equal(buscarFila(wb.getWorksheet('Reembolsos'), 8, 'Cobro duplicado').getCell(5).value, 5);
    const inventario = wb.getWorksheet('Inventario');
    assert.equal(buscarFila(inventario, 1, 'TOTAL').getCell(10).value, 2 * 1.2 + 50 * 0);
});

test('con todos los locales aparece la comparación entre locales; el año agrupa por mes', async () => {
    const otros = ventas.map((v, i) => ({ ...v, id: 200 + i, local: i % 2 ? 'LOS PINOS' : 'LAS BRISAS' }));
    const multi = reporte.calcularReporte({ ventas: otros, ventasPrevias: [], productos, rango: reporte.rangoPeriodo('mes', '2026-10'), locales: ['LAS BRISAS', 'LOS PINOS', 'EL POLIDEPORTIVO'], ahora });
    assert.equal(multi.alcanceNombre, 'Todos los locales');
    assert.equal(multi.anteriores, null);
    const wbMulti = await releer(reporte.construirExcel(ExcelJS, multi));
    assert.ok(wbMulti.getWorksheet('Locales'));
    assert.equal(reporte.nombreArchivoReporte(multi), 'Kalo_Reporte_2026-10_Todos.xlsx');

    const anual = modelo({ periodo: 'anio' });
    assert.equal(anual.serie.length, 12);
    assert.equal(anual.serie[9].ventas, 14.5);
    const wbAnual = await releer(reporte.construirExcel(ExcelJS, anual));
    assert.ok(wbAnual.getWorksheet('Por mes'));
    assert.equal(reporte.nombreArchivoReporte(modelo()), 'Kalo_Reporte_2026-10_Las-Brisas.xlsx');
});

test('las fechas de Excel conservan la hora local de Perú', () => {
    const d = reporte.fechaExcel(new Date('2026-10-05T23:30:00Z'));
    assert.equal(d.toISOString(), '2026-10-05T18:30:00.000Z');
    assert.equal(reporte.fechaExcel('no es fecha'), null);
});
