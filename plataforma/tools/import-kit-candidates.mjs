#!/usr/bin/env node
// Convierte el inventario sin PII del Kit Espacios de Datos en SQL idempotente.
// Uso: node plataforma/tools/import-kit-candidates.mjs > /ruta/temporal/seed.sql
// Después se revisa y se ejecuta en la misma transacción que dataspaces-v0.8.sql.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../data/kit-espacios-datos-candidatos.json');
const payload = JSON.parse(fs.readFileSync(source, 'utf8'));

if (!Array.isArray(payload.candidates) || payload.count !== payload.candidates.length) {
  throw new Error('inventario inconsistente');
}
if (payload.candidates.some((x) => !x.source_contact_id || /@/.test(JSON.stringify(x)))) {
  throw new Error('registro inválido o con email: se aborta la importación');
}

const q = (value) => value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const values = payload.candidates.map((x) => `(${[
  q(x.declared_name), q(x.domain), q(x.website), q(x.use_case_summary), q(x.proposed_theme), q(x.fit_preassessment), q(payload.source.system),
  q(x.source_contact_id), q(x.review_status === 'needs_review' ? 'requiere_revision' : 'pendiente')
].join(',')})`).join(',\n');

process.stdout.write(`-- Generado desde ${path.basename(source)} (${payload.count} candidatos, sin PII)\n`);
process.stdout.write(`insert into candidatos_participante\n`);
process.stdout.write(`  (nombre_declarado,dominio,web,resumen_caso_uso,tema_propuesto,encaje_preliminar,sistema_origen,referencia_origen,estado_revision) values\n`);
process.stdout.write(values);
process.stdout.write(`\non conflict (sistema_origen,referencia_origen) do update set\n`);
process.stdout.write(`  nombre_declarado=excluded.nombre_declarado, dominio=excluded.dominio, web=excluded.web,\n`);
process.stdout.write(`  resumen_caso_uso=excluded.resumen_caso_uso, tema_propuesto=excluded.tema_propuesto, encaje_preliminar=excluded.encaje_preliminar;\n`);
