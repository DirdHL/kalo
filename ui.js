// Modal de Alertas y Confirmaciones Personalizadas

export function customAlert(msg, title = "Atención", icon = "⚠️") {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customDialogOverlay');
        if (!overlay) {
            alert(msg);
            resolve();
            return;
        }
        document.getElementById('customDialogTitle').textContent = title;
        document.getElementById('customDialogMessage').textContent = msg;
        document.getElementById('customDialogIcon').textContent = icon;
        
        const btnCancel = document.getElementById('customDialogCancel');
        const btnOk = document.getElementById('customDialogOk');
        
        btnCancel.classList.add('hidden');
        btnOk.textContent = 'Aceptar';
        overlay.classList.remove('hidden');
        
        btnOk.onclick = () => {
            overlay.classList.add('hidden');
            resolve();
        };
    });
}

export function customConfirm(msg, title = "Confirmar", icon = "❓") {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customDialogOverlay');
        if (!overlay) {
            resolve(confirm(msg));
            return;
        }
        document.getElementById('customDialogTitle').textContent = title;
        document.getElementById('customDialogMessage').textContent = msg;
        document.getElementById('customDialogIcon').textContent = icon;
        
        const btnCancel = document.getElementById('customDialogCancel');
        const btnOk = document.getElementById('customDialogOk');
        
        btnCancel.classList.remove('hidden');
        btnOk.textContent = 'Sí, continuar';
        overlay.classList.remove('hidden');
        
        btnCancel.onclick = () => {
            overlay.classList.add('hidden');
            resolve(false);
        };
        
        btnOk.onclick = () => {
            overlay.classList.add('hidden');
            resolve(true);
        };
    });
}

export function setupUI() {
    window.customAlert = customAlert;
    window.customConfirm = customConfirm;
}
