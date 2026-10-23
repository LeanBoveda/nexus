import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const scripts = readdirSync(new URL('.', import.meta.url))
  .filter((name) => /^test-.*\.mjs$/.test(name))
  .sort();
for (const script of scripts) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(script, import.meta.url))],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`PASS: ${scripts.length} isolated behavior suites.`);
