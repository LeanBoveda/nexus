export function evaluationDate(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const timestamp = Date.parse(`${value}T12:00:00.000Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}
export function evaluationResults(value: unknown, allowed: Set<string>) {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('Ingresá entre 1 y 100 resultados.');
  const seen = new Set<string>();
  return value.map((row) => {
    const metricId = row?.metricId;
    const raw = row?.value;
    if (
      typeof metricId !== 'string' ||
      !allowed.has(metricId) ||
      seen.has(metricId) ||
      (typeof raw !== 'number' && typeof raw !== 'string') ||
      String(raw).trim() === '' ||
      !Number.isFinite(Number(raw))
    )
      throw new Error(
        'Revisá los resultados: números válidos, tests de la plantilla y sin repetirse.',
      );
    seen.add(metricId);
    return { metricId, value: Number(raw) };
  });
}
export function semanticMetricChange(
  previous: { unit: string; better_direction: string; protocol: string | null },
  next: { unit: string; betterDirection: string; protocol: string | null },
) {
  return (
    previous.unit !== next.unit ||
    previous.better_direction !== next.betterDirection ||
    (previous.protocol ?? '') !== (next.protocol ?? '')
  );
}
