import re
import os

files = ['brisas.html', 'pinos.html', 'polideportivo.html']

replacement = '''
            <div id="comboSummary" style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-top: 1rem; margin-bottom: 1rem; border: 1px solid rgba(255,255,255,0.1); font-size: 0.9rem;">
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
            </div>
'''

for f in files:
    if os.path.exists(f):
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        
        if 'comboSummary' not in content:
            pattern = re.compile(r'(<div[^>]*id="comboProductList"[^>]*>.*?</div>\s*</div>)', re.DOTALL)
            content = pattern.sub(r'\g<1>' + replacement, content)
            with open(f, 'w', encoding='utf-8') as file:
                file.write(content)
            print(f'Updated {f}')
