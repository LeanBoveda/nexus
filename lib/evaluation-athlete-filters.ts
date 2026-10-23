export type EvaluationAthlete = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  primaryPosition: string | null;
  groupIds: string[];
};

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function filterEvaluationAthletes(
  athletes: EvaluationAthlete[],
  filters: {
    query: string;
    groupId: string;
    position: string;
    evaluated: string;
  },
  evaluatedIds: Set<string>,
) {
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean);
  return athletes.filter((athlete) => {
    const haystack = normalize(
      `${athlete.firstName} ${athlete.lastName} ${athlete.email}`,
    );
    return (
      terms.every((term) => haystack.includes(term)) &&
      (!filters.groupId ||
        (filters.groupId === '__ungrouped'
          ? !athlete.groupIds.length
          : athlete.groupIds.includes(filters.groupId))) &&
      (!filters.position || athlete.primaryPosition === filters.position) &&
      (!filters.evaluated ||
        evaluatedIds.has(athlete.id) === (filters.evaluated === 'yes'))
    );
  });
}
