// Regenera AVAILABLE_IMAGES en constants.js a partir de public/img
// Uso: node scripts/sync-images.cjs
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const imgDir = path.join(root, 'public', 'img');
const constantsPath = path.join(root, 'constants.js');

const files = fs.readdirSync(imgDir)
    .filter(f => /\.(svg|png|jpe?g|webp)$/i.test(f))
    .map(f => f.normalize('NFC'))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

const arrayStr = 'export const AVAILABLE_IMAGES = [\n' +
    files.map(f => '    ' + JSON.stringify(f)).join(',\n') +
    '\n];';

const src = fs.readFileSync(constantsPath, 'utf8');
const updated = src.replace(/export const AVAILABLE_IMAGES = \[[\s\S]*?\];/, arrayStr);

if (updated === src) {
    console.log('Sin cambios.');
} else {
    fs.writeFileSync(constantsPath, updated, 'utf8');
    console.log(`AVAILABLE_IMAGES actualizado con ${files.length} imágenes.`);
}
