// Utilidades compartidas por los tests: DOM falso, Supabase falso y carga de módulos en una sandbox.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function read(file) {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

// Nombres exportados por un módulo (funciones y constantes).
function exportedNames(source) {
    return [...source.matchAll(/^export (?:async function|function|const|let|class) (\w+)/gm)].map(match => match[1]);
}

// Ejecuta un módulo del navegador en una sandbox: quita los import y expone lo exportado.
function loadModule(file, globals = {}) {
    const original = read(file);
    const source = original
        .replace(/^import .*;\r?$/gm, '')
        .replace(/^export (async function|function|class) /gm, '$1 ')
        .replace(/^export (const|let) /gm, 'var ');
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {} },
        setTimeout, clearTimeout, URL, URLSearchParams, structuredClone,
        ...globals
    });
    vm.runInContext(source, context, { filename: file });
    const exports = {};
    for (const name of exportedNames(original)) exports[name] = context[name];
    return { context, exports };
}

let cachedUtils = null;
function utils() {
    if (!cachedUtils) cachedUtils = loadModule('utils.js').exports;
    return cachedUtils;
}

function constants() {
    return loadModule('constants.js').exports;
}

// Elemento HTML falso con lo mínimo que usa Kalo.
function element(tag = 'div', props = {}) {
    const classes = new Set();
    const listeners = {};
    const el = {
        tagName: tag.toUpperCase(),
        value: '', textContent: '', disabled: false, style: {}, dataset: {}, children: [], attributes: {},
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name),
            toggle(name, force) {
                const on = force === undefined ? !classes.has(name) : Boolean(force);
                if (on) classes.add(name); else classes.delete(name);
                return on;
            }
        },
        getAttribute(name) { return this.attributes[name] ?? null; },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
        async dispatch(type, event = {}) {
            for (const handler of listeners[type] || []) await handler({ target: el, preventDefault() {}, ...event });
        },
        click() { return this.dispatch('click'); },
        appendChild(child) { this.children.push(child); return child; },
        append(...nodes) { this.children.push(...nodes); },
        remove() {},
        focus() {},
        select() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        closest() { return null; },
        getContext() { return {}; },
        set innerHTML(value) { this._html = String(value); this.children = []; },
        get innerHTML() { return this._html || ''; }
    };
    return Object.assign(el, props);
}

// Todo el texto/HTML que se puso dentro de un elemento (para buscar contenido sin escapar).
function rendered(el) {
    if (!el) return '';
    return [el.innerHTML, el.textContent, ...(el.children || []).map(rendered)].join('\n');
}

function fakeDocument(ids = {}, selectors = {}) {
    return {
        listeners: {},
        getElementById: id => ids[id] || null,
        querySelector: selector => (selectors[selector] || [])[0] || null,
        querySelectorAll: selector => selectors[selector] || [],
        createElement: tag => element(tag),
        addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
        activeElement: null
    };
}

function elements(names) {
    return Object.fromEntries(names.map(name => [name, element()]));
}

// Supabase falso: tablas en memoria, consultas encadenables y funciones RPC configurables.
function fakeSupabase({ tables = {}, rpc = {}, fail = {} } = {}) {
    const db = structuredClone(tables);
    const calls = [];
    const rpcCalls = [];

    function execute(q) {
        calls.push(q);
        const failure = fail[q.table]?.(q, db);
        if (failure) return failure;
        const rows = (db[q.table] ||= []);
        const match = row => q.filters.every(([op, key, value]) => {
            if (op === 'eq') return String(row[key]) === String(value);
            if (op === 'gte') return row[key] >= value;
            if (op === 'lt') return row[key] < value;
            if (op === 'in') return value.map(String).includes(String(row[key]));
            return true;
        });
        if (q.op === 'insert') {
            for (const row of [].concat(q.payload)) rows.push({ id: rows.length + 1, ...row });
            return { data: null, error: null };
        }
        let matched = rows.filter(match);
        if (q.op === 'update') {
            matched.forEach(row => Object.assign(row, q.payload));
            return { data: q.returning ? matched.map(row => ({ id: row.id })) : null, error: null };
        }
        for (const [key, asc] of [...q.orders].reverse()) {
            matched = [...matched].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (asc ? 1 : -1));
        }
        if (q.range) matched = matched.slice(q.range[0], q.range[1] + 1);
        if (q.limit != null) matched = matched.slice(0, q.limit);
        return { data: structuredClone(matched), error: null };
    }

    function from(table) {
        const q = { table, op: 'select', columns: '*', filters: [], orders: [], range: null, limit: null, payload: null, returning: false };
        const api = {
            select(columns = '*') {
                if (q.op === 'select') q.columns = columns; else q.returning = true;
                return api;
            },
            insert(rows) { q.op = 'insert'; q.payload = rows; return api; },
            update(values) { q.op = 'update'; q.payload = values; return api; },
            eq(key, value) { q.filters.push(['eq', key, value]); return api; },
            gte(key, value) { q.filters.push(['gte', key, value]); return api; },
            lt(key, value) { q.filters.push(['lt', key, value]); return api; },
            in(key, value) { q.filters.push(['in', key, value]); return api; },
            order(key, options) { q.orders.push([key, options?.ascending !== false]); return api; },
            limit(count) { q.limit = count; return api; },
            range(start, end) { q.range = [start, end]; return api; },
            then(resolve, reject) { return Promise.resolve().then(() => execute(q)).then(resolve, reject); }
        };
        return api;
    }

    return {
        db, calls, rpcCalls, from,
        async rpc(name, params) {
            rpcCalls.push({ name, params: structuredClone(params) });
            const handler = rpc[name];
            if (!handler) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } };
            try {
                return { data: await handler(params, db), error: null };
            } catch (error) {
                return { data: null, error: { message: error.message, code: error.code } };
            }
        }
    };
}

// Copia "normal" de datos creados dentro de la sandbox (para comparar con deepEqual).
const plain = value => JSON.parse(JSON.stringify(value));

module.exports = { ROOT, read, loadModule, utils, constants, element, rendered, fakeDocument, elements, fakeSupabase, plain };
