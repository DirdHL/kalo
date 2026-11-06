const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, utils, constants, categorias, element, rendered, fakeDocument, elements, fakeSupabase, plain } = require('./helpers.cjs');

const POS_IDS = ['posGrid', 'posSearch', 'cartItems', 'cartTotalValue', 'cartItemCount', 'mobileCartTotal', 'catalogCount',
    'posCategoryFilters', 'paymentMethod', 'splitPaymentSection', 'splitEfectivo', 'splitYape', 'cobrarBtn', 'pnpBtn', 'pnpDetail', 'paymentField',
    'posPrevPageBtn', 'posNextPageBtn', 'posPaginationInfo', 'receiptModal', 'receiptLocalName', 'receiptSaleNumber',
    'receiptDate', 'receiptItems', 'receiptSubtotal', 'receiptDiscountRow', 'receiptDiscount', 'receiptTotal',
    'receiptPaymentMethod', 'closeReceiptBtn', 'printReceiptBtn', 'saleSuccessTotal', 'saleSuccessDetail'];
const XSS = '<img src=x onerror=alert(1)>';

const product = (id = 1, overrides = {}) => ({ id, nombre: `Producto ${id}`, categoria: 'Bebidas', stock: 10, precio_compra: 4, precio_venta: 10, local: 'LAS BRISAS', ...overrides });

function setupPos({ products = [product()], cart = [], combos = new Map(), rpc, onSaleCompleted, onPricesChanged } = {}) {
    const ids = elements(POS_IDS);
    ids.paymentMethod.value = 'Efectivo';
    ids.splitPaymentSection.classList.add('hidden');
    ids.receiptModal.classList.add('hidden');
    ids.cobrarBtn.innerHTML = 'Cobrar <svg class="icon"></svg>';
    const state = { cart: cart.map(item => ({ ...item })), globalProducts: products.map(p => ({ ...p })), combos, currentLocal: 'LAS BRISAS' };
    const alerts = [];
    const toasts = [];
    const timers = new Map();
    const prints = [];
    // Respuesta como la de registrar_venta (precios desde "la base")
    const servidor = params => {
        const items = params.p_items.map(({ id, cantidad }) => {
            const p = products.find(x => String(x.id) === String(id));
            return { nombre: p.nombre, cantidad, precio_unitario: Math.round(p.precio_venta * 100) / 100 };
        });
        const subtotal = items.reduce((sum, item) => sum + item.cantidad * item.precio_unitario, 0);
        const total = subtotal - params.p_descuento;
        return {
            id: 77, local: params.p_local, subtotal, descuento: params.p_descuento, total, metodo_pago: params.p_metodo,
            efectivo: params.p_metodo === 'Ambos' ? params.p_efectivo : params.p_metodo === 'Efectivo' ? total : 0,
            yape: params.p_metodo === 'Ambos' ? params.p_yape : params.p_metodo === 'Yape' ? total : 0,
            items
        };
    };
    const supabase = fakeSupabase({ rpc: { registrar_venta: rpc || servidor } });
    const { exports } = loadModule('pos.js', {
        document: fakeDocument(ids),
        window: { addEventListener() {}, removeEventListener() {}, print() { prints.push(1); } },
        state, supabase,
        setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); },
        customAlert: async message => { alerts.push(message); },
        showToast: (message, type) => toasts.push({ message, type }),
        resolveImage: () => './kalo-logo.png',
        localPorId: constants().localPorId,
        ...categorias(),
        ...utils()
    });
    const pos = exports.setupPOS({ onSaleCompleted, onPricesChanged });
    const elegirCategoria = cat => ids.posCategoryFilters.dispatch('click', {
        target: { closest: sel => (sel === '.cat-filter-btn' ? { getAttribute: () => cat } : null) }
    });
    return { ids, state, supabase, pos, alerts, toasts, timers, prints, elegirCategoria };
}

const clickQty = (t, index, delta) => t.ids.cartItems.dispatch('click', {
    target: { closest: () => ({ dataset: { index: String(index), qtyDelta: String(delta) } }) }
});

test('el botón PNP deja el ticket en S/ 0.00, sigue la cantidad y se quita al tocarlo otra vez', async () => {
    const t = setupPos({ cart: [{ ...product(), qty: 1 }] });
    await t.ids.pnpBtn.click();
    assert.equal(t.ids.cartTotalValue.textContent, 'S/ 0.00');
    assert.equal(t.ids.pnpBtn.classList.contains('is-active'), true);
    assert.equal(t.ids.pnpBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(t.ids.pnpDetail.textContent, '- S/ 10.00 · toca para quitar');
    assert.equal(t.ids.paymentField.classList.contains('hidden'), true, 'sin método de pago: no se cobra nada');
    t.pos.addToCart(product());
    assert.equal(t.ids.cartTotalValue.textContent, 'S/ 0.00');
    assert.equal(t.ids.pnpDetail.textContent, '- S/ 20.00 · toca para quitar');

    await t.ids.pnpBtn.click();
    assert.equal(t.ids.cartTotalValue.textContent, 'S/ 20.00');
    assert.equal(t.ids.pnpBtn.classList.contains('is-active'), false);
    assert.equal(t.ids.pnpDetail.textContent, '100% de descuento');
    assert.equal(t.ids.paymentField.classList.contains('hidden'), false);

    const vacio = setupPos();
    await vacio.ids.pnpBtn.click();
    assert.equal(vacio.ids.pnpBtn.classList.contains('is-active'), false, 'con el ticket vacío no se activa');
    assert.match(vacio.toasts[0].message, /agrega los productos/);
});

test('una venta PNP se registra con 100% de descuento, en efectivo S/ 0.00', async () => {
    const t = setupPos({ cart: [{ ...product(), qty: 2 }] });
    t.ids.paymentMethod.value = 'Ambos';
    await t.ids.paymentMethod.dispatch('change');
    await t.ids.pnpBtn.click();
    assert.equal(t.ids.splitPaymentSection.classList.contains('hidden'), true);
    await t.pos.checkout();

    assert.equal(t.alerts.length, 0, t.alerts.join(' | '));
    assert.deepEqual(plain(t.supabase.rpcCalls[0].params), {
        p_local: 'LAS BRISAS', p_items: [{ id: 1, cantidad: 2 }],
        p_descuento: 20, p_metodo: 'Efectivo', p_efectivo: null, p_yape: null, p_total_esperado: 0
    });
    assert.equal(t.ids.receiptPaymentMethod.textContent, 'PNP: 100% de descuento');
    assert.equal(t.ids.saleSuccessDetail.textContent, 'Venta PNP (100% de descuento) · Venta N° 77');
    assert.equal(t.ids.pnpBtn.classList.contains('is-active'), false, 'la siguiente venta empieza sin PNP');
    assert.equal(t.ids.paymentField.classList.contains('hidden'), false);
});

test('cobrar valida el pago dividido antes de llamar a la base', async () => {
    const negative = setupPos({ cart: [{ ...product(), qty: 1 }] });
    negative.ids.paymentMethod.value = 'Ambos';
    negative.ids.splitEfectivo.value = '-5';
    negative.ids.splitYape.value = '15';
    await negative.pos.checkout();
    assert.equal(negative.supabase.rpcCalls.length, 0);
    assert.match(negative.alerts[0], /mayores o iguales a cero/);

    const short = setupPos({ cart: [{ ...product(), qty: 1 }] });
    short.ids.paymentMethod.value = 'Ambos';
    short.ids.splitEfectivo.value = '0';
    short.ids.splitYape.value = '9.99';
    await short.pos.checkout();
    assert.equal(short.supabase.rpcCalls.length, 0);
    assert.match(short.alerts[0], /no coinciden/);

    const empty = setupPos();
    await empty.pos.checkout();
    assert.match(empty.alerts[0], /vacío/);
});

test('efectivo + Yape/Plin: se reparte mitad y mitad y el otro cuadro completa el total', async () => {
    const agua = product(1, { precio_venta: 4 });
    const t = setupPos({ products: [agua], cart: [{ ...agua, qty: 1 }] });
    const escribir = async (campo, valor, evento = 'input') => { t.ids[campo].value = valor; await t.ids[campo].dispatch(evento); };

    t.ids.paymentMethod.value = 'Ambos';
    await t.ids.paymentMethod.dispatch('change');
    assert.equal(t.ids.splitPaymentSection.classList.contains('hidden'), false);
    assert.deepEqual([t.ids.splitEfectivo.value, t.ids.splitYape.value], ['2.00', '2.00'], 'mitad y mitad');

    await escribir('splitEfectivo', '3');
    assert.equal(t.ids.splitYape.value, '1.00', 'total 4, efectivo 3 → Yape 1');
    assert.equal(t.ids.splitEfectivo.value, '3', 'no se toca lo que están escribiendo');
    await escribir('splitYape', '0.5');
    assert.equal(t.ids.splitEfectivo.value, '3.50');
    await escribir('splitEfectivo', '');
    assert.equal(t.ids.splitYape.value, '4.00', 'si borran un cuadro, el otro lleva todo');

    await escribir('splitEfectivo', '3.5');
    await t.pos.checkout();
    assert.equal(t.alerts.length, 0, t.alerts.join(' | '));
    const params = t.supabase.rpcCalls[0].params;
    assert.deepEqual([params.p_metodo, params.p_efectivo, params.p_yape, params.p_total_esperado], ['Ambos', 3.5, 0.5, 4]);
});

test('pago dividido: si cambia el total se respeta lo escrito, sin pasarse del total', async () => {
    const agua = product(1, { precio_venta: 4 });
    const t = setupPos({ products: [agua], cart: [{ ...agua, qty: 1 }] });
    t.ids.paymentMethod.value = 'Ambos';
    await t.ids.paymentMethod.dispatch('change');
    t.ids.splitEfectivo.value = '3';
    await t.ids.splitEfectivo.dispatch('input');

    t.pos.addToCart(agua);
    assert.deepEqual([t.ids.splitEfectivo.value, t.ids.splitYape.value], ['3', '5.00'], 'total 8: el efectivo escrito se queda');
    t.ids.splitEfectivo.value = '6';
    await t.ids.splitEfectivo.dispatch('input');
    await clickQty(t, 0, -1);
    assert.deepEqual([t.ids.splitEfectivo.value, t.ids.splitYape.value], ['4.00', '0.00'], 'total 4: el efectivo no puede pasar del total');

    t.ids.splitYape.value = '10';
    await t.ids.splitYape.dispatch('input');
    assert.equal(t.ids.splitEfectivo.value, '0.00');
    await t.ids.splitYape.dispatch('change');
    assert.equal(t.ids.splitYape.value, '4.00', 'al salir del cuadro se ajusta al total');

    // Volver a elegir el pago dividido reparte de nuevo; con céntimos impares igual suma el total.
    const galleta = product(2, { precio_venta: 4.25 });
    const u = setupPos({ products: [galleta], cart: [{ ...galleta, qty: 1 }] });
    u.ids.paymentMethod.value = 'Ambos';
    await u.ids.paymentMethod.dispatch('change');
    const [ef, yp] = [Number(u.ids.splitEfectivo.value), Number(u.ids.splitYape.value)];
    assert.equal(Math.round((ef + yp) * 100), 425);
    assert.ok(Math.abs(ef - yp) <= 0.011);
    u.ids.paymentMethod.value = 'Efectivo';
    await u.ids.paymentMethod.dispatch('change');
    u.pos.addToCart(galleta);
    u.ids.paymentMethod.value = 'Ambos';
    await u.ids.paymentMethod.dispatch('change');
    assert.deepEqual([u.ids.splitEfectivo.value, u.ids.splitYape.value], ['4.25', '4.25']);
});

test('una venta usa registrar_venta con el total esperado y muestra la boleta que devuelve la base', async () => {
    let completed = 0;
    const products = [product(1), product(2, { precio_venta: 3.333 })];
    const t = setupPos({ products, cart: [{ ...products[0], qty: 2 }, { ...products[1], qty: 3 }], onSaleCompleted: async () => { completed++; } });
    t.ids.paymentMethod.value = 'Ambos';
    t.ids.splitEfectivo.value = '20';
    t.ids.splitYape.value = '9.99';
    await t.pos.checkout();

    assert.equal(t.supabase.rpcCalls.length, 1);
    assert.deepEqual(plain(t.supabase.rpcCalls[0]), {
        name: 'registrar_venta',
        params: {
            p_local: 'LAS BRISAS', p_items: [{ id: 1, cantidad: 2 }, { id: 2, cantidad: 3 }],
            p_descuento: 0, p_metodo: 'Ambos', p_efectivo: 20, p_yape: 9.99, p_total_esperado: 29.99
        }
    });
    assert.equal(t.state.cart.length, 0);
    assert.equal(t.ids.paymentMethod.value, 'Efectivo');
    assert.equal(t.ids.receiptModal.classList.contains('hidden'), false);
    assert.equal(t.ids.receiptSaleNumber.textContent, 'Venta N° 77');
    assert.equal(t.ids.receiptLocalName.textContent, 'Local: Las Brisas');
    assert.equal(t.ids.receiptPaymentMethod.textContent, 'S/ 20.00 Efvo | S/ 9.99 Yape');
    assert.equal(t.ids.receiptItems.children.length, 2);
    assert.equal(t.ids.cobrarBtn.innerHTML, 'Cobrar <svg class="icon"></svg>', 'el botón recupera su ícono');
    assert.equal(t.ids.cobrarBtn.disabled, false);
    assert.equal(completed, 1);

    // Aviso de venta exitosa, sin imprimir solo.
    assert.equal(t.ids.saleSuccessTotal.textContent, 'S/ 29.99');
    assert.equal(t.ids.saleSuccessDetail.textContent, 'Cobrado con Efectivo + Yape · Venta N° 77');
    assert.equal(t.prints.length, 0, 'la boleta no se imprime automáticamente');
    assert.equal(t.timers.size, 0);

    await t.ids.printReceiptBtn.onclick();
    assert.equal(t.prints.length, 1, 'se imprime solo al tocar "Imprimir boleta"');
    assert.equal(t.ids.receiptModal.classList.contains('hidden'), false);

    t.ids.closeReceiptBtn.onclick();
    assert.equal(t.ids.receiptModal.classList.contains('hidden'), true);
    t.pos.addToCart(products[0]);
    assert.equal(t.state.cart.length, 1, 'cerrar el aviso no borra el siguiente ticket');
});

test('escanear el siguiente producto con el aviso abierto lo cierra y sigue vendiendo', async () => {
    const products = [product(1)];
    const t = setupPos({ products, cart: [{ ...products[0], qty: 1 }] });
    await t.pos.checkout();
    assert.equal(t.ids.receiptModal.classList.contains('hidden'), false);
    assert.equal(t.ids.saleSuccessDetail.textContent, 'Cobrado con Efectivo · Venta N° 77');
    t.pos.addToCart(products[0]);
    assert.equal(t.ids.receiptModal.classList.contains('hidden'), true);
    assert.equal(t.state.cart.length, 1);
    await t.ids.receiptModal.onkeydown?.({ key: 'Escape' });
});

test('si la base rechaza la venta, el ticket se conserva y no se abre la boleta', async () => {
    const t = setupPos({ cart: [{ ...product(), qty: 1 }], rpc: () => { throw new Error('Stock insuficiente para Producto 1. Disponible: 0.'); } });
    await t.pos.checkout();
    assert.equal(t.state.cart.length, 1);
    assert.equal(t.ids.receiptModal.classList.contains('hidden'), true);
    assert.equal(t.ids.cobrarBtn.disabled, false);
    assert.match(t.alerts[0], /Stock insuficiente para Producto 1/);
});

test('si los precios cambiaron (KL001) se recargan los productos y se avisa', async () => {
    let reloads = 0;
    const t = setupPos({
        cart: [{ ...product(), qty: 1 }],
        rpc: () => { const e = new Error('Los precios cambiaron: el total correcto es S/ 12.00.'); e.code = 'KL001'; throw e; },
        onPricesChanged: () => { reloads++; }
    });
    await t.pos.checkout();
    assert.equal(reloads, 1);
    assert.match(t.alerts[0], /precios cambiaron/);
    assert.equal(t.state.cart.length, 1);
});

test('si la base no tiene la actualización, el mensaje lo explica', async () => {
    const t = setupPos({ cart: [{ ...product(), qty: 1 }] });
    t.supabase.rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.registrar_venta' } });
    await t.pos.checkout();
    assert.match(t.alerts[0], /actualización de seguridad/);
});

test('no se puede agregar más de lo que hay en stock, contando los combos', async () => {
    const combos = new Map([['9', [{ producto_id: '1', cantidad: 1 }, { producto_id: '2', cantidad: 1 }]]]);
    const products = [product(1, { stock: 2 }), product(2, { stock: 1 }), product(9, { stock: null, categoria: 'Combos' })];
    const t = setupPos({ products, combos });
    assert.equal(t.pos.addToCart(products[0]), true);
    assert.equal(t.pos.addToCart(products[0]), true);
    assert.equal(t.pos.addToCart(products[0]), false);
    assert.match(t.toasts.at(-1).message, /Sin stock suficiente de Producto 1: disponible 2/);
    assert.equal(t.pos.addToCart(products[2]), false, 'el combo necesita otra unidad de Producto 1');
    await clickQty(t, 0, -1);
    assert.equal(t.pos.addToCart(products[2]), true);
    await clickQty(t, 1, 1);
    assert.equal(t.state.cart[1].qty, 1, 'un segundo combo ya no alcanza');
    await clickQty(t, 0, 1);
    assert.equal(t.state.cart[0].qty, 1);
    assert.equal(t.toasts.length, 4);
    assert.ok(t.toasts.every(toast => toast.type === 'warning'));
});

test('mientras se cobra, el ticket queda bloqueado y no hay doble cobro', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const t = setupPos({ products: [product(1), product(2)], cart: [{ ...product(1), qty: 1 }], rpc: async () => { await pending; return { id: 1, items: [], subtotal: 10, descuento: 0, total: 10, metodo_pago: 'Efectivo', efectivo: 10, yape: 0 }; } });
    const first = t.pos.checkout();
    assert.equal(t.pos.addToCart(product(2)), false);
    await clickQty(t, 0, 1);
    await t.pos.checkout();
    assert.equal(t.state.cart[0].qty, 1);
    release();
    await first;
    assert.equal(t.supabase.rpcCalls.length, 1);
});

test('al recargar productos el ticket toma los precios nuevos y quita lo que ya no existe', () => {
    const t = setupPos({ products: [product(1), product(2)], cart: [{ ...product(1), qty: 2 }, { ...product(2), qty: 1 }] });
    t.pos.onProductsLoaded([product(1, { precio_venta: 12 })]);
    assert.equal(t.state.cart.length, 1);
    assert.equal(t.state.cart[0].precio_venta, 12);
    assert.equal(t.state.cart[0].qty, 2);
    assert.equal(t.ids.cartTotalValue.textContent, 'S/ 24.00');
    assert.match(t.toasts[0].message, /Producto 2/);
});

test('la recarga de productos conserva filtros y ajusta la página', async () => {
    const products = Array.from({ length: 30 }, (_, index) => product(index + 1, { categoria: 'Bebidas' }));
    const t = setupPos({ products });
    t.pos.renderPosGrid(products);
    await t.ids.posNextPageBtn.dispatch('click');
    assert.equal(t.ids.posPaginationInfo.textContent, 'Página 2 de 2');
    t.pos.renderPosGrid([products[0]]);
    assert.equal(t.ids.posPaginationInfo.textContent, 'Página 1 de 1');
    assert.equal(t.ids.posGrid.children.length, 1);
    await t.elegirCategoria('Snacks');
    t.pos.renderPosGrid([...products, product(99, { categoria: 'Snacks' })]);
    assert.equal(t.ids.posGrid.children.length, 1);
    assert.match(t.ids.posGrid.children[0].innerHTML, /Producto 99/);
});

test('un nombre con HTML no se ejecuta en el catálogo, el ticket ni la boleta', async () => {
    const malicious = product(1, { nombre: XSS, imagen: '"><script>alert(1)</script>' });
    const t = setupPos({ products: [malicious] });
    t.pos.renderPosGrid([malicious]);
    t.pos.addToCart(malicious);
    for (const html of [rendered(t.ids.posGrid), rendered(t.ids.cartItems)]) {
        assert.equal(html.includes('<img src=x'), false);
        assert.equal(html.includes('<script>'), false);
        assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    }
    await t.pos.checkout();
    const row = t.ids.receiptItems.children[0];
    assert.equal(row.children[0].textContent, `1x ${XSS}`, 'la boleta usa textContent');
    assert.equal(t.ids.receiptItems.innerHTML, '');
});

test('los filtros de la caja muestran las categorías nuevas que usan los productos del local', async () => {
    const products = [product(1, { categoria: 'Bebidas' }), product(2, { categoria: 'Golosinas' }), product(3, { categoria: 'golosinas ' }), product(4, { categoria: 'Panadería' })];
    const t = setupPos({ products });
    t.pos.onProductsLoaded(products);
    const html = t.ids.posCategoryFilters.innerHTML;
    for (const texto of ['🥤 Bebidas', '📦 Otros', '🏷️ Golosinas', '🏷️ Panadería', '🍔 Combos']) assert.ok(html.includes(texto), texto);
    assert.equal(html.match(/Golosinas/gi).length, 2, 'una sola vez (data-cat y texto), aunque esté escrita distinto');
    assert.ok(html.indexOf('Otros') < html.indexOf('Golosinas') && html.indexOf('Panadería') < html.indexOf('Combos'), 'las de siempre, luego las nuevas, Combos al final');
    assert.doesNotMatch(html, /cat-delete-btn/, 'en la caja no se eliminan categorías');

    await t.elegirCategoria('Golosinas');
    assert.equal(t.ids.posGrid.children.length, 2, '"Golosinas" y "golosinas " son la misma');
    assert.match(t.ids.posCategoryFilters.innerHTML, /class="cat-filter-btn active" data-cat="Golosinas"/);

    // Si ya ningún producto usa esa categoría, el filtro vuelve a "Todos".
    t.state.globalProducts = [products[0]]; // el inventario actualiza la lista antes de avisar a la caja
    t.pos.onProductsLoaded([products[0]]);
    assert.doesNotMatch(t.ids.posCategoryFilters.innerHTML, /Golosinas/);
    assert.equal(t.ids.posGrid.children.length, 1);
});
