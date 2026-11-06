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
// Adonde van los productos de una categoría que se elimina.
export const CATEGORIA_POR_DEFECTO = 'Otros';
export const MAX_LARGO_CATEGORIA = 30;
const RESERVADAS = ['Todos', CATEGORIA_COMBOS];

// "Lácteos", "lacteos" y " LÁCTEOS " son la misma categoría.
export function claveCategoria(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
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
    const fijas = new Set(CATEGORIAS_BASE.map(c => claveCategoria(c.nombre)));
    fijas.add(claveCategoria(CATEGORIA_COMBOS));
    // Si la misma categoría está escrita de varias formas, se muestra la que usan más
    // productos (y en empate, la que empieza con mayúscula).
    const formas = new Map();
    for (const nombre of [...(productos || []).map(p => p?.categoria), ...extras]) {
        const limpio = String(nombre ?? '').trim().replace(/\s+/g, ' ');
        const clave = claveCategoria(limpio);
        if (!clave || fijas.has(clave)) continue;
        const usos = formas.get(clave) || new Map();
        usos.set(limpio, (usos.get(limpio) || 0) + 1);
        formas.set(clave, usos);
    }
    const mayuscula = texto => (texto.charAt(0) !== texto.charAt(0).toLocaleLowerCase('es') ? 1 : 0);
    const nuevas = [...formas.values()].map(usos => {
        const [nombre] = [...usos.entries()]
            .sort((a, b) => b[1] - a[1] || mayuscula(b[0]) - mayuscula(a[0]) || a[0].localeCompare(b[0], 'es'))[0];
        return { nombre, icono: ICONO_CATEGORIA_NUEVA, propia: true };
    });
    nuevas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    return [...CATEGORIAS_BASE, ...nuevas];
}

// ¿La categoría elegida en el filtro sigue existiendo? (si no, se vuelve a "Todos").
export function categoriaVigente(activa, categorias) {
    if (activa === 'Todos' || mismaCategoria(activa, CATEGORIA_COMBOS)) return activa;
    return categorias.some(c => mismaCategoria(c.nombre, activa)) ? activa : 'Todos';
}

// ¿Es una de las categorías de siempre? (esas no se pueden eliminar)
export function esCategoriaBase(nombre) {
    return CATEGORIAS_BASE.some(c => mismaCategoria(c.nombre, nombre)) || mismaCategoria(nombre, CATEGORIA_COMBOS);
}

// Botones de filtro: Todos + categorías + Combos al final (con su color).
// Con borrar: true, las categorías creadas por las vendedoras llevan una "×" para eliminarlas.
export function htmlFiltrosCategoria(categorias, clase, activa = 'Todos', { borrar = false } = {}) {
    const boton = (valor, texto, extra = '') => {
        const activo = valor === 'Todos' ? activa === 'Todos' : mismaCategoria(valor, activa);
        return `<button type="button" class="${clase}${extra}${activo ? ' active' : ''}" data-cat="${escapeHtml(valor)}" aria-pressed="${activo}">${escapeHtml(texto)}</button>`;
    };
    const conBorrar = c => `<span class="cat-chip">${boton(c.nombre, `${c.icono} ${c.nombre}`)}`
        + `<button type="button" class="cat-delete-btn" data-borrar-cat="${escapeHtml(c.nombre)}" title="Eliminar categoría ${escapeHtml(c.nombre)}" aria-label="Eliminar categoría ${escapeHtml(c.nombre)}">×</button></span>`;
    return [
        boton('Todos', 'Todos'),
        ...categorias.map(c => (borrar && c.propia ? conBorrar(c) : boton(c.nombre, `${c.icono} ${c.nombre}`))),
        boton(CATEGORIA_COMBOS, `🍔 ${CATEGORIA_COMBOS}`, ' combo-filter')
    ].join('');
}
