import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { customAlert } from "./ui.js";
import { localPorId } from "./constants.js";
import { escapeHtml, formatMoney, describeError, fetchAll, resumirVentas, ventasPorDia, monthRange, toMonthInputValue, toDateInputValue, resumenProductos, nombreCorto, roundMoney } from "./utils.js";

const NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TOP_PRODUCTOS = 15;

// Las librerías pesadas se cargan solo al abrir Estadísticas o al exportar.
const cargarChart = () => import('chart.js/auto');
const cargarXLSX = () => import('xlsx');

export function setupStats({ loadChart = cargarChart, loadXLSX = cargarXLSX } = {}) {
    const statsMonthInput = document.getElementById('statsMonth');
    const exportStatsBtn = document.getElementById('exportStatsBtn');
    const topProductsList = document.getElementById('topProductsList');
    let chart = null;
    let requestId = 0;
    let exporting = false;

    if (statsMonthInput) {
        statsMonthInput.value = toMonthInputValue();
        statsMonthInput.addEventListener('change', () => calcularEstadisticas());
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function mostrarResumen(r) {
        setText('statVentas', formatMoney(r.ventas));
        setText('statMargen', formatMoney(r.margen));
        setText('statDescuentos', formatMoney(r.descuentos));
        setText('statReembolsos', formatMoney(r.reembolsos));
        setText('statReembolsosDetalle', `${r.cantidadReembolsos} ${r.cantidadReembolsos === 1 ? 'venta' : 'ventas'}`);
        setText('statVentasDetalle', `${r.cantidad} ${r.cantidad === 1 ? 'venta' : 'ventas'}`);
    }

    async function calcularEstadisticas() {
        const local = state.currentLocal;
        const range = monthRange(statsMonthInput?.value || toMonthInputValue());
        if (!local || !range) return;
        const current = ++requestId;
        try {
            const ventas = await fetchAll(() => supabase.from('ventas')
                .select('id, fecha, total, descuento, costo_total, estado')
                .eq('local', local)
                .gte('fecha', range.start.toISOString())
                .lt('fecha', range.end.toISOString())
                .order('fecha').order('id'));
            if (current !== requestId) return;
            mostrarResumen(resumirVentas(ventas));
            await renderChart(ventasPorDia(ventas), range);
        } catch (error) {
            console.error('Error al obtener estadísticas:', error);
            if (current !== requestId) return;
            mostrarResumen(resumirVentas([]));
            await customAlert('No se pudieron cargar las estadísticas: ' + describeError(error), 'Error', '⚠️');
        }
        await loadTopProducts(local, range, current);
    }

    async function renderChart(porDia, range) {
        const canvas = document.getElementById('salesChart');
        if (!canvas) return;
        let Chart;
        try {
            ({ default: Chart } = await loadChart());
        } catch (error) {
            console.warn('No se pudo cargar el gráfico:', error);
            return;
        }
        const labels = [];
        const series = { ventas: [], margen: [], descuentos: [] };
        for (let day = new Date(range.start); day < range.end; day.setDate(day.getDate() + 1)) {
            const dia = porDia.get(toDateInputValue(day));
            labels.push(`${day.getDate()}/${day.getMonth() + 1}`);
            series.ventas.push(roundMoney(dia?.ventas || 0));
            series.margen.push(roundMoney(dia?.margen || 0));
            series.descuentos.push(roundMoney(dia?.descuentos || 0));
        }
        const dataset = (label, data, color, fill = false) => ({
            label, data, borderColor: color, backgroundColor: `${color}1a`, borderWidth: 2, tension: 0.3, fill,
            pointBackgroundColor: color, pointBorderColor: '#fff', pointRadius: 4, pointHoverRadius: 6
        });
        chart?.destroy();
        chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    dataset('Ventas (S/)', series.ventas, '#b56a21'),
                    dataset('Margen (S/)', series.margen, '#087f87', true),
                    dataset('Descuentos (S/)', series.descuentos, '#c1473c')
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#e1e8eb' }, ticks: { color: '#647782', callback: value => 'S/ ' + value } },
                    x: { grid: { display: false }, ticks: { color: '#647782' } }
                },
                plugins: {
                    legend: { labels: { color: '#344b57' } },
                    tooltip: {
                        backgroundColor: '#172c36', titleColor: '#fff', bodyColor: '#fff', borderColor: '#344b57', borderWidth: 1,
                        callbacks: { label: context => `${context.dataset.label}: ${formatMoney(context.parsed.y)}` }
                    }
                }
            }
        });
    }

    async function loadTopProducts(local, range, current) {
        if (!topProductsList) return;
        topProductsList.innerHTML = '<tr><td colspan="4" class="table-message">Cargando…</td></tr>';
        const { data, error } = await supabase.rpc('resumen_productos', {
            p_local: local, p_desde: range.start.toISOString(), p_hasta: range.end.toISOString()
        });
        if (current !== requestId) return;
        if (error) {
            topProductsList.innerHTML = `<tr><td colspan="4" class="table-message is-error">${escapeHtml(describeError(error))}</td></tr>`;
            return;
        }
        const rows = (data || []).slice(0, TOP_PRODUCTOS);
        if (rows.length === 0) {
            topProductsList.innerHTML = '<tr><td colspan="4" class="table-message">Sin ventas en este mes.</td></tr>';
            return;
        }
        topProductsList.innerHTML = rows.map(row => `
            <tr>
                <td>${escapeHtml(row.producto)}</td>
                <td class="money-cell">${escapeHtml(row.unidades)}</td>
                <td class="money-cell">${escapeHtml(formatMoney(row.total_vendido))}</td>
                <td class="money-cell">${escapeHtml(formatMoney(Number(row.total_vendido) - Number(row.costo_total)))}</td>
            </tr>`).join('');
    }

    function reset() {
        requestId++;
        chart?.destroy();
        chart = null;
        mostrarResumen(resumirVentas([]));
        if (topProductsList) topProductsList.innerHTML = '';
    }

    // --- EXCEL ---
    function filaVenta(venta) {
        const fecha = new Date(venta.fecha);
        return [
            fecha.toLocaleDateString('es-PE'),
            fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
            venta.metodo_pago || 'Efectivo',
            resumenProductos(venta.detalles),
            roundMoney(Number(venta.subtotal) || 0),
            roundMoney(Number(venta.descuento) || 0),
            roundMoney(Number(venta.total) || 0),
            roundMoney((Number(venta.total) || 0) - (Number(venta.costo_total) || 0)),
            nombreCorto(venta.creado_por_email)
        ];
    }

    function construirLibro(XLSX, ventas, localNombre) {
        const porMes = new Map();
        for (const venta of ventas) {
            const fecha = new Date(venta.fecha);
            if (Number.isNaN(fecha.getTime())) continue;
            const key = toMonthInputValue(fecha);
            if (!porMes.has(key)) porMes.set(key, { nombre: `${NOMBRES_MESES[fecha.getMonth()]} ${fecha.getFullYear()}`, ventas: [] });
            porMes.get(key).ventas.push(venta);
        }
        const meses = [...porMes.keys()].sort();
        const wb = XLSX.utils.book_new();

        const resumen = [
            [`CONSOLIDADO HISTÓRICO DE VENTAS - KALO (${localNombre.toUpperCase()})`],
            [],
            ['Mes', 'N° Ventas', 'Ventas (S/)', 'Descuentos (S/)', 'Margen (S/)', 'Reembolsos (N°)', 'Reembolsos (S/)']
        ];
        const total = resumirVentas(ventas);
        for (const key of meses) {
            const mes = porMes.get(key);
            const r = resumirVentas(mes.ventas);
            resumen.push([mes.nombre, r.cantidad, r.ventas, r.descuentos, r.margen, r.cantidadReembolsos, r.reembolsos]);
        }
        resumen.push([]);
        resumen.push(['TOTAL HISTÓRICO', total.cantidad, total.ventas, total.descuentos, total.margen, total.cantidadReembolsos, total.reembolsos]);
        resumen.push([]);
        resumen.push(['Margen = ventas cobradas − costo de la mercadería (no incluye alquiler, sueldos ni otros gastos).']);
        const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
        wsResumen['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen General');

        for (const key of meses) {
            const mes = porMes.get(key);
            const r = resumirVentas(mes.ventas);
            const filas = [
                [`REPORTE MENSUAL KALO - ${mes.nombre.toUpperCase()}`],
                [],
                ['RESUMEN DEL MES', ''],
                ['Ventas', r.ventas],
                ['Descuentos', r.descuentos],
                ['Margen (ventas − costo)', r.margen],
                ['Transacciones', r.cantidad],
                ['Reembolsos', `${r.cantidadReembolsos} (${formatMoney(r.reembolsos)}) — detalle en la hoja Reembolsos`],
                [],
                ['DETALLE DE VENTAS'],
                ['Fecha', 'Hora', 'Método', 'Productos', 'Subtotal (S/)', 'Descuento (S/)', 'Total pagado (S/)', 'Margen (S/)', 'Atendió']
            ];
            for (const venta of mes.ventas) {
                if (venta.estado !== 'reembolsada') filas.push(filaVenta(venta));
            }
            const ws = XLSX.utils.aoa_to_sheet(filas);
            ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 45 }, { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 13 }, { wch: 16 }];
            XLSX.utils.book_append_sheet(wb, ws, mes.nombre.slice(0, 31));
        }

        const reembolsadas = ventas.filter(v => v.estado === 'reembolsada');
        const filasReembolsos = [
            ['REEMBOLSOS'],
            [],
            ['Fecha venta', 'Hora', 'Método', 'Productos', 'Subtotal (S/)', 'Descuento (S/)', 'Total (S/)', 'Margen (S/)', 'Atendió', 'Reembolsado por', 'Fecha reembolso', 'Motivo']
        ];
        for (const venta of reembolsadas) {
            filasReembolsos.push([
                ...filaVenta(venta),
                nombreCorto(venta.reembolsado_por_email) || '—',
                venta.reembolsado_en ? new Date(venta.reembolsado_en).toLocaleString('es-PE') : '—',
                venta.motivo_reembolso || '—'
            ]);
        }
        if (reembolsadas.length === 0) filasReembolsos.push(['Sin reembolsos.']);
        const wsReembolsos = XLSX.utils.aoa_to_sheet(filasReembolsos);
        wsReembolsos['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 40 }, { wch: 13 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, wsReembolsos, 'Reembolsos');
        return wb;
    }

    async function exportarExcel() {
        if (exporting || !state.currentLocal) return;
        exporting = true;
        const label = exportStatsBtn?.textContent;
        if (exportStatsBtn) {
            exportStatsBtn.disabled = true;
            exportStatsBtn.textContent = 'Preparando…';
        }
        try {
            let XLSX;
            try {
                XLSX = await loadXLSX();
            } catch (error) {
                console.error('Error al cargar XLSX:', error);
                await customAlert('No se pudo preparar el Excel. Verifica tu conexión a internet.', 'Error', '⚠️');
                return;
            }
            const local = localPorId(state.currentLocal);
            const ventas = await fetchAll(() => supabase.from('ventas').select('*')
                .eq('local', state.currentLocal).order('fecha').order('id'));
            if (ventas.length === 0) {
                await customAlert('No hay ventas registradas para exportar en este local.', 'Sin datos', 'ℹ️');
                return;
            }
            const wb = construirLibro(XLSX, ventas, local ? local.nombre : state.currentLocal);
            XLSX.writeFile(wb, `Reporte_Kalo_${local ? local.slug : 'local'}_${toDateInputValue()}.xlsx`);
        } catch (error) {
            await customAlert('No se pudo exportar: ' + describeError(error), 'Error', '⚠️');
        } finally {
            exporting = false;
            if (exportStatsBtn) {
                exportStatsBtn.disabled = false;
                exportStatsBtn.textContent = label;
            }
        }
    }

    exportStatsBtn?.addEventListener('click', exportarExcel);

    return { calcularEstadisticas, exportarExcel, construirLibro, reset };
}
