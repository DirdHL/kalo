import { supabase } from "./supabase.js";
import { state, resetSessionState } from "./state.js";
import { localPorId, localPorSlug } from "./constants.js";
import { customAlert } from "./ui.js";
import { describeError } from "./utils.js";

const LOCAL_GUARDADO = 'kalo.localAdmin';

function leerLocalGuardado() {
    try { return window.localStorage.getItem(LOCAL_GUARDADO); } catch { return null; }
}

function guardarLocal(localId) {
    try { window.localStorage.setItem(LOCAL_GUARDADO, localId); } catch { /* navegador sin almacenamiento */ }
}

// El cajero siempre entra a su local. El admin, al de la URL (?local=pinos) o al último que usó.
export function resolverLocalInicial(perfil, search = '', guardado = null) {
    if (!perfil) return null;
    if (perfil.rol === 'cajero') return localPorId(perfil.local)?.id || null;
    if (perfil.rol !== 'admin') return null;
    const desdeUrl = localPorSlug(new URLSearchParams(search).get('local'));
    return desdeUrl?.id || localPorId(guardado)?.id || null;
}

// El QR llega como SVG (a veces ya con el prefijo "data:"). Se codifica completo:
// un "#" sin codificar cortaría la imagen en la URL.
export function qrComoImagen(qr) {
    const raw = String(qr ?? '');
    if (raw.startsWith('data:') && raw.includes(';base64,')) return raw;
    const svg = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
    if (!svg.trimStart().startsWith('<')) return raw;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function mensajeLogin(error) {
    const message = String(error?.message || '');
    if (error?.status === 429 || /rate limit|too many/i.test(message)) return 'Demasiados intentos. Espera unos minutos y vuelve a intentar.';
    if (/invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.';
    if (/email not confirmed/i.test(message)) return 'La cuenta aún no está confirmada. Pide ayuda al administrador.';
    return describeError(error);
}

export function setupAuth({ onReady, onSignedOut, onMfaChanged } = {}) {
    const $ = id => document.getElementById(id);
    const bootCard = $('bootCard');
    const loginCard = $('loginCard');
    const mfaCard = $('mfaCard');
    const enrollCard = $('mfaEnrollCard');
    const pickerCard = $('localPicker');
    const appView = $('appView');
    const pantallas = [bootCard, loginCard, mfaCard, enrollCard, pickerCard, appView].filter(Boolean);

    const loginForm = $('loginForm');
    const emailInput = $('emailInput');
    const passwordInput = $('passwordInput');
    const loginBtn = $('loginBtn');
    const loginStatus = $('loginStatusMsg');

    const mfaForm = $('mfaForm');
    const mfaInput = $('mfaCodeInput');
    const mfaVerifyBtn = $('mfaVerifyBtn');
    const mfaStatus = $('mfaStatusMsg');

    const enrollForm = $('mfaEnrollForm');
    const enrollInput = $('mfaEnrollCodeInput');
    const enrollBtn = $('mfaEnrollBtn');
    const enrollStatus = $('mfaEnrollStatusMsg');
    const enrollIntro = $('mfaEnrollIntro');
    const enrollLaterBtn = $('mfaEnrollLaterBtn');
    const qrImage = $('mfaQrImg');
    const secretText = $('mfaSecret');

    const pickerGrid = $('localPickerGrid');
    const pickerBackBtn = $('localPickerBackBtn');

    function mostrar(pantalla) {
        for (const el of pantallas) el.classList.toggle('hidden', el !== pantalla);
    }

    function setStatus(el, text) {
        if (el) el.textContent = text || '';
    }

    async function cargarPerfil() {
        const { data, error } = await supabase.rpc('mi_perfil');
        if (error) throw error;
        if (!data) throw new Error('No encontramos tu cuenta.');
        return { email: data.email, rol: data.rol, local: data.local, aal: data.aal, esAdmin: data.admin_activo === true };
    }

    async function estadoMfa() {
        const [factores, nivel] = await Promise.all([
            supabase.auth.mfa.listFactors(),
            supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        ]);
        if (factores.error) throw factores.error;
        if (nivel.error) throw nivel.error;
        const verificado = (factores.data?.totp || []).find(factor => factor.status === 'verified') || null;
        return { verificado, nivel: nivel.data?.currentLevel || 'aal1' };
    }

    async function cerrarSesion(mensaje = '') {
        // scope local: cierra solo este equipo (las demás cajas con la misma cuenta siguen abiertas).
        try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* la sesión local se limpia igual */ }
        resetSessionState();
        if (passwordInput) passwordInput.value = '';
        setStatus(loginStatus, mensaje);
        mostrar(loginCard);
        onSignedOut?.();
    }

    async function continuarSesion() {
        let perfil;
        try {
            perfil = await cargarPerfil();
        } catch (error) {
            await cerrarSesion(describeError(error));
            return;
        }
        if (perfil.rol !== 'admin' && perfil.rol !== 'cajero') {
            await cerrarSesion('Tu cuenta no tiene acceso a Kalo. Pide al administrador que te asigne un local.');
            return;
        }
        if (perfil.rol === 'cajero' && !localPorId(perfil.local)) {
            await cerrarSesion('Tu cuenta no tiene un local válido asignado. Avísale al administrador.');
            return;
        }

        let mfaPendiente = false;
        if (perfil.rol === 'admin') {
            let mfa;
            try {
                mfa = await estadoMfa();
            } catch (error) {
                await cerrarSesion(describeError(error));
                return;
            }
            if (mfa.verificado && mfa.nivel !== 'aal2') {
                pedirCodigo(mfa.verificado);
                return;
            }
            if (!mfa.verificado && !perfil.esAdmin) {
                // La base exige 2FA a los admins (fase C) y esta cuenta aún no lo activó.
                await iniciarActivacion({ obligatoria: true });
                return;
            }
            mfaPendiente = !mfa.verificado;
        }

        state.perfil = perfil;
        state.mfaPendiente = mfaPendiente;
        const local = resolverLocalInicial(perfil, window.location.search, leerLocalGuardado());
        if (local) entrarAlLocal(local);
        else mostrarSelectorDeLocal();
    }

    function entrarAlLocal(localId) {
        if (!localPorId(localId)) return;
        if (state.perfil?.rol === 'cajero' && localId !== state.perfil.local) return;
        if (localId === state.currentLocal) {
            mostrar(appView);
            return;
        }
        state.currentLocal = localId;
        state.cart = [];
        if (state.perfil?.rol === 'admin') {
            guardarLocal(localId);
            const url = new URL(window.location.href);
            url.searchParams.set('local', localPorId(localId).slug);
            window.history.replaceState(null, '', url);
        }
        mostrar(appView);
        onReady?.(state.perfil);
    }

    function mostrarSelectorDeLocal() {
        if (!pickerCard) return;
        pickerGrid?.querySelectorAll('[data-local]').forEach(button => {
            button.classList.toggle('is-current', button.dataset.local === state.currentLocal);
        });
        pickerBackBtn?.classList.toggle('hidden', !state.currentLocal);
        mostrar(pickerCard);
    }

    function pedirCodigo(factor) {
        setStatus(mfaStatus, '');
        if (mfaInput) mfaInput.value = '';
        mostrar(mfaCard);
        mfaInput?.focus();
        mfaForm.onsubmit = async event => {
            event.preventDefault();
            const code = mfaInput.value.replace(/\s+/g, '');
            if (!/^\d{6}$/.test(code)) {
                setStatus(mfaStatus, 'Escribe los 6 dígitos que muestra tu app de autenticación.');
                return;
            }
            mfaVerifyBtn.disabled = true;
            const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
            mfaVerifyBtn.disabled = false;
            if (error) {
                setStatus(mfaStatus, 'Código incorrecto o vencido. Prueba con el código que aparece ahora.');
                mfaInput.select();
                return;
            }
            await continuarSesion();
        };
    }

    async function iniciarActivacion({ obligatoria }) {
        let enrolado;
        try {
            const { data: factores, error: listError } = await supabase.auth.mfa.listFactors();
            if (listError) throw listError;
            for (const factor of factores?.all || []) {
                if (factor.factor_type === 'totp' && factor.status !== 'verified') {
                    await supabase.auth.mfa.unenroll({ factorId: factor.id });
                }
            }
            const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Kalo' });
            if (error) throw error;
            enrolado = data;
        } catch (error) {
            const message = /disabled|not enabled/i.test(String(error?.message))
                ? 'La verificación en dos pasos está desactivada en Supabase (Authentication → Multi-Factor → TOTP).'
                : describeError(error);
            if (obligatoria) await cerrarSesion(message);
            else await customAlert(message, 'No se pudo activar', '⚠️');
            return;
        }

        if (qrImage) qrImage.src = qrComoImagen(enrolado.totp?.qr_code);
        setStatus(secretText, enrolado.totp?.secret || '');
        setStatus(enrollIntro, obligatoria
            ? 'Para entrar como administrador necesitas la verificación en dos pasos. Escanea el código con Google Authenticator, Microsoft Authenticator o similar.'
            : 'Protege tu cuenta de administrador: además de la contraseña, se pedirá un código de tu celular. Escanea el código con Google Authenticator, Microsoft Authenticator o similar.');
        setStatus(enrollStatus, '');
        if (enrollInput) enrollInput.value = '';
        enrollLaterBtn?.classList.toggle('hidden', obligatoria);
        mostrar(enrollCard);
        enrollInput?.focus();

        enrollForm.onsubmit = async event => {
            event.preventDefault();
            const code = enrollInput.value.replace(/\s+/g, '');
            if (!/^\d{6}$/.test(code)) {
                setStatus(enrollStatus, 'Escribe los 6 dígitos que muestra la app.');
                return;
            }
            enrollBtn.disabled = true;
            const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolado.id, code });
            enrollBtn.disabled = false;
            if (error) {
                setStatus(enrollStatus, 'El código no coincide. Revisa la hora del celular y prueba con el código actual.');
                enrollInput.select();
                return;
            }
            state.mfaPendiente = false;
            await customAlert('Desde ahora, al entrar se te pedirá el código de 6 dígitos de tu app.', 'Verificación activada', '✅');
            if (state.perfil && state.currentLocal) {
                mostrar(appView);
                onMfaChanged?.();
            } else {
                await continuarSesion();
            }
        };
        if (enrollLaterBtn) {
            enrollLaterBtn.onclick = () => {
                if (state.perfil && state.currentLocal) mostrar(appView);
                else continuarSesion();
            };
        }
    }

    loginForm?.addEventListener('submit', async event => {
        event.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!email || !password) {
            setStatus(loginStatus, 'Ingresa tu correo y contraseña.');
            return;
        }
        loginBtn.disabled = true;
        loginBtn.textContent = 'Ingresando...';
        setStatus(loginStatus, '');
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            passwordInput.value = '';
            await continuarSesion();
        } catch (error) {
            setStatus(loginStatus, mensajeLogin(error));
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Entrar';
        }
    });

    pickerGrid?.addEventListener('click', event => {
        const button = event.target.closest('[data-local]');
        if (button) entrarAlLocal(button.dataset.local);
    });
    pickerBackBtn?.addEventListener('click', () => mostrar(appView));
    document.querySelectorAll('[data-action="logout-gate"]').forEach(button => {
        button.addEventListener('click', () => cerrarSesion(''));
    });

    // Supabase pide no llamar a sus métodos dentro de este callback: solo se actualiza la pantalla.
    supabase.auth.onAuthStateChange(event => {
        if (event !== 'SIGNED_OUT') return;
        setTimeout(() => {
            if (!state.perfil) return;
            resetSessionState();
            setStatus(loginStatus, 'Tu sesión terminó. Vuelve a iniciar sesión.');
            mostrar(loginCard);
            onSignedOut?.();
        }, 0);
    });

    (async () => {
        mostrar(bootCard);
        let session = null;
        try {
            ({ data: { session } } = await supabase.auth.getSession());
        } catch {
            session = null;
        }
        if (session) await continuarSesion();
        else mostrar(loginCard);
    })();

    return {
        cerrarSesion: () => cerrarSesion(''),
        mostrarSelectorDeLocal,
        activarMfa: () => iniciarActivacion({ obligatoria: false })
    };
}
