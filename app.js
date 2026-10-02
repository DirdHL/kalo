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
        const productNameInput = document.getElementById('productName');
        const logoutBtn = document.getElementById('logoutBtn');

        // ESCUCHAR CAMBIOS DE SESIÓN MÁGICAMENTE
        // Esto detecta si el usuario está logueado o si cerró sesión
        supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                // Si hay un usuario logueado, ocultamos login y mostramos inventario
                loginCard.classList.add('hidden');
                dashboardCard.classList.remove('hidden');
                loadProducts(); // Cargar la lista solo cuando entra
            } else {
                // Si no hay nadie, mostramos login y ocultamos inventario
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
                
                // Pedirle a Supabase que verifique las credenciales
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) throw error;
                // Si es exitoso, el evento 'onAuthStateChange' se disparará solo.
                
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
                const { data, error } = await supabase.from('productos').select('*');
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
                    
                    // Asegurarnos de saber qué columna usar para borrar (id es lo ideal, si no hay, por nombre)
                    const delCol = prod.id !== undefined ? 'id' : 'nombre';
                    const delVal = prod.id !== undefined ? prod.id : prod.nombre;

                    li.innerHTML = `
                        <span>🏷️ ${prod.nombre}</span>
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
                                await loadProducts(); // Recargar la lista
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
            const productName = productNameInput.value.trim();
            if (!productName) {
                productStatusMsg.textContent = 'El nombre es obligatorio.';
                return;
            }

            try {
                addProductBtn.textContent = 'Guardando...';
                const { error } = await supabase.from('productos').insert([{ nombre: productName }]);
                if (error) throw error;

                productStatusMsg.style.color = '#86efac';
                productStatusMsg.textContent = '¡Guardado!';
                productNameInput.value = '';
                
                await loadProducts();
                
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
