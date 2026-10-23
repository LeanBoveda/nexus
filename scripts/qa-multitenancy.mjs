// Deterministic checks for email-based identity and PF data boundaries.
// Databases are in memory; email and object storage are simulated.
await import('./test-email-login.mjs');
await import('./test-athlete-import.mjs');
await import('./test-routine-files.mjs');
console.log('PASS: multi-PF identity and data boundaries (isolated, no live delivery).');
