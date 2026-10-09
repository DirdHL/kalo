import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { ADMIN_EMAILS } from "./constants.js";
import { customAlert, customConfirm } from "./ui.js";

export function setupAuth({ onLoginSuccess }) {
    const loginCard = document.getElementById('loginCard');
    const appView = document.getElementById('appView');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const loginStatusMsg = document.getElementById('loginStatusMsg');
    const logoutBtn = document.getElementById('logoutBtn');
    const productList = document.getElementById('productList');

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
            state.currentUserEmail = session.user.email;
            
            // Verificación de permisos por local
            let hasAccess = false;
            
            if (ADMIN_EMAILS.includes(state.currentUserEmail)) {
                hasAccess = true;
            } else if (state.currentLocal === 'LAS BRISAS' && state.currentUserEmail === 'lasbrisas_kalo@gmail.com') {
                hasAccess = true;
            } else if (state.currentLocal === 'LOS PINOS' && state.currentUserEmail === 'lospinos_kalo@gmail.com') {
                hasAccess = true;
            } else if (state.currentLocal === 'EL POLIDEPORTIVO' && state.currentUserEmail === 'poli_kalo@gmail.com') {
                hasAccess = true;
            }
            
            const pathUrl = window.location.pathname.toLowerCase();
            if (pathUrl.endsWith('/') || pathUrl.endsWith('index.html')) {
                hasAccess = true;
            }

            if (!hasAccess) {
                await supabase.auth.signOut();
                state.currentUserEmail = null;
                await customAlert('Tu cuenta no tiene permiso para acceder a la sucursal de ' + state.currentLocal, 'Acceso Denegado', '⛔');
                window.location.href = './index.html';
                return;
            }

            if (loginCard) loginCard.classList.add('hidden');
            if (appView) appView.classList.remove('hidden');
            if (typeof onLoginSuccess === 'function') {
                onLoginSuccess();
            }
        } else {
            state.currentUserEmail = null;
            if (appView) appView.classList.add('hidden');
            if (loginCard) loginCard.classList.remove('hidden');
            if (productList) productList.innerHTML = '';
        }
    });

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = emailInput ? emailInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';
            if (!email || !password) {
                if (loginStatusMsg) loginStatusMsg.textContent = 'Ingresa correo y contraseña.';
                return;
            }

            try {
                loginBtn.textContent = 'Iniciando...';
                if (loginStatusMsg) loginStatusMsg.textContent = '';
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } catch (error) {
                if (loginStatusMsg) loginStatusMsg.textContent = 'Error: Credenciales inválidas.';
            } finally {
                loginBtn.textContent = 'Entrar';
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const confirmed = await customConfirm('¿Estás seguro de que deseas cerrar sesión?', 'Cerrar Sesión', '🚪');
            if (!confirmed) return;
            await supabase.auth.signOut();
            if (emailInput) emailInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (productList) productList.innerHTML = '';
            state.currentUserEmail = null;
            window.location.href = './index.html';
        });
    }
}
