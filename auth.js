
import { supabase } from './supabase.js';

export function setupAuth(loginContainer, appContainer, currentLocal, logoutBtn, userSpan, loginForm, emailInput, passwordInput, loginError, customAlert) {
    
    window.checkSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            loginContainer.style.display = 'none';
            appContainer.style.display = 'flex';
            if (userSpan) userSpan.textContent = session.user.email;
            
            if (typeof window.loadProducts === 'function') await window.loadProducts();
            if (typeof window.loadStats === 'function') await window.loadStats();
        } else {
            loginContainer.style.display = 'flex';
            appContainer.style.display = 'none';
            emailInput.value = '';
            passwordInput.value = '';
            if (loginError) loginError.style.display = 'none';
        }
    };

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value.trim();
            const pass = passwordInput.value;
            
            if (!email || !pass) return;
            
            const btn = loginForm.querySelector('button');
            btn.textContent = 'Iniciando...';
            btn.disabled = true;
            
            const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
            
            btn.textContent = 'Ingresar';
            btn.disabled = false;
            
            if (error) {
                if (loginError) {
                    loginError.textContent = 'Credenciales incorrectas o error de red';
                    loginError.style.display = 'block';
                }
            } else {
                if (loginError) loginError.style.display = 'none';
                window.checkSession();
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (await customConfirm('Seguro que deseas cerrar sesin?', 'Cerrar Sesin', '')) {
                await supabase.auth.signOut();
                window.location.reload();
            }
        });
    }

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            window.location.reload();
        }
    });
}
