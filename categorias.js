// Categorías de productos. Siempre están las de base; las vendedoras pueden crear otras
// desde el formulario de producto. Una categoría nueva existe mientras algún producto del
// local la use (se guarda en productos.categoria, no hace falta otra tabla).
import { CATEGORIA_COMBOS } from "./constants.js";
import { escapeHtml } from "./utils.js";

export const CATEGORIAS_BASE = [
    { nombre: 'Bebidas', icono: '🥤' },
    { nombre: 'Snacks', icono: '🍿' },
    { nombre: 'Lácteos', icono: '🥛' },
    { nombre: 'Limpieza', icono: '🧼' },
    { nombre: 'Dulces', icono: '🍬' },
    { nombre: 'Abarrotes', icono: '🥫' },
    { nombre: 'Otros', icono: '📦' }
];
export const ICONO_CATEGORIA_NUEVA = '🏷️';
export const MAX_LARGO_CATEGORIA = 30;
const RESERVADAS = ['Todos', CATEGORIA_COMBOS];

// "Lácteos", "lacteos" y " LÁCTEOS " son la misma categoría.
export function claveCategoria(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function mismaCategoria(a, b) {
    const clave = claveCategoria(a);
    return clave !== '' && clave === claveCategoria(b);
}

// Lo que escribe la vendedora → nombre limpio ("  golosinas " → "Golosinas").
// Devuelve '' si no sirve (muy corto, muy largo, sin letras ni números o reservado).
export function normalizarCategoria(texto) {
    const limpio = String(texto ?? '').replace(/[<>"'`]/g, '').trim().replace(/\s+/g, ' ');
    if (limpio.length < 2 || limpio.length > MAX_LARGO_CATEGORIA) return '';
    if (!/[\p{L}\p{N}]/u.test(limpio)) return '';
    if (RESERVADAS.some(reservada => mismaCategoria(reservada, limpio))) return '';
    return limpio.charAt(0).toLocaleUpperCase('es') + limpio.slice(1);
}

// Las de base (en su orden) + las que usan los productos del local, sin repetir y sin Combos.
export function listaCategorias(productos = [], extras = []) {
    const vistas = new Set(CATEGORIAS_BASE.map(c => claveCategoria(c.nombre)));
    vistas.add(claveCategoria(CATEGORIA_COMBOS));
    const nuevas = [];
    for (const nombre of [...(productos || []).map(p => p?.categoria), ...extras]) {
        const limpio = String(nombre ?? '').trim().replace(/\s+/g, ' ');
        const clave = claveCategoria(limpio);
        if (!clave || vistas.has(clave)) continue;
        vistas.add(clave);
        nuevas.push({ nombre: limpio, icono: ICONO_CATEGORIA_NUEVA });
    }
    nuevas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    return [...CATEGORIAS_BASE, ...nuevas];
}

// ¿La categoría elegida en el filtro sigue existiendo? (si no, se vuelve a "Todos").
export function categoriaVigente(activa, categorias) {
    if (activa === 'Todos' || mismaCategoria(activa, CATEGORIA_COMBOS)) return activa;
    return categorias.some(c => mismaCategoria(c.nombre, activa)) ? activa : 'Todos';
}

// Botones de filtro: Todos + categorías + Combos al final (con su color).
export function htmlFiltrosCategoria(categorias, clase, activa = 'Todos') {
    const boton = (valor, texto, extra = '') => {
        const activo = valor === 'Todos' ? activa === 'Todos' : mismaCategoria(valor, activa);
        return `<button type="button" class="${clase}${extra}${activo ? ' active' : ''}" data-cat="${escapeHtml(valor)}" aria-pressed="${activo}">${escapeHtml(texto)}</button>`;
    };
    return [
        boton('Todos', 'Todos'),
        ...categorias.map(c => boton(c.nombre, `${c.icono} ${c.nombre}`)),
        boton(CATEGORIA_COMBOS, `🍔 ${CATEGORIA_COMBOS}`, ' combo-filter')
    ].join('');
}
