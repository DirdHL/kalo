// Estado global centralizado de la aplicación

function detectLocal() {
    let local = 'LAS BRISAS';
    const pathURL = window.location.pathname.toLowerCase();
    if (pathURL.includes('brisas')) local = 'LAS BRISAS';
    else if (pathURL.includes('pinos')) local = 'LOS PINOS';
    else if (pathURL.includes('polideportivo')) local = 'EL POLIDEPORTIVO';
    return local;
}

export const state = {
    currentLocal: detectLocal(),
    currentUserEmail: null,
    globalProducts: [],
    invFilteredProducts: [],
    invCurrentPage: 1,
    invItemsPerPage: 999999,
    cart: []
};
