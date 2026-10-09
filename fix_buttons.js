const fs = require('fs');
const files = ['brisas.html', 'pinos.html', 'polideportivo.html'];

files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    
    // Remove "Otros" button from POS and Inventory
    content = content.replace(/<button class="cat-filter-btn" data-cat="Otros">📦 Otros<\/button>\n?/g, '');
    content = content.replace(/<button class="inv-filter-btn" data-cat="Otros">📦 Otros<\/button>\n?/g, '');
    
    // Change Combos wrapper to class="category-filters" in POS
    content = content.replace(
        '<div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">\n                        <button class="cat-filter-btn" data-cat="Combos"',
        '<div class="category-filters" style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">\n                        <button class="cat-filter-btn" data-cat="Combos"'
    );
    
    // Change Combos wrapper to class="category-filters" in Inventory
    content = content.replace(
        '<div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">\n                    <button class="inv-filter-btn" data-cat="Combos"',
        '<div class="category-filters" style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">\n                    <button class="inv-filter-btn" data-cat="Combos"'
    );
    
    fs.writeFileSync(f, content, 'utf8');
});
console.log('Fixed buttons');
