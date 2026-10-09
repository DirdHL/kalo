import { state } from "./state.js";

export function setupScanner({ onBarcodeScanned }) {
    let barcodeBuffer = '';
    let barcodeTimeout = null;

    const navPosBtn = document.getElementById('navPosBtn');
    const cartTotalValue = document.getElementById('cartTotalValue');

    document.addEventListener('keydown', (e) => {
        // Ignorar si el usuario está tipeando activamente en cualquier campo de texto
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            return;
        }

        if (barcodeTimeout) {
            clearTimeout(barcodeTimeout);
        }

        barcodeTimeout = setTimeout(() => {
            barcodeBuffer = '';
        }, 50);

        if (e.key === 'Enter') {
            e.preventDefault();
            if (barcodeBuffer.trim().length > 0) {
                const scannedCode = barcodeBuffer.trim().toLowerCase();
                const match = state.globalProducts.find(p => p.codigo && p.codigo.toLowerCase() === scannedCode);
                
                if (match) {
                    if (navPosBtn && !navPosBtn.classList.contains('active')) {
                        navPosBtn.click();
                    }
                    if (typeof onBarcodeScanned === 'function') {
                        onBarcodeScanned(match);
                    }
                } else {
                    if (cartTotalValue) {
                        const prevColor = cartTotalValue.style.color;
                        const prevText = cartTotalValue.textContent;
                        cartTotalValue.style.color = '#fca5a5';
                        cartTotalValue.textContent = '❌ No found';
                        setTimeout(() => {
                            cartTotalValue.style.color = prevColor;
                            cartTotalValue.textContent = prevText;
                        }, 1000);
                    }
                }
                barcodeBuffer = '';
            }
        } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            barcodeBuffer += e.key;
        }
    });
}
