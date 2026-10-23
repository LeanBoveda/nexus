import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(
  new URL('../lib/evaluation-athlete-filters.ts', import.meta.url),
  'utf8',
);
const { filterEvaluationAthletes: filter } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext },
      }).outputText,
    ).toString('base64')
);
const players = [
  {
    id: 'a',
    firstName: 'Lucía',
    lastName: 'Pérez',
    email: 'lucia@example.test',
    primaryPosition: 'Lateral',
    groupIds: ['g1', 'g2'],
  },
  {
    id: 'b',
    firstName: 'Lucas',
    lastName: 'Gómez',
    email: 'lucas@example.test',
    primaryPosition: 'Arquero',
    groupIds: ['g2'],
  },
  {
    id: 'c',
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana@example.test',
    primaryPosition: null,
    groupIds: [],
  },
];
const run = (changes) =>
  filter(
    players,
    { query: '', groupId: '', position: '', evaluated: '', ...changes },
    new Set(['a']),
  ).map((p) => p.id);
assert.deepEqual(run({ query: 'PEREZ lucia' }), ['a']);
assert.deepEqual(run({ query: 'ana@example' }), ['c']);
assert.deepEqual(run({ groupId: 'g2' }), ['a', 'b']);
assert.deepEqual(run({ groupId: '__ungrouped' }), ['c']);
assert.deepEqual(run({ position: 'Arquero' }), ['b']);
assert.deepEqual(run({ evaluated: 'yes' }), ['a']);
assert.deepEqual(run({ evaluated: 'no' }), ['b', 'c']);
assert.deepEqual(run({ query: 'Lucas', groupId: 'g1' }), []);
assert.deepEqual(run({}), ['a', 'b', 'c']);
console.log(
  'PASS filtros de evaluaciones: búsqueda sin tildes, email, grupos múltiples/sin grupo, posición, evaluados, combinación y limpieza.',
);
