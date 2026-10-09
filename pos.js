import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { customAlert } from "./ui.js";

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

    // --- RENDER CUADRÍCULA POS ---
    function renderPosGrid(productsToRender, resetPage = false) {
        if (!posGrid) return;
        if (resetPage) posCurrentPage = 1;
        posFilteredProducts = productsToRender || state.globalProducts;

        posGrid.innerHTML = '';
        const totalPages = Math.ceil(posFilteredProducts.length / posItemsPerPage) || 1;
        const startIndex = (posCurrentPage - 1) * posItemsPerPage;
        const endIndex = startIndex + posItemsPerPage;
        const paginatedItems = posFilteredProducts.slice(startIndex, endIndex);

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
        const term = posSearch ? posSearch.value.toLowerCase() : '';
        const filtered = state.globalProducts.filter(p => {
            const matchSearch = p.nombre.toLowerCase().includes(term) || (p.codigo && p.codigo.toLowerCase().includes(term));
            const matchCat = posCurrentCategory === 'Todos' || p.categoria === posCurrentCategory;
            return matchSearch && matchCat;
        });
        renderPosGrid(filtered, true);
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
        const existing = state.cart.find(item => item.id === prod.id);
        if (existing) {
            existing.qty++;
        } else {
            state.cart.push({ ...prod, qty: 1 });
        }
        renderCart();
    }

    function updateQty(index, delta) {
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

        const discount = parseFloat(cartDiscount ? cartDiscount.value : 0) || 0;
        const total = Math.max(0, subtotal - discount);
        cartTotalValue.textContent = `S/ ${total.toFixed(2)}`;
    }

    if (cartDiscount) {
        cartDiscount.addEventListener('input', () => {
            discountBtns.forEach(b => b.classList.remove('active-discount'));
            renderCart();
        });
    }

    discountBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const isAlreadyActive = e.target.classList.contains('active-discount');
            discountBtns.forEach(b => b.classList.remove('active-discount'));
            
            if (isAlreadyActive) {
                if (cartDiscount) cartDiscount.value = '';
                renderCart();
                return;
            }

            e.target.classList.add('active-discount');
            const percent = parseInt(e.target.getAttribute('data-percent'), 10);
            let subtotal = 0;
            state.cart.forEach(item => subtotal += (item.precio_venta || 0) * item.qty);
            
            if (subtotal > 0 && cartDiscount) {
                const discountAmount = (subtotal * (percent / 100)).toFixed(2);
                cartDiscount.value = discountAmount;
                renderCart();
            } else if (cartDiscount) {
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
            if (state.cart.length === 0) {
                await customAlert('El ticket está vacío.', 'Aviso', '⚠️');
                return;
            }
            
            let subtotal = 0;
            state.cart.forEach(item => subtotal += (item.precio_venta || 0) * item.qty);
            
            const discount = parseFloat(cartDiscount ? cartDiscount.value : 0) || 0;
            const total = Math.max(0, subtotal - discount);
            const metodo = paymentMethod ? paymentMethod.value : 'Efectivo';

            if (metodo === 'Ambos') {
                const ef = parseFloat(splitEfectivo.value) || 0;
                const yp = parseFloat(splitYape.value) || 0;
                
                if (Math.abs((ef + yp) - total) > 0.01) {
                    await customAlert(`Los montos divididos (S/ ${(ef + yp).toFixed(2)}) no coinciden con el total a pagar (S/ ${total.toFixed(2)}).`, 'Montos incorrectos', '⚠️');
                    return;
                }
            }

            try {
                cobrarBtn.disabled = true;
                cobrarBtn.textContent = 'Procesando...';

                // Agrupar descuentos necesarios
                const stockUpdates = {};
                for (const item of state.cart) {
                    if (item.codigo && item.codigo.startsWith('COMBO:')) {
                        const parts = item.codigo.replace('COMBO:', '').split(',');
                        for (const part of parts) {
                            if (!part) continue;
                            const [idStrCombo, qtyStr] = part.split('-');
                            const subId = isNaN(idStrCombo) ? idStrCombo : Number(idStrCombo);
                            const subQty = parseInt(qtyStr) * item.qty;
                            stockUpdates[subId] = (stockUpdates[subId] || 0) + subQty;
                        }
                    } else {
                        stockUpdates[item.id] = (stockUpdates[item.id] || 0) + item.qty;
                    }
                }

                let costoTotalVenta = 0;

                // Descontar únicamente del stock numérico (sin tocar lotes de vencimiento)
                for (const [idStr, qtyToDeduct] of Object.entries(stockUpdates)) {
                    const prodId = isNaN(idStr) ? idStr : Number(idStr);
                    const dbProd = state.globalProducts.find(p => p.id === prodId);
                    if (dbProd) {
                        costoTotalVenta += (parseFloat(dbProd.precio_compra) || 0) * qtyToDeduct;
                        if (dbProd.stock !== null) {
                            let newStock = Math.max(0, dbProd.stock - qtyToDeduct);
                            const { error: updateErr } = await supabase.from('productos').update({ stock: newStock }).eq('id', prodId);
                            if (updateErr) {
                                console.error('Error descontando stock para producto', prodId, updateErr);
                            }
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
                        detalles: state.cart,
                        local: state.currentLocal
                    }]);
                } catch(e) {
                    console.error("Error al registrar venta:", e);
                }

                // Generar Boleta / Ticket
                const receiptModal = document.getElementById('receiptModal');
                if (receiptModal) {
                    document.getElementById('receiptLocalName').textContent = 'Local: ' + state.currentLocal;
                    const now = new Date();
                    document.getElementById('receiptDate').textContent = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
                    
                    const tbody = document.getElementById('receiptItems');
                    tbody.innerHTML = '';
                    state.cart.forEach(item => {
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
                        state.cart = [];
                        if (cartDiscount) cartDiscount.value = '';
                        discountBtns.forEach(b => b.classList.remove('active-discount'));
                        renderCart();
                        if (splitPaymentSection) splitPaymentSection.classList.add('hidden');
                        window.removeEventListener('afterprint', finishSale);
                    };

                    document.getElementById('closeReceiptBtn').onclick = finishSale;
                    document.getElementById('printReceiptBtn').onclick = () => window.print();

                    setTimeout(() => {
                        window.addEventListener('afterprint', finishSale);
                        window.print();
                    }, 500);

                } else {
                    state.cart = [];
                    if (cartDiscount) cartDiscount.value = '';
                    discountBtns.forEach(b => b.classList.remove('active-discount'));
                    renderCart();
                    if (splitPaymentSection) splitPaymentSection.classList.add('hidden');
                }

                if (typeof onSaleCompleted === 'function') {
                    await onSaleCompleted();
                }

            } catch (err) {
                await customAlert('Error al procesar la venta: ' + err.message, 'Error', '⚠️');
            } finally {
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
