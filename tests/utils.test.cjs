const test = require('node:test');
const assert = require('node:assert/strict');
const { utils, plain } = require('./helpers.cjs');

const u = utils();

function withTimezone(tz, fn) {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try {
        return fn();
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
}

test('escapeHtml neutraliza HTML y acepta cualquier valor', () => {
    assert.equal(u.escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    assert.equal(u.escapeHtml("O'Brien & Co"), 'O&#39;Brien &amp; Co');
    assert.equal(u.escapeHtml(null), '');
    assert.equal(u.escapeHtml(undefined), '');
    assert.equal(u.escapeHtml(12.5), '12.5');
});

test('formatMoney y roundMoney', () => {
    assert.equal(u.formatMoney(2.5), 'S/ 2.50');
    assert.equal(u.formatMoney('abc'), 'S/ 0.00');
    assert.equal(u.roundMoney(0.1 + 0.2), 0.3);
    assert.equal(u.roundMoney(1.005), 1.01);
});

test('las fechas de vencimiento se leen en hora local (un lote que vence hoy no está vencido)', () => {
    withTimezone('America/Lima', () => {
        const date = u.parseLocalDate('2026-11-04');
        assert.equal(date.getFullYear(), 2026);
        assert.equal(date.getMonth(), 10);
        assert.equal(date.getDate(), 4);
        assert.equal(u.parseLocalDate('mañana'), null);

        const now = new Date(2026, 10, 4, 18, 30);
        assert.equal(u.estadoVencimiento('2026-11-04', now), 'por-vencer');
        assert.equal(u.estadoVencimiento('2026-11-03', now), 'vencido');
        assert.equal(u.estadoVencimiento('2026-12-04', now), 'por-vencer');
        assert.equal(u.estadoVencimiento('2026-12-05', now), 'ok');
        assert.equal(u.estadoVencimiento('', now), null);
    });
});

test('rangos de mes y de día en hora local con fin excluido', () => {
    withTimezone('America/Lima', () => {
        const month = u.monthRange('2026-10');
        assert.equal(month.start.toISOString(), '2026-10-01T05:00:00.000Z');
        assert.equal(month.end.toISOString(), '2026-11-01T05:00:00.000Z');
        const day = u.dayRange('2026-12-31');
        assert.equal(day.start.toISOString(), '2026-12-31T05:00:00.000Z');
        assert.equal(day.end.toISOString(), '2027-01-01T05:00:00.000Z');
        assert.equal(u.monthRange('2026-13x'), null);
        assert.equal(u.toMonthInputValue(new Date(2026, 0, 5)), '2026-01');
        assert.equal(u.toDateInputValue(new Date(2026, 0, 5)), '2026-01-05');
    });
});

test('fetchAll trae todas las páginas aunque haya más de 1000 filas', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1 }));
    const ranges = [];
    const buildQuery = () => ({
        range: async (from, to) => {
            ranges.push([from, to]);
            return { data: rows.slice(from, to + 1), error: null };
        }
    });
    const result = await u.fetchAll(buildQuery);
    assert.equal(result.length, 2500);
    assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);

    const exact = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const exactRanges = [];
    const all = await u.fetchAll(() => ({ range: async (from, to) => { exactRanges.push(from); return { data: exact.slice(from, to + 1), error: null }; } }));
    assert.equal(all.length, 1000);
    assert.equal(exactRanges.length, 2, 'pide una página más para confirmar que no hay más filas');

    await assert.rejects(u.fetchAll(() => ({ range: async () => ({ data: null, error: new Error('sin red') }) })), /sin red/);
});

test('describeError traduce los errores comunes', () => {
    assert.match(u.describeError({ code: 'PGRST202', message: 'Could not find the function public.registrar_venta' }), /actualización de seguridad/);
    assert.match(u.describeError({ message: 'column productos.activo does not exist' }), /actualización de seguridad/);
    assert.match(u.describeError(new TypeError('Failed to fetch')), /conexión/);
    assert.match(u.describeError({ code: '42501', message: 'new row violates row-level security policy for table "productos"' }), /permiso/);
    assert.equal(u.describeError({ code: '42501', message: 'No tienes permiso para vender en LOS PINOS.' }), 'No tienes permiso para vender en LOS PINOS.');
    assert.match(u.describeError({ message: 'violates check constraint "productos_stock_no_negativo"' }), /stock no puede ser negativo/);
    assert.equal(u.describeError({ message: 'Stock insuficiente para Agua. Disponible: 2.' }), 'Stock insuficiente para Agua. Disponible: 2.');
});

test('el stock requerido cuenta los componentes de los combos', () => {
    const combos = new Map([['9', [{ producto_id: '1', cantidad: 2 }, { producto_id: '2', cantidad: 1 }]]]);
    const cart = [{ id: 1, qty: 1 }, { id: 9, qty: 2 }, { id: 3, qty: 4 }];
    assert.deepEqual(plain([...u.stockRequerido(cart, combos)]), [['1', 5], ['2', 2], ['3', 4]]);

    const products = new Map([
        ['1', { id: 1, nombre: 'Agua', stock: 5 }],
        ['2', { id: 2, nombre: 'Galleta', stock: 1 }],
        ['3', { id: 3, nombre: 'Chicle', stock: null }]
    ]);
    assert.deepEqual(plain(u.faltanteDeStock(cart, combos, products)), { nombre: 'Galleta', disponible: 1, requerido: 2 });
    assert.equal(u.faltanteDeStock([{ id: 1, qty: 5 }, { id: 3, qty: 99 }], combos, products), null);
    assert.equal(u.faltanteDeStock([{ id: 7, qty: 1 }], combos, products).nombre, 'un producto del combo');
});

test('resumirVentas separa reembolsos y reparte efectivo/Yape (también ventas antiguas)', () => {
    const r = u.resumirVentas([
        { total: 10, descuento: 1, costo_total: 4, efectivo: 10, yape: 0, metodo_pago: 'Efectivo' },
        { total: 6, descuento: 0, costo_total: 2, efectivo: 2, yape: 4, metodo_pago: 'Ambos' },
        { total: 5, descuento: 0, costo_total: 1, efectivo: null, yape: null, metodo_pago: 'Yape' },
        { total: 3, descuento: 0, costo_total: 1, efectivo: null, yape: null, metodo_pago: 'Efectivo' },
        { total: 8, descuento: 0, costo_total: 3, efectivo: 8, yape: 0, estado: 'reembolsada' }
    ]);
    assert.deepEqual(plain(r), {
        cantidad: 4, ventas: 24, descuentos: 1, costo: 8, efectivo: 15, yape: 9,
        reembolsos: 8, cantidadReembolsos: 1, margen: 16
    });
});

test('ventasPorDia agrupa por día local sin contar reembolsos', () => {
    withTimezone('America/Lima', () => {
        const dias = u.ventasPorDia([
            { fecha: '2026-11-04T04:30:00Z', total: 10, costo_total: 4, descuento: 1 },
            { fecha: '2026-11-04T15:00:00Z', total: 5, costo_total: 2, descuento: 0 },
            { fecha: '2026-11-04T16:00:00Z', total: 50, costo_total: 2, descuento: 0, estado: 'reembolsada' }
        ]);
        assert.deepEqual(plain([...dias]), [
            ['2026-11-03', { cantidad: 1, ventas: 10, margen: 6, descuentos: 1 }],
            ['2026-11-04', { cantidad: 1, ventas: 5, margen: 3, descuentos: 0 }]
        ]);
    });
});

test('puedeReembolsar sigue la misma regla que la base de datos', () => {
    const now = Date.parse('2026-11-04T15:00:00Z');
    const venta = minutos => ({ local: 'LAS BRISAS', fecha: new Date(now - minutos * 60000).toISOString() });
    const cajero = { rol: 'cajero', local: 'LAS BRISAS', esAdmin: false };
    const admin = { rol: 'admin', local: null, esAdmin: true };
    assert.equal(u.puedeReembolsar(venta(5), cajero, now), true);
    assert.equal(u.puedeReembolsar(venta(15), cajero, now), true);
    assert.equal(u.puedeReembolsar(venta(16), cajero, now), false);
    assert.equal(u.puedeReembolsar({ ...venta(1), local: 'LOS PINOS' }, cajero, now), false);
    assert.equal(u.puedeReembolsar(venta(60 * 24 * 30), admin, now), true);
    assert.equal(u.puedeReembolsar({ ...venta(1), estado: 'reembolsada' }, admin, now), false);
    assert.equal(u.puedeReembolsar(venta(1), { rol: 'admin', esAdmin: false }, now), false, 'admin sin 2FA cuando es obligatorio');
    assert.equal(u.puedeReembolsar(venta(1), null, now), false);
});

test('resumenProductos y nombreCorto', () => {
    assert.equal(u.resumenProductos([{ qty: 2, nombre: 'Agua_Cielo' }, { qty: 1, nombre: 'Galleta' }]), '2x Agua Cielo, 1x Galleta');
    assert.equal(u.resumenProductos(null), 'Sin detalles');
    assert.equal(u.nombreCorto('lasbrisas_kalo@gmail.com'), 'lasbrisas_kalo');
    assert.equal(u.nombreCorto(null), '');
});
