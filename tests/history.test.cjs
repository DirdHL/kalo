const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, utils, rendered, fakeDocument, elements, fakeSupabase, plain } = require('./helpers.cjs');

const XSS = '<img src=x onerror=alert(1)>';
const CAJERO = { rol: 'cajero', local: 'LAS BRISAS', esAdmin: false, email: 'lasbrisas_kalo@gmail.com' };
const ADMIN = { rol: 'admin', local: null, esAdmin: true, email: 'zzenisx1234@gmail.com' };

const inicioDelDia = (date = new Date()) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
// Hace unos minutos, pero siempre dentro de hoy (las pruebas no fallan si corren a medianoche).
const hoyHace = minutos => new Date(Math.max(Date.now() - minutos * 60000, inicioDelDia().getTime() + 1000)).toISOString();
const minutosAtras = minutos => new Date(Date.now() - minutos * 60000).toISOString();
const haceDias = dias => { const d = new Date(); d.setDate(d.getDate() - dias); d.setHours(12, 0, 0, 0); return d.toISOString(); };

const venta = (id, overrides = {}) => ({
    id, local: 'LAS BRISAS', fecha: hoyHace(2), total: 10, descuento: 0, subtotal: 10, costo_total: 4,
    efectivo: 10, yape: 0, metodo_pago: 'Efectivo', estado: null, detalles: [{ id: 1, qty: 1, nombre: 'Agua' }],
    creado_por_email: 'lasbrisas_kalo@gmail.com', ...overrides
});

function setupHistory({ ventas = [], perfil = CAJERO, rpc = {}, prompt = 'Cobro duplicado', confirm = true } = {}) {
    const ids = elements(['ventasList', 'cierreFecha', 'cierreFechaWrap', 'cierreResumen', 'historySubtitle', 'historyDayLabel',
        'prevDayBtn', 'nextDayBtn', 'todayBtn', 'refreshHistoryBtn']);
    const supabase = fakeSupabase({ tables: { ventas }, rpc });
    const state = { perfil, currentLocal: 'LAS BRISAS' };
    const alerts = [];
    const toasts = [];
    let stockChanges = 0;
    const { exports } = loadModule('history.js', {
        document: fakeDocument(ids), state, supabase,
        customAlert: async message => { alerts.push(message); },
        customConfirm: async () => confirm,
        customPrompt: async () => prompt,
        showToast: message => toasts.push(message),
        ...utils()
    });
    const history = exports.setupHistory({ onStockChanged: async () => { stockChanges++; } });
    return { ids, supabase, history, alerts, toasts, get stockChanges() { return stockChanges; } };
}

const refundButtons = t => t.ids.ventasList.children.filter(row => row.innerHTML.includes('btn-refund'));
const clickRefund = (t, id) => t.ids.ventasList.dispatch('click', {
    target: { closest: () => ({ getAttribute: () => String(id) }) }
});
const ventasQueries = t => t.supabase.calls.filter(call => call.table === 'ventas');
const historyQuery = t => ventasQueries(t).at(-1);
const cierreQueries = ventasQueries;
const diaDe = iso => utils().toDateInputValue(new Date(iso));
const filtro = (call, op) => call.filters.find(([o, key]) => o === op && key === 'fecha')?.[2];

test('la vendedora ve todas las ventas de hoy y no puede elegir otro día', async () => {
    const t = setupHistory({ ventas: [venta(1), venta(2, { fecha: haceDias(1) }), venta(3, { fecha: haceDias(5) })] });
    await t.history.loadHistory();
    const q = historyQuery(t);
    assert.equal(filtro(q, 'gte'), inicioDelDia().toISOString(), 'pide solo ventas desde hoy');
    assert.equal(q.limit, null, 'sin tope de 100: todas las de hoy');
    assert.equal(t.ids.ventasList.children.length, 1);
    assert.equal(t.ids.cierreFechaWrap.classList.contains('hidden'), true, 'sin selector de día');
    assert.equal(t.ids.historySubtitle.textContent, 'Cierre de caja y todas las ventas de hoy');
    assert.match(t.ids.historyDayLabel.textContent, /^Hoy, /);

    t.ids.cierreFecha.value = diaDe(haceDias(1));
    await t.history.loadHistory();
    assert.equal(filtro(historyQuery(t), 'gte'), inicioDelDia().toISOString(), 'aunque cambie la fecha, sigue siendo hoy');

    const vacio = setupHistory({ ventas: [venta(9, { fecha: haceDias(2) })] });
    await vacio.history.loadHistory();
    assert.match(rendered(vacio.ids.ventasList), /Todavía no hay ventas hoy/);
});

test('muestra más de 100 ventas del día (antes se cortaba en 100)', async () => {
    const ventas = Array.from({ length: 130 }, (_, i) => venta(i + 1));
    const t = setupHistory({ ventas });
    await t.history.loadHistory();
    assert.equal(t.ids.ventasList.children.length, 130);
    assert.match(t.ids.cierreResumen.innerHTML, /Ventas<\/span>\s*<strong class="cash-card-value">130</);
    assert.equal(ventasQueries(t).length, 1, 'una sola consulta para tabla y cierre');
});

test('el admin empieza en hoy y puede ir a días anteriores y volver', async () => {
    const t = setupHistory({ perfil: ADMIN, ventas: [venta(1), venta(2, { fecha: haceDias(1) }), venta(3, { fecha: haceDias(3) })] });
    await t.history.loadHistory();
    assert.equal(filtro(historyQuery(t), 'gte'), inicioDelDia().toISOString(), 'por defecto hoy');
    assert.equal(t.ids.ventasList.children.length, 1);
    assert.equal(t.ids.cierreFechaWrap.classList.contains('hidden'), false);
    assert.equal(t.ids.nextDayBtn.disabled, true, 'no hay día siguiente a hoy');

    await t.ids.prevDayBtn.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(t.ids.cierreFecha.value, diaDe(haceDias(1)));
    assert.equal(filtro(historyQuery(t), 'gte'), inicioDelDia(new Date(haceDias(1))).toISOString());
    assert.equal(t.ids.ventasList.children.length, 1);
    assert.match(rendered(t.ids.ventasList), /data-id="2"/);
    assert.equal(t.ids.nextDayBtn.disabled, false);
    assert.doesNotMatch(t.ids.historyDayLabel.textContent, /^Hoy/);

    t.ids.cierreFecha.value = diaDe(haceDias(3));
    await t.ids.cierreFecha.dispatch('change');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.match(rendered(t.ids.ventasList), /data-id="3"/);

    t.ids.cierreFecha.value = diaDe(haceDias(2));
    await t.history.loadHistory();
    assert.match(rendered(t.ids.ventasList), /No hubo ventas ese día/);

    await t.ids.todayBtn.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(t.ids.cierreFecha.value, utils().toDateInputValue());
    assert.match(rendered(t.ids.ventasList), /data-id="1"/);
});

test('una fecha futura vuelve a hoy', async () => {
    const t = setupHistory({ perfil: ADMIN, ventas: [venta(1)] });
    const manana = new Date(); manana.setDate(manana.getDate() + 1);
    t.ids.cierreFecha.value = utils().toDateInputValue(manana);
    await t.history.loadHistory();
    assert.equal(t.ids.cierreFecha.value, utils().toDateInputValue());
});

test('el historial escapa los datos y muestra reembolsar según el rol', async () => {
    const ventas = [
        venta(1, { metodo_pago: '<b>Yape</b>', detalles: [{ qty: 1, nombre: XSS }], creado_por_email: '<i>x</i>@kalo.pe' }),
        venta(2, { fecha: haceDias(2) }),
        venta(3, { estado: 'reembolsada', motivo_reembolso: '<script>alert(1)</script>', reembolsado_por_email: 'zzenisx1234@gmail.com', reembolsado_en: hoyHace(1) }),
        venta(4, { local: 'LOS PINOS' })
    ];
    const cajero = setupHistory({ ventas });
    await cajero.history.loadHistory();
    const html = rendered(cajero.ids.ventasList);
    for (const raw of ['<img src=x', '<b>Yape', '<script>', '<i>x']) assert.equal(html.includes(raw), false, raw);
    assert.match(html, /&lt;img src=x/);
    assert.match(html, /Reembolsada<\/span><span class="refund-by">por zzenisx1234 · /);
    assert.match(html, /title="Motivo: &lt;script&gt;/, 'el motivo queda escapado en el tooltip');
    assert.equal(cajero.ids.ventasList.children.length, 2, 'solo ventas de hoy y de su local');
    assert.deepEqual(refundButtons(cajero).map(row => row.innerHTML.match(/data-id="(\d+)"/)[1]), ['1']);

    const admin = setupHistory({ ventas, perfil: ADMIN });
    admin.ids.cierreFecha.value = diaDe(haceDias(2));
    await admin.history.loadHistory();
    assert.deepEqual(refundButtons(admin).map(row => row.innerHTML.match(/data-id="(\d+)"/)[1]), ['2'], 'el admin reembolsa ventas de días anteriores');
});

test('reembolsar pide motivo y usa reembolsar_venta', async () => {
    const t = setupHistory({ ventas: [venta(1)], rpc: { reembolsar_venta: () => ({ id: 1, estado: 'reembolsada' }) } });
    await t.history.loadHistory();
    await clickRefund(t, 1);
    assert.deepEqual(plain(t.supabase.rpcCalls), [{ name: 'reembolsar_venta', params: { p_venta_id: 1, p_motivo: 'Cobro duplicado' } }]);
    assert.equal(t.stockChanges, 1);
    assert.match(t.toasts[0], /reembolsada/);
});

test('cancelar o dejar el motivo muy corto no reembolsa', async () => {
    for (const prompt of [null, 'ab', '   ']) {
        const t = setupHistory({ ventas: [venta(1)], prompt, rpc: { reembolsar_venta: () => ({}) } });
        await t.history.loadHistory();
        await clickRefund(t, 1);
        assert.equal(t.supabase.rpcCalls.length, 0, `motivo ${JSON.stringify(prompt)}`);
    }
    const noConfirm = setupHistory({ ventas: [venta(1)], confirm: false, rpc: { reembolsar_venta: () => ({}) } });
    await noConfirm.history.loadHistory();
    await clickRefund(noConfirm, 1);
    assert.equal(noConfirm.supabase.rpcCalls.length, 0);
});

test('un cajero no intenta reembolsar ventas de hace más de 15 minutos y el error de la base se muestra', async () => {
    const t = setupHistory();
    await t.history.refundSale(venta(2, { fecha: minutosAtras(30) }));
    assert.equal(t.supabase.rpcCalls.length, 0);
    assert.match(t.alerts[0], /administrador/);

    const fails = setupHistory({ ventas: [venta(1)], rpc: { reembolsar_venta: () => { throw new Error('Pasaron más de 15 minutos desde la venta: solo un administrador puede reembolsarla.'); } } });
    await fails.history.loadHistory();
    await clickRefund(fails, 1);
    assert.match(fails.alerts[0], /Pasaron más de 15 minutos/);
    assert.equal(fails.stockChanges, 0);
});

test('el cierre de caja suma efectivo y Yape del día sin reembolsos', async () => {
    const mediodia = new Date();
    mediodia.setHours(12, 0, 0, 0);
    const hoy = mediodia.toISOString();
    const ventas = [
        venta(1, { total: 10, efectivo: 10, yape: 0, fecha: hoy }),
        venta(2, { total: 6, efectivo: 2, yape: 4, metodo_pago: 'Ambos', descuento: 1, fecha: hoy }),
        venta(3, { total: 8, efectivo: 8, yape: 0, estado: 'reembolsada', fecha: hoy }),
        venta(4, { total: 99, efectivo: 99, fecha: haceDias(3) })
    ];
    const t = setupHistory({ ventas });
    await t.history.loadCierre();
    const html = t.ids.cierreResumen.innerHTML;
    assert.match(html, /Efectivo en caja<\/span>\s*<strong class="cash-card-value">S\/ 12\.00/);
    assert.match(html, /Yape \/ Plin<\/span>\s*<strong class="cash-card-value">S\/ 4\.00/);
    assert.match(html, /Reembolsos<\/span>\s*<strong class="cash-card-value">1<\/strong>\s*<span class="cash-card-detail">S\/ 8\.00/);
    assert.equal(html.includes('Margen'), false, 'el cierre no muestra márgenes');
    const query = cierreQueries(t)[0];
    assert.deepEqual(plain(query.filters.map(f => f.slice(0, 2))), [['eq', 'local'], ['gte', 'fecha'], ['lt', 'fecha']]);
    assert.equal(t.ids.ventasList.children.length, 3, 'la tabla muestra las 3 ventas de hoy');
    assert.equal(query.columns.includes('costo_total'), false, 'no pide costos');
});
