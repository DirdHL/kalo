// Estado compartido de la aplicación. Se llena al iniciar sesión.
export const state = {
    perfil: null,            // { email, rol: 'admin' | 'cajero', local, esAdmin, aal }
    mfaPendiente: false,     // admin que todavía no activó la verificación en dos pasos
    currentLocal: null,      // 'LAS BRISAS' | 'LOS PINOS' | 'EL POLIDEPORTIVO'
    globalProducts: [],
    combos: new Map(),       // id del combo (texto) → [{ producto_id, cantidad }]
    invFilteredProducts: [],
    invCurrentPage: 1,
    invItemsPerPage: 999999, // el inventario muestra todos los productos (preferencia del negocio)
    cart: []
};

export function resetSessionState() {
    state.perfil = null;
    state.mfaPendiente = false;
    state.currentLocal = null;
    state.globalProducts = [];
    state.combos = new Map();
    state.invFilteredProducts = [];
    state.invCurrentPage = 1;
    state.cart = [];
}
