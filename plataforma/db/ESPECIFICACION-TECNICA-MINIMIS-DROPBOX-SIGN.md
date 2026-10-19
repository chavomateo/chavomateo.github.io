# ESPECIFICACIÓN TÉCNICA E INTEGRACIÓN: DECLARACIÓN DE MINIMIS VÍA DROPBOX SIGN

**Destinatarios:** Alianza-CEO / Legal Counsel  
**Emisor:** CTO · Corporación XV  
**Fecha:** 19 de octubre de 2026, 19:50 (v0.7: corrección de errores, régimen comprobado y acceso solo del gestor)  
**Referencia:** Anexo 5-bis (A) · Google Doc `1hB_KTItdGv1XcYo_dUYgJzcMDln_gSbtPkHiVAgyJsc`  
**Coste:** 0,00 € (Sin gasto adicional)  

---

## 1. Estado Real de la Cuenta Dropbox Sign de AES

Tras la comprobación en vivo de la cuenta corporativa de AES:
1. **Modalidad del Plan:** Plan web de pago estándar **sin plan de API** (cuota de solicitudes API reales = 0).
   - Por API solo se pueden emitir peticiones en modo prueba (*test mode*), que carecen de validez legal ante Red.es / auditoría europea.
   - Las solicitudes de firma legalmente vinculantes deben despacharse obligatoriamente desde la **interfaz web de Dropbox Sign**.
2. **Capacidad de Plantillas:** **5 de 5 plantillas ocupadas (0 libres)**.
   - Crear una nueva plantilla guardada en la web requiere o bien archivar/liberar una plantilla existente en desuso, o bien contratar un upgrade (lo cual requiere el OK previo de Carlos por implicar gasto).
3. **Webhooks / Event Callbacks en Plan Web sin API:**
   - La funcionalidad de *Account Callback URL* (notificación automática por webhook de eventos como `signature_request_all_signed`) está restringida en la arquitectura de Dropbox Sign al módulo de desarrolladores/API. En planes web puros sin cuota API contratada, no se emiten callbacks HTTP hacia endpoints externos para solicitudes originadas en web.
   - **Determinación técnica:** Se descarta el webhook como canal crítico. El flujo operativo oficial de la plataforma se cimenta sobre el **registro manual verificado por el gestor**, garantizando coste 0 € e independencia total de add-ons de pago.

---

## 2. Flujo Operativo Principal: Registro Manual por el Gestor

El gestor de la plataforma de AES actúa como validador del expediente:

```
[Empresa solicita alta]
         │
         ▼
[Gestor envía solicitud desde web de Dropbox Sign]
(Plantilla o documento pre-rellenado con datos fijos)
         │
         ▼
[Firma del Representante / Administradores]
         │
         ▼
[Gestor descarga de Dropbox Sign:]
   1. PDF final firmado
   2. Audit Trail oficial (log de eventos y sellado temporal)
         │
         ▼
[Gestor introduce en Panel de Control de la Plataforma:]
   - ID de la solicitud (signature_request_id)
   - Régimen: único, solidario o mancomunado
   - Datos firmante 1: nombre, email, cargo, fecha/hora firma
   - Datos firmante 2 (si es mancomunado): nombre, email, cargo, fecha/hora
   - Sube PDF firmado y Audit Trail (el sistema computa SHA-256 inmutable)
         │
         ▼
[Plataforma valida integridad y activa empresa (minimis_validado = true)]
```

---

## 3. Soporte para Administradores Mancomunados (Doble Firma)

El esquema de base de datos (`schema.sql` v0.5) incorpora soporte estructural para empresas que requieran firma mancomunada:
- **Campo `regimen_administracion`:** `'unico'`, `'solidario'` o `'mancomunado'`.
- **Campos firmante 1:** `firmante_nombre`, `firmante_email`, `firmante_cargo`, `firmado_en`.
- **Campos firmante 2:** `firmante2_nombre`, `firmante2_email`, `firmante2_cargo`, `firmado2_en`.
- **Restricción de integridad en base de datos (`CHECK constraint`):**
  ```sql
  constraint firmas_mancomunadas_completas check (
    regimen_administracion <> 'mancomunado' or
    (firmante2_nombre is not null and firmante2_email is not null and firmado2_en is not null)
  )
  ```
- **Función de validación `firma_alta_vigente(empresa_id)`:** Si el régimen es mancomunado, evalúa estrictamente que ambos administradores hayan firmado. De no constar la doble firma, la función devuelve `false` y el motor de asignaciones bloquea cualquier concesión de créditos.

---

## 4. Custodia y Auditoría Criptográfica

Para cada firma registrada manualmente:
1. **Cálculo de Hash SHA-256 en Servidor:**
   - `documento_sha256`: Hash del PDF firmado.
   - `audit_trail_sha256`: Hash del certificado de auditoría expedido por Dropbox Sign.
2. **Almacenamiento Seguro:** Ambos documentos se archivan en el bucket privado de la Unión Europea (`documento_ruta`, `audit_trail_ruta`).
3. **Trazabilidad del Gestor:** Se asienta el `registrado_por` (UUID del perfil del gestor) y `notas_verificacion`. La tabla `firmas_externas` cuenta con trigger `solo_insercion()`, impidiendo cualquier modificación o borrado posterior.
4. **Cifrado de Importes Sensibles (EUDPO / RGPD):** Las declaraciones de importes previos continúan protegidas con cifrado a nivel de columna vía `pgcrypto`.

---

## 5. Total declarado, renovación y motivos para volver a firmar (esquema v0.6, commit `71a73b8`, correcciones de Legal del 19-oct)

### 5.1 Total declarado frente a la tabla
- **Sin anexo (hasta 8 ayudas):** `total_ayudas_eur` = suma de la tabla (`suma_tabla_eur`).
- **Con anexo (más de 8 ayudas):** `total_ayudas_eur` ≥ suma de la tabla; el anexo se guarda con su ruta y su huella SHA-256, y **AES lo revisa a mano** (tabla `revisiones_anexo`) antes de la primera asignación. Sin revisión conforme no se asigna.
- Por cada empresa se guardan el PDF firmado y el certificado de auditoría con sus huellas, la fecha de firma y el `signature_request_id`.

### 5.2 Renovación a los 30 días: con la casilla, sin volver a firmar
- Pasados 30 días la declaración se renueva **marcando la casilla en la plataforma** (punto 10 de la plantilla), con el mismo valor que la firma. No se vuelve a firmar.
- En cada asignación sigue haciendo falta la confirmación corta del A-bis.

### 5.3 Volver a firmar en Dropbox Sign (y bloqueo de asignaciones mientras tanto), solo si:
1. cambia el representante o cambian las empresas vinculadas (se declara en la casilla o en el A-bis);
2. aparece una ayuda nueva de más de 50.000 €;
3. las ayudas recibidas más la nueva asignación superan 240.000 €;
4. han pasado 12 meses desde la última firma.

La ventana móvil de 3 años, contada hacia atrás desde cada asignación, es un cálculo (tope de 300.000 €), no un motivo para volver a firmar. Los umbrales (30 días, 12 meses, 50.000 €, 240.000 €) están en `parametros_legales` y se cambian con un registro nuevo, sin tocar el código.

### 5.4 Mancomunados
- Se firman como solicitud suelta desde la web de Dropbox Sign, con el texto v1.1 sin cambios.
- La casilla de renovación y el A-bis los aceptan **los dos** administradores (`coaceptar_minimis`, misma huella del documento). Si el segundo no tiene cuenta en la plataforma, hay que volver a firmar en Dropbox Sign.

### 5.5 Webhook y API
- El registro manual es la vía principal. El webhook y la descarga automática no se usan salvo que la documentación confirme que funcionan sin plan de API. Un plan de API sería gasto (OK de Carlos).

Pruebas: `_pgtest/minimis_v06.mjs` (PGlite), 26 casos sin fallos: 34 tablas y 75 políticas.

## 6. Ajustes de alianza-ceo (esquema v0.7, 19-oct)

### 6.1 Corrección de errores sin tocar el registro
- `firmas_externas` sigue siendo solo de inserción. Para corregir, el gestor anota un registro **nuevo** con `sustituye_a` (id del registro mal hecho) y `motivo_sustitucion` (obligatorio). El registro anterior se conserva tal cual.
- Si el registro no debía existir (p. ej., una revocación anotada en la empresa equivocada), se anota un registro de tipo `anulacion` con `sustituye_a` y motivo, sin datos de firma. Solo puede anular registros de la misma empresa.
- Un registro solo se puede sustituir una vez (`sustituye_a` es único); para volver a corregir, se sustituye la corrección.
- La vista `firmas_vigentes` excluye todo registro sustituido o anulado. `firma_alta_actual()` (y con ella `firma_alta_vigente()` y la comprobación de minimis) lee **solo** de esa vista: un registro sustituido no cuenta nunca, aunque tenga una fecha más reciente.
- La misma firma de Dropbox Sign no puede estar dos veces vigente: para volver a anotarla hay que sustituir el registro que la tiene.
- Si la firma corregida lleva anexo, AES tiene que revisar de nuevo el anexo sobre el registro nuevo.

### 6.2 Régimen de administración comprobado con documento
- Campos nuevos: `regimen_declarado` (lo que dice la empresa) y `regimen_comprobado_con` (`escritura`, `nota_simple` o `sin_documento`).
- Con escritura o nota simple, la referencia del documento (protocolo, CSV de la nota simple…) es obligatoria en `notas_verificacion`.
- Con `sin_documento`, el registro solo se admite como `mancomunado` y con las dos firmas. El valor por defecto de `regimen_administracion` pasa a ser `mancomunado`.

### 6.3 Almacén privado y conservación
- Bucket de Supabase Storage `firmas` (privado, región UE) para el PDF firmado, el certificado de auditoría, el anexo y las copias en PDF de las declaraciones (`plataforma/db/supabase-storage.sql`).
- **Bucket `firmas`:** solo el rol **gestor** lee y sube (RLS sobre `storage.objects`). No hay políticas de modificar ni de borrar: nadie cambia ni borra un fichero desde la API (una corrección se sube como fichero nuevo y se anota con `sustituye_a`). La empresa y el auditor no acceden.
- **Tabla `firmas_externas` (y la vista `firmas_vigentes`):** solo el rol **gestor** lee (`gestor_lee_firmas`) y anota (`gestor_firmas`). Ni la empresa ni el auditor ven sus filas: la tabla queda fuera de la lectura general del personal (`*_staff_lee`). Nadie puede modificar ni borrar (`solo_insercion()`).
- **La empresa solo sabe si su firma está vigente** con `mi_firma_alta_vigente()`, que devuelve sí o no, sin nombres, emails ni IP. `firma_alta_actual()` y `firma_alta_vigente()` no se pueden llamar desde la API (devuelven la fila entera); las usa por dentro la comprobación de minimis, que corre como `security definer`.
- La función que genera y envía el PDF usa la service_role (no pasa por la RLS).
- Si el auditor de Red.es necesita ver una firma, el gestor le entrega el expediente concreto: no tiene acceso directo.
- Conservación: parámetro legal `conservacion_firmas_anos` = 10, **provisional**. Propuesta: 10 años desde la última ayuda amparada por esa firma (art. 6.4 del Reg. (UE) 2023/2831). Lo decide Legal.

- **Plazo de conservación — lo fija Legal.** Datos que se guardan: PDF firmado, certificado de auditoría de Dropbox Sign, anexo (si hay más de 8 ayudas) y copias en PDF de las declaraciones, con nombre, email, cargo e IP de los firmantes. Propuesta técnica: 10 años desde la última ayuda amparada por esa firma (art. 6.4 del Reg. (UE) 2023/2831). Queda en `parametros_legales` como provisional; si Legal fija otro plazo, se cambia con un registro nuevo, sin tocar el código.

Pruebas en PGlite (Postgres 17), todas con 0 fallos: `_pgtest/minimis_v07.mjs` (regresión de la 0.6 + 21 casos nuevos), `_pgtest/storage_v07.mjs` (bucket privado) y `_pgtest/rls_firmas_v07.mjs` (solo el gestor anota y lee; la empresa y el auditor ven 0 filas y no pueden llamar a `firma_alta_actual()`; la empresa sí consulta `mi_firma_alta_vigente()`).
