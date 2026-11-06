import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { customAlert, showToast } from "./ui.js";
import { resolveImage, localPorId } from "./constants.js";
import { escapeHtml, roundMoney, formatMoney, describeError, faltanteDeStock, esVentaPNP } from "./utils.js";

export function setupPOS({ onSaleCompleted, onPricesChanged } = {}) {
    const posGrid = document.getElementById('posGrid');
    const posSearch = document.getElementById('posSearch');
    const cartItemsContainer = document.getElementById('cartItems');
    const cartTotalValue = document.getElementById('cartTotalValue');
    const cartItemCount = document.getElementById('cartItemCount');
    const mobileCartTotal = document.getElementById('mobileCartTotal');
    const catalogCount = document.getElementById('catalogCount');
    const paymentMethod = document.getElementById('paymentMethod');
    const splitPaymentSection = document.getElementById('splitPaymentSection');
    const splitEfectivo = document.getElementById('splitEfectivo');
    const splitYape = document.getElementById('splitYape');
    const cobrarBtn = document.getElementById('cobrarBtn');
    const cobrarHtml = cobrarBtn ? cobrarBtn.innerHTML : 'Cobrar';
    const pnpBtn = document.getElementById('pnpBtn');
    const pnpDetail = document.getElementById('pnpDetail');
    const paymentField = document.getElementById('paymentField');
    const catBtns = document.querySelectorAll('.cat-filter-btn');

    const posPrevPageBtn = document.getElementById('posPrevPageBtn');
    const posNextPageBtn = document.getElementById('posNextPageBtn');
    const posPaginationInfo = document.getElementById('posPaginationInfo');

    let posCurrentPage = 1;
    const posItemsPerPage = 25;
    let posFilteredProducts = [];
    let posCurrentCategory = 'Todos';
    let pnpActivo = false; // PNP (policía): el único descuento, 100% del ticket
    let isProcessingSale = false;
    let totalTicket = 0;
    let splitAncla = null; // 'efectivo' | 'yape': el cuadro que escribió la vendedora (se respeta si cambia el total)

    const productsById = () => new Map(state.globalProducts.map(product => [String(product.id), product]));
    // Igual que la base de datos: cada precio se redondea a céntimos antes de multiplicar.
    const lineTotal = item => roundMoney(Number(item.precio_venta) || 0) * item.qty;
    const cartSubtotal = items => roundMoney(items.reduce((sum, item) => sum + lineTotal(item), 0));

    // --- CATÁLOGO ---
    function renderPosGrid(productsToRender, resetPage = false) {
        if (!posGrid) return;
        if (resetPage) posCurrentPage = 1;
        const term = posSearch ? posSearch.value.toLowerCase().trim() : '';
        posFilteredProducts = (productsToRender || state.globalProducts).filter(product =>
            (posCurrentCategory === 'Todos' || product.categoria === posCurrentCategory) &&
            ((product.nombre || '').toLowerCase().includes(term) || (product.codigo || '').toLowerCase().includes(term))
        );

        posGrid.innerHTML = '';
        const totalPages = Math.ceil(posFilteredProducts.length / posItemsPerPage) || 1;
        posCurrentPage = Math.min(Math.max(1, posCurrentPage), totalPages);
        const startIndex = (posCurrentPage - 1) * posItemsPerPage;
        const paginatedItems = posFilteredProducts.slice(startIndex, startIndex + posItemsPerPage);
        if (catalogCount) {
            const count = posFilteredProducts.length;
            catalogCount.textContent = `${count} ${count === 1 ? 'producto' : 'productos'}`;
        }

        if (paginatedItems.length === 0) {
            posGrid.innerHTML = `
                <div class="catalog-empty">
                    <span class="empty-state-icon" aria-hidden="true">⌕</span>
                    <h3>No encontramos productos</h3>
                    <p>Prueba con otro nombre, código o categoría.</p>
                </div>
            `;
        }

        paginatedItems.forEach(prod => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'product-card';
            card.title = prod.nombre || '';
            const precio = formatMoney(prod.precio_venta);
            card.setAttribute?.('aria-label', `Agregar ${prod.nombre} al ticket, ${precio}`);
            const stock = prod.stock == null ? null : Number(prod.stock);
            const stockLabel = stock !== null && Number.isFinite(stock)
                ? `<span class="product-stock${stock === 0 ? ' is-empty' : ''}">${stock === 0 ? 'Sin stock' : `${stock} disponibles`}</span>`
                : '';
            card.innerHTML = `
                <img class="product-image" src="${escapeHtml(resolveImage(prod.imagen))}" alt="${escapeHtml(prod.nombre)}" loading="lazy">
                <h3>${escapeHtml(prod.nombre)}</h3>
                <p class="product-price">${escapeHtml(precio)}</p>
                ${stockLabel}
            `;
            card.addEventListener('click', () => addToCart(prod));
            posGrid.appendChild(card);
        });

        if (posPaginationInfo) posPaginationInfo.textContent = `Página ${posCurrentPage} de ${totalPages}`;
        if (posPrevPageBtn) posPrevPageBtn.disabled = posCurrentPage === 1;
        if (posNextPageBtn) posNextPageBtn.disabled = posCurrentPage === totalPages;
    }

    posPrevPageBtn?.addEventListener('click', () => {
        if (posCurrentPage > 1) {
            posCurrentPage--;
            renderPosGrid(posFilteredProducts);
        }
    });

    posNextPageBtn?.addEventListener('click', () => {
        const totalPages = Math.ceil(posFilteredProducts.length / posItemsPerPage) || 1;
        if (posCurrentPage < totalPages) {
            posCurrentPage++;
            renderPosGrid(posFilteredProducts);
        }
    });

    function filterPosProducts() {
        renderPosGrid(state.globalProducts, true);
    }

    if (posSearch) {
        posSearch.addEventListener('input', filterPosProducts);
        posSearch.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            const term = event.target.value.trim().toLowerCase();
            if (!term) return;
            const exactMatch = state.globalProducts.find(p => p.codigo && p.codigo.toLowerCase() === term);
            const filtered = exactMatch ? [exactMatch] : state.globalProducts.filter(p =>
                (p.nombre || '').toLowerCase().includes(term) || (p.codigo && p.codigo.toLowerCase().includes(term)));
            if (filtered.length === 1) {
                addToCart(filtered[0]);
                event.target.value = '';
                renderPosGrid(state.globalProducts, true);
            }
        });
    }

    catBtns.forEach(btn => {
        btn.addEventListener('click', event => {
            catBtns.forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
            posCurrentCategory = event.target.getAttribute('data-cat');
            filterPosProducts();
        });
    });

    // --- TICKET ---
    function avisarFaltante(faltante) {
        showToast(`Sin stock suficiente de ${faltante.nombre}: disponible ${faltante.disponible}.`, 'warning');
    }

    function addToCart(prod) {
        if (isProcessingSale || !prod) return false;
        // Escanear el siguiente producto con el aviso de venta abierto empieza la nueva venta.
        cerrarAvisoDeVenta();
        const existing =state.cart.find(item => String(item.id) === String(prod.id));
        const nextCart = existing
            ? state.cart.map(item => (item === existing ? { ...item, qty: item.qty + 1 } : item))
            : [...state.cart, { ...prod, qty: 1 }];
        const faltante = faltanteDeStock(nextCart, state.combos, productsById());
        if (faltante) {
            avisarFaltante(faltante);
            return false;
        }
        if (existing) existing.qty++;
        else state.cart.push({ ...prod, qty: 1 });
        renderCart();
        return true;
    }

    function updateQty(index, delta) {
        if (isProcessingSale || !state.cart[index] || !Number.isInteger(delta)) return;
        if (delta > 0) {
            const nextCart = state.cart.map((item, i) => (i === index ? { ...item, qty: item.qty + delta } : item));
            const faltante = faltanteDeStock(nextCart, state.combos, productsById());
            if (faltante) {
                avisarFaltante(faltante);
                return;
            }
        }
        state.cart[index].qty += delta;
        if (state.cart[index].qty <= 0) state.cart.splice(index, 1);
        renderCart();
    }

    cartItemsContainer?.addEventListener('click', event => {
        const button = event.target.closest?.('[data-qty-delta]');
        if (button) updateQty(Number(button.dataset.index), Number(button.dataset.qtyDelta));
    });

    function renderCart() {
        if (!cartItemsContainer || !cartTotalValue) return;
        cartItemsContainer.innerHTML = '';

        if (state.cart.length === 0) {
            cartItemsContainer.innerHTML = `
                <div class="cart-empty">
                    <span class="empty-state-icon" aria-hidden="true">＋</span>
                    <h3>Tu ticket está vacío</h3>
                    <p>Selecciona un producto para comenzar.</p>
                </div>
            `;
        }

        state.cart.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'cart-item';
            const nombre = escapeHtml(item.nombre);
            row.innerHTML = `
                <div class="cart-item-info">
                    <p class="cart-item-title">${nombre}</p>
                    <p class="cart-item-price">${escapeHtml(formatMoney(item.precio_venta))} x ${item.qty}</p>
                </div>
                <div class="cart-item-qty">
                    <button type="button" class="qty-btn" aria-label="Quitar una unidad de ${nombre}" data-index="${index}" data-qty-delta="-1">−</button>
                    <span>${item.qty}</span>
                    <button type="button" class="qty-btn" aria-label="Añadir una unidad de ${nombre}" data-index="${index}" data-qty-delta="1">+</button>
                </div>
            `;
            cartItemsContainer.appendChild(row);
        });

        if (state.cart.length === 0) pnpActivo = false;
        const subtotal = cartSubtotal(state.cart);
        const total = roundMoney(subtotal - descuentoDe(subtotal));
        mostrarPNP(subtotal);
        cartTotalValue.textContent = formatMoney(total);
        ajustarPagoDividido(total);
        if (mobileCartTotal) mobileCartTotal.textContent = cartTotalValue.textContent;
        if (cartItemCount) {
            const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
            cartItemCount.textContent = `${count} ${count === 1 ? 'producto' : 'productos'}`;
        }
    }

    function resetPaymentControls() {
        pnpActivo = false;
        mostrarPNP(0);
        if (paymentMethod) paymentMethod.value = 'Efectivo';
        if (splitEfectivo) splitEfectivo.value = '';
        if (splitYape) splitYape.value = '';
        splitAncla = null;
        if (splitPaymentSection) splitPaymentSection.classList.add('hidden');
    }

    // --- PAGO DIVIDIDO (Efectivo + Yape/Plin) ---
    // Al elegirlo se reparte mitad y mitad. Si escriben en un cuadro, el otro se completa
    // para que los dos sumen siempre el total (total 4, efectivo 3 → Yape/Plin 1).
    const montoEscrito = input => {
        const valor = Number(input?.value);
        return input && String(input.value).trim() !== '' && Number.isFinite(valor) && valor > 0 ? roundMoney(valor) : 0;
    };
    const campoDe = nombre => (nombre === 'yape' ? splitYape : splitEfectivo);
    const otroCampo = nombre => (nombre === 'yape' ? splitEfectivo : splitYape);

    function completarPago(nombre, total = totalTicket) {
        const otro = otroCampo(nombre);
        if (otro) otro.value = Math.max(0, roundMoney(total - montoEscrito(campoDe(nombre)))).toFixed(2);
    }

    function repartirMitad(total = totalTicket) {
        if (!splitEfectivo || !splitYape) return;
        const mitad = roundMoney(total / 2);
        splitEfectivo.value = mitad.toFixed(2);
        splitYape.value = roundMoney(total - mitad).toFixed(2);
    }

    function ajustarPagoDividido(total) {
        totalTicket = total;
        if (paymentMethod?.value !== 'Ambos') return;
        if (!splitAncla) {
            repartirMitad(total);
            return;
        }
        const campo = campoDe(splitAncla);
        if (campo && montoEscrito(campo) > total) campo.value = total.toFixed(2);
        completarPago(splitAncla, total);
    }

    for (const nombre of ['efectivo', 'yape']) {
        const campo = campoDe(nombre);
        // Mientras escriben solo se toca el otro cuadro (no se les mueve lo que están escribiendo).
        campo?.addEventListener('input', () => {
            splitAncla = nombre;
            completarPago(nombre);
        });
        // Al salir del cuadro: no puede pasar del total y queda con dos decimales.
        campo?.addEventListener('change', () => {
            const valor = Number(campo.value);
            if (String(campo.value).trim() !== '' && Number.isFinite(valor) && valor >= 0) {
                campo.value = Math.min(roundMoney(valor), totalTicket).toFixed(2);
            }
            completarPago(nombre);
        });
    }

    function clearCart() {
        state.cart = [];
        resetPaymentControls();
        renderCart();
    }

    // Tras recargar productos: el ticket toma los precios y el stock actuales.
    function onProductsLoaded(products) {
        const byId = new Map(products.map(product => [String(product.id), product]));
        const quitados = [];
        state.cart = state.cart.filter(item => {
            const fresh = byId.get(String(item.id));
            if (!fresh) {
                quitados.push(item.nombre);
                return false;
            }
            Object.assign(item, fresh, { qty: item.qty });
            return true;
        });
        if (quitados.length) showToast(`Se quitó del ticket porque ya no está disponible: ${quitados.join(', ')}.`, 'warning', 6000);
        renderPosGrid(products);
        renderCart();
    }

    // --- DESCUENTO PNP ---
    // Con PNP activo el ticket queda en S/ 0.00 y no se pide método de pago.
    const descuentoDe = subtotal => (pnpActivo ? subtotal : 0);

    function mostrarPNP(subtotal) {
        if (pnpBtn) {
            pnpBtn.classList.toggle('is-active', pnpActivo);
            pnpBtn.setAttribute('aria-pressed', String(pnpActivo));
        }
        if (pnpDetail) pnpDetail.textContent = pnpActivo ? `- ${formatMoney(subtotal)} · toca para quitar` : '100% de descuento';
        paymentField?.classList.toggle('hidden', pnpActivo);
        if (pnpActivo) splitPaymentSection?.classList.add('hidden');
        else splitPaymentSection?.classList.toggle('hidden', paymentMethod?.value !== 'Ambos');
    }

    pnpBtn?.addEventListener('click', () => {
        if (isProcessingSale) return;
        if (!pnpActivo && state.cart.length === 0) {
            showToast('Primero agrega los productos al ticket.', 'warning');
            return;
        }
        pnpActivo = !pnpActivo;
        renderCart();
    });

    paymentMethod?.addEventListener('change', event => {
        const split = event.target.value === 'Ambos';
        splitPaymentSection?.classList.toggle('hidden', !split);
        splitAncla = null;
        if (split) repartirMitad();
    });

    // --- BOLETA ---
    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function showReceipt(venta) {
        const receiptModal = document.getElementById('receiptModal');
        if (!receiptModal) return;
        const local = localPorId(venta.local || state.currentLocal);
        const numero = venta.id == null ? '' : String(venta.id);
        setText('receiptLocalName', `Local: ${local ? local.nombre : state.currentLocal}`);
        setText('receiptSaleNumber', numero ? `Venta N° ${numero.length > 12 ? numero.slice(0, 8).toUpperCase() : numero}` : '');
        const now = new Date();
        setText('receiptDate', `${now.toLocaleDateString('es-PE')} ${now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`);

        const tbody = document.getElementById('receiptItems');
        if (tbody) {
            tbody.innerHTML = '';
            for (const item of venta.items || []) {
                const row = document.createElement('tr');
                const description = document.createElement('td');
                description.textContent = `${item.cantidad}x ${item.nombre}`;
                const amount = document.createElement('td');
                amount.className = 'receipt-amount';
                amount.textContent = formatMoney(roundMoney(Number(item.precio_unitario) * item.cantidad));
                row.appendChild(description);
                row.appendChild(amount);
                tbody.appendChild(row);
            }
        }

        setText('receiptSubtotal', formatMoney(venta.subtotal));
        const discountRow = document.getElementById('receiptDiscountRow');
        const descuento = Number(venta.descuento) || 0;
        if (discountRow) discountRow.classList.toggle('hidden', descuento <= 0);
        setText('receiptDiscount', `- ${formatMoney(descuento)}`);
        setText('receiptTotal', formatMoney(venta.total));
        const pnp = esVentaPNP(venta);
        setText('receiptPaymentMethod', pnp ? 'PNP: 100% de descuento'
            : venta.metodo_pago === 'Ambos'
                ? `${formatMoney(venta.efectivo)} Efvo | ${formatMoney(venta.yape)} Yape`
                : `Pago: ${venta.metodo_pago === 'Yape' ? 'Yape / Plin' : venta.metodo_pago}`);

        // Aviso de venta exitosa. La boleta ya no se imprime sola (no todos los locales tienen
        // impresora): solo si la vendedora toca "Imprimir boleta".
        const pago = venta.metodo_pago === 'Ambos' ? 'Efectivo + Yape'
            : venta.metodo_pago === 'Yape' ? 'Yape / Plin' : (venta.metodo_pago || 'Efectivo');
        setText('saleSuccessTotal', formatMoney(venta.total));
        const textoPago = pnp ? 'Venta PNP (100% de descuento)' : `Cobrado con ${pago}`;
        setText('saleSuccessDetail', `${textoPago}${numero ? ` · Venta N° ${numero.length > 12 ? numero.slice(0, 8).toUpperCase() : numero}` : ''}`);

        receiptModal.classList.remove('hidden');
        const closeBtn = document.getElementById('closeReceiptBtn');
        const printBtn = document.getElementById('printReceiptBtn');
        if (closeBtn) closeBtn.onclick = cerrarAvisoDeVenta;
        if (printBtn) printBtn.onclick = () => window.print();
        receiptModal.onkeydown = event => {
            if (event.key === 'Escape') cerrarAvisoDeVenta();
        };
        closeBtn?.focus?.();
    }

    function cerrarAvisoDeVenta() {
        const receiptModal = document.getElementById('receiptModal');
        if (!receiptModal) return;
        receiptModal.classList.add('hidden');
        receiptModal.onkeydown = null;
    }

    // --- COBRAR ---
    async function checkout() {
        if (isProcessingSale) return;
        if (state.cart.length === 0) {
            await customAlert('El ticket está vacío.', 'Aviso', '⚠️');
            return;
        }
        const saleItems = state.cart.map(item => ({ ...item }));
        if (saleItems.some(item => !Number.isSafeInteger(item.qty) || item.qty <= 0 ||
            !Number.isFinite(Number(item.precio_venta ?? 0)) || Number(item.precio_venta ?? 0) < 0)) {
            await customAlert('Revisa los precios y cantidades del ticket.', 'Datos inválidos', '⚠️');
            return;
        }
        const subtotal = cartSubtotal(saleItems);
        const discount = descuentoDe(subtotal);
        const total = roundMoney(subtotal - discount);
        // Venta PNP: no entra dinero, se registra como efectivo S/ 0.00.
        const metodo = pnpActivo ? 'Efectivo' : (paymentMethod ? paymentMethod.value : 'Efectivo');
        if (!['Efectivo', 'Yape', 'Ambos'].includes(metodo)) {
            await customAlert('Selecciona un método de pago válido.', 'Pago inválido', '⚠️');
            return;
        }

        let efectivo = null;
        let yape = null;
        if (metodo === 'Ambos') {
            const ef = Number(splitEfectivo ? splitEfectivo.value : NaN);
            const yp = Number(splitYape ? splitYape.value : NaN);
            if (!Number.isFinite(ef) || !Number.isFinite(yp) || ef < 0 || yp < 0) {
                await customAlert('Los montos de efectivo y Yape deben ser números mayores o iguales a cero.', 'Montos incorrectos', '⚠️');
                return;
            }
            efectivo = roundMoney(ef);
            yape = roundMoney(yp);
            if (roundMoney(efectivo + yape) !== total) {
                await customAlert(`Los montos divididos (${formatMoney(ef + yp)}) no coinciden con el total a pagar (${formatMoney(total)}).`, 'Montos incorrectos', '⚠️');
                return;
            }
        }

        try {
            isProcessingSale = true;
            if (cobrarBtn) {
                cobrarBtn.disabled = true;
                cobrarBtn.textContent = 'Procesando...';
            }
            const { data, error } = await supabase.rpc('registrar_venta', {
                p_local: state.currentLocal,
                p_items: saleItems.map(item => ({ id: item.id, cantidad: item.qty })),
                p_descuento: roundMoney(discount),
                p_metodo: metodo,
                p_efectivo: efectivo,
                p_yape: yape,
                p_total_esperado: total
            });
            if (error) throw error;

            clearCart();
            showReceipt(data || {});
            try {
                if (typeof onSaleCompleted === 'function') await onSaleCompleted();
            } catch {
                showToast('La venta se registró, pero no se pudo actualizar el inventario en pantalla.', 'warning', 6000);
            }
        } catch (err) {
            if (err?.code === 'KL001' && typeof onPricesChanged === 'function') onPricesChanged();
            await customAlert(`No se pudo registrar la venta: ${describeError(err)}`, 'Error', '⚠️');
        } finally {
            isProcessingSale = false;
            if (cobrarBtn) {
                cobrarBtn.disabled = false;
                cobrarBtn.innerHTML = cobrarHtml;
            }
        }
    }

    cobrarBtn?.addEventListener('click', checkout);

    renderCart();

    return {
        renderPosGrid,
        addToCart,
        renderCart,
        clearCart,
        onProductsLoaded,
        checkout
    };
}
