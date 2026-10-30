import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { customAlert } from "./ui.js";
import { resolveImage } from "./constants.js";

export function setupPOS({ onSaleCompleted }) {
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
    const discountBtns = document.querySelectorAll('.discount-btn');
    const catBtns = document.querySelectorAll('.cat-filter-btn');

    const posPrevPageBtn = document.getElementById('posPrevPageBtn');
    const posNextPageBtn = document.getElementById('posNextPageBtn');
    const posPaginationInfo = document.getElementById('posPaginationInfo');

    let posCurrentPage = 1;
    const posItemsPerPage = 25;
    let posFilteredProducts = [];
    let posCurrentCategory = 'Todos';
    let activeDiscountPercent = null;
    let isProcessingSale = false;

    const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;

    // --- RENDER CUADRÍCULA POS ---
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
        const endIndex = startIndex + posItemsPerPage;
        const paginatedItems = posFilteredProducts.slice(startIndex, endIndex);

        paginatedItems.forEach(prod => {
            const div = document.createElement('div');
            div.className = 'product-card';
            const imgSrc = resolveImage(prod.imagen);
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
            posPaginationInfo.textContent = `Página ${posCurrentPage} de ${totalPages}`;
        }
        if (posPrevPageBtn) {
            posPrevPageBtn.disabled = posCurrentPage === 1;
            posPrevPageBtn.style.opacity = posPrevPageBtn.disabled ? '0.5' : '1';
        }
        if (posNextPageBtn) {
            posNextPageBtn.disabled = posCurrentPage === totalPages;
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

    // --- FILTRADO POR CATEGORÍA Y BÚSQUEDA ---
    function filterPosProducts() {
        renderPosGrid(state.globalProducts, true);
    }

    if (posSearch) {
        posSearch.addEventListener('input', filterPosProducts);
        
        posSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim().toLowerCase();
                if (!term) return;
                
                const exactMatch = state.globalProducts.find(p => p.codigo && p.codigo.toLowerCase() === term);
                if (exactMatch) {
                    addToCart(exactMatch);
                    e.target.value = '';
                    renderPosGrid(state.globalProducts, true);
                } else {
                    const filtered = state.globalProducts.filter(p => 
                        p.nombre.toLowerCase().includes(term) || 
                        (p.codigo && p.codigo.toLowerCase().includes(term))
                    );
                    if (filtered.length === 1) {
                        addToCart(filtered[0]);
                        e.target.value = '';
                        renderPosGrid(state.globalProducts, true);
                    }
                }
            }
        });
    }

    catBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            catBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            posCurrentCategory = e.target.getAttribute('data-cat');
            filterPosProducts();
        });
    });

    // --- GESTIÓN DEL CARRITO ---
    function addToCart(prod) {
        if (isProcessingSale) return;
        const existing = state.cart.find(item => item.id === prod.id);
        if (existing) {
            existing.qty++;
        } else {
            state.cart.push({ ...prod, qty: 1 });
        }
        renderCart();
    }

    function updateQty(index, delta) {
        if (isProcessingSale || !state.cart[index]) return;
        state.cart[index].qty += delta;
        if (state.cart[index].qty <= 0) {
            state.cart.splice(index, 1);
        }
        renderCart();
    }
    window.updateQty = updateQty;

    function renderCart() {
        if (!cartItemsContainer || !cartTotalValue) return;
        cartItemsContainer.innerHTML = '';
        let subtotal = 0;

        state.cart.forEach((item, index) => {
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

        subtotal = roundMoney(subtotal);
        if (activeDiscountPercent !== null && cartDiscount) {
            cartDiscount.value = roundMoney(subtotal * activeDiscountPercent / 100).toFixed(2);
        }
        const discount = Number(cartDiscount ? cartDiscount.value : 0) || 0;
        const total = Math.max(0, subtotal - discount);
        cartTotalValue.textContent = `S/ ${total.toFixed(2)}`;
    }

    if (cartDiscount) {
        cartDiscount.addEventListener('input', () => {
            activeDiscountPercent = null;
            discountBtns.forEach(b => b.classList.remove('active-discount'));
            renderCart();
        });
    }

    discountBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const isAlreadyActive = e.target.classList.contains('active-discount');
            discountBtns.forEach(b => b.classList.remove('active-discount'));
            
            if (isAlreadyActive) {
                activeDiscountPercent = null;
                if (cartDiscount) cartDiscount.value = '';
                renderCart();
                return;
            }

            e.target.classList.add('active-discount');
            const percent = parseInt(e.target.getAttribute('data-percent'), 10);
            let subtotal = 0;
            state.cart.forEach(item => subtotal += (item.precio_venta || 0) * item.qty);
            
            if (subtotal > 0 && cartDiscount) {
                activeDiscountPercent = percent;
                const discountAmount = (subtotal * (percent / 100)).toFixed(2);
                cartDiscount.value = discountAmount;
                renderCart();
            } else if (cartDiscount) {
                activeDiscountPercent = null;
                cartDiscount.value = '';
                e.target.classList.remove('active-discount');
                renderCart();
            }
        });
    });

    if (paymentMethod) {
        paymentMethod.addEventListener('change', (e) => {
            if (e.target.value === 'Ambos') {
                if (splitPaymentSection) splitPaymentSection.classList.remove('hidden');
                if (splitEfectivo) splitEfectivo.value = '';
                if (splitYape) splitYape.value = '';
            } else {
                if (splitPaymentSection) splitPaymentSection.classList.add('hidden');
            }
        });
    }

    // --- COBRAR Y GENERAR BOLETA ---
    if (cobrarBtn) {
        cobrarBtn.addEventListener('click', async () => {
            if (isProcessingSale) return;
            if (state.cart.length === 0) {
                await customAlert('El ticket está vacío.', 'Aviso', '⚠️');
                return;
            }
            
            const saleItems = state.cart.map(item => ({ ...item }));
            if (saleItems.some(item => !Number.isSafeInteger(item.qty) || item.qty <= 0 ||
                !Number.isFinite(Number(item.precio_venta)) || Number(item.precio_venta) < 0)) {
                await customAlert('Revisa los precios y cantidades del ticket.', 'Datos inválidos', '⚠️');
                return;
            }
            const subtotal = roundMoney(saleItems.reduce((sum, item) => sum + Number(item.precio_venta || 0) * item.qty, 0));
            
            const discount = Number(cartDiscount ? cartDiscount.value : 0);
            if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) {
                await customAlert('El descuento debe estar entre cero y el subtotal del ticket.', 'Descuento inválido', '⚠️');
                return;
            }
            const total = roundMoney(subtotal - discount);
            const metodo = paymentMethod ? paymentMethod.value : 'Efectivo';
            let efectivo = metodo === 'Efectivo' ? total : 0;
            let yape = metodo === 'Yape' ? total : 0;

            if (!['Efectivo', 'Yape', 'Ambos'].includes(metodo)) {
                await customAlert('Selecciona un método de pago válido.', 'Pago inválido', '⚠️');
                return;
            }

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
                    await customAlert(`Los montos divididos (S/ ${(ef + yp).toFixed(2)}) no coinciden con el total a pagar (S/ ${total.toFixed(2)}).`, 'Montos incorrectos', '⚠️');
                    return;
                }
            }

            const appliedStockUpdates = [];
            let saleRecorded = false;
            try {
                isProcessingSale = true;
                cobrarBtn.disabled = true;
                cobrarBtn.textContent = 'Procesando...';

                // Agrupar descuentos necesarios
                const stockUpdates = new Map();
                const addStockRequirement = (id, quantity) => {
                    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                        throw new Error('El combo contiene una cantidad inválida. Revisa su configuración.');
                    }
                    const key = String(id);
                    stockUpdates.set(key, (stockUpdates.get(key) || 0) + quantity);
                };
                for (const item of saleItems) {
                    if (item.codigo && item.codigo.startsWith('COMBO:')) {
                        const parts = item.codigo.slice('COMBO:'.length).split(',');
                        for (const part of parts) {
                            const component = /^(.+)-([1-9]\d*)$/.exec(part);
                            if (!component) throw new Error('El combo contiene productos o cantidades inválidos. Revisa su configuración.');
                            addStockRequirement(component[1], Number(component[2]) * item.qty);
                        }
                    } else {
                        addStockRequirement(item.id, item.qty);
                    }
                }

                let costoTotalVenta = 0;

                // Descontar únicamente del stock numérico (sin tocar lotes de vencimiento)
                const pendingStockUpdates = [];
                for (const [id, qtyToDeduct] of stockUpdates) {
                    const dbProd = state.globalProducts.find(p => String(p.id) === id);
                    if (!dbProd) throw new Error('Un producto del ticket ya no está disponible. Actualiza el inventario.');
                    costoTotalVenta += (Number(dbProd.precio_compra) || 0) * qtyToDeduct;
                    if (dbProd.stock !== null) {
                        const previousStock = Number(dbProd.stock);
                        if (!Number.isSafeInteger(previousStock) || previousStock < qtyToDeduct) {
                            throw new Error(`Stock insuficiente para ${dbProd.nombre}. Disponible: ${dbProd.stock}.`);
                        }
                        pendingStockUpdates.push({ id: dbProd.id, previousStock, newStock: previousStock - qtyToDeduct });
                    }
                }

                for (const update of pendingStockUpdates) {
                    const { data, error } = await supabase.from('productos').update({ stock: update.newStock })
                        .eq('id', update.id).eq('local', state.currentLocal).eq('stock', update.previousStock).select('id');
                    if (error) throw error;
                    if (!data || data.length !== 1) throw new Error('El stock cambió en otra caja. Actualiza el inventario y vuelve a intentarlo.');
                    appliedStockUpdates.push(update);
                }
                
                // Guardar la venta en la tabla 'ventas'
                const { error: saleError } = await supabase.from('ventas').insert([{
                        subtotal: subtotal,
                        descuento: discount,
                        total: total,
                        metodo_pago: metodo,
                        efectivo,
                        yape,
                        costo_total: roundMoney(costoTotalVenta),
                        detalles: saleItems,
                        local: state.currentLocal
                    }]);
                if (saleError) throw saleError;
                saleRecorded = true;

                // Limpiar al confirmar el registro; el cierre de una boleta anterior no debe borrar otra venta.
                state.cart = [];
                activeDiscountPercent = null;
                if (cartDiscount) cartDiscount.value = '';
                discountBtns.forEach(b => b.classList.remove('active-discount'));
                renderCart();
                if (paymentMethod) paymentMethod.value = 'Efectivo';
                if (splitEfectivo) splitEfectivo.value = '';
                if (splitYape) splitYape.value = '';
                if (splitPaymentSection) splitPaymentSection.classList.add('hidden');

                // Generar Boleta / Ticket
                const receiptModal = document.getElementById('receiptModal');
                if (receiptModal) {
                    document.getElementById('receiptLocalName').textContent = 'Local: ' + state.currentLocal;
                    const now = new Date();
                    document.getElementById('receiptDate').textContent = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
                    
                    const tbody = document.getElementById('receiptItems');
                    tbody.innerHTML = '';
                    saleItems.forEach(item => {
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
                        document.getElementById('receiptPaymentMethod').textContent = `S/ ${efectivo.toFixed(2)} Efvo | S/ ${yape.toFixed(2)} Yape`;
                    } else {
                        document.getElementById('receiptPaymentMethod').textContent = 'Pago: ' + metodo;
                    }
                    
                    receiptModal.classList.remove('hidden');
                    
                    const finishSale = () => {
                        receiptModal.classList.add('hidden');
                        clearTimeout(autoPrintTimeout);
                        window.removeEventListener('afterprint', finishSale);
                    };

                    document.getElementById('closeReceiptBtn').onclick = finishSale;
                    document.getElementById('printReceiptBtn').onclick = () => window.print();

                    const autoPrintTimeout = setTimeout(() => {
                        window.addEventListener('afterprint', finishSale);
                        window.print();
                    }, 500);

                }

                if (typeof onSaleCompleted === 'function') {
                    await onSaleCompleted();
                }

            } catch (err) {
                const rollbackErrors = [];
                if (!saleRecorded) {
                    for (const update of appliedStockUpdates.reverse()) {
                        try {
                            const { data, error } = await supabase.from('productos').update({ stock: update.previousStock })
                                .eq('id', update.id).eq('local', state.currentLocal).eq('stock', update.newStock).select('id');
                            if (error) throw error;
                            if (!data || data.length !== 1) throw new Error(`El stock del producto ${update.id} cambió durante la restauración.`);
                        } catch (rollbackError) {
                            rollbackErrors.push(rollbackError.message);
                        }
                    }
                }
                let message = saleRecorded ? 'La venta fue registrada, pero no se pudo completar la actualización de pantalla: ' : 'No se pudo registrar la venta: ';
                message += err.message;
                if (rollbackErrors.length) message += '\nNo se pudo restaurar todo el stock. Revisa el inventario antes de volver a cobrar.\n' + rollbackErrors.join('\n');
                await customAlert(message, 'Error', '⚠️');
            } finally {
                isProcessingSale = false;
                cobrarBtn.disabled = false;
                cobrarBtn.textContent = 'Cobrar';
            }
        });
    }

    return {
        renderPosGrid,
        addToCart,
        renderCart
    };
}
