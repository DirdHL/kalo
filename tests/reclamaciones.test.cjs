const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../libro-reclamaciones/app.js'), 'utf8')
    .replace(/^import .*;\r?\n/, '');

async function setup({ insertError = null, fetchImpl, values = {} } = {}) {
    const elements = new Map();
    const dialogs = [];
    const inserts = [];
    const requests = [];
    let ready;
    const formValues = {
        nombre_consumidor: 'Cliente de prueba',
        monto_reclamado: '12.50',
        tipo_reclamacion: 'RECLAMO',
        aceptacion_consumidor: 'on',
        ...values
    };
    const element = (id) => {
        if (!elements.has(id)) elements.set(id, {
            style: {}, disabled: false,
            addEventListener(event, callback) { this[event] = callback; }
        });
        return elements.get(id);
    };
    const context = {
        document: {
            addEventListener(event, callback) { ready = callback; },
            getElementById: element,
            querySelector: element
        },
        supabase: {
            from(table) {
                assert.equal(table, 'reclamaciones');
                return {
                    async insert(payload) {
                        inserts.push(payload);
                        return { error: insertError };
                    }
                };
            }
        },
        FormData: class { entries() { return Object.entries(formValues); } },
        Swal: { fire(options) { dialogs.push(options); return Promise.resolve(); } },
        fetch: async (...args) => {
            requests.push(args);
            return fetchImpl ? fetchImpl(...args) : { ok: true, json: async () => ({ success: 'true' }) };
        },
        AbortController,
        setTimeout,
        clearTimeout,
        console: { log() {}, error() {} },
        window: { location: { reload() {} } }
    };
    vm.runInNewContext(source, context);
    await ready();
    return {
        element, dialogs, inserts, requests,
        submit: () => element('reclamacion-form').submit({ preventDefault() {} })
    };
}

test('el correlativo no se inventa consultando reclamos privados', async () => {
    const h = await setup();
    assert.equal(h.element('.correlative-value').textContent, 'Se asignará al registrar');
    assert.equal(h.requests.length, 0);
});

test('guarda la aceptación y mantiene bloqueado un reclamo ya registrado', async () => {
    const h = await setup();
    await h.submit();
    await h.submit();
    assert.equal(h.inserts.length, 1);
    assert.equal(h.inserts[0][0].aceptacion_consumidor, true);
    assert.equal(h.inserts[0][0].monto_reclamado, 12.5);
    assert.equal(h.element('submit-btn').disabled, true);
    assert.equal(h.dialogs.at(-1).icon, 'success');
});

for (const [name, fetchImpl] of [
    ['error de red', async () => { throw new Error('offline'); }],
    ['error HTTP', async () => ({ ok: false })],
    ['notificación rechazada', async () => ({ ok: true, json: async () => ({ success: 'false' }) })]
]) {
    test(`un ${name} de correo no presenta como fallido el registro guardado`, async () => {
        const h = await setup({ fetchImpl });
        await h.submit();
        await h.submit();
        assert.equal(h.inserts.length, 1);
        assert.equal(h.dialogs.at(-1).icon, 'success');
        assert.match(h.dialogs.at(-1).html, /No necesita volver a registrarla/);
        assert.equal(h.element('submit-btn').disabled, true);
        assert.equal(h.element('submit-loader').style.display, 'none');
    });
}

test('un fallo de base de datos permite reintentar y no envía correo', async () => {
    const h = await setup({ insertError: new Error('insert rejected') });
    await h.submit();
    assert.equal(h.dialogs.at(-1).icon, 'error');
    assert.equal(h.requests.length, 0);
    assert.equal(h.element('submit-btn').disabled, false);
    await h.submit();
    assert.equal(h.inserts.length, 2);
});

test('bloquea un segundo envío mientras espera la notificación', async () => {
    let release;
    const h = await setup({
        fetchImpl: () => new Promise(resolve => { release = resolve; })
    });
    const first = h.submit();
    await Promise.resolve();
    await h.submit();
    assert.equal(h.inserts.length, 1);
    release({ ok: true, json: async () => ({ success: true }) });
    await first;
});

for (const values of [
    { monto_reclamado: '-1' },
    { monto_reclamado: 'Infinity' },
    { monto_reclamado: '' },
    { aceptacion_consumidor: undefined }
]) {
    test(`rechaza datos inválidos: ${JSON.stringify(values)}`, async () => {
        const h = await setup({ values });
        await h.submit();
        assert.equal(h.inserts.length, 0);
        assert.equal(h.requests.length, 0);
        assert.equal(h.element('submit-btn').disabled, false);
        assert.equal(h.dialogs.at(-1).icon, 'warning');
    });
}
