const fs = require('fs');
const files = ['brisas.html', 'pinos.html', 'polideportivo.html'];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    const searchStr = `                <div style="background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); padding: 1rem; max-height: 200px; overflow-y: auto;" id="comboProductList">
                    <!-- Se llenará con JS -->
                </div>
            </div>`;
            
    const newStr = `                <div style="background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); padding: 1rem; max-height: 200px; overflow-y: auto;" id="comboProductList">
                    <!-- Se llenará con JS -->
                </div>
            </div>

            <div id="comboSummary" style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-top: 1rem; border: 1px solid rgba(255,255,255,0.1); font-size: 0.9rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="color: var(--text-secondary);">Suma Precio Venta Individual:</span>
                    <span id="comboRealSalePrice" style="font-weight: bold;">S/ 0.00</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="color: var(--text-secondary);">Costo Base Total (Compra):</span>
                    <span id="comboRealCost" style="font-weight: bold;">S/ 0.00</span>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 0.5rem;">
                    <span style="color: var(--text-secondary);">Ganancia / Pérdida del Combo:</span>
                    <span id="comboNetProfit" style="font-weight: bold;">S/ 0.00</span>
                </div>
            </div>`;

    if (!content.includes('comboSummary')) {
        content = content.replace(searchStr, newStr);
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
    } else {
        console.log(`Already updated ${file}`);
    }
});
