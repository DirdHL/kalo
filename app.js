import { createClient } from '@supabase/supabase-js';

// Envolvemos todo en un bloque para capturar errores críticos
try {
    // ¡Tus credenciales seguras leídas desde el archivo .env!
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    document.addEventListener('DOMContentLoaded', () => {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Nodos del DOM (Pantallas)
        const loginCard = document.getElementById('loginCard');
        const dashboardCard = document.getElementById('dashboardCard');
        
        // Nodos del Login
        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');
        const loginBtn = document.getElementById('loginBtn');
        const loginStatusMsg = document.getElementById('loginStatusMsg');
        
        // Nodos del Inventario
        const productList = document.getElementById('productList');
        const productStatusMsg = document.getElementById('productStatusMsg');
        const addProductBtn = document.getElementById('addProductBtn');
        const productCodeInput = document.getElementById('productCode');
        const productNameInput = document.getElementById('productName');
        const logoutBtn = document.getElementById('logoutBtn');

        // Escuchar "Enter" en el código de barras (así funcionan las lectoras)
        productCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                productNameInput.focus(); // Pasar al nombre al escanear
            }
        });

        // ESCUCHAR CAMBIOS DE SESIÓN MÁGICAMENTE
        supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                loginCard.classList.add('hidden');
                dashboardCard.classList.remove('hidden');
                loadProducts(); 
                productCodeInput.focus(); // Enfocar para escanear rápido
            } else {
                dashboardCard.classList.add('hidden');
                loginCard.classList.remove('hidden');
            }
        });

        // 1. INICIAR SESIÓN
        loginBtn.addEventListener('click', async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            
            if (!email || !password) {
                loginStatusMsg.textContent = 'Ingresa correo y contraseña.';
                return;
            }

            try {
                loginBtn.textContent = 'Iniciando...';
                loginStatusMsg.textContent = '';
                
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) throw error;
                
            } catch (error) {
                console.error(error);
                loginStatusMsg.textContent = 'Error: Credenciales inválidas o usuario no existe.';
            } finally {
                loginBtn.textContent = 'Entrar';
            }
        });

        // 2. CERRAR SESIÓN
        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut();
            emailInput.value = '';
            passwordInput.value = '';
            productList.innerHTML = '';
        });

        // 3. CARGAR PRODUCTOS
        async function loadProducts() {
            try {
                // Ordenar por más reciente primero
                const { data, error } = await supabase.from('productos').select('*').order('id', { ascending: false });
                if (error) throw error;

                productList.innerHTML = ''; 
                
                if (data.length === 0) {
                    productList.innerHTML = '<li style="padding: 0.5rem; text-align: center; color: rgba(255,255,255,0.5);">No hay productos registrados aún.</li>';
                    return;
                }

                data.forEach(prod => {
                    const li = document.createElement('li');
                    li.style.marginBottom = '0.5rem';
                    li.style.padding = '0.75rem';
                    li.style.background = 'rgba(255,255,255,0.05)';
                    li.style.border = '1px solid rgba(255,255,255,0.1)';
                    li.style.borderRadius = '8px';
                    li.style.display = 'flex';
                    li.style.alignItems = 'center';
                    li.style.justifyContent = 'space-between';
                    
                    const delCol = prod.id !== undefined ? 'id' : 'nombre';
                    const delVal = prod.id !== undefined ? prod.id : prod.nombre;

                    const codigoText = prod.codigo ? `[${prod.codigo}] ` : '';

                    li.innerHTML = `
                        <span>🧾 ${codigoText}🏷️ ${prod.nombre}</span>
                        <button class="delete-btn" data-col="${delCol}" data-val="${delVal}" style="background: transparent; border: none; cursor: pointer; font-size: 1.2rem; color: #fca5a5; transition: transform 0.2s; padding: 0 0.5rem;">🗑️</button>
                    `;
                    productList.appendChild(li);
                });

                // Escuchar clics en los botones de eliminar
                document.querySelectorAll('.delete-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const col = e.currentTarget.getAttribute('data-col');
                        const val = e.currentTarget.getAttribute('data-val');
                        
                        if(confirm('¿Seguro que deseas eliminar este producto?')) {
                            try {
                                e.currentTarget.style.opacity = '0.5';
                                const { error } = await supabase.from('productos').delete().eq(col, val);
                                if (error) throw error;
                                await loadProducts();
                            } catch (error) {
                                console.error('Error al eliminar:', error);
                                alert('No se pudo eliminar: ' + error.message);
                                await loadProducts();
                            }
                        }
                    });
                });

            } catch (error) {
                console.error('Error al cargar:', error);
                productList.innerHTML = `<li style="padding: 0.5rem; color: #fca5a5; text-align: center;">Error al cargar: ${error.message}</li>`;
            }
        }

        // 4. AGREGAR PRODUCTO
        addProductBtn.addEventListener('click', async () => {
            const productCode = productCodeInput.value.trim();
            const productName = productNameInput.value.trim();
            
            if (!productName || !productCode) {
                productStatusMsg.textContent = 'El código y el nombre son obligatorios.';
                return;
            }

            try {
                addProductBtn.textContent = 'Guardando...';
                // Insertamos código y nombre a la vez
                const { error } = await supabase.from('productos').insert([{ codigo: productCode, nombre: productName }]);
                if (error) throw error;

                productStatusMsg.style.color = '#86efac';
                productStatusMsg.textContent = '¡Guardado con éxito!';
                productCodeInput.value = '';
                productNameInput.value = '';
                
                await loadProducts();
                
                // Volver a enfocar el código para que escaneen el siguiente producto rápido
                productCodeInput.focus();
                
                setTimeout(() => productStatusMsg.textContent = '', 3000);
            } catch (error) {
                productStatusMsg.style.color = '#fca5a5';
                productStatusMsg.textContent = 'Error: ' + error.message;
            } finally {
                addProductBtn.textContent = 'Guardar Producto';
            }
        });
    });

} catch (error) {
    console.error("Error crítico en la inicialización:", error);
}
