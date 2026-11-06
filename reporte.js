// Reporte profesional en Excel: cálculos (puros) + armado del libro con ExcelJS + gráficos.
import { roundMoney, resumirVentas, estadoVencimiento, parseLocalDate, nombreCorto, toDateInputValue, toMonthInputValue, formatMoney } from "./utils.js";
import { localPorId } from "./constants.js";

export const NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

// ---------------------------------------------------------------------------
// Periodo
// ---------------------------------------------------------------------------
export function rangoPeriodo(periodo, valorMes) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(valorMes ?? ''));
    if (!match) return null;
    const anio = Number(match[1]);
    const mes = Number(match[2]) - 1;
    if (periodo === 'anio') {
        return {
            periodo: 'anio', desde: new Date(anio, 0, 1), hasta: new Date(anio + 1, 0, 1),
            anteriorDesde: new Date(anio - 1, 0, 1), anteriorHasta: new Date(anio, 0, 1),
            titulo: `Año ${anio}`, tituloAnterior: `Año ${anio - 1}`, archivo: String(anio)
        };
    }
    return {
        periodo: 'mes', desde: new Date(anio, mes, 1), hasta: new Date(anio, mes + 1, 1),
        anteriorDesde: new Date(anio, mes - 1, 1), anteriorHasta: new Date(anio, mes, 1),
        titulo: `${NOMBRES_MESES[mes]} ${anio}`,
        tituloAnterior: `${NOMBRES_MESES[(mes + 11) % 12]} ${mes === 0 ? anio - 1 : anio}`,
        archivo: `${anio}-${String(mes + 1).padStart(2, '0')}`
    };
}

// Excel guarda fechas sin zona horaria: se pasa la hora de Perú tal cual se ve en la caja.
export function fechaExcel(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
}

const fechaLarga = d => d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
const nombreLocal = id => localPorId(id)?.nombre || id || 'Sin local';
const limpiar = texto => String(texto ?? '').replace(/_/g, ' ').trim();
const pctTexto = valor => `${(valor * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// Cálculos
// ---------------------------------------------------------------------------
function itemsDe(venta) {
    if (Array.isArray(venta.venta_items) && venta.venta_items.length) {
        return venta.venta_items.map(item => ({
            productoId: item.producto_id ?? null,
            nombre: limpiar(item.nombre) || 'Producto',
            cantidad: Number(item.cantidad) || 0,
            precio: Number(item.precio_unitario) || 0,
            costo: Number(item.costo_unitario) || 0,
            combo: Array.isArray(item.componentes) && item.componentes.length > 0
        }));
    }
    if (!Array.isArray(venta.detalles)) return [];
    return venta.detalles.map(item => ({
        productoId: item.id ?? null,
        nombre: limpiar(item.nombre) || 'Producto',
        cantidad: Number(item.qty) || 0,
        precio: Number(item.precio_venta) || 0,
        costo: Number(item.precio_compra) || 0,
        combo: String(item.codigo || '').startsWith('COMBO:')
    }));
}

function totalesDe(ventas) {
    const r = resumirVentas(ventas);
    let subtotal = 0;
    let unidades = 0;
    let conDescuento = 0;
    for (const venta of ventas) {
        if (venta.estado === 'reembolsada') continue;
        const total = Number(venta.total) || 0;
        const descuento = Number(venta.descuento) || 0;
        subtotal += venta.subtotal == null ? total + descuento : Number(venta.subtotal) || 0;
        if (descuento > 0) conDescuento++;
        for (const item of itemsDe(venta)) unidades += item.cantidad;
    }
    return {
        ...r,
        subtotal: roundMoney(subtotal),
        unidades,
        conDescuento,
        ticket: r.cantidad ? roundMoney(r.ventas / r.cantidad) : 0,
        margenPct: r.ventas ? r.margen / r.ventas : 0
    };
}

function agregar(mapa, clave, crear) {
    if (!mapa.has(clave)) mapa.set(clave, crear());
    return mapa.get(clave);
}

export function calcularReporte({ ventas = [], ventasPrevias = [], productos = [], rango, locales = [], generadoPor = '', ahora = new Date() }) {
    const multi = locales.length > 1;
    const validas = ventas.filter(v => v.estado !== 'reembolsada');
    const reembolsadas = ventas.filter(v => v.estado === 'reembolsada');
    const totales = totalesDe(ventas);
    const anteriores = ventasPrevias.length ? totalesDe(ventasPrevias) : null;
    const productosPorId = new Map(productos.map(p => [String(p.id), p]));

    // Periodo en texto
    const ultimoDia = new Date(rango.hasta.getFullYear(), rango.hasta.getMonth(), rango.hasta.getDate() - 1);
    const enCurso = ahora >= rango.desde && ahora < rango.hasta;
    const periodoTexto = `Del ${fechaLarga(rango.desde)} al ${fechaLarga(enCurso ? ahora : ultimoDia)}${enCurso ? ' (periodo en curso)' : ''}`;

    // Serie: por día (mes) o por mes (año)
    const porClave = new Map();
    const claveDe = fecha => (rango.periodo === 'anio' ? toMonthInputValue(fecha) : toDateInputValue(fecha));
    const serie = [];
    if (rango.periodo === 'anio') {
        for (let mes = 0; mes < 12; mes++) {
            const fecha = new Date(rango.desde.getFullYear(), mes, 1);
            const fila = { clave: claveDe(fecha), fecha, futuro: fecha > ahora, etiqueta: NOMBRES_MESES[mes], corta: NOMBRES_MESES[mes].slice(0, 3), cantidad: 0, ventas: 0, descuentos: 0, costo: 0, margen: 0, efectivo: 0, yape: 0, reembolsos: 0 };
            serie.push(fila);
            porClave.set(fila.clave, fila);
        }
    } else {
        for (let d = new Date(rango.desde); d < rango.hasta; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
            const fila = { clave: claveDe(d), fecha: d, futuro: d > ahora, etiqueta: DIAS[d.getDay()], corta: String(d.getDate()), cantidad: 0, ventas: 0, descuentos: 0, costo: 0, margen: 0, efectivo: 0, yape: 0, reembolsos: 0 };
            serie.push(fila);
            porClave.set(fila.clave, fila);
        }
    }

    const semana = new Map(ORDEN_SEMANA.map(d => [d, { dia: DIAS[d], cantidad: 0, ventas: 0, dias: 0 }]));
    const horas = new Map();
    const porProducto = new Map();
    const porLocal = new Map();
    const porVendedora = new Map();

    for (const venta of ventas) {
        const fecha = new Date(venta.fecha);
        const valida = venta.estado !== 'reembolsada';
        const total = Number(venta.total) || 0;
        const vendedora = nombreCorto(venta.creado_por_email) || 'Sin registrar (ventas antiguas)';
        agregar(porLocal, venta.local, () => []).push(venta);
        const v = agregar(porVendedora, vendedora, () => ({ nombre: vendedora, ventas: [], reembolsadas: 0, montoReembolsado: 0 }));
        v.ventas.push(venta);
        if (!valida) {
            v.reembolsadas++;
            v.montoReembolsado += total;
        }
        if (Number.isNaN(fecha.getTime())) continue;
        const fila = porClave.get(claveDe(fecha));
        if (!valida) {
            if (fila) fila.reembolsos += total;
            continue;
        }
        if (fila) {
            const r = resumirVentas([venta]);
            fila.cantidad++;
            fila.ventas += r.ventas;
            fila.descuentos += r.descuentos;
            fila.costo += r.costo;
            fila.margen += r.margen;
            fila.efectivo += r.efectivo;
            fila.yape += r.yape;
        }
        const s = semana.get(fecha.getDay());
        s.cantidad++;
        s.ventas += total;
        const h = agregar(horas, fecha.getHours(), () => ({ hora: fecha.getHours(), cantidad: 0, ventas: 0 }));
        h.cantidad++;
        h.ventas += total;
        for (const item of itemsDe(venta)) {
            const clave = item.productoId != null ? `id:${item.productoId}` : `n:${item.nombre}`;
            const producto = productosPorId.get(String(item.productoId));
            const p = agregar(porProducto, clave, () => ({
                producto: item.nombre,
                categoria: producto?.categoria || (item.combo ? 'Combos' : 'Sin categoría'),
                unidades: 0, ventas: 0, costo: 0
            }));
            p.producto = item.nombre;
            p.unidades += item.cantidad;
            p.ventas += item.cantidad * item.precio;
            p.costo += item.cantidad * item.costo;
        }
    }

    for (const fila of serie) {
        for (const k of ['ventas', 'descuentos', 'costo', 'margen', 'efectivo', 'yape', 'reembolsos']) fila[k] = roundMoney(fila[k]);
        fila.margenPct = fila.ventas ? fila.margen / fila.ventas : 0;
    }

    // Días de la semana: promedio sobre los días transcurridos del periodo
    const limite = enCurso ? new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1) : rango.hasta;
    for (let d = new Date(rango.desde); d < limite; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) semana.get(d.getDay()).dias++;
    const porDiaSemana = [...semana.values()].map(s => ({ ...s, ventas: roundMoney(s.ventas), promedio: s.dias ? roundMoney(s.ventas / s.dias) : 0 }));

    const porHora = [...horas.values()].sort((a, b) => a.hora - b.hora).map(h => ({
        ...h, ventas: roundMoney(h.ventas), etiqueta: `${String(h.hora).padStart(2, '0')}:00 – ${String(h.hora).padStart(2, '0')}:59`
    }));

    const sumaVendido = [...porProducto.values()].reduce((s, p) => s + p.ventas, 0);
    const listaProductos = [...porProducto.values()].map(p => {
        const ventasP = roundMoney(p.ventas);
        const costo = roundMoney(p.costo);
        const margen = roundMoney(ventasP - costo);
        const margenPct = ventasP ? margen / ventasP : 0;
        const bajoCosto = margen < 0;
        const sinCosto = !bajoCosto && costo === 0 && ventasP > 0;
        return {
            ...p, ventas: ventasP, costo, margen, margenPct,
            participacion: sumaVendido ? p.ventas / sumaVendido : 0,
            bajoCosto, sinCosto,
            observacion: bajoCosto ? 'Vendido por debajo de su costo'
                : sinCosto ? 'Sin precio de compra registrado'
                    : margenPct < 0.1 ? 'Margen bajo (menos de 10%)' : ''
        };
    }).sort((a, b) => b.ventas - a.ventas || b.unidades - a.unidades);
    listaProductos.forEach((p, i) => { p.posicion = i + 1; });

    const categorias = new Map();
    for (const p of listaProductos) {
        const c = agregar(categorias, p.categoria, () => ({ categoria: p.categoria, productos: 0, unidades: 0, ventas: 0, costo: 0 }));
        c.productos++;
        c.unidades += p.unidades;
        c.ventas += p.ventas;
        c.costo += p.costo;
    }
    const listaCategorias = [...categorias.values()].map(c => {
        const ventasC = roundMoney(c.ventas);
        const margen = roundMoney(ventasC - c.costo);
        return { ...c, ventas: ventasC, costo: roundMoney(c.costo), margen, margenPct: ventasC ? margen / ventasC : 0, participacion: sumaVendido ? c.ventas / sumaVendido : 0 };
    }).sort((a, b) => b.ventas - a.ventas);

    const listaLocales = [...porLocal.entries()].map(([local, vs]) => {
        const t = totalesDe(vs);
        return { local: nombreLocal(local), ...t, participacion: totales.ventas ? t.ventas / totales.ventas : 0 };
    }).sort((a, b) => b.ventas - a.ventas);

    const listaVendedoras = [...porVendedora.values()].map(v => {
        const t = totalesDe(v.ventas);
        return { nombre: v.nombre, cantidad: t.cantidad, ventas: t.ventas, ticket: t.ticket, descuentos: t.descuentos, reembolsadas: v.reembolsadas, montoReembolsado: roundMoney(v.montoReembolsado) };
    }).sort((a, b) => b.ventas - a.ventas);

    const resumenDeItems = venta => {
        const items = itemsDe(venta);
        return items.length ? items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ') : 'Sin detalle';
    };
    const metodoTexto = m => (m === 'Ambos' ? 'Efectivo + Yape' : m === 'Yape' ? 'Yape / Plin' : m || 'Efectivo');

    const detalle = [...ventas].sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || String(a.id).localeCompare(String(b.id))).map(venta => {
        const total = Number(venta.total) || 0;
        const costo = Number(venta.costo_total) || 0;
        return {
            id: venta.id, fecha: new Date(venta.fecha), local: nombreLocal(venta.local),
            vendedora: nombreCorto(venta.creado_por_email) || '—', metodo: metodoTexto(venta.metodo_pago),
            productos: resumenDeItems(venta),
            subtotal: roundMoney(venta.subtotal == null ? total + (Number(venta.descuento) || 0) : Number(venta.subtotal) || 0),
            descuento: roundMoney(Number(venta.descuento) || 0), total: roundMoney(total), costo: roundMoney(costo),
            margen: roundMoney(total - costo), reembolsada: venta.estado === 'reembolsada',
            estado: venta.estado === 'reembolsada' ? 'Reembolsada' : 'Completada'
        };
    });

    const listaReembolsos = reembolsadas.map(venta => ({
        id: venta.id, fecha: new Date(venta.fecha), local: nombreLocal(venta.local),
        vendedora: nombreCorto(venta.creado_por_email) || '—', productos: resumenDeItems(venta),
        total: roundMoney(Number(venta.total) || 0),
        reembolsadoPor: nombreCorto(venta.reembolsado_por_email) || '—',
        reembolsadoEn: venta.reembolsado_en ? new Date(venta.reembolsado_en) : null,
        motivo: venta.motivo_reembolso || 'Sin motivo registrado'
    })).sort((a, b) => a.fecha - b.fecha);

    // Pérdidas y alertas
    const bajoCosto = listaProductos.filter(p => p.bajoCosto).map(p => ({ producto: p.producto, unidades: p.unidades, ventas: p.ventas, costo: p.costo, perdida: roundMoney(-p.margen) }));
    const sinCosto = listaProductos.filter(p => p.sinCosto).map(p => ({ producto: p.producto, unidades: p.unidades, ventas: p.ventas }));
    const vencidos = [];
    const porVencer = [];
    const stockBajo = [];
    const inventario = [];
    for (const p of productos) {
        const costoUnit = Number(p.precio_compra) || 0;
        const venta = Number(p.precio_venta) || 0;
        const lotes = Array.isArray(p.lotes) ? p.lotes : [];
        let proximo = null;
        for (const lote of lotes) {
            const vence = parseLocalDate(lote?.vencimiento);
            if (!vence) continue;
            if (!proximo || vence < proximo) proximo = vence;
            const estado = estadoVencimiento(lote.vencimiento, ahora);
            if (estado !== 'vencido' && estado !== 'por-vencer') continue;
            const cantidad = Number(lote.qty) || 0;
            const fila = { producto: limpiar(p.nombre), local: nombreLocal(p.local), cantidad, vence, costoUnit, valor: roundMoney(cantidad * costoUnit) };
            (estado === 'vencido' ? vencidos : porVencer).push(fila);
        }
        const stock = p.stock == null ? null : Number(p.stock);
        const alerta = p.alerta_stock == null ? null : Number(p.alerta_stock);
        let estado = 'No controla stock';
        if (stock !== null) {
            estado = stock <= 0 ? 'Sin stock' : alerta !== null && stock <= alerta ? 'Stock bajo' : 'Normal';
            if (estado !== 'Normal') stockBajo.push({ producto: limpiar(p.nombre), local: nombreLocal(p.local), stock, alerta, estado });
        }
        inventario.push({
            producto: limpiar(p.nombre), local: nombreLocal(p.local), categoria: p.categoria || 'Sin categoría',
            stock, alerta, precioCompra: costoUnit, precioVenta: venta,
            margenUnit: roundMoney(venta - costoUnit), margenPct: venta ? (venta - costoUnit) / venta : 0,
            valorCosto: stock !== null ? roundMoney(stock * costoUnit) : null,
            valorVenta: stock !== null ? roundMoney(stock * venta) : null,
            estado, proximo
        });
    }
    vencidos.sort((a, b) => a.vence - b.vence);
    porVencer.sort((a, b) => a.vence - b.vence);
    stockBajo.sort((a, b) => a.stock - b.stock);
    inventario.sort((a, b) => a.local.localeCompare(b.local) || a.producto.localeCompare(b.producto));
    const sumar = (lista, clave) => roundMoney(lista.reduce((s, x) => s + (Number(x[clave]) || 0), 0));
    const perdidas = {
        bajoCosto, totalBajoCosto: sumar(bajoCosto, 'perdida'),
        vencidos, totalVencidos: sumar(vencidos, 'valor'),
        porVencer, totalPorVencer: sumar(porVencer, 'valor'),
        sinCosto, stockBajo,
        descuentos: totales.descuentos, conDescuento: totales.conDescuento,
        reembolsos: totales.reembolsos, cantidadReembolsos: totales.cantidadReembolsos
    };
    perdidas.totalReales = roundMoney(perdidas.totalBajoCosto + perdidas.totalVencidos);

    // Comparación con el periodo anterior
    const variacion = (actual, anterior, pct) => {
        if (anterior == null) return null;
        if (pct) return (actual - anterior) * 100;
        return anterior ? actual / anterior - 1 : null;
    };
    const comparacion = [
        ['Ventas', 'ventas', 'moneda', true, 'Lo cobrado, ya restados los descuentos. No incluye ventas reembolsadas.'],
        ['Número de ventas', 'cantidad', 'entero', true, 'Tickets cobrados.'],
        ['Ticket promedio', 'ticket', 'moneda', true, 'Cuánto gasta en promedio cada cliente.'],
        ['Unidades vendidas', 'unidades', 'entero', true, 'Productos entregados (un combo cuenta como uno).'],
        ['Costo de la mercadería', 'costo', 'moneda', null, 'Lo que costó comprar lo que se vendió.'],
        ['Margen bruto', 'margen', 'moneda', true, 'Ventas menos el costo de la mercadería. No resta alquiler, sueldos ni otros gastos.'],
        ['Margen bruto (%)', 'margenPct', 'pct', true, 'De cada sol vendido, cuánto es ganancia bruta.'],
        ['Descuentos otorgados', 'descuentos', 'moneda', false, 'Dinero que se dejó de cobrar.'],
        ['Ventas reembolsadas', 'reembolsos', 'moneda', false, 'Dinero devuelto a clientes; el producto volvió al stock.'],
        ['Cobrado en efectivo', 'efectivo', 'moneda', null, 'Debe coincidir con el dinero contado en caja.'],
        ['Cobrado por Yape / Plin', 'yape', 'moneda', null, 'Debe coincidir con los movimientos del celular.']
    ].map(([indicador, clave, formato, mejorSiSube, ayuda]) => ({
        indicador, clave, formato, mejorSiSube, ayuda,
        actual: totales[clave],
        anterior: anteriores ? anteriores[clave] : null,
        variacion: variacion(totales[clave], anteriores ? anteriores[clave] : null, formato === 'pct')
    }));

    // Lo más destacado
    const destacados = [];
    const mejor = serie.reduce((a, b) => (b.ventas > (a?.ventas ?? 0) ? b : a), null);
    if (mejor) {
        destacados.push(rango.periodo === 'anio'
            ? `Mejor mes: ${mejor.etiqueta}, con ${formatMoney(mejor.ventas)} en ${mejor.cantidad} ventas.`
            : `Mejor día: ${mejor.etiqueta.toLowerCase()} ${fechaLarga(mejor.fecha)}, con ${formatMoney(mejor.ventas)} en ${mejor.cantidad} ventas.`);
    }
    const diaTop = porDiaSemana.reduce((a, b) => (b.promedio > (a?.promedio ?? 0) ? b : a), null);
    if (diaTop) destacados.push(`Día de la semana más fuerte: ${diaTop.dia.toLowerCase()}, con ${formatMoney(diaTop.promedio)} en promedio.`);
    const horaTop = porHora.reduce((a, b) => (b.cantidad > (a?.cantidad ?? 0) ? b : a), null);
    if (horaTop) destacados.push(`Hora con más clientes: de ${horaTop.etiqueta.replace(' – ', ' a ')} (${horaTop.cantidad} ventas).`);
    const topUnidades = [...listaProductos].sort((a, b) => b.unidades - a.unidades)[0];
    if (topUnidades) destacados.push(`Producto más vendido: ${topUnidades.producto} (${topUnidades.unidades} unidades).`);
    const topMargen = [...listaProductos].sort((a, b) => b.margen - a.margen)[0];
    if (topMargen && topMargen.margen > 0) destacados.push(`Producto que más ganancia dejó: ${topMargen.producto} (${formatMoney(topMargen.margen)} de margen).`);
    if (multi && listaLocales[0]) destacados.push(`Local con más ventas: ${listaLocales[0].local} (${pctTexto(listaLocales[0].participacion)} del total).`);
    if (perdidas.totalReales > 0) destacados.push(`Pérdidas reales: ${formatMoney(perdidas.totalReales)} (ver la hoja "Pérdidas y alertas").`);

    return {
        titulo: rango.titulo, tituloAnterior: rango.tituloAnterior, periodo: rango.periodo, archivo: rango.archivo,
        alcanceNombre: multi ? 'Todos los locales' : nombreLocal(locales[0]),
        alcanceArchivo: multi ? 'Todos' : (localPorId(locales[0])?.nombre || 'Local').replace(/\s+/g, '-'),
        multi, periodoTexto, generadoEn: ahora, generadoPor: nombreCorto(generadoPor) || generadoPor || 'Kalo',
        totales, anteriores, comparacion, serie, porDiaSemana, porHora,
        productos: listaProductos, categorias: listaCategorias, locales: listaLocales, vendedoras: listaVendedoras,
        metodos: [{ metodo: 'Efectivo', monto: totales.efectivo }, { metodo: 'Yape / Plin', monto: totales.yape }],
        detalle, reembolsos: listaReembolsos, perdidas, inventario, destacados
    };
}

export function nombreArchivoReporte(m) {
    return `Kalo_Reporte_${m.archivo}_${m.alcanceArchivo}.xlsx`;
}

// ---------------------------------------------------------------------------
// Libro de Excel (ExcelJS)
// ---------------------------------------------------------------------------
export const COLOR = {
    verde: 'FF233E3A', teal: 'FF06615B', tealClaro: 'FFD8E8E4', ambar: 'FFF2B65F', ambarClaro: 'FFFDF1DC',
    crema: 'FFF9F4E9', cebra: 'FFF4F7F3', gris: 'FF5B6B64', grisClaro: 'FF9AA59F', borde: 'FFC9D3C9',
    rojo: 'FFB42318', rojoClaro: 'FFFDECEC', verdeOk: 'FF087F66', verdeOkClaro: 'FFE6F4EF', blanco: 'FFFFFFFF', texto: 'FF182C29'
};
const FMT = {
    moneda: '"S/" #,##0.00;[Red]-"S/" #,##0.00',
    entero: '#,##0',
    pct: '0.0%',
    fecha: 'dd/mm/yyyy',
    hora: 'hh:mm',
    fechaHora: 'dd/mm/yyyy hh:mm',
    varBuena: '[Color10]▲ 0.0%;[Red]▼ 0.0%;0.0%',
    varMala: '[Red]▲ 0.0%;[Color10]▼ 0.0%;0.0%',
    varNeutra: '▲ 0.0%;▼ 0.0%;0.0%',
    ppBuena: '[Color10]▲ 0.0 "pp";[Red]▼ 0.0 "pp";0.0 "pp"'
};
const borde = { style: 'thin', color: { argb: COLOR.borde } };
const BORDES = { top: borde, left: borde, bottom: borde, right: borde };
const relleno = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const fuente = (extra = {}) => ({ name: 'Calibri', size: 11, color: { argb: COLOR.texto }, ...extra });

export function construirExcel(ExcelJS, m, graficos = {}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Kalo';
    wb.lastModifiedBy = m.generadoPor;
    wb.created = m.generadoEn;
    wb.modified = m.generadoEn;
    wb.title = `Kalo · Reporte ${m.titulo}`;
    wb.company = 'Kalo';
    const generado = `${m.generadoEn.toLocaleDateString('es-PE')} a las ${m.generadoEn.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
    const nombreSerie = m.periodo === 'anio' ? 'Por mes' : 'Por día';

    function hoja(nombre, { color, anchos, titulo, subtitulo, horizontal = true }) {
        const ws = wb.addWorksheet(nombre, {
            properties: { tabColor: { argb: color } },
            views: [{ showGridLines: false }],
            pageSetup: {
                paperSize: 9, orientation: horizontal ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 }
            },
            headerFooter: { oddFooter: `&L&8Kalo · ${m.titulo} · ${m.alcanceNombre}&R&8Página &P de &N` }
        });
        ws.columns = anchos.map(width => ({ width }));
        const n = anchos.length;
        ws.mergeCells(1, 1, 1, n);
        const t = ws.getCell(1, 1);
        t.value = titulo;
        t.font = fuente({ size: 16, bold: true, color: { argb: COLOR.blanco } });
        t.fill = relleno(COLOR.verde);
        t.alignment = { vertical: 'middle', indent: 1 };
        ws.getRow(1).height = 32;
        ws.mergeCells(2, 1, 2, n);
        const s = ws.getCell(2, 1);
        s.value = subtitulo || `${m.titulo} · ${m.alcanceNombre}`;
        s.font = fuente({ size: 11, color: { argb: COLOR.blanco } });
        s.fill = relleno(COLOR.teal);
        s.alignment = { vertical: 'middle', indent: 1 };
        ws.getRow(2).height = 20;
        return ws;
    }

    function nota(ws, fila, texto, columnas) {
        ws.mergeCells(fila, 1, fila, columnas);
        const c = ws.getCell(fila, 1);
        c.value = texto;
        c.font = fuente({ size: 9, italic: true, color: { argb: COLOR.gris } });
        c.alignment = { wrapText: true, vertical: 'top' };
        return fila + 1;
    }

    function seccion(ws, fila, texto, columnas) {
        ws.mergeCells(fila, 1, fila, columnas);
        const c = ws.getCell(fila, 1);
        c.value = texto;
        c.font = fuente({ size: 13, bold: true, color: { argb: COLOR.teal } });
        c.border = { bottom: { style: 'medium', color: { argb: COLOR.ambar } } };
        ws.getRow(fila).height = 22;
        return fila + 1;
    }

    // Tabla con encabezado, filas en cebra, totales y (opcional) filtro y encabezado fijo.
    function tabla(ws, fila, columnas, filas, { totales = null, filtro = true, congelar = true, vacio = 'Sin casos en este periodo.', barra = null } = {}) {
        const encabezado = ws.getRow(fila);
        columnas.forEach((col, i) => {
            const c = encabezado.getCell(i + 1);
            c.value = col.titulo;
            c.font = fuente({ size: 10, bold: true, color: { argb: COLOR.blanco } });
            c.fill = relleno(COLOR.teal);
            c.border = BORDES;
            c.alignment = { vertical: 'middle', horizontal: col.formato ? 'center' : 'left', wrapText: true };
        });
        encabezado.height = 30;
        if (!filas.length) {
            ws.mergeCells(fila + 1, 1, fila + 1, columnas.length);
            const c = ws.getCell(fila + 1, 1);
            c.value = vacio;
            c.font = fuente({ size: 10, italic: true, color: { argb: COLOR.gris } });
            c.border = BORDES;
            return fila + 3;
        }
        filas.forEach((obj, idx) => {
            const r = ws.getRow(fila + 1 + idx);
            const estiloFila = obj.__estilo || {};
            columnas.forEach((col, i) => {
                const c = r.getCell(i + 1);
                const valor = col.valor ? col.valor(obj) : obj[col.clave];
                c.value = valor === undefined ? null : valor;
                if (col.formato) c.numFmt = FMT[col.formato] || col.formato;
                c.border = BORDES;
                c.alignment = { vertical: 'top', horizontal: col.formato ? 'right' : 'left', wrapText: Boolean(col.ajustar) };
                c.font = fuente({ size: 10, ...(estiloFila.font || {}), ...(col.fuente ? col.fuente(obj) || {} : {}) });
                if (estiloFila.fill) c.fill = relleno(estiloFila.fill);
                else if (idx % 2 === 1) c.fill = relleno(COLOR.cebra);
            });
        });
        let ultima = fila + filas.length;
        if (totales) {
            const r = ws.getRow(ultima + 1);
            columnas.forEach((col, i) => {
                const c = r.getCell(i + 1);
                const valor = i === 0 && totales[col.clave] === undefined ? 'TOTAL' : totales[col.clave];
                c.value = valor === undefined ? null : valor;
                if (col.formato && typeof valor === 'number') c.numFmt = FMT[col.formato] || col.formato;
                c.font = fuente({ size: 10, bold: true });
                c.fill = relleno(COLOR.ambarClaro);
                c.border = { ...BORDES, top: { style: 'medium', color: { argb: COLOR.teal } } };
                c.alignment = { horizontal: col.formato ? 'right' : 'left' };
            });
            ultima++;
        }
        if (barra) {
            const columna = columnas.findIndex(col => col.clave === barra) + 1;
            const letra = ws.getColumn(columna).letter;
            ws.addConditionalFormatting({
                ref: `${letra}${fila + 1}:${letra}${fila + filas.length}`,
                rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: 'FF6FB7AE' }, gradient: false }]
            });
        }
        if (filtro) ws.autoFilter = { from: { row: fila, column: 1 }, to: { row: fila + filas.length, column: columnas.length } };
        if (congelar) ws.views = [{ state: 'frozen', ySplit: fila, showGridLines: false }];
        return ultima + 2;
    }

    // ----- Resumen -----
    const resumen = hoja('Resumen', {
        color: COLOR.verde, anchos: [27, 17, 26, 17, 26, 17], horizontal: false,
        titulo: 'KALO · Reporte de ventas', subtitulo: `${m.titulo} · ${m.alcanceNombre}`
    });
    resumen.mergeCells(3, 1, 3, 6);
    resumen.getCell(3, 1).value = `${m.periodoTexto}. Generado el ${generado} por ${m.generadoPor}.`;
    resumen.getCell(3, 1).font = fuente({ size: 9, italic: true, color: { argb: COLOR.gris } });

    const t = m.totales;
    const variacionTexto = (clave, mejorSiSube) => {
        if (!m.anteriores) return { texto: `Sin datos de ${m.tituloAnterior}`, color: COLOR.gris };
        const anterior = m.anteriores[clave];
        if (!anterior) return { texto: `Sin ventas en ${m.tituloAnterior}`, color: COLOR.gris };
        const v = t[clave] / anterior - 1;
        const flecha = v > 0 ? '▲' : v < 0 ? '▼' : '•';
        const bueno = mejorSiSube === null ? null : (v >= 0) === mejorSiSube;
        return { texto: `${flecha} ${pctTexto(Math.abs(v))} vs ${m.tituloAnterior}`, color: bueno === null ? COLOR.gris : bueno ? COLOR.verdeOk : COLOR.rojo };
    };
    const tarjetas = [
        { titulo: 'Ventas', valor: t.ventas, fmt: FMT.moneda, color: COLOR.teal, detalle: variacionTexto('ventas', true) },
        { titulo: 'Margen bruto', valor: t.margen, fmt: FMT.moneda, color: COLOR.verdeOk, detalle: { texto: `${pctTexto(t.margenPct)} de las ventas`, color: COLOR.gris } },
        { titulo: 'Número de ventas', valor: t.cantidad, fmt: FMT.entero, color: COLOR.texto, detalle: variacionTexto('cantidad', true) },
        { titulo: 'Ticket promedio', valor: t.ticket, fmt: FMT.moneda, color: COLOR.texto, detalle: variacionTexto('ticket', true) },
        { titulo: 'Descuentos otorgados', valor: t.descuentos, fmt: FMT.moneda, color: 'FF9A5908', detalle: { texto: `${t.conDescuento} ventas con descuento`, color: COLOR.gris } },
        { titulo: 'Pérdidas reales', valor: m.perdidas.totalReales, fmt: FMT.moneda, color: COLOR.rojo, detalle: { texto: 'Vendido bajo costo + mercadería vencida', color: COLOR.gris } }
    ];
    tarjetas.forEach((tarjeta, i) => {
        const fila = 5 + Math.floor(i / 3) * 4;
        const col = 1 + (i % 3) * 2;
        for (let r = fila; r <= fila + 2; r++) {
            resumen.mergeCells(r, col, r, col + 1);
            const c = resumen.getCell(r, col);
            c.fill = relleno(COLOR.crema);
            c.alignment = { indent: 1, vertical: 'middle' };
            c.border = {
                left: { style: 'thin', color: { argb: COLOR.borde } }, right: { style: 'thin', color: { argb: COLOR.borde } },
                top: r === fila ? { style: 'medium', color: { argb: tarjeta.color } } : undefined,
                bottom: r === fila + 2 ? { style: 'thin', color: { argb: COLOR.borde } } : undefined
            };
        }
        resumen.getCell(fila, col).value = tarjeta.titulo;
        resumen.getCell(fila, col).font = fuente({ size: 10, color: { argb: COLOR.gris } });
        resumen.getCell(fila + 1, col).value = tarjeta.valor;
        resumen.getCell(fila + 1, col).numFmt = tarjeta.fmt;
        resumen.getCell(fila + 1, col).font = fuente({ size: 20, bold: true, color: { argb: tarjeta.color } });
        resumen.getCell(fila + 2, col).value = tarjeta.detalle.texto;
        resumen.getCell(fila + 2, col).font = fuente({ size: 9, color: { argb: tarjeta.detalle.color } });
        resumen.getRow(fila + 1).height = 30;
    });

    let fila = seccion(resumen, 13, 'Lo más destacado', 6);
    for (const texto of m.destacados.length ? m.destacados : ['No hubo ventas en este periodo.']) {
        resumen.mergeCells(fila, 1, fila, 6);
        resumen.getCell(fila, 1).value = `•  ${texto}`;
        resumen.getCell(fila, 1).font = fuente({ size: 11 });
        fila++;
    }

    // Gráficos (imágenes)
    const imagenes = [
        ['serie', m.periodo === 'anio' ? 'Ventas y margen por mes' : 'Ventas y margen por día'],
        ['top', 'Top 10 productos'], ['pagos', 'Formas de pago'], ['horas', 'Ventas por hora'], ['locales', 'Ventas por local']
    ].filter(([clave]) => graficos[clave]);
    if (imagenes.length) {
        fila = seccion(resumen, fila + 1, 'Gráficos', 6);
        imagenes.forEach(([clave], i) => {
            const id = wb.addImage({ base64: graficos[clave], extension: 'png' });
            const filaImg = fila + Math.floor(i / 2) * 15;
            resumen.addImage(id, { tl: { col: (i % 2) * 3 + 0.1, row: filaImg - 1 + 0.2 }, ext: { width: 448, height: 252 } });
        });
        fila += Math.ceil(imagenes.length / 2) * 15;
    }

    // Comparación
    fila = seccion(resumen, fila + 1, `Comparación con ${m.tituloAnterior}`, 6);
    const encabezados = ['Indicador', m.titulo, m.tituloAnterior, 'Variación', '¿Qué significa?'];
    encabezados.forEach((texto, i) => {
        const c = resumen.getCell(fila, i + 1);
        c.value = texto;
        c.font = fuente({ size: 10, bold: true, color: { argb: COLOR.blanco } });
        c.fill = relleno(COLOR.teal);
        c.border = BORDES;
        c.alignment = { horizontal: i === 0 || i === 4 ? 'left' : 'center', vertical: 'middle', wrapText: true };
    });
    resumen.mergeCells(fila, 5, fila, 6);
    resumen.getRow(fila).height = 28;
    fila++;
    m.comparacion.forEach((r, idx) => {
        const fmt = r.formato === 'pct' ? FMT.pct : FMT[r.formato];
        const valores = [r.indicador, r.actual, r.anterior, r.variacion, r.ayuda];
        valores.forEach((valor, i) => {
            const c = resumen.getCell(fila, i + 1);
            c.value = valor === null || valor === undefined ? (i === 2 || i === 3 ? '—' : null) : valor;
            c.border = BORDES;
            c.font = fuente({ size: 10, bold: i === 0 });
            c.alignment = { vertical: 'middle', horizontal: i === 0 || i === 4 ? 'left' : 'right', wrapText: i === 4 };
            if (idx % 2 === 1) c.fill = relleno(COLOR.cebra);
            if ((i === 1 || i === 2) && typeof valor === 'number') c.numFmt = fmt;
            if (i === 3 && typeof valor === 'number') {
                c.numFmt = r.formato === 'pct' ? FMT.ppBuena : r.mejorSiSube === null ? FMT.varNeutra : r.mejorSiSube ? FMT.varBuena : FMT.varMala;
            }
        });
        resumen.mergeCells(fila, 5, fila, 6);
        resumen.getRow(fila).height = 30;
        fila++;
    });
    fila = nota(resumen, fila, '▲ / ▼: subida o bajada respecto al periodo anterior. Verde es bueno para el negocio, rojo es malo. "pp" = puntos porcentuales.', 6);

    // Pérdidas (resumen)
    const p = m.perdidas;
    fila = seccion(resumen, fila + 1, 'Pérdidas y alertas', 6);
    const lineasPerdidas = [
        ['Vendido por debajo de su costo', p.totalBajoCosto, `${p.bajoCosto.length} productos`, true],
        ['Mercadería vencida en stock (hoy, a precio de compra)', p.totalVencidos, `${p.vencidos.length} lotes`, true],
        ['Mercadería que vence en 30 días (hoy)', p.totalPorVencer, `${p.porVencer.length} lotes`, false],
        ['Descuentos otorgados', p.descuentos, `${p.conDescuento} ventas`, false],
        ['Ventas reembolsadas (dinero devuelto)', p.reembolsos, `${p.cantidadReembolsos} ventas`, false],
        ['Productos con stock bajo o agotado (hoy)', null, `${p.stockBajo.length} productos`, false]
    ];
    for (const [concepto, monto, casos, perdida] of lineasPerdidas) {
        resumen.mergeCells(fila, 1, fila, 3);
        const c = resumen.getCell(fila, 1);
        c.value = concepto;
        c.font = fuente({ size: 10, bold: perdida });
        const v = resumen.getCell(fila, 4);
        v.value = monto;
        v.numFmt = FMT.moneda;
        v.font = fuente({ size: 10, bold: true, color: { argb: perdida && monto > 0 ? COLOR.rojo : COLOR.texto } });
        resumen.getCell(fila, 5).value = casos;
        resumen.getCell(fila, 5).font = fuente({ size: 10, color: { argb: COLOR.gris } });
        for (let col = 1; col <= 6; col++) resumen.getCell(fila, col).border = { bottom: borde };
        fila++;
    }
    resumen.getCell(fila, 1).value = { text: 'Ver el detalle en la hoja "Pérdidas y alertas" →', hyperlink: "#'Pérdidas y alertas'!A1" };
    resumen.getCell(fila, 1).font = fuente({ size: 10, underline: true, color: { argb: 'FF0563C1' } });
    fila += 2;

    // Contenido
    fila = seccion(resumen, fila, 'Contenido del reporte', 6);
    const contenido = [
        [nombreSerie, m.periodo === 'anio' ? 'Ventas, costo y margen de cada mes del año.' : 'Ventas, costo y margen de cada día del mes, con efectivo y Yape.'],
        ['Productos', 'Todos los productos vendidos: unidades, ventas, costo, margen y alertas.'],
        ['Categorías', 'Ventas y margen agrupados por categoría.'],
        ...(m.multi ? [['Locales', 'Comparación entre los tres locales.']] : []),
        ['Vendedoras', 'Ventas, descuentos y reembolsos por cuenta que cobró.'],
        ['Pérdidas y alertas', 'Ventas bajo costo, mercadería vencida o por vencer, stock bajo.'],
        ['Ventas', 'Cada venta del periodo, una por fila (se puede filtrar).'],
        ['Reembolsos', 'Ventas reembolsadas: quién, cuándo y por qué.'],
        ['Inventario', 'Foto del inventario al momento de descargar, valorizado.']
    ];
    for (const [nombre, descripcion] of contenido) {
        const c = resumen.getCell(fila, 1);
        c.value = { text: nombre, hyperlink: `#'${nombre}'!A1` };
        c.font = fuente({ size: 10, underline: true, color: { argb: 'FF0563C1' } });
        resumen.mergeCells(fila, 2, fila, 6);
        resumen.getCell(fila, 2).value = descripcion;
        resumen.getCell(fila, 2).font = fuente({ size: 10, color: { argb: COLOR.gris } });
        fila++;
    }

    // Glosario
    fila = seccion(resumen, fila + 1, 'Cómo leer este reporte', 6);
    const glosario = [
        'Ventas: lo cobrado a los clientes, ya restados los descuentos. Las ventas reembolsadas no se cuentan.',
        'Margen bruto: ventas menos lo que costó comprar esa mercadería. Todavía faltaría restar alquiler, sueldos y otros gastos.',
        'Ticket promedio: lo que gasta en promedio cada cliente (ventas ÷ número de ventas).',
        'Pérdidas reales: productos vendidos por debajo de lo que costaron, más la mercadería vencida que sigue en stock.',
        'Los montos de productos y categorías son antes de los descuentos del ticket; por eso pueden sumar un poco más que las ventas.',
        'Inventario y vencimientos muestran el estado al momento de descargar, no el del periodo elegido.'
    ];
    for (const texto of glosario) {
        resumen.mergeCells(fila, 1, fila, 6);
        const c = resumen.getCell(fila, 1);
        c.value = `•  ${texto}`;
        c.font = fuente({ size: 10 });
        c.alignment = { wrapText: true, vertical: 'top' };
        resumen.getRow(fila).height = 28;
        fila++;
    }

    // ----- Por día / Por mes -----
    const serieHoja = hoja(nombreSerie, {
        color: COLOR.teal,
        anchos: m.periodo === 'anio' ? [14, 11, 14, 13, 13, 13, 10, 13, 13, 13] : [12, 11, 10, 14, 13, 13, 13, 10, 13, 13, 13],
        titulo: m.periodo === 'anio' ? 'Ventas por mes' : 'Ventas por día'
    });
    const mejorFila = m.serie.reduce((a, b) => (b.ventas > (a?.ventas ?? 0) ? b : a), null);
    const columnasSerie = [
        ...(m.periodo === 'anio'
            ? [{ titulo: 'Mes', clave: 'etiqueta' }]
            : [{ titulo: 'Fecha', valor: r => fechaExcel(r.fecha), formato: 'fecha' }, { titulo: 'Día', clave: 'etiqueta' }]),
        { titulo: 'N° de ventas', clave: 'cantidad', formato: 'entero' },
        { titulo: 'Ventas', clave: 'ventas', formato: 'moneda' },
        { titulo: 'Descuentos', clave: 'descuentos', formato: 'moneda' },
        { titulo: 'Costo', clave: 'costo', formato: 'moneda' },
        { titulo: 'Margen', clave: 'margen', formato: 'moneda' },
        { titulo: 'Margen %', clave: 'margenPct', formato: 'pct' },
        { titulo: 'Efectivo', clave: 'efectivo', formato: 'moneda' },
        { titulo: 'Yape / Plin', clave: 'yape', formato: 'moneda' },
        { titulo: 'Reembolsado', clave: 'reembolsos', formato: 'moneda' }
    ];
    const filasSerie = m.serie.map(r => ({
        ...r,
        __estilo: r === mejorFila && r.ventas > 0 ? { fill: COLOR.ambarClaro, font: { bold: true } } : r.cantidad === 0 ? { font: { color: { argb: COLOR.grisClaro } } } : {}
    }));
    let f = nota(serieHoja, 3, mejorFila && mejorFila.ventas > 0 ? `Resaltado: ${m.periodo === 'anio' ? 'el mejor mes' : 'el mejor día'} del periodo. En gris, los días sin ventas.` : 'No hubo ventas en este periodo.', columnasSerie.length);
    tabla(serieHoja, f + 1, columnasSerie, filasSerie, {
        barra: 'ventas',
        totales: {
            cantidad: t.cantidad, ventas: t.ventas, descuentos: t.descuentos, costo: t.costo, margen: t.margen,
            margenPct: t.margenPct, efectivo: t.efectivo, yape: t.yape, reembolsos: t.reembolsos
        }
    });

    // ----- Productos -----
    const prodHoja = hoja('Productos', { color: COLOR.verdeOk, anchos: [6, 40, 15, 11, 14, 13, 13, 10, 11, 32], titulo: 'Productos vendidos' });
    f = nota(prodHoja, 3, 'Ordenados por monto vendido. Montos antes de los descuentos del ticket. En rojo, productos vendidos por debajo de su costo.', 10);
    tabla(prodHoja, f + 1, [
        { titulo: '#', clave: 'posicion', formato: 'entero' },
        { titulo: 'Producto', clave: 'producto', ajustar: true },
        { titulo: 'Categoría', clave: 'categoria' },
        { titulo: 'Unidades', clave: 'unidades', formato: 'entero' },
        { titulo: 'Vendido', clave: 'ventas', formato: 'moneda' },
        { titulo: 'Costo', clave: 'costo', formato: 'moneda' },
        { titulo: 'Margen', clave: 'margen', formato: 'moneda', fuente: r => (r.margen < 0 ? { bold: true, color: { argb: COLOR.rojo } } : null) },
        { titulo: 'Margen %', clave: 'margenPct', formato: 'pct' },
        { titulo: '% de lo vendido', clave: 'participacion', formato: 'pct' },
        { titulo: 'Observación', clave: 'observacion', ajustar: true, fuente: r => (r.bajoCosto ? { bold: true, color: { argb: COLOR.rojo } } : r.observacion ? { color: { argb: 'FF9A5908' } } : null) }
    ], m.productos, {
        barra: 'ventas', vacio: 'No se vendieron productos en este periodo.',
        totales: m.productos.length ? {
            posicion: 'TOTAL', unidades: m.productos.reduce((s, x) => s + x.unidades, 0),
            ventas: roundMoney(m.productos.reduce((s, x) => s + x.ventas, 0)), costo: roundMoney(m.productos.reduce((s, x) => s + x.costo, 0)),
            margen: roundMoney(m.productos.reduce((s, x) => s + x.margen, 0)), participacion: 1
        } : null
    });

    // ----- Categorías -----
    const catHoja = hoja('Categorías', { color: COLOR.verdeOk, anchos: [24, 11, 11, 14, 13, 13, 10, 13], titulo: 'Ventas por categoría' });
    tabla(catHoja, 4, [
        { titulo: 'Categoría', clave: 'categoria' },
        { titulo: 'Productos', clave: 'productos', formato: 'entero' },
        { titulo: 'Unidades', clave: 'unidades', formato: 'entero' },
        { titulo: 'Vendido', clave: 'ventas', formato: 'moneda' },
        { titulo: 'Costo', clave: 'costo', formato: 'moneda' },
        { titulo: 'Margen', clave: 'margen', formato: 'moneda' },
        { titulo: 'Margen %', clave: 'margenPct', formato: 'pct' },
        { titulo: '% de lo vendido', clave: 'participacion', formato: 'pct' }
    ], m.categorias, { barra: 'ventas', vacio: 'No se vendieron productos en este periodo.' });

    // ----- Locales -----
    if (m.multi) {
        const locHoja = hoja('Locales', { color: COLOR.ambar, anchos: [20, 11, 14, 13, 13, 13, 13, 10, 12, 13, 12], titulo: 'Comparación entre locales' });
        tabla(locHoja, 4, [
            { titulo: 'Local', clave: 'local' },
            { titulo: 'N° de ventas', clave: 'cantidad', formato: 'entero' },
            { titulo: 'Ventas', clave: 'ventas', formato: 'moneda' },
            { titulo: 'Ticket promedio', clave: 'ticket', formato: 'moneda' },
            { titulo: 'Descuentos', clave: 'descuentos', formato: 'moneda' },
            { titulo: 'Costo', clave: 'costo', formato: 'moneda' },
            { titulo: 'Margen', clave: 'margen', formato: 'moneda' },
            { titulo: 'Margen %', clave: 'margenPct', formato: 'pct' },
            { titulo: 'Reembolsos (N°)', clave: 'cantidadReembolsos', formato: 'entero' },
            { titulo: 'Reembolsado', clave: 'reembolsos', formato: 'moneda' },
            { titulo: '% de las ventas', clave: 'participacion', formato: 'pct' }
        ], m.locales, {
            barra: 'ventas',
            totales: { cantidad: t.cantidad, ventas: t.ventas, ticket: t.ticket, descuentos: t.descuentos, costo: t.costo, margen: t.margen, margenPct: t.margenPct, cantidadReembolsos: t.cantidadReembolsos, reembolsos: t.reembolsos, participacion: 1 }
        });
    }

    // ----- Vendedoras -----
    const vendHoja = hoja('Vendedoras', { color: COLOR.ambar, anchos: [30, 11, 14, 13, 14, 13, 14], titulo: 'Ventas por vendedora' });
    f = nota(vendHoja, 3, 'Cada fila es la cuenta que cobró. Si una cuenta es compartida por todo un local, representa a ese local.', 7);
    tabla(vendHoja, f + 1, [
        { titulo: 'Vendedora (cuenta)', clave: 'nombre' },
        { titulo: 'N° de ventas', clave: 'cantidad', formato: 'entero' },
        { titulo: 'Ventas', clave: 'ventas', formato: 'moneda' },
        { titulo: 'Ticket promedio', clave: 'ticket', formato: 'moneda' },
        { titulo: 'Descuentos dados', clave: 'descuentos', formato: 'moneda' },
        { titulo: 'Ventas reembolsadas', clave: 'reembolsadas', formato: 'entero' },
        { titulo: 'Monto reembolsado', clave: 'montoReembolsado', formato: 'moneda' }
    ], m.vendedoras, { barra: 'ventas' });

    // ----- Pérdidas y alertas -----
    const perdHoja = hoja('Pérdidas y alertas', { color: COLOR.rojo, anchos: [42, 18, 12, 14, 14, 16], titulo: 'Pérdidas y alertas' });
    f = nota(perdHoja, 3, 'Las pérdidas reales son el dinero que se perdió. Lo "en riesgo" todavía se puede evitar vendiendo o devolviendo a tiempo. Inventario y vencimientos: estado al momento de descargar.', 6);
    f = seccion(perdHoja, f + 1, 'Resumen', 6);
    f = tabla(perdHoja, f, [
        { titulo: 'Concepto', clave: 'concepto', ajustar: true },
        { titulo: 'Tipo', clave: 'tipo' },
        { titulo: 'Casos', clave: 'casos', formato: 'entero' },
        { titulo: 'Monto', clave: 'monto', formato: 'moneda', fuente: r => (r.tipo === 'Pérdida real' && r.monto > 0 ? { bold: true, color: { argb: COLOR.rojo } } : null) }
    ], [
        { concepto: 'Productos vendidos por debajo de su costo', tipo: 'Pérdida real', casos: p.bajoCosto.length, monto: p.totalBajoCosto },
        { concepto: 'Mercadería vencida que sigue en stock (a precio de compra)', tipo: 'Pérdida real', casos: p.vencidos.length, monto: p.totalVencidos },
        { concepto: 'Mercadería que vence en los próximos 30 días (a precio de compra)', tipo: 'En riesgo', casos: p.porVencer.length, monto: p.totalPorVencer },
        { concepto: 'Descuentos otorgados', tipo: 'Se dejó de cobrar', casos: p.conDescuento, monto: p.descuentos },
        { concepto: 'Ventas reembolsadas', tipo: 'Dinero devuelto', casos: p.cantidadReembolsos, monto: p.reembolsos }
    ], { filtro: false, congelar: false });
    f = seccion(perdHoja, f, 'Productos vendidos por debajo de su costo', 6);
    f = tabla(perdHoja, f, [
        { titulo: 'Producto', clave: 'producto', ajustar: true },
        { titulo: 'Unidades', clave: 'unidades', formato: 'entero' },
        { titulo: 'Vendido', clave: 'ventas', formato: 'moneda' },
        { titulo: 'Costo', clave: 'costo', formato: 'moneda' },
        { titulo: 'Pérdida', clave: 'perdida', formato: 'moneda', fuente: () => ({ bold: true, color: { argb: COLOR.rojo } }) }
    ], p.bajoCosto, { filtro: false, congelar: false, vacio: 'Ningún producto se vendió por debajo de su costo.' });
    f = seccion(perdHoja, f, 'Mercadería vencida en stock', 6);
    const columnasLote = (etiquetaFecha, etiquetaValor) => [
        { titulo: 'Producto', clave: 'producto', ajustar: true },
        { titulo: 'Local', clave: 'local' },
        { titulo: 'Cantidad', clave: 'cantidad', formato: 'entero' },
        { titulo: etiquetaFecha, valor: r => fechaExcel(r.vence), formato: 'fecha' },
        { titulo: 'Costo unitario', clave: 'costoUnit', formato: 'moneda' },
        { titulo: etiquetaValor, clave: 'valor', formato: 'moneda' }
    ];
    f = tabla(perdHoja, f, columnasLote('Venció el', 'Pérdida estimada'), p.vencidos, { filtro: false, congelar: false, vacio: 'No hay mercadería vencida registrada.' });
    f = seccion(perdHoja, f, 'Mercadería que vence en los próximos 30 días', 6);
    f = tabla(perdHoja, f, columnasLote('Vence el', 'Valor en riesgo'), p.porVencer, { filtro: false, congelar: false, vacio: 'Nada vence en los próximos 30 días.' });
    f = seccion(perdHoja, f, 'Productos vendidos sin precio de compra (su margen no es real)', 6);
    f = tabla(perdHoja, f, [
        { titulo: 'Producto', clave: 'producto', ajustar: true },
        { titulo: 'Unidades', clave: 'unidades', formato: 'entero' },
        { titulo: 'Vendido', clave: 'ventas', formato: 'moneda' }
    ], p.sinCosto, { filtro: false, congelar: false, vacio: 'Todos los productos vendidos tienen precio de compra.' });
    f = seccion(perdHoja, f, 'Stock bajo y agotado (hoy)', 6);
    tabla(perdHoja, f, [
        { titulo: 'Producto', clave: 'producto', ajustar: true },
        { titulo: 'Local', clave: 'local' },
        { titulo: 'Stock', clave: 'stock', formato: 'entero' },
        { titulo: 'Alerta', clave: 'alerta', formato: 'entero' },
        { titulo: 'Estado', clave: 'estado', fuente: r => ({ bold: true, color: { argb: r.estado === 'Sin stock' ? COLOR.rojo : 'FF9A5908' } }) }
    ], p.stockBajo, { filtro: false, congelar: false, vacio: 'Ningún producto tiene stock bajo.' });

    // ----- Ventas (detalle) -----
    const columnasVentas = [
        { titulo: 'N° venta', clave: 'id', formato: 'entero' },
        { titulo: 'Fecha', valor: r => fechaExcel(r.fecha), formato: 'fecha' },
        { titulo: 'Hora', valor: r => fechaExcel(r.fecha), formato: 'hora' },
        ...(m.multi ? [{ titulo: 'Local', clave: 'local' }] : []),
        { titulo: 'Vendedora', clave: 'vendedora' },
        { titulo: 'Método', clave: 'metodo' },
        { titulo: 'Productos', clave: 'productos', ajustar: true },
        { titulo: 'Subtotal', clave: 'subtotal', formato: 'moneda' },
        { titulo: 'Descuento', clave: 'descuento', formato: 'moneda' },
        { titulo: 'Total', clave: 'total', formato: 'moneda' },
        { titulo: 'Costo', clave: 'costo', formato: 'moneda' },
        { titulo: 'Margen', clave: 'margen', formato: 'moneda' },
        { titulo: 'Estado', clave: 'estado', fuente: r => (r.reembolsada ? { bold: true, color: { argb: COLOR.rojo } } : { color: { argb: COLOR.verdeOk } }) }
    ];
    const ventasHoja = hoja('Ventas', {
        color: COLOR.gris, titulo: 'Detalle de ventas',
        anchos: [10, 11, 7, ...(m.multi ? [15] : []), 16, 15, 52, 12, 11, 12, 11, 11, 13]
    });
    f = nota(ventasHoja, 3, 'Usa las flechas del encabezado para filtrar (por ejemplo, por método o estado). Las ventas reembolsadas aparecen en gris y no suman en el total.', columnasVentas.length);
    const filasVentas = m.detalle.map(r => ({ ...r, id: Number.isFinite(Number(r.id)) ? Number(r.id) : r.id, __estilo: r.reembolsada ? { font: { color: { argb: COLOR.grisClaro }, italic: true } } : {} }));
    tabla(ventasHoja, f + 1, columnasVentas, filasVentas, {
        vacio: 'No hubo ventas en este periodo.',
        totales: m.detalle.length ? {
            id: 'TOTAL', productos: 'Sin contar las ventas reembolsadas', subtotal: t.subtotal, descuento: t.descuentos, total: t.ventas, costo: t.costo, margen: t.margen
        } : null
    });

    // ----- Reembolsos -----
    const reemHoja = hoja('Reembolsos', { color: COLOR.rojo, titulo: 'Ventas reembolsadas', anchos: [10, 16, ...(m.multi ? [15] : []), 15, 40, 12, 16, 16, 40] });
    tabla(reemHoja, 4, [
        { titulo: 'N° venta', valor: r => (Number.isFinite(Number(r.id)) ? Number(r.id) : r.id), formato: 'entero' },
        { titulo: 'Fecha de la venta', valor: r => fechaExcel(r.fecha), formato: 'fechaHora' },
        ...(m.multi ? [{ titulo: 'Local', clave: 'local' }] : []),
        { titulo: 'Vendedora', clave: 'vendedora' },
        { titulo: 'Productos', clave: 'productos', ajustar: true },
        { titulo: 'Monto', clave: 'total', formato: 'moneda' },
        { titulo: 'Reembolsado por', clave: 'reembolsadoPor' },
        { titulo: 'Fecha del reembolso', valor: r => (r.reembolsadoEn ? fechaExcel(r.reembolsadoEn) : '—'), formato: 'fechaHora' },
        { titulo: 'Motivo', clave: 'motivo', ajustar: true }
    ], m.reembolsos, {
        vacio: 'No hubo reembolsos en este periodo.',
        totales: m.reembolsos.length ? { total: t.reembolsos } : null
    });

    // ----- Inventario -----
    const invHoja = hoja('Inventario', {
        color: COLOR.teal, titulo: 'Inventario actual',
        subtitulo: `Foto del inventario el ${generado} · ${m.alcanceNombre} (no depende del periodo elegido)`,
        anchos: [36, 15, 14, 9, 9, 12, 12, 12, 10, 14, 14, 15, 14]
    });
    const totalCosto = roundMoney(m.inventario.reduce((s, x) => s + (x.valorCosto || 0), 0));
    const totalVenta = roundMoney(m.inventario.reduce((s, x) => s + (x.valorVenta || 0), 0));
    f = nota(invHoja, 3, `Valor del stock a precio de compra: ${formatMoney(totalCosto)}. Si todo se vendiera a precio de venta: ${formatMoney(totalVenta)}.`, 13);
    tabla(invHoja, f + 1, [
        { titulo: 'Producto', clave: 'producto', ajustar: true },
        { titulo: 'Local', clave: 'local' },
        { titulo: 'Categoría', clave: 'categoria' },
        { titulo: 'Stock', clave: 'stock', formato: 'entero' },
        { titulo: 'Alerta', clave: 'alerta', formato: 'entero' },
        { titulo: 'Precio compra', clave: 'precioCompra', formato: 'moneda' },
        { titulo: 'Precio venta', clave: 'precioVenta', formato: 'moneda' },
        { titulo: 'Margen unitario', clave: 'margenUnit', formato: 'moneda', fuente: r => (r.margenUnit < 0 ? { bold: true, color: { argb: COLOR.rojo } } : null) },
        { titulo: 'Margen %', clave: 'margenPct', formato: 'pct' },
        { titulo: 'Valor a costo', clave: 'valorCosto', formato: 'moneda' },
        { titulo: 'Valor a precio de venta', clave: 'valorVenta', formato: 'moneda' },
        { titulo: 'Estado', clave: 'estado', fuente: r => ({ bold: r.estado !== 'Normal', color: { argb: r.estado === 'Sin stock' ? COLOR.rojo : r.estado === 'Stock bajo' ? 'FF9A5908' : r.estado === 'Normal' ? COLOR.verdeOk : COLOR.gris } }) },
        { titulo: 'Próximo vencimiento', valor: r => (r.proximo ? fechaExcel(r.proximo) : null), formato: 'fecha' }
    ], m.inventario, {
        vacio: 'No hay productos registrados.',
        totales: m.inventario.length ? { producto: 'TOTAL', valorCosto: totalCosto, valorVenta: totalVenta } : null
    });

    return wb;
}

// ---------------------------------------------------------------------------
// Gráficos (Chart.js dibujado en un lienzo oculto → imagen PNG)
// ---------------------------------------------------------------------------
export function graficosReporte(Chart, m, crearCanvas) {
    const salida = {};
    const fondo = {
        id: 'fondoBlanco',
        beforeDraw(chart) {
            const { ctx, width, height } = chart;
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    };
    const fuenteGrafico = size => ({ family: 'Inter, Calibri, Arial, sans-serif', size });
    const moneda = value => `S/ ${Number(value).toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
    const ejes = (formatoY = moneda) => ({
        x: { grid: { display: false }, ticks: { color: '#455b52', font: fuenteGrafico(17) } },
        y: { beginAtZero: true, grid: { color: '#e1e8eb' }, ticks: { color: '#455b52', font: fuenteGrafico(17), callback: formatoY } }
    });
    const dibujar = (clave, titulo, config) => {
        const canvas = crearCanvas(940, 528);
        const chart = new Chart(canvas.getContext('2d'), {
            ...config,
            plugins: [fondo],
            options: {
                ...config.options,
                responsive: false, animation: false, devicePixelRatio: 1,
                plugins: {
                    ...(config.options?.plugins || {}),
                    title: { display: true, text: titulo, color: '#182c29', font: { ...fuenteGrafico(26), weight: 'bold' }, padding: { bottom: 14 } },
                    legend: { labels: { font: fuenteGrafico(17), color: '#344b57' }, ...(config.options?.plugins?.legend || {}) },
                    tooltip: { enabled: false }
                }
            }
        });
        salida[clave] = canvas.toDataURL('image/png');
        chart.destroy();
    };

    if (m.serie.some(r => r.ventas > 0)) {
        dibujar('serie', m.periodo === 'anio' ? 'Ventas y margen por mes' : 'Ventas y margen por día', {
            type: 'bar',
            data: {
                labels: m.serie.map(r => r.corta),
                datasets: [
                    { type: 'bar', label: 'Ventas', data: m.serie.map(r => (r.futuro ? null : r.ventas)), backgroundColor: '#06615b', borderRadius: 4, order: 2 },
                    { type: 'line', label: 'Margen', data: m.serie.map(r => (r.futuro ? null : r.margen)), borderColor: '#e0962e', backgroundColor: '#f2b65f', borderWidth: 4, pointRadius: 5, tension: 0.3, order: 1 }
                ]
            },
            options: { scales: ejes() }
        });
    }
    const top = m.productos.slice(0, 10);
    if (top.length) {
        dibujar('top', 'Top 10 productos (monto vendido)', {
            type: 'bar',
            data: {
                labels: top.map(p => (p.producto.length > 26 ? `${p.producto.slice(0, 25)}…` : p.producto)),
                datasets: [{ label: 'Vendido', data: top.map(p => p.ventas), backgroundColor: top.map((_, i) => (i < 3 ? '#f2b65f' : '#06615b')), borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, grid: { color: '#e1e8eb' }, ticks: { color: '#455b52', font: fuenteGrafico(16), callback: moneda } },
                    y: { grid: { display: false }, ticks: { color: '#182c29', font: fuenteGrafico(16) } }
                }
            }
        });
    }
    if (m.totales.efectivo + m.totales.yape > 0) {
        dibujar('pagos', 'Formas de pago', {
            type: 'doughnut',
            data: {
                labels: m.metodos.map(x => `${x.metodo}: S/ ${x.monto.toFixed(2)}`),
                datasets: [{ data: m.metodos.map(x => x.monto), backgroundColor: ['#06615b', '#7b4bb7'], borderColor: '#ffffff', borderWidth: 3 }]
            },
            options: { cutout: '55%', plugins: { legend: { position: 'right', labels: { font: fuenteGrafico(20) } } } }
        });
    }
    if (m.porHora.length) {
        const desde = m.porHora[0].hora;
        const hasta = m.porHora.at(-1).hora;
        const horas = [];
        for (let h = desde; h <= hasta; h++) horas.push(m.porHora.find(x => x.hora === h) || { hora: h, cantidad: 0 });
        dibujar('horas', 'Ventas por hora del día', {
            type: 'bar',
            data: {
                labels: horas.map(h => `${h.hora}h`),
                datasets: [{ label: 'Número de ventas', data: horas.map(h => h.cantidad), backgroundColor: '#087f66', borderRadius: 4 }]
            },
            options: { plugins: { legend: { display: false } }, scales: ejes(value => value) }
        });
    }
    if (m.multi && m.locales.length) {
        dibujar('locales', 'Ventas por local', {
            type: 'bar',
            data: {
                labels: m.locales.map(l => l.local),
                datasets: [
                    { label: 'Ventas', data: m.locales.map(l => l.ventas), backgroundColor: '#06615b', borderRadius: 4 },
                    { label: 'Margen', data: m.locales.map(l => l.margen), backgroundColor: '#f2b65f', borderRadius: 4 }
                ]
            },
            options: { scales: ejes() }
        });
    }
    return salida;
}
