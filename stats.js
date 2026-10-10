import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { customAlert, customConfirm } from "./ui.js";

let salesChartInstance = null;

export function setupStats({ onProductsChanged }) {
    const statsMonthInput = document.getElementById('statsMonth');
    const exportStatsBtn = document.getElementById('exportStatsBtn');
    const ventasList = document.getElementById('ventasList');

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
            const [y, m] = monthInput.split('-');
            const endOfMonth = new Date(y, m, 0);
            const lastDay = endOfMonth.getDate();
            query = query.gte('fecha', `${monthInput}-01T00:00:00.000Z`)
                         .lte('fecha', `${monthInput}-${lastDay}T23:59:59.999Z`);
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

            const ventasPorDia = {};
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
                        ventasPorDia[fechaStr] = (ventasPorDia[fechaStr] || 0) + (Number(v.total) || 0);
                    }
                });
            }

            const elInversiones = document.getElementById('statInversiones');
            const elDescuentos = document.getElementById('statDescuentos');
            const elGananciaBruta = document.getElementById('statGananciaBruta');
            const elGananciaNeta = document.getElementById('statGananciaNeta');

            if (elInversiones) elInversiones.textContent = `S/ ${costos.toFixed(2)}`;
            if (elDescuentos) elDescuentos.textContent = `S/ ${descuentos.toFixed(2)}`;
            if (elGananciaBruta) elGananciaBruta.textContent = `S/ ${netas.toFixed(2)}`;
            if (elGananciaNeta) elGananciaNeta.textContent = `S/ ${(netas - costos).toFixed(2)}`;
            
            renderChart(ventasPorDia);

        } catch (err) {
            console.error('Error al obtener estadísticas:', err);
            renderEmptyStats();
        }
    }

    function renderEmptyStats() {
        const elInversiones = document.getElementById('statInversiones');
        const elDescuentos = document.getElementById('statDescuentos');
        const elGananciaBruta = document.getElementById('statGananciaBruta');
        const elGananciaNeta = document.getElementById('statGananciaNeta');

        if (elInversiones) elInversiones.textContent = `S/ 0.00`;
        if (elDescuentos) elDescuentos.textContent = `S/ 0.00`;
        if (elGananciaBruta) elGananciaBruta.textContent = `S/ 0.00`;
        if (elGananciaNeta) elGananciaNeta.textContent = `S/ 0.00`;
        renderChart({});
    }

    function renderChart(dataObj) {
        const chartEl = document.getElementById('salesChart');
        if (!chartEl || typeof Chart === 'undefined') return;
        const ctx = chartEl.getContext('2d');
        const labels = Object.keys(dataObj);
        const values = Object.values(dataObj);

        if (salesChartInstance) {
            salesChartInstance.destroy();
        }

        salesChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['Sin datos'],
                datasets: [{
                    label: 'Ventas Netas (S/)',
                    data: values.length ? values : [0],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#10b981'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'rgba(255,255,255,0.7)' } },
                    x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.7)' } }
                },
                plugins: {
                    legend: { labels: { color: 'rgba(255,255,255,0.9)' } }
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
                ventasList.innerHTML = `<tr><td colspan="8" style="text-align:center; color: gray;">No hay ventas registradas.</td></tr>`;
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
                    ? `<span style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">Reembolsada</span>`
                    : `<span style="background: rgba(16, 185, 129, 0.2); color: #a7f3d0; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">Completada</span>`;
                
                const accionHtml = isRefunded
                    ? `-`
                    : `<button class="secondary-btn btn-refund" data-id="${v.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; border-color: #ef4444; color: #fca5a5;">Reembolsar</button>`;

                tr.innerHTML = `
                    <td>${fechaStr}</td>
                    <td>${horaStr}</td>
                    <td>${v.metodo_pago || 'Efectivo'}</td>
                    <td style="font-size: 0.8rem; color: #cbd5e1; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${productosStr}">${productosStr}</td>
                    <td style="font-weight:bold; ${isRefunded ? 'text-decoration: line-through; opacity: 0.5;' : ''}">S/ ${Number(v.total).toFixed(2)}</td>
                    <td style="color:#fca5a5; ${isRefunded ? 'text-decoration: line-through; opacity: 0.5;' : ''}">S/ ${Number(v.descuento).toFixed(2)}</td>
                    <td>${estadoHtml}</td>
                    <td>${accionHtml}</td>
                `;
                ventasList.appendChild(tr);
            });
        } catch (err) {
            console.error(err);
            ventasList.innerHTML = `<tr><td colspan="8" style="text-align:center; color: #fca5a5;">Error al cargar historial.</td></tr>`;
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
        if (!await customConfirm('¿Seguro que deseas reembolsar esta venta? El stock de los productos será devuelto al inventario.')) return;
        
        try {
            const { data: venta, error: fetchErr } = await supabase.from('ventas').select('*').eq('id', ventaId).single();
            if (fetchErr) throw fetchErr;

            if (venta.estado === 'reembolsada') {
                await customAlert('Esta venta ya ha sido reembolsada.', 'Aviso', 'ℹ️');
                return;
            }

            // Devolver stock
            if (venta.detalles && Array.isArray(venta.detalles)) {
                for (const item of venta.detalles) {
                    if (item.codigo && item.codigo.startsWith('COMBO:')) {
                        const parts = item.codigo.replace('COMBO:', '').split(',');
                        for (const part of parts) {
                            if (!part) continue;
                            const [idStr, qtyStr] = part.split('-');
                            const subId = parseInt(idStr);
                            const subQty = parseInt(qtyStr) * item.qty;
                            
                            const dbProd = state.globalProducts.find(p => p.id === subId);
                            if (dbProd && dbProd.stock !== null) {
                                await supabase.from('productos').update({ stock: dbProd.stock + subQty }).eq('id', subId);
                            }
                        }
                    } else {
                        const dbProd = state.globalProducts.find(p => p.id === item.id);
                        if (dbProd && dbProd.stock !== null) {
                            await supabase.from('productos').update({ stock: dbProd.stock + item.qty }).eq('id', item.id);
                        }
                    }
                }
            }

            const { error: updErr } = await supabase.from('ventas').update({ estado: 'reembolsada' }).eq('id', ventaId);
            if (updErr) throw updErr;

            await customAlert('Venta reembolsada con éxito.', '¡Éxito!', '✅');
            if (typeof onProductsChanged === 'function') {
                await onProductsChanged();
            }
            loadHistory();

        } catch (err) {
            console.error('Error al reembolsar:', err);
            await customAlert('No se pudo completar el reembolso. ' + err.message, 'Error', '⚠️');
        }
    }

    window.refundSale = refundSale;

    // Exportar Excel
    if (exportStatsBtn) {
        exportStatsBtn.addEventListener('click', async () => {
            if (!window.currentMonthVentas || window.currentMonthVentas.length === 0) {
                await customAlert('No hay datos para exportar en este mes.', 'Sin datos', 'ℹ️');
                return;
            }
            
            const inversionesStr = document.getElementById('statInversiones').textContent;
            const descuentosStr = document.getElementById('statDescuentos').textContent;
            const gananciaBrutaStr = document.getElementById('statGananciaBruta').textContent;
            const gananciaNetaStr = document.getElementById('statGananciaNeta').textContent;
            const mesInput = statsMonthInput ? statsMonthInput.value : 'Completo';

            let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="utf-8"></head>
            <body style="font-family: Arial, sans-serif;">
                <h2 style="color: #4f46e5; text-transform: uppercase;">Reporte Financiero Kalo - ${mesInput}</h2>
                
                <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px;">
                    <tr style="background-color: #10b981; color: white; font-size: 16px;">
                        <th colspan="2">RESUMEN DEL MES</th>
                    </tr>
                    <tr><td style="font-weight: bold; width: 200px;">Inversiones</td><td style="text-align: right;">${inversionesStr}</td></tr>
                    <tr><td style="font-weight: bold;">Descuentos</td><td style="text-align: right;">${descuentosStr}</td></tr>
                    <tr><td style="font-weight: bold;">Ganancia Bruta</td><td style="text-align: right;">${gananciaBrutaStr}</td></tr>
                    <tr style="background-color: #d1fae5;">
                        <td style="font-weight: bold; font-size: 16px;">GANANCIA NETA</td>
                        <td style="font-weight: bold; font-size: 16px; color: #047857; text-align: right;">${gananciaNetaStr}</td>
                    </tr>
                </table>

                <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
                    <tr style="background-color: #1e1b4b; color: white;">
                        <th>Fecha</th>
                        <th>Hora</th>
                        <th>Método</th>
                        <th>Productos</th>
                        <th>Subtotal</th>
                        <th>Descuento</th>
                        <th>Total Pagado</th>
                        <th style="background-color: #10b981; color: white;">Ganancia Neta</th>
                        <th>Estado</th>
                    </tr>
            `;

            window.currentMonthVentas.forEach(v => {
                const dateObj = new Date(v.fecha);
                const fechaStr = dateObj.toLocaleDateString();
                const horaStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                let productosStr = 'Sin detalles';
                if (v.detalles && Array.isArray(v.detalles)) {
                    productosStr = v.detalles.map(item => `${item.qty}x ${item.nombre}`).join('; ');
                }
                const ganancia = Number(v.total) - Number(v.costo_total);
                const isRefunded = v.estado === 'reembolsada';
                
                const rowBg = isRefunded ? 'background-color: #fee2e2;' : '';
                const strike = isRefunded ? 'text-decoration: line-through; color: #ef4444;' : '';
                const gananciaStyle = isRefunded ? strike : 'font-weight: bold; color: #047857;';

                html += `
                <tr style="${rowBg}">
                    <td style="${strike}">${fechaStr}</td>
                    <td style="${strike}">${horaStr}</td>
                    <td style="${strike}">${v.metodo_pago || 'Efectivo'}</td>
                    <td style="${strike}">${productosStr}</td>
                    <td style="${strike}">${Number(v.subtotal).toFixed(2)}</td>
                    <td style="${strike}">${Number(v.descuento).toFixed(2)}</td>
                    <td style="${strike}">${Number(v.total).toFixed(2)}</td>
                    <td style="${gananciaStyle}">${ganancia.toFixed(2)}</td>
                    <td style="${strike}">${v.estado || 'completada'}</td>
                </tr>`;
            });

            html += `</table></body></html>`;

            const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Reporte_Kalo_${mesInput}.xls`;
            link.click();
        });
    }

    return {
        calcularEstadisticas,
        loadHistory
    };
}
