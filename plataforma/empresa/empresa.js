// Plataforma AlianzaIA · Módulo e: área de empresa.
// MVP en modo DEMO: todo se guarda en localStorage (clave alianzaia_empresa_demo).
// El acceso a datos está encapsulado en `Datos` (métodos async) para pasar a
// Supabase UE sin tocar la interfaz: empresas, perfiles, aceptaciones,
// declaraciones_minimis, kpis_empresa y audit_log de db/schema.sql.
// Lee en solo lectura alianzaia_diagnosticos (módulo b) y, si existen,
// alianzaia_creditos_demo (módulo c) y alianzaia_formacion_demo (módulo d).
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLAVE = 'alianzaia_empresa_demo';
  const AJENAS = { diagnosticos: 'alianzaia_diagnosticos', creditos: 'alianzaia_creditos_demo', formacion: 'alianzaia_formacion_demo' };
  const TAMANOS = { micro: 'Microempresa', pequena: 'Pequeña empresa', mediana: 'Mediana empresa' };
  const ESTADOS = { pendiente: 'Pendiente de validar', validada: 'Validada', baja: 'Baja' };
  const TIPOS = { startup: 'Startup', pyme: 'Pyme', autonomo: 'Autónomo', otra: 'Otra' };
  const ZONA = 'Europe/Madrid';
  let D = null;   // semilla: data/empresa-demo.json
  let Q = null;   // cuestionario (nombres de las dimensiones), opcional

  // ---------------------------------------------------------------- utilidades
  const eur = (n) => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const num = (n) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 1 });
  const fechaHora = (iso) => iso ? new Date(iso).toLocaleString('es-ES', { timeZone: ZONA, dateStyle: 'short', timeStyle: 'medium' }) : '—';
  const fecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: ZONA }) : '—';
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const leerAjena = (clave) => { try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch (e) { return null; } };
  const param = (clave) => (D.parametros_legales || []).filter((p) => p.clave === clave).sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
  const texto = (doc) => D.textos_legales.find((t) => t.documento === doc);

  async function sha256(txt) {
    if (!(window.crypto && crypto.subtle)) throw new Error('Este navegador no permite calcular huellas SHA-256 (hace falta HTTPS).');
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  // NIF / NIE / CIF con dígito de control (algoritmo oficial de la AEAT).
  const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
  function validarNif(entrada) {
    const v = String(entrada || '').toUpperCase().replace(/[\s.\-]/g, '');
    if (/^\d{8}[A-Z]$/.test(v)) return { v, clase: 'DNI', ok: LETRAS_DNI[Number(v.slice(0, 8)) % 23] === v[8] };
    if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return { v, clase: 'NIE', ok: LETRAS_DNI[Number('XYZ'.indexOf(v[0]) + v.slice(1, 8)) % 23] === v[8] };
    if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
      let suma = 0;
      for (let i = 0; i < 7; i++) {
        const n = Number(v[i + 1]);
        if (i % 2 === 0) { const x = n * 2; suma += Math.floor(x / 10) + (x % 10); } else suma += n;
      }
      const c = (10 - (suma % 10)) % 10, letra = 'JABCDEFGHI'[c], ctl = v[8];
      let ok;
      if ('PQRSNW'.includes(v[0])) ok = ctl === letra;
      else if ('ABEH'.includes(v[0])) ok = ctl === String(c);
      else ok = ctl === letra || ctl === String(c);
      return { v, clase: 'CIF', ok };
    }
    return { v, clase: null, ok: false };
  }

  // Tamaño según la Recomendación 2003/361/CE: plantilla (UTA) y volumen de negocio O balance.
  function tamanoUE(plantilla, facturacion, balance) {
    if (plantilla < 10 && (facturacion <= 2e6 || balance <= 2e6)) return 'micro';
    if (plantilla < 50 && (facturacion <= 10e6 || balance <= 10e6)) return 'pequena';
    if (plantilla < 250 && (facturacion <= 50e6 || balance <= 43e6)) return 'mediana';
    return null; // gran empresa: fuera del programa
  }

  // ---------------------------------------------------------------- Datos
  // Única puerta a los datos. En producción, cada método pasa a una llamada a
  // Supabase (tablas y funciones de schema.sql) con la misma firma.
  const Datos = {
    _vacio: () => ({ version: 1, empresa: null, perfiles: [], aceptaciones: [], declaraciones_minimis: [], kpis_empresa: [], audit_log: [], n: 0 }),
    _leer() { try { return Object.assign(this._vacio(), JSON.parse(localStorage.getItem(CLAVE) || '{}')); } catch (e) { return this._vacio(); } },
    _escribir(s) { localStorage.setItem(CLAVE, JSON.stringify(s)); },
    _yo(s) { return (s.perfiles.find((p) => p.es_yo) || {}).id || 'usuario-demo'; },
    _audit(s, tabla, accion, fila_id, antes, despues, detalle, actor) {
      s.n += 1;
      s.audit_log.push({ n: s.n, ts: new Date().toISOString(), actor: actor || this._yo(s), empresa_id: s.empresa ? s.empresa.id : null,
        tabla, accion, fila_id: fila_id ?? null, antes: antes ?? null, despues: despues ?? null, detalle });
    },

    async semilla() {
      const r = await fetch('/plataforma/data/empresa-demo.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('semilla');
      return r.json();
    },
    async estado() { return this._leer(); },
    async hayDatos() { return localStorage.getItem(CLAVE) !== null; },

    async crearEmpresa(e, representante) {
      const s = this._leer();
      if (s.empresa) throw new Error('Esta demo ya tiene una empresa dada de alta.');
      const empresa = { id: uuid(), nif: e.nif, razon_social: e.razon_social, tipo: e.tipo, tamano: e.tamano, cnae: e.cnae,
        provincia: e.provincia, ccaa: e.ccaa, fecha_constitucion: e.fecha_constitucion || null,
        plantilla: e.plantilla, volumen_negocio_eur: e.facturacion, balance_eur: e.balance,
        minimis_declarado: false, minimis_fecha: null, minimis_importe_3a: null,
        estado: 'pendiente', creado_en: new Date().toISOString() };
      const perfil = { id: uuid(), empresa_id: empresa.id, nombre: representante.nombre, cargo: representante.cargo, email: representante.email,
        rol: 'empresa', rol_empresa: 'admin', estado: 'activo', es_yo: true, creado_en: empresa.creado_en };
      s.empresa = empresa; s.perfiles = [perfil];
      this._audit(s, 'empresas', 'INSERT', empresa.id, null, empresa, `Alta de empresa ${empresa.razon_social} (estado pendiente)`);
      this._audit(s, 'perfiles', 'INSERT', perfil.id, null, perfil, `Alta del usuario administrador ${perfil.email}`);
      this._escribir(s);
      return empresa;
    },

    async cambiarEstado(nuevo) {
      const s = this._leer();
      if (!s.empresa) throw new Error('No hay empresa.');
      const antes = s.empresa.estado;
      if (antes === nuevo) return s.empresa;
      s.empresa.estado = nuevo;
      this._audit(s, 'empresas', 'UPDATE', s.empresa.id, { estado: antes }, { estado: nuevo }, `Estado: ${antes} → ${nuevo}`, 'gestor-demo');
      this._escribir(s);
      return s.empresa;
    },

    // Equivale a registrar_aceptacion(): versión, fecha-hora y huella SHA-256 del documento aceptado.
    async registrarAceptacion({ documento, version, aceptado, representa_empresa = null, contenido, huella_origen }) {
      const documento_sha256 = await sha256(contenido);
      const s = this._leer();
      const a = { id: uuid(), perfil_id: this._yo(s), empresa_id: s.empresa ? s.empresa.id : null, documento, version, aceptado,
        representa_empresa, documento_sha256, huella_origen, ip: null, user_agent: navigator.userAgent, creado_en: new Date().toISOString() };
      s.aceptaciones.push(a);
      this._audit(s, 'aceptaciones', 'INSERT', a.id, null, a, `${aceptado ? 'Acepta' : 'Rechaza'} ${documento} ${version}`);
      this._escribir(s);
      return a;
    },

    async declararMinimis({ ejercicios, ayudas_plataforma_eur, sector_excluido, representa }) {
      const s0 = this._leer();
      if (!s0.empresa) throw new Error('Primero hay que dar de alta la empresa.');
      const t = texto('minimis');
      const ayudas_otras_eur = Object.values(ejercicios).reduce((a, x) => a + x, 0);
      const tope = Number(param('minimis_tope_eur').valor);
      const total = ayudas_otras_eur + ayudas_plataforma_eur;
      const p = param('minimis_validez_dias');
      const ahora = new Date();
      const doc = `${t.texto}\n\n---\n${JSON.stringify({ empresa: s0.empresa.razon_social, nif: s0.empresa.nif, ejercicios,
        ayudas_minimis_otras_eur: ayudas_otras_eur, ayudas_plataforma_eur, sector_excluido, version_texto: t.version,
        fecha: ahora.toLocaleString('sv-SE', { timeZone: ZONA }) }, null, 2)}`;
      const acept = await this.registrarAceptacion({ documento: 'minimis', version: t.version, aceptado: true, representa_empresa: representa, contenido: doc, huella_origen: 'documento' });
      const s = this._leer();
      const d = { id: uuid(), empresa_id: s.empresa.id, solicitud_id: null, ejercicios, ayudas_otras_eur, ayudas_plataforma_eur,
        total_eur: total, tope_eur: tope, margen_eur: tope - total, supera: total > tope, sector_excluido,
        detalle: { ejercicios }, // en producción: detalle_cifrado (pgp_sym_encrypt)
        aceptacion_id: acept.id, documento_sha256: acept.documento_sha256, declarado_por: this._yo(s), creado_en: ahora.toISOString(),
        validez_dias: Number(p.valor), validez_provisional: p.provisional,
        valida_hasta: new Date(ahora.getTime() + Number(p.valor) * 864e5).toISOString() };
      s.declaraciones_minimis.push(d);
      const antes = { minimis_declarado: s.empresa.minimis_declarado, minimis_importe_3a: s.empresa.minimis_importe_3a };
      Object.assign(s.empresa, { minimis_declarado: true, minimis_fecha: d.creado_en, minimis_importe_3a: total });
      this._audit(s, 'declaraciones_minimis', 'INSERT', d.id, null, { total_eur: total, margen_eur: d.margen_eur, supera: d.supera, valida_hasta: d.valida_hasta },
        `Declaración de minimis: ${eur(total)} en 3 ejercicios${d.supera ? ' (supera el límite)' : ''}`);
      this._audit(s, 'empresas', 'UPDATE', s.empresa.id, antes, { minimis_declarado: true, minimis_importe_3a: total }, 'Actualiza el resumen de minimis de la empresa');
      this._escribir(s);
      return d;
    },

    async usuarios() { return this._leer().perfiles; },
    async invitar({ nombre, email, rol_empresa }) {
      const s = this._leer();
      if (s.perfiles.some((p) => p.email.toLowerCase() === email.toLowerCase())) throw new Error('Ya hay un usuario con ese correo.');
      const p = { id: uuid(), empresa_id: s.empresa.id, nombre, email, cargo: null, rol: 'empresa', rol_empresa, estado: 'invitado', es_yo: false, creado_en: new Date().toISOString() };
      s.perfiles.push(p);
      this._audit(s, 'perfiles', 'INSERT', p.id, null, p, `Invita a ${email} (rol ${rol_empresa}); sin envío de correo en la demo`);
      this._escribir(s);
      return p;
    },
    async cambiarRol(id, rol_empresa) {
      const s = this._leer();
      const p = s.perfiles.find((x) => x.id === id);
      if (!p || p.rol_empresa === rol_empresa) return;
      if (p.rol_empresa === 'admin' && s.perfiles.filter((x) => x.rol_empresa === 'admin').length === 1) throw new Error('La empresa tiene que conservar al menos un administrador.');
      const antes = p.rol_empresa; p.rol_empresa = rol_empresa;
      this._audit(s, 'perfiles', 'UPDATE', id, { rol_empresa: antes }, { rol_empresa }, `Cambia el rol de ${p.email}: ${antes} → ${rol_empresa}`);
      this._escribir(s);
    },
    async quitar(id) {
      const s = this._leer();
      const p = s.perfiles.find((x) => x.id === id);
      if (!p) return;
      if (p.es_yo) throw new Error('No puedes quitarte a ti mismo.');
      if (p.rol_empresa === 'admin' && s.perfiles.filter((x) => x.rol_empresa === 'admin').length === 1) throw new Error('La empresa tiene que conservar al menos un administrador.');
      s.perfiles = s.perfiles.filter((x) => x.id !== id);
      this._audit(s, 'perfiles', 'DELETE', id, p, null, `Quita a ${p.email} de la empresa`);
      this._escribir(s);
    },

    async registrarKpis(filas) {
      const s = this._leer();
      const periodo = new Date().toLocaleDateString('sv-SE', { timeZone: ZONA }).slice(0, 7) + '-01';
      filas.forEach(({ indicador, valor }) => {
        const previa = s.kpis_empresa.find((k) => k.indicador === indicador && k.periodo === periodo);
        if (previa) {
          const antes = previa.valor; previa.valor = valor;
          this._audit(s, 'kpis_empresa', 'UPDATE', previa.id, { valor: antes }, { valor }, `KPI ${indicador} (${periodo}): ${antes} → ${valor}`);
        } else {
          const k = { id: uuid(), empresa_id: s.empresa.id, indicador, valor, periodo, fuente: 'plataforma' };
          s.kpis_empresa.push(k);
          this._audit(s, 'kpis_empresa', 'INSERT', k.id, null, k, `KPI ${indicador} (${periodo}): ${valor}`);
        }
      });
      this._escribir(s);
      return periodo;
    },

    async auditar(tabla, accion, detalle, actor) {
      const s = this._leer();
      this._audit(s, tabla, accion, null, null, null, detalle, actor);
      this._escribir(s);
    },
    // audit_log completo para el auditor: el de esta demo más el de las empresas de ejemplo
    async auditoria() {
      const s = this._leer();
      const ejemplo = (D.audit_log_demo || []).map((x, i) => ({ n: 'E' + (i + 1), antes: null, despues: null, ...x }));
      return [...s.audit_log, ...ejemplo].sort((a, b) => new Date(b.ts) - new Date(a.ts));
    },
    async empresasApoyadas() {
      const s = this._leer();
      const lista = (D.empresas_demo || []).map((e) => ({ ...e, ejemplo: true }));
      if (s.empresa) {
        const [dg, cr, fo] = await Promise.all([this.diagnosticos(), this.creditos(), this.formacion()]);
        const apoyos = [];
        if (dg.length) apoyos.push('diagnostico');
        if (fo && (fo.horas > 0 || fo.completados > 0)) apoyos.push('formacion');
        if (fo && fo.mentorias > 0) apoyos.push('mentoria');
        if (cr && cr.asignado > 0) apoyos.push('creditos');
        lista.unshift({ ...s.empresa, apoyos, ejemplo: false });
      }
      return lista;
    },

    // Lecturas ajenas, solo lectura
    async diagnosticos() { const d = leerAjena(AJENAS.diagnosticos); return Array.isArray(d) ? d : []; },
    async creditos() {
      const c = leerAjena(AJENAS.creditos);
      if (!c || typeof c !== 'object') return null;
      const suma = (arr, campos) => (Array.isArray(arr) ? arr : []).reduce((a, x) => a + (Number(campos.map((k) => x && x[k]).find((v) => v != null)) || 0), 0);
      return { asignado: suma(c.asignaciones, ['importe_eur', 'importe']), consumido: suma(c.consumos, ['importe_eur', 'coste_eur', 'importe']),
        asignaciones: Array.isArray(c.asignaciones) ? c.asignaciones.length : 0 };
    },
    async formacion() {
      const f = leerAjena(AJENAS.formacion);
      if (!f || typeof f !== 'object') return null;
      const prog = Array.isArray(f.progreso) ? f.progreso : [];
      const horas = prog.reduce((a, x) => a + (Number(x.horas) || (Number(x.minutos) || 0) / 60), 0) + (Number(f.horas) || 0);
      const completados = prog.filter((x) => x.completado || x.estado === 'completado' || Number(x.porcentaje) >= 100).length;
      return { horas, completados, mentorias: Array.isArray(f.mentorias) ? f.mentorias.length : 0 };
    },

    async borrar() { localStorage.removeItem(CLAVE); }
  };

  // ---------------------------------------------------------------- interfaz común
  function avisar(txt) { const m = $('mensaje'); m.hidden = false; m.textContent = txt; }
  function limpiarAviso() { $('mensaje').hidden = true; }

  function campo(id, etiqueta, control, ayuda) {
    return `<div class="pf-e-campo"><label for="${id}">${etiqueta}</label>${control}${ayuda ? `<small id="${id}-ayuda">${ayuda}</small>` : ''}<span class="pf-e-error" id="${id}-error" hidden></span></div>`;
  }
  function errorCampo(id, msg) {
    const el = $(id), er = $(id + '-error');
    if (!el || !er) return;
    er.hidden = !msg; er.textContent = msg || '';
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const desc = [$(id + '-ayuda') ? id + '-ayuda' : '', msg ? id + '-error' : ''].filter(Boolean).join(' ');
    if (desc) el.setAttribute('aria-describedby', desc); else el.removeAttribute('aria-describedby');
  }
  const etiquetaEstado = (e) => `<span class="pf-e-estado pf-e-${esc(e)}">${esc(ESTADOS[e] || e)}</span>`;
  const huellaCorta = (h) => `<code class="pf-e-huella" title="${esc(h)}">${esc(h.slice(0, 12))}…${esc(h.slice(-6))}</code>`;
  const tabla = (cab, filas, clase = '') => `<div class="pf-e-tabla-wrap" tabindex="0"><table class="pf-e-tabla ${clase}"><thead><tr>${cab.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>`;

  // ---------------------------------------------------------------- pestañas
  const TABS = ['panel', 'alta', 'minimis', 'usuarios'];
  const PINTAR = { panel: pintarPanel, alta: pintarAlta, minimis: pintarMinimis, usuarios: pintarUsuarios };
  let actual = null;
  async function activar(tab, foco) {
    if (!TABS.includes(tab)) tab = 'panel';
    actual = tab;
    document.querySelectorAll('[role="tab"]').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      $('sec-' + b.dataset.tab).hidden = !on;
    });
    if (foco) $('tab-' + tab).focus();
    if (location.hash !== '#' + tab) history.replaceState(null, '', location.pathname + location.search + '#' + tab);
    await PINTAR[tab]();
    $('reiniciar').hidden = !(await Datos.hayDatos());
  }
  function tecladoTabs(e) {
    const i = TABS.indexOf(actual);
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = TABS.length - 1;
    if (j === null) return;
    e.preventDefault(); activar(TABS[j], true);
  }
  const sinEmpresa = (que) => `<div class="pf-e-vacio"><h2>Primero, da de alta tu empresa</h2><p>${que}</p><button class="pf-btn" type="button" data-ir="alta">Ir al alta</button></div>`;

  // ---------------------------------------------------------------- (1) alta
  const alta = { paso: 0, d: { startup: '' } };
  const PASOS = ['Identificación', 'Tamaño de la empresa', 'Actividad y ubicación', 'Representante y condiciones'];

  async function pintarAlta() {
    const s = await Datos.estado();
    if (s.empresa) return pintarFicha(s);
    const d = alta.d, p = alta.paso;
    let html = `<h2>Alta de la empresa</h2><p class="pf-paso" aria-live="polite">Paso ${p + 1} de ${PASOS.length} · ${PASOS[p]}</p>
      <div class="pf-progreso" aria-hidden="true"><div style="width:${Math.round((p / PASOS.length) * 100)}%"></div></div>
      <form id="f-alta" class="pf-e-form" novalidate>`;
    if (p === 0) {
      html += `<div class="pf-perfil">
        ${campo('a-nif', 'NIF, CIF o NIE', `<input id="a-nif" type="text" autocomplete="off" spellcheck="false" maxlength="12" value="${esc(d.nif)}">`, 'Se comprueba el dígito de control. Ejemplo: B12345674.')}
        ${campo('a-razon', 'Razón social', `<input id="a-razon" type="text" autocomplete="organization" value="${esc(d.razon_social)}">`)}
        ${campo('a-constitucion', 'Fecha de constitución (opcional)', `<input id="a-constitucion" type="date" value="${esc(d.fecha_constitucion)}">`)}
      </div>
      <fieldset class="pf-preg" id="a-startup" tabindex="-1"><legend>¿Es una startup en el sentido de la Ley 28/2022?</legend>
        <small id="a-startup-ayuda">Empresa de nueva creación (menos de 5 años; 7 en biotecnología, energía o industria), innovadora y con volumen de negocio de hasta 10 M€.</small>
        <div class="pf-ops"><label><input type="radio" name="a-startup" value="si"${d.startup === 'si' ? ' checked' : ''}> Sí</label><label><input type="radio" name="a-startup" value="no"${d.startup === 'no' ? ' checked' : ''}> No</label></div>
        <span class="pf-e-error" id="a-startup-error" hidden></span>
      </fieldset>`;
    } else if (p === 1) {
      html += `<p>Según la definición de pyme de la Unión Europea (Recomendación 2003/361/CE). Si la empresa tiene empresas asociadas o vinculadas, suma sus datos en la proporción que corresponda; el gestor lo revisará al validar.</p>
      <div class="pf-perfil">
        ${campo('a-plantilla', 'Plantilla (unidades de trabajo anual)', `<input id="a-plantilla" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(d.plantilla)}">`, 'Personas a jornada completa durante un año.')}
        ${campo('a-facturacion', 'Volumen de negocio anual (€)', `<input id="a-facturacion" type="number" inputmode="numeric" min="0" step="1000" value="${esc(d.facturacion)}">`)}
        ${campo('a-balance', 'Balance general anual (€)', `<input id="a-balance" type="number" inputmode="numeric" min="0" step="1000" value="${esc(d.balance)}">`)}
      </div>
      <p class="pf-e-resultado" id="a-tamano" aria-live="polite"></p>`;
    } else if (p === 2) {
      html += `<div class="pf-perfil">
        ${campo('a-cnae', 'Actividad principal (CNAE)', `<select id="a-cnae"><option value="">Elige…</option>${D.cnae.map((c) => `<option value="${esc(c.codigo)}"${c.codigo === d.cnae ? ' selected' : ''}>${esc(c.codigo)} · ${esc(c.nombre)}</option>`).join('')}</select>`, 'Lista corta de demostración.')}
        ${campo('a-ccaa', 'Comunidad autónoma', `<select id="a-ccaa"><option value="">Elige…</option>${D.ccaa.map((c) => `<option${c === d.ccaa ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>`)}
        ${campo('a-provincia', 'Provincia', `<input id="a-provincia" type="text" autocomplete="address-level2" value="${esc(d.provincia)}">`)}
      </div>`;
    } else {
      const c = texto('condiciones'), pr = texto('privacidad');
      html += `<div class="pf-perfil">
        ${campo('a-nombre', 'Nombre y apellidos', `<input id="a-nombre" type="text" autocomplete="name" value="${esc(d.nombre)}">`)}
        ${campo('a-cargo', 'Cargo', `<input id="a-cargo" type="text" autocomplete="organization-title" value="${esc(d.cargo)}">`)}
        ${campo('a-email', 'Correo electrónico', `<input id="a-email" type="email" autocomplete="email" value="${esc(d.email)}">`)}
      </div>
      <div class="pf-e-resumen"><h3>Resumen</h3><dl>
        <dt>Empresa</dt><dd>${esc(d.razon_social)} · ${esc(d.nif)}</dd>
        <dt>Tipo y tamaño</dt><dd>${esc(TIPOS[d.tipo])} · ${esc(TAMANOS[d.tamano])}</dd>
        <dt>Actividad</dt><dd>CNAE ${esc(d.cnae)} · ${esc(d.provincia)} (${esc(d.ccaa)})</dd></dl></div>
      <div class="pf-e-checks">
        <label class="pf-e-check"><input type="checkbox" id="a-representa"${d.representa ? ' checked' : ''}> <span>Declaro que represento a la empresa y que los datos son ciertos.</span></label>
        <span class="pf-e-error" id="a-representa-error" hidden></span>
        <label class="pf-e-check"><input type="checkbox" id="a-condiciones"${d.condiciones ? ' checked' : ''}> <span>He leído y acepto las <a href="${esc(c.url)}" target="_blank" rel="noopener">condiciones de uso</a> (versión ${esc(c.version)}).</span></label>
        <span class="pf-e-error" id="a-condiciones-error" hidden></span>
        <label class="pf-e-check"><input type="checkbox" id="a-privacidad"${d.privacidad ? ' checked' : ''}> <span>He leído la <a href="${esc(pr.url)}" target="_blank" rel="noopener">política de privacidad</a> (versión ${esc(pr.version)}).</span></label>
        <span class="pf-e-error" id="a-privacidad-error" hidden></span>
      </div>
      <p class="pf-nota-pie">Se registran la versión de cada texto, la fecha y hora de la aceptación y la huella SHA-256 del documento aceptado.</p>`;
    }
    html += `</form><div class="pf-nav"><button class="pf-btn pf-sec" type="button" id="a-atras"${p === 0 ? ' disabled' : ''}>Anterior</button>
      <button class="pf-btn" type="button" id="a-siguiente">${p === PASOS.length - 1 ? 'Enviar el alta' : 'Siguiente'}</button></div>`;
    $('sec-alta').innerHTML = html;
    if (p === 1) { ['a-plantilla', 'a-facturacion', 'a-balance'].forEach((id) => $(id).addEventListener('input', vistaTamano)); vistaTamano(); }
    if (p === 0) $('a-nif').addEventListener('blur', () => { const v = $('a-nif').value.trim(); if (v) errorCampo('a-nif', mensajeNif(validarNif(v))); });
    $('a-atras').addEventListener('click', () => { leerAlta(false); alta.paso--; pintarAlta().then(() => $('sec-alta').querySelector('input, select').focus()); });
    $('a-siguiente').addEventListener('click', siguienteAlta);
    $('f-alta').addEventListener('submit', (e) => { e.preventDefault(); siguienteAlta(); });
  }

  function mensajeNif(r) {
    if (!r.clase) return 'El formato no corresponde a un NIF, CIF o NIE.';
    if (!r.ok) return `El dígito de control del ${r.clase} no es correcto. Revísalo.`;
    return '';
  }
  function vistaTamano() {
    const pl = Number($('a-plantilla').value), fa = Number($('a-facturacion').value), ba = Number($('a-balance').value);
    const out = $('a-tamano');
    if ($('a-plantilla').value === '' || $('a-facturacion').value === '' || $('a-balance').value === '') { out.textContent = 'Rellena los tres datos para calcular el tamaño.'; out.className = 'pf-e-resultado'; return; }
    const t = tamanoUE(pl, fa, ba);
    out.className = 'pf-e-resultado' + (t ? ' pf-e-ok' : ' pf-e-alerta');
    out.textContent = t ? `Tamaño según la definición de la UE: ${TAMANOS[t]}.` : 'Con estos datos sería una gran empresa: el programa se dirige a startups y pymes, por lo que no se puede completar el alta.';
  }

  // Lee y valida el paso actual. Devuelve el id del primer campo con error.
  function leerAlta(validar) {
    const d = alta.d, p = alta.paso, err = {};
    const val = (id) => ($(id) ? $(id).value.trim() : '');
    if (p === 0) {
      const r = validarNif(val('a-nif'));
      d.nif = r.v || val('a-nif'); d.razon_social = val('a-razon'); d.fecha_constitucion = val('a-constitucion');
      const st = $('sec-alta').querySelector('input[name="a-startup"]:checked'); d.startup = st ? st.value : '';
      d.persona = r.clase === 'DNI' || r.clase === 'NIE';
      if (!d.nif) err['a-nif'] = 'Indica el NIF, CIF o NIE.'; else if (mensajeNif(r)) err['a-nif'] = mensajeNif(r);
      if (!d.razon_social) err['a-razon'] = 'Indica la razón social.';
      if (d.fecha_constitucion && new Date(d.fecha_constitucion) > new Date()) err['a-constitucion'] = 'La fecha no puede ser futura.';
      if (!d.startup) err['a-startup'] = 'Indica si es una startup.';
      else if (d.startup === 'si' && d.persona) err['a-startup'] = 'Una persona física no puede acreditarse como startup (Ley 28/2022): marca «No».';
      d.tipo = d.persona ? 'autonomo' : (d.startup === 'si' ? 'startup' : 'pyme');
    } else if (p === 1) {
      ['plantilla', 'facturacion', 'balance'].forEach((k) => { d[k] = val('a-' + k); });
      ['plantilla', 'facturacion', 'balance'].forEach((k) => { if (d[k] === '' || Number(d[k]) < 0 || Number.isNaN(Number(d[k]))) err['a-' + k] = 'Indica un valor igual o mayor que 0.'; });
      if (!Object.keys(err).length) {
        d.tamano = tamanoUE(Number(d.plantilla), Number(d.facturacion), Number(d.balance));
        if (!d.tamano) err['a-plantilla'] = 'Con estos datos no es una pyme: el alta no puede continuar.';
      }
    } else if (p === 2) {
      d.cnae = val('a-cnae'); d.ccaa = val('a-ccaa'); d.provincia = val('a-provincia');
      if (!d.cnae) err['a-cnae'] = 'Elige la actividad principal.';
      if (!d.ccaa) err['a-ccaa'] = 'Elige la comunidad autónoma.';
      if (!d.provincia) err['a-provincia'] = 'Indica la provincia.';
    } else {
      d.nombre = val('a-nombre'); d.cargo = val('a-cargo'); d.email = val('a-email');
      d.representa = $('a-representa').checked; d.condiciones = $('a-condiciones').checked; d.privacidad = $('a-privacidad').checked;
      if (!d.nombre) err['a-nombre'] = 'Indica tu nombre.';
      if (!d.cargo) err['a-cargo'] = 'Indica tu cargo.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) err['a-email'] = 'Indica un correo válido.';
      if (!d.representa) err['a-representa'] = 'Hace falta esta declaración para dar de alta la empresa.';
      if (!d.condiciones) err['a-condiciones'] = 'Hay que aceptar las condiciones de uso.';
      if (!d.privacidad) err['a-privacidad'] = 'Hay que confirmar que has leído la política de privacidad.';
    }
    if (!validar) return null;
    $('sec-alta').querySelectorAll('.pf-e-error').forEach((x) => { x.hidden = true; });
    $('sec-alta').querySelectorAll('[aria-invalid]').forEach((x) => x.setAttribute('aria-invalid', 'false'));
    Object.entries(err).forEach(([id, m]) => errorCampo(id, m));
    const primero = Object.keys(err)[0];
    if (primero) { const el = $(primero); el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return primero || null;
  }

  async function siguienteAlta() {
    if (leerAlta(true)) return;
    if (alta.paso < PASOS.length - 1) {
      alta.paso++; await pintarAlta();
      $('sec-alta').querySelector('input, select').focus();
      return;
    }
    const b = $('a-siguiente'); b.disabled = true; b.textContent = 'Registrando…';
    try {
      const d = alta.d;
      await Datos.crearEmpresa({ nif: d.nif, razon_social: d.razon_social, tipo: d.tipo, tamano: d.tamano, cnae: d.cnae, ccaa: d.ccaa,
        provincia: d.provincia, fecha_constitucion: d.fecha_constitucion, plantilla: Number(d.plantilla), facturacion: Number(d.facturacion), balance: Number(d.balance) },
        { nombre: d.nombre, cargo: d.cargo, email: d.email });
      for (const doc of ['condiciones', 'privacidad']) {
        const t = texto(doc);
        let contenido, huella_origen = 'pagina';
        try { const r = await fetch(t.url, { cache: 'no-cache' }); if (!r.ok) throw new Error(); contenido = await r.text(); }
        catch (e) { contenido = `${t.documento}|${t.version}|${t.url}`; huella_origen = 'referencia'; }
        await Datos.registrarAceptacion({ documento: doc, version: t.version, aceptado: true, contenido, huella_origen });
      }
      alta.paso = 0; alta.d = { startup: '' };
      avisar('Alta registrada. La empresa queda pendiente de validación por un gestor de la Alianza.');
      await activar('alta');
      $('mensaje').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      avisar('No se ha podido registrar el alta: ' + e.message);
      b.disabled = false; b.textContent = 'Enviar el alta';
    }
  }

  async function pintarFicha(s) {
    const e = s.empresa;
    const cnae = D.cnae.find((c) => c.codigo === e.cnae);
    const acepts = s.aceptaciones.map((a) => `<tr><td>${esc(texto(a.documento) ? texto(a.documento).titulo : a.documento)}</td><td>${esc(a.version)}</td><td>${fechaHora(a.creado_en)}</td><td>${huellaCorta(a.documento_sha256)}${a.huella_origen === 'referencia' ? ' <small>(referencia)</small>' : ''}</td></tr>`);
    $('sec-alta').innerHTML = `
      <div class="pf-e-cab"><h2>${esc(e.razon_social)}</h2>${etiquetaEstado(e.estado)}</div>
      <dl class="pf-e-datos">
        <dt>NIF</dt><dd>${esc(e.nif)}</dd>
        <dt>Tipo</dt><dd>${esc(TIPOS[e.tipo])}</dd>
        <dt>Tamaño (UE)</dt><dd>${esc(TAMANOS[e.tamano])} · ${num(e.plantilla)} UTA · ${eur(e.volumen_negocio_eur)} de volumen de negocio · ${eur(e.balance_eur)} de balance</dd>
        <dt>Actividad</dt><dd>CNAE ${esc(e.cnae)}${cnae ? ' · ' + esc(cnae.nombre) : ''}</dd>
        <dt>Ubicación</dt><dd>${esc(e.provincia)} (${esc(e.ccaa)})</dd>
        ${e.fecha_constitucion ? `<dt>Constitución</dt><dd>${fecha(e.fecha_constitucion)}</dd>` : ''}
        <dt>Alta</dt><dd>${fechaHora(e.creado_en)}</dd>
      </dl>
      <h3>Aceptaciones registradas</h3>
      ${tabla(['Documento', 'Versión', 'Fecha y hora', 'Huella SHA-256'], acepts)}
      <p class="pf-nota-pie">La IP la registrará el servidor en producción. Pasa el ratón o el foco por la huella para verla completa.</p>
      <div class="pf-e-gestor"><h3>Acciones del gestor <span class="pf-tag pf-ej">Demo</span></h3>
        <p>En producción solo las puede hacer un gestor de la Alianza. Aquí sirven para probar el flujo pendiente → validada → baja.</p>
        <div class="pf-e-botones">
          ${e.estado === 'pendiente' ? '<button class="pf-btn" type="button" data-estado="validada">Validar la empresa</button>' : ''}
          ${e.estado !== 'baja' ? '<button class="pf-btn pf-sec" type="button" data-estado="baja">Dar de baja</button>' : '<button class="pf-btn pf-sec" type="button" data-estado="pendiente">Reactivar (vuelve a pendiente)</button>'}
        </div></div>`;
  }

  // ---------------------------------------------------------------- (2) minimis
  async function ayudasPlataforma() { const c = await Datos.creditos(); return c ? c.asignado : 0; }
  function ejerciciosActuales() { const y = Number(new Date().toLocaleDateString('sv-SE', { timeZone: ZONA }).slice(0, 4)); return [y, y - 1, y - 2]; }
  function vigencia(d) { return d && new Date(d.valida_hasta) > new Date(); }

  async function pintarMinimis() {
    const s = await Datos.estado();
    if (!s.empresa) { $('sec-minimis').innerHTML = sinEmpresa('La declaración de minimis se presenta una vez dada de alta la empresa.'); return; }
    const plataforma = await ayudasPlataforma();
    const tope = Number(param('minimis_tope_eur').valor);
    const pv = param('minimis_validez_dias');
    const ult = s.declaraciones_minimis[s.declaraciones_minimis.length - 1];
    const anos = ejerciciosActuales();
    const t = texto('minimis');
    const estadoDecl = ult ? (vigencia(ult) ? `<p class="pf-e-resultado pf-e-ok">Declaración vigente hasta el ${fecha(ult.valida_hasta)}. Margen disponible: ${eur(ult.margen_eur)}.</p>`
      : `<p class="pf-e-resultado pf-e-alerta">La última declaración caducó el ${fecha(ult.valida_hasta)}. Preséntala de nuevo antes de pedir otra ayuda.</p>`)
      : '<p class="pf-e-resultado">Todavía no habéis presentado la declaración de minimis.</p>';
    const hist = s.declaraciones_minimis.slice().reverse().map((d) => `<tr><td>${fechaHora(d.creado_en)}</td><td>${eur(d.total_eur)}</td><td>${d.supera ? '<strong>Supera el límite</strong>' : eur(d.margen_eur)}</td><td>${fecha(d.valida_hasta)} · ${vigencia(d) ? 'Vigente' : 'Caducada'}</td><td>${huellaCorta(d.documento_sha256)}</td></tr>`);
    $('sec-minimis').innerHTML = `
      <h2>Declaración de ayudas de minimis</h2>
      <p>Las ayudas de la plataforma (créditos en especie y servicios valorados) son ayudas de minimis: la empresa única no puede superar ${eur(tope)} en el ejercicio en curso y los dos anteriores (Reglamento (UE) 2023/2831).</p>
      ${estadoDecl}
      <form id="f-minimis" class="pf-e-form" novalidate>
        <h3>Ayudas de minimis recibidas de otras fuentes</h3>
        <div class="pf-perfil">
          ${anos.map((a, i) => campo('m-' + a, `Ejercicio ${a}${i === 0 ? ' (en curso)' : ''} (€)`, `<input id="m-${a}" type="number" inputmode="numeric" min="0" step="100" value="${ult && ult.ejercicios[a] != null ? ult.ejercicios[a] : 0}">`)).join('')}
        </div>
        <p class="pf-nota-pie">Ayudas de minimis ya concedidas por la Plataforma AlianzaIA: <strong>${eur(plataforma)}</strong>${(await Datos.creditos()) ? '' : ' (sin créditos asignados en esta demo)'}.</p>
        <div class="pf-e-margen" aria-live="polite" id="m-margen"></div>
        <fieldset class="pf-preg" id="m-sector" tabindex="-1"><legend>¿La empresa opera en algún sector excluido (pesca y acuicultura, producción agrícola primaria…)?</legend>
          <div class="pf-ops"><label><input type="radio" name="m-sector" value="no"> No</label><label><input type="radio" name="m-sector" value="si"> Sí</label></div>
          <span class="pf-e-error" id="m-sector-error" hidden></span></fieldset>
        <details class="pf-e-texto"><summary>Leer la declaración (versión ${esc(t.version)})</summary><p>${esc(t.texto)}</p></details>
        <div class="pf-e-checks">
          <label class="pf-e-check"><input type="checkbox" id="m-representa"> <span>Declaro que represento a la empresa.</span></label>
          <span class="pf-e-error" id="m-representa-error" hidden></span>
          <label class="pf-e-check"><input type="checkbox" id="m-acepto"> <span>Declaro que los datos son ciertos y acepto la declaración responsable (versión ${esc(t.version)}).</span></label>
          <span class="pf-e-error" id="m-acepto-error" hidden></span>
        </div>
        <p class="pf-nota-pie">Validez de la declaración: ${esc(pv.valor)} días${pv.provisional ? ' (provisional: la fijará Legal)' : ''}. Se guarda la huella SHA-256 del documento exacto que aceptas.</p>
        <div class="pf-nav"><span></span><button class="pf-btn" type="submit" id="m-enviar">Presentar la declaración</button></div>
      </form>
      ${hist.length ? `<h3>Declaraciones presentadas</h3>${tabla(['Fecha y hora', 'Total 3 ejercicios', 'Margen', 'Validez', 'Huella SHA-256'], hist)}` : ''}`;
    const calc = () => {
      const otras = anos.reduce((a, y) => a + (Math.max(0, Number($('m-' + y).value) || 0)), 0);
      const total = otras + plataforma, margen = tope - total, pct = Math.min(100, (total / tope) * 100);
      $('m-margen').innerHTML = `<div class="pf-e-medidor" role="img" aria-label="Usado ${eur(total)} de ${eur(tope)}"><div style="width:${pct.toFixed(1)}%" class="${margen < 0 ? 'pf-e-pasado' : ''}"></div></div>
        <p><strong>Total en 3 ejercicios: ${eur(total)}</strong> · ${margen >= 0 ? `Margen frente a ${eur(tope)}: <strong>${eur(margen)}</strong>` : `<strong>Supera el límite en ${eur(-margen)}</strong>`}</p>
        ${margen < 0 ? '<p class="pf-e-resultado pf-e-alerta" role="alert">Se supera el límite de minimis: la plataforma no podrá concederos nuevas ayudas mientras sea así. Puedes presentar la declaración igualmente para que conste.</p>' : ''}`;
      return { otras, total };
    };
    anos.forEach((a) => $('m-' + a).addEventListener('input', calc));
    calc();
    $('f-minimis').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = {};
      anos.forEach((a) => { const v = $('m-' + a).value; if (v === '' || Number(v) < 0 || Number.isNaN(Number(v))) err['m-' + a] = 'Indica un importe igual o mayor que 0 (0 si no hubo ayudas).'; });
      const sec = $('f-minimis').querySelector('input[name="m-sector"]:checked');
      if (!sec) err['m-sector'] = 'Indica si la empresa opera en un sector excluido.';
      if (!$('m-representa').checked) err['m-representa'] = 'Hace falta declarar que representas a la empresa.';
      if (!$('m-acepto').checked) err['m-acepto'] = 'Hay que aceptar la declaración responsable.';
      $('f-minimis').querySelectorAll('.pf-e-error').forEach((x) => { x.hidden = true; });
      Object.entries(err).forEach(([id, m]) => errorCampo(id, m));
      const primero = Object.keys(err)[0];
      if (primero) { $(primero).focus(); return; }
      $('m-enviar').disabled = true;
      try {
        const ejercicios = Object.fromEntries(anos.map((a) => [a, Number($('m-' + a).value)]));
        const d = await Datos.declararMinimis({ ejercicios, ayudas_plataforma_eur: plataforma, sector_excluido: sec.value === 'si', representa: true });
        avisar(d.supera ? 'Declaración registrada. Atención: se supera el límite de minimis.' : `Declaración registrada. Vigente hasta el ${fecha(d.valida_hasta)}${d.validez_provisional ? ' (plazo provisional)' : ''}.`);
        if (d.sector_excluido) avisar('Declaración registrada. Como la empresa opera en un sector excluido, el gestor revisará que la ayuda no se destine a esa actividad.');
        await pintarMinimis();
        $('mensaje').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e2) { avisar('No se ha podido registrar la declaración: ' + e2.message); $('m-enviar').disabled = false; }
    });
  }

  // ---------------------------------------------------------------- (3) usuarios
  async function pintarUsuarios() {
    const s = await Datos.estado();
    if (!s.empresa) { $('sec-usuarios').innerHTML = sinEmpresa('Después podrás invitar a otras personas de tu empresa.'); return; }
    const filas = s.perfiles.map((p) => `<tr>
      <td>${esc(p.nombre || '—')}${p.es_yo ? ' <span class="pf-tag">Tú</span>' : ''}</td><td>${esc(p.email)}</td>
      <td><label class="pf-e-oculto" for="rol-${esc(p.id)}">Rol de ${esc(p.email)}</label><select id="rol-${esc(p.id)}" data-rol="${esc(p.id)}"><option value="admin"${p.rol_empresa === 'admin' ? ' selected' : ''}>Administrador</option><option value="miembro"${p.rol_empresa === 'miembro' ? ' selected' : ''}>Miembro</option></select></td>
      <td>${p.estado === 'invitado' ? 'Invitación pendiente' : 'Activo'}</td>
      <td>${p.es_yo ? '' : `<button class="pf-enlace" type="button" data-quitar="${esc(p.id)}">Quitar<span class="pf-e-oculto"> a ${esc(p.email)}</span></button>`}</td></tr>`);
    $('sec-usuarios').innerHTML = `
      <h2>Usuarios de la empresa</h2>
      <p>Los administradores gestionan los datos, la declaración de minimis y los usuarios. Los miembros pueden hacer el autodiagnóstico, pedir créditos y formarse.</p>
      ${tabla(['Nombre', 'Correo', 'Rol', 'Estado', '<span class="pf-e-oculto">Acciones</span>'], filas)}
      <form id="f-invitar" class="pf-e-form" novalidate><h3>Invitar a una persona</h3>
        <div class="pf-perfil">
          ${campo('u-nombre', 'Nombre', '<input id="u-nombre" type="text" autocomplete="off">')}
          ${campo('u-email', 'Correo electrónico', '<input id="u-email" type="email" autocomplete="off">')}
          ${campo('u-rol', 'Rol', '<select id="u-rol"><option value="miembro">Miembro</option><option value="admin">Administrador</option></select>')}
        </div>
        <p class="pf-nota-pie">En la demo no se envía ningún correo: la invitación queda pendiente.</p>
        <div class="pf-nav"><span></span><button class="pf-btn" type="submit">Invitar</button></div>
      </form>`;
    $('f-invitar').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nombre = $('u-nombre').value.trim(), email = $('u-email').value.trim();
      errorCampo('u-nombre', nombre ? '' : 'Indica el nombre.');
      errorCampo('u-email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Indica un correo válido.');
      if (!nombre) return $('u-nombre').focus();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return $('u-email').focus();
      try { await Datos.invitar({ nombre, email, rol_empresa: $('u-rol').value }); avisar(`Invitación registrada para ${email} (sin envío de correo).`); await pintarUsuarios(); $('u-nombre').focus(); }
      catch (e) { errorCampo('u-email', e.message); $('u-email').focus(); }
    });
  }

  // ---------------------------------------------------------------- (4) panel
  async function pintarPanel() {
    const s = await Datos.estado();
    if (!s.empresa) { $('sec-panel').innerHTML = sinEmpresa('El panel muestra vuestro autodiagnóstico, el consumo de créditos, la formación y los indicadores de impacto.'); return; }
    const e = s.empresa;
    const [dg, cr, fo] = await Promise.all([Datos.diagnosticos(), Datos.creditos(), Datos.formacion()]);
    const ult = dg[dg.length - 1], base = dg.find((x) => x.es_linea_base) || dg[0];
    const dm = s.declaraciones_minimis[s.declaraciones_minimis.length - 1];
    const nivel = (n) => (Q && Q.niveles ? (Q.niveles.find((x) => x.nivel === n) || {}).nombre : '') || '';
    const nombreDim = (id) => (Q ? (Q.dimensiones.find((d) => d.id.toLowerCase() === id) || {}).nombre : '') || id.toUpperCase();
    const delta = (a, b) => { if (a == null || b == null) return '—'; const v = Math.round((b - a) * 10) / 10; return `<span class="${v > 0 ? 'pf-e-sube' : ''}">${v > 0 ? '+' : ''}${num(v)}</span>`; };
    const kpis = [];
    if (ult) {
      kpis.push({ ind: 'Madurez en IA (global, 0-100)', clave: 'madurez_global', base: base.global, act: ult.global });
      Object.keys(ult.puntuaciones || {}).forEach((k) => kpis.push({ ind: `${k.toUpperCase()} · ${nombreDim(k)}`, clave: 'madurez_' + k, base: (base.puntuaciones || {})[k], act: ult.puntuaciones[k] }));
    }
    if (cr) {
      kpis.push({ ind: 'Créditos asignados (€)', clave: 'creditos_asignados_eur', base: 0, act: cr.asignado, eur: true });
      kpis.push({ ind: 'Créditos consumidos (€)', clave: 'creditos_consumidos_eur', base: 0, act: cr.consumido, eur: true });
    }
    if (fo) {
      kpis.push({ ind: 'Horas de formación', clave: 'horas_formacion', base: 0, act: Math.round(fo.horas * 10) / 10 });
      kpis.push({ ind: 'Itinerarios completados', clave: 'itinerarios_completados', base: 0, act: fo.completados });
    }
    const fmt = (k, v) => v == null ? '—' : (k.eur ? eur(v) : num(v));
    const ultimoKpi = s.kpis_empresa.map((k) => k.periodo).sort().pop();
    $('sec-panel').innerHTML = `
      <div class="pf-e-cab"><h2>${esc(e.razon_social)}</h2>${etiquetaEstado(e.estado)}</div>
      <div class="pf-e-tarjetas">
        <div><span class="pf-etq">Tamaño</span><strong>${esc(TAMANOS[e.tamano])}</strong><small>${esc(TIPOS[e.tipo])}</small></div>
        <div><span class="pf-etq">Minimis</span><strong>${dm ? (vigencia(dm) ? 'Vigente' : 'Caducada') : 'Sin declarar'}</strong><small>${dm ? (vigencia(dm) ? `Hasta el ${fecha(dm.valida_hasta)} · margen ${eur(dm.margen_eur)}` : `Caducó el ${fecha(dm.valida_hasta)}`) : '<button class="pf-enlace" type="button" data-ir="minimis">Presentar la declaración</button>'}</small></div>
        <div><span class="pf-etq">Usuarios</span><strong>${s.perfiles.length}</strong><small>${s.perfiles.filter((p) => p.estado === 'invitado').length} con invitación pendiente</small></div>
        <div><span class="pf-etq">Último autodiagnóstico</span><strong>${ult ? `${ult.global}/100` : 'Sin hacer'}</strong><small>${ult ? `Nivel ${esc(ult.nivel_global)}${nivel(ult.nivel_global) ? ' · ' + esc(nivel(ult.nivel_global)) : ''} · ${fecha(ult.fecha)}` : '<a href="/plataforma/diagnostico/">Hacer el autodiagnóstico</a>'}</small></div>
      </div>
      <h3>Indicadores: línea base y situación actual</h3>
      ${kpis.length ? tabla(['Indicador', 'Línea base', 'Actual', 'Variación'], kpis.map((k) => `<tr><td>${esc(k.ind)}</td><td>${fmt(k, k.base)}</td><td>${fmt(k, k.act)}</td><td>${delta(k.base, k.act)}</td></tr>`), 'pf-e-num')
        : '<p class="pf-vacio">Todavía no hay indicadores: haced el <a href="/plataforma/diagnostico/">autodiagnóstico</a> para fijar la línea base.</p>'}
      <p class="pf-nota-pie">La línea base de madurez es vuestro primer autodiagnóstico${base ? ` (${fecha(base.fecha)})` : ''}. La de créditos y formación es 0 al entrar en el programa.${cr ? '' : ' Créditos: sin datos todavía.'}${fo ? '' : ' Formación: sin datos todavía.'}</p>
      ${dg.length ? `<h3>Evolución de la madurez</h3>${grafico(dg)}` : ''}
      ${kpis.length ? `<div class="pf-e-botones"><button class="pf-btn pf-sec" type="button" id="registrar-kpis">Registrar los indicadores de este mes</button>${ultimoKpi ? `<small>Último registro: periodo ${esc(ultimoKpi.slice(0, 7))}</small>` : ''}</div>` : ''}`;
    const b = $('registrar-kpis');
    if (b) b.addEventListener('click', async () => {
      const periodo = await Datos.registrarKpis(kpis.map((k) => ({ indicador: k.clave, valor: k.act ?? 0 })));
      avisar(`Indicadores registrados para el periodo ${periodo.slice(0, 7)} (${kpis.length} filas en kpis_empresa).`);
      await pintarPanel();
    });
  }

  // Línea de la puntuación global por diagnóstico, con la tabla de datos accesible.
  function grafico(dg) {
    const W = 640, H = 200, m = { l: 36, r: 16, t: 14, b: 28 };
    const x = (i) => m.l + (dg.length === 1 ? (W - m.l - m.r) / 2 : (i * (W - m.l - m.r)) / (dg.length - 1));
    const y = (v) => m.t + (1 - v / 100) * (H - m.t - m.b);
    const rejilla = [0, 25, 50, 75, 100].map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#DDE3F0"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#5D6684">${v}</text>`).join('');
    const pts = dg.map((d, i) => `${x(i).toFixed(1)},${y(d.global).toFixed(1)}`).join(' ');
    const marcas = dg.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.global).toFixed(1)}" r="4.5" fill="#1230F0" stroke="#fff" stroke-width="2"/><text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#5D6684">${esc(fecha(d.fecha))}</text>`).join('');
    const resumen = dg.map((d) => `${fecha(d.fecha)}: ${d.global}`).join('; ');
    return `<figure class="pf-e-grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Puntuación global por autodiagnóstico: ${esc(resumen)}">${rejilla}<polyline points="${pts}" fill="none" stroke="#1230F0" stroke-width="2.5" stroke-linejoin="round"/>${marcas}</svg>
      <figcaption>Puntuación global (0-100) en cada autodiagnóstico. El primero es la línea base.</figcaption></figure>`;
  }

  // ---------------------------------------------------------------- (5) vista auditor
  const filtros = { tabla: '', accion: '', empresa: '', desde: '', hasta: '', texto: '' };
  async function pintarAuditor() {
    $('vista-empresa').hidden = true; $('vista-auditor').hidden = false;
    $('hero-eyebrow').textContent = 'Módulo e · Vista de auditor';
    $('hero-titulo').textContent = 'Seguimiento para Red.es y FEDER';
    $('hero-texto').textContent = 'Acceso de solo lectura a las empresas apoyadas, los indicadores comunes y el registro de auditoría de todas las acciones.';
    document.title = 'Vista de auditor · Plataforma AlianzaIA';
    if (!sessionStorage.getItem('alianzaia_auditor_visto')) { sessionStorage.setItem('alianzaia_auditor_visto', '1'); await Datos.auditar('audit_log', 'SELECT', 'Consulta de la vista de auditor', 'auditor-demo'); }
    const emp = await Datos.empresasApoyadas();
    const apoyadas = emp.filter((e) => e.estado !== 'pendiente' && (e.apoyos || []).length);
    const porTam = Object.keys(TAMANOS).map((t) => [t, apoyadas.filter((e) => e.tamano === t).length]);
    const tipos = D.apoyos_no_financieros;
    const noFin = Object.keys(tipos).map((k) => [k, apoyadas.filter((e) => e.apoyos.includes(k)).length]);
    const nomEmp = Object.fromEntries(emp.map((e) => [e.id, e.razon_social]));
    $('vista-auditor').innerHTML = `
      <p class="pf-aviso"><strong>Vista de auditor (demo, solo lectura).</strong> En producción la usan Red.es y la autoridad FEDER con acceso de solo lectura y doble factor. Las empresas «Ejemplo…» son ficticias.</p>
      <section class="pf-e-sec"><h2>Empresas apoyadas por tamaño <span class="pf-tag pf-ej">RCO01 · a confirmar con las bases</span></h2>
        <p>Empresas validadas o dadas de baja que han recibido al menos un apoyo de la plataforma.</p>
        <div class="pf-e-tarjetas">${porTam.map(([t, n]) => `<div><span class="pf-etq">${esc(TAMANOS[t])}</span><strong>${n}</strong></div>`).join('')}<div><span class="pf-etq">Total</span><strong>${apoyadas.length}</strong></div></div>
      </section>
      <section class="pf-e-sec"><h2>Empresas con apoyo no financiero <span class="pf-tag pf-ej">RCO04 · a confirmar con las bases</span></h2>
        <p>Qué apoyos cuentan como «no financieros» (en particular, los créditos en especie) está pendiente de confirmar con las bases de la convocatoria y la memoria.</p>
        ${tabla(['Tipo de apoyo', 'Empresas'], noFin.map(([k, n]) => `<tr><td>${esc(tipos[k])}</td><td>${n}</td></tr>`).concat(`<tr><th scope="row">Con algún apoyo no financiero</th><td><strong>${apoyadas.length}</strong></td></tr>`), 'pf-e-num')}
      </section>
      <section class="pf-e-sec"><h2>Empresas</h2>
        ${tabla(['NIF', 'Razón social', 'Tipo', 'Tamaño', 'Comunidad', 'Estado', 'Apoyos'], emp.map((e) => `<tr><td>${esc(e.nif)}</td><td>${esc(e.razon_social)}${e.ejemplo ? '' : ' <span class="pf-tag">Esta demo</span>'}</td><td>${esc(TIPOS[e.tipo] || e.tipo)}</td><td>${esc(TAMANOS[e.tamano] || '—')}</td><td>${esc(e.ccaa)}</td><td>${etiquetaEstado(e.estado)}</td><td>${(e.apoyos || []).map((a) => esc(tipos[a] || a)).join(', ') || '—'}</td></tr>`))}
      </section>
      <section class="pf-e-sec"><h2>Registro de auditoría</h2>
        <form class="pf-filtros pf-e-filtros" id="f-audit" role="search" aria-label="Filtrar el registro de auditoría">
          <label class="pf-e-oculto" for="fa-texto">Buscar en el registro</label><input type="search" id="fa-texto" placeholder="Buscar…">
          <label class="pf-e-oculto" for="fa-tabla">Tabla</label><select id="fa-tabla"><option value="">Todas las tablas</option></select>
          <label class="pf-e-oculto" for="fa-accion">Acción</label><select id="fa-accion"><option value="">Todas las acciones</option></select>
          <label class="pf-e-oculto" for="fa-empresa">Empresa</label><select id="fa-empresa"><option value="">Todas las empresas</option></select>
          <span class="pf-e-fechas"><label for="fa-desde">Desde</label><input type="date" id="fa-desde"><label for="fa-hasta">Hasta</label><input type="date" id="fa-hasta"></span>
        </form>
        <div class="pf-e-botones"><p id="fa-cuenta" aria-live="polite"></p><button class="pf-btn" type="button" id="fa-csv">Exportar CSV</button></div>
        <div id="fa-tabla-res"></div>
      </section>`;
    const log = await Datos.auditoria();
    const opciones = (id, vals, etq = (v) => v) => [...new Set(vals.filter(Boolean))].sort().forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = etq(v); $(id).appendChild(o); });
    opciones('fa-tabla', log.map((l) => l.tabla));
    opciones('fa-accion', log.map((l) => l.accion));
    opciones('fa-empresa', log.map((l) => l.empresa_id), (v) => nomEmp[v] || v);
    const map = { 'fa-texto': 'texto', 'fa-tabla': 'tabla', 'fa-accion': 'accion', 'fa-empresa': 'empresa', 'fa-desde': 'desde', 'fa-hasta': 'hasta' };
    Object.entries(map).forEach(([id, k]) => { $(id).value = filtros[k]; $(id).addEventListener('input', () => { filtros[k] = $(id).value; pintarLog(nomEmp); }); });
    $('f-audit').addEventListener('submit', (e) => e.preventDefault());
    $('fa-csv').addEventListener('click', () => exportarCsv(nomEmp));
    await pintarLog(nomEmp);
  }

  async function logFiltrado() {
    const log = await Datos.auditoria();
    const t = filtros.texto.trim().toLowerCase();
    const dia = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: ZONA });
    return log.filter((l) => (!filtros.tabla || l.tabla === filtros.tabla) && (!filtros.accion || l.accion === filtros.accion) &&
      (!filtros.empresa || l.empresa_id === filtros.empresa) && (!filtros.desde || dia(l.ts) >= filtros.desde) && (!filtros.hasta || dia(l.ts) <= filtros.hasta) &&
      (!t || [l.detalle, l.actor, l.tabla, l.accion, l.fila_id].join(' ').toLowerCase().includes(t)));
  }
  async function pintarLog(nomEmp) {
    const l = await logFiltrado();
    $('fa-cuenta').textContent = `${l.length} ${l.length === 1 ? 'entrada' : 'entradas'}`;
    $('fa-tabla-res').innerHTML = l.length ? tabla(['N.º', 'Fecha y hora', 'Actor', 'Empresa', 'Tabla', 'Acción', 'Detalle'],
      l.map((x) => `<tr><td>${esc(x.n)}</td><td>${fechaHora(x.ts)}</td><td>${esc(x.actor)}</td><td>${esc(nomEmp[x.empresa_id] || x.empresa_id || '—')}</td><td>${esc(x.tabla)}</td><td>${esc(x.accion)}</td><td>${esc(x.detalle)}</td></tr>`), 'pf-e-log')
      : '<p class="pf-vacio">No hay entradas con esos filtros.</p>';
  }
  async function exportarCsv(nomEmp) {
    const l = await logFiltrado();
    const c = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cab = ['n', 'ts', 'actor', 'empresa_id', 'empresa', 'tabla', 'accion', 'fila_id', 'detalle', 'antes', 'despues'];
    const filas = l.map((x) => [x.n, x.ts, x.actor, x.empresa_id, nomEmp[x.empresa_id] || '', x.tabla, x.accion, x.fila_id, x.detalle,
      x.antes ? JSON.stringify(x.antes) : '', x.despues ? JSON.stringify(x.despues) : ''].map(c).join(';'));
    const csv = '﻿' + [cab.join(';'), ...filas].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `audit_log_alianzaia_demo_${new Date().toLocaleDateString('sv-SE', { timeZone: ZONA })}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    await Datos.auditar('audit_log', 'EXPORT', `Exporta ${l.length} entradas del registro a CSV`, 'auditor-demo');
    avisar(`CSV exportado con ${l.length} entradas. La exportación queda en el registro.`);
    await pintarLog(nomEmp);
  }

  // ---------------------------------------------------------------- eventos globales
  document.addEventListener('click', async (e) => {
    const ir = e.target.closest('[data-ir]');
    if (ir) { limpiarAviso(); return activar(ir.dataset.ir, true); }
    const est = e.target.closest('[data-estado]');
    if (est) {
      if (est.dataset.estado === 'baja' && !confirm('¿Dar de baja la empresa? Se conservan sus datos y su historial.')) return;
      const emp = await Datos.cambiarEstado(est.dataset.estado);
      avisar(`Estado de la empresa: ${ESTADOS[emp.estado]}.`);
      await pintarAlta();
      return;
    }
    const q = e.target.closest('[data-quitar]');
    if (q) {
      if (!confirm('¿Quitar a esta persona de la empresa?')) return;
      try { await Datos.quitar(q.dataset.quitar); avisar('Usuario quitado de la empresa.'); await pintarUsuarios(); $('tab-usuarios').focus(); }
      catch (er) { avisar(er.message); }
    }
  });
  document.addEventListener('change', async (e) => {
    const r = e.target.closest('[data-rol]');
    if (!r) return;
    try { await Datos.cambiarRol(r.dataset.rol, r.value); avisar('Rol actualizado.'); }
    catch (er) { avisar(er.message); }
    await pintarUsuarios();
    const sel = $('rol-' + r.dataset.rol); if (sel) sel.focus();
  });
  $('reiniciar').addEventListener('click', async () => {
    if (!confirm('Se borrarán de este navegador la empresa de la demo, sus usuarios, declaraciones y el registro de auditoría. ¿Continuar?')) return;
    await Datos.borrar(); alta.paso = 0; alta.d = { startup: '' };
    avisar('Datos de la demo borrados de este navegador.');
    if (new URLSearchParams(location.search).get('vista') === 'auditor') await pintarAuditor(); else await activar('alta');
  });

  // ---------------------------------------------------------------- arranque
  Promise.all([
    Datos.semilla(),
    fetch('/plataforma/data/cuestionario.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => null)
  ]).then(async ([semilla, q]) => {
    D = semilla; Q = q;
    if (new URLSearchParams(location.search).get('vista') === 'auditor') {
      await pintarAuditor();
      $('reiniciar').hidden = !(await Datos.hayDatos());
      return;
    }
    document.querySelectorAll('[role="tab"]').forEach((b) => {
      b.addEventListener('click', () => { limpiarAviso(); activar(b.dataset.tab); });
      b.addEventListener('keydown', tecladoTabs);
    });
    const s = await Datos.estado();
    const pedido = location.hash.slice(1);
    await activar(TABS.includes(pedido) ? pedido : (s.empresa ? 'panel' : 'alta'));
  }).catch(() => { $('vista-empresa').innerHTML = '<p class="pf-vacio">No se han podido cargar los datos de la demo.</p>'; });
})();
