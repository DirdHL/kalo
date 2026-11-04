// Reglas de seguridad que no deben romperse con cambios futuros.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read } = require('./helpers.cjs');

const APP_JS = fs.readdirSync(ROOT).filter(file => file.endsWith('.js'));
const APP_HTML = ['index.html', 'brisas.html', 'pinos.html', 'polideportivo.html'];

test('las páginas de Kalo no cargan scripts externos ni código inline', () => {
    for (const file of APP_HTML) {
        const html = read(file);
        assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i, `${file}: script externo`);
        assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${file}: manejador inline (onclick, onerror...)`);
        assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${file}: script inline`);
    }
    assert.match(read('index.html'), /<script type="module" src="\.\/app\.js"><\/script>/);
});

test('el código no publica funciones en window ni usa CDNs', () => {
    for (const file of APP_JS) {
        const source = read(file);
        assert.doesNotMatch(source, /window\.[A-Za-z_$][\w$]*\s*=(?!=)/, `${file}: asigna una global en window`);
        assert.doesNotMatch(source, /cdn\.jsdelivr|unpkg\.com|cdnjs/, `${file}: carga librerías desde un CDN`);
        assert.doesNotMatch(source, /onerror=|onclick=/, `${file}: genera manejadores inline`);
    }
});

test('los permisos ya no están escritos en el frontend', () => {
    for (const file of APP_JS) {
        const source = read(file);
        assert.doesNotMatch(source, /ADMIN_EMAILS|_kalo@gmail\.com|zzenisx1234/, `${file}: decide permisos con correos fijos`);
    }
});

test('la migración activa RLS, cierra el acceso anónimo y protege las funciones', () => {
    const sql = read(path.join('supabase', '01_fase_a_seguridad.sql'));
    for (const table of ['productos', 'ventas', 'combo_items', 'venta_items']) {
        assert.match(sql, new RegExp(`alter table public\\.${table}\\s+enable row level security`), table);
    }
    assert.match(sql, /revoke all on public\.productos, public\.ventas, public\.combo_items, public\.venta_items from anon/);
    const definers = sql.match(/security definer/g).length;
    const searchPaths = sql.match(/security definer set search_path = ''/g).length;
    assert.equal(definers, searchPaths, 'toda función security definer fija search_path');
    assert.match(sql, /revoke all on function public\.kalo_asignar, public\.kalo_quitar_acceso from public, anon, authenticated/);
    const faseB = read(path.join('supabase', '02_fase_b_cierre.sql'));
    assert.match(faseB, /drop policy if exists kalo_ventas_legado_crear/);
    assert.match(faseB, /revoke insert, update, delete on public\.ventas from authenticated/);
});

test('las dependencias tienen versión fija y vite es solo de desarrollo', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.dependencies.vite, undefined);
    assert.ok(pkg.devDependencies.vite);
    for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
        if (name === '@supabase/supabase-js') continue;
        assert.doesNotMatch(version, /^[\^~]/, `${name} debería tener versión fija`);
    }
});

test('el archivo .env no se sube al repositorio', () => {
    assert.match(read('.gitignore'), /^\.env$/m);
});
