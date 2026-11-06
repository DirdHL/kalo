// Excel del inventario para las vendedoras: solo el producto y su cantidad, del local que se está viendo.
import { localPorId, CATEGORIA_COMBOS } from "./constants.js";
import { COLOR } from "./reporte.js";
import { toDateInputValue } from "./utils.js";

const compararNombres = new Intl.Collator('es', { sensitivity: 'base', numeric: true }).compare;
const borde = { style: 'thin', color: { argb: COLOR.borde } };
const BORDES = { top: borde, left: borde, bottom: borde, right: borde };
const relleno = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const fuente = (extra = {}) => ({ name: 'Calibri', size: 12, color: { argb: COLOR.texto }, ...extra });
const FILA_ENCABEZADO = 4;

const nombreLocal = local => localPorId(local)?.nombre || local || 'Kalo';

// Los combos no se cuentan: su stock sale de los productos que los forman.
// Sin stock registrado queda en null (en el Excel se ve "—", no un 0 falso).
export function filasInventario(productos, esCombo = () => false) {
    return (productos || [])
        .filter(p => p && !esCombo(p) && p.categoria !== CATEGORIA_COMBOS)
        .map(p => {
            const stock = p.stock === null || p.stock === undefined || p.stock === '' ? NaN : Number(p.stock);
            return {
                producto: String(p.nombre ?? '').replace(/_/g, ' ').trim() || 'Sin nombre',
                cantidad: Number.isFinite(stock) ? stock : null
            };
        })
        .sort((a, b) => compararNombres(a.producto, b.producto));
}

export function nombreArchivoInventario(local, fecha = new Date()) {
    return `Kalo_Inventario_${nombreLocal(local).replace(/\s+/g, '-')}_${toDateInputValue(fecha)}.xlsx`;
}

export function construirExcelInventario(ExcelJS, { local, filas, ahora = new Date() }) {
    const tienda = nombreLocal(local);
    const fecha = ahora.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    const hora = ahora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Kalo';
    wb.company = 'Kalo';
    wb.title = `Inventario ${tienda}`;
    wb.created = ahora;
    wb.modified = ahora;

    const ws = wb.addWorksheet('Inventario', {
        properties: { tabColor: { argb: COLOR.teal } },
        // El encabezado de la tabla queda fijo al bajar.
        views: [{ state: 'frozen', ySplit: FILA_ENCABEZADO, showGridLines: false }],
        pageSetup: {
            paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
            horizontalCentered: true, printTitlesRow: `1:${FILA_ENCABEZADO}`,
            margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 }
        },
        headerFooter: { oddFooter: `&L&9Kalo · Inventario ${tienda} · ${fecha}&R&9Página &P de &N` }
    });
    ws.columns = [{ width: 52 }, { width: 16 }];

    ws.mergeCells('A1:B1');
    const titulo = ws.getCell('A1');
    titulo.value = `Inventario · ${tienda}`;
    titulo.font = fuente({ size: 18, bold: true, color: { argb: COLOR.blanco } });
    titulo.fill = relleno(COLOR.verde);
    titulo.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 38;

    ws.mergeCells('A2:B2');
    const subtitulo = ws.getCell('A2');
    subtitulo.value = `Al ${fecha}, ${hora} · ${filas.length} ${filas.length === 1 ? 'producto' : 'productos'}`;
    subtitulo.font = fuente({ size: 11, color: { argb: COLOR.blanco } });
    subtitulo.fill = relleno(COLOR.teal);
    subtitulo.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(2).height = 22;
    ws.getRow(3).height = 8;

    const encabezado = ws.getRow(FILA_ENCABEZADO);
    ['Producto', 'Cantidad'].forEach((texto, i) => {
        const c = encabezado.getCell(i + 1);
        c.value = texto;
        c.font = fuente({ bold: true, color: { argb: COLOR.blanco } });
        c.fill = relleno(COLOR.teal);
        c.border = { ...BORDES, bottom: { style: 'medium', color: { argb: COLOR.ambar } } };
        c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', indent: i === 0 ? 1 : 0 };
    });
    encabezado.height = 26;

    if (!filas.length) {
        ws.mergeCells(FILA_ENCABEZADO + 1, 1, FILA_ENCABEZADO + 1, 2);
        const vacio = ws.getCell(FILA_ENCABEZADO + 1, 1);
        vacio.value = 'Este local todavía no tiene productos registrados.';
        vacio.font = fuente({ size: 11, italic: true, color: { argb: COLOR.gris } });
        vacio.border = BORDES;
        return wb;
    }

    filas.forEach((fila, idx) => {
        const r = ws.getRow(FILA_ENCABEZADO + 1 + idx);
        r.height = 20;
        const agotado = fila.cantidad === 0;
        const fondo = agotado ? COLOR.rojoClaro : idx % 2 === 1 ? COLOR.cebra : null;

        const producto = r.getCell(1);
        producto.value = fila.producto;
        producto.font = fuente();
        producto.alignment = { vertical: 'middle', indent: 1 };

        const cantidad = r.getCell(2);
        cantidad.value = fila.cantidad === null ? '—' : fila.cantidad;
        if (fila.cantidad !== null) cantidad.numFmt = '#,##0';
        cantidad.font = fila.cantidad === null ? fuente({ color: { argb: COLOR.grisClaro } })
            : agotado ? fuente({ bold: true, color: { argb: COLOR.rojo } })
            : fuente({ bold: true });
        cantidad.alignment = { vertical: 'middle', horizontal: 'center' };

        for (const c of [producto, cantidad]) {
            c.border = BORDES;
            if (fondo) c.fill = relleno(fondo);
        }
    });

    ws.autoFilter = { from: { row: FILA_ENCABEZADO, column: 1 }, to: { row: FILA_ENCABEZADO + filas.length, column: 2 } };
    return wb;
}
