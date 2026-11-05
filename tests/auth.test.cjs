const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, utils, constants, elements, fakeDocument } = require('./helpers.cjs');

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

test('solo se pide la contraseña cuando Supabase da la sesión por terminada', () => {
    // Fallas de red o del servidor: la sesión se conserva.
    assert.equal(auth.sesionTerminada({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }), false);
    assert.equal(auth.sesionTerminada({ name: 'AuthRetryableFetchError', status: 503 }), false);
    assert.equal(auth.sesionTerminada({ message: 'TypeError: Failed to fetch', code: '' }), false);
    assert.equal(auth.sesionTerminada({ name: 'TiempoAgotado', message: 'network timeout' }), false);
    assert.equal(auth.sesionTerminada({ name: 'AuthApiError', status: 429, code: 'over_request_rate_limit' }), false);
    assert.equal(auth.sesionTerminada(null), false);
    // La sesión ya no existe en Supabase.
    assert.equal(auth.sesionTerminada({ name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' }), true);
    assert.equal(auth.sesionTerminada({ name: 'AuthApiError', status: 400, code: 'refresh_token_already_used' }), true);
    assert.equal(auth.sesionTerminada({ name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token: Refresh Token Not Found' }), true);
    assert.equal(auth.sesionTerminada({ name: 'AuthApiError', status: 403, code: 'bad_jwt' }), true);
    assert.equal(auth.sesionTerminada({ name: 'AuthSessionMissingError', status: 400 }), true);
});

test('un token rechazado por la base se reconoce para renovarlo', () => {
    assert.equal(auth.tokenRechazado({ code: 'PGRST303', message: 'JWT expired' }), true);
    assert.equal(auth.tokenRechazado({ code: 'PGRST301', message: 'JWSError' }), true);
    assert.equal(auth.tokenRechazado({ code: '42501', message: 'permission denied' }), false);
    assert.equal(auth.tokenRechazado({ code: '', message: 'TypeError: Failed to fetch' }), false);
});

test('conLimite corta la espera si Supabase no responde', async () => {
    await assert.rejects(auth.conLimite(new Promise(() => {}), 5), error => error.name === 'TiempoAgotado' && /network/.test(error.message));
    assert.equal(await auth.conLimite(Promise.resolve('ok'), 50), 'ok');
});

// --- Flujo completo de arranque con DOM y Supabase falsos ---

const PERFIL_CAJERO = { email: 'lospinos_kalo@gmail.com', rol: 'cajero', local: 'LOS PINOS', aal: 'aal1', admin_activo: false };
const SIN_RED = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 };
const PERFIL_OK = { data: PERFIL_CAJERO, error: null, status: 200 };
const PANTALLAS = ['bootCard', 'loginCard', 'mfaCard', 'mfaEnrollCard', 'localPicker', 'appView', 'reconnectCard'];
const flush = () => new Promise(resolve => setImmediate(resolve));

// perfil: respuestas sucesivas de mi_perfil (la última se repite).
function arrancar({ session = { access_token: 't' }, getSessionError = null, perfil = [PERFIL_OK] } = {}) {
    const ids = elements([...PANTALLAS, 'reconnectStatusMsg', 'reconnectBtn', 'loginForm', 'emailInput',
        'passwordInput', 'loginBtn', 'loginStatusMsg']);
    PANTALLAS.slice(1).forEach(id => ids[id].classList.add('hidden'));
    const llamadas = { signOut: 0, refreshSession: 0, miPerfil: 0, onReady: 0 };
    const respuestas = [...perfil];
    const supabase = {
        auth: {
            async getSession() { return { data: { session }, error: getSessionError }; },
            async refreshSession() { llamadas.refreshSession++; return { data: { session }, error: null }; },
            async signOut() { llamadas.signOut++; session = null; return { error: null }; },
            onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
        },
        async rpc() {
            llamadas.miPerfil++;
            return respuestas.length > 1 ? respuestas.shift() : respuestas[0];
        }
    };
    const timers = [];
    const { state, resetSessionState } = loadModule('state.js').exports;
    const { exports: modulo } = loadModule('auth.js', {
        supabase, state, resetSessionState,
        localPorId: c.localPorId, localPorSlug: c.localPorSlug,
        describeError: utils().describeError,
        customAlert: async () => {},
        document: fakeDocument(ids),
        window: {
            location: { search: '', href: 'https://dirdhl.github.io/kalo/' },
            history: { replaceState() {} },
            localStorage: { getItem: () => null, setItem() {} },
            addEventListener() {}
        },
        // Los temporizadores no corren solos: la prueba dispara el reintento a mano.
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
        clearTimeout() {}
    });
    modulo.setupAuth({ onReady: () => { llamadas.onReady++; } });
    const visibles = () => PANTALLAS.filter(id => !ids[id].classList.contains('hidden'));
    return { ids, llamadas, timers, visibles, state };
}

test('sin internet al abrir Kalo, la sesión NO se cierra y se reintenta solo', async () => {
    const app = arrancar({ perfil: [SIN_RED, PERFIL_OK] });
    await flush();
    assert.deepEqual(app.visibles(), ['reconnectCard']);
    assert.equal(app.llamadas.signOut, 0, 'no debe borrar la sesión guardada');
    assert.match(app.ids.reconnectStatusMsg.textContent, /conexión/);
    const reintento = app.timers.find(timer => timer.ms === auth.REINTENTO_MS);
    assert.ok(reintento, 'debe programar un reintento automático');

    reintento.fn();
    await flush();
    assert.deepEqual(app.visibles(), ['appView']);
    assert.equal(app.llamadas.onReady, 1);
    assert.equal(app.state.currentLocal, 'LOS PINOS');
    assert.equal(app.llamadas.signOut, 0);
});

test('el botón "Reintentar ahora" vuelve a intentar sin pedir la contraseña', async () => {
    const app = arrancar({ perfil: [SIN_RED, SIN_RED, PERFIL_OK] });
    await flush();
    await app.ids.reconnectBtn.click();
    await flush();
    assert.deepEqual(app.visibles(), ['reconnectCard']);
    await app.ids.reconnectBtn.click();
    await flush();
    assert.deepEqual(app.visibles(), ['appView']);
    assert.equal(app.llamadas.miPerfil, 3);
    assert.equal(app.llamadas.signOut, 0);
});

test('si la renovación del token falla por red al abrir, se espera en vez de mostrar el ingreso', async () => {
    const app = arrancar({ session: null, getSessionError: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } });
    await flush();
    assert.deepEqual(app.visibles(), ['reconnectCard']);
    assert.equal(app.llamadas.signOut, 0);
});

test('un token vencido se renueva y se entra sin pedir la contraseña', async () => {
    const app = arrancar({ perfil: [{ data: null, error: { code: 'PGRST303', message: 'JWT expired' }, status: 401 }, PERFIL_OK] });
    await flush();
    assert.equal(app.llamadas.refreshSession, 1);
    assert.deepEqual(app.visibles(), ['appView']);
    assert.equal(app.llamadas.signOut, 0);
});

test('si Supabase dio la sesión por terminada, se muestra el ingreso', async () => {
    const app = arrancar({ session: null, getSessionError: { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' } });
    await flush();
    assert.deepEqual(app.visibles(), ['loginCard']);
    assert.match(app.ids.loginStatusMsg.textContent, /sesión terminó/);
});

test('sin sesión guardada se muestra el ingreso de siempre', async () => {
    const app = arrancar({ session: null });
    await flush();
    assert.deepEqual(app.visibles(), ['loginCard']);
    assert.equal(app.ids.loginStatusMsg.textContent, '');
});
