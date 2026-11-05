import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { customAlert } from "./ui.js";
import { localPorId } from "./constants.js";
import { NOMBRES_MESES, rangoPeriodo, calcularReporte, construirExcel, graficosReporte, nombreArchivoReporte } from "./reporte.js";
import { escapeHtml, formatMoney, describeError, fetchAll, resumirVentas, ventasPorDia, monthRange, toMonthInputValue, toDateInputValue, roundMoney } from "./utils.js";

const TOP_PRODUCTOS = 10;
const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Colores del gráfico: los mismos que --chart-ventas y --chart-margen en index.css.
// Elegidos para que se distingan también con daltonismo y sobre el fondo crema.
const COLOR_VENTAS = '#00897b';
const COLOR_MARGEN = '#c97a1c';
const COLOR_FONDO = '#f9f4e9';
const COLOR_TEXTO = '#455b52';

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

export function setupStats({ loadChart = cargarChart, loadExcel = cargarExcel, descargar = descargarArchivo, ahora = () => new Date() } = {}) {
    const statsView = document.getElementById('statsView');
    const statsMonthInput = document.getElementById('statsMonth');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const thisMonthBtn = document.getElementById('thisMonthBtn');
    const exportStatsBtn = document.getElementById('exportStatsBtn');
    const exportYearBtn = document.getElementById('exportYearBtn');
    const chartEmpty = document.getElementById('chartEmpty');
    const chartBox = chartEmpty?.closest?.('.chart-box');
    const statsDaysList = document.getElementById('statsDaysList');
    const statsDaysTotal = document.getElementById('statsDaysTotal');
    const topProductsList = document.getElementById('topProductsList');
    let chart = null;
    let requestId = 0;
    let exporting = false;

    // --- MES QUE SE ESTÁ VIENDO ---
    const mesActual = () => toMonthInputValue(ahora());
    const partesMes = valor => valor.split('-').map(Number);
    const nombreMes = valor => {
        const [anio, mes] = partesMes(valor);
        return `${NOMBRES_MESES[mes - 1]} ${anio}`;
    };

    // Vacío, mal escrito o del futuro: se vuelve al mes actual.
    function mesElegido() {
        const valor = statsMonthInput?.value || '';
        return MES_VALIDO.test(valor) && valor <= mesActual() ? valor : mesActual();
    }

    function irAlMes(valor) {
        if (statsMonthInput) statsMonthInput.value = valor;
        return calcularEstadisticas();
    }

    function moverMes(meses) {
        const [anio, mes] = partesMes(mesElegido());
        return irAlMes(toMonthInputValue(new Date(anio, mes - 1 + meses, 1)));
    }

    if (statsMonthInput) {
        statsMonthInput.value = mesActual();
        statsMonthInput.max = mesActual();
        statsMonthInput.addEventListener('change', () => calcularEstadisticas());
    }
    prevMonthBtn?.addEventListener('click', () => moverMes(-1));
    nextMonthBtn?.addEventListener('click', () => moverMes(1));
    thisMonthBtn?.addEventListener('click', () => irAlMes(mesActual()));

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function mostrarMes(valor) {
        const [anio, mes] = partesMes(valor);
        const esActual = valor === mesActual();
        if (statsMonthInput) {
            statsMonthInput.value = valor;
            statsMonthInput.max = mesActual();
        }
        setText('statsMonthLabel', `${NOMBRES_MESES[mes - 1]} de ${anio}${esActual ? ' (mes en curso)' : ''}`);
        if (nextMonthBtn) nextMonthBtn.disabled = esActual;
        if (thisMonthBtn) thisMonthBtn.disabled = esActual;
        const local = localPorId(state.currentLocal)?.nombre;
        setText('reportBoxTitle', local ? `Descargar reporte en Excel de ${local}` : 'Descargar reporte en Excel');
        etiquetasReporte();
    }

    // El texto va en el <span> del botón para no borrar el ícono de descarga.
    function ponerEtiqueta(boton, texto) {
        const destino = boton?.querySelector?.('.export-label') || boton;
        if (destino) destino.textContent = texto;
    }

    // Los botones dicen exactamente qué se descarga: "Noviembre 2026" o "Todo el año 2026".
    function etiquetasReporte() {
        if (exporting) return;
        const valor = mesElegido();
        ponerEtiqueta(exportStatsBtn, nombreMes(valor));
        ponerEtiqueta(exportYearBtn, `Todo el año ${partesMes(valor)[0]}`);
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
        const mes = mesElegido();
        const range = monthRange(mes);
        if (!local || !range) return;
        const current = ++requestId;
        mostrarMes(mes);
        // Mientras carga, lo anterior se ve atenuado en vez de desaparecer.
        statsView?.classList.add('is-loading');
        let ventas = [];
        let fallo = null;
        try {
            ventas = await fetchAll(() => supabase.from('ventas')
                .select('id, fecha, total, descuento, costo_total, estado')
                .eq('local', local)
                .gte('fecha', range.start.toISOString())
                .lt('fecha', range.end.toISOString())
                .order('fecha').order('id'));
        } catch (error) {
            fallo = error;
        }
        if (current !== requestId) return;
        statsView?.classList.remove('is-loading');
        if (fallo) {
            console.error('Error al obtener estadísticas:', fallo);
            mostrarResumen(resumirVentas([]));
            mostrarDias([], null);
            quitarGrafico('No se pudieron cargar las ventas de este mes.');
            await customAlert('No se pudieron cargar las estadísticas: ' + describeError(fallo), 'Error', '⚠️');
        } else {
            const resumen = resumirVentas(ventas);
            const dias = diasDelMes(ventasPorDia(ventas), range);
            mostrarResumen(resumen);
            mostrarDias(dias, resumen);
            await renderChart(dias, mes);
        }
        await loadTopProducts(local, range, current);
    }

    // --- GRÁFICO Y TABLA POR DÍA ---
    // Un registro por día del mes. Los días que todavía no llegan quedan vacíos (sin barra
    // ni punto): antes bajaban a cero y parecía que las ventas se habían caído.
    function diasDelMes(porDia, range) {
        const hoy = toDateInputValue(ahora());
        const dias = [];
        for (let fecha = new Date(range.start); fecha < range.end; fecha.setDate(fecha.getDate() + 1)) {
            const clave = toDateInputValue(fecha);
            const dia = porDia.get(clave);
            dias.push({
                fecha: new Date(fecha), numero: fecha.getDate(), semana: fecha.getDay(),
                hoy: clave === hoy, futuro: clave > hoy,
                cantidad: dia?.cantidad || 0,
                ventas: roundMoney(dia?.ventas || 0),
                margen: roundMoney(dia?.margen || 0),
                descuentos: roundMoney(dia?.descuentos || 0)
            });
        }
        return dias;
    }

    function tituloDia(d) {
        const texto = d.fecha.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
        return d.hoy ? `Hoy, ${texto}` : texto.charAt(0).toUpperCase() + texto.slice(1);
    }

    function pieDia(d) {
        if (!d.cantidad) return d.hoy ? 'Todavía no hay ventas hoy' : 'Sin ventas este día';
        const partes = [`${d.cantidad} ${d.cantidad === 1 ? 'venta' : 'ventas'}`];
        if (d.descuentos > 0) partes.push(`Descuentos: ${formatMoney(d.descuentos)}`);
        return partes.join(' · ');
    }

    // Los mismos números del gráfico en una tabla (para leerlos sin pasar el mouse).
    function mostrarDias(dias, resumen) {
        if (!statsDaysList) return;
        const fila = (titulo, r) => `
            <tr>
                <td>${escapeHtml(titulo)}</td>
                <td class="money-cell">${escapeHtml(formatMoney(r.ventas))}</td>
                <td class="money-cell">${escapeHtml(r.cantidad)}</td>
                <td class="money-cell">${escapeHtml(formatMoney(r.margen))}</td>
                <td class="money-cell">${escapeHtml(formatMoney(r.descuentos))}</td>
            </tr>`;
        const hastaHoy = dias.filter(d => !d.futuro);
        statsDaysList.innerHTML = hastaHoy.length === 0
            ? '<tr><td colspan="5" class="table-message">Sin datos para mostrar.</td></tr>'
            : hastaHoy.map(d => {
                const titulo = `${DIAS_CORTOS[d.semana]} ${d.numero}${d.hoy ? ' (hoy)' : ''}`;
                return d.cantidad === 0
                    ? `<tr><td>${escapeHtml(titulo)}</td><td colspan="4" class="is-empty">Sin ventas</td></tr>`
                    : fila(titulo, d);
            }).join('');
        if (statsDaysTotal) statsDaysTotal.innerHTML = resumen ? fila('Total del mes', resumen) : '';
    }

    function quitarGrafico(mensaje) {
        chart?.destroy();
        chart = null;
        chartBox?.classList.add('is-empty');
        if (chartEmpty) {
            chartEmpty.textContent = mensaje;
            chartEmpty.classList.remove('hidden');
        }
    }

    // Barras = ventas de cada día; línea = margen. Mismo eje en soles para los dos.
    // La leyenda está escrita sobre el gráfico (index.html) y no oculta nada al tocarla.
    async function renderChart(dias, mes) {
        const canvas = document.getElementById('salesChart');
        if (!canvas) return;
        if (!dias.some(d => d.cantidad > 0)) {
            quitarGrafico(`No hay ventas registradas en ${nombreMes(mes).toLowerCase()}.`);
            return;
        }
        let Chart;
        try {
            ({ default: Chart } = await loadChart());
        } catch (error) {
            console.warn('No se pudo cargar el gráfico:', error);
            quitarGrafico('No se pudo cargar el gráfico. Revisa la conexión y vuelve a abrir Estadísticas.');
            return;
        }
        chartBox?.classList.remove('is-empty');
        chartEmpty?.classList.add('hidden');
        const colorDe = item => (item.dataset.type === 'line' ? COLOR_MARGEN : COLOR_VENTAS);
        const soles = valor => `S/ ${Number(valor).toLocaleString('es-PE', { maximumFractionDigits: 2 })}`;
        chart?.destroy();
        chart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: dias.map(d => String(d.numero)),
                datasets: [
                    {
                        type: 'bar', label: 'Ventas', order: 2,
                        data: dias.map(d => (d.futuro ? null : d.ventas)),
                        backgroundColor: COLOR_VENTAS, hoverBackgroundColor: '#006d62',
                        borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24
                    },
                    {
                        type: 'line', label: 'Margen', order: 1,
                        data: dias.map(d => (d.futuro ? null : d.margen)),
                        borderColor: COLOR_MARGEN, backgroundColor: COLOR_MARGEN, borderWidth: 2,
                        borderCapStyle: 'round', borderJoinStyle: 'round', tension: 0,
                        pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: COLOR_MARGEN,
                        pointBorderColor: COLOR_FONDO, pointBorderWidth: 2, pointHoverBorderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: COLOR_TEXTO, maxRotation: 0 },
                        title: { display: true, text: `Días de ${NOMBRES_MESES[partesMes(mes)[1] - 1].toLowerCase()}`, color: COLOR_TEXTO }
                    },
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: { color: '#e2e2d6' },
                        ticks: { color: COLOR_TEXTO, maxTicksLimit: 6, callback: soles }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        filter: item => item.raw != null,
                        itemSort: (a, b) => a.datasetIndex - b.datasetIndex,
                        backgroundColor: '#182c29', titleColor: '#fff', bodyColor: '#fff', footerColor: '#d8e5d4',
                        padding: 10, usePointStyle: true, boxWidth: 10, boxHeight: 10, boxPadding: 6,
                        titleFont: { size: 14, weight: 'bold' }, bodyFont: { size: 14 }, footerFont: { size: 13, weight: 'normal' },
                        // En un día que todavía no llega no queda ningún dato: sin título ni pie, Chart.js no muestra el recuadro.
                        callbacks: {
                            title: items => (items.length ? tituloDia(dias[items[0].dataIndex]) : ''),
                            label: item => `${item.dataset.label}: ${formatMoney(item.raw)}`,
                            labelColor: item => ({ borderColor: colorDe(item), backgroundColor: colorDe(item) }),
                            labelPointStyle: item => ({ pointStyle: item.dataset.type === 'line' ? 'circle' : 'rect', rotation: 0 }),
                            footer: items => (items.length ? pieDia(dias[items[0].dataIndex]) : '')
                        }
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
        chartEmpty?.classList.add('hidden');
        chartBox?.classList.remove('is-empty');
        statsView?.classList.remove('is-loading');
        mostrarResumen(resumirVentas([]));
        if (topProductsList) topProductsList.innerHTML = '';
        if (statsDaysList) statsDaysList.innerHTML = '';
        if (statsDaysTotal) statsDaysTotal.innerHTML = '';
    }

    // --- REPORTE EXCEL ---
    const COLUMNAS_REPORTE = 'id, fecha, local, subtotal, descuento, total, costo_total, metodo_pago, efectivo, yape, estado, detalles, creado_por_email, reembolsado_por_email, reembolsado_en, motivo_reembolso, venta_items(producto_id, nombre, cantidad, precio_unitario, costo_unitario, componentes)';

    const filtrarLocales = (consulta, locales) => consulta.eq('local', locales[0]);

    let botonActivo = null;
    function avance(texto) {
        ponerEtiqueta(botonActivo, texto);
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

    // periodo: 'mes' (el mes que se está viendo) o 'anio' (todo ese año).
    async function exportarExcel(periodo = 'mes') {
        if (exporting || !state.currentLocal) return;
        exporting = true;
        botonActivo = periodo === 'anio' ? exportYearBtn : exportStatsBtn;
        for (const boton of [exportStatsBtn, exportYearBtn]) if (boton) boton.disabled = true;
        try {
            const rango = rangoPeriodo(periodo === 'anio' ? 'anio' : 'mes', mesElegido());
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

            const modelo = calcularReporte({ ventas, ventasPrevias, productos, rango, locales, generadoPor: state.perfil?.email, ahora: ahora() });

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
            botonActivo = null;
            for (const boton of [exportStatsBtn, exportYearBtn]) if (boton) boton.disabled = false;
            etiquetasReporte();
        }
    }

    exportStatsBtn?.addEventListener('click', () => exportarExcel('mes'));
    exportYearBtn?.addEventListener('click', () => exportarExcel('anio'));

    return { calcularEstadisticas, exportarExcel, reset };
}
