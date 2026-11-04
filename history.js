import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { customAlert, customConfirm, customPrompt, showToast } from "./ui.js";
import { escapeHtml, formatMoney, describeError, fetchAll, resumirVentas, puedeReembolsar, resumenProductos, nombreCorto, dayRange, toDateInputValue, REEMBOLSO_CAJERO_MINUTOS } from "./utils.js";

const LIMITE_HISTORIAL = 100;
const COLUMNAS_HISTORIAL = 'id, fecha, local, total, descuento, metodo_pago, estado, detalles, creado_por_email, reembolsado_por_email, reembolsado_en, motivo_reembolso';

export function setupHistory({ onStockChanged } = {}) {
    const ventasList = document.getElementById('ventasList');
    const cierreFecha = document.getElementById('cierreFecha');
    const cierreFechaWrap = document.getElementById('cierreFechaWrap');
    const cierreResumen = document.getElementById('cierreResumen');
    const historySubtitle = document.getElementById('historySubtitle');
    const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
    let ventasCargadas = [];
    let refundInProgress = false;

    if (cierreFecha) {
        cierreFecha.value = toDateInputValue();
        cierreFecha.addEventListener('change', () => loadCierre());
    }

    // Las vendedoras solo ven lo del día: su cierre de caja y las ventas de hoy.
    // (La base de datos tampoco les entrega ventas de otros días.) El admin ve todo.
    const soloHoy = () => !state.perfil?.esAdmin;

    function aplicarModo() {
        const hoy = soloHoy();
        cierreFechaWrap?.classList.toggle('hidden', hoy);
        if (hoy && cierreFecha) cierreFecha.value = toDateInputValue();
        if (historySubtitle) {
            historySubtitle.textContent = hoy
                ? 'Cierre de caja y ventas de hoy'
                : `Cierre de caja y últimas ${LIMITE_HISTORIAL} ventas del local`;
        }
    }

    // --- CIERRE DE CAJA ---
    async function loadCierre() {
        if (!cierreResumen || !state.currentLocal) return;
        const dia = soloHoy() ? toDateInputValue() : (cierreFecha?.value || toDateInputValue());
        const range = dayRange(dia);
        if (!range) return;
        cierreResumen.innerHTML = '<p class="muted">Calculando…</p>';
        try {
            const ventas = await fetchAll(() => supabase.from('ventas')
                .select('id, total, descuento, efectivo, yape, metodo_pago, estado')
                .eq('local', state.currentLocal)
                .gte('fecha', range.start.toISOString())
                .lt('fecha', range.end.toISOString())
                .order('fecha').order('id'));
            const r = resumirVentas(ventas);
            const card = (titulo, valor, detalle = '') => `
                <div class="cash-card">
                    <span class="cash-card-title">${escapeHtml(titulo)}</span>
                    <strong class="cash-card-value">${escapeHtml(valor)}</strong>
                    ${detalle ? `<span class="cash-card-detail">${escapeHtml(detalle)}</span>` : ''}
                </div>`;
            cierreResumen.innerHTML = [
                card('Ventas', String(r.cantidad), `${formatMoney(r.ventas)} cobrados`),
                card('Efectivo en caja', formatMoney(r.efectivo), 'Debe coincidir con el conteo'),
                card('Yape / Plin', formatMoney(r.yape)),
                card('Descuentos', formatMoney(r.descuentos)),
                card('Reembolsos', String(r.cantidadReembolsos), formatMoney(r.reembolsos))
            ].join('');
        } catch (error) {
            cierreResumen.innerHTML = `<p class="table-message is-error">No se pudo calcular el cierre: ${escapeHtml(describeError(error))}</p>`;
        }
    }

    // --- HISTORIAL ---
    function estadoHtml(venta) {
        if (venta.estado !== 'reembolsada') return '<span class="status-pill is-ok">Completada</span>';
        const detalle = [];
        if (venta.reembolsado_por_email) detalle.push(`por ${nombreCorto(venta.reembolsado_por_email)}`);
        if (venta.reembolsado_en) detalle.push(new Date(venta.reembolsado_en).toLocaleString('es-PE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }));
        const titulo = venta.motivo_reembolso ? `Motivo: ${venta.motivo_reembolso}` : '';
        return `<span class="status-pill is-refunded" title="${escapeHtml(titulo)}">Reembolsada</span>`
            + (detalle.length ? `<span class="refund-by">${escapeHtml(detalle.join(' · '))}</span>` : '');
    }

    async function loadHistory() {
        if (!ventasList || !state.currentLocal) return;
        ventasList.innerHTML = '<tr><td colspan="8" class="table-message">Cargando...</td></tr>';
        aplicarModo();
        loadCierre();
        try {
            let query = supabase.from('ventas').select(COLUMNAS_HISTORIAL).eq('local', state.currentLocal);
            if (soloHoy()) query = query.gte('fecha', dayRange(toDateInputValue()).start.toISOString());
            const { data, error } = await query
                .order('fecha', { ascending: false }).order('id', { ascending: false })
                .limit(LIMITE_HISTORIAL);
            if (error) throw error;
            ventasCargadas = data || [];
            ventasList.innerHTML = '';
            if (ventasCargadas.length === 0) {
                const vacio = soloHoy() ? 'Todavía no hay ventas hoy.' : 'No hay ventas registradas.';
                ventasList.innerHTML = `<tr><td colspan="8" class="table-message">${vacio}</td></tr>`;
                return;
            }
            const now = Date.now();
            for (const venta of ventasCargadas) {
                const fecha = new Date(venta.fecha);
                const productos = resumenProductos(venta.detalles);
                const reembolsada = venta.estado === 'reembolsada';
                const tachado = reembolsada ? ' is-struck' : '';
                const accion = puedeReembolsar(venta, state.perfil, now)
                    ? `<button type="button" class="secondary-btn btn-refund" data-id="${escapeHtml(venta.id)}">Reembolsar</button>`
                    : '<span class="muted">—</span>';
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="date-cell">${escapeHtml(fecha.toLocaleDateString('es-PE'))}<small>${escapeHtml(fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }))}</small></td>
                    <td class="nowrap">${escapeHtml(venta.metodo_pago || 'Efectivo')}</td>
                    <td><div class="products-cell" title="${escapeHtml(productos)}">${escapeHtml(productos)}</div></td>
                    <td class="money-cell${tachado}"><strong>${escapeHtml(formatMoney(venta.total))}</strong></td>
                    <td class="money-cell discount-cell${tachado}">${escapeHtml(formatMoney(venta.descuento))}</td>
                    <td>${escapeHtml(nombreCorto(venta.creado_por_email) || '—')}</td>
                    <td>${estadoHtml(venta)}</td>
                    <td>${accion}</td>
                `;
                ventasList.appendChild(row);
            }
        } catch (error) {
            console.error(error);
            ventasList.innerHTML = `<tr><td colspan="8" class="table-message is-error">No se pudo cargar el historial: ${escapeHtml(describeError(error))}</td></tr>`;
        }
    }

    refreshHistoryBtn?.addEventListener('click', () => loadHistory());

    ventasList?.addEventListener('click', async event => {
        const button = event.target.closest?.('.btn-refund');
        if (!button) return;
        const venta = ventasCargadas.find(v => String(v.id) === button.getAttribute('data-id'));
        if (venta) await refundSale(venta);
    });

    async function refundSale(venta) {
        if (refundInProgress) return;
        refundInProgress = true;
        try {
            if (!puedeReembolsar(venta, state.perfil)) {
                await customAlert(`Solo un administrador puede reembolsar ventas con más de ${REEMBOLSO_CAJERO_MINUTOS} minutos.`, 'Reembolso no permitido', '🔒');
                return;
            }
            const ok = await customConfirm(
                `Se devolverá ${formatMoney(venta.total)} y el stock de los productos volverá al inventario.`,
                '¿Reembolsar esta venta?', '↩️');
            if (!ok) return;
            const motivo = await customPrompt('Escribe el motivo (queda registrado junto con tu usuario).', 'Motivo del reembolso', '✍️', 'Ej. Cobro duplicado');
            if (motivo === null) return;
            if (motivo.trim().length < 3) {
                await customAlert('Escribe un motivo de al menos 3 letras.', 'Falta el motivo', '⚠️');
                return;
            }
            const { error } = await supabase.rpc('reembolsar_venta', { p_venta_id: venta.id, p_motivo: motivo.trim() });
            if (error) throw error;
            showToast('Venta reembolsada. El stock volvió al inventario.', 'success');
            try {
                if (typeof onStockChanged === 'function') await onStockChanged();
            } catch {
                showToast('El reembolso se registró, pero no se pudo actualizar el inventario en pantalla.', 'warning', 6000);
            }
            await loadHistory();
        } catch (error) {
            await customAlert('No se pudo completar el reembolso: ' + describeError(error), 'Error', '⚠️');
        } finally {
            refundInProgress = false;
        }
    }

    return { loadHistory, loadCierre, refundSale };
}
