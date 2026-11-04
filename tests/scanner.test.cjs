const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./helpers.cjs');

function setup({ dialogOpen = false } = {}) {
    let keydown;
    const scanned = [];
    const product = { id: 1, codigo: '775123' };
    const { exports } = loadModule('scanner.js', {
        document: {
            getElementById: () => null,
            addEventListener: (_, callback) => { keydown = callback; }
        },
        state: { globalProducts: [product] },
        isDialogOpen: () => dialogOpen,
        setTimeout: () => 1,
        clearTimeout() {}
    });
    exports.setupScanner({ onBarcodeScanned: value => scanned.push(value) });
    return {
        scanned, product,
        press(key, tagName = 'BUTTON') {
            const event = { key, target: { tagName }, prevented: false, preventDefault() { this.prevented = true; } };
            keydown(event);
            return event;
        }
    };
}

test('Enter sin código permite la activación nativa de una tarjeta o botón', () => {
    const h = setup();
    assert.equal(h.press('Enter').prevented, false);
    assert.equal(h.scanned.length, 0);
});

test('un escaneo completo agrega el producto una vez y consume su Enter', () => {
    const h = setup();
    for (const key of '775123') h.press(key);
    assert.equal(h.press('Enter').prevented, true);
    assert.deepEqual(h.scanned, [h.product]);
});

test('el escáner global respeta los campos de búsqueda y de formulario', () => {
    const h = setup();
    for (const key of '775123') h.press(key, 'INPUT');
    h.press('Enter', 'INPUT');
    assert.equal(h.scanned.length, 0);
});

test('con un diálogo abierto, el escáner no agrega productos ni confirma el diálogo', () => {
    const h = setup({ dialogOpen: true });
    for (const key of '775123') h.press(key);
    assert.equal(h.press('Enter').prevented, false);
    assert.equal(h.scanned.length, 0);
});
