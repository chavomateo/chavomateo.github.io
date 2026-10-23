# AlianzaIA preparada para espacios de datos

Estado: implementación local en la rama `feat/plataforma-mvp-v2`. No aplicada a producción.

## Alcance implementado

La plataforma actúa como **plano de control**. Los conjuntos de datos permanecen en los sistemas de origen. AlianzaIA registra y controla:

- espacios, promotor, autoridad de gobierno y operador;
- candidatos, participantes, roles, adhesiones y credenciales;
- productos de datos con perfil DCAT-AP y salida JSON-LD;
- calidad, vocabularios, distribuciones, APIs y conectores;
- políticas de uso expresadas en ODRL JSON-LD;
- contratos bilaterales, autorizaciones y vigencias;
- transacciones autorizadas con cadena SHA-256 por espacio;
- incidencias, evidencias y evaluación binaria de los 23 criterios CRED.

La función `solicitar_transaccion()` es el punto de control previo al intercambio. Rechaza operaciones si el contrato, la autorización, la distribución, el producto o alguno de los participantes no están activos. La transferencia material la ejecuta el conector en origen; su resultado debe quedar como una nueva traza inmutable.

## Despliegue seguro

1. Crear una copia de la base y aplicar primero `schema.sql` v0.7.
2. Aplicar `dataspaces-v0.8.sql` en una única transacción.
3. Ejecutar las pruebas de `tests/dataspaces-v0.8.mjs` contra PGlite.
4. Generar el seed de candidatos con `node plataforma/tools/import-kit-candidates.mjs` y revisar las filas marcadas `requiere_revision`.
5. Aplicar el seed solo en el entorno interno. Ser candidato no concede membresía, credenciales ni acceso.
6. Crear dos participantes piloto reales, un producto, una distribución y un contrato; ejecutar una transacción completa y conservar evidencias.
7. Publicar la interfaz y abrir el onboarding únicamente después de QA, textos de gobernanza y aprobación de producción.

## Campaña Kit Espacios de Datos

El inventario `data/kit-espacios-datos-candidatos.json` contiene 86 referencias procedentes de la etiqueta 27 de ActiveCampaign. Se han eliminado emails, teléfonos y nombres de personas. Una preclasificación automática de los casos declarados da **12 encajes altos, 35 medios y 39 bajos**; es orientativa y debe revisarse. Varias filas tienen nombres inconsistentes o usan dominios personales; por eso el importador las deja como candidatas y nunca como participantes activos.

Tiene sentido incluirlas porque ya expresaron interés y muchas describieron casos de uso compatibles. No tiene sentido importarlas directamente como miembros: antes hay que validar entidad jurídica, representante, roles, producto de datos, derechos sobre el dato y espacio sectorial de destino.

## Cobertura CRED

`criterios_cred` contiene exactamente 23 filas: `Neg.1–3`, `Gob.1–5`, `Tec.1–6`, `Int.1–5` y `Fun.1–4`. `evaluaciones_cred` es binaria y solo acepta un “cumple” con evidencia enlazada. La vista `estado_conformidad_cred` no marca conforme un espacio hasta que los 23 criterios estén acreditados.

La implementación aporta capacidades y trazas, pero no fabrica evidencias organizativas: el modelo de negocio, el acta de la autoridad de gobierno, el libro de reglas, el plan de sostenibilidad y una transacción real deben existir y aprobarse fuera del código.

## Límites deliberados

- No se ha instalado EDC, FIWARE, SIMPL ni Gaia-X: el CRED no exige un producto concreto.
- No hay data lake central.
- No se activa federación ni Lista de Confianza antes del piloto.
- No se copian datos personales del CRM al repositorio.
- No se despliega esta migración automáticamente contra producción.

Fuentes de diseño: Guía CRED de verificación de conformidad UNE 0087:2025 v1 (17-11-2025), Resolución de 26-11-2025 y Orden TDF/1207/2025.
