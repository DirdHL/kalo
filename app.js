import { createClient } from '@supabase/supabase-js';

try {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    document.addEventListener('DOMContentLoaded', () => {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Nodos Principales
        const loginCard = document.getElementById('loginCard');
        const appView = document.getElementById('appView');
        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');
        const loginBtn = document.getElementById('loginBtn');
        const loginStatusMsg = document.getElementById('loginStatusMsg');
        const logoutBtn = document.getElementById('logoutBtn');
        const productList = document.getElementById('productList');

        // Navegación
        const navPosBtn = document.getElementById('navPosBtn');
        const navInvBtn = document.getElementById('navInvBtn');
        const posView = document.getElementById('posView');
        const inventoryView = document.getElementById('dashboardCard');

        // POS Elements
        const posGrid = document.getElementById('posGrid');
        const posSearch = document.getElementById('posSearch');
        const cartItemsContainer = document.getElementById('cartItems');
        const cartTotalValue = document.getElementById('cartTotalValue');
        const paymentMethod = document.getElementById('paymentMethod');
        const splitPaymentSection = document.getElementById('splitPaymentSection');
        const splitEfectivo = document.getElementById('splitEfectivo');
        const splitYape = document.getElementById('splitYape');
        const cobrarBtn = document.getElementById('cobrarBtn');
        const cartDiscount = document.getElementById('cartDiscount');

        let globalProducts = [];
        let cart = [];

        // Paginación y Búsqueda Inventario
        const invSearch = document.getElementById('invSearch');
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');
        const paginationInfo = document.getElementById('paginationInfo');
        
        let invCurrentPage = 1;
        const invItemsPerPage = 999999;
        let invFilteredProducts = [];

        // Nodos del Modal
        const productModal = document.getElementById('productModal');
        const openModalBtn = document.getElementById('openModalBtn');
        const closeModalBtn = document.getElementById('closeModalBtn');
        const productStatusMsg = document.getElementById('productStatusMsg');
        const addProductBtn = document.getElementById('addProductBtn');

        // Inputs del Formulario
        const productCodeInput = document.getElementById('productCode');
        const productNameInput = document.getElementById('productName');
        const categoriaInput = document.getElementById('categoria');
        const previewImg = document.getElementById('previewImg');
        const precioCompraInput = document.getElementById('precioCompra');
        const precioVentaInput = document.getElementById('precioVenta');
        const gananciaInput = document.getElementById('ganancia');
        const stockInput = document.getElementById('stock');
        const alertaStockInput = document.getElementById('alertaStock');

        // Nodos Modal Imagen
        const imagePickerModal = document.getElementById('imagePickerModal');
        const openImagePickerBtn = document.getElementById('openImagePickerBtn');
        const closeImagePickerBtn = document.getElementById('closeImagePickerBtn');
        const imageGrid = document.getElementById('imageGrid');

        let selectedImageName = ''; // Guardará el nombre del archivo
        let editingProductId = null; // ID del producto al editar

        // Aquí pones exactamente los nombres de las fotos que vayas metiendo a la carpeta
        const availableImages = [
            'AGUA_SAN_CARLOS_500ML.svg',
            'Agua_Loa_1L_chupon.svg',
            'Agua_Loa_3L.svg',
            'Agua_Loa_625ml.svg',
            'Agua_cielo_2.5_litros_Sin_Gas.svg',
            'Agua_cielo_625ml_Sin_Gas.svg',
            'Agua_cielo_chupon_1lt_Sin_Gas.svg',
            'Agua_san_luis_750ml.svg',
            'Agua_san_luis_limón_625ml.svg',
            'Agua_san_mateo_600ml.svg',
            'Animalito_san_jorge_60gr.svg',
            'BOMBONE_ D\'ONOFRIO.svg',
            'Blackout_60gr.svg',
            'CANCUN.svg',
            'CEREAL_FRUIT.svg',
            'CHIPS_AHOY_39GR.svg',
            'CHOCMAN_CHICO.svg',
            'CHOCODONUTS.svg',
            'CHOCOLATE_TRIANGULO.svg',
            'CIELO_LIMON_500ML.svg',
            'CIELO_MARACUYA.svg',
            'CIELO_NARANJA.svg',
            'CLUB_SOCIAL.svg',
            'CREMA_VOLTEADA.svg',
            'Casino_Vainilla_43gr.svg',
            'Casino_chocolate_43gr.svg',
            'Casino_fresa_43gr.svg',
            'Casino_menta_43gr.svg',
            'Cerveza_lata_473ml.svg',
            'Cerveza_pilsen_630ml.svg',
            'Cerveza_trigo_620ml.svg',
            'Cheesetris_39gr.svg',
            'Cheetos_de_queso_26gr.svg',
            'Cheetos_picante_34gr.svg',
            'Chiclets_adams_28gr.svg',
            'Chifles_karinto_34gr.svg',
            'Chizito_raton_39gr.svg',
            'Chocochips_costa_34gr.svg',
            'Chocosoda_36gr.svg',
            'Chupetin_globo_pop.svg',
            'Cifrut_de_naranja_350ml.svg',
            'Cifrut_granadilla_350ml.svg',
            'Cigarro_lucky_red_mix.svg',
            'Coca_cola_3_litros.svg',
            'Coca_cola_600ml.svg',
            'Coca_cola_un_Litro_y_medio.svg',
            'Concordia_naranja_355ml.svg',
            'Cuate_picante_42gr.svg',
            'Cuate_sin_picar_43g.svg',
            'Doritos_fuego_45gr.svg',
            'Doritos_natural_45gr.svg',
            'Doña_pepa_23gr.svg',
            'EMPANADA_CARNE.svg',
            'EMPANADA_POLLO.svg',
            'FANTA_ROJA_500ML.svg',
            'FRANC_VAINILLA.svg',
            'Frugos_del_valle_235ml.svg',
            'Fruna.svg',
            'GATORADE_1_LT.svg',
            'GATORADE_APPLE_ICE_500ML.svg',
            'GATORADE_BLUE.svg',
            'GATORADE_TROPICAL_500ML.svg',
            'GELATINAS_VASO.svg',
            'GLACITA_CHOCOLATE.svg',
            'GLACITA_CHOCONIEVE.svg',
            'Gatorade_mandarina_500ml.svg',
            'Guarana_450ml.svg',
            'HELADO_SIN_PARAR.svg',
            'Hallas_barra_limon.svg',
            'Halls_Blueberry.svg',
            'Halls_barra_azul.svg',
            'Halls_barra_negro.svg',
            'Halls_barra_verde.svg',
            'Halls_caramelo.svg',
            'Inka_cola_3_litros.svg',
            'Inka_cola_600ml.svg',
            'Inka_kola_1_litro_y_medio.svg',
            'KEKE_MARMOLEADO.svg',
            'KOLA_REAL.svg',
            'LENTEJITAS_SOBRE.svg',
            'LOA_LIMON_500ML.svg',
            'LOA_LIMON_600ML.svg',
            'MIKE_SURTIDO.svg',
            'MINI_DOÑA_PEPA.svg',
            'MINI_GELATINA_GRANEL.svg',
            'MINI_MOROCHAS.svg',
            'Margarita_tubular.svg',
            'Morochas_clasica_30gr.svg',
            'Nick_chocolate_72g.svg',
            'Oreo_36gr.svg',
            'PAPA JALAPEÑO 135.svg',
            'PAPAS_INCA_CHIPS_33GR.svg',
            'PAPAS_LAYS_39g.svg',
            'PEPESI_LATA.svg',
            'PEPSI_335ML.svg',
            'PICARA_CHIPS.svg',
            'PICARA_MENTA.svg',
            'PILSEN_355ML_LATA.svg',
            'PILSEN_473ML_LATON.svg',
            'PISCANO_255ML.svg',
            'Papel_1_unidad.svg',
            'Picaras_38gr.svg',
            'Piqueo_mix_55gr.svg',
            'RIKYTOC_PAPAS.svg',
            'Rellenita_chocolate_36gr.svg',
            'Rellenita_coco_36gr.svg',
            'Rellenita_fresa_36gr.svg',
            'Rellenita_lucuma_36gr.svg',
            'Rellenita_menta_36gr.svg',
            'Ritz_taco_70gr.svg',
            'SPORADE_UVA.svg',
            'STRUDENT_DE_MANZANA.svg',
            'STRUDENT_PIÑA.svg',
            'Soda_san_jorge_40gr.svg',
            'Sporade_Mandarina_500ml.svg',
            'Sporade_tropical_1500ml.svg',
            'Sublime_clasico_26gr.svg',
            'Superglu.svg',
            'TAKIS.svg',
            'TORTA_HELADA.svg',
            'TORTEES_PICANTE.svg',
            'TORTESS_SIN_PICANTE.svg',
            'TRULULU.svg',
            'Tentacion_chocolate_43gr.svg',
            'Tentacion_coco_43gr.svg',
            'Tentacion_naranja_43gr.svg',
            'Tentacion_vainilla_43gr.svg',
            'Trident-fresa_8 punto_cinco_gr.svg',
            'Trident_fresh_herbal_ocho_punto_cinco_gr.svg',
            'Trident_hierba_buena_8g.svg',
            'Trident_menta_azul.svg',
            'Trident_sandia_8gr.svg',
            'Trident_tutti_frutti_8gr.svg',
            'Vainilla_field_37gr.svg',
            'Venditas_cureband_unidad.svg',
            'Volt_azul_330ml.svg',
            'YOGURT_BEBIBLE_180ML.svg',
            'bombones_donofrio.svg',
            'chicle_boogie.svg',
            'pepsi_450ml.svg',
            'trident_menta_8gr.svg',
            'trident_mora_ocho_punto_cinco_g.svg'
        ];

        // --- MANEJO DEL MODAL DE IMÁGENES ---
        openImagePickerBtn.addEventListener('click', () => {
            imagePickerModal.classList.remove('hidden');
            renderImageGrid();
        });

        closeImagePickerBtn.addEventListener('click', () => {
            imagePickerModal.classList.add('hidden');
        });

        function renderImageGrid(isCombo = false) {
            imageGrid.innerHTML = '';
            availableImages.forEach(imgName => {
                const div = document.createElement('div');
                div.className = 'image-option';

                const displayName = imgName.replace(/_/g, ' ').replace(/\.(svg|png|jpg)$/i, '');
                
                div.innerHTML = `
                    <img src="${import.meta.env.BASE_URL}img/${imgName}" alt="${imgName}" onerror="this.src='https://via.placeholder.com/100?text=Falta+Foto'">
                    <p>${displayName}</p>
                `;
                div.addEventListener('click', () => {
                    if (isCombo) {
                        comboSelectedImage = imgName;
                        comboPreviewImg.src = `${import.meta.env.BASE_URL}img/${imgName}`;
                    } else {
                        selectedImageName = imgName;
                        previewImg.src = `${import.meta.env.BASE_URL}img/${imgName}`;
                    }
                    imagePickerModal.classList.add('hidden');
                });
                imageGrid.appendChild(div);
            });
        }

        // --- MANEJO DEL MODAL DE PRODUCTO NORMAL ---
        openModalBtn.addEventListener('click', () => {
            productModal.classList.remove('hidden');
            productCodeInput.focus();
        });

        closeModalBtn.addEventListener('click', () => {
            productModal.classList.add('hidden');
            limpiarFormulario();
        });

        // --- MANEJO DEL MODAL DE COMBOS ---
        const openComboModalBtn = document.getElementById('openComboModalBtn');
        const closeComboModalBtn = document.getElementById('closeComboModalBtn');
        const comboModal = document.getElementById('comboModal');
        const comboNameInput = document.getElementById('comboNameInput');
        const comboPriceInput = document.getElementById('comboPriceInput');
        const comboPreviewImg = document.getElementById('comboPreviewImg');
        const openComboImagePickerBtn = document.getElementById('openComboImagePickerBtn');
        const comboProductList = document.getElementById('comboProductList');
        const saveComboBtn = document.getElementById('saveComboBtn');
        const comboStatusMsg = document.getElementById('comboStatusMsg');
        
        let comboSelectedImage = '';

        if (openComboModalBtn) {
            openComboModalBtn.addEventListener('click', () => {
                comboModal.classList.remove('hidden');
                comboNameInput.value = '';
                comboPriceInput.value = '';
                comboSelectedImage = '';
                comboPreviewImg.src = 'https://via.placeholder.com/50?text=Img';
                comboStatusMsg.textContent = '';
                
                comboProductList.innerHTML = '';
                const normalProducts = globalProducts.filter(p => p.categoria !== 'Combos');
                normalProducts.forEach(prod => {
                    const div = document.createElement('div');
                    div.style.display = 'flex';
                    div.style.justifyContent = 'space-between';
                    div.style.alignItems = 'center';
                    div.style.padding = '0.5rem';
                    div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    
                    div.innerHTML = `
                        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; flex: 1;">
                            <input type="checkbox" class="combo-checkbox" value="${prod.id}" style="width:16px; height:16px;">
                            ${prod.nombre} (Stock: ${prod.stock !== null ? prod.stock : '∞'})
                        </label>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">Cant:</span>
                            <input type="number" class="combo-qty-input styled-input" min="1" value="1" style="width:60px; padding:0.2rem; text-align: center;" disabled>
                        </div>
                    `;
                    
                    const checkbox = div.querySelector('.combo-checkbox');
                    const qtyInput = div.querySelector('.combo-qty-input');
                    
                    checkbox.addEventListener('change', () => {
                        qtyInput.disabled = !checkbox.checked;
                    });
                    
                    comboProductList.appendChild(div);
                });
            });
        }

        if (closeComboModalBtn) {
            closeComboModalBtn.addEventListener('click', () => {
                comboModal.classList.add('hidden');
            });
        }

        if (openComboImagePickerBtn) {
            openComboImagePickerBtn.addEventListener('click', () => {
                imagePickerModal.classList.remove('hidden');
                renderImageGrid(true);
            });
        }

        if (saveComboBtn) {
            saveComboBtn.addEventListener('click', async () => {
                const nombre = comboNameInput.value.trim();
                const precio = parseFloat(comboPriceInput.value);
                
                if (!nombre || isNaN(precio) || precio <= 0) {
                    comboStatusMsg.textContent = 'Ingresa un nombre y precio válido.';
                    return;
                }

                const checkboxes = comboProductList.querySelectorAll('.combo-checkbox:checked');
                if (checkboxes.length < 2) {
                    comboStatusMsg.textContent = 'Selecciona al menos 2 productos para armar el combo.';
                    return;
                }

                let comboCodeParts = [];
                checkboxes.forEach(cb => {
                    const qtyInput = cb.parentElement.nextElementSibling.querySelector('.combo-qty-input');
                    const qty = qtyInput.value || 1;
                    comboCodeParts.push(`${cb.value}-${qty}`);
                });
                const codigoEspecial = `COMBO:${comboCodeParts.join(',')}`;

                saveComboBtn.disabled = true;
                saveComboBtn.textContent = 'Guardando...';

                try {
                    const { error } = await supabase.from('productos').insert([{
                        nombre: nombre,
                        categoria: 'Combos',
                        precio_compra: 0,
                        precio_venta: precio,
                        stock: null,
                        alerta_stock: null,
                        codigo: codigoEspecial,
                        imagen: comboSelectedImage || null
                    }]);
                    
                    if (error) throw error;
                    
                    comboModal.classList.add('hidden');
                    await loadProducts();
                } catch (err) {
                    comboStatusMsg.textContent = 'Error: ' + err.message;
                } finally {
                    saveComboBtn.disabled = false;
                    saveComboBtn.textContent = 'Guardar Combo';
                }
            });
        }

        function limpiarFormulario() {
            editingProductId = null;
            document.querySelector('#productModal h2').textContent = 'Registrar Producto';
            addProductBtn.textContent = 'Guardar Producto';
            productCodeInput.value = '';
            productNameInput.value = '';
            categoriaInput.value = 'Bebidas';
            precioCompraInput.value = '';
            precioVentaInput.value = '';
            gananciaInput.value = '';
            stockInput.value = '';
            alertaStockInput.value = '';
            productStatusMsg.textContent = '';
            selectedImageName = '';
            previewImg.src = 'https://via.placeholder.com/50?text=Img';
        }

        function abrirModalEdicion(prod) {
            editingProductId = prod.id;
            document.querySelector('#productModal h2').textContent = 'Editar Producto ✏️';
            addProductBtn.textContent = 'Actualizar Producto';

            productCodeInput.value = prod.codigo || '';
            productNameInput.value = prod.nombre || '';
            categoriaInput.value = prod.categoria || 'Bebidas';
            precioCompraInput.value = prod.precio_compra || '';
            precioVentaInput.value = prod.precio_venta || '';
            stockInput.value = prod.stock !== null ? prod.stock : '';
            alertaStockInput.value = prod.alerta_stock !== null ? prod.alerta_stock : '';

            selectedImageName = prod.imagen || '';
            if (selectedImageName) {
                previewImg.src = `${import.meta.env.BASE_URL}img/${selectedImageName}`;
            } else {
                previewImg.src = 'https://via.placeholder.com/50?text=Img';
            }

            calcularGanancia();
            productModal.classList.remove('hidden');
        }

        // --- CÁLCULO DE GANANCIA EN TIEMPO REAL ---
        function calcularGanancia() {
            const compra = parseFloat(precioCompraInput.value) || 0;
            const venta = parseFloat(precioVentaInput.value) || 0;
            const ganancia = venta - compra;
            gananciaInput.value = ganancia > 0 ? `+ S/ ${ganancia.toFixed(2)}` : `S/ ${ganancia.toFixed(2)}`;
            if (ganancia <= 0 && venta > 0) gananciaInput.style.color = '#fca5a5';
            else gananciaInput.style.color = '#a7f3d0';
        }
        precioCompraInput.addEventListener('input', calcularGanancia);
        precioVentaInput.addEventListener('input', calcularGanancia);

        // Escuchar "Enter" en el código para saltar al nombre
        productCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                productNameInput.focus();
            }
        });

        // --- NAVEGACIÓN ---
        const navStatsBtn = document.getElementById('navStatsBtn');
        const statsView = document.getElementById('statsView');
        const passwordModal = document.getElementById('passwordModal');
        const statsPasswordInput = document.getElementById('statsPasswordInput');
        const submitPasswordBtn = document.getElementById('submitPasswordBtn');
        const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
        const passwordErrorMsg = document.getElementById('passwordErrorMsg');

        let statsUnlocked = false;

        navPosBtn.addEventListener('click', () => {
            navPosBtn.classList.add('active');
            navInvBtn.classList.remove('active');
            if (navStatsBtn) navStatsBtn.classList.remove('active');
            
            posView.classList.remove('hidden');
            inventoryView.classList.add('hidden');
            if (statsView) statsView.classList.add('hidden');
        });

        navInvBtn.addEventListener('click', () => {
            navInvBtn.classList.add('active');
            navPosBtn.classList.remove('active');
            if (navStatsBtn) navStatsBtn.classList.remove('active');
            
            inventoryView.classList.remove('hidden');
            posView.classList.add('hidden');
            if (statsView) statsView.classList.add('hidden');
        });

        if (navStatsBtn) {
            navStatsBtn.addEventListener('click', () => {
                if (statsUnlocked) {
                    showStatsView();
                } else {
                    passwordModal.classList.remove('hidden');
                    statsPasswordInput.value = '';
                    passwordErrorMsg.style.display = 'none';
                    statsPasswordInput.focus();
                }
            });
        }

        if (cancelPasswordBtn) {
            cancelPasswordBtn.addEventListener('click', () => {
                passwordModal.classList.add('hidden');
            });
        }

        if (submitPasswordBtn) {
            submitPasswordBtn.addEventListener('click', verificarPassword);
            statsPasswordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') verificarPassword();
            });
        }

        function verificarPassword() {
            if (statsPasswordInput.value === 'Reservasupabase') {
                statsUnlocked = true;
                passwordModal.classList.add('hidden');
                showStatsView();
            } else {
                passwordErrorMsg.style.display = 'block';
            }
        }

        function showStatsView() {
            navStatsBtn.classList.add('active');
            navPosBtn.classList.remove('active');
            navInvBtn.classList.remove('active');
            
            statsView.classList.remove('hidden');
            posView.classList.add('hidden');
            inventoryView.classList.add('hidden');
            
            calcularEstadisticas();
        }

        let salesChartInstance = null;

        async function calcularEstadisticas() {
            const monthInput = document.getElementById('statsMonth').value;
            
            let query = supabase.from('ventas').select('*').order('fecha', { ascending: true });
            
            if (monthInput) {
                const [y, m] = monthInput.split('-');
                const endOfMonth = new Date(y, m, 0); // 0th day of next month is last day of current month
                const lastDay = endOfMonth.getDate();
                query = query.gte('fecha', `${monthInput}-01T00:00:00.000Z`)
                             .lte('fecha', `${monthInput}-${lastDay}T23:59:59.999Z`);
            }

            try {
                const { data, error } = await query;
                if (error) {
                    if (error.code === '42P01') {
                        // La tabla no existe
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

                const ventasList = document.getElementById('ventasList');
                ventasList.innerHTML = '';
                
                const ventasPorDia = {};

                if (data.length === 0) {
                    renderEmptyStats();
                } else {
                    data.forEach(v => {
                        brutas += Number(v.subtotal) || 0;
                        descuentos += Number(v.descuento) || 0;
                        netas += Number(v.total) || 0;
                        costos += Number(v.costo_total) || 0;

                        // Historial tabla (orden inverso para tabla)
                        const tr = document.createElement('tr');
                        const dateObj = new Date(v.fecha);
                        const fechaStr = dateObj.toLocaleDateString();
                        const horaStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        
                        // Para grafico
                        const dateKey = fechaStr;
                        ventasPorDia[dateKey] = (ventasPorDia[dateKey] || 0) + (Number(v.total) || 0);

                        tr.innerHTML = `
                            <td>${fechaStr}</td>
                            <td>${horaStr}</td>
                            <td>${v.metodo_pago || 'Efectivo'}</td>
                            <td style="font-weight:bold;">S/ ${Number(v.total).toFixed(2)}</td>
                            <td style="color:#fca5a5;">S/ ${Number(v.descuento).toFixed(2)}</td>
                            <td style="color:#a7f3d0;">S/ ${(Number(v.total) - Number(v.costo_total)).toFixed(2)}</td>
                            <td><button class="secondary-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="alert('Detalles pronto disponibles')">Ver</button></td>
                        `;
                        ventasList.prepend(tr);
                    });
                }

                document.getElementById('statVentasBrutas').textContent = `S/ ${brutas.toFixed(2)}`;
                document.getElementById('statDescuentos').textContent = `S/ ${descuentos.toFixed(2)}`;
                document.getElementById('statVentasNetas').textContent = `S/ ${netas.toFixed(2)}`;
                document.getElementById('statBeneficioBruto').textContent = `S/ ${(netas - costos).toFixed(2)}`;
                
                renderChart(ventasPorDia);

            } catch (err) {
                console.error('Error al obtener estadísticas:', err);
                renderEmptyStats();
            }
        }

        function renderEmptyStats() {
            document.getElementById('statVentasBrutas').textContent = `S/ 0.00`;
            document.getElementById('statDescuentos').textContent = `S/ 0.00`;
            document.getElementById('statVentasNetas').textContent = `S/ 0.00`;
            document.getElementById('statBeneficioBruto').textContent = `S/ 0.00`;
            document.getElementById('ventasList').innerHTML = `<tr><td colspan="7" style="text-align:center; color: gray;">No hay ventas para mostrar. Asegúrate de crear la tabla "ventas" en Supabase.</td></tr>`;
            renderChart({});
        }

        function renderChart(dataObj) {
            const ctx = document.getElementById('salesChart').getContext('2d');
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

        const statsFilterBtn = document.getElementById('statsFilterBtn');
        if (statsFilterBtn) {
            statsFilterBtn.addEventListener('click', calcularEstadisticas);
        }

        const exportExcelBtn = document.getElementById('exportExcelBtn');
        if (exportExcelBtn) {
            exportExcelBtn.addEventListener('click', () => {
                let csv = 'Fecha,Hora,Metodo,Subtotal,Descuento,Total,Ganancia\n';
                const rows = document.querySelectorAll('#ventasList tr');
                rows.forEach(r => {
                    const cols = r.querySelectorAll('td');
                    if(cols.length > 1) {
                        const rowData = Array.from(cols).slice(0,6).map(c => c.textContent.replace('S/ ', '').trim());
                        csv += rowData.join(',') + '\n';
                    }
                });
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'Historial_Ventas_Kalo.csv';
                link.click();
            });
        }

        // --- AUTENTICACIÓN ---
        supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                loginCard.classList.add('hidden');
                appView.classList.remove('hidden');
                loadProducts();
            } else {
                appView.classList.add('hidden');
                loginCard.classList.remove('hidden');
                productList.innerHTML = '';
            }
        });

        loginBtn.addEventListener('click', async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            if (!email || !password) return (loginStatusMsg.textContent = 'Ingresa correo y contraseña.');

            try {
                loginBtn.textContent = 'Iniciando...';
                loginStatusMsg.textContent = '';
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } catch (error) {
                loginStatusMsg.textContent = 'Error: Credenciales inválidas.';
            } finally {
                loginBtn.textContent = 'Entrar';
            }
        });

        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut();
            emailInput.value = '';
            passwordInput.value = '';
            productList.innerHTML = '';
        });

        // --- CARGAR PRODUCTOS ---
        async function loadProducts() {
            try {
                const { data, error } = await supabase.from('productos').select('*').order('id', { ascending: false });
                if (error) throw error;

                // Limpiar guiones bajos de los nombres traídos de la base de datos
                const cleanedData = data.map(p => ({
                    ...p,
                    nombre: p.nombre ? p.nombre.replace(/_/g, ' ') : p.nombre
                }));

                if (cleanedData.length === 0) {
                    globalProducts = [];
                    invFilteredProducts = [];
                    renderInventoryTable();
                    renderPosGrid(globalProducts);
                    return;
                }

                globalProducts = cleanedData;
                invFilteredProducts = cleanedData;
                invCurrentPage = 1;
                renderInventoryTable();
                renderPosGrid(globalProducts);

            } catch (error) {
                productList.innerHTML = `<tr><td colspan="8" style="color:#fca5a5; text-align:center">Error al cargar: ${error.message}</td></tr>`;
            }
        }

        // --- RENDERIZAR TABLA DE INVENTARIO CON PAGINACIÓN ---
        function renderInventoryTable() {
            productList.innerHTML = '';
            
            if (invFilteredProducts.length === 0) {
                productList.innerHTML = '<tr><td colspan="8" style="text-align:center; color:gray">No hay productos registrados.</td></tr>';
                paginationInfo.textContent = 'Mostrando 0 productos';
                prevPageBtn.disabled = true;
                nextPageBtn.disabled = true;
                return;
            }

            const totalPages = Math.ceil(invFilteredProducts.length / invItemsPerPage);
            if (invCurrentPage > totalPages) invCurrentPage = totalPages;
            if (invCurrentPage < 1) invCurrentPage = 1;

            const startIndex = (invCurrentPage - 1) * invItemsPerPage;
            const endIndex = startIndex + invItemsPerPage;
            const currentData = invFilteredProducts.slice(startIndex, endIndex);

            currentData.forEach((prod, index) => {
                const tr = document.createElement('tr');

                // Alerta de inventario bajo
                let stockWarning = '';
                if (prod.stock !== null && prod.alerta_stock !== null && prod.stock <= prod.alerta_stock) {
                    tr.classList.add('warning-row');
                    stockWarning = ' <span title="¡Inventario Bajo!" style="color: #f59e0b;">⚠️</span>';
                }

                const delCol = prod.id !== undefined ? 'id' : 'nombre';
                const delVal = prod.id !== undefined ? prod.id : prod.nombre;
                const codigo = prod.codigo ? prod.codigo : '—';
                const pCompra = prod.precio_compra ? `S/ ${prod.precio_compra.toFixed(2)}` : '—';
                const pVenta = prod.precio_venta ? `S/ ${prod.precio_venta.toFixed(2)}` : '—';
                const pStock = prod.stock !== null ? prod.stock : '—';
                const cat = prod.categoria ? prod.categoria : '—';
                const imgSrc = prod.imagen ? `${import.meta.env.BASE_URL}img/${prod.imagen}` : 'https://via.placeholder.com/40?text=No+Img';

                tr.innerHTML = `
                    <td><img src="${imgSrc}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;" onerror="this.src='https://via.placeholder.com/40?text=?'"></td>
                    <td><code>${codigo}</code></td>
                    <td>${prod.nombre}</td>
                    <td>${cat}</td>
                    <td>${pCompra}</td>
                    <td><strong style="color: #a7f3d0">${pVenta}</strong></td>
                    <td>${pStock}${stockWarning}</td>
                    <td style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button class="edit-btn" style="background: transparent; border: none; cursor: pointer; font-size: 1.2rem; color: #60a5fa; transition: transform 0.2s;" title="Editar">✏️</button>
                        <button class="delete-btn" data-col="${delCol}" data-val="${delVal}" style="background: transparent; border: none; cursor: pointer; font-size: 1.2rem; color: #fca5a5; transition: transform 0.2s;" title="Eliminar">🗑️</button>
                    </td>
                `;
                productList.appendChild(tr);
            });

            // Listeners para editar
            document.querySelectorAll('.edit-btn').forEach((btn, index) => {
                btn.addEventListener('click', () => {
                    abrirModalEdicion(currentData[index]);
                });
            });

            // Listeners para eliminar
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const col = e.currentTarget.getAttribute('data-col');
                    const val = e.currentTarget.getAttribute('data-val');
                    if (confirm('¿Seguro que deseas eliminar este producto?')) {
                        try {
                            e.currentTarget.style.opacity = '0.5';
                            const { error } = await supabase.from('productos').delete().eq(col, val);
                            if (error) throw error;
                            await loadProducts();
                        } catch (error) {
                            alert('Error: ' + error.message);
                            await loadProducts();
                        }
                    }
                });
            });

            // Actualizar paginación visual
            paginationInfo.textContent = `Mostrando ${startIndex + 1} - ${Math.min(endIndex, invFilteredProducts.length)} de ${invFilteredProducts.length} productos`;
            prevPageBtn.disabled = invCurrentPage === 1;
            nextPageBtn.disabled = invCurrentPage === totalPages;
            prevPageBtn.style.opacity = prevPageBtn.disabled ? '0.5' : '1';
            nextPageBtn.style.opacity = nextPageBtn.disabled ? '0.5' : '1';
        }

        invSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            invFilteredProducts = globalProducts.filter(p => 
                p.nombre.toLowerCase().includes(term) || 
                (p.codigo && p.codigo.toLowerCase().includes(term)) ||
                (p.categoria && p.categoria.toLowerCase().includes(term))
            );
            invCurrentPage = 1;
            renderInventoryTable();
        });

        prevPageBtn.addEventListener('click', () => {
            if (invCurrentPage > 1) {
                invCurrentPage--;
                renderInventoryTable();
            }
        });

        nextPageBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(invFilteredProducts.length / invItemsPerPage);
            if (invCurrentPage < totalPages) {
                invCurrentPage++;
                renderInventoryTable();
            }
        });

        // --- LÓGICA DEL PUNTO DE VENTA (POS) ---
        let posCurrentPage = 1;
        const posItemsPerPage = 25;
        let posFilteredProducts = [];

        const posPrevPageBtn = document.getElementById('posPrevPageBtn');
        const posNextPageBtn = document.getElementById('posNextPageBtn');
        const posPaginationInfo = document.getElementById('posPaginationInfo');

        function renderPosGrid(productsToRender, resetPage = false) {
            if (resetPage) posCurrentPage = 1;
            posFilteredProducts = productsToRender;

            posGrid.innerHTML = '';
            const totalPages = Math.ceil(productsToRender.length / posItemsPerPage) || 1;
            const startIndex = (posCurrentPage - 1) * posItemsPerPage;
            const endIndex = startIndex + posItemsPerPage;
            const paginatedItems = productsToRender.slice(startIndex, endIndex);

            paginatedItems.forEach(prod => {
                const div = document.createElement('div');
                div.className = 'product-card';
                const imgSrc = prod.imagen ? `${import.meta.env.BASE_URL}img/${prod.imagen}` : 'https://via.placeholder.com/80?text=No+Img';
                const precio = prod.precio_venta ? `S/ ${prod.precio_venta.toFixed(2)}` : 'S/ 0.00';
                
                div.innerHTML = `
                    <img src="${imgSrc}" onerror="this.src='https://via.placeholder.com/80?text=?'">
                    <h3>${prod.nombre}</h3>
                    <p>${precio}</p>
                `;
                
                div.addEventListener('click', () => addToCart(prod));
                posGrid.appendChild(div);
            });

            if (posPaginationInfo) {
                posPaginationInfo.textContent = `Página ${posCurrentPage} de ${totalPages}`;
                posPrevPageBtn.disabled = posCurrentPage === 1;
                posNextPageBtn.disabled = posCurrentPage === totalPages;
                posPrevPageBtn.style.opacity = posPrevPageBtn.disabled ? '0.5' : '1';
                posNextPageBtn.style.opacity = posNextPageBtn.disabled ? '0.5' : '1';
            }
        }

        if (posPrevPageBtn) {
            posPrevPageBtn.addEventListener('click', () => {
                if (posCurrentPage > 1) {
                    posCurrentPage--;
                    renderPosGrid(posFilteredProducts);
                }
            });
        }
        if (posNextPageBtn) {
            posNextPageBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(posFilteredProducts.length / posItemsPerPage) || 1;
                if (posCurrentPage < totalPages) {
                    posCurrentPage++;
                    renderPosGrid(posFilteredProducts);
                }
            });
        }

        let posCurrentCategory = 'Todos';

        function filterPosProducts() {
            const term = posSearch.value.toLowerCase();
            const filtered = globalProducts.filter(p => {
                const matchSearch = p.nombre.toLowerCase().includes(term) || (p.codigo && p.codigo.toLowerCase().includes(term));
                const matchCat = posCurrentCategory === 'Todos' || p.categoria === posCurrentCategory;
                return matchSearch && matchCat;
            });
            renderPosGrid(filtered, true);
        }

        posSearch.addEventListener('input', (e) => {
            filterPosProducts();
        });

        const catBtns = document.querySelectorAll('.cat-filter-btn');
        catBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                catBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                posCurrentCategory = e.target.getAttribute('data-cat');
                filterPosProducts();
            });
        });

        // Soporte para Lector de Código de Barras en la barra de búsqueda
        posSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim().toLowerCase();
                if (!term) return;
                
                // Buscar coincidencia exacta por código de barras
                const exactMatch = globalProducts.find(p => p.codigo && p.codigo.toLowerCase() === term);
                
                if (exactMatch) {
                    addToCart(exactMatch);
                    e.target.value = ''; // Limpiar barra
                    renderPosGrid(globalProducts, true); // Restaurar cuadrícula
                } else {
                    // Si no hay match exacto de código, pero hay un solo resultado en la búsqueda
                    const filtered = globalProducts.filter(p => 
                        p.nombre.toLowerCase().includes(term) || 
                        (p.codigo && p.codigo.toLowerCase().includes(term))
                    );
                    if (filtered.length === 1) {
                        addToCart(filtered[0]);
                        e.target.value = '';
                        renderPosGrid(globalProducts, true);
                    }
                }
            }
        });

        function addToCart(prod) {
            const existing = cart.find(item => item.id === prod.id);
            if (existing) {
                existing.qty++;
            } else {
                cart.push({ ...prod, qty: 1 });
            }
            renderCart();
        }

        cartDiscount.addEventListener('input', () => {
            // Si el usuario edita el descuento manualmente, quitamos la selección de los botones
            discountBtns.forEach(b => b.classList.remove('active-discount'));
            renderCart();
        });

        const discountBtns = document.querySelectorAll('.discount-btn');
        discountBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const isAlreadyActive = e.target.classList.contains('active-discount');
                
                // Quitar clase a todos
                discountBtns.forEach(b => b.classList.remove('active-discount'));
                
                if (isAlreadyActive) {
                    // Si ya estaba activo, lo desactivamos y quitamos el descuento
                    cartDiscount.value = '';
                    renderCart();
                    return;
                }

                // Si no estaba activo, lo activamos
                e.target.classList.add('active-discount');

                const percent = parseInt(e.target.getAttribute('data-percent'), 10);
                let subtotal = 0;
                cart.forEach(item => subtotal += (item.precio_venta || 0) * item.qty);
                
                if (subtotal > 0) {
                    const discountAmount = (subtotal * (percent / 100)).toFixed(2);
                    cartDiscount.value = discountAmount;
                    renderCart();
                } else {
                    cartDiscount.value = '';
                    e.target.classList.remove('active-discount');
                    renderCart();
                }
            });
        });

        function renderCart() {
            cartItemsContainer.innerHTML = '';
            let subtotal = 0;
            cart.forEach((item, index) => {
                const itemTotal = (item.precio_venta || 0) * item.qty;
                subtotal += itemTotal;
                
                const div = document.createElement('div');
                div.className = 'cart-item';
                div.innerHTML = `
                    <div class="cart-item-info">
                        <p class="cart-item-title">${item.nombre}</p>
                        <p class="cart-item-price">S/ ${(item.precio_venta || 0).toFixed(2)} x ${item.qty}</p>
                    </div>
                    <div class="cart-item-qty">
                        <button class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
                        <span>${item.qty}</span>
                        <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
                    </div>
                `;
                cartItemsContainer.appendChild(div);
            });

            const discount = parseFloat(cartDiscount.value) || 0;
            const total = Math.max(0, subtotal - discount);
            cartTotalValue.textContent = `S/ ${total.toFixed(2)}`;
        }

        window.updateQty = (index, delta) => {
            cart[index].qty += delta;
            if (cart[index].qty <= 0) {
                cart.splice(index, 1);
            }
            renderCart();
        };

        paymentMethod.addEventListener('change', (e) => {
            if (e.target.value === 'Ambos') {
                splitPaymentSection.classList.remove('hidden');
                splitEfectivo.value = '';
                splitYape.value = '';
            } else {
                splitPaymentSection.classList.add('hidden');
            }
        });

        cobrarBtn.addEventListener('click', async () => {
            if (cart.length === 0) return alert('El ticket está vacío.');
            
            let subtotal = 0;
            cart.forEach(item => subtotal += (item.precio_venta || 0) * item.qty);
            
            const discount = parseFloat(cartDiscount.value) || 0;
            const total = Math.max(0, subtotal - discount);

            const metodo = paymentMethod.value;
            let msg = `¡Venta realizada con éxito!\nTotal cobrado: S/ ${total.toFixed(2)}\nMétodo de pago: ${metodo}`;
            
            if (discount > 0) {
                msg += `\n(Descuento aplicado: S/ ${discount.toFixed(2)})`;
            }

            if (metodo === 'Ambos') {
                const ef = parseFloat(splitEfectivo.value) || 0;
                const yp = parseFloat(splitYape.value) || 0;
                
                if (Math.abs((ef + yp) - total) > 0.01) {
                    return alert(`Los montos divididos (S/ ${(ef + yp).toFixed(2)}) no coinciden con el total a pagar (S/ ${total.toFixed(2)}).`);
                }
                
                msg += `\nEfectivo: S/ ${ef.toFixed(2)}\nYape: S/ ${yp.toFixed(2)}`;
            }

            // Descontar stock en Supabase
            try {
                cobrarBtn.disabled = true;
                cobrarBtn.textContent = 'Procesando...';

                // Agrupar descuentos necesarios
                const stockUpdates = {};
                for (const item of cart) {
                    if (item.codigo && item.codigo.startsWith('COMBO:')) {
                        const parts = item.codigo.replace('COMBO:', '').split(',');
                        for (const part of parts) {
                            if (!part) continue;
                            const [idStr, qtyStr] = part.split('-');
                            const subId = parseInt(idStr);
                            const subQty = parseInt(qtyStr) * item.qty;
                            stockUpdates[subId] = (stockUpdates[subId] || 0) + subQty;
                        }
                    } else {
                        stockUpdates[item.id] = (stockUpdates[item.id] || 0) + item.qty;
                    }
                }

                let costoTotalVenta = 0;

                // Ejecutar actualizaciones
                for (const [idStr, qtyToDeduct] of Object.entries(stockUpdates)) {
                    const prodId = parseInt(idStr);
                    const dbProd = globalProducts.find(p => p.id === prodId);
                    if (dbProd) {
                        costoTotalVenta += (parseFloat(dbProd.precio_compra) || 0) * qtyToDeduct;
                        if (dbProd.stock !== null) {
                            const newStock = Math.max(0, dbProd.stock - qtyToDeduct);
                            await supabase.from('productos').update({ stock: newStock }).eq('id', prodId);
                        }
                    }
                }
                
                // Guardar la venta en la tabla 'ventas'
                try {
                    await supabase.from('ventas').insert([{
                        subtotal: subtotal,
                        descuento: discount,
                        total: total,
                        metodo_pago: metodo,
                        efectivo: metodo === 'Ambos' ? parseFloat(splitEfectivo.value) || 0 : (metodo === 'Efectivo' ? total : 0),
                        yape: metodo === 'Ambos' ? parseFloat(splitYape.value) || 0 : (metodo === 'Yape' ? total : 0),
                        costo_total: costoTotalVenta,
                        detalles: cart
                    }]);
                } catch(e) {
                    console.error("Error al registrar venta (quizas no existe la tabla): ", e);
                }

                await loadProducts(); // Recargar inventario visual
                alert(msg);
                
                cart = [];
                cartDiscount.value = '';
                discountBtns.forEach(b => b.classList.remove('active-discount'));
                renderCart();
                paymentMethod.value = 'Efectivo';
                splitPaymentSection.classList.add('hidden');
                
            } catch (err) {
                alert('Error al procesar la venta: ' + err.message);
            } finally {
                cobrarBtn.disabled = false;
                cobrarBtn.textContent = 'Cobrar';
            }
        });

        // --- AGREGAR PRODUCTO ---
        addProductBtn.addEventListener('click', async () => {
            const productCode = productCodeInput.value.trim();
            const productName = productNameInput.value.trim();
            const pCompra = parseFloat(precioCompraInput.value) || null;
            const pVenta = parseFloat(precioVentaInput.value) || null;
            const stock = parseInt(stockInput.value) || null;
            const alerta = parseInt(alertaStockInput.value) || null;
            const cat = categoriaInput.value;

            if (!productName) {
                productStatusMsg.textContent = 'El nombre del producto es obligatorio.';
                return;
            }

            try {
                addProductBtn.textContent = 'Guardando...';

                const payload = {
                    codigo: productCode || null,
                    nombre: productName,
                    categoria: cat,
                    imagen: selectedImageName || null,
                    precio_compra: pCompra,
                    precio_venta: pVenta,
                    stock: stock,
                    alerta_stock: alerta
                };

                let res;
                if (editingProductId) {
                    res = await supabase.from('productos').update(payload).eq('id', editingProductId);
                } else {
                    res = await supabase.from('productos').insert([payload]);
                }

                if (res.error) throw res.error;

                productStatusMsg.style.color = '#86efac';
                productStatusMsg.textContent = editingProductId ? '¡Producto actualizado exitosamente!' : '¡Producto guardado exitosamente!';

                await loadProducts();

                // Cerrar modal automáticamente después de un segundo
                setTimeout(() => {
                    productModal.classList.add('hidden');
                    limpiarFormulario();
                }, 1000);

            } catch (error) {
                productStatusMsg.style.color = '#fca5a5';
                productStatusMsg.textContent = 'Error: ' + error.message;
            } finally {
                addProductBtn.textContent = editingProductId ? 'Actualizar Producto' : 'Guardar Producto';
            }
        });
        // --- LECTOR DE CÓDIGO DE BARRAS GLOBAL ---
        let barcodeBuffer = '';
        let barcodeTimeout = null;

        document.addEventListener('keydown', (e) => {
            // Ignorar si el usuario está tipeando activamente en cualquier campo de texto
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                return;
            }

            // Un lector envía teclas súper rápido (ej. 10ms-20ms).
            // Si hay una pausa mayor a 50ms, limpiamos el buffer.
            if (barcodeTimeout) {
                clearTimeout(barcodeTimeout);
            }

            barcodeTimeout = setTimeout(() => {
                barcodeBuffer = '';
            }, 50);

            if (e.key === 'Enter') {
                e.preventDefault();
                if (barcodeBuffer.trim().length > 0) {
                    const scannedCode = barcodeBuffer.trim().toLowerCase();
                    const match = globalProducts.find(p => p.codigo && p.codigo.toLowerCase() === scannedCode);
                    
                    if (match) {
                        // Cambiamos automáticamente a la vista de Punto de Venta si estamos en inventario
                        if (!navPosBtn.classList.contains('active')) {
                            navPosBtn.click();
                        }
                        addToCart(match);
                    } else {
                        // Notificación visual rápida en el carrito
                        const prevColor = cartTotalValue.style.color;
                        cartTotalValue.style.color = '#fca5a5';
                        cartTotalValue.textContent = '❌ No found';
                        setTimeout(() => {
                            cartTotalValue.style.color = prevColor;
                            renderCart();
                        }, 1000);
                    }
                    barcodeBuffer = '';
                }
            } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                barcodeBuffer += e.key;
            }
        });

    });

} catch (error) {
    console.error("Error crítico:", error);
}
