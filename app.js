import { setupUI, customConfirm, showToast } from "./ui.js";
import { setupAuth } from "./auth.js";
import { setupInventory } from "./inventory.js";
import { setupPOS } from "./pos.js";
import { setupHistory } from "./history.js";
import { setupStats } from "./stats.js";
import { setupScanner } from "./scanner.js";
import { state } from "./state.js";
import { localPorId } from "./constants.js";

// Vista → elemento que la contiene
const VISTAS = {
    pos: 'posView',
    inventario: 'dashboardCard',
    historial: 'historyView',
    estadisticas: 'statsView',
    alertas: 'alertsView'
};

setupUI();

const navButtons = document.querySelectorAll('[data-view]');
const localLabel = document.getElementById('localLabel');
const changeLocalBtn = document.getElementById('changeLocalBtn');
const mfaSetupBtn = document.getElementById('mfaSetupBtn');
const navStatsBtn = document.getElementById('navStatsBtn');
const logoutBtn = document.getElementById('logoutBtn');

const pos = setupPOS({
    onSaleCompleted: () => inventory.loadProducts(),
    onPricesChanged: () => inventory.loadProducts()
});
const inventory = setupInventory({
    onProductsLoaded: products => pos.onProductsLoaded(products)
});
const history = setupHistory({
    onStockChanged: () => inventory.loadProducts()
});
const stats = setupStats();

setupScanner({
    onBarcodeScanned: product => {
        mostrarVista('pos');
        pos.addToCart(product);
    }
});

// Estadísticas (mes, margen, más vendidos, Excel) es solo para admins. Las
// vendedoras ven lo del día en Historial; la base de datos aplica la misma regla.
function mostrarVista(vista) {
    if (!state.perfil) return;
    if (vista === 'estadisticas' && !state.perfil.esAdmin) return;
    for (const [nombre, id] of Object.entries(VISTAS)) {
        document.getElementById(id)?.classList.toggle('hidden', nombre !== vista);
    }
    navButtons.forEach(button => button.classList.toggle('active', button.dataset.view === vista));
    if (vista === 'historial') history.loadHistory();
    if (vista === 'estadisticas') stats.calcularEstadisticas();
}

function actualizarCabecera() {
    const local = localPorId(state.currentLocal);
    const esAdmin = Boolean(state.perfil?.esAdmin);
    if (localLabel) localLabel.textContent = local ? `📍 ${local.nombre}` : '';
    changeLocalBtn?.classList.toggle('hidden', !esAdmin);
    navStatsBtn?.classList.toggle('hidden', !esAdmin);
    mfaSetupBtn?.classList.toggle('hidden', !(state.perfil?.rol === 'admin' && state.mfaPendiente));
    document.title = local ? `Kalo | ${local.nombre}` : 'Kalo | Punto de venta';
}

navButtons.forEach(button => {
    button.addEventListener('click', () => mostrarVista(button.dataset.view));
});

const auth = setupAuth({
    onReady: () => {
        actualizarCabecera();
        pos.clearCart();
        stats.reset();
        mostrarVista('pos');
        inventory.loadProducts();
    },
    onSignedOut: () => {
        pos.clearCart();
        stats.reset();
        inventory.clear();
    },
    onMfaChanged: actualizarCabecera
});

changeLocalBtn?.addEventListener('click', async () => {
    if (state.cart.length > 0) {
        const ok = await customConfirm('Hay productos en el ticket. Si cambias de local se vaciará.', 'Cambiar de local', '📍');
        if (!ok) return;
    }
    auth.mostrarSelectorDeLocal();
});

mfaSetupBtn?.addEventListener('click', () => auth.activarMfa());

logoutBtn?.addEventListener('click', async () => {
    const mensaje = state.cart.length > 0
        ? 'Hay productos en el ticket sin cobrar. ¿Cerrar sesión de todas formas?'
        : '¿Seguro que deseas cerrar sesión?';
    if (!await customConfirm(mensaje, 'Cerrar sesión', '🚪')) return;
    await auth.cerrarSesion();
});

window.addEventListener('beforeunload', event => {
    if (state.cart.length > 0) {
        event.preventDefault();
        event.returnValue = '';
    }
});

window.addEventListener('unhandledrejection', event => {
    console.error('Error no controlado:', event.reason);
    showToast('Ocurrió un error inesperado. Si se repite, recarga la página.', 'error', 6000);
});
