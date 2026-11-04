// Diálogos, avisos breves y detalles de interfaz compartidos.

let dialogQueue = Promise.resolve();

// Un diálogo a la vez: si se pide otro mientras uno está abierto, espera su turno.
function enqueue(open) {
    const run = dialogQueue.then(open, open);
    dialogQueue = run.catch(() => {});
    return run;
}

function openDialog({ title, message, icon, okText, cancelText, withInput = false, placeholder = '' }) {
    return new Promise(resolve => {
        const overlay = document.getElementById('customDialogOverlay');
        if (!overlay) {
            if (withInput) resolve({ ok: true, value: (window.prompt(message) || '').trim() });
            else if (cancelText) resolve({ ok: window.confirm(message), value: '' });
            else { window.alert(message); resolve({ ok: true, value: '' }); }
            return;
        }
        const okButton = document.getElementById('customDialogOk');
        const cancelButton = document.getElementById('customDialogCancel');
        const inputWrap = document.getElementById('customDialogInputWrap');
        const input = document.getElementById('customDialogInput');
        document.getElementById('customDialogTitle').textContent = title;
        document.getElementById('customDialogMessage').textContent = message;
        document.getElementById('customDialogIcon').textContent = icon;
        okButton.textContent = okText;
        cancelButton.textContent = cancelText || 'Cancelar';
        cancelButton.classList.toggle('hidden', !cancelText);
        if (inputWrap) inputWrap.classList.toggle('hidden', !withInput);
        if (input) {
            input.value = '';
            input.placeholder = placeholder;
        }

        const previousFocus = document.activeElement;
        overlay.classList.remove('hidden');
        (withInput && input ? input : okButton).focus?.();

        const close = result => {
            overlay.classList.add('hidden');
            okButton.onclick = null;
            cancelButton.onclick = null;
            overlay.onkeydown = null;
            previousFocus?.focus?.();
            resolve(result);
        };
        okButton.onclick = () => close({ ok: true, value: input ? input.value.trim() : '' });
        cancelButton.onclick = () => close({ ok: false, value: '' });
        overlay.onkeydown = event => {
            if (event.key === 'Escape' && cancelText) close({ ok: false, value: '' });
            if (event.key === 'Enter' && withInput) {
                event.preventDefault();
                okButton.click();
            }
        };
    });
}

export function customAlert(message, title = 'Atención', icon = '⚠️') {
    return enqueue(() => openDialog({ title, message, icon, okText: 'Aceptar' })).then(() => undefined);
}

export function customConfirm(message, title = 'Confirmar', icon = '❓') {
    return enqueue(() => openDialog({ title, message, icon, okText: 'Sí, continuar', cancelText: 'Cancelar' }))
        .then(result => result.ok);
}

// Devuelve el texto escrito, o null si se canceló.
export function customPrompt(message, title, icon = '✍️', placeholder = '') {
    return enqueue(() => openDialog({ title, message, icon, okText: 'Confirmar', cancelText: 'Cancelar', withInput: true, placeholder }))
        .then(result => (result.ok ? result.value : null));
}

export function isDialogOpen() {
    const overlay = document.getElementById('customDialogOverlay');
    return Boolean(overlay && !overlay.classList.contains('hidden'));
}

// Aviso breve que no interrumpe la venta (por ejemplo, "sin stock").
export function showToast(message, type = 'info', duration = 3500) {
    const host = document.getElementById('toastHost');
    if (!host) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    host.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

// Si una imagen no carga, muestra el logo (sin manejadores inline en el HTML).
export function installImageFallback(fallback = './kalo-logo.png') {
    document.addEventListener('error', event => {
        const image = event.target;
        if (image && image.tagName === 'IMG' && !image.dataset.fallback) {
            image.dataset.fallback = '1';
            image.src = fallback;
        }
    }, true);
}

export function setupUI() {
    installImageFallback();
}
