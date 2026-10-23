import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite;
try {
  pglite = await import('@electric-sql/pglite');
} catch {
  pglite = await import('file:///C:/Users/chavo/.openclaw/workspace-cto/_pgtest/node_modules/@electric-sql/pglite/dist/index.js');
}
let cryptoExtension;
try {
  cryptoExtension = await import('@electric-sql/pglite/contrib/pgcrypto');
} catch {
  cryptoExtension = await import('file:///C:/Users/chavo/.openclaw/workspace-cto/_pgtest/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js');
}
const { PGlite } = pglite;
const { pgcrypto } = cryptoExtension;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite({ extensions: { pgcrypto } });
const expectReject = async (label, sql) => {
  try { await db.exec(sql); throw new Error(`${label}: no rechazó`); }
  catch (error) { if (error.message.endsWith(': no rechazó')) throw error; }
};

await db.exec(`create schema auth; create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true),'')::uuid $$;`);
await db.exec(fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8'));
await db.exec(fs.readFileSync(path.join(root, 'db/dataspaces-v0.8.sql'), 'utf8'));
await db.exec(fs.readFileSync(path.join(root, 'db/dataspaces-v0.9.sql'), 'utf8'));
await db.exec(`create role anon; create role authenticated;`);
await db.exec(fs.readFileSync(path.join(root, 'db/dataspaces-v1.0-hardening.sql'), 'utf8'));

const G='00000000-0000-0000-0000-000000000001';
const E1='00000000-0000-0000-0000-000000000011';
const E2='00000000-0000-0000-0000-000000000012';
const S='00000000-0000-0000-0000-000000000021';
const P1='00000000-0000-0000-0000-000000000031';
const P2='00000000-0000-0000-0000-000000000032';
const D='00000000-0000-0000-0000-000000000041';
const PR='00000000-0000-0000-0000-000000000051';
const DI='00000000-0000-0000-0000-000000000061';
const PO='00000000-0000-0000-0000-000000000071';
const C='00000000-0000-0000-0000-000000000081';
const A='00000000-0000-0000-0000-000000000091';
const U2='00000000-0000-0000-0000-000000000022';
const U3='00000000-0000-0000-0000-000000000023';
const E3='00000000-0000-0000-0000-000000000013';
const S2='00000000-0000-0000-0000-000000000024';
const P3='00000000-0000-0000-0000-000000000025';

await db.exec(`insert into auth.users values ('${G}'),('${U2}'),('${U3}');
insert into empresas(id,nif,razon_social,tipo) values
 ('${E1}','B00000011','Proveedor piloto','startup'),('${E2}','B00000012','Consumidor piloto','pyme'),
 ('${E3}','B00000013','Tercero no autorizado','pyme');
insert into perfiles(id,empresa_id,rol) values
 ('${G}',null,'gestor'),('${U2}','${E2}','empresa'),('${U3}','${E3}','empresa'); set test.uid='${G}';
insert into espacios_datos(id,codigo,nombre,descripcion,sector,estado)
 values('${S}','PILOTO-01','Piloto AlianzaIA','Piloto cerrado','multisectorial','piloto');
insert into participantes_espacio(id,espacio_id,empresa_id,nombre_legal,identificador_legal,estado,validado_por,validado_en)
 values('${P1}','${S}','${E1}','Proveedor piloto','B00000011','activo','${G}',now()),
       ('${P2}','${S}','${E2}','Consumidor piloto','B00000012','activo','${G}',now());
insert into roles_participante(participante_id,rol,aprobado_por) values
 ('${P1}','proveedor','${G}'),('${P2}','consumidor','${G}');
insert into productos_datos(id,espacio_id,proveedor_id,identificador_uri,titulo,descripcion,version,
 derechos_titular,licencia_uri,nivel_acceso,procedencia,estado,publicado_en)
 values('${D}','${S}','${P1}','https://example.test/datasets/1','Dataset piloto','Datos sintéticos','1.0',
 'Proveedor piloto','https://creativecommons.org/licenses/by/4.0/','restringido','Sistema de prueba','publicado',now());
insert into distribuciones_datos(id,producto_id,titulo,formato,access_url,estado)
 values('${DI}','${D}','API JSON','JSON','https://api.example.test/v1/data','activo');
insert into politicas_uso_datos(id,producto_id,version,odrl_jsonld,texto_legible)
 values('${PO}','${D}','1.0','{"@type":"odrl:Policy"}','Solo para el piloto');
insert into contratos_datos(id,espacio_id,producto_id,politica_id,proveedor_id,consumidor_id,version,
 documento_sha256,estado,aceptado_proveedor_en,aceptado_consumidor_en,vigente_desde)
 values('${C}','${S}','${D}','${PO}','${P1}','${P2}','1.0',repeat('a',64),'activo',now(),now(),now());
insert into autorizaciones_datos(id,contrato_id,distribucion_id,consumidor_id,alcance,finalidad,emitida_por)
 values('${A}','${C}','${DI}','${P2}',array['read'],'validación piloto','${G}');`);

const criteria = await db.query(`select count(*)::int n, min(orden)::int minimo, max(orden)::int maximo from criterios_cred`);
if (criteria.rows[0].n !== 23 || criteria.rows[0].minimo !== 1 || criteria.rows[0].maximo !== 23)
  throw new Error('la matriz CRED no contiene exactamente 23 criterios ordenados');

const tx = await db.query(`select solicitar_transaccion('${A}','consulta','pilot-001','{"rows":10}') id`);
if (!tx.rows[0].id) throw new Error('no se creó la transacción autorizada');
const chain = await db.query(`select hash_prev, length(hash)::int hash_len from transacciones_datos`);
if (chain.rows[0].hash_prev !== 'GENESIS' || chain.rows[0].hash_len !== 64)
  throw new Error('cadena de integridad inválida');
await expectReject('inmutabilidad', `delete from transacciones_datos`);

await db.exec(`set test.uid='${U2}'`);
const participantTx = await db.query(`select solicitar_transaccion('${A}','consulta','pilot-002','{}') id`);
if (!participantTx.rows[0].id) throw new Error('la parte autenticada no pudo solicitar la transacción');
await db.exec(`set test.uid='${U3}'`);
await expectReject('actor ajeno', `select solicitar_transaccion('${A}','consulta','pilot-003','{}')`);
await db.exec(`set test.uid='${G}';
insert into espacios_datos(id,codigo,nombre,descripcion,sector,estado)
 values('${S2}','PILOTO-02','Otro espacio','Aislamiento','multisectorial','piloto');
insert into participantes_espacio(id,espacio_id,empresa_id,nombre_legal,identificador_legal,estado,validado_por,validado_en)
 values('${P3}','${S2}','${E3}','Tercero no autorizado','B00000013','activo','${G}',now())`);
await expectReject('producto entre espacios', `insert into productos_datos(
  espacio_id,proveedor_id,identificador_uri,titulo,descripcion,version,derechos_titular,procedencia)
  values('${S}','${P3}','https://example.test/cross','Cruce','No permitido','1.0','Tercero','Prueba')`);

await db.exec(`update autorizaciones_datos set revocada_en=now() where id='${A}'`);
await expectReject('autorización revocada', `select solicitar_transaccion('${A}','consulta','pilot-004','{}')`);

await db.exec(`insert into evaluaciones_cred(espacio_id,criterio_codigo,cumple,justificacion,evaluada_por)
 values('${S}','Neg.1',false,'Sin evidencia suficiente','${G}')`);
await expectReject('cumple sin evidencia', `insert into evaluaciones_cred(espacio_id,criterio_codigo,cumple,justificacion,evaluada_por)
 values('${S}','Neg.2',true,'No debe admitirse','${G}')`);

const candidate = JSON.parse(fs.readFileSync(path.join(root, 'data/kit-espacios-datos-candidatos.json'),'utf8'));
if (candidate.count !== 86 || candidate.candidates.length !== 86) throw new Error('inventario Kit incompleto');
if (candidate.candidates.some((x) => /@/.test(JSON.stringify(x)))) throw new Error('el inventario contiene emails');

console.log(JSON.stringify({ok:true,criterios:23,candidatos:86,transaccion:tx.rows[0].id,hash:'SHA-256'}));
