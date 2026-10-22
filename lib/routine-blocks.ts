export function nextBlockName(existing: string[]): string {
  for (let i = 0; i < 26; i++) {
    const name = String.fromCharCode(65 + i);
    if (!existing.some(block => block.toLocaleLowerCase() === name.toLocaleLowerCase())) return name;
  }
  let index = 27;
  while (existing.includes(String(index))) index++;
  return String(index);
}

export function validateBlockName(value: string, existing: string[]): string {
  const name = value.trim();
  if (!name || name.length > 80) throw new Error('El nombre del bloque debe tener entre 1 y 80 caracteres.');
  if (existing.some(block => block.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Ya existe un bloque con ese nombre en este día.');
  return name;
}
