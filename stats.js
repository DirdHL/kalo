import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { customAlert, customConfirm } from "./ui.js";

let salesChartInstance = null;

export function setupStats({ onProductsChanged }) {
    const statsMonthInput = document.getElementById('statsMonth');
    const exportStatsBtn = document.getElementById('exportStatsBtn');
    const ventasList = document.getElementById('ventasList');
    let refundInProgress = false;

    if (statsMonthInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        statsMonthInput.value = `${yyyy}-${mm}`;
        statsMonthInput.addEventListener('change', calcularEstadisticas);
    }

    async function calcularEstadisticas() {
        const monthInput = statsMonthInput ? statsMonthInput.value : '';
        
        let query = supabase.from('ventas').select('*').eq('local', state.currentLocal).order('fecha', { ascending: true });
        
        if (monthInput) {
            const [year, month] = monthInput.split('-').map(Number);
            // Usar los mismos límites locales que el gráfico y la exportación.
            const startOfMonth = new Date(year, month - 1, 1);
            const startOfNextMonth = new Date(year, month, 1);
            query = query.gte('fecha', startOfMonth.toISOString())
                         .lt('fecha', startOfNextMonth.toISOString());
        }

        try {
            const { data, error } = await query;
            if (error) {
                if (error.code === '42P01') {
                    console.warn('La tabla ventas no existe todavía.');
                    renderEmptyStats();
                    return;
                }
                throw error;
            }

            let brutas = 0;
            let descuentos = 0;
            let netas = 0;
            let costos = 0;
            let reembolsos = 0;

            const gananciaBrutaPorDia = {};
            const gananciaNetaPorDia = {};
            const descuentosPorDia = {};
            window.currentMonthVentas = data;

            if (data.length === 0) {
                renderEmptyStats();
            } else {
                data.forEach(v => {
                    const isRefunded = v.estado === 'reembolsada';

                    if (isRefunded) {
                        reembolsos += Number(v.total) || 0;
                    } else {
                        brutas += Number(v.subtotal) || 0;
                        descuentos += Number(v.descuento) || 0;
                        netas += Number(v.total) || 0;
                        costos += Number(v.costo_total) || 0;

                        const dateObj = new Date(v.fecha);
                        const fechaStr = dateObj.toLocaleDateString();
                        const gBruta = Number(v.total) || 0;
                        const gNeta = gBruta - (Number(v.costo_total) || 0);
                        const desc = Number(v.descuento) || 0;

                        gananciaBrutaPorDia[fechaStr] = (gananciaBrutaPorDia[fechaStr] || 0) + gBruta;
                        gananciaNetaPorDia[fechaStr] = (gananciaNetaPorDia[fechaStr] || 0) + gNeta;
                        descuentosPorDia[fechaStr] = (descuentosPorDia[fechaStr] || 0) + desc;
                    }
                });
            }

            const elDescuentos = document.getElementById('statDescuentos');
            const elGananciaBruta = document.getElementById('statGananciaBruta');
            const elGananciaNeta = document.getElementById('statGananciaNeta');

            if (elDescuentos) elDescuentos.textContent = `S/ ${descuentos.toFixed(2)}`;
            if (elGananciaBruta) elGananciaBruta.textContent = `S/ ${netas.toFixed(2)}`;
            if (elGananciaNeta) elGananciaNeta.textContent = `S/ ${(netas - costos).toFixed(2)}`;
            
            renderChart(gananciaBrutaPorDia, gananciaNetaPorDia, descuentosPorDia, monthInput);

        } catch (err) {
            console.error('Error al obtener estadísticas:', err);
            renderEmptyStats();
        }
    }

    function renderEmptyStats() {
        const elDescuentos = document.getElementById('statDescuentos');
        const elGananciaBruta = document.getElementById('statGananciaBruta');
        const elGananciaNeta = document.getElementById('statGananciaNeta');

        if (elDescuentos) elDescuentos.textContent = `S/ 0.00`;
        if (elGananciaBruta) elGananciaBruta.textContent = `S/ 0.00`;
        if (elGananciaNeta) elGananciaNeta.textContent = `S/ 0.00`;
        renderChart({}, {}, {}, null);
    }

    function renderChart(gananciaBrutaPorDia, gananciaNetaPorDia, descuentosPorDia, monthInput) {
        const chartEl = document.getElementById('salesChart');
        if (!chartEl || typeof Chart === 'undefined') return;
        const ctx = chartEl.getContext('2d');
        
        let labels = [];
        let valuesGananciaBruta = [];
        let valuesGananciaNeta = [];
        let valuesDescuentos = [];
        
        if (monthInput) {
            const [y, m] = monthInput.split('-');
            const year = parseInt(y);
            const month = parseInt(m);
            const daysInMonth = new Date(year, month, 0).getDate();
            
            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = new Date(year, month - 1, i).toLocaleDateString();
                labels.push(`${i}/${m}`);
                valuesGananciaBruta.push(gananciaBrutaPorDia[dateStr] || 0);
                valuesGananciaNeta.push(gananciaNetaPorDia[dateStr] || 0);
                valuesDescuentos.push(descuentosPorDia[dateStr] || 0);
            }
        } else {
            labels = Object.keys(gananciaBrutaPorDia);
            valuesGananciaBruta = Object.values(gananciaBrutaPorDia);
            valuesGananciaNeta = Object.values(gananciaNetaPorDia);
            valuesDescuentos = Object.values(descuentosPorDia);
        }

        if (salesChartInstance) {
            salesChartInstance.destroy();
        }

        salesChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['Sin datos'],
                datasets: [
                    {
                        label: 'Ganancia Bruta (S/)',
                        data: valuesGananciaBruta.length ? valuesGananciaBruta : [0],
                        borderColor: '#b56a21',
                        backgroundColor: 'rgba(181, 106, 33, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: false,
                        pointBackgroundColor: '#b56a21',
                        pointBorderColor: '#fff',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Ganancia Neta (S/)',
                        data: valuesGananciaNeta.length ? valuesGananciaNeta : [0],
                        borderColor: '#087f87',
                        backgroundColor: 'rgba(8, 127, 135, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointBackgroundColor: '#087f87',
                        pointBorderColor: '#fff',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Descuentos (S/)',
                        data: valuesDescuentos.length ? valuesDescuentos : [0],
                        borderColor: '#c1473c',
                        backgroundColor: 'rgba(193, 71, 60, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: false,
                        pointBackgroundColor: '#c1473c',
                        pointBorderColor: '#fff',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: '#e1e8eb' },
                        ticks: { 
                            color: '#647782',
                            callback: function(value) {
                                return 'S/ ' + value;
                            }
                        } 
                    },
                    x: { 
                        grid: { display: false }, 
                        ticks: { color: '#647782' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#344b57' } },
                    tooltip: {
                        backgroundColor: '#172c36',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: '#344b57',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += 'S/ ' + context.parsed.y.toFixed(2);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    async function loadHistory() {
        if (!ventasList) return;
        ventasList.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando...</td></tr>';
        
        try {
            const { data, error } = await supabase.from('ventas').select('*').eq('local', state.currentLocal).order('fecha', { ascending: false }).limit(100);
            if (error) throw error;
            
            ventasList.innerHTML = '';
            
            if (data.length === 0) {
                ventasList.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-secondary);">No hay ventas registradas.</td></tr>`;
                return;
            }
            
            data.forEach(v => {
                const tr = document.createElement('tr');
                const dateObj = new Date(v.fecha);
                const fechaStr = dateObj.toLocaleDateString();
                const horaStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                let productosStr = 'Sin detalles';
                if (v.detalles && Array.isArray(v.detalles)) {
                    productosStr = v.detalles.map(item => `${item.qty}x ${item.nombre}`).join(', ');
                }

                const isRefunded = v.estado === 'reembolsada';
                const estadoHtml = isRefunded 
                    ? `<span style="background: #fff1ef; color: #b42318; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">Reembolsada</span>`
                    : `<span style="background: #e9f6f1; color: #147556; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">Completada</span>`;
                
                const accionHtml = isRefunded
                    ? `-`
                    : `<button class="secondary-btn btn-refund" data-id="${v.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; border-color: #f2c8c4; color: #b42318;">Reembolsar</button>`;

                tr.innerHTML = `
                    <td>${fechaStr}</td>
                    <td>${horaStr}</td>
                    <td>${v.metodo_pago || 'Efectivo'}</td>
                    <td style="font-size: 0.8rem; color: var(--text-secondary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${productosStr}">${productosStr}</td>
                    <td style="font-weight:bold; ${isRefunded ? 'text-decoration: line-through; opacity: 0.5;' : ''}">S/ ${Number(v.total).toFixed(2)}</td>
                    <td style="color:#b42318; ${isRefunded ? 'text-decoration: line-through; opacity: 0.5;' : ''}">S/ ${Number(v.descuento).toFixed(2)}</td>
                    <td>${estadoHtml}</td>
                    <td>${accionHtml}</td>
                `;
                ventasList.appendChild(tr);
            });
        } catch (err) {
            console.error(err);
            ventasList.innerHTML = `<tr><td colspan="8" style="text-align:center; color: #b42318;">Error al cargar historial.</td></tr>`;
        }
    }

    if (ventasList && !window.historyDelegated) {
        ventasList.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-refund');
            if (btn) {
                const ventaId = btn.getAttribute('data-id');
                await refundSale(ventaId);
            }
        });
        window.historyDelegated = true;
    }

    async function refundSale(ventaId) {
        if (refundInProgress) return;
        refundInProgress = true;
        const appliedUpdates = [];
        let refundRecorded = false;

        try {
            if (!await customConfirm('¿Seguro que deseas reembolsar esta venta? El stock de los productos será devuelto al inventario.')) return;

            const { data: venta, error: fetchErr } = await supabase.from('ventas').select('*').eq('id', ventaId).eq('local', state.currentLocal).single();
            if (fetchErr) throw fetchErr;

            if (venta.estado === 'reembolsada') {
                await customAlert('Esta venta ya ha sido reembolsada.', 'Aviso', 'ℹ️');
                return;
            }

            if (!Array.isArray(venta.detalles) || venta.detalles.length === 0) {
                throw new Error('La venta no tiene detalles suficientes para devolver el stock.');
            }

            // Acumular productos compartidos entre combos e ítems individuales.
            const quantities = new Map();
            const addQuantity = (id, quantity) => {
                if (id == null || String(id).trim() === '' || !Number.isSafeInteger(quantity) || quantity <= 0) {
                    throw new Error('La venta contiene un producto o una cantidad inválida.');
                }
                const key = String(id);
                const total = (quantities.get(key) || 0) + quantity;
                if (!Number.isSafeInteger(total)) throw new Error('La cantidad a devolver es inválida.');
                quantities.set(key, total);
            };
            for (const item of venta.detalles) {
                const quantity = Number(item.qty);
                if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                    throw new Error('La venta contiene una cantidad inválida.');
                }
                if (typeof item.codigo === 'string' && item.codigo.startsWith('COMBO:')) {
                    const parts = item.codigo.slice('COMBO:'.length).split(',').filter(Boolean);
                    if (parts.length === 0) throw new Error('La venta contiene un combo sin productos.');
                    for (const part of parts) {
                        const component = /^(.+)-([1-9]\d*)$/.exec(part);
                        if (!component) throw new Error('La venta contiene un combo inválido.');
                        addQuantity(component[1], Number(component[2]) * quantity);
                    }
                } else {
                    addQuantity(item.id, quantity);
                }
            }

            const { data: products, error: productsErr } = await supabase.from('productos').select('id, stock').eq('local', state.currentLocal).in('id', [...quantities.keys()]);
            if (productsErr) throw productsErr;
            const productsById = new Map((products || []).map(product => [String(product.id), product]));

            // Leer stock actual, sin depender de la copia cargada al iniciar sesión.
            const stockChanges = [];
            for (const [id, quantity] of quantities) {
                const product = productsById.get(id);
                if (!product) throw new Error(`No se encontró el producto ${id} para devolver su stock.`);
                if (product.stock === null) continue;
                const previousStock = Number(product.stock);
                const nextStock = previousStock + quantity;
                if (!Number.isFinite(previousStock) || !Number.isFinite(nextStock)) {
                    throw new Error(`El stock del producto ${id} es inválido.`);
                }
                stockChanges.push({ id: product.id, previousStock, nextStock });
            }

            for (const change of stockChanges) {
                const { data: updated, error: stockErr } = await supabase.from('productos')
                    .update({ stock: change.nextStock }).eq('id', change.id).eq('local', state.currentLocal)
                    .eq('stock', change.previousStock).select('id');
                if (stockErr) throw stockErr;
                if (!updated || updated.length !== 1) throw new Error('El inventario cambió durante el reembolso. Vuelve a intentarlo.');
                appliedUpdates.push(change);
            }

            let updateSale = supabase.from('ventas').update({ estado: 'reembolsada' }).eq('id', ventaId).eq('local', state.currentLocal);
            updateSale = venta.estado == null ? updateSale.is('estado', null) : updateSale.eq('estado', venta.estado);
            const { data: updatedSale, error: updErr } = await updateSale.select('id');
            if (updErr) throw updErr;
            if (!updatedSale || updatedSale.length !== 1) throw new Error('La venta cambió durante el reembolso. Actualiza el historial.');
            refundRecorded = true;

            await customAlert('Venta reembolsada con éxito.', '¡Éxito!', '✅');
            if (typeof onProductsChanged === 'function') {
                await onProductsChanged();
            }
            await loadHistory();

        } catch (err) {
            console.error('Error al reembolsar:', err);
            if (refundRecorded) {
                await customAlert('El reembolso se registró, pero no se pudo actualizar la pantalla. Recarga la página.', 'Aviso', 'ℹ️');
                return;
            }

            let rollbackFailed = false;
            for (const change of appliedUpdates.reverse()) {
                try {
                    const { data: restored, error: rollbackErr } = await supabase.from('productos')
                        .update({ stock: change.previousStock }).eq('id', change.id).eq('local', state.currentLocal)
                        .eq('stock', change.nextStock).select('id');
                    if (rollbackErr || !restored || restored.length !== 1) throw rollbackErr || new Error('El stock cambió durante la reversión.');
                } catch (rollbackErr) {
                    rollbackFailed = true;
                    console.error('No se pudo revertir el stock del producto', change.id, rollbackErr);
                }
            }
            const rollbackMessage = rollbackFailed ? ' No se pudo restaurar todo el stock; revisa el inventario antes de reintentar.' : '';
            await customAlert('No se pudo completar el reembolso. ' + err.message + rollbackMessage, 'Error', '⚠️');
        } finally {
            refundInProgress = false;
        }
    }

    window.refundSale = refundSale;

    // Cargar XLSX dinámicamente si aún no está presente
    function loadXLSX() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.onload = () => resolve(window.XLSX);
            script.onerror = () => reject(new Error('No se pudo cargar la librería XLSX'));
            document.head.appendChild(script);
        });
    }

    // Exportar Excel (.xlsx auténtico con pestañas por cada mes)
    if (exportStatsBtn) {
        exportStatsBtn.addEventListener('click', async () => {
            const mesInput = statsMonthInput ? statsMonthInput.value : 'Completo';

            let XLSX;
            try {
                XLSX = await loadXLSX();
            } catch (err) {
                console.error('Error al cargar XLSX:', err);
                await customAlert('Hubo un error al preparar la exportación de Excel. Verifica tu conexión a internet.', 'Error', '⚠️');
                return;
            }

            // Consultar todas las ventas registradas del local actual
            let todasVentas = [];
            try {
                const { data, error } = await supabase
                    .from('ventas')
                    .select('*')
                    .eq('local', state.currentLocal)
                    .order('fecha', { ascending: true });

                if (error) throw error;
                todasVentas = data || [];
            } catch (err) {
                console.warn('Error al consultar todas las ventas:', err);
                todasVentas = window.currentMonthVentas || [];
            }

            if (!todasVentas || todasVentas.length === 0) {
                await customAlert('No hay ventas registradas para exportar en este local.', 'Sin datos', 'ℹ️');
                return;
            }

            const NOMBRES_MESES = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];

            // Agrupar ventas por mes (YYYY-MM)
            const ventasPorMes = {};
            todasVentas.forEach(v => {
                if (v.estado === 'reembolsada') return; // Omitir reembolsos según solicitud
                const d = new Date(v.fecha);
                if (isNaN(d.getTime())) return;
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const key = `${yyyy}-${mm}`;
                if (!ventasPorMes[key]) {
                    ventasPorMes[key] = {
                        year: yyyy,
                        monthNum: mm,
                        monthName: NOMBRES_MESES[d.getMonth()] || `Mes ${mm}`,
                        ventas: []
                    };
                }
                ventasPorMes[key].ventas.push(v);
            });

            const monthKeys = Object.keys(ventasPorMes).sort();
            if (monthKeys.length === 0) {
                await customAlert('No hay ventas válidas para exportar.', 'Sin datos', 'ℹ️');
                return;
            }

            const wb = XLSX.utils.book_new();

            // 1. Hoja: Resumen General (Consolidado de todos los meses)
            const localNombre = state.currentLocal ? state.currentLocal.toUpperCase() : 'LOCAL';
            const resumenGeneralRows = [
                [`CONSOLIDADO HISTÓRICO DE VENTAS - KALO (${localNombre})`],
                [],
                ['Mes', 'N° Ventas', 'Ventas Totales (S/)', 'Descuentos (S/)', 'Ganancia Neta (S/)']
            ];

            let globalVentasCount = 0;
            let globalTotal = 0;
            let globalDescuentos = 0;
            let globalGananciaNeta = 0;

            monthKeys.forEach(key => {
                const group = ventasPorMes[key];
                let mesTotal = 0;
                let mesDescuentos = 0;
                let mesCostos = 0;

                group.ventas.forEach(v => {
                    mesTotal += Number(v.total) || 0;
                    mesDescuentos += Number(v.descuento) || 0;
                    mesCostos += Number(v.costo_total) || 0;
                });

                const mesGananciaNeta = mesTotal - mesCostos;

                globalVentasCount += group.ventas.length;
                globalTotal += mesTotal;
                globalDescuentos += mesDescuentos;
                globalGananciaNeta += mesGananciaNeta;

                resumenGeneralRows.push([
                    `${group.monthName} ${group.year}`,
                    group.ventas.length,
                    Number(mesTotal.toFixed(2)),
                    Number(mesDescuentos.toFixed(2)),
                    Number(mesGananciaNeta.toFixed(2))
                ]);
            });

            resumenGeneralRows.push([]);
            resumenGeneralRows.push([
                'TOTAL HISTÓRICO',
                globalVentasCount,
                Number(globalTotal.toFixed(2)),
                Number(globalDescuentos.toFixed(2)),
                Number(globalGananciaNeta.toFixed(2))
            ]);

            const wsResumen = XLSX.utils.aoa_to_sheet(resumenGeneralRows);
            wsResumen['!cols'] = [
                { wch: 22 }, // Mes
                { wch: 12 }, // N° Ventas
                { wch: 20 }, // Ventas Totales
                { wch: 18 }, // Descuentos
                { wch: 20 }  // Ganancia Neta
            ];
            XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen General');

            // 2. Crear una pestaña por cada mes registrado
            monthKeys.forEach(key => {
                const group = ventasPorMes[key];
                let mesTotal = 0;
                let mesDescuentos = 0;
                let mesCostos = 0;

                group.ventas.forEach(v => {
                    mesTotal += Number(v.total) || 0;
                    mesDescuentos += Number(v.descuento) || 0;
                    mesCostos += Number(v.costo_total) || 0;
                });

                const mesGananciaNeta = mesTotal - mesCostos;

                const monthRows = [
                    [`REPORTE MENSUAL KALO - ${group.monthName.toUpperCase()} ${group.year}`],
                    [],
                    ['RESUMEN DEL MES', ''],
                    ['Descuentos', Number(mesDescuentos.toFixed(2))],
                    ['Ganancia Bruta', Number(mesTotal.toFixed(2))],
                    ['GANANCIA NETA', Number(mesGananciaNeta.toFixed(2))],
                    ['Transacciones', group.ventas.length],
                    [],
                    ['DETALLE DE VENTAS'],
                    ['Fecha', 'Hora', 'Método', 'Productos', 'Subtotal (S/)', 'Descuento (S/)', 'Total Pagado (S/)', 'Ganancia Neta (S/)', 'Estado']
                ];

                group.ventas.forEach(v => {
                    const dateObj = new Date(v.fecha);
                    const fechaStr = dateObj.toLocaleDateString();
                    const horaStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    let productosStr = 'Sin detalles';
                    if (v.detalles && Array.isArray(v.detalles)) {
                        productosStr = v.detalles.map(item => `${item.qty}x ${item.nombre}`).join('; ');
                    }
                    const ganancia = (Number(v.total) || 0) - (Number(v.costo_total) || 0);
                    const descuento = Number(v.descuento || 0);

                    monthRows.push([
                        fechaStr,
                        horaStr,
                        v.metodo_pago || 'Efectivo',
                        productosStr,
                        Number(Number(v.subtotal || 0).toFixed(2)),
                        Number(descuento.toFixed(2)),
                        Number(Number(v.total || 0).toFixed(2)),
                        Number(ganancia.toFixed(2)),
                        v.estado || 'completada'
                    ]);
                });

                const wsMonth = XLSX.utils.aoa_to_sheet(monthRows);
                wsMonth['!cols'] = [
                    { wch: 14 }, // Fecha
                    { wch: 10 }, // Hora
                    { wch: 15 }, // Método
                    { wch: 45 }, // Productos
                    { wch: 14 }, // Subtotal
                    { wch: 14 }, // Descuento
                    { wch: 16 }, // Total Pagado
                    { wch: 18 }, // Ganancia Neta
                    { wch: 14 }  // Estado
                ];

                // Nombre de la pestaña (ej: 'Octubre 2026', 'Setiembre 2026')
                const tabName = `${group.monthName} ${group.year}`.slice(0, 31);
                XLSX.utils.book_append_sheet(wb, wsMonth, tabName);
            });

            // Descargar libro completo con todas las pestañas
            const fileName = `Reporte_Kalo_Historico_${mesInput}.xlsx`;
            XLSX.writeFile(wb, fileName);
        });
    }

    return {
        calcularEstadisticas,
        loadHistory
    };
}
