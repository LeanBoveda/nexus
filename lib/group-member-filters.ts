export type GroupCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  primaryPosition: string | null;
};
export type CandidateMembership = { groupId: string; athleteId: string };
export function filterGroupCandidates(
  athletes: GroupCandidate[],
  memberships: CandidateMembership[],
  groups: { id: string; name: string }[],
  targetId: string,
  filters: {
    query: string;
    group: string;
    position: string;
    membership: string;
  },
) {
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const byAthlete = new Map<string, string[]>();
  for (const member of memberships) {
    if (!groupNames.has(member.groupId)) continue;
    const ids = byAthlete.get(member.athleteId) ?? [];
    ids.push(member.groupId);
    byAthlete.set(member.athleteId, ids);
  }
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean);
  return athletes.filter((athlete) => {
    const ids = byAthlete.get(athlete.id) ?? [];
    const belongs = ids.includes(targetId);
    if (
      filters.group &&
      (filters.group === '__ungrouped'
        ? ids.length > 0
        : !ids.includes(filters.group))
    )
      return false;
    if (
      filters.position &&
      (filters.position === '__no_position'
        ? Boolean(athlete.primaryPosition?.trim())
        : athlete.primaryPosition?.trim() !== filters.position)
    )
      return false;
    if (
      (filters.membership === 'available' && belongs) ||
      (filters.membership === 'members' && !belongs)
    )
      return false;
    const text = normalize(
      `${athlete.firstName} ${athlete.lastName} ${athlete.email} ${athlete.primaryPosition ?? ''} ${ids.map((id) => groupNames.get(id)).join(' ')}`,
    );
    return terms.every((term) => text.includes(term));
  });
}
