export const IMPORT_LIMIT = 500;
export const importFields = [
  ['firstName', 'Nombre', true], ['lastName', 'Apellido', true], ['email', 'Email', true],
  ['phone', 'Teléfono', false], ['birthDate', 'Fecha de nacimiento', false],
  ['countryCode', 'País (AR, ES…)', false], ['position', 'Posición', false], ['primaryContext', 'Contexto', false],
] as const;
export type ImportField = typeof importFields[number][0];
export type ImportRow = Record<ImportField, string> & { sourceRow: number };
export type CheckedRow = { data: ImportRow; status: 'valid' | 'duplicate' | 'error'; message: string };

export function normalizeHeader(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}
const aliases: Record<ImportField, string[]> = {
  firstName: ['nombre', 'nombres', 'firstname', 'name'], lastName: ['apellido', 'apellidos', 'lastname', 'surname'],
  email: ['email', 'correo', 'correoelectronico', 'mail'], phone: ['telefono', 'celular', 'phone', 'movil', 'whatsapp'],
  birthDate: ['fechadenacimiento', 'nacimiento', 'birthdate', 'dob'], countryCode: ['pais', 'country', 'countrycode', 'codigopais'],
  position: ['posicion', 'puesto', 'position'], primaryContext: ['contexto', 'ambito', 'primarycontext'],
};
export function guessColumns(headers: string[]): Partial<Record<ImportField, number>> {
  return Object.fromEntries(importFields.flatMap(([key]) => {
    const index = headers.findIndex(h => aliases[key].includes(normalizeHeader(h)));
    return index < 0 ? [] : [[key, index]];
  }));
}

export function normalizeBirthDate(input: string): string | null {
  if (!input) return '';
  let value = input;
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (local) value = `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '1900-01-01' || date.getTime() > Date.now()) return null;
  return value;
}

export function checkImportRows(input: unknown, unavailableEmails: Set<string> = new Set()): CheckedRow[] {
  if (!Array.isArray(input) || !input.length || input.length > IMPORT_LIMIT) throw new Error(`Elegí entre 1 y ${IMPORT_LIMIT} alumnos por importación.`);
  const seen = new Set<string>();
  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Formato de filas inválido.');
    const data = { sourceRow: Number.isInteger(raw.sourceRow) && raw.sourceRow > 0 ? raw.sourceRow : index + 2 } as ImportRow;
    for (const [key] of importFields) {
      if (raw[key] !== undefined && typeof raw[key] !== 'string') throw new Error('Los campos deben ser texto.');
      data[key] = (raw[key] ?? '').trim();
    }
    data.email = data.email.toLowerCase();
    data.countryCode = data.countryCode.toUpperCase();
    const errors: string[] = [];
    if (!data.firstName || data.firstName.length > 100) errors.push('Nombre obligatorio (máximo 100 caracteres)');
    if (!data.lastName || data.lastName.length > 100) errors.push('Apellido obligatorio (máximo 100 caracteres)');
    if (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Email inválido');
    if (data.phone.length > 50 || data.position.length > 100 || data.primaryContext.length > 100) errors.push('Teléfono, posición o contexto demasiado largo');
    if (data.countryCode && !/^[A-Z]{2}$/.test(data.countryCode)) errors.push('Usá dos letras para el país (AR, ES, UY…)');
    const date = normalizeBirthDate(data.birthDate);
    if (date === null) errors.push('Fecha inválida: usá DD/MM/AAAA o AAAA-MM-DD'); else data.birthDate = date;
    if (errors.length) return { data, status: 'error', message: errors.join('. ') };
    if (seen.has(data.email)) return { data, status: 'duplicate', message: 'Email repetido dentro del archivo' };
    seen.add(data.email);
    if (unavailableEmails.has(data.email)) return { data, status: 'duplicate', message: 'Email ya registrado. Se omite sin modificar la ficha existente' };
    return { data, status: 'valid', message: 'Listo para importar' };
  });
}

// RFC-style quoted fields, including embedded line breaks and escaped quotes.
export function parseDelimited(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const counts = new Map([[';', 0], ['\t', 0], [',', 0]]);
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      if (inQuotes && text[i + 1] === '"') i++; else inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (text[i] === '\n' || text[i] === '\r') break;
      if (counts.has(text[i])) counts.set(text[i], counts.get(text[i])! + 1);
    }
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (!cell || quoted) quoted = !quoted;
      else cell += char;
    } else if (!quoted && (char === delimiter || char === '\r' || char === '\n')) {
      row.push(cell); cell = '';
      if (row.length > 50) throw new Error('El archivo admite hasta 50 columnas.');
      if (char !== delimiter) {
        rows.push(row);
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
        if (rows.length > IMPORT_LIMIT + 20) throw new Error(`El archivo admite hasta ${IMPORT_LIMIT} alumnos.`);
      }
    } else cell += char;
  }
  if (quoted) throw new Error('El CSV tiene comillas sin cerrar. Volvé a exportarlo.');
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  if (rows.length > IMPORT_LIMIT + 20 || row.length > 50) throw new Error('El archivo excede el tamaño admitido.');
  return rows;
}
