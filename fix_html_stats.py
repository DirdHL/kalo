import re
import os

files = ['brisas.html', 'pinos.html', 'polideportivo.html']

replacement = '''
                    <div class="stat-card">
                        <h3 class="stat-title">Descuentos</h3>
                        <p class="stat-value" id="statDescuentos">S/ 0.00</p>
                    </div>
                    <div class="stat-card">
                        <h3 class="stat-title">Ganancia Bruta</h3>
                        <p class="stat-value" id="statGananciaBruta" style="color: #fcd34d;">S/ 0.00</p>
                    </div>
                    <div class="stat-card" style="border-top-color: #10b981;">
                        <h3 class="stat-title">Ganancia Neta</h3>
                        <p class="stat-value" id="statGananciaNeta" style="color: #10b981;">S/ 0.00</p>
                    </div>
'''

for f in files:
    if os.path.exists(f):
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Regex to find the 4 stat cards block including Inversiones
        pattern = re.compile(
            r'<div class="stat-card">\s*<h3 class="stat-title">Inversiones</h3>.*?<h3 class="stat-title">Ganancia Neta</h3>.*?</div>',
            re.DOTALL
        )
        content = pattern.sub(replacement.strip(), content)
        
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f'Updated {f}')
