import { createClient } from '@supabase/supabase-js';
console.log(">>> APP.JS EST CARGANDO CORRECTAMENTE (NUEVA VERSIN)");


try {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    document.addEventListener('DOMContentLoaded', () => {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // --- MANEJO DE ALERTAS PERSONALIZADAS ---
        window.customAlert = function(msg, title = "Atencin", icon = "") {
            return new Promise((resolve) => {
                const overlay = document.getElementById('customDialogOverlay');
                document.getElementById('customDialogTitle').textContent = title;
                document.getElementById('customDialogMessage').textContent = msg;
                document.getElementById('customDialogIcon').textContent = icon;
                
                const btnCancel = document.getElementById('customDialogCancel');
                const btnOk = document.getElementById('customDialogOk');
                
                btnCancel.classList.add('hidden');
                btnOk.textContent = 'Aceptar';
                overlay.classList.remove('hidden');
                
                btnOk.onclick = () => {
                    overlay.classList.add('hidden');
                    resolve();
                };
            });
        };

        window.customConfirm = function(msg, title = "Confirmar", icon = "?") {
            return new Promise((resolve) => {
                const overlay = document.getElementById('customDialogOverlay');
                document.getElementById('customDialogTitle').textContent = title;
                document.getElementById('customDialogMessage').textContent = msg;
                document.getElementById('customDialogIcon').textContent = icon;
                
                const btnCancel = document.getElementById('customDialogCancel');
                const btnOk = document.getElementById('customDialogOk');
                
                btnCancel.classList.remove('hidden');
                btnOk.textContent = 'S, continuar';
                overlay.classList.remove('hidden');
                
                btnCancel.onclick = () => {
                    overlay.classList.add('hidden');
                    resolve(false);
                };
                
                btnOk.onclick = () => {
                    overlay.classList.add('hidden');
                    resolve(true);
                };
            });
        };

        // Nodos Principales
        const loginCard = document.getElementById('loginCard');
        const appView = document.getElementById('appView');
        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');
        const loginBtn = document.getElementById('loginBtn');
        const loginStatusMsg = document.getElementById('loginStatusMsg');
        const logoutBtn = document.getElementById('logoutBtn');
        const productList = document.getElementById('productList');

        // Navegacin
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

        // Paginacin y Bsqueda Inventario
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

        let selectedImageName = ''; // Guardar el nombre del archivo
        let editingProductId = null; // ID del producto al editar

        // Aqu pones exactamente los nombres de las fotos que vayas metiendo a la carpeta
        const availableImages = [
            'AGUA_SAN_CARLOS_500ML.svg',
            'Agua_Loa_1L_chupon.svg',
            'Agua_Loa_3L.svg',
            'Agua_Loa_625ml.svg',
            'Agua_cielo_2.5_litros_Sin_Gas.svg',
            'Agua_cielo_625ml_Sin_Gas.svg',
            'Agua_cielo_chupon_1lt_Sin_Gas.svg',
            'Agua_san_luis_750ml.svg',
            'Agua_san_luis_limn_625ml.svg',
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
            'Doa_pepa_23gr.svg',
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
            'MINI_DOA_PEPA.svg',
            'MINI_GELATINA_GRANEL.svg',
            'MINI_MOROCHAS.svg',
            'Margarita_tubular.svg',
            'Morochas_clasica_30gr.svg',
            'Nick_chocolate_72g.svg',
            'Oreo_36gr.svg',
            'PAPA JALAPEO 135.svg',
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
            'STRUDENT_PIA.svg',
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

        // --- MANEJO DEL MODAL DE IMGENES ---
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
                    <img src="./img/${imgName}" alt="${imgName}" onerror="this.onerror=null; this.src='./kalo-logo.png'">
                    <p>${displayName}</p>
                `;
                div.addEventListener('click', () => {
                    if (isCombo) {
                        comboSelectedImage = imgName;
                        comboPreviewImg.src = `./img/${imgName}`;
                    } else {
                        selectedImageName = imgName;
                        previewImg.src = `./img/${imgName}`;
                    }
                    imagePickerModal.classList.add('hidden');
                });
                imageGrid.appendChild(div);
            });
        }

        // --- MANEJO DEL MODAL DE PRODUCTO NORMAL ---
        openModalBtn.addEventListener('click', () => {
              limpiarFormulario();
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
                comboPreviewImg.src = './kalo-logo.png';
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
                            ${prod.nombre} (Stock: ${prod.stock !== null ? prod.stock : ''})
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
                    comboStatusMsg.textContent = 'Ingresa un nombre y precio vlido.';
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
                        imagen: comboSelectedImage || null,
                        local: currentLocal
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

        // --- MANEJO DE LOTES Y VENCIMIENTOS ---
        let currentLotes = [];
        const lotesList = document.getElementById('lotesList');
        const loteQtyInput = document.getElementById('loteQtyInput');
        const loteExpInput = document.getElementById('loteExpInput');
        const addLoteBtn = document.getElementById('addLoteBtn');
        const calculatedStockText = document.getElementById('calculatedStock');

        function renderLotes() {
            if (!lotesList) return;
            lotesList.innerHTML = '';
            let totalStock = 0;
            
            if (currentLotes.length === 0) {
                lotesList.innerHTML = '<span style="color: gray;">Sin lotes. Stock ser infinito o manual.</span>';
                if(calculatedStockText) calculatedStockText.textContent = stockInput ? (stockInput.value || '0') : '0';
                return;
            }

            // sort currentLotes by expiration
            currentLotes.sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));

            currentLotes.forEach((lote, index) => {
                totalStock += parseInt(lote.qty) || 0;
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                div.style.padding = '0.2rem 0';
                
                const expDate = new Date(lote.vencimiento);
                const today = new Date();
                today.setHours(0,0,0,0);
                
                const isExpired = expDate < today;
                const thirtyDaysLater = new Date(today);
                thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
                const isNear = !isExpired && expDate <= thirtyDaysLater;
                
                let color = 'var(--text-primary)';
                if (isExpired) color = '#ef4444'; // rojo
                else if (isNear) color = '#f59e0b'; // naranja

                div.innerHTML = `
                    <span style="color: ${color}">Cant: ${lote.qty} | Vence: ${lote.vencimiento}</span>
                    <button type="button" class="secondary-btn" style="padding: 0 0.5rem; border-color: #ef4444; color: #ef4444;" onclick="removeLote(${index})">x</button>
                `;
                lotesList.appendChild(div);
            });
            
            if(calculatedStockText) calculatedStockText.textContent = totalStock;
            if(stockInput) stockInput.value = totalStock;
        }

        window.removeLote = (index) => {
            currentLotes.splice(index, 1);
            renderLotes();
        };

        if (addLoteBtn) {
            addLoteBtn.addEventListener('click', () => {
                const qty = parseInt(loteQtyInput.value);
                const exp = loteExpInput.value;
                if (!qty || qty <= 0 || !exp) {
                    customAlert('Ingresa cantidad vlida y fecha de vencimiento.', 'Datos Invlidos', '');
                    return;
                }
                
                currentLotes.push({ qty, vencimiento: exp });
                loteQtyInput.value = '';
                loteExpInput.value = '';
                renderLotes();
            });
        }

        function limpiarFormulario() {
            editingProductId = null;
            const mh2 = document.querySelector('#productModal h2'); if(mh2) mh2.textContent = 'Registrar Producto';
            if(addProductBtn) addProductBtn.textContent = 'Guardar Producto';
            productCodeInput.value = '';
            productNameInput.value = '';
            categoriaInput.value = 'Bebidas';
            precioCompraInput.value = '';
            precioVentaInput.value = '';
            gananciaInput.value = '';
            stockInput.value = '';
            alertaStockInput.value = '';
            if(productStatusMsg) productStatusMsg.textContent = '';
            selectedImageName = '';
            previewImg.src = './kalo-logo.png';
            currentLotes = [];
            if(loteQtyInput) loteQtyInput.value = '';
            if(loteExpInput) loteExpInput.value = '';
            renderLotes();
        }

        function abrirModalEdicion(prod) {
            limpiarFormulario();
            editingProductId = prod.id;
            const mh2 = document.querySelector('#productModal h2'); if(mh2) mh2.textContent = 'Editar Producto ';
            if(addProductBtn) addProductBtn.textContent = 'Actualizar Producto';

            productCodeInput.value = prod.codigo || '';
            productNameInput.value = prod.nombre || '';
            categoriaInput.value = prod.categoria || 'Bebidas';
            precioCompraInput.value = prod.precio_compra || '';
            precioVentaInput.value = prod.precio_venta || '';
            stockInput.value = prod.stock !== null ? prod.stock : '';
            alertaStockInput.value = prod.alerta_stock !== null ? prod.alerta_stock : '';
            currentLotes = prod.lotes ? [...prod.lotes] : [];
            renderLotes();

            selectedImageName = prod.imagen || '';
            if (selectedImageName) {
                previewImg.src = `./img/${selectedImageName}`;
            } else {
                previewImg.src = './kalo-logo.png';
            }

            calcularGanancia();
            productModal.classList.remove('hidden');
        }

        // --- CLCULO DE GANANCIA EN TIEMPO REAL ---
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

        // Escuchar "Enter" en el cdigo para saltar al nombre
        productCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                productNameInput.focus();
            }
        });

        // --- NAVEGACIN Y MULTI-LOCAL ---
        // --- NAVEGACIN Y MULTI-LOCAL ---
        let currentLocal = 'LAS BRISAS';
        const pathURL = window.location.pathname.toLowerCase();
        if (pathURL.includes('brisas')) currentLocal = 'LAS BRISAS';
        else if (pathURL.includes('pinos')) currentLocal = 'LOS PINOS';
        else if (pathURL.includes('polideportivo')) currentLocal = 'EL POLIDEPORTIVO';

        const localLabel = document.getElementById('localLabel');
        if (localLabel) {
            if (currentLocal === 'LAS BRISAS') localLabel.innerHTML = ' Las Brisas';
            else if (currentLocal === 'LOS PINOS') localLabel.innerHTML = ' Los Pinos';
            else if (currentLocal === 'EL POLIDEPORTIVO') localLabel.innerHTML = ' El Polideportivo';
        }

        const navStatsBtn = document.getElementById('navStatsBtn');
        const statsView = document.getElementById('statsView');
        const passwordModal = document.getElementById('passwordModal');
        const statsPasswordInput = document.getElementById('statsPasswordInput');
        const submitPasswordBtn = document.getElementById('submitPasswordBtn');
        const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
        const passwordErrorMsg = document.getElementById('passwordErrorMsg');

        const navHistoryBtn = document.getElementById('navHistoryBtn');
        const historyView = document.getElementById('historyView');

        let statsUnlocked = localStorage.getItem('statsUnlocked') === 'true';

        function hideAllViews() {
            posView.classList.add('hidden');
            inventoryView.classList.add('hidden');
            if (statsView) statsView.classList.add('hidden');
            if (historyView) historyView.classList.add('hidden');
            const alertsView = document.getElementById('alertsView');
            if (alertsView) alertsView.classList.add('hidden');
            
            navPosBtn.classList.remove('active');
            navInvBtn.classList.remove('active');
            if (navStatsBtn) navStatsBtn.classList.remove('active');
            if (navHistoryBtn) navHistoryBtn.classList.remove('active');
            const navAlertsBtn = document.getElementById('navAlertsBtn');
            if (navAlertsBtn) navAlertsBtn.classList.remove('active');
        }

        navPosBtn.addEventListener('click', () => {
            hideAllViews();
            navPosBtn.classList.add('active');
            posView.classList.remove('hidden');
        });

        navInvBtn.addEventListener('click', () => {
            hideAllViews();
            navInvBtn.classList.add('active');
            inventoryView.classList.remove('hidden');
        });

        if (navHistoryBtn) {
            navHistoryBtn.addEventListener('click', () => {
                hideAllViews();
                navHistoryBtn.classList.add('active');
                historyView.classList.remove('hidden');
                loadHistory();
            });
        }

        const navAlertsBtn = document.getElementById('navAlertsBtn');
        const alertsView = document.getElementById('alertsView');
        if (navAlertsBtn) {
            navAlertsBtn.addEventListener('click', () => {
                hideAllViews();
                navAlertsBtn.classList.add('active');
                if(alertsView) alertsView.classList.remove('hidden');
            });
        }

        const adminEmails = ['zzenisx1234@gmail.com', 'nuevohorizonte@gmail.com'];
        if (navStatsBtn) {
            navStatsBtn.addEventListener('click', async () => {
                if (currentUserEmail && adminEmails.includes(currentUserEmail)) {
                    showStatsView();
                } else {
                    await customAlert('Acceso Denegado. Solo administradores pueden ver esta seccin.', 'Acceso Restringido', '');
                }
            });
        }
        
        function showStatsView() {
            hideAllViews();
            navStatsBtn.classList.add('active');
            statsView.classList.remove('hidden');
            calcularEstadisticas();
        }

        let salesChartInstance = null;

        async function calcularEstadisticas() {
            const monthInput = document.getElementById('statsMonth').value;
            
            let query = supabase.from('ventas').select('*').eq('local', currentLocal).order('fecha', { ascending: true });
            
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
                        console.warn('La tabla ventas no existe todava.');
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

                // Mostrar 'netas' como Ingresos Totales (el dinero real que entr a caja tras descuentos)
                document.getElementById('statVentasBrutas').textContent = `S/ ${netas.toFixed(2)}`;
                document.getElementById('statReembolsos').textContent = `S/ ${reembolsos.toFixed(2)}`;
                document.getElementById('statDescuentos').textContent = `S/ ${descuentos.toFixed(2)}`;
                document.getElementById('statBeneficioBruto').textContent = `S/ ${(netas - costos).toFixed(2)}`;
                
                renderChart(ventasPorDia);

            } catch (err) {
                console.error('Error al obtener estadsticas:', err);
                renderEmptyStats();
            }
        }

        window.refundSale = async (ventaId) => {
            if (!await customConfirm('Seguro que deseas reembolsar esta venta? El stock de los productos ser devuelto al inventario.')) return;
            
            try {
                // Obtener detalles de la venta
                const { data: venta, error: fetchErr } = await supabase.from('ventas').select('*').eq('id', ventaId).single();
                if (fetchErr) throw fetchErr;

                if (venta.estado === 'reembolsada') {
                    await customAlert('Esta venta ya ha sido reembolsada.', 'Aviso', '');
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
                                
                                const dbProd = globalProducts.find(p => p.id === subId);
                                if (dbProd && dbProd.stock !== null) {
                                    await supabase.from('productos').update({ stock: dbProd.stock + subQty }).eq('id', subId);
                                }
                            }
                        } else {
                            const dbProd = globalProducts.find(p => p.id === item.id);
                            if (dbProd && dbProd.stock !== null) {
                                await supabase.from('productos').update({ stock: dbProd.stock + item.qty }).eq('id', item.id);
                            }
                        }
                    }
                }

                // Marcar como reembolsada
                const { error: updErr } = await supabase.from('ventas').update({ estado: 'reembolsada' }).eq('id', ventaId);
                if (updErr) throw updErr;

                await customAlert('Venta reembolsada con xito.', 'xito!', '');
                await loadProducts(); // recargar stock
                loadHistory(); // recargar historial

            } catch (err) {
                console.error('Error al reembolsar:', err);
                await customAlert('No se pudo completar el reembolso. ' + err.message, 'Error', '');
            }
        };

        async function loadHistory() {
            const ventasList = document.getElementById('ventasList');
            ventasList.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando...</td></tr>';
            
            try {
                // Cargar ultimas 100 ventas
                const { data, error } = await supabase.from('ventas').select('*').eq('local', currentLocal).order('fecha', { ascending: false }).limit(100);
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
                        : `<button class="secondary-btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; border-color: #ef4444; color: #fca5a5;" onclick="refundSale(${v.id})">Reembolsar</button>`;

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

        function renderEmptyStats() {
            document.getElementById('statVentasBrutas').textContent = `S/ 0.00`;
            document.getElementById('statReembolsos').textContent = `S/ 0.00`;
            document.getElementById('statDescuentos').textContent = `S/ 0.00`;
            document.getElementById('statBeneficioBruto').textContent = `S/ 0.00`;
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

        const statsMonthInput = document.getElementById('statsMonth');
        if (statsMonthInput) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            statsMonthInput.value = `${yyyy}-${mm}`;
            
            statsMonthInput.addEventListener('change', calcularEstadisticas);
        }

        const exportStatsBtn = document.getElementById('exportStatsBtn');
        if (exportStatsBtn) {
            exportStatsBtn.addEventListener('click', async () => {
                if (!window.currentMonthVentas || window.currentMonthVentas.length === 0) {
                    await customAlert('No hay datos para exportar en este mes.', 'Sin datos', '');
                    return;
                }
                
                let brutasStr = document.getElementById('statVentasBrutas').textContent;
                let reembolsosStr = document.getElementById('statReembolsos').textContent;
                let descuentosStr = document.getElementById('statDescuentos').textContent;
                let gananciaStr = document.getElementById('statBeneficioBruto').textContent;
                let mesInput = document.getElementById('statsMonth').value || 'Completo';

                let html = `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
                <head><meta charset="utf-8"></head>
                <body style="font-family: Arial, sans-serif;">
                    <h2 style="color: #4f46e5; text-transform: uppercase;">Reporte Financiero Kalo - ${mesInput}</h2>
                    
                    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px;">
                        <tr style="background-color: #10b981; color: white; font-size: 16px;">
                            <th colspan="2">RESUMEN DEL MES</th>
                        </tr>
                        <tr><td style="font-weight: bold; width: 200px;">Ingresos Totales</td><td style="text-align: right;">${brutasStr}</td></tr>
                        <tr><td style="font-weight: bold;">Reembolsos</td><td style="color: red; text-align: right;">${reembolsosStr}</td></tr>
                        <tr><td style="font-weight: bold;">Descuentos</td><td style="text-align: right;">${descuentosStr}</td></tr>
                        <tr style="background-color: #d1fae5;">
                            <td style="font-weight: bold; font-size: 16px;">GANANCIA NETA</td>
                            <td style="font-weight: bold; font-size: 16px; color: #047857; text-align: right;">${gananciaStr}</td>
                        </tr>
                    </table>

                    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
                        <tr style="background-color: #1e1b4b; color: white;">
                            <th>Fecha</th>
                            <th>Hora</th>
                            <th>Mtodo</th>
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

        // --- AUTENTICACIN ---
        let currentUserEmail = null;
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (session && session.user) {
                currentUserEmail = session.user.email;
                
                // Verificacin de permisos por local
                const adminEmails = ['zzenisx1234@gmail.com', 'nuevohorizonte@gmail.com'];
                let hasAccess = false;
                
                if (adminEmails.includes(currentUserEmail)) {
                    hasAccess = true;
                } else if (currentLocal === 'LAS BRISAS' && currentUserEmail === 'lasbrisas_kalo@gmail.com') {
                    hasAccess = true;
                } else if (currentLocal === 'LOS PINOS' && currentUserEmail === 'lospinos_kalo@gmail.com') {
                    hasAccess = true;
                } else if (currentLocal === 'EL POLIDEPORTIVO' && currentUserEmail === 'poli_kalo@gmail.com') {
                    hasAccess = true;
                }
                
                const pathUrl = window.location.pathname.toLowerCase();
                if (pathUrl.endsWith('/') || pathUrl.endsWith('index.html')) {
                    hasAccess = true;
                }

                if (!hasAccess) {
                    await supabase.auth.signOut();
                    currentUserEmail = null;
                    if (typeof customAlert === 'function') {
                        await customAlert('Tu cuenta no tiene permiso para acceder a la sucursal de ' + currentLocal, 'Acceso Denegado', '');
                    } else {
                        alert('Acceso Denegado para este local.');
                    }
                    window.location.href = './index.html';
                    return;
                }

                loginCard.classList.add('hidden');
                appView.classList.remove('hidden');
                loadProducts();
            } else {
                currentUserEmail = null;
                appView.classList.add('hidden');
                loginCard.classList.remove('hidden');
                productList.innerHTML = '';
            }
        });

        loginBtn.addEventListener('click', async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            if (!email || !password) return (loginStatusMsg.textContent = 'Ingresa correo y contrasea.');

            try {
                loginBtn.textContent = 'Iniciando...';
                loginStatusMsg.textContent = '';
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } catch (error) {
                loginStatusMsg.textContent = 'Error: Credenciales invlidas.';
            } finally {
                loginBtn.textContent = 'Entrar';
            }
        });

        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut();
            emailInput.value = '';
            passwordInput.value = '';
            productList.innerHTML = '';
            currentUserEmail = null;
            window.location.href = './index.html';
        });

        // --- CARGAR PRODUCTOS ---
        async function loadProducts() {
            try {
                const { data, error } = await supabase.from('productos').select('*').eq('local', currentLocal).order('id', { ascending: false });
                if (error) throw error;

                // Limpiar guiones bajos de los nombres trados de la base de datos
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
                checkAlerts();
            } catch (error) {
                productList.innerHTML = `<tr><td colspan="8" style="color:#fca5a5; text-align:center">Error al cargar: ${error.message}</td></tr>`;
            }
        }

        function checkAlerts() {
            const alertsBadge = document.getElementById('alertsBadge');
            const alertsList = document.getElementById('alertsList');
            if(!alertsBadge || !alertsList) return;
            
            alertsList.innerHTML = '';
            let alertCount = 0;
            const today = new Date();
            today.setHours(0,0,0,0);
            
            const thirtyDaysLater = new Date(today);
            thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
            
            globalProducts.forEach(prod => {
                if(prod.lotes && Array.isArray(prod.lotes)) {
                    prod.lotes.forEach((lote, index) => {
                          const expDate = new Date(lote.vencimiento);
                          const isExpired = expDate < today;
                          const isNear = !isExpired && expDate <= thirtyDaysLater;
                          
                          if(isExpired || isNear) {
                              alertCount++;
                              const tr = document.createElement('tr');
                              const color = isExpired ? '#fca5a5' : '#fcd34d';
                              const estado = isExpired ? 'Vencido' : 'Prximo a Vencer';
                              tr.innerHTML = `
                                  <td>${prod.nombre}</td>
                                  <td>${lote.qty} unidades</td>
                                  <td style="color: ${color}; font-weight: bold;">${lote.vencimiento}</td>
                                  <td style="color: ${color};">${estado}</td>
                                  <td><button class="secondary-btn depurar-btn" data-prodid="${prod.id}" data-loteidx="${index}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444;">Depurado</button></td>
                              `;
                              alertsList.appendChild(tr);
                          }
                      });
                }
            });
            
            if(alertCount > 0) {
                alertsBadge.textContent = alertCount;
                alertsBadge.style.display = 'block';
            } else {
                alertsBadge.style.display = 'none';
                alertsList.innerHTML = '<tr><td colspan="5" style="text-align:center; color: gray;">Todo en orden. No hay productos por vencer.</td></tr>';
            }
            
            if(!window.alertsDelegated) {
                alertsList.addEventListener('click', async (e) => {
                    const btn = e.target.closest('.depurar-btn');
                    if(btn) {
                        const prodId = btn.getAttribute('data-prodid');
                        const loteIndex = parseInt(btn.getAttribute('data-loteidx'));
                        const parsedId = isNaN(prodId) ? prodId : Number(prodId);
                        await window.depurarLote(parsedId, loteIndex);
                    }
                });
                window.alertsDelegated = true;
            }
        }
        
        window.abrirModalEdicionById = (id) => {
            const prod = globalProducts.find(p => p.id === id);
            if(prod) {
                navInvBtn.click();
                abrirModalEdicion(prod);
            }
        };

        window.depurarLote = async (prodId, loteIndex) => {
            if(!confirm('Confirmas que ya retiraste este lote de los estantes? Esta accin lo eliminar del sistema y de las alertas.')) return;
            
            const prod = globalProducts.find(p => p.id === prodId);
            if(!prod) return;
            
            const updatedLotes = prod.lotes.filter((_, i) => i !== loteIndex);
            
            try {
                const { error } = await supabase.from('productos').update({ lotes: updatedLotes }).eq('id', prodId);
                if (error) throw error;
                
                await loadProducts(); 
                
                const alertsView = document.getElementById('alertsView');
                if (alertsView && !alertsView.classList.contains('hidden')) {
                    // Do nothing, loadProducts already calls checkAlerts which updates the table
                    if (typeof customAlert === 'function') {
                        customAlert('Lote depurado con xito.', 'Depurado', '');
                    }
                }
                
            } catch (error) {
                if (typeof customAlert === 'function') {
                    customAlert('Error al depurar lote: ' + error.message, 'Error', '');
                } else {
                    alert('Error: ' + error.message);
                }
            }
        };

        window.abrirModalEdicionById = (id) => {
            const prod = globalProducts.find(p => p.id === id);
            if(prod) {
                const navInvBtnLocal = document.getElementById('navInvBtn');
                if (navInvBtnLocal) navInvBtnLocal.click();
                abrirModalEdicion(prod);
            }
        };

        // --- RENDERIZAR TABLA DE INVENTARIO CON PAGINACIN ---
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
                    stockWarning = ' <span title="Inventario Bajo!" style="color: #f59e0b;"></span>';
                }

                const delCol = prod.id !== undefined ? 'id' : 'nombre';
                const delVal = prod.id !== undefined ? prod.id : prod.nombre;
                const codigo = prod.codigo ? prod.codigo : '';
                const pCompra = prod.precio_compra ? `S/ ${prod.precio_compra.toFixed(2)}` : '';
                const pVenta = prod.precio_venta ? `S/ ${prod.precio_venta.toFixed(2)}` : '';
                const pStock = prod.stock !== null ? prod.stock : '';
                const cat = prod.categoria ? prod.categoria : '';
                const imgSrc = prod.imagen ? `./img/${prod.imagen}` : './img/kalo-logo.png';

                tr.innerHTML = `
                    <td><img src="${imgSrc}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover;" onerror="this.onerror=null; this.src='./kalo-logo.png'"></td>
                    <td><code>${codigo}</code></td>
                    <td>${prod.nombre}</td>
                    <td>${cat}</td>
                    <td>${pCompra}</td>
                    <td><strong style="color: #a7f3d0">${pVenta}</strong></td>
                    <td>${pStock}${stockWarning}</td>
                    <td style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button class="edit-btn" data-prodid="${prod.id}" style="background: transparent; border: none; cursor: pointer; font-size: 1.2rem; color: #60a5fa; transition: transform 0.2s;" title="Editar">Editar</button>
                        <button class="delete-btn" data-prodid="${prod.id}" data-col="${delCol}" data-val="${delVal}" style="background: transparent; border: none; cursor: pointer; font-size: 1.2rem; color: #fca5a5; transition: transform 0.2s;" title="Eliminar">Borrar</button>
                    </td>
                `;
                productList.appendChild(tr);
            });

            // EVENT DELEGATION
            if(!window.inventoryDelegated) {
                productList.addEventListener('click', async (e) => {
                    const btnEdit = e.target.closest('.edit-btn');
                    if(btnEdit) {
                        const prodId = btnEdit.getAttribute('data-prodid');
                        const pId = isNaN(prodId) ? prodId : Number(prodId);
                        const prod = globalProducts.find(p => p.id === pId);
                        if(prod) abrirModalEdicion(prod);
                    }
                    
                    const btnDel = e.target.closest('.delete-btn');
                    if(btnDel) {
                        const col = btnDel.getAttribute('data-col');
                        const val = btnDel.getAttribute('data-val');
                        if (await customConfirm('Seguro que deseas eliminar este producto?', 'Eliminar', '')) {
                            try {
                                btnDel.style.opacity = '0.5';
                                const { error } = await supabase.from('productos').delete().eq(col, val);
                                if (error) throw error;
                                await loadProducts();
                            } catch (error) {
                                btnDel.style.opacity = '1';
                                await customAlert('Error: ' + error.message, 'Error', '');
                                await loadProducts();
                            }
                        }
                    }
                });
                window.inventoryDelegated = true;
            }

            // Actualizar paginacin visual
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

        // --- LGICA DEL PUNTO DE VENTA (POS) ---
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
                const imgSrc = prod.imagen ? `./img/${prod.imagen}` : './img/kalo-logo.png';
                const precio = prod.precio_venta ? `S/ ${prod.precio_venta.toFixed(2)}` : 'S/ 0.00';
                
                div.innerHTML = `
                    <img src="${imgSrc}" onerror="this.onerror=null; this.src='./kalo-logo.png'">
                    <h3>${prod.nombre}</h3>
                    <p>${precio}</p>
                `;
                
                div.addEventListener('click', () => addToCart(prod));
                posGrid.appendChild(div);
            });

            if (posPaginationInfo) {
                posPaginationInfo.textContent = `Pgina ${posCurrentPage} de ${totalPages}`;
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

        // Soporte para Lector de Cdigo de Barras en la barra de bsqueda
        posSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim().toLowerCase();
                if (!term) return;
                
                // Buscar coincidencia exacta por cdigo de barras
                const exactMatch = globalProducts.find(p => p.codigo && p.codigo.toLowerCase() === term);
                
                if (exactMatch) {
                    addToCart(exactMatch);
                    e.target.value = ''; // Limpiar barra
                    renderPosGrid(globalProducts, true); // Restaurar cuadrcula
                } else {
                    // Si no hay match exacto de cdigo, pero hay un solo resultado en la bsqueda
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
            // Si el usuario edita el descuento manualmente, quitamos la seleccin de los botones
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
            if (cart.length === 0) {
                await customAlert('El ticket est vaco.', 'Aviso', '');
                return;
            }
            
            let subtotal = 0;
            cart.forEach(item => subtotal += (item.precio_venta || 0) * item.qty);
            
            const discount = parseFloat(cartDiscount.value) || 0;
            const total = Math.max(0, subtotal - discount);

            const metodo = paymentMethod.value;
            let msg = `Venta realizada con xito!\nTotal cobrado: S/ ${total.toFixed(2)}\nMtodo de pago: ${metodo}`;
            
            if (discount > 0) {
                msg += `\n(Descuento aplicado: S/ ${discount.toFixed(2)})`;
            }

            if (metodo === 'Ambos') {
                const ef = parseFloat(splitEfectivo.value) || 0;
                const yp = parseFloat(splitYape.value) || 0;
                
                if (Math.abs((ef + yp) - total) > 0.01) {
                    await customAlert(`Los montos divididos (S/ ${(ef + yp).toFixed(2)}) no coinciden con el total a pagar (S/ ${total.toFixed(2)}).`, 'Montos incorrectos', '');
                    return;
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
                            let newStock = Math.max(0, dbProd.stock - qtyToDeduct);
                            let payloadUpdate = { stock: newStock };
                            
                            if (dbProd.lotes && dbProd.lotes.length > 0) {
                                let rem = qtyToDeduct;
                                let currentL = [...dbProd.lotes];
                                currentL.sort((a, b) => new Date(a.vencimiento) - new Date(b.vencimiento));
                                
                                for (let lote of currentL) {
                                    if (rem <= 0) break;
                                    if (lote.qty > 0) {
                                        let dec = Math.min(lote.qty, rem);
                                        lote.qty -= dec;
                                        rem -= dec;
                                    }
                                }
                                currentL = currentL.filter(l => l.qty > 0);
                                payloadUpdate.lotes = currentL.length > 0 ? currentL : null;
                                payloadUpdate.stock = currentL.length > 0 ? currentL.reduce((s, l) => s + l.qty, 0) : newStock;
                            }
                            
                            await supabase.from('productos').update(payloadUpdate).eq('id', prodId);
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
                        detalles: cart,
                        local: currentLocal
                    }]);
                } catch(e) {
                    console.error("Error al registrar venta (quizas no existe la tabla): ", e);
                }

                                await loadProducts(); // Recargar inventario visual
                
                // --- INICIO BOLETA AUTOMATICA ---
                const receiptModal = document.getElementById('receiptModal');
                if (receiptModal) {
                    document.getElementById('receiptLocalName').textContent = 'Local: ' + currentLocal;
                    const now = new Date();
                    document.getElementById('receiptDate').textContent = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
                    
                    const tbody = document.getElementById('receiptItems');
                    tbody.innerHTML = '';
                    cart.forEach(item => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td style="padding: 0.2rem 0; border-bottom: 1px dashed #ccc;">
                                ${item.qty}x ${item.nombre}
                            </td>
                            <td style="padding: 0.2rem 0; text-align: right; border-bottom: 1px dashed #ccc;">
                                S/ ${((item.precio_venta || 0) * item.qty).toFixed(2)}
                            </td>
                        `;
                        tbody.appendChild(tr);
                    });
                    
                    document.getElementById('receiptSubtotal').textContent = 'S/ ' + subtotal.toFixed(2);
                    
                    const discountRow = document.getElementById('receiptDiscountRow');
                    if (discount > 0) {
                        discountRow.style.display = 'flex';
                        document.getElementById('receiptDiscount').textContent = '- S/ ' + discount.toFixed(2);
                    } else {
                        discountRow.style.display = 'none';
                    }
                    
                    document.getElementById('receiptTotal').textContent = 'S/ ' + total.toFixed(2);
                    
                    if (metodo === 'Ambos') {
                        const ef = parseFloat(splitEfectivo.value) || 0;
                        const yp = parseFloat(splitYape.value) || 0;
                        document.getElementById('receiptPaymentMethod').textContent = `S/ ${ef.toFixed(2)} Efvo | S/ ${yp.toFixed(2)} Yape`;
                    } else {
                        document.getElementById('receiptPaymentMethod').textContent = 'Pago: ' + metodo;
                    }
                    
                    receiptModal.classList.remove('hidden');
                    
                    const finishSale = () => {
                        receiptModal.classList.add('hidden');
                        cart = [];
                        cartDiscount.value = '';
                        discountBtns.forEach(b => b.classList.remove('active-discount'));
                        renderCart();
                        splitPaymentSection.classList.add('hidden');
                        window.removeEventListener('afterprint', finishSale);
                    };

                    document.getElementById('closeReceiptBtn').onclick = finishSale;
                    document.getElementById('printReceiptBtn').onclick = () => window.print();

                    // Disparar impresion automaticamente
                    setTimeout(() => {
                        window.addEventListener('afterprint', finishSale);
                        window.print();
                    }, 500);

                } else {
                    // Fallback si no hay modal
                    cart = [];
                    cartDiscount.value = '';
                    discountBtns.forEach(b => b.classList.remove('active-discount'));
                    renderCart();
                    splitPaymentSection.classList.add('hidden');
                }
                // --- FIN BOLETA AUTOMATICA ---
                
            } catch (err) {
                await customAlert('Error al procesar la venta: ' + err.message, 'Error', '');
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
                if(productStatusMsg) productStatusMsg.textContent = 'El nombre del producto es obligatorio.';
                return;
            }

            try {
                if(addProductBtn) addProductBtn.textContent = 'Guardando...';

                const payload = {
                    codigo: productCode || null,
                    nombre: productName,
                    categoria: cat,
                    imagen: selectedImageName || null,
                    precio_compra: pCompra,
                    precio_venta: pVenta,
                    stock: stock,
                    alerta_stock: alerta,
                    lotes: currentLotes.length > 0 ? currentLotes : null,
                    local: currentLocal
                };

                let res;
                if (editingProductId) {
                    res = await supabase.from('productos').update(payload).eq('id', editingProductId);
                } else {
                    res = await supabase.from('productos').insert([payload]);
                }

                if (res.error) throw res.error;

                productStatusMsg.style.color = '#86efac';
                if(productStatusMsg) productStatusMsg.textContent = editingProductId ? 'Producto actualizado exitosamente!' : 'Producto guardado exitosamente!';

                await loadProducts();

                // Cerrar modal automticamente despus de un segundo
                setTimeout(() => {
                    productModal.classList.add('hidden');
                    limpiarFormulario();
                }, 1000);

            } catch (error) {
                productStatusMsg.style.color = '#fca5a5';
                if(productStatusMsg) productStatusMsg.textContent = 'Error: ' + error.message;
            } finally {
                if(addProductBtn) addProductBtn.textContent = editingProductId ? 'Actualizar Producto' : 'Guardar Producto';
            }
        });
        // --- LECTOR DE CDIGO DE BARRAS GLOBAL ---
        let barcodeBuffer = '';
        let barcodeTimeout = null;

        document.addEventListener('keydown', (e) => {
            // Ignorar si el usuario est tipeando activamente en cualquier campo de texto
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                return;
            }

            // Un lector enva teclas sper rpido (ej. 10ms-20ms).
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
                        // Cambiamos automticamente a la vista de Punto de Venta si estamos en inventario
                        if (!navPosBtn.classList.contains('active')) {
                            navPosBtn.click();
                        }
                        addToCart(match);
                    } else {
                        // Notificacin visual rpida en el carrito
                        const prevColor = cartTotalValue.style.color;
                        cartTotalValue.style.color = '#fca5a5';
                        cartTotalValue.textContent = ' No found';
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
    console.error("Error crtico:", error);
}
