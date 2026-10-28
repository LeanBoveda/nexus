import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile('lib/group-member-filters.ts', 'utf8');
const { filterGroupCandidates } = await import(
  `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`
);
const athletes = [
  {
    id: 'a',
    firstName: 'José',
    lastName: 'Pérez',
    email: 'jose@example.test',
    primaryPosition: 'Arquero',
  },
  {
    id: 'b',
    firstName: 'Ana',
    lastName: 'Gómez',
    email: 'ana@example.test',
    primaryPosition: 'Lateral',
  },
  {
    id: 'c',
    firstName: 'Juan',
    lastName: 'Pérez',
    email: 'juan@example.test',
    primaryPosition: null,
  },
  {
    id: 'd',
    firstName: 'Otra',
    lastName: 'Persona',
    email: 'otra@example.test',
    primaryPosition: ' ',
  },
];
const groups = [
  { id: 'one', name: 'Primera' },
  { id: 'two', name: 'Primera' },
  { id: 'three', name: 'Atletismo' },
];
const memberships = [
  { athleteId: 'a', groupId: 'one' },
  { athleteId: 'a', groupId: 'three' },
  { athleteId: 'b', groupId: 'two' },
  { athleteId: 'd', groupId: 'archived' },
];
const original = JSON.stringify({ athletes, groups, memberships });
const defaults = { query: '', group: '', position: '', membership: '' };
const match = (filters) =>
  filterGroupCandidates(athletes, memberships, groups, 'one', {
    ...defaults,
    ...filters,
  }).map((a) => a.id);
assert.deepEqual(match({}), ['a', 'b', 'c', 'd']);
assert.deepEqual(match({ query: '  PEREZ JOSE ' }), ['a']);
assert.deepEqual(match({ query: 'GOMEZ' }), ['b']);
assert.deepEqual(match({ query: 'ANA@EXAMPLE' }), ['b']);
assert.deepEqual(match({ query: 'arquero' }), ['a']);
assert.deepEqual(match({ query: 'atletismo' }), ['a']);
assert.deepEqual(match({ group: 'one' }), ['a']);
assert.deepEqual(
  match({ group: 'two' }),
  ['b'],
  'Same display name does not merge groups',
);
assert.deepEqual(
  match({ group: '__ungrouped' }),
  ['c', 'd'],
  'Archived groups do not prevent ungrouped match',
);
assert.deepEqual(match({ position: '__no_position' }), ['c', 'd']);
assert.deepEqual(match({ position: 'Arquero' }), ['a']);
assert.deepEqual(match({ membership: 'available' }), ['b', 'c', 'd']);
assert.deepEqual(match({ membership: 'members' }), ['a']);
assert.deepEqual(
  match({
    group: 'three',
    position: 'Arquero',
    membership: 'members',
    query: 'pérez',
  }),
  ['a'],
);
assert.deepEqual(match({ group: 'two', membership: 'members' }), []);
assert.deepEqual(match({ query: 'sin coincidencia' }), []);
assert.deepEqual(filterGroupCandidates([], [], [], 'one', defaults), []);
assert.equal(
  JSON.stringify({ athletes, groups, memberships }),
  original,
  'Filtering never mutates source/selection data',
);
console.log(
  'PASS group member picker: accent-insensitive multi-word search, email/role/group, precise group IDs, ungrouped/no-position, membership, combinations, empty results and immutable source.',
);
