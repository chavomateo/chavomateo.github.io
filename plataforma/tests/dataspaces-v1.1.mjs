import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let pglite; try { pglite=await import('@electric-sql/pglite'); } catch { pglite=await import('file:///C:/Users/chavo/.openclaw/workspace-cto/_pgtest/node_modules/@electric-sql/pglite/dist/index.js'); }
let cryptoExtension; try { cryptoExtension=await import('@electric-sql/pglite/contrib/pgcrypto'); } catch { cryptoExtension=await import('file:///C:/Users/chavo/.openclaw/workspace-cto/_pgtest/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js'); }
const {PGlite}=pglite; const {pgcrypto}=cryptoExtension;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const db=new PGlite({extensions:{pgcrypto}});
const reject=async(label,sql)=>{try{await db.exec(sql);throw new Error(`${label}: no rechazo`);}catch(e){if(e.message.endsWith(': no rechazo'))throw e;}};

await db.exec(`create schema auth; create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid',true),'')::uuid $$;`);
for(const file of ['schema.sql','dataspaces-v0.8.sql','dataspaces-v0.9.sql'])
  await db.exec(fs.readFileSync(path.join(root,'db',file),'utf8'));
await db.exec('create role anon; create role authenticated;');
for(const file of ['dataspaces-v1.0-hardening.sql','dataspaces-v1.1-ecosystem-onboarding.sql'])
  await db.exec(fs.readFileSync(path.join(root,'db',file),'utf8'));

const G='10000000-0000-0000-0000-000000000001';
const U1='10000000-0000-0000-0000-000000000002';
const U2='10000000-0000-0000-0000-000000000003';
const E1='10000000-0000-0000-0000-000000000011';
const E2='10000000-0000-0000-0000-000000000012';
const S='10000000-0000-0000-0000-000000000021';
const P1='10000000-0000-0000-0000-000000000031';
const P2='10000000-0000-0000-0000-000000000032';
const CATALOG='10000000-0000-0000-0000-000000000041';
const PRODUCT='10000000-0000-0000-0000-000000000051';

await db.exec(`insert into auth.users values('${G}'),('${U1}'),('${U2}');
insert into empresas(id,nif,razon_social,tipo) values
 ('${E1}','B10000001','Espacio federado','pyme'),('${E2}','B10000002','Empresa ajena','startup');
insert into perfiles(id,empresa_id,rol) values('${G}',null,'gestor'),('${U1}','${E1}','empresa'),('${U2}','${E2}','empresa');
set test.uid='${G}';
insert into espacios_datos(id,codigo,nombre,descripcion,sector,estado)
 values('${S}','ALI-ECO','Ecosistema AlianzaIA','Plano de control','multisectorial','piloto');
insert into participantes_espacio(id,espacio_id,empresa_id,nombre_legal,identificador_legal,estado,validado_por,validado_en)
 values('${P1}','${S}','${E1}','Espacio federado','B10000001','activo','${G}',now()),
       ('${P2}','${S}','${E2}','Empresa ajena','B10000002','activo','${G}',now());
insert into roles_participante(participante_id,rol,aprobado_por) values
 ('${P1}','proveedor','${G}'),('${P2}','proveedor','${G}');`);

await db.exec(`set test.uid='${U1}'; set role authenticated;`);
await reject('espacio sin capacidad operativa',`insert into solicitudes_alta_ecosistema(
 tipo_principal,capacidades,nombre_declarado,identificador_legal,descripcion)
 values('espacio_datos',array['publicar_datasets'],'Incompleto','B10000001','Debe fallar')`);
await db.exec(`insert into solicitudes_alta_ecosistema(
 tipo_principal,capacidades,nombre_declarado,identificador_legal,descripcion,estado,enviada_en)
 values('espacio_datos',array['operar_espacio','publicar_datasets'],'Espacio federado','B10000001','Catalogo sectorial','enviada',now())`);
await db.exec(`update solicitudes_alta_ecosistema set estado='aprobada',resuelta_en=now() where empresa_id='${E1}'`);
const ownApplication=await db.query(`select estado from solicitudes_alta_ecosistema where empresa_id='${E1}'`);
if(ownApplication.rows[0].estado!=='enviada') throw new Error('el usuario se autoaprobo');

await db.exec(`reset role; set test.uid='${G}'; set role authenticated;
insert into tipos_actor_participante(participante_id,tipo,verificado,aprobado_por,aprobado_en)
 values('${P1}','espacio_datos',true,'${G}',now());`);
await db.exec('reset role');
await db.exec(`set test.uid='${U1}'; set role authenticated;
insert into catalogos_federados(id,espacio_id,participante_id,titulo,endpoint_url,protocolo,estado)
 values('${CATALOG}','${S}','${P1}','Catalogo federado','https://example.test/dcat','dcat_ap','revision');
insert into productos_datos(id,espacio_id,proveedor_id,catalogo_origen_id,tipo_producto,identificador_uri,
 titulo,descripcion,version,derechos_titular,nivel_acceso,procedencia,estado)
 values('${PRODUCT}','${S}','${P1}','${CATALOG}','dataset','https://example.test/dataset/1',
 'Dataset federado','Dataset de prueba','1.0','Espacio federado','restringido','Catalogo DCAT','borrador');`);
await reject('proveedor se autopublica',`update productos_datos set estado='publicado',publicado_en=now() where id='${PRODUCT}'`);
const ownProduct=await db.query(`select estado from productos_datos where id='${PRODUCT}'`);
if(ownProduct.rows[0].estado!=='borrador') throw new Error('el proveedor se autopublico');
await db.exec(`insert into solicitudes_publicacion_datos(producto_id,declara_derechos,declara_calidad,declara_condiciones_uso)
 values('${PRODUCT}',true,true,true)`);

await db.exec('reset role');
await db.exec(`set test.uid='${G}'; set role authenticated`);
await db.exec(`select resolver_publicacion_producto(id,true,'Metadatos verificados')
  from solicitudes_publicacion_datos where producto_id='${PRODUCT}'`);
await db.exec('reset role');
await db.exec(`insert into distribuciones_datos(producto_id,titulo,formato,access_url,download_url,estado)
 values('${PRODUCT}','CSV restringido','CSV','https://private.example.test/api','https://private.example.test/file','activo');`);
await db.exec(`set role anon; set test.uid='';`);
const publicRows=await db.query(`select access_url,download_url from catalogo_distribuciones_publicas where producto_id='${PRODUCT}'`);
if(publicRows.rows.length!==1||publicRows.rows[0].access_url!==null||publicRows.rows[0].download_url!==null)
  throw new Error('el catalogo publico expone endpoints restringidos');
await reject('anon lee distribucion base',`select * from distribuciones_datos`);
await db.exec('reset role');

const api=fs.readFileSync(path.join(root,'db','openapi-dataspaces.yaml'),'utf8');
for(const endpoint of ['/onboarding/applications','/federated-catalogs','/catalog/datasets/{id}/submit'])
  if(!api.includes(endpoint)) throw new Error(`falta API ${endpoint}`);
const html=fs.readFileSync(path.join(root,'espacios-datos','index.html'),'utf8');
for(const actor of ['Espacios de datos','Proveedores de servicios IA','Startups','Pymes','Empresas tractoras','Investigadores','Administraciones públicas'])
  if(!html.includes(actor)) throw new Error(`falta perfil UX ${actor}`);

console.log(JSON.stringify({ok:true,version:'1.1',actorTypes:7,federatedCatalog:true,publishReview:true,restrictedUrls:'hidden'}));
