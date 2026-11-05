import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { customAlert } from "./ui.js";
import { rangoPeriodo, calcularReporte, construirExcel, graficosReporte, nombreArchivoReporte } from "./reporte.js";
import { escapeHtml, formatMoney, describeError, fetchAll, resumirVentas, ventasPorDia, monthRange, toMonthInputValue, toDateInputValue, roundMoney } from "./utils.js";

const TOP_PRODUCTOS = 10;

// Las librerías pesadas se cargan solo al abrir Estadísticas o al exportar.
const cargarChart = () => import('chart.js/auto');
const cargarExcel = () => import('exceljs');

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function descargarArchivo(contenido, nombre) {
    const url = URL.createObjectURL(new Blob([contenido], { type: TIPO_XLSX }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function setupStats({ loadChart = cargarChart, loadExcel = cargarExcel, descargar = descargarArchivo } = {}) {
    const statsMonthInput = document.getElementById('statsMonth');
    const exportStatsBtn = document.getElementById('exportStatsBtn');
    const reportPeriod = document.getElementById('reportPeriod');
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
        topProductsList.innerHTML = '<tr><td colspan="5" class="table-message">Cargando…</td></tr>';
        const { data, error } = await supabase.rpc('resumen_productos', {
            p_local: local, p_desde: range.start.toISOString(), p_hasta: range.end.toISOString()
        });
        if (current !== requestId) return;
        if (error) {
            topProductsList.innerHTML = `<tr><td colspan="5" class="table-message is-error">${escapeHtml(describeError(error))}</td></tr>`;
            return;
        }
        const rows = (data || []).slice(0, TOP_PRODUCTOS);
        if (rows.length === 0) {
            topProductsList.innerHTML = '<tr><td colspan="5" class="table-message">Sin ventas en este mes.</td></tr>';
            return;
        }
        topProductsList.innerHTML = rows.map((row, index) => `
            <tr>
                <td class="rank-cell"><span class="rank-badge${index < 3 ? ' is-podium' : ''}">${index + 1}</span></td>
                <td class="top-product-name">${escapeHtml(row.producto)}</td>
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

    // --- REPORTE EXCEL ---
    const COLUMNAS_REPORTE = 'id, fecha, local, subtotal, descuento, total, costo_total, metodo_pago, efectivo, yape, estado, detalles, creado_por_email, reembolsado_por_email, reembolsado_en, motivo_reembolso, venta_items(producto_id, nombre, cantidad, precio_unitario, costo_unitario, componentes)';

    const filtrarLocales = (consulta, locales) => consulta.eq('local', locales[0]);

    function avance(texto) {
        if (exportStatsBtn) exportStatsBtn.textContent = texto;
    }

    // Lienzos fuera de la vista para dibujar los gráficos que van dentro del Excel.
    function dibujarGraficos(Chart, modelo) {
        const lienzos = [];
        const crearCanvas = (ancho, alto) => {
            const canvas = document.createElement('canvas');
            canvas.width = ancho;
            canvas.height = alto;
            canvas.style.position = 'fixed';
            canvas.style.left = '-10000px';
            canvas.style.top = '0';
            canvas.style.width = `${ancho}px`;
            canvas.style.height = `${alto}px`;
            document.body?.appendChild(canvas);
            lienzos.push(canvas);
            return canvas;
        };
        try {
            return graficosReporte(Chart, modelo, crearCanvas);
        } finally {
            lienzos.forEach(canvas => canvas.remove?.());
        }
    }

    async function exportarExcel() {
        if (exporting || !state.currentLocal) return;
        exporting = true;
        const label = exportStatsBtn?.textContent;
        if (exportStatsBtn) exportStatsBtn.disabled = true;
        try {
            const periodo = reportPeriod?.value === 'anio' ? 'anio' : 'mes';
            const rango = rangoPeriodo(periodo, statsMonthInput?.value || toMonthInputValue());
            if (!rango) return;
            // Cada local es aparte: el reporte es siempre del local que se está viendo.
            const locales = [state.currentLocal];
            const ordenar = consulta => consulta.order('fecha').order('id');

            avance('Leyendo ventas…');
            const ventas = await fetchAll(() => ordenar(filtrarLocales(supabase.from('ventas').select(COLUMNAS_REPORTE), locales)
                .gte('fecha', rango.desde.toISOString()).lt('fecha', rango.hasta.toISOString())));
            if (ventas.length === 0) {
                await customAlert(`No hay ventas registradas en ${rango.titulo} para este reporte.`, 'Sin datos', 'ℹ️');
                return;
            }
            const ventasPrevias = await fetchAll(() => ordenar(filtrarLocales(supabase.from('ventas')
                .select('id, fecha, subtotal, descuento, total, costo_total, metodo_pago, efectivo, yape, estado'), locales)
                .gte('fecha', rango.anteriorDesde.toISOString()).lt('fecha', rango.anteriorHasta.toISOString())));
            avance('Revisando inventario…');
            const productos = await fetchAll(() => filtrarLocales(supabase.from('productos')
                .select('id, nombre, categoria, local, stock, alerta_stock, precio_compra, precio_venta, lotes')
                .eq('activo', true), locales).order('id'));

            const modelo = calcularReporte({ ventas, ventasPrevias, productos, rango, locales, generadoPor: state.perfil?.email, ahora: new Date() });

            avance('Dibujando gráficos…');
            let graficos = {};
            try {
                const { default: Chart } = await loadChart();
                graficos = dibujarGraficos(Chart, modelo);
            } catch (error) {
                console.warn('El reporte se arma sin gráficos:', error);
            }

            avance('Armando el Excel…');
            let ExcelJS;
            try {
                const modulo = await loadExcel();
                ExcelJS = modulo.default || modulo;
            } catch (error) {
                console.error('Error al cargar ExcelJS:', error);
                await customAlert('No se pudo preparar el Excel. Verifica tu conexión a internet.', 'Error', '⚠️');
                return;
            }
            const libro = construirExcel(ExcelJS, modelo, graficos);
            const contenido = await libro.xlsx.writeBuffer();
            await descargar(contenido, nombreArchivoReporte(modelo));
        } catch (error) {
            console.error('Error al exportar:', error);
            await customAlert('No se pudo generar el reporte: ' + describeError(error), 'Error', '⚠️');
        } finally {
            exporting = false;
            if (exportStatsBtn) {
                exportStatsBtn.disabled = false;
                exportStatsBtn.textContent = label;
            }
        }
    }

    exportStatsBtn?.addEventListener('click', exportarExcel);

    return { calcularEstadisticas, exportarExcel, reset };
}
