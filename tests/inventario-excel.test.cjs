// Excel del inventario: solo producto y cantidad (se escribe y se vuelve a leer con ExcelJS).
process.env.TZ = 'America/Lima';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { loadModule, utils, constants, plain } = require('./helpers.cjs');

const { exports: reporte } = loadModule('reporte.js', { ...utils(), ...constants(), Date });
const { exports: inv } = loadModule('inventario-excel.js', { ...utils(), ...constants(), COLOR: reporte.COLOR, Date });

const ahora = new Date(2026, 10, 6, 15, 30);
const productos = [
    { id: 1, nombre: 'Yogurt_Gloria', categoria: 'Lácteos', stock: 12 },
    { id: 2, nombre: 'agua Cielo', categoria: 'Bebidas', stock: '3' },
    { id: 3, nombre: 'Ácido bórico', categoria: 'Limpieza', stock: 0 },
    { id: 4, nombre: 'Chicle', categoria: 'Dulces', stock: null },
    { id: 9, nombre: 'Combo Lonchera', categoria: 'Snacks', stock: null },
    { id: 10, nombre: 'Combo viejo', categoria: 'Combos', stock: null },
    { id: 11, nombre: 'Galleta 10', categoria: 'Snacks', stock: 1 },
    { id: 12, nombre: 'Galleta 2', categoria: 'Snacks', stock: 1500 }
];
const esCombo = p => p.id === 9;

async function releer(wb) {
    const copia = new ExcelJS.Workbook();
    await copia.xlsx.load(await wb.xlsx.writeBuffer());
    return copia.getWorksheet('Inventario');
}

test('filas: sin combos, en orden alfabético, sin guiones bajos y sin inventar ceros', () => {
    const filas = plain(inv.filasInventario(productos, esCombo));
    assert.deepEqual(filas, [
        { producto: 'Ácido bórico', cantidad: 0 },
        { producto: 'agua Cielo', cantidad: 3 },
        { producto: 'Chicle', cantidad: null },
        { producto: 'Galleta 2', cantidad: 1500 },
        { producto: 'Galleta 10', cantidad: 1 },
        { producto: 'Yogurt Gloria', cantidad: 12 }
    ]);
    assert.deepEqual(plain(inv.filasInventario(null)), []);
});

test('nombre del archivo: local y fecha de descarga', () => {
    assert.equal(inv.nombreArchivoInventario('EL POLIDEPORTIVO', ahora), 'Kalo_Inventario_El-Polideportivo_2026-11-06.xlsx');
    assert.equal(inv.nombreArchivoInventario('LOS PINOS', ahora), 'Kalo_Inventario_Los-Pinos_2026-11-06.xlsx');
});

test('el libro tiene solo dos columnas, Producto y Cantidad, con título del local', async () => {
    const filas = inv.filasInventario(productos, esCombo);
    const ws = await releer(inv.construirExcelInventario(ExcelJS, { local: 'LOS PINOS', filas, ahora }));
    assert.equal(ws.getCell('A1').value, 'Inventario · Los Pinos');
    assert.match(ws.getCell('A2').value, /^Al 6 de noviembre de 2026, .* · 6 productos$/);
    assert.deepEqual([ws.getCell('A4').value, ws.getCell('B4').value], ['Producto', 'Cantidad']);
    assert.equal(ws.actualColumnCount, 2, 'nada más que producto y cantidad');

    const leidas = [];
    for (let r = 5; r <= ws.rowCount; r++) leidas.push([ws.getCell(r, 1).value, ws.getCell(r, 2).value]);
    assert.deepEqual(leidas, [['Ácido bórico', 0], ['agua Cielo', 3], ['Chicle', '—'], ['Galleta 2', 1500], ['Galleta 10', 1], ['Yogurt Gloria', 12]]);

    const agotado = ws.getCell('B5');
    assert.equal(agotado.font.color.argb, reporte.COLOR.rojo, 'lo agotado se ve en rojo');
    assert.equal(ws.getCell('B8').numFmt, '#,##0');
    assert.equal(ws.views[0].state, 'frozen');
    assert.equal(ws.views[0].ySplit, 4, 'el encabezado queda fijo al bajar');
    assert.equal(ws.pageSetup.printTitlesRow, '1:4', 'al imprimir, el encabezado se repite en cada hoja');
    assert.ok(ws.autoFilter, 'se puede ordenar por cantidad');
});

test('un local sin productos igual arma el libro con un aviso', async () => {
    const ws = await releer(inv.construirExcelInventario(ExcelJS, { local: 'LAS BRISAS', filas: [], ahora }));
    assert.match(ws.getCell('A2').value, /0 productos$/);
    assert.match(ws.getCell('A5').value, /no tiene productos/);
});
