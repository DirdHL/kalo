// Utilidades puras (sin pantalla ni base de datos), fáciles de probar.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Todo texto que venga de la base de datos o del usuario pasa por aquí antes de ir a innerHTML.
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

export function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value) {
    const amount = Number(value);
    return `S/ ${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
}

// "2026-11-04" → 4 de noviembre a las 00:00 en hora local.
// (new Date('2026-11-04') usa UTC y en Perú cae el día anterior.)
export function parseLocalDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

export function toDateInputValue(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toMonthInputValue(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

// Inicio (incluido) y fin (excluido) de un mes "AAAA-MM" en hora local.
export function monthRange(monthValue) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(monthValue ?? ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

// Inicio (incluido) y fin (excluido) de un día "AAAA-MM-DD" en hora local.
export function dayRange(dateValue) {
    const start = parseLocalDate(dateValue);
    if (!start) return null;
    return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) };
}

// 'vencido' | 'por-vencer' | 'ok' según la fecha de vencimiento de un lote. Vence al final del día indicado.
export function estadoVencimiento(fecha, now = new Date(), diasAviso = 30) {
    const vence = parseLocalDate(fecha);
    if (!vence) return null;
    const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (vence < hoy) return 'vencido';
    const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + diasAviso);
    return vence <= limite ? 'por-vencer' : 'ok';
}

// Supabase devuelve como máximo 1000 filas por consulta: pide páginas hasta traer todo.
// buildQuery debe crear la consulta desde cero y ordenarla de forma estable (por ejemplo, fecha e id).
export async function fetchAll(buildQuery, pageSize = 1000) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await buildQuery().range(from, from + pageSize - 1);
        if (error) throw error;
        const page = data || [];
        rows.push(...page);
        if (page.length < pageSize) return rows;
    }
}

// Mensaje entendible para errores de Supabase, de la red o de la base de datos.
export function describeError(error) {
    if (!error) return 'Ocurrió un error inesperado.';
    const code = String(error.code || '');
    const message = String(error.message || error);
    if (code === 'PGRST202' || /Could not find the function|schema cache/i.test(message)
        || (/does not exist/i.test(message) && /activo|venta_items|combo_items|mi_perfil|registrar_venta/i.test(message))) {
        return 'La base de datos todavía no tiene la actualización de seguridad. Avísale al administrador.';
    }
    if (/Failed to fetch|NetworkError|fetch failed|Load failed|network/i.test(message)) {
        return 'No hay conexión a internet. Revisa la red e inténtalo de nuevo.';
    }
    if (/JWT expired|refresh token/i.test(message)) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    if (/row-level security|permission denied/i.test(message)) return 'No tienes permiso para hacer esto.';
    if (/productos_stock_no_negativo/.test(message)) return 'El stock no puede ser negativo.';
    if (/productos_precios_no_negativos/.test(message)) return 'Los precios no pueden ser negativos.';
    if (code === '23505') return 'Ya existe un registro con esos datos.';
    return message;
}

// Unidades que el carrito necesita de cada producto (los combos se cuentan por sus componentes).
export function stockRequerido(cart, combos) {
    const requerido = new Map();
    const sumar = (id, cantidad) => requerido.set(String(id), (requerido.get(String(id)) || 0) + cantidad);
    for (const item of cart) {
        const componentes = combos.get(String(item.id));
        if (componentes && componentes.length) {
            for (const componente of componentes) sumar(componente.producto_id, componente.cantidad * item.qty);
        } else {
            sumar(item.id, item.qty);
        }
    }
    return requerido;
}

// Primer producto cuyo stock no alcanza para el carrito, o null si todo alcanza.
export function faltanteDeStock(cart, combos, productsById) {
    for (const [id, requerido] of stockRequerido(cart, combos)) {
        const producto = productsById.get(id);
        if (!producto) return { nombre: 'un producto del combo', disponible: 0, requerido };
        if (producto.stock == null) continue;
        const disponible = Number(producto.stock);
        if (!Number.isFinite(disponible) || requerido > disponible) {
            return { nombre: producto.nombre, disponible: Number.isFinite(disponible) ? disponible : 0, requerido };
        }
    }
    return null;
}

// Totales de un conjunto de ventas. Las reembolsadas se cuentan aparte.
// Cuánto de una venta entró en efectivo y cuánto por Yape/Plin.
// Las ventas antiguas no guardaban el reparto: se toma el total según el método.
export function montosDeVenta(venta) {
    const total = Number(venta?.total) || 0;
    if (venta?.efectivo == null && venta?.yape == null) {
        return venta?.metodo_pago === 'Yape' ? { efectivo: 0, yape: total } : { efectivo: total, yape: 0 };
    }
    return { efectivo: Number(venta.efectivo) || 0, yape: Number(venta.yape) || 0 };
}

// Descuento de la PNP (policía): es el único descuento y cubre todo el ticket (total S/ 0.00).
export function esVentaPNP(venta) {
    return (Number(venta?.descuento) || 0) > 0 && roundMoney(Number(venta?.total) || 0) === 0;
}

export function resumirVentas(ventas) {
    const resumen = { cantidad: 0, ventas: 0, descuentos: 0, costo: 0, efectivo: 0, yape: 0, reembolsos: 0, cantidadReembolsos: 0 };
    for (const venta of ventas) {
        const total = Number(venta.total) || 0;
        if (venta.estado === 'reembolsada') {
            resumen.reembolsos += total;
            resumen.cantidadReembolsos++;
            continue;
        }
        resumen.cantidad++;
        resumen.ventas += total;
        resumen.descuentos += Number(venta.descuento) || 0;
        resumen.costo += Number(venta.costo_total) || 0;
        const montos = montosDeVenta(venta);
        resumen.efectivo += montos.efectivo;
        resumen.yape += montos.yape;
    }
    for (const key of ['ventas', 'descuentos', 'costo', 'efectivo', 'yape', 'reembolsos']) resumen[key] = roundMoney(resumen[key]);
    resumen.margen = roundMoney(resumen.ventas - resumen.costo);
    return resumen;
}

// Ventas, margen y descuentos por día ("AAAA-MM-DD" en hora local), sin reembolsadas.
export function ventasPorDia(ventas) {
    const dias = new Map();
    for (const venta of ventas) {
        if (venta.estado === 'reembolsada') continue;
        const fecha = new Date(venta.fecha);
        if (Number.isNaN(fecha.getTime())) continue;
        const key = toDateInputValue(fecha);
        const dia = dias.get(key) || { cantidad: 0, ventas: 0, margen: 0, descuentos: 0 };
        const total = Number(venta.total) || 0;
        dia.cantidad++;
        dia.ventas += total;
        dia.margen += total - (Number(venta.costo_total) || 0);
        dia.descuentos += Number(venta.descuento) || 0;
        dias.set(key, dia);
    }
    return dias;
}

export const REEMBOLSO_CAJERO_MINUTOS = 15;

// Misma regla que la base de datos: admin siempre; cajero, solo su local y dentro de 15 minutos.
export function puedeReembolsar(venta, perfil, now = Date.now()) {
    if (!venta || !perfil || venta.estado === 'reembolsada') return false;
    if (perfil.esAdmin) return true;
    if (perfil.rol !== 'cajero' || venta.local !== perfil.local) return false;
    const fecha = new Date(venta.fecha).getTime();
    return Number.isFinite(fecha) && now - fecha <= REEMBOLSO_CAJERO_MINUTOS * 60 * 1000;
}

// Texto corto de los productos de una venta, a partir del detalle guardado.
export function resumenProductos(detalles) {
    if (!Array.isArray(detalles) || detalles.length === 0) return 'Sin detalles';
    return detalles.map(item => `${Number(item.qty) || 0}x ${String(item.nombre ?? 'Producto').replace(/_/g, ' ')}`).join(', ');
}

// Parte visible de un correo ("caja1@kalo.pe" → "caja1").
export function nombreCorto(email) {
    const text = String(email ?? '');
    return text.includes('@') ? text.slice(0, text.indexOf('@')) : text;
}

// Descarga un Excel generado en el navegador (no sale a ningún servidor).
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function descargarArchivo(contenido, nombre, tipo = TIPO_XLSX) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
