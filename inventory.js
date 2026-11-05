import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { AVAILABLE_IMAGES, resolveImage, CATEGORIA_COMBOS, PREFIJO_NUBE, urlImagenNube, etiquetaImagen } from "./constants.js";
import { listarImagenesNube, subirImagenNube, borrarImagenNube, nombreArchivoImagen } from "./imagenes.js";
import { customAlert, customConfirm } from "./ui.js";
import { escapeHtml, formatMoney, describeError, fetchAll, estadoVencimiento, parseLocalDate } from "./utils.js";

let editingProductId = null;
let selectedImageName = '';
let currentLotes = [];
let comboSelectedImage = '';

const COLOR_VENCIMIENTO = { vencido: '#b42318', 'por-vencer': '#9a5908' };

export function setupInventory({ onProductsLoaded } = {}) {
    // Modal de producto
    const productModal = document.getElementById('productModal');
    const productModalTitle = document.getElementById('productModalTitle');
    const openModalBtn = document.getElementById('openModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const productStatusMsg = document.getElementById('productStatusMsg');
    const addProductBtn = document.getElementById('addProductBtn');
    const comboEditNote = document.getElementById('comboEditNote');

    const productCodeInput = document.getElementById('productCode');
    const productNameInput = document.getElementById('productName');
    const categoriaInput = document.getElementById('categoria');
    const previewImg = document.getElementById('previewImg');
    const precioCompraInput = document.getElementById('precioCompra');
    const precioVentaInput = document.getElementById('precioVenta');
    const gananciaInput = document.getElementById('ganancia');
    const stockInput = document.getElementById('stock');
    const alertaStockInput = document.getElementById('alertaStock');

    // Selector de imagen
    const imagePickerModal = document.getElementById('imagePickerModal');
    const openImagePickerBtn = document.getElementById('openImagePickerBtn');
    const closeImagePickerBtn = document.getElementById('closeImagePickerBtn');
    const imagePickerSearch = document.getElementById('imagePickerSearch');
    const imageGrid = document.getElementById('imageGrid');
    const imageUploadFile = document.getElementById('imageUploadFile');
    const imageUploadName = document.getElementById('imageUploadName');
    const imageUploadPreview = document.getElementById('imageUploadPreview');
    const imageUploadBtn = document.getElementById('imageUploadBtn');
    const imageUploadMsg = document.getElementById('imageUploadMsg');
    let isPickingComboImage = false;
    let imagenesNube = [];          // nombres en Supabase Storage (ej. GALLETA-OREO.webp)
    let nubeEstado = 'sin-cargar';  // 'sin-cargar' | 'cargando' | 'ok' | 'error'

    // Combos
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

    // Lotes
    const lotesList = document.getElementById('lotesList');
    const loteQtyInput = document.getElementById('loteQtyInput');
    const loteExpInput = document.getElementById('loteExpInput');
    const addLoteBtn = document.getElementById('addLoteBtn');
    const loteFields = [loteQtyInput, loteExpInput, addLoteBtn];

    // Tabla
    const productList = document.getElementById('productList');
    const invSearch = document.getElementById('invSearch');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const paginationInfo = document.getElementById('paginationInfo');

    const isCombo = product => state.combos.has(String(product?.id));
    const productById = id => state.globalProducts.find(p => String(p.id) === String(id));

    function describirCombo(product) {
        return (state.combos.get(String(product.id)) || [])
            .map(c => `${c.cantidad}x ${productById(c.producto_id)?.nombre || 'producto eliminado'}`)
            .join(' + ');
    }

    // --- IMÁGENES ---
    // En el selector van primero las fotos subidas por el personal (se pueden borrar) y luego las de la app.
    function imagenesDelSelector() {
        const nube = imagenesNube.map(name => ({
            valor: PREFIJO_NUBE + name, archivo: name, src: urlImagenNube(name), label: etiquetaImagen(name), nube: true
        }));
        const app = AVAILABLE_IMAGES.map(name => ({
            valor: name, archivo: name, src: `./img/${encodeURI(name)}`, label: etiquetaImagen(name), nube: false
        }));
        return nube.concat(app);
    }

    function elegirImagen(valor, src) {
        if (isPickingComboImage) {
            comboSelectedImage = valor;
            if (comboPreviewImg) comboPreviewImg.src = src;
        } else {
            selectedImageName = valor;
            if (previewImg) previewImg.src = src;
        }
        imagePickerModal?.classList.add('hidden');
    }

    function renderImageGrid(filterText = imagePickerSearch?.value || '') {
        if (!imageGrid) return;
        imageGrid.innerHTML = '';
        const term = (filterText || '').toLowerCase().trim();
        const filtered = imagenesDelSelector().filter(img => !term || img.label.toLowerCase().includes(term));

        if (nubeEstado === 'cargando' || nubeEstado === 'error') {
            const aviso = document.createElement('p');
            aviso.className = 'image-grid-note';
            aviso.textContent = nubeEstado === 'cargando'
                ? 'Cargando imágenes subidas...'
                : 'No se pudieron cargar las imágenes subidas. Revisa el internet y vuelve a abrir.';
            imageGrid.appendChild(aviso);
        }

        if (filtered.length === 0) {
            const vacio = document.createElement('div');
            vacio.className = 'image-grid-empty';
            vacio.innerHTML = `
                <p>🔍 Sin resultados</p>
                <p>No encontramos ninguna imagen que coincida con "${escapeHtml(filterText)}".</p>
            `;
            imageGrid.appendChild(vacio);
            return;
        }

        filtered.forEach(img => {
            const cell = document.createElement('div');
            cell.className = img.nube ? 'image-cell is-uploaded' : 'image-cell';
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'image-item';
            item.innerHTML = `
                <img src="${escapeHtml(img.src)}" alt="" loading="lazy">
                <span>${escapeHtml(img.label)}</span>
            `;
            item.addEventListener('click', () => elegirImagen(img.valor, img.src));
            cell.appendChild(item);
            if (img.nube) {
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'image-delete-btn';
                del.title = `Eliminar imagen ${img.label}`;
                del.setAttribute('aria-label', `Eliminar imagen ${img.label}`);
                del.textContent = '🗑️';
                del.addEventListener('click', () => eliminarImagen(img));
                cell.appendChild(del);
            }
            imageGrid.appendChild(cell);
        });
    }

    async function cargarImagenesNube() {
        nubeEstado = 'cargando';
        renderImageGrid();
        try {
            imagenesNube = await listarImagenesNube();
            nubeEstado = 'ok';
        } catch (error) {
            console.error('Error al listar imágenes subidas:', error);
            nubeEstado = 'error';
        }
        renderImageGrid();
    }

    function setUploadStatus(text, ok = false) {
        if (!imageUploadMsg) return;
        imageUploadMsg.style.color = ok ? '#147556' : '#b42318';
        imageUploadMsg.textContent = text;
    }

    function quitarVistaPrevia() {
        if (!imageUploadPreview) return;
        if (String(imageUploadPreview.src || '').startsWith('blob:')) URL.revokeObjectURL(imageUploadPreview.src);
        imageUploadPreview.removeAttribute('src');
        imageUploadPreview.classList.add('hidden');
    }

    function limpiarSubida() {
        if (imageUploadFile) imageUploadFile.value = '';
        if (imageUploadName) imageUploadName.value = '';
        quitarVistaPrevia();
        setUploadStatus('');
    }

    imageUploadFile?.addEventListener('change', () => {
        const file = imageUploadFile.files?.[0];
        setUploadStatus('');
        quitarVistaPrevia();
        if (!file) return;
        if (imageUploadPreview) {
            imageUploadPreview.src = URL.createObjectURL(file);
            imageUploadPreview.classList.remove('hidden');
        }
        // Sugerir un nombre a partir del archivo si todavía no escribieron uno
        if (imageUploadName && !imageUploadName.value.trim()) {
            imageUploadName.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 80);
        }
        imageUploadName?.focus();
    });

    async function subirImagen() {
        if (!imageUploadBtn || imageUploadBtn.disabled) return;
        const file = imageUploadFile?.files?.[0];
        const nombre = imageUploadName ? imageUploadName.value.trim() : '';
        if (!file) return setUploadStatus('Primero escoge una foto.');
        if (!nombreArchivoImagen(nombre)) return setUploadStatus('Escribe un nombre para la imagen (ej. Galleta Oreo 36g).');
        imageUploadBtn.disabled = true;
        imageUploadBtn.textContent = 'Subiendo...';
        setUploadStatus('');
        try {
            const valor = await subirImagenNube(file, nombre);
            const archivo = valor.slice(PREFIJO_NUBE.length);
            if (!imagenesNube.includes(archivo)) imagenesNube = [...imagenesNube, archivo].sort();
            limpiarSubida();
            renderImageGrid();
            // La foto recién subida queda elegida para el producto o combo
            elegirImagen(valor, urlImagenNube(archivo));
        } catch (error) {
            console.error('Error al subir imagen:', error);
            setUploadStatus(describeError(error));
        } finally {
            imageUploadBtn.disabled = false;
            imageUploadBtn.textContent = 'Subir imagen';
        }
    }

    async function eliminarImagen(img) {
        const enUso = state.globalProducts.filter(p => p.imagen === img.valor).length;
        const aviso = enUso > 0
            ? `\n\n${enUso} producto(s) de este local la usan y se mostrarán con el logo de Kalo.`
            : '';
        const ok = await customConfirm(`¿Eliminar la imagen "${img.label}"? Se borra para los 3 locales.${aviso}`, 'Eliminar imagen', '🗑️');
        if (!ok) return;
        try {
            await borrarImagenNube(img.archivo);
            imagenesNube = imagenesNube.filter(name => name !== img.archivo);
            if (selectedImageName === img.valor) {
                selectedImageName = '';
                if (previewImg) previewImg.src = './kalo-logo.png';
            }
            if (comboSelectedImage === img.valor) {
                comboSelectedImage = '';
                if (comboPreviewImg) comboPreviewImg.src = './kalo-logo.png';
            }
            renderImageGrid();
        } catch (error) {
            console.error('Error al eliminar imagen:', error);
            await customAlert(describeError(error), 'No se pudo eliminar', '❌');
        }
    }

    function openImagePicker(forCombo) {
        isPickingComboImage = forCombo;
        if (imagePickerSearch) imagePickerSearch.value = '';
        limpiarSubida();
        imagePickerModal?.classList.remove('hidden');
        renderImageGrid('');
        cargarImagenesNube();
        setTimeout(() => imagePickerSearch?.focus(), 100);
    }

    imagePickerSearch?.addEventListener('input', event => renderImageGrid(event.target.value));
    imageUploadBtn?.addEventListener('click', subirImagen);
    openImagePickerBtn?.addEventListener('click', () => openImagePicker(false));
    openComboImagePickerBtn?.addEventListener('click', () => openImagePicker(true));
    closeImagePickerBtn?.addEventListener('click', () => imagePickerModal?.classList.add('hidden'));

    // --- LOTES ---
    function renderLotes() {
        if (!lotesList) return;
        lotesList.innerHTML = '';
        if (currentLotes.length === 0) {
            lotesList.innerHTML = '<span class="muted">Sin lotes (informativo).</span>';
            return;
        }
        currentLotes.sort((a, b) => (parseLocalDate(a.vencimiento) || 0) - (parseLocalDate(b.vencimiento) || 0));
        currentLotes.forEach((lote, index) => {
            const row = document.createElement('div');
            row.className = 'lote-row';
            const color = COLOR_VENCIMIENTO[estadoVencimiento(lote.vencimiento)] || 'var(--text-primary)';
            row.innerHTML = `
                <span style="color: ${color}">Cant: ${escapeHtml(lote.qty)} | Vence: ${escapeHtml(lote.vencimiento)}</span>
                <button type="button" class="secondary-btn btn-remove-lote" data-index="${index}" aria-label="Quitar lote">x</button>
            `;
            lotesList.appendChild(row);
        });
    }

    lotesList?.addEventListener('click', event => {
        const button = event.target.closest?.('.btn-remove-lote');
        if (!button) return;
        currentLotes.splice(parseInt(button.getAttribute('data-index'), 10), 1);
        renderLotes();
    });

    addLoteBtn?.addEventListener('click', () => {
        const qty = Number(loteQtyInput.value);
        const exp = loteExpInput.value;
        if (!Number.isSafeInteger(qty) || qty <= 0 || !parseLocalDate(exp)) {
            customAlert('Ingresa cantidad válida y fecha de vencimiento.', 'Datos inválidos', '⚠️');
            return;
        }
        currentLotes.push({ qty, vencimiento: exp });
        loteQtyInput.value = '';
        loteExpInput.value = '';
        renderLotes();
    });

    // --- FORMULARIO DE PRODUCTO ---
    function calcularGanancia() {
        if (!precioCompraInput || !precioVentaInput || !gananciaInput) return;
        const ganancia = (parseFloat(precioVentaInput.value) || 0) - (parseFloat(precioCompraInput.value) || 0);
        gananciaInput.value = ganancia > 0 ? `+ ${formatMoney(ganancia)}` : formatMoney(ganancia);
    }
    precioCompraInput?.addEventListener('input', calcularGanancia);
    precioVentaInput?.addEventListener('input', calcularGanancia);

    function setComboMode(enabled) {
        for (const input of [precioCompraInput, stockInput, alertaStockInput, ...loteFields]) {
            if (input) input.disabled = enabled;
        }
        comboEditNote?.classList.toggle('hidden', !enabled);
    }

    function limpiarFormulario() {
        editingProductId = null;
        if (productModalTitle) productModalTitle.textContent = 'Registrar producto';
        if (addProductBtn) addProductBtn.textContent = 'Guardar producto';
        for (const input of [productCodeInput, productNameInput, precioCompraInput, precioVentaInput, gananciaInput, stockInput, alertaStockInput, loteQtyInput, loteExpInput]) {
            if (input) input.value = '';
        }
        if (categoriaInput) categoriaInput.value = 'Bebidas';
        if (productStatusMsg) {
            productStatusMsg.textContent = '';
            productStatusMsg.style.color = '';
        }
        selectedImageName = '';
        if (previewImg) previewImg.src = './kalo-logo.png';
        currentLotes = [];
        setComboMode(false);
        renderLotes();
    }

    function abrirModalEdicion(prod) {
        limpiarFormulario();
        editingProductId = prod.id;
        if (productModalTitle) productModalTitle.textContent = 'Editar producto';
        if (addProductBtn) addProductBtn.textContent = 'Actualizar producto';
        if (productCodeInput) productCodeInput.value = prod.codigo || '';
        if (productNameInput) productNameInput.value = prod.nombre || '';
        if (categoriaInput) categoriaInput.value = prod.categoria || 'Bebidas';
        if (precioCompraInput) precioCompraInput.value = prod.precio_compra ?? '';
        if (precioVentaInput) precioVentaInput.value = prod.precio_venta ?? '';
        if (stockInput) stockInput.value = prod.stock ?? '';
        if (alertaStockInput) alertaStockInput.value = prod.alerta_stock ?? '';
        currentLotes = Array.isArray(prod.lotes) ? prod.lotes.map(lote => ({ ...lote })) : [];
        setComboMode(isCombo(prod));
        renderLotes();
        selectedImageName = prod.imagen || '';
        if (previewImg) previewImg.src = resolveImage(selectedImageName);
        calcularGanancia();
        productModal?.classList.remove('hidden');
    }

    openModalBtn?.addEventListener('click', () => {
        limpiarFormulario();
        productModal?.classList.remove('hidden');
        productCodeInput?.focus();
    });

    closeModalBtn?.addEventListener('click', () => {
        productModal?.classList.add('hidden');
        limpiarFormulario();
    });

    function setProductStatus(text, ok = false) {
        if (!productStatusMsg) return;
        productStatusMsg.style.color = ok ? '#147556' : '#b42318';
        productStatusMsg.textContent = text;
    }

    async function guardarProducto() {
        if (!addProductBtn || addProductBtn.disabled) return;
        const editing = editingProductId !== null ? productById(editingProductId) : null;
        const comboEnEdicion = editing && isCombo(editing);

        // Lote escrito pero sin presionar "+ Lote"
        const pendingQty = loteQtyInput ? loteQtyInput.value.trim() : '';
        const pendingExp = loteExpInput ? loteExpInput.value.trim() : '';
        if (!comboEnEdicion && (pendingQty || pendingExp)) {
            const addPending = await customConfirm(
                'Escribiste datos en un lote pero olvidaste presionar "+ Lote".\n\n¿Quieres que lo agreguemos automáticamente y luego guardemos el producto?',
                'Lote sin agregar detectado', '💡');
            if (addPending) {
                addLoteBtn?.click();
                if ((loteQtyInput && loteQtyInput.value.trim() !== '') || (loteExpInput && loteExpInput.value.trim() !== '')) return;
            } else {
                const forceSave = await customConfirm('Entonces, ¿deseas guardar el producto ignorando y borrando los datos de ese lote incompleto?', 'Guardar sin lote', '❓');
                if (!forceSave) return;
                if (loteQtyInput) loteQtyInput.value = '';
                if (loteExpInput) loteExpInput.value = '';
            }
        }

        const productCode = productCodeInput ? productCodeInput.value.trim() : '';
        const productName = productNameInput ? productNameInput.value.trim() : '';
        const numericFields = [
            [precioCompraInput, 'El precio de compra', false],
            [precioVentaInput, 'El precio de venta', false],
            [stockInput, 'El stock', true],
            [alertaStockInput, 'La alerta de stock', true]
        ];
        const numericValues = [];
        for (const [input, label, integerOnly] of numericFields) {
            const raw = input ? String(input.value).trim() : '';
            const value = raw === '' ? null : Number(raw);
            if (value !== null && (!Number.isFinite(value) || value < 0 || (integerOnly && !Number.isSafeInteger(value)))) {
                setProductStatus(`${label} debe ser ${integerOnly ? 'un número entero' : 'un número'} mayor o igual a cero.`);
                return;
            }
            numericValues.push(value);
        }
        const [pCompra, pVenta, stock, alerta] = numericValues;
        if (!productName) {
            setProductStatus('El nombre del producto es obligatorio.');
            return;
        }
        if (productName.length > 120) {
            setProductStatus('El nombre es demasiado largo (máximo 120 caracteres).');
            return;
        }

        const payload = {
            codigo: productCode || null,
            nombre: productName,
            categoria: categoriaInput ? categoriaInput.value : 'Bebidas',
            imagen: selectedImageName || null,
            precio_venta: pVenta
        };
        if (!comboEnEdicion) {
            Object.assign(payload, {
                precio_compra: pCompra,
                stock,
                alerta_stock: alerta,
                lotes: currentLotes.length > 0 ? currentLotes : null
            });
        }

        try {
            addProductBtn.disabled = true;
            addProductBtn.textContent = 'Guardando...';
            let result;
            if (editing) {
                result = await supabase.from('productos').update(payload)
                    .eq('id', editing.id).eq('local', state.currentLocal).select('id');
                if (!result.error && (!result.data || result.data.length !== 1)) {
                    throw new Error('No se encontró el producto en este local. Actualiza la pantalla.');
                }
            } else {
                result = await supabase.from('productos').insert([{ ...payload, local: state.currentLocal }]);
            }
            if (result.error) throw result.error;
            setProductStatus(editing ? '¡Producto actualizado!' : '¡Producto guardado!', true);
            await loadProducts();
            setTimeout(() => {
                productModal?.classList.add('hidden');
                limpiarFormulario();
            }, 800);
        } catch (error) {
            setProductStatus('Error: ' + describeError(error));
        } finally {
            addProductBtn.disabled = false;
            addProductBtn.textContent = editingProductId !== null ? 'Actualizar producto' : 'Guardar producto';
        }
    }

    addProductBtn?.addEventListener('click', guardarProducto);

    // --- COMBOS ---
    function updateComboSummary() {
        const comboRealSalePrice = document.getElementById('comboRealSalePrice');
        const comboRealCost = document.getElementById('comboRealCost');
        const comboNetProfit = document.getElementById('comboNetProfit');
        if (!comboRealSalePrice || !comboRealCost || !comboNetProfit || !comboPriceInput || !comboProductList) return;

        let totalSalePrice = 0;
        let totalCost = 0;
        comboProductList.querySelectorAll('.combo-checkbox:checked').forEach(checkbox => {
            const prod = productById(checkbox.value);
            if (!prod) return;
            const qtyInput = checkbox.parentElement.nextElementSibling.querySelector('.combo-qty-input');
            const enteredQty = Number(qtyInput.value);
            const qty = Number.isSafeInteger(enteredQty) && enteredQty > 0 ? enteredQty : 0;
            totalSalePrice += (Number(prod.precio_venta) || 0) * qty;
            totalCost += (Number(prod.precio_compra) || 0) * qty;
        });
        const profit = (parseFloat(comboPriceInput.value) || 0) - totalCost;
        comboRealSalePrice.textContent = formatMoney(totalSalePrice);
        comboRealCost.textContent = formatMoney(totalCost);
        comboNetProfit.textContent = formatMoney(profit);
        comboNetProfit.style.color = profit < 0 ? '#b42318' : profit > 0 ? '#147556' : 'var(--text-primary)';
    }

    comboPriceInput?.addEventListener('input', updateComboSummary);

    openComboModalBtn?.addEventListener('click', () => {
        comboModal?.classList.remove('hidden');
        if (comboNameInput) comboNameInput.value = '';
        if (comboPriceInput) comboPriceInput.value = '';
        comboSelectedImage = '';
        if (comboPreviewImg) comboPreviewImg.src = './kalo-logo.png';
        if (comboStatusMsg) comboStatusMsg.textContent = '';
        if (comboProductList) {
            comboProductList.innerHTML = '';
            state.globalProducts.filter(p => !isCombo(p) && p.categoria !== CATEGORIA_COMBOS).forEach(prod => {
                const row = document.createElement('div');
                row.className = 'combo-row';
                row.innerHTML = `
                    <label class="combo-row-label">
                        <input type="checkbox" class="combo-checkbox" value="${escapeHtml(prod.id)}">
                        ${escapeHtml(prod.nombre)} (Stock: ${escapeHtml(prod.stock ?? '—')})
                    </label>
                    <div class="combo-row-qty">
                        <span>Cant:</span>
                        <input type="number" class="combo-qty-input styled-input" min="1" value="1" disabled aria-label="Cantidad de ${escapeHtml(prod.nombre)}">
                    </div>
                `;
                const checkbox = row.querySelector('.combo-checkbox');
                const qtyInput = row.querySelector('.combo-qty-input');
                checkbox.addEventListener('change', () => {
                    qtyInput.disabled = !checkbox.checked;
                    updateComboSummary();
                });
                qtyInput.addEventListener('input', updateComboSummary);
                comboProductList.appendChild(row);
            });
        }
        updateComboSummary();
    });

    closeComboModalBtn?.addEventListener('click', () => comboModal?.classList.add('hidden'));

    async function guardarCombo() {
        if (!saveComboBtn || saveComboBtn.disabled) return;
        const nombre = comboNameInput ? comboNameInput.value.trim() : '';
        const precio = Number(comboPriceInput ? comboPriceInput.value : NaN);
        const setStatus = text => { if (comboStatusMsg) comboStatusMsg.textContent = text; };
        if (!nombre || !Number.isFinite(precio) || precio <= 0) {
            setStatus('Ingresa un nombre y precio válido.');
            return;
        }
        const checkboxes = comboProductList ? [...comboProductList.querySelectorAll('.combo-checkbox:checked')] : [];
        if (checkboxes.length < 2) {
            setStatus('Selecciona al menos 2 productos para armar el combo.');
            return;
        }
        const items = [];
        for (const checkbox of checkboxes) {
            const qtyInput = checkbox.parentElement.nextElementSibling.querySelector('.combo-qty-input');
            const cantidad = Number(qtyInput.value);
            if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
                setStatus('Las cantidades del combo deben ser números enteros mayores a cero.');
                return;
            }
            items.push({ id: productById(checkbox.value)?.id ?? checkbox.value, cantidad });
        }

        saveComboBtn.disabled = true;
        saveComboBtn.textContent = 'Guardando...';
        try {
            const { error } = await supabase.rpc('crear_combo', {
                p_local: state.currentLocal,
                p_nombre: nombre,
                p_precio: precio,
                p_imagen: comboSelectedImage || null,
                p_items: items
            });
            if (error) throw error;
            comboModal?.classList.add('hidden');
            await loadProducts();
        } catch (error) {
            setStatus('Error: ' + describeError(error));
        } finally {
            saveComboBtn.disabled = false;
            saveComboBtn.textContent = 'Guardar combo';
        }
    }

    saveComboBtn?.addEventListener('click', guardarCombo);

    // --- CARGA DE PRODUCTOS ---
    async function loadProducts() {
        const local = state.currentLocal;
        if (!local) return;
        try {
            const [rows, comboRows] = await Promise.all([
                fetchAll(() => supabase.from('productos').select('*')
                    .eq('local', local).eq('activo', true).order('id', { ascending: false })),
                fetchAll(() => supabase.from('combo_items').select('combo_id, producto_id, cantidad')
                    .order('combo_id').order('producto_id'))
            ]);
            if (local !== state.currentLocal) return; // se cambió de local mientras cargaba

            const products = rows.map(p => ({ ...p, nombre: p.nombre ? p.nombre.replace(/_/g, ' ') : p.nombre }));
            const ids = new Set(products.map(p => String(p.id)));
            const combos = new Map();
            for (const row of comboRows) {
                const comboId = String(row.combo_id);
                if (!ids.has(comboId)) continue;
                if (!combos.has(comboId)) combos.set(comboId, []);
                combos.get(comboId).push({ producto_id: String(row.producto_id), cantidad: Number(row.cantidad) });
            }

            state.globalProducts = products;
            state.combos = combos;
            filterInventoryProducts();
            checkAlerts();
            if (typeof onProductsLoaded === 'function') onProductsLoaded(products);
        } catch (error) {
            if (productList) {
                productList.innerHTML = `<tr><td colspan="8" class="table-message is-error">Error al cargar: ${escapeHtml(describeError(error))}</td></tr>`;
            }
        }
    }

    function clear() {
        if (productList) productList.innerHTML = '';
        const alertsList = document.getElementById('alertsList');
        if (alertsList) alertsList.innerHTML = '';
        const alertsBadge = document.getElementById('alertsBadge');
        if (alertsBadge) alertsBadge.style.display = 'none';
    }

    // --- TABLA DE INVENTARIO ---
    function renderInventoryTable() {
        if (!productList) return;
        productList.innerHTML = '';
        if (state.invFilteredProducts.length === 0) {
            productList.innerHTML = '<tr><td colspan="8" class="table-message">No hay productos registrados.</td></tr>';
            if (paginationInfo) paginationInfo.textContent = 'Mostrando 0 productos';
            if (prevPageBtn) prevPageBtn.disabled = true;
            if (nextPageBtn) nextPageBtn.disabled = true;
            return;
        }

        const totalPages = Math.ceil(state.invFilteredProducts.length / state.invItemsPerPage) || 1;
        state.invCurrentPage = Math.min(Math.max(1, state.invCurrentPage), totalPages);
        const startIndex = (state.invCurrentPage - 1) * state.invItemsPerPage;
        const endIndex = startIndex + state.invItemsPerPage;

        state.invFilteredProducts.slice(startIndex, endIndex).forEach(prod => {
            const row = document.createElement('tr');
            const combo = isCombo(prod);
            let stockWarning = '';
            if (!combo && prod.stock != null && prod.alerta_stock != null && Number(prod.stock) <= Number(prod.alerta_stock)) {
                row.classList.add('warning-row');
                stockWarning = ' <span title="¡Inventario bajo!" class="stock-warning">⚠️</span>';
            }
            const codigo = combo
                ? `<span class="combo-badge" title="${escapeHtml(describirCombo(prod))}">Combo</span>`
                : `<code>${escapeHtml(prod.codigo || '')}</code>`;
            const stock = combo ? '<span class="muted" title="Se descuenta de sus componentes">—</span>' : escapeHtml(prod.stock ?? '');
            row.innerHTML = `
                <td><img src="${escapeHtml(resolveImage(prod.imagen))}" class="inventory-thumb" alt=""></td>
                <td>${codigo}</td>
                <td>${escapeHtml(prod.nombre)}</td>
                <td>${escapeHtml(prod.categoria || '')}</td>
                <td>${prod.precio_compra ? escapeHtml(formatMoney(prod.precio_compra)) : ''}</td>
                <td><strong class="price-cell">${prod.precio_venta ? escapeHtml(formatMoney(prod.precio_venta)) : ''}</strong></td>
                <td>${stock}${stockWarning}</td>
                <td class="row-actions">
                    <button type="button" class="edit-btn" data-prodid="${escapeHtml(prod.id)}" title="Editar" aria-label="Editar ${escapeHtml(prod.nombre)}">✏️</button>
                    <button type="button" class="delete-btn" data-prodid="${escapeHtml(prod.id)}" title="Eliminar" aria-label="Eliminar ${escapeHtml(prod.nombre)}">🗑️</button>
                </td>
            `;
            productList.appendChild(row);
        });

        if (paginationInfo) {
            paginationInfo.textContent = `Mostrando ${startIndex + 1} - ${Math.min(endIndex, state.invFilteredProducts.length)} de ${state.invFilteredProducts.length} productos`;
        }
        if (prevPageBtn) prevPageBtn.disabled = state.invCurrentPage === 1;
        if (nextPageBtn) nextPageBtn.disabled = state.invCurrentPage === totalPages;
    }

    async function eliminarProducto(prod, button) {
        const usadoEn = [...state.combos]
            .filter(([, componentes]) => componentes.some(c => c.producto_id === String(prod.id)))
            .map(([comboId]) => productById(comboId)?.nombre || 'un combo');
        if (usadoEn.length) {
            await customAlert(`"${prod.nombre}" es parte de: ${usadoEn.join(', ')}. Elimina primero esos combos.`, 'No se puede eliminar', '🍔');
            return;
        }
        if (!await customConfirm(`¿Seguro que deseas eliminar "${prod.nombre}"? Dejará de aparecer en la caja; el historial de ventas se conserva.`, 'Eliminar', '🗑️')) return;
        try {
            if (button) button.disabled = true;
            const { data, error } = await supabase.from('productos').update({ activo: false })
                .eq('id', prod.id).eq('local', state.currentLocal).select('id');
            if (error) throw error;
            if (!data || data.length !== 1) throw new Error('No se encontró el producto en este local.');
            await loadProducts();
        } catch (error) {
            if (button) button.disabled = false;
            await customAlert('Error: ' + describeError(error), 'Error', '⚠️');
        }
    }

    productList?.addEventListener('click', event => {
        const editBtn = event.target.closest?.('.edit-btn');
        if (editBtn) {
            const prod = productById(editBtn.getAttribute('data-prodid'));
            if (prod) abrirModalEdicion(prod);
            return;
        }
        const deleteBtn = event.target.closest?.('.delete-btn');
        if (deleteBtn) {
            const prod = productById(deleteBtn.getAttribute('data-prodid'));
            if (prod) return eliminarProducto(prod, deleteBtn);
        }
        return undefined;
    });

    function filterInventoryProducts() {
        const term = invSearch ? invSearch.value.toLowerCase() : '';
        const activeBtn = document.querySelector('.inv-filter-btn.active');
        const activeCat = activeBtn ? activeBtn.getAttribute('data-cat') : 'Todos';
        let filtered = state.globalProducts;
        if (activeCat && activeCat !== 'Todos') filtered = filtered.filter(p => p.categoria === activeCat);
        if (term) {
            filtered = filtered.filter(p =>
                (p.nombre || '').toLowerCase().includes(term) ||
                (p.codigo && p.codigo.toLowerCase().includes(term)) ||
                (p.categoria && p.categoria.toLowerCase().includes(term)));
        }
        state.invFilteredProducts = filtered;
        state.invCurrentPage = 1;
        renderInventoryTable();
    }

    invSearch?.addEventListener('input', filterInventoryProducts);

    const invCatBtns = document.querySelectorAll('.inv-filter-btn');
    invCatBtns.forEach(btn => {
        btn.addEventListener('click', event => {
            invCatBtns.forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
            filterInventoryProducts();
        });
    });

    prevPageBtn?.addEventListener('click', () => {
        if (state.invCurrentPage > 1) {
            state.invCurrentPage--;
            renderInventoryTable();
        }
    });

    nextPageBtn?.addEventListener('click', () => {
        const totalPages = Math.ceil(state.invFilteredProducts.length / state.invItemsPerPage);
        if (state.invCurrentPage < totalPages) {
            state.invCurrentPage++;
            renderInventoryTable();
        }
    });

    // --- ALERTAS DE VENCIMIENTO ---
    const alertsList = document.getElementById('alertsList');

    function checkAlerts() {
        const alertsBadge = document.getElementById('alertsBadge');
        if (!alertsBadge || !alertsList) return;
        alertsList.innerHTML = '';
        let alertCount = 0;

        state.globalProducts.forEach(prod => {
            if (!Array.isArray(prod.lotes)) return;
            prod.lotes.forEach((lote, index) => {
                const estado = estadoVencimiento(lote?.vencimiento);
                if (estado !== 'vencido' && estado !== 'por-vencer') return;
                alertCount++;
                const color = COLOR_VENCIMIENTO[estado];
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${escapeHtml(prod.nombre)}</td>
                    <td>${escapeHtml(lote.qty)} unidades</td>
                    <td style="color: ${color}; font-weight: bold;">${escapeHtml(lote.vencimiento)}</td>
                    <td style="color: ${color};">${estado === 'vencido' ? 'Vencido' : 'Próximo a vencer'}</td>
                    <td><button type="button" class="secondary-btn depurar-btn" data-prodid="${escapeHtml(prod.id)}" data-loteidx="${index}">Depurado</button></td>
                `;
                alertsList.appendChild(row);
            });
        });

        if (alertCount > 0) {
            alertsBadge.textContent = alertCount;
            alertsBadge.style.display = 'block';
        } else {
            alertsBadge.style.display = 'none';
            alertsList.innerHTML = '<tr><td colspan="5" class="table-message">Todo en orden. No hay productos por vencer.</td></tr>';
        }
    }

    alertsList?.addEventListener('click', async event => {
        const button = event.target.closest?.('.depurar-btn');
        if (!button) return;
        await depurarLote(button.getAttribute('data-prodid'), parseInt(button.getAttribute('data-loteidx'), 10));
    });

    async function depurarLote(prodId, loteIndex) {
        const prod = productById(prodId);
        if (!prod || !Array.isArray(prod.lotes)) return;
        if (!await customConfirm('¿Confirmas que ya retiraste este lote de los estantes? Se quitará del sistema y de las alertas.', 'Confirmar depuración', '⚠️')) return;
        const updatedLotes = prod.lotes.filter((_, i) => i !== loteIndex);
        try {
            const { data, error } = await supabase.from('productos')
                .update({ lotes: updatedLotes.length ? updatedLotes : null })
                .eq('id', prod.id).eq('local', state.currentLocal).select('id');
            if (error) throw error;
            if (!data || data.length !== 1) throw new Error('No se encontró el producto en este local.');
            await loadProducts();
            await customAlert('Lote depurado con éxito.', 'Depurado', '✅');
        } catch (error) {
            await customAlert('Error al depurar lote: ' + describeError(error), 'Error', '⚠️');
        }
    }

    return {
        loadProducts,
        renderInventoryTable,
        checkAlerts,
        abrirModalEdicion,
        clear
    };
}
