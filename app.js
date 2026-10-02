import { createClient } from '@supabase/supabase-js';

try {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    document.addEventListener('DOMContentLoaded', () => {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Nodos Principales
        const loginCard = document.getElementById('loginCard');
        const dashboardCard = document.getElementById('dashboardCard');
        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');
        const loginBtn = document.getElementById('loginBtn');
        const loginStatusMsg = document.getElementById('loginStatusMsg');
        const logoutBtn = document.getElementById('logoutBtn');
        const productList = document.getElementById('productList');

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
            'Agua_Loa_1l_chupon.svg',
            'Agua_Loa_3L.svg',
            'Agua_Loa_625ml.svg',
            'Agua_cielo_2.5_litros_Sin_Gas.svg',
            'Agua_cielo_625ml_Sin_Gas.svg',
            'Agua_cielo_chupon_1lt_Sin_Gas.svg'
        ];

        // --- MANEJO DEL MODAL DE IMÁGENES ---
        openImagePickerBtn.addEventListener('click', () => {
            imagePickerModal.classList.remove('hidden');
            renderImageGrid();
        });

        closeImagePickerBtn.addEventListener('click', () => {
            imagePickerModal.classList.add('hidden');
        });

        function renderImageGrid() {
            imageGrid.innerHTML = '';
            availableImages.forEach(imgName => {
                const div = document.createElement('div');
                div.className = 'image-option';

                // Usamos import.meta.env.BASE_URL para que funcione tanto en localhost como en GitHub Pages (/kalo/)
                div.innerHTML = `
                    <img src="${import.meta.env.BASE_URL}img/${imgName}" alt="${imgName}" onerror="this.src='https://via.placeholder.com/100?text=Falta+Foto'">
                    <p>${imgName}</p>
                `;
                div.addEventListener('click', () => {
                    selectedImageName = imgName;
                    previewImg.src = `${import.meta.env.BASE_URL}img/${imgName}`;
                    imagePickerModal.classList.add('hidden');
                });
                imageGrid.appendChild(div);
            });
        }

        // --- MANEJO DEL MODAL ---
        openModalBtn.addEventListener('click', () => {
            productModal.classList.remove('hidden');
            productCodeInput.focus();
        });

        closeModalBtn.addEventListener('click', () => {
            productModal.classList.add('hidden');
            limpiarFormulario();
        });

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
            gananciaInput.value = ganancia > 0 ? `+ $${ganancia.toFixed(2)}` : `$${ganancia.toFixed(2)}`;
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

        // --- AUTENTICACIÓN ---
        supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                loginCard.classList.add('hidden');
                dashboardCard.classList.remove('hidden');
                loadProducts();
            } else {
                dashboardCard.classList.add('hidden');
                loginCard.classList.remove('hidden');
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

                productList.innerHTML = '';

                if (data.length === 0) {
                    productList.innerHTML = '<tr><td colspan="8" style="text-align:center; color:gray">No hay productos registrados.</td></tr>';
                    return;
                }

                data.forEach(prod => {
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
                    const pCompra = prod.precio_compra ? `$${prod.precio_compra.toFixed(2)}` : '—';
                    const pVenta = prod.precio_venta ? `$${prod.precio_venta.toFixed(2)}` : '—';
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

                document.querySelectorAll('.edit-btn').forEach((btn, index) => {
                    btn.addEventListener('click', () => {
                        abrirModalEdicion(data[index]);
                    });
                });

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

            } catch (error) {
                productList.innerHTML = `<tr><td colspan="6" style="color:#fca5a5; text-align:center">Error al cargar: ${error.message}</td></tr>`;
            }
        }

        // --- AGREGAR PRODUCTO ---
        addProductBtn.addEventListener('click', async () => {
            const productCode = productCodeInput.value.trim();
            const productName = productNameInput.value.trim();
            const pCompra = parseFloat(precioCompraInput.value) || null;
            const pVenta = parseFloat(precioVentaInput.value) || null;
            const stock = parseInt(stockInput.value) || null;
            const alerta = parseInt(alertaStockInput.value) || null;
            const cat = categoriaInput.value;

            if (!productName || !productCode) {
                productStatusMsg.textContent = 'El código y el nombre son obligatorios.';
                return;
            }

            try {
                addProductBtn.textContent = 'Guardando...';

                const payload = {
                    codigo: productCode,
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
    });

} catch (error) {
    console.error("Error crítico:", error);
}
