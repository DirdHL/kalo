import { setupUI, customAlert } from "./ui.js";
import { setupAuth } from "./auth.js";
import { setupInventory } from "./inventory.js";
import { setupPOS } from "./pos.js";
import { setupStats } from "./stats.js";
import { setupScanner } from "./scanner.js";
import { state } from "./state.js";
import { ADMIN_EMAILS } from "./constants.js";

console.log(">>> SISTEMA KALO INICIALIZADO (ARQUITECTURA MODULAR)");

try {
    // 1. Inicializar componentes de UI y diálogos
    setupUI();

    // 2. Configurar etiqueta de la sucursal actual
    const localLabel = document.getElementById('localLabel');
    if (localLabel) {
        if (state.currentLocal === 'LAS BRISAS') localLabel.innerHTML = '📍 Las Brisas';
        else if (state.currentLocal === 'LOS PINOS') localLabel.innerHTML = '📍 Los Pinos';
        else if (state.currentLocal === 'EL POLIDEPORTIVO') localLabel.innerHTML = '📍 El Polideportivo';
    }

    // 3. Vistas Principales
    const posView = document.getElementById('posView');
    const inventoryView = document.getElementById('dashboardCard');
    const statsView = document.getElementById('statsView');
    const historyView = document.getElementById('historyView');
    const alertsView = document.getElementById('alertsView');

    // Botones de Navegación
    const navPosBtn = document.getElementById('navPosBtn');
    const navInvBtn = document.getElementById('navInvBtn');
    const navHistoryBtn = document.getElementById('navHistoryBtn');
    const navStatsBtn = document.getElementById('navStatsBtn');
    const navAlertsBtn = document.getElementById('navAlertsBtn');

    function hideAllViews() {
        if (posView) posView.classList.add('hidden');
        if (inventoryView) inventoryView.classList.add('hidden');
        if (statsView) statsView.classList.add('hidden');
        if (historyView) historyView.classList.add('hidden');
        if (alertsView) alertsView.classList.add('hidden');

        if (navPosBtn) navPosBtn.classList.remove('active');
        if (navInvBtn) navInvBtn.classList.remove('active');
        if (navHistoryBtn) navHistoryBtn.classList.remove('active');
        if (navStatsBtn) navStatsBtn.classList.remove('active');
        if (navAlertsBtn) navAlertsBtn.classList.remove('active');
    }

    // 4. Instanciar módulos del sistema
    const pos = setupPOS({
        onSaleCompleted: async () => {
            await inventory.loadProducts();
        }
    });

    const inventory = setupInventory({
        onProductsLoaded: (products) => {
            pos.renderPosGrid(products);
        }
    });

    const stats = setupStats({
        onProductsChanged: async () => {
            await inventory.loadProducts();
        }
    });

    setupScanner({
        onBarcodeScanned: (product) => {
            pos.addToCart(product);
        }
    });

    // 5. Configurar eventos de navegación
    if (navPosBtn) {
        navPosBtn.addEventListener('click', () => {
            hideAllViews();
            navPosBtn.classList.add('active');
            if (posView) posView.classList.remove('hidden');
        });
    }

    if (navInvBtn) {
        navInvBtn.addEventListener('click', () => {
            hideAllViews();
            navInvBtn.classList.add('active');
            if (inventoryView) inventoryView.classList.remove('hidden');
        });
    }

    if (navHistoryBtn) {
        navHistoryBtn.addEventListener('click', () => {
            hideAllViews();
            navHistoryBtn.classList.add('active');
            if (historyView) historyView.classList.remove('hidden');
            stats.loadHistory();
        });
    }

    if (navAlertsBtn) {
        navAlertsBtn.addEventListener('click', () => {
            hideAllViews();
            navAlertsBtn.classList.add('active');
            if (alertsView) alertsView.classList.remove('hidden');
        });
    }

    if (navStatsBtn) {
        navStatsBtn.addEventListener('click', async () => {
            if (state.currentUserEmail && ADMIN_EMAILS.includes(state.currentUserEmail)) {
                hideAllViews();
                navStatsBtn.classList.add('active');
                if (statsView) statsView.classList.remove('hidden');
                stats.calcularEstadisticas();
            } else {
                await customAlert('Acceso Denegado. Solo administradores pueden ver esta sección.', 'Acceso Restringido', '🔒');
            }
        });
    }

    // 6. Configurar autenticación y arranque inicial
    setupAuth({
        onLoginSuccess: () => {
            inventory.loadProducts();
        }
    });

} catch (error) {
    console.error("Error crítico al inicializar la aplicación:", error);
}
