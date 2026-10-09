const fs = require('fs');
const files = ['brisas.html', 'pinos.html', 'polideportivo.html'];

files.forEach(f => {
    let c = fs.readFileSync(f, 'utf8');
    
    // POS filters
    const oldPosFilters = '<button class="cat-filter-btn" data-cat="Combos">🍔 Combos</button>';
    const newPosFilters = '</div>\n                    <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">\n                        <button class="cat-filter-btn" data-cat="Combos" style="background: #eab308; color: #1e1b4b; font-weight: bold; padding: 0.5rem 1.5rem; border-radius: 8px;">🍔 Combos</button>';
    c = c.replace(oldPosFilters, newPosFilters);
    
    // Inventory filters
    const invHeader = '<div class="table-container" style="flex: 1; overflow: visible;">';
    const invFilters = `
                <!-- Filtros INVENTARIO -->
                <div class="category-filters" id="invCategoryFilters" style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem; scrollbar-width: thin; margin-bottom: 0.5rem;">
                    <button class="inv-filter-btn active" data-cat="Todos">Todos</button>
                    <button class="inv-filter-btn" data-cat="Bebidas">🥤 Bebidas</button>
                    <button class="inv-filter-btn" data-cat="Snacks">🍿 Snacks</button>
                    <button class="inv-filter-btn" data-cat="Lácteos">🥛 Lácteos</button>
                    <button class="inv-filter-btn" data-cat="Limpieza">🧼 Limpieza</button>
                    <button class="inv-filter-btn" data-cat="Dulces">🍬 Dulces</button>
                    <button class="inv-filter-btn" data-cat="Abarrotes">🥫 Abarrotes</button>
                    <button class="inv-filter-btn" data-cat="Otros">📦 Otros</button>
                </div>
                <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                    <button class="inv-filter-btn" data-cat="Combos" style="background: #eab308; color: #1e1b4b; font-weight: bold; padding: 0.5rem 1.5rem; border-radius: 8px;">🍔 Combos</button>
                </div>
                <div class="table-container" style="flex: 1; overflow: visible;">`;
                
    if (!c.includes('invCategoryFilters')) {
        c = c.replace(invHeader, invFilters);
    }
    
    fs.writeFileSync(f, c, 'utf8');
});
console.log('Fixed files successfully.');
