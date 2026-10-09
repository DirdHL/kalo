const fs = require('fs');

let appContent = fs.readFileSync('app.js', 'utf8');

// Extraer configuración de Supabase
const supabaseCode = `import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
`;
fs.writeFileSync('supabase.js', supabaseCode);

// Extraer UI functions
const uiFunctionsCode = `
export function setupUI() {
    window.customAlert = function(msg, title = "Atención", icon = "⚠️") {
        return new Promise((resolve) => {
            const overlay = document.getElementById('customDialogOverlay');
            if(!overlay) { alert(msg); resolve(); return; }
            document.getElementById('customDialogTitle').textContent = title;
            document.getElementById('customDialogMessage').textContent = msg;
            document.getElementById('customDialogIcon').textContent = icon;
            
            const btnCancel = document.getElementById('customDialogCancel');
            const btnOk = document.getElementById('customDialogOk');
            
            btnCancel.classList.add('hidden');
            btnOk.textContent = 'Aceptar';
            overlay.classList.remove('hidden');
            
            btnOk.onclick = () => {
                overlay.classList.add('hidden');
                resolve();
            };
        });
    };

    window.customConfirm = function(msg, title = "Confirmar", icon = "❓") {
        return new Promise((resolve) => {
            const overlay = document.getElementById('customDialogOverlay');
            if(!overlay) { resolve(confirm(msg)); return; }
            document.getElementById('customDialogTitle').textContent = title;
            document.getElementById('customDialogMessage').textContent = msg;
            document.getElementById('customDialogIcon').textContent = icon;
            
            const btnCancel = document.getElementById('customDialogCancel');
            const btnOk = document.getElementById('customDialogOk');
            
            btnCancel.classList.remove('hidden');
            btnOk.textContent = 'Sí, continuar';
            overlay.classList.remove('hidden');
            
            btnCancel.onclick = () => {
                overlay.classList.add('hidden');
                resolve(false);
            };
            
            btnOk.onclick = () => {
                overlay.classList.add('hidden');
                resolve(true);
            };
        });
    };
}
`;
fs.writeFileSync('ui.js', uiFunctionsCode);

// Remover las de app.js y agregar imports
appContent = appContent.replace(/import \{ createClient \} from '@supabase\/supabase-js';/g, 'import { supabase } from "./supabase.js";\nimport { setupUI } from "./ui.js";');
appContent = appContent.replace(/const SUPABASE_URL = import\.meta\.env\.VITE_SUPABASE_URL;[\s\S]*?const supabase = createClient\(SUPABASE_URL, SUPABASE_ANON_KEY\);/g, '');

const uiRegex = /\/\/ --- MANEJO DE ALERTAS PERSONALIZADAS ---[\s\S]*?window\.customConfirm = function[\s\S]*?resolve\(true\);\n\s*};\n\s*}\);\n\s*};/g;
appContent = appContent.replace(uiRegex, '// --- MANEJO DE ALERTAS PERSONALIZADAS ---\n        setupUI();');

fs.writeFileSync('app.js', appContent);
console.log('Split inicial completado: supabase.js y ui.js creados');
