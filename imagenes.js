// Imágenes que las vendedoras suben desde Inventario a Supabase Storage (bucket "imagenes").
// No usa las tablas: el archivo vive en Storage y el producto guarda "sb:NOMBRE.webp".
import { supabase, SUPABASE_URL } from "./supabase.js";
import { configurarImagenesNube, NOMBRE_NUBE_VALIDO, PREFIJO_NUBE } from "./constants.js";

export const BUCKET_IMAGENES = 'imagenes';
const LADO_MAXIMO = 600;        // px: suficiente para la tarjeta del producto
const BYTES_MAXIMOS = 2 * 1024 * 1024;

if (SUPABASE_URL) configurarImagenesNube(`${String(SUPABASE_URL).replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET_IMAGENES}/`);

// "Galleta Oreo 36g ñ" → "GALLETA-OREO-36G-N" (lo que acepta Storage y la política de Supabase)
export function nombreArchivoImagen(texto) {
    return String(texto ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/, '');
}

export async function listarImagenesNube() {
    const { data, error } = await supabase.storage.from(BUCKET_IMAGENES)
        .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    return (data || []).map(item => item.name).filter(name => NOMBRE_NUBE_VALIDO.test(name));
}

function cargarImagen(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen. Prueba con una foto JPG o PNG.')); };
        img.src = url;
    });
}

const aBlob = (canvas, type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));

// Reduce la foto a 600 px como máximo y la guarda como WEBP (o JPG si el navegador no sabe WEBP).
export async function comprimirImagen(file) {
    const img = await cargarImagen(file);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let blob = await aBlob(canvas, 'image/webp', 0.82);
    if (blob?.type === 'image/webp') return { blob, ext: 'webp' };
    // Sin WEBP: JPG con fondo blanco (JPG no tiene transparencia)
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    blob = await aBlob(canvas, 'image/jpeg', 0.85);
    if (!blob) throw new Error('No se pudo procesar la imagen.');
    return { blob, ext: 'jpg' };
}

// Sube la foto con el nombre escrito. Devuelve el valor para la columna imagen ("sb:NOMBRE.webp").
export async function subirImagenNube(file, nombre) {
    if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Escoge un archivo de imagen (foto JPG, PNG o WEBP).');
    const base = nombreArchivoImagen(nombre);
    if (!base) throw new Error('Escribe un nombre para la imagen (letras o números).');
    const { blob, ext } = await comprimirImagen(file);
    if (blob.size > BYTES_MAXIMOS) throw new Error('La imagen sigue siendo muy pesada. Prueba con otra foto.');
    const archivo = `${base}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_IMAGENES)
        .upload(archivo, blob, { contentType: blob.type, cacheControl: '3600', upsert: false });
    if (error) {
        const texto = `${error.message || ''} ${error.error || ''} ${error.statusCode || ''}`;
        if (/exists|duplicate|409/i.test(texto)) throw new Error(`Ya existe una imagen llamada "${base}". Usa otro nombre.`);
        throw error;
    }
    return PREFIJO_NUBE + archivo;
}

export async function borrarImagenNube(archivo) {
    if (!NOMBRE_NUBE_VALIDO.test(archivo)) throw new Error('Esa imagen no se puede borrar.');
    const { data, error } = await supabase.storage.from(BUCKET_IMAGENES).remove([archivo]);
    if (error) throw error;
    // Storage no da error si la política no permitió borrar: devuelve una lista vacía.
    if (!data || data.length === 0) throw new Error('No se pudo borrar la imagen (sin permiso o ya no existe).');
}
