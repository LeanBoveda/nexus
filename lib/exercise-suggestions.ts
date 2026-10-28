export function exerciseSuggestions(names: string[], query: string) {
  const normalize = (value: string) =>
    value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const term = normalize(query);
  if (term.length < 2) return [];
  const unique = new Map<string, string>();
  for (const name of names) {
    const key = normalize(name);
    if (key.includes(term) && key !== 'nuevo ejercicio' && !unique.has(key))
      unique.set(key, name.trim());
  }
  return [...unique.values()]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .slice(0, 20);
}
