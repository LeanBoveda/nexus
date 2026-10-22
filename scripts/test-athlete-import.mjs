import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { createRequire } from 'node:module';

function moduleUrl(source) { return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`; }
const importUrl = moduleUrl(await readFile(new URL('../lib/athlete-import.ts', import.meta.url), 'utf8'));
const core = await import(importUrl);
// Exercise the actual XLSX worker with a minimal two-sheet ZIP fixture.
const requireReader = createRequire(import.meta.resolve('read-excel-file/universal'));
const { zipSync, strToU8 } = requireReader('fflate');
const contentTypes = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
const worksheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nombre</t></is></c><c r="B1" t="inlineStr"><is><t>Apellido</t></is></c><c r="C1" t="inlineStr"><is><t>Email</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Ana</t></is></c><c r="B2" t="inlineStr"><is><t>Pérez</t></is></c><c r="C2" t="inlineStr"><is><t>ana@example.com</t></is></c></row></sheetData></worksheet>';
const zip = zipSync(Object.fromEntries(Object.entries({
  '[Content_Types].xml':contentTypes,
  'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Plantel" sheetId="1" r:id="rId1"/><sheet name="Gimnasio" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':worksheet,'xl/worksheets/sheet2.xml':worksheet,
}).map(([path,xml])=>[path,strToU8(xml)])));
let workerResult;
globalThis.self={postMessage:result=>{workerResult=result;}};
await import(moduleUrl((await readFile(new URL('../lib/athlete-file.worker.ts',import.meta.url),'utf8'))
 .replace("'read-excel-file/universal'",JSON.stringify(import.meta.resolve('read-excel-file/universal')))
 .replace("'./athlete-import'",JSON.stringify(importUrl))));
await globalThis.self.onmessage({data:{file:new File([zip],'fixture.xlsx')}});
assert.ok(!workerResult.error,workerResult.error);
assert.deepEqual(workerResult.sheets.map(s=>s.name),['Plantel','Gimnasio']);
assert.equal(workerResult.sheets[0].rows[1][2],'ana@example.com');
await globalThis.self.onmessage({data:{file:new File(['bad'],'fixture.xls')}});
assert.match(workerResult.error,/xlsx/);
delete globalThis.self;
console.log('PASS: actual Excel parser/worker, two-sheet XLSX, legacy XLS rejection.');
assert.deepEqual(core.parseDelimited('\uFEFFNombre;Apellido;Email\r\n"Ana; María";"Pérez ""Gómez""";ana@example.com\r\n'), [['Nombre','Apellido','Email'], ['Ana; María','Pérez "Gómez"','ana@example.com']]);
assert.equal(core.parseDelimited('Nombre,Apellido,Email\n"Ana\nMaría",Pérez,ana@example.com')[1][0], 'Ana\nMaría');
assert.deepEqual(core.guessColumns(['Nombres', 'APELLIDO', 'Correo electrónico', 'Teléfono']), {firstName:0,lastName:1,email:2,phone:3});
assert.equal(core.normalizeBirthDate('29/02/2024'), '2024-02-29');
assert.equal(core.normalizeBirthDate('31/02/2024'), null);
assert.throws(() => core.parseDelimited('Nombre;Email\n"Ana;ana@example.com'), /comillas/);
assert.throws(() => core.checkImportRows(Array(501).fill({})), /500/);
const row = (email, name='Ana') => ({firstName:name,lastName:'Pérez',email,phone:'',birthDate:'20/02/2000',countryCode:'ar',position:'',primaryContext:'',sourceRow:2});
assert.equal(core.checkImportRows([row('TEST@example.com')])[0].data.email, 'test@example.com');
assert.deepEqual(core.checkImportRows([row('same@example.com'),row('same@example.com'),row('bad')]).map(r=>r.status), ['valid','duplicate','error']);
const db = new DatabaseSync(':memory:');
const journal = JSON.parse(await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
for (const migration of journal.entries) db.exec(await readFile(new URL(`../drizzle/${migration.tag}.sql`, import.meta.url), 'utf8'));
let beforeBatch;
const wrap = (sql, params=[]) => ({
  bind: (...values)=>wrap(sql,values),
  first: async()=>db.prepare(sql).get(...params) ?? null,
  all: async()=>({results:db.prepare(sql).all(...params)}),
  run: async()=>({meta:{changes:db.prepare(sql).run(...params).changes}}),
});
globalThis.__importDB = {prepare:wrap,batch:async statements=>{
  beforeBatch?.(); beforeBatch=undefined;
  db.exec('BEGIN');
  try {const result=[]; for(const stmt of statements) result.push(await stmt.run()); db.exec('COMMIT');return result;}
  catch(e){db.exec('ROLLBACK');throw e;}
}};
globalThis.__importUser = {trainerAccountId:'t1'};
const apiSource = (await readFile(new URL('../app/api/athletes/import/route.ts', import.meta.url),'utf8'))
 .replace("import { getD1 } from '@/db';", 'const getD1=()=>globalThis.__importDB;')
 .replace("import { getStaffSessionFromRequest } from '@/lib/auth';", 'const getStaffSessionFromRequest=async()=>globalThis.__importUser;')
 .replace("'@/lib/athlete-import'",JSON.stringify(importUrl));
const api = await import(moduleUrl(apiSource));
db.exec(`INSERT INTO trainer_accounts(id,business_name,slug,contact_email,max_athletes) VALUES ('t1','PF1','pf1','pf1@example.com',5),('t2','PF2','pf2','pf2@example.com',5);
INSERT INTO organizations(id,trainer_account_id,name,type) VALUES ('o1','t1','Club','club'),('o2','t2','Club2','club');
INSERT INTO groups(id,organization_id,name,sport) VALUES ('g1','o1','Plantel','handball_indoor'),('g2','o2','Otro','handball_indoor');
INSERT INTO athletes(id,trainer_account_id,first_name,last_name,email) VALUES ('existing','t1','Existing','Alumno','existing@example.com'),('foreign','t2','Foreign','Alumno','foreign@example.com');`);
const request = async (body, origin='https://nexo.example') => api.POST(new Request('https://nexo.example/api/athletes/import',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
let response = await request({action:'preview',rows:[row('new@example.com'),row('existing@example.com'),row('foreign@example.com'),row('invalid')],groupId:'g1'});
assert.equal(response.status,200);
assert.deepEqual((await response.json()).rows.map(r=>r.status),['valid','duplicate','duplicate','error']);
assert.equal((await request({action:'commit',rows:[row('no@example.com')],groupId:'g2'})).status,404);
assert.equal((await request({action:'commit',rows:[row('no@example.com')]},'https://attacker.example')).status,403);
response=await request({action:'commit',rows:[row('new@example.com'),row('existing@example.com'),row('invalid')],groupId:'g1'});
assert.equal(response.status,201);assert.deepEqual(await response.json(),{created:1,skipped:2});
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM group_memberships WHERE group_id='g1'").get().n,1);
response=await request({action:'commit',rows:[row('new@example.com')],groupId:'g1'});
assert.deepEqual(await response.json(),{created:0,skipped:1});
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM athletes WHERE email='new@example.com'").get().n,1);
// The quota changes after preview/preflight: the entire batch must roll back.
beforeBatch=()=>db.exec("UPDATE trainer_accounts SET max_athletes=3 WHERE id='t1'");
response=await request({action:'commit',rows:[row('race1@example.com'),row('race2@example.com')],groupId:'g1'});
assert.equal(response.status,409);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM athletes WHERE email LIKE 'race%'").get().n,0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM group_memberships WHERE group_id='g1'").get().n,1);
beforeBatch=()=>db.exec("UPDATE groups SET active=0 WHERE id='g1'");
response=await request({action:'commit',rows:[row('group-race@example.com')],groupId:'g1'});
assert.equal(response.status,409);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM athletes WHERE email='group-race@example.com'").get().n,0);
globalThis.__importUser=null;
assert.equal((await request({action:'preview',rows:[row('no@example.com')]})).status,401);
db.close();
console.log('PASS: CSV quoting/BOM/multiline, header mapping, calendar dates, validation, tenant/group authorization, preview, duplicates, import with group, retries, capacity race rollback, group race rollback, CSRF, authentication.');
