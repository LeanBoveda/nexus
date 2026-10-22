import readXlsxFile from 'read-excel-file/universal';
import { IMPORT_LIMIT, parseDelimited } from './athlete-import';

self.onmessage = async (event: MessageEvent<{ file: File }>) => {
  try {
    const file = event.data.file;
    if (file.size > 2 * 1024 * 1024) throw new Error('El archivo debe pesar como máximo 2 MB.');
    let sheets: { name: string; rows: string[][] }[];
    if (/\.(csv|tsv)$/i.test(file.name)) {
      const buffer = await file.arrayBuffer();
      let text = new TextDecoder('utf-8').decode(buffer);
      if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buffer);
      sheets = [{ name: file.name, rows: parseDelimited(text) }];
    } else if (/\.xlsx$/i.test(file.name)) {
      const book = await readXlsxFile(file);
      sheets = book.map(sheet => ({ name: sheet.sheet, rows: sheet.data.map(row => row.map(cell => cell instanceof Date ? cell.toISOString().slice(0, 10) : cell == null ? '' : String(cell))) }));
    } else throw new Error('Usá Excel .xlsx, CSV o TSV. Para un .xls antiguo, guardalo primero como .xlsx.');
    sheets = sheets.filter(sheet => sheet.rows.some(row => row.some(cell => cell.trim())));
    if (!sheets.length) throw new Error('El archivo está vacío.');
    if (sheets.length > 20 || sheets.some(sheet => sheet.rows.length > IMPORT_LIMIT + 20 || sheet.rows.some(row => row.length > 50))) throw new Error(`Usá hasta 20 hojas, 50 columnas y ${IMPORT_LIMIT} alumnos por hoja.`);
    self.postMessage({ sheets });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'No pudimos leer el archivo.' });
  }
};
