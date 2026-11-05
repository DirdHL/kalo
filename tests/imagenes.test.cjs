const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, constants, read } = require('./helpers.cjs');

const BASE = 'https://abc.supabase.co/storage/v1/object/public/imagenes/';

test('resolveImage usa Supabase Storage para las imágenes subidas (sb:) y el logo si el nombre es raro', () => {
    const c = constants();
    assert.equal(c.resolveImage('sb:GALLETA-OREO.webp'), './kalo-logo.png', 'sin configurar: logo');
    c.configurarImagenesNube(BASE);
    assert.equal(c.resolveImage('sb:GALLETA-OREO.webp'), `${BASE}GALLETA-OREO.webp`);
    for (const raro of ['sb:../secreto.webp', 'sb:a.webp', 'sb:X.svg', 'sb:"><script>.png', 'sb:']) {
        assert.equal(c.resolveImage(raro), './kalo-logo.png', raro);
    }
    assert.equal(c.resolveImage('AGUA-LOA-3L.svg'), './img/AGUA-LOA-3L.svg', 'las de la app siguen igual');
    assert.equal(c.etiquetaImagen('sb:GALLETA-OREO-36G.webp'), 'GALLETA OREO 36G');
});

function loadImagenes({ storage = {}, comprimir } = {}) {
    const configurado = [];
    const calls = [];
    const bucket = {
        list: async (...args) => { calls.push(['list', ...args]); return storage.list?.() ?? { data: [], error: null }; },
        upload: async (...args) => { calls.push(['upload', ...args]); return storage.upload?.(...args) ?? { data: {}, error: null }; },
        remove: async (...args) => { calls.push(['remove', ...args]); return storage.remove?.(...args) ?? { data: [{}], error: null }; }
    };
    const c = constants();
    const { context, exports } = loadModule('imagenes.js', {
        supabase: { storage: { from: name => { calls.push(['from', name]); return bucket; } } },
        SUPABASE_URL: 'https://abc.supabase.co/',
        configurarImagenesNube: base => configurado.push(base),
        NOMBRE_NUBE_VALIDO: c.NOMBRE_NUBE_VALIDO, PREFIJO_NUBE: c.PREFIJO_NUBE
    });
    context.comprimirImagen = comprimir || (async () => ({ blob: { size: 1000, type: 'image/webp' }, ext: 'webp' }));
    return { ...exports, configurado, calls };
}

test('imagenes.js apunta al bucket público "imagenes" del proyecto', () => {
    const m = loadImagenes();
    assert.deepEqual(m.configurado, [BASE]);
});

test('el nombre escrito se convierte en un nombre de archivo seguro', () => {
    const { nombreArchivoImagen } = loadImagenes();
    assert.equal(nombreArchivoImagen('Galleta Oreo 36g'), 'GALLETA-OREO-36G');
    assert.equal(nombreArchivoImagen('  Piña  ñandú / 1L  '), 'PINA-NANDU-1L');
    assert.equal(nombreArchivoImagen('../../etc'), 'ETC');
    assert.equal(nombreArchivoImagen('¡¡!!'), '');
    assert.ok(nombreArchivoImagen('a'.repeat(200)).length <= 80);
    assert.match(nombreArchivoImagen('a-'.repeat(60)), /^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$/);
});

test('subir guarda WEBP sin reemplazar otra imagen y devuelve sb:NOMBRE', async () => {
    const m = loadImagenes();
    const valor = await m.subirImagenNube({ type: 'image/jpeg' }, 'Chifles Piuranos');
    assert.equal(valor, 'sb:CHIFLES-PIURANOS.webp');
    const upload = m.calls.find(call => call[0] === 'upload');
    assert.equal(upload[1], 'CHIFLES-PIURANOS.webp');
    assert.equal(upload[3].upsert, false);
    assert.deepEqual(m.calls.find(call => call[0] === 'from'), ['from', 'imagenes']);
});

test('subir rechaza archivos que no son imagen, nombres vacíos y nombres repetidos', async () => {
    const m = loadImagenes({ storage: { upload: () => ({ data: null, error: { message: 'The resource already exists', statusCode: '409' } }) } });
    await assert.rejects(m.subirImagenNube({ type: 'application/pdf' }, 'X'), /archivo de imagen/);
    await assert.rejects(m.subirImagenNube({ type: 'image/png' }, '***'), /Escribe un nombre/);
    await assert.rejects(m.subirImagenNube({ type: 'image/png' }, 'Chifles'), /Ya existe una imagen llamada "CHIFLES"/);
});

test('listar solo devuelve archivos con nombre válido', async () => {
    const m = loadImagenes({ storage: { list: () => ({ data: [{ name: '.emptyFolderPlaceholder' }, { name: 'B.webp' }, { name: 'A.jpg' }], error: null }) } });
    assert.deepEqual([...await m.listarImagenesNube()], ['B.webp', 'A.jpg']);
});

test('borrar avisa si Storage no borró nada (sin permiso) y no acepta nombres raros', async () => {
    const m = loadImagenes({ storage: { remove: () => ({ data: [], error: null }) } });
    await assert.rejects(m.borrarImagenNube('CHIFLES.webp'), /No se pudo borrar/);
    await assert.rejects(m.borrarImagenNube('../AGUA.svg'), /no se puede borrar/);
    const ok = loadImagenes();
    await ok.borrarImagenNube('CHIFLES.webp');
    assert.deepEqual([...ok.calls.find(call => call[0] === 'remove')[1]], ['CHIFLES.webp']);
});

test('el SQL de Storage limita el bucket a cuentas de Kalo, imágenes y 2 MB', () => {
    const sql = read('supabase/04_imagenes_storage.sql');
    assert.match(sql, /'imagenes', 'imagenes', true, 2097152, array\['image\/webp', 'image\/jpeg', 'image\/png'\]/);
    for (const accion of ['select', 'insert', 'delete']) {
        assert.match(sql, new RegExp(`on storage\\.objects for ${accion} to authenticated`), accion);
    }
    assert.equal((sql.match(/public\.kalo_rol\(\) in \('admin', 'cajero'\)/g) || []).length, 3);
    assert.doesNotMatch(sql, /\bto (anon|public)\b/);
    // La regla de nombres del SQL y la de la app deben ser la misma
    const reglaSql = sql.match(/name ~ '([^']+)'/)[1];
    assert.equal(reglaSql, constants().NOMBRE_NUBE_VALIDO.source);
});

test('la CSP permite mostrar imágenes de Supabase y de ningún otro sitio', () => {
    const config = read('vite.config.mjs');
    assert.match(config, /`img-src 'self' data: blob: \$\{supabaseOrigin\}`/);
});
