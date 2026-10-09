import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { AVAILABLE_IMAGES } from "./constants.js";
import { customAlert, customConfirm } from "./ui.js";

let editingProductId = null;
let selectedImageName = '';
let currentLotes = [];
let comboSelectedImage = '';

export function setupInventory({ onProductsLoaded }) {
    // Nodos Modal Producto
    const productModal = document.getElementById('productModal');
    const openModalBtn = document.getElementById('openModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const productStatusMsg = document.getElementById('productStatusMsg');
    const addProductBtn = document.getElementById('addProductBtn');

    // Inputs Formulario Producto
    const productCodeInput = document.getElementById('productCode');
    const productNameInput = document.getElementById('productName');
    const categoriaInput = document.getElementById('categoria');
    const previewImg = document.getElementById('previewImg');
    const precioCompraInput = document.getElementById('precioCompra');
    const precioVentaInput = document.getElementById('precioVenta');
    const gananciaInput = document.getElementById('ganancia');
    const stockInput = document.getElementById('stock');
    const alertaStockInput = document.getElementById('alertaStock');

    // Modal Imagen
    const imagePickerModal = document.getElementById('imagePickerModal');
    const openImagePickerBtn = document.getElementById('openImagePickerBtn');
    const closeImagePickerBtn = document.getElementById('closeImagePickerBtn');
    const imageGrid = document.getElementById('imageGrid');

    // Modal Combos
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

    // Lotes y Vencimientos
    const lotesList = document.getElementById('lotesList');
    const loteQtyInput = document.getElementById('loteQtyInput');
    const loteExpInput = document.getElementById('loteExpInput');
    const addLoteBtn = document.getElementById('addLoteBtn');
    const calculatedStockText = document.getElementById('calculatedStock');

    // Tabla y Paginación
    const productList = document.getElementById('productList');
    const invSearch = document.getElementById('invSearch');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const paginationInfo = document.getElementById('paginationInfo');

    // --- RENDER GRID DE IMÁGENES ---
    function renderImageGrid(isCombo = false) {
        if (!imageGrid) return;
        imageGrid.innerHTML = '';
        AVAILABLE_IMAGES.forEach(imgName => {
            const div = document.createElement('div');
            div.className = 'image-item';
            div.innerHTML = `
                <img src="./img/${imgName}" alt="${imgName}" loading="lazy" onerror="this.onerror=null; this.src='./kalo-logo.png'">
                <span>${imgName.replace('.svg', '').replace(/_/g, ' ')}</span>
            `;
            div.addEventListener('click', () => {
                if (isCombo) {
                    comboSelectedImage = imgName;
                    if (comboPreviewImg) comboPreviewImg.src = `./img/${imgName}`;
                } else {
                    selectedImageName = imgName;
                    if (previewImg) previewImg.src = `./img/${imgName}`;
                }
                if (imagePickerModal) imagePickerModal.classList.add('hidden');
            });
            imageGrid.appendChild(div);
        });
    }

    if (openImagePickerBtn) {
        openImagePickerBtn.addEventListener('click', () => {
            if (imagePickerModal) imagePickerModal.classList.remove('hidden');
            renderImageGrid(false);
        });
    }

    if (closeImagePickerBtn) {
        closeImagePickerBtn.addEventListener('click', () => {
            if (imagePickerModal) imagePickerModal.classList.add('hidden');
        });
    }

    // --- MANEJO DE LOTES ---
    function renderLotes() {
        if (!lotesList) return;
        lotesList.innerHTML = '';
        let totalStock = 0;
        
        if (currentLotes.length === 0) {
            lotesList.innerHTML = '<span style="color: gray;">Sin lotes. Stock será infinito o manual.</span>';
            if (calculatedStockText) calculatedStockText.textContent = stockInput ? (stockInput.value || '0') : '0';
            return;
        }

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
            if (isExpired) color = '#ef4444';
            else if (isNear) color = '#f59e0b';

            div.innerHTML = `
                <span style="color: ${color}">Cant: ${lote.qty} | Vence: ${lote.vencimiento}</span>
                <button type="button" class="secondary-btn btn-remove-lote" data-index="${index}" style="padding: 0 0.5rem; border-color: #ef4444; color: #ef4444;">x</button>
            `;
            lotesList.appendChild(div);
        });
        
        if (calculatedStockText) calculatedStockText.textContent = totalStock;
        if (stockInput) stockInput.value = totalStock;
    }

    if (lotesList) {
        lotesList.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-remove-lote');
            if (btn) {
                const idx = parseInt(btn.getAttribute('data-index'));
                currentLotes.splice(idx, 1);
                renderLotes();
            }
        });
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
                customAlert('Ingresa cantidad válida y fecha de vencimiento.', 'Datos Inválidos', '⚠️');
                return;
            }
            
            currentLotes.push({ qty, vencimiento: exp });
            loteQtyInput.value = '';
            loteExpInput.value = '';
            renderLotes();
        });
    }

    // --- FORMULARIO PRODUCTO NORMAL ---
    function calcularGanancia() {
        if (!precioCompraInput || !precioVentaInput || !gananciaInput) return;
        const compra = parseFloat(precioCompraInput.value) || 0;
        const venta = parseFloat(precioVentaInput.value) || 0;
        const ganancia = venta - compra;
        gananciaInput.value = ganancia > 0 ? `+ S/ ${ganancia.toFixed(2)}` : `S/ ${ganancia.toFixed(2)}`;
    }

    if (precioCompraInput) precioCompraInput.addEventListener('input', calcularGanancia);
    if (precioVentaInput) precioVentaInput.addEventListener('input', calcularGanancia);

    function limpiarFormulario() {
        editingProductId = null;
        const mh2 = document.querySelector('#productModal h2');
        if (mh2) mh2.textContent = 'Registrar Producto';
        if (addProductBtn) addProductBtn.textContent = 'Guardar Producto';
        if (productCodeInput) productCodeInput.value = '';
        if (productNameInput) productNameInput.value = '';
        if (categoriaInput) categoriaInput.value = 'Bebidas';
        if (precioCompraInput) precioCompraInput.value = '';
        if (precioVentaInput) precioVentaInput.value = '';
        if (gananciaInput) gananciaInput.value = '';
        if (stockInput) stockInput.value = '';
        if (alertaStockInput) alertaStockInput.value = '';
        if (productStatusMsg) productStatusMsg.textContent = '';
        selectedImageName = '';
        if (previewImg) previewImg.src = './kalo-logo.png';
        currentLotes = [];
        if (loteQtyInput) loteQtyInput.value = '';
        if (loteExpInput) loteExpInput.value = '';
        renderLotes();
    }

    function abrirModalEdicion(prod) {
        limpiarFormulario();
        editingProductId = prod.id;
        const mh2 = document.querySelector('#productModal h2');
        if (mh2) mh2.textContent = 'Editar Producto';
        if (addProductBtn) addProductBtn.textContent = 'Actualizar Producto';

        if (productCodeInput) productCodeInput.value = prod.codigo || '';
        if (productNameInput) productNameInput.value = prod.nombre || '';
        if (categoriaInput) categoriaInput.value = prod.categoria || 'Bebidas';
        if (precioCompraInput) precioCompraInput.value = prod.precio_compra || '';
        if (precioVentaInput) precioVentaInput.value = prod.precio_venta || '';
        if (stockInput) stockInput.value = prod.stock !== null ? prod.stock : '';
        if (alertaStockInput) alertaStockInput.value = prod.alerta_stock !== null ? prod.alerta_stock : '';
        currentLotes = prod.lotes ? [...prod.lotes] : [];
        renderLotes();

        selectedImageName = prod.imagen || '';
        if (previewImg) {
            previewImg.src = selectedImageName ? `./img/${selectedImageName}` : './kalo-logo.png';
        }

        calcularGanancia();
        if (productModal) productModal.classList.remove('hidden');
    }

    if (openModalBtn) {
        openModalBtn.addEventListener('click', () => {
            limpiarFormulario();
            if (productModal) productModal.classList.remove('hidden');
            if (productCodeInput) productCodeInput.focus();
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (productModal) productModal.classList.add('hidden');
            limpiarFormulario();
        });
    }

    if (addProductBtn) {
        addProductBtn.addEventListener('click', async () => {
            const productCode = productCodeInput ? productCodeInput.value.trim() : '';
            const productName = productNameInput ? productNameInput.value.trim() : '';
            const pCompra = parseFloat(precioCompraInput.value) || null;
            const pVenta = parseFloat(precioVentaInput.value) || null;
            const stock = parseInt(stockInput.value) || null;
            const alerta = parseInt(alertaStockInput.value) || null;
            const cat = categoriaInput ? categoriaInput.value : 'Bebidas';

            if (!productName) {
                if (productStatusMsg) productStatusMsg.textContent = 'El nombre del producto es obligatorio.';
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
                    alerta_stock: alerta,
                    lotes: currentLotes.length > 0 ? currentLotes : null,
                    local: state.currentLocal
                };

                let res;
                if (editingProductId) {
                    res = await supabase.from('productos').update(payload).eq('id', editingProductId);
                } else {
                    res = await supabase.from('productos').insert([payload]);
                }

                if (res.error) throw res.error;

                if (productStatusMsg) {
                    productStatusMsg.style.color = '#86efac';
                    productStatusMsg.textContent = editingProductId ? '¡Producto actualizado exitosamente!' : '¡Producto guardado exitosamente!';
                }

                await loadProducts();

                setTimeout(() => {
                    if (productModal) productModal.classList.add('hidden');
                    limpiarFormulario();
                }, 1000);

            } catch (error) {
                if (productStatusMsg) {
                    productStatusMsg.style.color = '#fca5a5';
                    productStatusMsg.textContent = 'Error: ' + error.message;
                }
            } finally {
                if (addProductBtn) addProductBtn.textContent = editingProductId ? 'Actualizar Producto' : 'Guardar Producto';
            }
        });
    }

    // --- MODAL DE COMBOS ---
    if (openComboModalBtn) {
        openComboModalBtn.addEventListener('click', () => {
            if (comboModal) comboModal.classList.remove('hidden');
            if (comboNameInput) comboNameInput.value = '';
            if (comboPriceInput) comboPriceInput.value = '';
            comboSelectedImage = '';
            if (comboPreviewImg) comboPreviewImg.src = './kalo-logo.png';
            if (comboStatusMsg) comboStatusMsg.textContent = '';
            
            if (comboProductList) {
                comboProductList.innerHTML = '';
                const normalProducts = state.globalProducts.filter(p => p.categoria !== 'Combos');
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
            }
        });
    }

    if (closeComboModalBtn) {
        closeComboModalBtn.addEventListener('click', () => {
            if (comboModal) comboModal.classList.add('hidden');
        });
    }

    if (openComboImagePickerBtn) {
        openComboImagePickerBtn.addEventListener('click', () => {
            if (imagePickerModal) imagePickerModal.classList.remove('hidden');
            renderImageGrid(true);
        });
    }

    if (saveComboBtn) {
        saveComboBtn.addEventListener('click', async () => {
            const nombre = comboNameInput ? comboNameInput.value.trim() : '';
            const precio = parseFloat(comboPriceInput.value);
            
            if (!nombre || isNaN(precio) || precio <= 0) {
                if (comboStatusMsg) comboStatusMsg.textContent = 'Ingresa un nombre y precio válido.';
                return;
            }

            const checkboxes = comboProductList.querySelectorAll('.combo-checkbox:checked');
            if (checkboxes.length < 2) {
                if (comboStatusMsg) comboStatusMsg.textContent = 'Selecciona al menos 2 productos para armar el combo.';
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
                    local: state.currentLocal
                }]);
                
                if (error) throw error;
                
                if (comboModal) comboModal.classList.add('hidden');
                await loadProducts();
            } catch (err) {
                if (comboStatusMsg) comboStatusMsg.textContent = 'Error: ' + err.message;
            } finally {
                saveComboBtn.disabled = false;
                saveComboBtn.textContent = 'Guardar Combo';
            }
        });
    }

    // --- CARGAR PRODUCTOS ---
    async function loadProducts() {
        try {
            const { data, error } = await supabase.from('productos').select('*').eq('local', state.currentLocal).order('id', { ascending: false });
            if (error) throw error;

            const cleanedData = data.map(p => ({
                ...p,
                nombre: p.nombre ? p.nombre.replace(/_/g, ' ') : p.nombre
            }));

            state.globalProducts = cleanedData;
            state.invFilteredProducts = cleanedData;
            state.invCurrentPage = 1;

            renderInventoryTable();
            checkAlerts();

            if (typeof onProductsLoaded === 'function') {
                onProductsLoaded(cleanedData);
            }
        } catch (error) {
            if (productList) {
                productList.innerHTML = `<tr><td colspan="8" style="color:#fca5a5; text-align:center">Error al cargar: ${error.message}</td></tr>`;
            }
        }
    }

    // --- TABLA DE INVENTARIO ---
    function renderInventoryTable() {
        if (!productList) return;
        productList.innerHTML = '';
        
        if (state.invFilteredProducts.length === 0) {
            productList.innerHTML = '<tr><td colspan="8" style="text-align:center; color:gray">No hay productos registrados.</td></tr>';
            if (paginationInfo) paginationInfo.textContent = 'Mostrando 0 productos';
            if (prevPageBtn) prevPageBtn.disabled = true;
            if (nextPageBtn) nextPageBtn.disabled = true;
            return;
        }

        const totalPages = Math.ceil(state.invFilteredProducts.length / state.invItemsPerPage) || 1;
        if (state.invCurrentPage > totalPages) state.invCurrentPage = totalPages;
        if (state.invCurrentPage < 1) state.invCurrentPage = 1;

        const startIndex = (state.invCurrentPage - 1) * state.invItemsPerPage;
        const endIndex = startIndex + state.invItemsPerPage;
        const currentData = state.invFilteredProducts.slice(startIndex, endIndex);

        currentData.forEach((prod) => {
            const tr = document.createElement('tr');

            let stockWarning = '';
            if (prod.stock !== null && prod.alerta_stock !== null && prod.stock <= prod.alerta_stock) {
                tr.classList.add('warning-row');
                stockWarning = ' <span title="¡Inventario Bajo!" style="color: #f59e0b;">⚠️</span>';
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
                    <button class="edit-btn" data-prodid="${prod.id}" style="background: transparent; border: none; cursor: pointer; font-size: 1.2rem; color: #60a5fa; transition: transform 0.2s;" title="Editar">✏️</button>
                    <button class="delete-btn" data-prodid="${prod.id}" data-col="${delCol}" data-val="${delVal}" style="background: transparent; border: none; cursor: pointer; font-size: 1.2rem; color: #fca5a5; transition: transform 0.2s;" title="Eliminar">🗑️</button>
                </td>
            `;
            productList.appendChild(tr);
        });

        if (paginationInfo) {
            paginationInfo.textContent = `Mostrando ${startIndex + 1} - ${Math.min(endIndex, state.invFilteredProducts.length)} de ${state.invFilteredProducts.length} productos`;
        }
        if (prevPageBtn) {
            prevPageBtn.disabled = state.invCurrentPage === 1;
            prevPageBtn.style.opacity = prevPageBtn.disabled ? '0.5' : '1';
        }
        if (nextPageBtn) {
            nextPageBtn.disabled = state.invCurrentPage === totalPages;
            nextPageBtn.style.opacity = nextPageBtn.disabled ? '0.5' : '1';
        }
    }

    if (productList && !window.inventoryDelegated) {
        productList.addEventListener('click', async (e) => {
            const btnEdit = e.target.closest('.edit-btn');
            if (btnEdit) {
                const prodId = btnEdit.getAttribute('data-prodid');
                const pId = isNaN(prodId) ? prodId : Number(prodId);
                const prod = state.globalProducts.find(p => p.id === pId);
                if (prod) abrirModalEdicion(prod);
            }
            
            const btnDel = e.target.closest('.delete-btn');
            if (btnDel) {
                const col = btnDel.getAttribute('data-col');
                const val = btnDel.getAttribute('data-val');
                if (await customConfirm('¿Seguro que deseas eliminar este producto?', 'Eliminar', '🗑️')) {
                    try {
                        btnDel.style.opacity = '0.5';
                        const { error } = await supabase.from('productos').delete().eq(col, val);
                        if (error) throw error;
                        await loadProducts();
                    } catch (error) {
                        btnDel.style.opacity = '1';
                        await customAlert('Error: ' + error.message, 'Error', '⚠️');
                        await loadProducts();
                    }
                }
            }
        });
        window.inventoryDelegated = true;
    }

    if (invSearch) {
        invSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            state.invFilteredProducts = state.globalProducts.filter(p => 
                p.nombre.toLowerCase().includes(term) || 
                (p.codigo && p.codigo.toLowerCase().includes(term)) ||
                (p.categoria && p.categoria.toLowerCase().includes(term))
            );
            state.invCurrentPage = 1;
            renderInventoryTable();
        });
    }

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (state.invCurrentPage > 1) {
                state.invCurrentPage--;
                renderInventoryTable();
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(state.invFilteredProducts.length / state.invItemsPerPage);
            if (state.invCurrentPage < totalPages) {
                state.invCurrentPage++;
                renderInventoryTable();
            }
        });
    }

    // --- ALERTAS DE VENCIMIENTO Y DEPURACIÓN ---
    function checkAlerts() {
        const alertsBadge = document.getElementById('alertsBadge');
        const alertsList = document.getElementById('alertsList');
        if (!alertsBadge || !alertsList) return;
        
        alertsList.innerHTML = '';
        let alertCount = 0;
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const thirtyDaysLater = new Date(today);
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
        
        state.globalProducts.forEach(prod => {
            if (prod.lotes && Array.isArray(prod.lotes)) {
                prod.lotes.forEach((lote, index) => {
                    const expDate = new Date(lote.vencimiento);
                    const isExpired = expDate < today;
                    const isNear = !isExpired && expDate <= thirtyDaysLater;
                    
                    if (isExpired || isNear) {
                        alertCount++;
                        const tr = document.createElement('tr');
                        const color = isExpired ? '#fca5a5' : '#fcd34d';
                        const estado = isExpired ? 'Vencido' : 'Próximo a Vencer';
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
        
        if (alertCount > 0) {
            alertsBadge.textContent = alertCount;
            alertsBadge.style.display = 'block';
        } else {
            alertsBadge.style.display = 'none';
            alertsList.innerHTML = '<tr><td colspan="5" style="text-align:center; color: gray;">Todo en orden. No hay productos por vencer.</td></tr>';
        }
        
        if (!window.alertsDelegated) {
            alertsList.addEventListener('click', async (e) => {
                const btn = e.target.closest('.depurar-btn');
                if (btn) {
                    const prodId = btn.getAttribute('data-prodid');
                    const loteIndex = parseInt(btn.getAttribute('data-loteidx'));
                    const parsedId = isNaN(prodId) ? prodId : Number(prodId);
                    await depurarLote(parsedId, loteIndex);
                }
            });
            window.alertsDelegated = true;
        }
    }

    async function depurarLote(prodId, loteIndex) {
        const isConfirmed = await customConfirm('¿Confirmas que ya retiraste este lote de los estantes? Esta acción lo eliminará del sistema y de las alertas.', 'Confirmar Depuración', '⚠️');
        if (!isConfirmed) return;
        
        const prod = state.globalProducts.find(p => p.id === prodId);
        if (!prod) return;
        
        const updatedLotes = prod.lotes.filter((_, i) => i !== loteIndex);
        
        try {
            const { error } = await supabase.from('productos').update({ lotes: updatedLotes }).eq('id', prodId);
            if (error) throw error;
            
            await loadProducts();
            await customAlert('Lote depurado con éxito.', 'Depurado', '✅');
        } catch (error) {
            await customAlert('Error al depurar lote: ' + error.message, 'Error', '⚠️');
        }
    }

    window.depurarLote = depurarLote;
    window.abrirModalEdicionById = (id) => {
        const prod = state.globalProducts.find(p => p.id === id);
        if (prod) {
            const navInvBtn = document.getElementById('navInvBtn');
            if (navInvBtn) navInvBtn.click();
            abrirModalEdicion(prod);
        }
    };

    return {
        loadProducts,
        renderInventoryTable,
        checkAlerts,
        abrirModalEdicion
    };
}
