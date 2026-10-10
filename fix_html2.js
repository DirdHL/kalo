const fs = require('fs');
const files = ['brisas.html', 'pinos.html', 'polideportivo.html'];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    // POS Combos
    const posSearch = /<\/div>\s*<div style="display: flex; gap: 0\.5rem; margin-bottom: 0\.5rem;">\s*<button class="cat-filter-btn" data-cat="Combos" style="background: #eab308; color: #1e1b4b; font-weight: bold; padding: 0\.5rem 1\.5rem; border-radius: 8px;">🍔 Combos<\/button>\s*<\/div>/g;
    
    // INV Combos
    const invSearch = /<\/div>\s*<div style="display: flex; gap: 0\.5rem; margin-bottom: 1rem;">\s*<button class="inv-filter-btn" data-cat="Combos" style="background: #eab308; color: #1e1b4b; font-weight: bold; padding: 0\.5rem 1\.5rem; border-radius: 8px;">🍔 Combos<\/button>\s*<\/div>/g;

    content = content.replace(posSearch, '    <button class="cat-filter-btn" data-cat="Combos" style="background: #eab308; color: #1e1b4b; font-weight: bold; padding: 0.5rem 1.5rem; border-radius: 8px; margin-left: 1rem;">🍔 Combos</button>\n                    </div>');
    
    content = content.replace(invSearch, '    <button class="inv-filter-btn" data-cat="Combos" style="background: #eab308; color: #1e1b4b; font-weight: bold; padding: 0.5rem 1.5rem; border-radius: 8px; margin-left: 1rem;">🍔 Combos</button>\n                </div>');

    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
});
