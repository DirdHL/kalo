const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, utils, constants } = require('./helpers.cjs');

const c = constants();
const { exports: auth } = loadModule('auth.js', {
    localPorId: c.localPorId, localPorSlug: c.localPorSlug, describeError: utils().describeError
});

test('el cajero siempre entra a su propio local, aunque la URL diga otro', () => {
    const cajero = { rol: 'cajero', local: 'LOS PINOS' };
    assert.equal(auth.resolverLocalInicial(cajero, '?local=brisas', 'EL POLIDEPORTIVO'), 'LOS PINOS');
    assert.equal(auth.resolverLocalInicial({ rol: 'cajero', local: 'OTRO' }, ''), null);
});

test('el admin entra al local de la URL, si no al último usado, si no elige', () => {
    const admin = { rol: 'admin', local: null };
    assert.equal(auth.resolverLocalInicial(admin, '?local=polideportivo', 'LAS BRISAS'), 'EL POLIDEPORTIVO');
    assert.equal(auth.resolverLocalInicial(admin, '?local=inventado', 'LAS BRISAS'), 'LAS BRISAS');
    assert.equal(auth.resolverLocalInicial(admin, '', null), null);
    assert.equal(auth.resolverLocalInicial(admin, '', 'LOCAL FALSO'), null);
});

test('una cuenta sin rol no entra a ningún local', () => {
    assert.equal(auth.resolverLocalInicial({ rol: null, local: 'LAS BRISAS' }, '?local=brisas', 'LAS BRISAS'), null);
    assert.equal(auth.resolverLocalInicial(null, ''), null);
});

test('el QR de 2FA se codifica completo para que un "#" no corte la imagen', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>';
    for (const input of [svg, `data:image/svg+xml;utf-8,${svg}`]) {
        const src = auth.qrComoImagen(input);
        assert.match(src, /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
        assert.equal(src.includes('#'), false);
    }
    assert.equal(auth.qrComoImagen('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
});

test('los errores de inicio de sesión se explican en español sin revelar detalles', () => {
    assert.equal(auth.mensajeLogin({ message: 'Invalid login credentials' }), 'Correo o contraseña incorrectos.');
    assert.match(auth.mensajeLogin({ status: 429, message: 'Request rate limit reached' }), /Demasiados intentos/);
    assert.match(auth.mensajeLogin({ message: 'Email not confirmed' }), /no está confirmada/);
    assert.match(auth.mensajeLogin(new TypeError('Failed to fetch')), /conexión/);
});
