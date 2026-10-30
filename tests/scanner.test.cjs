const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../scanner.js'), 'utf8')
    .replace(/^import .*;\r?\n/, '')
    .replace('export function setupScanner', 'function setupScanner');

function setup() {
    let keydown;
    const scanned = [];
    const product = { id: 1, codigo: '775123' };
    vm.runInNewContext(source + '\nsetupScanner({onBarcodeScanned});', {
        document: {
            getElementById: () => null,
            addEventListener: (_, callback) => { keydown = callback; }
        },
        state: { globalProducts: [product] },
        onBarcodeScanned: value => scanned.push(value),
        setTimeout: () => 1,
        clearTimeout() {}
    });
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
    assert.equal(h.press('Enter').prevented, false);
    assert.equal(h.scanned.length, 1);
});

test('el escáner global respeta los campos de búsqueda y de formulario', () => {
    const h = setup();
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
        for (const key of '775123') h.press(key, tag);
        assert.equal(h.press('Enter', tag).prevented, false);
    }
    assert.equal(h.scanned.length, 0);
});
