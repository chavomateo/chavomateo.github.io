import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let pglite; try { pglite=await import('@electric-sql/pglite'); } catch { pglite=await import('file:///C:/Users/chavo/.openclaw/workspace-cto/_pgtest/node_modules/@electric-sql/pglite/dist/index.js'); }
let cryptoExtension; try { cryptoExtension=await import('@electric-sql/pglite/contrib/pgcrypto'); } catch { cryptoExtension=await import('file:///C:/Users/chavo/.openclaw/workspace-cto/_pgtest/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js'); }
const {PGlite}=pglite; const {pgcrypto}=cryptoExtension;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const db=new PGlite({extensions:{pgcrypto}});
await db.exec(`create schema auth; create table auth.users(id uuid primary key); create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;`);
for(const file of ['schema.sql','dataspaces-v0.8.sql','dataspaces-v0.9.sql']) await db.exec(fs.readFileSync(path.join(root,'db',file),'utf8'));
const tables=await db.query(`select table_name from information_schema.tables where table_schema='public' and table_name in ('casos_uso_datos','productos_caso_uso','matches_caso_candidato','solicitudes_acceso_datos','eventos_flujo_datos')`);
if(tables.rows.length!==5) throw new Error('faltan tablas v0.9');
const html=fs.readFileSync(path.join(root,'espacios-datos','index.html'),'utf8');
for(const marker of ['id="catalogo"','id="casos"','id="participar"','id="sandbox"','id="gobernanza"','Saltar al contenido','no está inscrita']) if(!html.includes(marker)) throw new Error(`falta UX: ${marker}`);
const api=fs.readFileSync(path.join(root,'db','openapi-dataspaces.yaml'),'utf8');
for(const endpoint of ['/use-cases','/access-requests','/flows/{flowId}/evidence','/connector-adapters']) if(!api.includes(endpoint)) throw new Error(`falta API: ${endpoint}`);
console.log(JSON.stringify({ok:true,version:'0.9',tables:tables.rows.length,ux:'portal+sandbox',api:'expanded'}));
