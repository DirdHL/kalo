// Envolvemos todo en un bloque para capturar errores críticos (como bloqueos del navegador o de Antigravity)
try {
    // ¡Tus credenciales fijas!
    const SUPABASE_URL = 'https://zdomrtadukszbsavopuo.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkb21ydGFkdWtzemJzYXZvcHVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NjUxNzUsImV4cCI6MjEwNjQ0MTE3NX0.qIK-MYiAJlxBwstPbtXhVRyHALlFFJ0yQQKST-a3iL0';

    document.addEventListener('DOMContentLoaded', () => {
        const productList = document.getElementById('productList');
        const productStatusMsg = document.getElementById('productStatusMsg');
        const addProductBtn = document.getElementById('addProductBtn');
        const productNameInput = document.getElementById('productName');

        // Verificar si la librería cargó correctamente de internet
        if (typeof window.supabase === 'undefined') {
            productList.innerHTML = '<li style="color: #fca5a5; padding: 1rem; text-align: center;">❌ Error: No se pudo cargar Supabase. Es posible que tu vista previa esté bloqueando scripts de internet. Intenta abrir el archivo directamente en Chrome.</li>';
            return;
        }

        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
                    li.innerHTML = `<span>🏷️ ${prod.nombre}</span>`;
                    productList.appendChild(li);
                });
            } catch (error) {
                console.error('Error al cargar:', error);
                productList.innerHTML = `<li style="padding: 0.5rem; color: #fca5a5; text-align: center;">Error al cargar: ${error.message}</li>`;
            }
        }

        loadProducts();

        addProductBtn.addEventListener('click', async () => {
            const productName = productNameInput.value.trim();
            if (!productName) {
                productStatusMsg.textContent = 'El nombre es obligatorio.';
                return;
            }

            try {
                addProductBtn.textContent = 'Guardando...';
                const { data, error } = await supabase.from('productos').insert([{ nombre: productName }]);
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
    // Mostrar error si la vista previa falla silenciosamente
    setTimeout(() => {
        const list = document.getElementById('productList');
        if(list) list.innerHTML = `<li style="color: red;">Error crítico en el código: ${error.message}</li>`;
    }, 1000);
}
