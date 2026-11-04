const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, utils, element, rendered, fakeDocument, elements, fakeSupabase, plain } = require('./helpers.cjs');

const INV_IDS = ['productModal', 'productModalTitle', 'openModalBtn', 'closeModalBtn', 'productStatusMsg', 'addProductBtn',
    'comboEditNote', 'productCode', 'productName', 'categoria', 'previewImg', 'precioCompra', 'precioVenta', 'ganancia',
    'stock', 'alertaStock', 'imagePickerModal', 'openImagePickerBtn', 'closeImagePickerBtn', 'imagePickerSearch',
    'imageGrid', 'openComboModalBtn', 'closeComboModalBtn', 'comboModal', 'comboNameInput', 'comboPriceInput',
    'comboPreviewImg', 'openComboImagePickerBtn', 'comboProductList', 'saveComboBtn', 'comboStatusMsg', 'lotesList',
    'loteQtyInput', 'loteExpInput', 'addLoteBtn', 'productList', 'invSearch', 'prevPageBtn', 'nextPageBtn',
    'paginationInfo', 'alertsBadge', 'alertsList', 'comboRealSalePrice', 'comboRealCost', 'comboNetProfit'];
const XSS = '<img src=x onerror=alert(1)>';

const row = (id, overrides = {}) => ({ id, nombre: `Producto ${id}`, categoria: 'Bebidas', codigo: null, precio_compra: 1, precio_venta: 2, stock: 5, alerta_stock: null, lotes: null, local: 'LAS BRISAS', activo: true, ...overrides });

function setupInventory({ products = [], comboItems = [], confirm = () => true, rpc = {} } = {}) {
    const ids = elements(INV_IDS);
    ids.productName.value = 'Agua';
    ids.categoria.value = 'Bebidas';
    const supabase = fakeSupabase({ tables: { productos: products, combo_items: comboItems }, rpc });
    const state = { globalProducts: [], combos: new Map(), invFilteredProducts: [], invCurrentPage: 1, invItemsPerPage: 999999, currentLocal: 'LAS BRISAS' };
    const alerts = [];
    const loaded = [];
    const document = fakeDocument(ids);
    document.createElement = tag => element(tag, { querySelector: () => element() });
    const { exports } = loadModule('inventory.js', {
        document, state, supabase,
        customAlert: async message => { alerts.push(message); },
        customConfirm: async () => confirm(),
        AVAILABLE_IMAGES: [], resolveImage: () => './kalo-logo.png', CATEGORIA_COMBOS: 'Combos',
        ...utils()
    });
    const inv = exports.setupInventory({ onProductsLoaded: products => loaded.push(products) });
    return { ids, state, supabase, inv, alerts, loaded, save: () => ids.addProductBtn.click(), saveCombo: () => ids.saveComboBtn.click() };
}

const updates = t => t.supabase.calls.filter(call => call.op === 'update');
const clickRow = (t, selector, id) => t.ids.productList.dispatch('click', {
    target: { closest: sel => (sel === selector ? { getAttribute: () => String(id) } : null) }
});

test('guarda ceros explícitos, deja vacíos como null y registra el local', async () => {
    const t = setupInventory();
    for (const id of ['precioCompra', 'precioVenta', 'stock', 'alertaStock']) t.ids[id].value = '0';
    await t.save();
    const saved = t.supabase.db.productos[0];
    assert.deepEqual([saved.stock, saved.alerta_stock, saved.precio_compra, saved.precio_venta, saved.local], [0, 0, 0, 0, 'LAS BRISAS']);
    const empty = setupInventory();
    await empty.save();
    assert.equal(empty.supabase.db.productos[0].stock, null);
});

test('rechaza precios negativos y stock que no sea entero', async () => {
    for (const [field, value] of [['precioCompra', '-1'], ['precioVenta', 'Infinity'], ['stock', '1.5'], ['stock', '-1'], ['alertaStock', '0.5']]) {
        const t = setupInventory();
        t.ids[field].value = value;
        await t.save();
        assert.equal(t.supabase.db.productos.length, 0, `${field}=${value}`);
        assert.match(t.ids.productStatusMsg.textContent, /mayor o igual a cero/);
    }
});

test('un lote escrito con solo la fecha no se guarda en silencio', async () => {
    const t = setupInventory();
    t.ids.loteExpInput.value = '2026-12-01';
    await t.save();
    assert.equal(t.supabase.db.productos.length, 0);
    assert.equal(t.alerts.length, 1);
});

test('editar actualiza solo ese producto de este local', async () => {
    const t = setupInventory({ products: [row(5), row(6, { local: 'LOS PINOS' })] });
    await t.inv.loadProducts();
    t.inv.abrirModalEdicion(t.state.globalProducts[0]);
    t.ids.productName.value = 'Agua grande';
    await t.save();
    const [call] = updates(t);
    assert.deepEqual(plain(call.filters), [['eq', 'id', 5], ['eq', 'local', 'LAS BRISAS']]);
    assert.equal(call.returning, true);
    assert.equal(t.supabase.db.productos[0].nombre, 'Agua grande');
    assert.equal(call.payload.local, undefined, 'no se cambia el local al editar');
});

test('eliminar desactiva el producto (el historial se conserva)', async () => {
    const t = setupInventory({ products: [row(5)] });
    await t.inv.loadProducts();
    await clickRow(t, '.delete-btn', 5);
    const [call] = updates(t);
    assert.deepEqual(plain(call.payload), { activo: false });
    assert.deepEqual(plain(call.filters), [['eq', 'id', 5], ['eq', 'local', 'LAS BRISAS']]);
    assert.equal(t.supabase.calls.some(c => c.op === 'delete'), false);
    assert.equal(t.state.globalProducts.length, 0, 'tras recargar ya no aparece');
});

test('no deja eliminar un producto que forma parte de un combo', async () => {
    const t = setupInventory({
        products: [row(5), row(9, { nombre: 'Combo Lonchera', categoria: 'Combos', stock: null })],
        comboItems: [{ combo_id: 9, producto_id: 5, cantidad: 2 }]
    });
    await t.inv.loadProducts();
    await clickRow(t, '.delete-btn', 5);
    assert.equal(updates(t).length, 0);
    assert.match(t.alerts[0], /es parte de: Combo Lonchera/);
});

test('loadProducts trae solo productos activos del local y arma los combos', async () => {
    const t = setupInventory({
        products: [row(1, { nombre: 'Agua_Cielo' }), row(2, { activo: false }), row(3, { local: 'LOS PINOS' }), row(9, { categoria: 'Combos', stock: null })],
        comboItems: [{ combo_id: 9, producto_id: 1, cantidad: 2 }, { combo_id: 30, producto_id: 3, cantidad: 1 }]
    });
    await t.inv.loadProducts();
    assert.deepEqual(plain(t.state.globalProducts.map(p => p.id)), [9, 1]);
    assert.equal(t.state.globalProducts[1].nombre, 'Agua Cielo');
    assert.deepEqual(plain([...t.state.combos]), [['9', [{ producto_id: '1', cantidad: 2 }]]]);
    const productQuery = t.supabase.calls.find(c => c.table === 'productos');
    assert.deepEqual(plain(productQuery.filters), [['eq', 'local', 'LAS BRISAS'], ['eq', 'activo', true]]);
    assert.deepEqual(plain(productQuery.range), [0, 999], 'pagina para pasar el límite de 1000 filas');
    assert.equal(t.loaded.length, 1);
});

test('los combos se crean con crear_combo y validan las cantidades', async () => {
    const checkboxes = quantities => quantities.map((quantity, index) => ({
        value: String(index + 1),
        parentElement: { nextElementSibling: { querySelector: () => ({ value: quantity }) } }
    }));
    for (const value of ['-1', '0', '1.5', '', 'Infinity']) {
        const t = setupInventory();
        t.ids.comboNameInput.value = 'Combo';
        t.ids.comboPriceInput.value = '12';
        t.ids.comboProductList.querySelectorAll = () => checkboxes([value, '1']);
        await t.saveCombo();
        assert.equal(t.supabase.rpcCalls.length, 0, `cantidad=${value}`);
    }
    const t = setupInventory({ rpc: { crear_combo: () => ({ id: 50 }) } });
    t.ids.comboNameInput.value = 'Combo';
    t.ids.comboPriceInput.value = '12';
    t.ids.comboProductList.querySelectorAll = () => checkboxes(['2', '3']);
    await t.saveCombo();
    assert.deepEqual(plain(t.supabase.rpcCalls[0]), {
        name: 'crear_combo',
        params: { p_local: 'LAS BRISAS', p_nombre: 'Combo', p_precio: 12, p_imagen: null, p_items: [{ id: '1', cantidad: 2 }, { id: '2', cantidad: 3 }] }
    });
    assert.equal(t.ids.comboModal.classList.contains('hidden'), true);
});

test('los nombres con HTML se muestran como texto en la tabla, los combos y las alertas', async () => {
    const t = setupInventory({
        products: [row(1, { nombre: XSS, codigo: '<b>775</b>', categoria: '<i>x</i>', lotes: [{ qty: '<script>1</script>', vencimiento: '2020-01-01' }] })]
    });
    await t.inv.loadProducts();
    await t.ids.openComboModalBtn.click();
    for (const html of [rendered(t.ids.productList), rendered(t.ids.alertsList), rendered(t.ids.comboProductList)]) {
        assert.equal(html.includes('<img src=x'), false);
        assert.equal(html.includes('<b>775'), false);
        assert.equal(html.includes('<script>'), false);
        assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    }
});

test('un lote que vence hoy aparece como próximo a vencer, no como vencido', async () => {
    const hoy = utils().toDateInputValue(new Date());
    const t = setupInventory({ products: [row(1, { lotes: [{ qty: 3, vencimiento: hoy }] })] });
    await t.inv.loadProducts();
    const html = rendered(t.ids.alertsList);
    assert.match(html, /Próximo a vencer/);
    assert.equal(html.includes('>Vencido<'), false);
    assert.equal(t.ids.alertsBadge.textContent, 1);
});
