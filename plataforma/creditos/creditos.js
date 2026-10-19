// Plataforma AlianzaIA · Módulo c: hub de créditos cloud y de IA, y servicios valorados.
// MVP en modo DEMO: los datos viven en localStorage (clave alianzaia_creditos_demo),
// sembrados desde /plataforma/data/creditos-demo.json. Todo el acceso a datos pasa por
// el objeto `Datos` (métodos async) con los nombres de tablas, campos y estados de
// db/schema.sql, para cambiarlo por Supabase UE sin tocar la interfaz.
// El libro de registro (ledger) es solo de inserción y va encadenado con SHA-256
// (crypto.subtle); las correcciones son contraasientos, nunca ediciones.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLAVE = 'alianzaia_creditos_demo';
  const TOPE_MINIMIS = 300000;            // Reg. (UE) 2023/2831: 300.000 € en 3 ejercicios, empresa única
  const VALIDEZ_DECLARACION_DIAS = 30;    // provisional: la fija Legal (parametros_legales.minimis_validez_dias)
  const DIA = 86400000;
  const GESTOR = new URLSearchParams(location.search).get('vista') === 'gestor';

  const TIPOS_PROGRAMA = { cloud: 'Créditos cloud', tokens: 'Créditos de modelos de IA' };
  const TIPOS_SERVICIO = { mentoria: 'Mentoría', consultoria: 'Consultoría', formacion: 'Formación', prueba_concepto: 'Prueba de concepto', diagnostico: 'Diagnóstico', otro: 'Otro' };
  const ACTIVACION = { codigo: 'Código promocional', cuenta_facturacion: 'Alta en cuenta de facturación del programa', clave_api: 'Clave API con tope de gasto', enlace_alta: 'Enlace de alta único' };
  const ESTADOS = { pendiente: 'Pendiente', validada: 'Validada', asignada: 'Asignada', activada: 'Activada', cerrada: 'Cerrada', rechazada: 'Rechazada' };
  const ABIERTAS = ['pendiente', 'validada', 'asignada', 'activada'];
  const ORIGENES = { api: 'API del proveedor', pasarela: 'Pasarela de la Alianza', manual: 'Carga manual' };
  const MOTIVOS = { caducidad: 'Caducidad', devolucion: 'Devolución', revocacion: 'Revocación', error: 'Error de registro' };
  const TIPOS_ASIENTO = { cesion: 'Cesión', asignacion: 'Asignación', activacion: 'Activación', consumo: 'Consumo', servicio: 'Servicio valorado', cierre: 'Cierre', contraasiento: 'Contraasiento' };

  const fmtEur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur = (n) => fmtEur.format(Number(n) || 0);
  const fecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const fechaHora = (iso) => iso ? new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const red2 = (n) => Math.round(Number(n) * 100) / 100;
  const nuevoId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const corto = (h) => h ? `${h.slice(0, 10)}…` : '—';

  async function sha256(dato) {
    const bytes = typeof dato === 'string' ? new TextEncoder().encode(dato) : dato;
    const h = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Mismo orden de campos que ledger_encadenar() en schema.sql
  const textoAsiento = (a) => [a.hash_prev, a.ts, a.tipo, a.lote_id || '', a.empresa_id || '', a.asignacion_id || '',
    Number(a.importe_eur).toFixed(2), JSON.stringify(a.detalle || {})].join('|');

  class ErrorDatos extends Error {}

  // =====================================================================
  // Datos: capa de acceso (demo en localStorage → Supabase)
  // =====================================================================
  const Datos = {
    _s: null,

    async _estado() {
      if (this._s) return this._s;
      try { const g = JSON.parse(localStorage.getItem(CLAVE)); if (g && g.version === 1) return (this._s = g); } catch (e) { /* se vuelve a sembrar */ }
      return this._sembrar();
    },
    _guardar() { localStorage.setItem(CLAVE, JSON.stringify(this._s)); },

    async _sembrar() {
      const r = await fetch('/plataforma/data/creditos-demo.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('No se han podido cargar los datos de demostración');
      const d = await r.json();
      const ahora = Date.now();
      let orden = 0;
      const resolver = (v) => {
        if (Array.isArray(v)) return v.map(resolver);
        if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = resolver(v[k]); return o; }
        const m = typeof v === 'string' && v.match(/^hace:(\d+)$/);
        return m ? new Date(ahora - Number(m[1]) * DIA + (orden++) * 60000).toISOString() : v;
      };
      const s = resolver(d);
      delete s._nota;
      s.version = 1;
      s.correcciones_minimis = [];
      for (const ev of s.evidencias) { ev.sha256 = await sha256(ev.contenido_demo); delete ev.contenido_demo; }
      const asientos = s.ledger; s.ledger = [];
      this._s = s;
      for (const a of asientos) await this._asentar(a, a.ts);
      this._guardar();
      return s;
    },

    async _asentar(a, ts) {
      const s = this._s;
      const prev = s.ledger[s.ledger.length - 1];
      const asiento = {
        n: (prev ? prev.n : 0) + 1, ts: ts || new Date().toISOString(), tipo: a.tipo,
        lote_id: a.lote_id || null, empresa_id: a.empresa_id || null, asignacion_id: a.asignacion_id || null,
        importe_eur: red2(a.importe_eur), corrige_n: a.corrige_n || null, detalle: a.detalle || {},
        actor: GESTOR ? 'gestor-demo' : 'empresa-demo', hash_prev: prev ? prev.hash : 'GENESIS'
      };
      asiento.hash = await sha256(textoAsiento(asiento));
      s.ledger.push(asiento);
      return asiento;
    },

    // --- cálculos sobre el ledger (fuente única de importes) ---
    _efectivo(a) { return red2(a.importe_eur + this._s.ledger.filter((c) => c.tipo === 'contraasiento' && c.corrige_n === a.n).reduce((t, c) => t + c.importe_eur, 0)); },
    _suma(filtro) { return red2(this._s.ledger.filter(filtro).reduce((t, a) => t + this._efectivo(a), 0)); },
    _asignado(asgId) { return this._suma((a) => a.tipo === 'asignacion' && a.asignacion_id === asgId); },
    _consumido(asgId) { return this._suma((a) => a.tipo === 'consumo' && a.asignacion_id === asgId); },
    _valorServicio(svId) { return this._suma((a) => a.tipo === 'servicio' && a.detalle.servicio_valorado === svId); },
    _disponibleLote(l) { return l.estado !== 'cedido' ? 0 : red2(l.valor_eur_tarifa - this._suma((a) => a.tipo === 'asignacion' && a.lote_id === l.id)); },
    _plazasLibres(o) { return o.plazas - this._s.servicios_valorados.filter((v) => v.servicio_id === o.id && this._valorServicio(v.id) > 0).length; },
    _minimisPlataforma(empId) {
      const desde = Date.now() - 3 * 365 * DIA;
      return this._suma((a) => (a.tipo === 'asignacion' || a.tipo === 'servicio') && a.empresa_id === empId && new Date(a.ts).getTime() > desde);
    },
    _sol(id) { const x = this._s.solicitudes_credito.find((v) => v.id === id); if (!x) throw new ErrorDatos('No existe la solicitud'); return x; },
    _decl(solId) { return this._s.declaraciones_minimis.find((d) => d.solicitud_id === solId); },
    _programa(id) { return this._s.programas_credito.find((p) => p.id === id); },
    _proveedor(id) { return this._s.proveedores.find((p) => p.id === id); },
    _servicio(id) { return this._s.servicios_oferta.find((p) => p.id === id); },
    _empresa(id) { return this._s.empresas.find((e) => e.id === id); },
    _objeto(sol) {
      if (sol.servicio_id) { const o = this._servicio(sol.servicio_id); return { nombre: o.concepto, sub: `${TIPOS_SERVICIO[o.tipo]} · ${o.aportante_publico}`, servicio: true }; }
      const p = this._programa(sol.programa_id); return { nombre: p.nombre_publico, sub: this._proveedor(p.proveedor_id).nombre_publico, servicio: false };
    },
    _comprobarMinimis(sol, importe) {
      const d = this._decl(sol.id);
      if (!d || !d.representa) throw new ErrorDatos('Falta la declaración de minimis de esta solicitud, firmada por quien representa a la empresa.');
      if (d.sector_excluido) throw new ErrorDatos('La empresa declara operar en un sector excluido del Reglamento (UE) 2023/2831: no se puede asignar.');
      if (Date.now() - new Date(d.creado_en).getTime() > VALIDEZ_DECLARACION_DIAS * DIA) throw new ErrorDatos(`La declaración de minimis tiene más de ${VALIDEZ_DECLARACION_DIAS} días: la empresa debe renovarla.`);
      const plataforma = this._minimisPlataforma(sol.empresa_id);
      if (d.ayudas_otras_eur + plataforma + importe > TOPE_MINIMIS) {
        throw new ErrorDatos(`Supera el límite de minimis: ${eur(d.ayudas_otras_eur)} declarados + ${eur(plataforma)} de la plataforma + ${eur(importe)} nuevos > ${eur(TOPE_MINIMIS)}.`);
      }
      return d;
    },

    // --- lectura ---
    async empresaActual() { const s = await this._estado(); return { ...this._empresa(s.empresa_actual) }; },
    async empresas() { const s = await this._estado(); return s.empresas.map((e) => ({ ...e })); },
    async programas({ tipo = '', soloUe = false } = {}) {
      const s = await this._estado();
      return s.programas_credito.filter((p) => (!tipo || p.tipo === tipo) && (!soloUe || p.region_ue)).map((p) => {
        const lotes = s.lotes_credito.filter((l) => l.programa_id === p.id);
        return { ...p, proveedor_publico: this._proveedor(p.proveedor_id).nombre_publico, disponible_eur: red2(lotes.reduce((t, l) => t + this._disponibleLote(l), 0)) };
      });
    },
    async serviciosOferta() { const s = await this._estado(); return s.servicios_oferta.map((o) => ({ ...o, plazas_libres: this._plazasLibres(o) })); },
    async lotes() {
      const s = await this._estado();
      return s.lotes_credito.map((l) => { const p = this._programa(l.programa_id); const disp = this._disponibleLote(l); return { ...l, programa: p.nombre_publico, proveedor_publico: this._proveedor(p.proveedor_id).nombre_publico, disponible_eur: disp, asignado_eur: l.estado === 'cedido' ? red2(l.valor_eur_tarifa - disp) : 0 }; });
    },
    async solicitudes({ empresa_id = null } = {}) {
      const s = await this._estado();
      return s.solicitudes_credito.filter((x) => !empresa_id || x.empresa_id === empresa_id).map((x) => {
        const d = this._decl(x.id), e = this._empresa(x.empresa_id);
        const asg = s.asignaciones.find((a) => a.solicitud_id === x.id);
        const sv = s.servicios_valorados.find((v) => v.solicitud_id === x.id);
        return { ...x, ...{ objeto: this._objeto(x) }, empresa: e.razon_social, nif: e.nif, declaracion: d ? { ...d } : null,
          minimis_plataforma_eur: this._minimisPlataforma(x.empresa_id), asignacion: asg ? { ...asg } : null, servicio_valorado: sv ? { ...sv } : null };
      }).sort((a, b) => b.creado_en.localeCompare(a.creado_en));
    },
    async misCreditos(empId) {
      const s = await this._estado();
      const asignaciones = s.asignaciones.filter((a) => a.empresa_id === empId).map((a) => {
        const sol = this._sol(a.solicitud_id), p = this._programa(sol.programa_id);
        const asignado = this._asignado(a.id), consumido = this._consumido(a.id);
        return { ...a, estado: sol.estado, programa: p.nombre_publico, tipo: p.tipo, proveedor_publico: this._proveedor(p.proveedor_id).nombre_publico, modo_activacion: p.modo_activacion, asignado_eur: asignado, consumido_eur: consumido, saldo_eur: red2(asignado - consumido) };
      });
      const servicios = s.servicios_valorados.filter((v) => v.empresa_id === empId).map((v) => ({ ...v, estado: this._sol(v.solicitud_id).estado, aportante_publico: this._servicio(v.servicio_id).aportante_publico, valor_eur: this._valorServicio(v.id) }));
      const decls = s.declaraciones_minimis.filter((d) => d.empresa_id === empId).sort((a, b) => b.creado_en.localeCompare(a.creado_en));
      return { asignaciones, servicios, consumos: await this.consumos({ empresa_id: empId }),
        minimis: { plataforma_eur: this._minimisPlataforma(empId), otras_eur: decls[0] ? decls[0].ayudas_otras_eur : 0, tope_eur: TOPE_MINIMIS } };
    },
    async consumos({ empresa_id = null } = {}) {
      const s = await this._estado();
      return s.consumos.filter((c) => !empresa_id || c.empresa_id === empresa_id).map((c) => {
        const a = s.asignaciones.find((x) => x.id === c.asignacion_id), p = this._programa(this._sol(a.solicitud_id).programa_id);
        const ev = s.evidencias.find((e) => e.id === c.evidencia_id) || {};
        const asiento = s.ledger.find((l) => l.tipo === 'consumo' && l.detalle.consumo === c.id);
        const e = this._empresa(c.empresa_id);
        return { ...c, empresa: e.razon_social, nif: e.nif, programa: p.nombre_publico, proveedor_publico: this._proveedor(p.proveedor_id).nombre_publico,
          evidencia_tipo: ev.tipo, evidencia_ruta: ev.ruta, evidencia_sha256: ev.sha256, ledger_n: asiento ? asiento.n : null,
          importe_efectivo_eur: asiento ? this._efectivo(asiento) : c.importe_eur };
      }).sort((a, b) => a.periodo_desde.localeCompare(b.periodo_desde));
    },
    async ledger() {
      const s = await this._estado();
      return s.ledger.map((a) => ({ ...a, detalle: { ...a.detalle }, empresa: a.empresa_id ? this._empresa(a.empresa_id).razon_social : '', efectivo_eur: this._efectivo(a),
        corregible: ['asignacion', 'consumo', 'servicio'].includes(a.tipo) && this._efectivo(a) > 0 }));
    },
    async verificarCadena() {
      const s = await this._estado();
      let prev = 'GENESIS';
      for (const a of s.ledger) {
        if (a.hash_prev !== prev) return { ok: false, n: a.n, total: s.ledger.length, motivo: 'el enlace con el asiento anterior no coincide' };
        if (await sha256(textoAsiento(a)) !== a.hash) return { ok: false, n: a.n, total: s.ledger.length, motivo: 'la huella no coincide con su contenido' };
        prev = a.hash;
      }
      return { ok: true, total: s.ledger.length, ultimo: prev };
    },

    // --- escritura: empresa ---
    async crearSolicitud({ empresa_id, programa_id = null, servicio_id = null, necesidad, consumo_estimado_eur, declaracion }) {
      const s = await this._estado();
      necesidad = String(necesidad || '').trim();
      const estimado = red2(consumo_estimado_eur);
      if (necesidad.length < 15) throw new ErrorDatos('Describe el caso de uso o la necesidad (al menos 15 caracteres).');
      if (!(estimado > 0)) throw new ErrorDatos('Indica el consumo estimado en euros.');
      if (programa_id) {
        const p = this._programa(programa_id);
        if (p.importe_max_eur && estimado > p.importe_max_eur) throw new ErrorDatos(`El programa admite como máximo ${eur(p.importe_max_eur)} por empresa.`);
      }
      if (s.solicitudes_credito.some((x) => x.empresa_id === empresa_id && ABIERTAS.includes(x.estado) && (programa_id ? x.programa_id === programa_id : x.servicio_id === servicio_id))) {
        throw new ErrorDatos('Ya tienes una solicitud abierta para esto. Puedes seguirla en «Mis créditos».');
      }
      const otras = red2(declaracion.ayudas_otras_eur);
      if (!declaracion.representa) throw new ErrorDatos('Marca la casilla «Represento a la empresa» para firmar la declaración de minimis.');
      if (!(otras >= 0)) throw new ErrorDatos('Indica las ayudas de minimis recibidas de otras fuentes (0 si no hay).');
      if (declaracion.sector_excluido) throw new ErrorDatos('Las empresas de sectores excluidos del Reglamento (UE) 2023/2831 no pueden recibir estas ayudas.');
      const plataforma = this._minimisPlataforma(empresa_id);
      if (otras + plataforma + estimado > TOPE_MINIMIS) throw new ErrorDatos(`Con esta solicitud superarías el límite de minimis: ${eur(otras)} de otras fuentes + ${eur(plataforma)} de la plataforma + ${eur(estimado)} > ${eur(TOPE_MINIMIS)} en tres ejercicios.`);
      const ahora = new Date().toISOString();
      const sol = { id: nuevoId('sol'), empresa_id, programa_id, servicio_id, necesidad, consumo_estimado_eur: estimado, estado: 'pendiente', motivo_estado: null, creado_en: ahora };
      const decl = { id: nuevoId('dm'), empresa_id, solicitud_id: sol.id, representa: true, ayudas_otras_eur: otras, sector_excluido: false, creado_en: ahora };
      decl.huella_documento = await sha256(JSON.stringify({ empresa: empresa_id, solicitud: sol.id, ayudas_minimis_otras_3_anos_eur: otras, sector_excluido: false, fecha: ahora }));
      s.solicitudes_credito.push(sol); s.declaraciones_minimis.push(decl);
      this._guardar();
      return { ...sol };
    },
    async confirmarActivacion(solId) {
      await this._estado();
      const sol = this._sol(solId);
      if (sol.estado !== 'asignada') throw new ErrorDatos('Solo se puede activar una solicitud asignada.');
      const ahora = new Date().toISOString();
      if (sol.servicio_id) {
        const sv = this._s.servicios_valorados.find((v) => v.solicitud_id === solId);
        sv.activada_en = ahora;
        await this._asentar({ tipo: 'activacion', empresa_id: sol.empresa_id, importe_eur: 0, detalle: { servicio_valorado: sv.id, modo: 'servicio' } });
      } else {
        const a = this._s.asignaciones.find((x) => x.solicitud_id === solId);
        a.activada_en = ahora;
        await this._asentar({ tipo: 'activacion', lote_id: a.lote_id, empresa_id: a.empresa_id, asignacion_id: a.id, importe_eur: 0, detalle: { modo: this._programa(sol.programa_id).modo_activacion } });
      }
      sol.estado = 'activada';
      this._guardar();
    },

    // --- escritura: gestor ---
    async validar(solId) {
      await this._estado();
      const sol = this._sol(solId);
      if (sol.estado !== 'pendiente') throw new ErrorDatos('Solo se validan solicitudes pendientes.');
      sol.estado = 'validada'; sol.motivo_estado = null;
      this._guardar();
    },
    async rechazar(solId, motivo) {
      await this._estado();
      const sol = this._sol(solId);
      if (!['pendiente', 'validada'].includes(sol.estado)) throw new ErrorDatos('Solo se rechazan solicitudes pendientes o validadas.');
      if (String(motivo || '').trim().length < 5) throw new ErrorDatos('Indica el motivo del rechazo: se comunica a la empresa.');
      sol.estado = 'rechazada'; sol.motivo_estado = String(motivo).trim();
      this._guardar();
    },
    async asignar(solId, { lote_id = null, importe_eur = 0 } = {}) {
      const s = await this._estado();
      const sol = this._sol(solId);
      if (sol.estado !== 'validada') throw new ErrorDatos('Primero hay que validar la elegibilidad de la solicitud.');
      const ahora = new Date().toISOString();
      if (sol.servicio_id) {
        const o = this._servicio(sol.servicio_id);
        if (this._plazasLibres(o) <= 0) throw new ErrorDatos('No quedan plazas de este servicio.');
        const d = this._comprobarMinimis(sol, o.importe_eur);
        const sv = { id: nuevoId('sv'), empresa_id: sol.empresa_id, solicitud_id: sol.id, servicio_id: o.id, tipo: o.tipo, concepto: o.concepto, importe_eur: o.importe_eur, fecha: ahora, declaracion_minimis_id: d.id, comunicado_en: ahora, activada_en: null };
        s.servicios_valorados.push(sv);
        await this._asentar({ tipo: 'servicio', empresa_id: sol.empresa_id, importe_eur: o.importe_eur, detalle: { servicio_valorado: sv.id, solicitud: sol.id, servicio: o.id, declaracion_minimis: d.id } });
      } else {
        const importe = red2(importe_eur);
        const l = s.lotes_credito.find((x) => x.id === lote_id);
        if (!l || l.programa_id !== sol.programa_id) throw new ErrorDatos('Elige un lote del mismo programa.');
        if (l.estado !== 'cedido') throw new ErrorDatos('El lote no está cedido en firme: no se puede asignar.');
        if (!(importe > 0)) throw new ErrorDatos('Indica el importe a asignar.');
        const p = this._programa(sol.programa_id);
        if (p.importe_max_eur && importe > p.importe_max_eur) throw new ErrorDatos(`El programa admite como máximo ${eur(p.importe_max_eur)} por empresa.`);
        if (importe > this._disponibleLote(l)) throw new ErrorDatos(`El lote solo tiene ${eur(this._disponibleLote(l))} disponibles.`);
        const d = this._comprobarMinimis(sol, importe);
        const caduca = new Date(Date.now() + (p.caducidad_meses || 12) * 30 * DIA).toISOString().slice(0, 10);
        const a = { id: nuevoId('asg'), solicitud_id: sol.id, lote_id: l.id, empresa_id: sol.empresa_id, importe_eur: importe, codigo_demo: `DEMO-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, activada_en: null, caduca_en: caduca, declaracion_minimis_id: d.id, comunicado_en: ahora, creado_en: ahora };
        s.asignaciones.push(a);
        await this._asentar({ tipo: 'asignacion', lote_id: l.id, empresa_id: sol.empresa_id, asignacion_id: a.id, importe_eur: importe, detalle: { solicitud: sol.id, declaracion_minimis: d.id } });
      }
      sol.estado = 'asignada';
      this._guardar();
    },
    async registrarConsumo({ asignacion_id, periodo_desde, periodo_hasta, importe_eur, unidades = null, origen, evidencia }) {
      const s = await this._estado();
      const a = s.asignaciones.find((x) => x.id === asignacion_id);
      if (!a) throw new ErrorDatos('Elige una asignación.');
      if (this._sol(a.solicitud_id).estado !== 'activada') throw new ErrorDatos('Solo se registra consumo de créditos activados.');
      if (!ORIGENES[origen]) throw new ErrorDatos('Elige el origen del dato.');
      if (!periodo_desde || !periodo_hasta || periodo_hasta < periodo_desde) throw new ErrorDatos('Revisa el periodo: la fecha final no puede ser anterior a la inicial.');
      const importe = red2(importe_eur);
      if (!(importe > 0)) throw new ErrorDatos('Indica el importe consumido a tarifa pública.');
      const saldo = red2(this._asignado(a.id) - this._consumido(a.id));
      if (importe > saldo) throw new ErrorDatos(`El consumo supera el saldo de la asignación (${eur(saldo)}).`);
      if (!evidencia || !evidencia.bytes) throw new ErrorDatos(origen === 'manual' ? 'La carga manual necesita el extracto o la factura del proveedor.' : 'Falta el informe de la API o de la pasarela.');
      const ev = { id: nuevoId('ev'), tipo: origen === 'manual' ? 'Factura o extracto (carga manual)' : `Informe (${ORIGENES[origen]})`, ruta: `demo/${origen}/${a.empresa_id}/${evidencia.nombre}`, sha256: await sha256(evidencia.bytes), subido_por: 'gestor-demo', creado_en: new Date().toISOString() };
      const c = { id: nuevoId('con'), asignacion_id: a.id, empresa_id: a.empresa_id, periodo_desde, periodo_hasta, importe_eur: importe, unidades: unidades ? red2(unidades) : null, origen, evidencia_id: ev.id, creado_en: ev.creado_en };
      s.evidencias.push(ev); s.consumos.push(c);
      await this._asentar({ tipo: 'consumo', lote_id: a.lote_id, empresa_id: a.empresa_id, asignacion_id: a.id, importe_eur: importe, detalle: { consumo: c.id, origen, evidencia: ev.id, sha256: ev.sha256 } });
      this._guardar();
      return { ...c, evidencia_sha256: ev.sha256 };
    },
    async cerrar(solId) {
      const s = await this._estado();
      const sol = this._sol(solId);
      if (sol.estado !== 'activada') throw new ErrorDatos('Solo se cierran créditos o servicios activados.');
      if (sol.servicio_id) {
        const sv = s.servicios_valorados.find((v) => v.solicitud_id === solId);
        await this._asentar({ tipo: 'cierre', empresa_id: sol.empresa_id, importe_eur: 0, detalle: { servicio_valorado: sv.id, prestado: true } });
      } else {
        const a = s.asignaciones.find((x) => x.solicitud_id === solId);
        const saldo = red2(this._asignado(a.id) - this._consumido(a.id));
        await this._asentar({ tipo: 'cierre', lote_id: a.lote_id, empresa_id: a.empresa_id, asignacion_id: a.id, importe_eur: 0, detalle: { saldo_final_eur: saldo, consumido_eur: this._consumido(a.id) } });
      }
      sol.estado = 'cerrada';
      this._guardar();
    },
    async contraasiento(n, { importe_eur, motivo }) {
      const s = await this._estado();
      const a = s.ledger.find((x) => x.n === n);
      if (!a || !['asignacion', 'consumo', 'servicio'].includes(a.tipo)) throw new ErrorDatos('Solo se corrigen asientos de asignación, consumo o servicio.');
      if (!MOTIVOS[motivo]) throw new ErrorDatos('Elige el motivo de la corrección.');
      const vivo = this._efectivo(a);
      let max = vivo;
      if (a.tipo === 'asignacion') max = Math.min(vivo, red2(this._asignado(a.asignacion_id) - this._consumido(a.asignacion_id)));
      const importe = red2(importe_eur);
      if (!(importe > 0)) throw new ErrorDatos('Indica el importe a corregir.');
      if (importe > max) throw new ErrorDatos(`Como máximo se pueden corregir ${eur(max)}${a.tipo === 'asignacion' ? ' (el saldo sin consumir)' : ''}.`);
      if (a.tipo === 'servicio' && importe !== vivo) throw new ErrorDatos('Un servicio valorado se corrige por su importe completo.');
      const c = await this._asentar({ tipo: 'contraasiento', lote_id: a.lote_id, empresa_id: a.empresa_id, asignacion_id: a.asignacion_id, importe_eur: -importe, corrige_n: a.n, detalle: { ...(a.detalle.servicio_valorado ? { servicio_valorado: a.detalle.servicio_valorado } : {}), corrige_tipo: a.tipo, motivo } });
      if (a.tipo !== 'consumo') {
        s.correcciones_minimis.push({ id: nuevoId('cm'), asignacion_id: a.asignacion_id, servicio_valorado_id: a.detalle.servicio_valorado || null, importe_eur: -importe, motivo, ledger_n: c.n, creado_en: c.ts });
      }
      this._guardar();
      return { ...c };
    },
    async exportarConsumoCsv({ empresa_id = null } = {}) {
      const filas = await this.consumos({ empresa_id });
      const num = (n) => n === null || n === undefined ? '' : String(red2(n)).replace('.', ',');
      const celda = (v) => { const t = String(v ?? ''); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const cab = ['empresa', 'nif', 'proveedor', 'programa', 'periodo_desde', 'periodo_hasta', 'importe_eur', 'importe_vigente_eur', 'unidades', 'origen', 'evidencia', 'evidencia_sha256', 'ledger_n'];
      const lineas = filas.map((c) => [c.empresa, c.nif, c.proveedor_publico, c.programa, c.periodo_desde, c.periodo_hasta, num(c.importe_eur), num(c.importe_efectivo_eur), num(c.unidades), c.origen, c.evidencia_ruta, c.evidencia_sha256, c.ledger_n].map(celda).join(';'));
      return '﻿' + [cab.join(';'), ...lineas].join('\r\n') + '\r\n';
    },
    async reiniciar() { localStorage.removeItem(CLAVE); this._s = null; await this._estado(); },
    // Solo demo: altera un asiento SIN pasar por la API, para enseñar que la verificación lo detecta.
    async _demoManipular() {
      const s = await this._estado();
      const a = s.ledger.find((x) => x.tipo === 'consumo') || s.ledger[0];
      a.importe_eur = red2(a.importe_eur + 100);
      this._guardar();
      return a.n;
    }
  };
  window.Datos = Datos; // para pruebas y para la futura capa Supabase

  // =====================================================================
  // Interfaz
  // =====================================================================
  const PESTANAS = GESTOR
    ? [['bandeja', 'Bandeja'], ['lotes', 'Lotes y servicios'], ['consumo', 'Consumo'], ['libro', 'Libro de registro']]
    : [['catalogo', 'Catálogo de créditos'], ['servicios', 'Servicios en especie'], ['mis', 'Mis créditos']];
  let actual = PESTANAS.some(([id]) => `#${id}` === location.hash) ? location.hash.slice(1) : PESTANAS[0][0];
  let empresa = null;
  const filtros = { tipo: '', soloUe: false, estado: 'abiertas' };

  function aviso(texto) { const p = $('cr-estado'); p.textContent = texto; p.hidden = !texto; }
  const chip = (estado) => `<span class="pf-cr-chip pf-cr-${esc(estado)}">${esc(ESTADOS[estado] || estado)}</span>`;
  const tabla = (etiqueta, cab, filas, vacio) => filas.length
    ? `<div class="pf-cr-scroll" role="region" aria-label="${esc(etiqueta)}" tabindex="0"><table class="pf-cr-tabla"><caption class="pf-cr-oculto">${esc(etiqueta)}</caption><thead><tr>${cab.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>`
    : `<p class="pf-vacio">${esc(vacio)}</p>`;
  const huella = (h) => h ? `<code class="pf-cr-hash" title="SHA-256: ${esc(h)}">${esc(corto(h))}</code>` : '—';

  function pintarPestanas() {
    $('cr-tabs').innerHTML = PESTANAS.map(([id, t]) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel" aria-selected="${id === actual}" tabindex="${id === actual ? 0 : -1}" data-tab="${id}">${esc(t)}</button>`).join('');
    $('cr-paneles').innerHTML = `<section id="panel" role="tabpanel" aria-labelledby="tab-${actual}" class="pf-cr-panel"></section>`;
  }
  async function pintar() {
    pintarPestanas();
    const panel = $('panel');
    try { panel.innerHTML = await VISTAS[actual](); } catch (e) { panel.innerHTML = `<p class="pf-vacio">No se han podido cargar los datos: ${esc(e.message)}</p>`; console.warn(e); }
  }

  // --- empresa: catálogo ---
  async function vistaCatalogo() {
    const progs = await Datos.programas(filtros);
    return `<h2 class="pf-cr-h2">Programas de créditos</h2>
      <p class="pf-cr-intro">Créditos de infraestructura cloud y de uso de modelos de IA aportados a la Alianza. Se muestran sin marcas comerciales; el detalle del programa lo ve solo la empresa a la que se asigna.</p>
      <div class="pf-filtros" role="search">
        <select id="f-tipo" aria-label="Tipo de crédito"><option value="">Todos los tipos</option>${Object.entries(TIPOS_PROGRAMA).map(([k, v]) => `<option value="${k}"${filtros.tipo === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <label><input id="f-ue" type="checkbox"${filtros.soloUe ? ' checked' : ''}> Solo con región en la UE</label>
      </div>
      <div class="pf-grid" aria-live="polite">${progs.length ? progs.map((p) => `
        <article class="pf-card pf-cr-card">
          <div class="pf-tags"><span class="pf-tag">${esc(TIPOS_PROGRAMA[p.tipo])}</span><span class="pf-tag ${p.region_ue ? 'pf-rep' : 'pf-ej'}">${p.region_ue ? 'Región UE' : 'Sin región UE'}</span>${p.verificado ? '' : '<span class="pf-tag pf-ej">Condiciones a verificar</span>'}</div>
          <h3>${esc(p.nombre_publico)}</h3>
          <span class="pf-meta">Hasta ${eur(p.importe_max_eur)} por empresa · caducidad ${esc(p.caducidad_meses)} meses</span>
          <p>${esc(p.elegibilidad)}</p>
          <span class="pf-tecs">Activación: ${esc(ACTIVACION[p.modo_activacion])}</span>
          ${p.disponible_eur > 0 ? `<button class="pf-btn pf-cr-accion" type="button" data-solicitar-programa="${esc(p.id)}">Solicitar</button>` : '<span class="pf-cr-sin">Sin créditos disponibles todavía</span>'}
        </article>`).join('') : '<p class="pf-vacio">No hay programas con esos filtros.</p>'}</div>`;
  }
  // --- empresa: servicios en especie ---
  async function vistaServicios() {
    const ofertas = await Datos.serviciosOferta();
    return `<h2 class="pf-cr-h2">Servicios en especie de empresas líderes en IA</h2>
      <p class="pf-cr-intro">Mentoría, consultoría y formación gratuitas para tu empresa. Cada servicio tiene un valor documentado y cuenta como ayuda de minimis, igual que los créditos.</p>
      <div class="pf-grid">${ofertas.map((o) => `
        <article class="pf-card pf-cr-card">
          <div class="pf-tags"><span class="pf-tag">${esc(TIPOS_SERVICIO[o.tipo])}</span><span class="pf-tag pf-ej">${esc(o.modalidad)}</span></div>
          <h3>${esc(o.concepto)}</h3>
          <span class="pf-meta">${esc(o.aportante_publico)} · valor ${eur(o.importe_eur)}</span>
          <p>${esc(o.descripcion)}</p>
          <span class="pf-tecs">${o.plazas_libres} de ${o.plazas} plazas libres</span>
          ${o.plazas_libres > 0 ? `<button class="pf-btn pf-cr-accion" type="button" data-solicitar-servicio="${esc(o.id)}">Solicitar</button>` : '<span class="pf-cr-sin">Sin plazas</span>'}
        </article>`).join('')}</div>`;
  }
  // --- empresa: mis créditos ---
  async function vistaMis() {
    const [m, sols] = await Promise.all([Datos.misCreditos(empresa.id), Datos.solicitudes({ empresa_id: empresa.id })]);
    const asignado = m.asignaciones.reduce((t, a) => t + a.asignado_eur, 0), consumido = m.asignaciones.reduce((t, a) => t + a.consumido_eur, 0);
    const usado = m.minimis.plataforma_eur + m.minimis.otras_eur, pct = Math.min(100, (usado / m.minimis.tope_eur) * 100);
    const porPeriodo = {};
    m.consumos.forEach((c) => { const k = `${c.proveedor_publico}|${c.periodo_desde.slice(0, 7)}`; (porPeriodo[k] = porPeriodo[k] || { prov: c.proveedor_publico, mes: c.periodo_desde.slice(0, 7), eur: 0, origenes: new Set() }); porPeriodo[k].eur += c.importe_efectivo_eur; porPeriodo[k].origenes.add(c.origen); });
    const mes = (ym) => new Date(`${ym}-01T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return `<h2 class="pf-cr-h2">Mis créditos · ${esc(empresa.razon_social)}</h2>
      <div class="pf-cr-kpis">
        <div><span>Asignado</span><strong>${eur(asignado)}</strong></div>
        <div><span>Consumido</span><strong>${eur(consumido)}</strong></div>
        <div><span>Saldo disponible</span><strong>${eur(asignado - consumido)}</strong></div>
        <div class="pf-cr-minimis"><span>Ayudas de minimis (3 ejercicios)</span><strong>${eur(usado)}</strong><div class="pf-cr-barra" role="img" aria-label="${Math.round(pct)} % del límite de ${eur(m.minimis.tope_eur)}"><div style="width:${pct}%"></div></div><small>${eur(m.minimis.plataforma_eur)} de la plataforma + ${eur(m.minimis.otras_eur)} declarados de otras fuentes, de un límite de ${eur(m.minimis.tope_eur)}</small></div>
      </div>
      <h3 class="pf-cr-h3">Mis solicitudes</h3>
      ${tabla('Mis solicitudes', ['Fecha', 'Solicitud', 'Estimado', 'Estado', 'Acción'], sols.map((x) => `<tr>
        <td>${fecha(x.creado_en)}</td><td><b>${esc(x.objeto.nombre)}</b><br><small>${esc(x.objeto.sub)}</small>${x.motivo_estado ? `<br><small>Motivo: ${esc(x.motivo_estado)}</small>` : ''}</td>
        <td class="pf-cr-num">${eur(x.consumo_estimado_eur)}</td><td>${chip(x.estado)}</td>
        <td>${x.estado === 'asignada' ? `<button class="pf-btn pf-cr-mini" type="button" data-activar="${esc(x.id)}">${x.servicio_id ? 'Confirmar inicio' : 'Activar'}</button>` : '—'}</td></tr>`), 'Todavía no has hecho ninguna solicitud. Empieza por el catálogo.')}
      <h3 class="pf-cr-h3">Asignaciones</h3>
      ${tabla('Asignaciones de créditos', ['Programa', 'Activación', 'Asignado', 'Consumido', 'Saldo', 'Caduca', 'Estado'], m.asignaciones.map((a) => `<tr>
        <td><b>${esc(a.programa)}</b><br><small>${esc(a.proveedor_publico)}</small></td>
        <td>${a.activada_en ? `Activada el ${fecha(a.activada_en)}<br><small>${esc(ACTIVACION[a.modo_activacion])}: <code>${esc(a.codigo_demo)}</code></small>` : `<small>${esc(ACTIVACION[a.modo_activacion])}. El código se muestra al activar.</small>`}</td>
        <td class="pf-cr-num">${eur(a.asignado_eur)}</td><td class="pf-cr-num">${eur(a.consumido_eur)}</td><td class="pf-cr-num"><b>${eur(a.saldo_eur)}</b></td><td>${fecha(a.caduca_en)}</td><td>${chip(a.estado)}</td></tr>`), 'Aún no tienes créditos asignados.')}
      <h3 class="pf-cr-h3">Consumo por proveedor y periodo</h3>
      ${tabla('Consumo por proveedor y mes', ['Proveedor', 'Mes', 'Importe', 'Origen'], Object.values(porPeriodo).map((r) => `<tr><td>${esc(r.prov)}</td><td>${esc(mes(r.mes))}</td><td class="pf-cr-num">${eur(r.eur)}</td><td>${[...r.origenes].map((o) => esc(ORIGENES[o])).join(', ')}</td></tr>`), 'Sin consumo registrado todavía.')}
      ${m.consumos.length ? `<details class="pf-cr-detalle"><summary>Ver cada línea de consumo con su evidencia</summary>
      ${tabla('Líneas de consumo', ['Periodo', 'Proveedor', 'Importe', 'Origen', 'Evidencia (SHA-256)', 'Asiento'], m.consumos.map((c) => `<tr><td>${fecha(c.periodo_desde)} – ${fecha(c.periodo_hasta)}</td><td>${esc(c.proveedor_publico)}</td><td class="pf-cr-num">${eur(c.importe_efectivo_eur)}${c.importe_efectivo_eur !== c.importe_eur ? `<br><small>corregido (era ${eur(c.importe_eur)})</small>` : ''}</td><td>${esc(ORIGENES[c.origen])}</td><td><small>${esc(c.evidencia_tipo)}</small><br>${huella(c.evidencia_sha256)}</td><td>n.º ${esc(c.ledger_n)}</td></tr>`), '')}</details>` : ''}
      <div class="pf-cr-barra-acciones"><button class="pf-btn pf-sec" type="button" data-csv="empresa"${m.consumos.length ? '' : ' disabled'}>Exportar consumo (CSV)</button></div>
      <h3 class="pf-cr-h3">Servicios en especie recibidos</h3>
      ${tabla('Servicios recibidos', ['Servicio', 'Aportante', 'Valor', 'Fecha', 'Estado'], m.servicios.map((v) => `<tr><td><b>${esc(v.concepto)}</b><br><small>${esc(TIPOS_SERVICIO[v.tipo])}</small></td><td>${esc(v.aportante_publico)}</td><td class="pf-cr-num">${eur(v.valor_eur)}</td><td>${fecha(v.fecha)}</td><td>${chip(v.estado)}</td></tr>`), 'Aún no tienes servicios asignados.')}`;
  }

  // --- gestor: bandeja ---
  async function vistaBandeja() {
    const sols = (await Datos.solicitudes()).filter((x) => filtros.estado === 'todas' || (filtros.estado === 'abiertas' ? ABIERTAS.includes(x.estado) : x.estado === filtros.estado));
    return `<h2 class="pf-cr-h2">Bandeja de solicitudes</h2>
      <div class="pf-filtros"><select id="f-estado" aria-label="Estado"><option value="abiertas"${filtros.estado === 'abiertas' ? ' selected' : ''}>Abiertas</option><option value="todas"${filtros.estado === 'todas' ? ' selected' : ''}>Todas</option>${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}"${filtros.estado === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      ${tabla('Bandeja de solicitudes', ['Fecha', 'Empresa', 'Solicitud', 'Estimado', 'Minimis', 'Estado', 'Acciones'], sols.map((x) => {
        const d = x.declaracion, edad = d ? Math.floor((Date.now() - new Date(d.creado_en).getTime()) / DIA) : null;
        const acc = [];
        if (x.estado === 'pendiente') acc.push(`<button class="pf-btn pf-cr-mini" type="button" data-validar="${esc(x.id)}">Validar</button>`);
        if (x.estado === 'validada') acc.push(`<button class="pf-btn pf-cr-mini" type="button" data-asignar="${esc(x.id)}">Asignar</button>`);
        if (['pendiente', 'validada'].includes(x.estado)) acc.push(`<button class="pf-btn pf-sec pf-cr-mini" type="button" data-rechazar="${esc(x.id)}">Rechazar</button>`);
        if (x.estado === 'activada') acc.push(`<button class="pf-btn pf-sec pf-cr-mini" type="button" data-cerrar="${esc(x.id)}">Cerrar</button>`);
        return `<tr><td>${fecha(x.creado_en)}</td><td><b>${esc(x.empresa)}</b><br><small>${esc(x.nif)}</small></td>
          <td><b>${esc(x.objeto.nombre)}</b><br><small>${esc(x.objeto.sub)}</small><br><small class="pf-cr-necesidad">${esc(x.necesidad)}</small>${x.motivo_estado ? `<br><small>Motivo: ${esc(x.motivo_estado)}</small>` : ''}</td>
          <td class="pf-cr-num">${eur(x.consumo_estimado_eur)}</td>
          <td><small>${d ? `Otras: ${eur(d.ayudas_otras_eur)}<br>Plataforma: ${eur(x.minimis_plataforma_eur)}<br>Declarada ${edad === 0 ? 'hoy' : `hace ${edad} d`}${edad > VALIDEZ_DECLARACION_DIAS && ['pendiente', 'validada'].includes(x.estado) ? ' · <b>caducada: renovar</b>' : ''}` : '<b>Sin declaración</b>'}</small></td>
          <td>${chip(x.estado)}</td><td><div class="pf-cr-acciones">${acc.join('') || '—'}</div></td></tr>`;
      }), 'No hay solicitudes con ese filtro.')}`;
  }
  // --- gestor: lotes ---
  async function vistaLotes() {
    const [lotes, ofertas] = await Promise.all([Datos.lotes(), Datos.serviciosOferta()]);
    return `<h2 class="pf-cr-h2">Lotes de crédito</h2>
      <p class="pf-cr-intro">Cada lote es una cesión en firme a un miembro de la agrupación, valorada a tarifa pública. Al asignar se descuenta del disponible. En la versión real, el nombre comercial del proveedor solo lo ve el personal gestor.</p>
      ${tabla('Lotes de crédito', ['Programa', 'Receptor', 'Unidades', 'Valor a tarifa', 'Asignado', 'Disponible', 'Estado', 'Caduca'], lotes.map((l) => `<tr><td><b>${esc(l.programa)}</b><br><small>${esc(l.proveedor_publico)} · ${esc(l.fuente_tarifa)} (${fecha(l.fecha_tarifa)})</small></td><td>${esc(l.miembro_receptor)}</td><td class="pf-cr-num">${esc(Number(l.unidades).toLocaleString('es-ES'))} ${esc(l.unidad)}</td><td class="pf-cr-num">${eur(l.valor_eur_tarifa)}</td><td class="pf-cr-num">${eur(l.asignado_eur)}</td><td class="pf-cr-num"><b>${eur(l.disponible_eur)}</b></td><td>${l.estado === 'cedido' ? 'Cedido' : l.estado === 'previsto' ? 'Previsto (sin cesión)' : esc(l.estado)}</td><td>${fecha(l.caduca_en)}</td></tr>`), 'No hay lotes.')}
      <h3 class="pf-cr-h3">Servicios valorados ofrecidos</h3>
      ${tabla('Servicios valorados', ['Servicio', 'Aportante', 'Valor unitario', 'Plazas libres'], ofertas.map((o) => `<tr><td><b>${esc(o.concepto)}</b><br><small>${esc(TIPOS_SERVICIO[o.tipo])}</small></td><td>${esc(o.aportante_publico)}</td><td class="pf-cr-num">${eur(o.importe_eur)}</td><td class="pf-cr-num">${o.plazas_libres} / ${o.plazas}</td></tr>`), '')}`;
  }
  // --- gestor: consumo ---
  async function vistaConsumo() {
    const cons = await Datos.consumos();
    return `<h2 class="pf-cr-h2">Consumo por empresa y proveedor</h2>
      <div class="pf-cr-barra-acciones"><button class="pf-btn" type="button" id="nuevo-consumo">Registrar consumo</button><button class="pf-btn pf-sec" type="button" data-csv="todo"${cons.length ? '' : ' disabled'}>Exportar CSV (todas las empresas)</button></div>
      ${tabla('Líneas de consumo', ['Empresa', 'Proveedor', 'Periodo', 'Importe', 'Origen', 'Evidencia (SHA-256)', 'Asiento'], cons.map((c) => `<tr><td><b>${esc(c.empresa)}</b><br><small>${esc(c.nif)}</small></td><td>${esc(c.proveedor_publico)}<br><small>${esc(c.programa)}</small></td><td>${fecha(c.periodo_desde)} – ${fecha(c.periodo_hasta)}</td><td class="pf-cr-num">${eur(c.importe_efectivo_eur)}${c.importe_efectivo_eur !== c.importe_eur ? `<br><small>corregido (era ${eur(c.importe_eur)})</small>` : ''}</td><td>${esc(ORIGENES[c.origen])}</td><td><small>${esc(c.evidencia_ruta)}</small><br>${huella(c.evidencia_sha256)}</td><td>n.º ${esc(c.ledger_n)}</td></tr>`), 'Sin consumos.')}`;
  }
  // --- gestor: libro de registro ---
  async function vistaLibro() {
    const l = await Datos.ledger();
    return `<h2 class="pf-cr-h2">Libro de registro</h2>
      <p class="pf-cr-intro">Solo lectura. Cada asiento lleva la huella SHA-256 del anterior, así que cualquier cambio rompe la cadena. Los errores se corrigen con un contraasiento, nunca editando.</p>
      <div class="pf-cr-barra-acciones"><button class="pf-btn" type="button" id="verificar">Verificar la cadena</button><button class="pf-btn pf-sec" type="button" id="manipular" title="Solo en la demo: altera un asiento por fuera para comprobar que se detecta">Simular una manipulación (demo)</button></div>
      <p id="cadena" class="pf-cr-cadena" role="status" aria-live="polite" hidden></p>
      ${tabla('Libro de registro', ['N.º', 'Fecha', 'Tipo', 'Empresa', 'Importe', 'Corrige', 'Huella', 'Anterior', ''], l.slice().reverse().map((a) => `<tr id="asiento-${a.n}"><td>${a.n}</td><td>${fechaHora(a.ts)}</td><td>${esc(TIPOS_ASIENTO[a.tipo])}${a.detalle.motivo ? `<br><small>${esc(MOTIVOS[a.detalle.motivo])}</small>` : ''}${a.detalle.origen ? `<br><small>${esc(ORIGENES[a.detalle.origen])}</small>` : ''}</td><td>${esc(a.empresa) || '—'}</td><td class="pf-cr-num">${eur(a.importe_eur)}${a.efectivo_eur !== a.importe_eur && a.tipo !== 'contraasiento' ? `<br><small>vigente ${eur(a.efectivo_eur)}</small>` : ''}</td><td>${a.corrige_n ? `n.º ${a.corrige_n}` : '—'}</td><td>${huella(a.hash)}</td><td>${a.hash_prev === 'GENESIS' ? '<code class="pf-cr-hash">GENESIS</code>' : huella(a.hash_prev)}</td><td>${a.corregible ? `<button class="pf-btn pf-sec pf-cr-mini" type="button" data-corregir="${a.n}">Contraasiento</button>` : ''}</td></tr>`), 'Sin asientos.')}`;
  }
  const VISTAS = { catalogo: vistaCatalogo, servicios: vistaServicios, mis: vistaMis, bandeja: vistaBandeja, lotes: vistaLotes, consumo: vistaConsumo, libro: vistaLibro };

  // --- diálogos ---
  function dialogo(titulo, cuerpo, alEnviar, boton = 'Enviar') {
    $('cr-dialogo-in').innerHTML = `<h2 id="cr-dialogo-titulo">${titulo}</h2><form id="cr-form" novalidate>${cuerpo}
      <p class="pf-cr-error" id="cr-error" role="alert" hidden></p>
      <div class="pf-acciones"><button class="pf-btn" type="submit">${esc(boton)}</button><button class="pf-btn pf-sec pf-cerrar2" type="button">Cancelar</button></div></form>`;
    const f = $('cr-form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const msg = await alEnviar(new FormData(f), f);
        $('cr-dialogo').close();
        await pintar();
        if (msg) aviso(msg);
      } catch (err) {
        if (!(err instanceof ErrorDatos)) console.warn(err);
        const p = $('cr-error'); p.textContent = err.message; p.hidden = false; btn.disabled = false;
      }
    });
    $('cr-dialogo').showModal();
    $('cr-dialogo').scrollTop = 0;
    const primero = f.querySelector('input:not([type=hidden]),select,textarea'); if (primero) primero.focus();
  }

  const campo = (etq, html, ayuda = '') => `<label class="pf-campo pf-cr-campo">${etq}${html}${ayuda ? `<small>${ayuda}</small>` : ''}</label>`;

  async function abrirSolicitud({ programa_id = null, servicio_id = null }) {
    let nombre, sub, max = null, valorFijo = null;
    if (programa_id) { const p = (await Datos.programas()).find((x) => x.id === programa_id); nombre = p.nombre_publico; sub = `${TIPOS_PROGRAMA[p.tipo]} · hasta ${eur(p.importe_max_eur)}`; max = p.importe_max_eur; }
    else { const o = (await Datos.serviciosOferta()).find((x) => x.id === servicio_id); nombre = o.concepto; sub = `${TIPOS_SERVICIO[o.tipo]} · ${o.aportante_publico} · valor ${eur(o.importe_eur)}`; valorFijo = o.importe_eur; }
    const m = await Datos.misCreditos(empresa.id);
    dialogo(`Solicitar: ${esc(nombre)}`, `<p class="pf-meta">${esc(sub)}</p>
      ${campo('Caso de uso o necesidad', '<textarea name="necesidad" rows="3" required></textarea>', 'Para qué lo vais a usar. Si viene de un caso del catálogo, indícalo.')}
      ${valorFijo ? `<input type="hidden" name="estimado" value="${valorFijo}"><p>Valor del servicio a efectos de minimis: <b>${eur(valorFijo)}</b>.</p>` : campo('Consumo estimado (€)', `<input name="estimado" type="number" min="1" step="0.01"${max ? ` max="${max}"` : ''} inputmode="decimal" required>`, 'A tarifa pública, para el periodo de uso del crédito.')}
      <fieldset class="pf-preg pf-cr-minimis-form"><legend>Declaración de ayudas de minimis</legend>
        <small>El crédito o servicio asignado es una ayuda en especie sujeta al Reglamento (UE) 2023/2831: como máximo ${eur(TOPE_MINIMIS)} por empresa única en tres ejercicios fiscales, sumando todas las ayudas de minimis. La plataforma ya te ha asignado ${eur(m.minimis.plataforma_eur)}.</small>
        ${campo('Ayudas de minimis recibidas de otras fuentes en los tres últimos ejercicios (€)', `<input name="otras" type="number" min="0" step="0.01" inputmode="decimal" value="${m.minimis.otras_eur || 0}" required>`)}
        <label class="pf-cr-check"><input type="checkbox" name="excluido"> La empresa opera en un sector excluido (pesca y acuicultura, producción agrícola primaria…)</label>
        <label class="pf-cr-check"><input type="checkbox" name="representa" required> <span><b>Represento a la empresa</b> ${esc(empresa.razon_social)} (${esc(empresa.nif)}) y declaro que los datos son ciertos. Esta declaración vale para esta solicitud.</span></label>
      </fieldset>`, async (fd) => {
      await Datos.crearSolicitud({ empresa_id: empresa.id, programa_id, servicio_id, necesidad: fd.get('necesidad'), consumo_estimado_eur: Number(fd.get('estimado')),
        declaracion: { representa: fd.get('representa') === 'on', ayudas_otras_eur: fd.get('otras') === '' ? NaN : Number(fd.get('otras')), sector_excluido: fd.get('excluido') === 'on' } });
      actual = 'mis';
      return 'Solicitud enviada. La verás como «Pendiente» hasta que el equipo gestor valide la elegibilidad.';
    }, 'Enviar solicitud');
  }

  async function abrirAsignar(solId) {
    const x = (await Datos.solicitudes()).find((s) => s.id === solId);
    if (x.servicio_id) {
      return dialogo(`Asignar servicio a ${esc(x.empresa)}`, `<p><b>${esc(x.objeto.nombre)}</b><br>${esc(x.objeto.sub)}</p><p>Se registra como servicio valorado por <b>${eur(x.consumo_estimado_eur)}</b>, se descuenta una plaza y se comunica a la empresa su carácter de ayuda de minimis.</p>`,
        async () => { await Datos.asignar(solId); return `Servicio asignado a ${x.empresa}.`; }, 'Asignar servicio');
    }
    const lotes = (await Datos.lotes()).filter((l) => l.programa_id === x.programa_id && l.estado === 'cedido');
    dialogo(`Asignar créditos a ${esc(x.empresa)}`, `<p><b>${esc(x.objeto.nombre)}</b> · estimado ${eur(x.consumo_estimado_eur)}</p>
      ${campo('Lote', `<select name="lote" required>${lotes.map((l) => `<option value="${esc(l.id)}">${esc(l.programa)} · ${esc(l.miembro_receptor)} · disponible ${eur(l.disponible_eur)}</option>`).join('')}</select>`)}
      ${campo('Importe a asignar (€ a tarifa pública)', `<input name="importe" type="number" min="1" step="0.01" inputmode="decimal" value="${x.consumo_estimado_eur}" required>`, 'Se comprueba el disponible del lote, el máximo del programa, la vigencia de la declaración y el límite de minimis.')}`,
      async (fd) => { await Datos.asignar(solId, { lote_id: fd.get('lote'), importe_eur: Number(fd.get('importe')) }); return `Créditos asignados a ${x.empresa} y descontados del lote.`; }, 'Asignar');
  }

  async function abrirConsumo() {
    const m = (await Datos.solicitudes()).filter((x) => x.estado === 'activada' && x.asignacion);
    const hoy = new Date().toISOString().slice(0, 10);
    dialogo('Registrar consumo', `${campo('Asignación', `<select name="asg" required>${m.map((x) => `<option value="${esc(x.asignacion.id)}">${esc(x.empresa)} · ${esc(x.objeto.nombre)}</option>`).join('')}</select>`)}
      <div class="pf-perfil">${campo('Desde', `<input name="desde" type="date" value="${hoy.slice(0, 8)}01" required>`)}${campo('Hasta', `<input name="hasta" type="date" value="${hoy}" required>`)}</div>
      <div class="pf-perfil">${campo('Importe (€ a tarifa pública)', '<input name="importe" type="number" min="0.01" step="0.01" inputmode="decimal" required>')}${campo('Unidades (opcional)', '<input name="unidades" type="number" min="0" step="0.0001" inputmode="decimal">')}</div>
      ${campo('Origen del dato', `<select name="origen" id="c-origen">${Object.entries(ORIGENES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`)}
      ${campo('Evidencia: informe, extracto o factura', '<input name="fichero" type="file" id="c-fichero">', 'Se calcula su huella SHA-256 en tu navegador y se guarda con el asiento. En la demo el fichero no sale de tu equipo.')}`,
      async (fd) => {
        const f = fd.get('fichero');
        let evidencia = null;
        if (f && f.size) evidencia = { nombre: f.name, bytes: await f.arrayBuffer() };
        else if (fd.get('origen') !== 'manual') evidencia = { nombre: `informe-${Date.now()}.json`, bytes: new TextEncoder().encode(JSON.stringify({ demo: true, origen: fd.get('origen'), importe_eur: fd.get('importe'), desde: fd.get('desde'), hasta: fd.get('hasta') })) };
        const c = await Datos.registrarConsumo({ asignacion_id: fd.get('asg'), periodo_desde: fd.get('desde'), periodo_hasta: fd.get('hasta'), importe_eur: Number(fd.get('importe')), unidades: fd.get('unidades') ? Number(fd.get('unidades')) : null, origen: fd.get('origen'), evidencia });
        return `Consumo registrado. Huella de la evidencia: ${c.evidencia_sha256}`;
      }, 'Registrar');
  }

  async function abrirContraasiento(n) {
    const a = (await Datos.ledger()).find((x) => x.n === n);
    dialogo(`Contraasiento del asiento n.º ${n}`, `<p>${esc(TIPOS_ASIENTO[a.tipo])} · ${esc(a.empresa)} · vigente ${eur(a.efectivo_eur)}</p>
      <p class="pf-meta">El asiento original no se modifica: se añade uno nuevo con importe negativo que lo corrige. ${a.tipo !== 'consumo' ? 'También minora la ayuda de minimis de la empresa.' : ''}</p>
      ${campo('Importe a corregir (€)', `<input name="importe" type="number" min="0.01" step="0.01" inputmode="decimal" value="${a.efectivo_eur}"${a.tipo === 'servicio' ? ' readonly' : ''} required>`)}
      ${campo('Motivo', `<select name="motivo">${Object.entries(MOTIVOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`)}`,
      async (fd) => { const c = await Datos.contraasiento(n, { importe_eur: Number(fd.get('importe')), motivo: fd.get('motivo') }); return `Contraasiento n.º ${c.n} registrado.`; }, 'Registrar contraasiento');
  }

  async function descargarCsv(ambito) {
    const txt = await Datos.exportarConsumoCsv({ empresa_id: ambito === 'empresa' ? empresa.id : null });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `consumo-creditos-${ambito === 'empresa' ? empresa.nif : 'todas'}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    aviso('CSV de consumo descargado (separador «;», decimales con coma, UTF-8).');
  }

  // --- eventos ---
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    try {
      if (d.tab) { actual = d.tab; history.replaceState(null, '', `${location.search}#${actual}`); aviso(''); await pintar(); $(`tab-${actual}`).focus(); }
      else if (d.solicitarPrograma) await abrirSolicitud({ programa_id: d.solicitarPrograma });
      else if (d.solicitarServicio) await abrirSolicitud({ servicio_id: d.solicitarServicio });
      else if (d.activar) { await Datos.confirmarActivacion(d.activar); await pintar(); aviso('Activación confirmada y anotada en el libro de registro.'); }
      else if (d.validar) { await Datos.validar(d.validar); await pintar(); aviso('Elegibilidad validada. Ya se puede asignar.'); }
      else if (d.asignar) await abrirAsignar(d.asignar);
      else if (d.rechazar) dialogo('Rechazar la solicitud', campo('Motivo (se comunica a la empresa)', '<textarea name="motivo" rows="3" required></textarea>'), async (fd) => { await Datos.rechazar(d.rechazar, fd.get('motivo')); return 'Solicitud rechazada.'; }, 'Rechazar');
      else if (d.cerrar) { if (confirm('¿Cerrar este crédito o servicio? Se registra el saldo final en el libro.')) { await Datos.cerrar(d.cerrar); await pintar(); aviso('Cerrado. El saldo final queda en el libro de registro.'); } }
      else if (d.corregir) await abrirContraasiento(Number(d.corregir));
      else if (d.csv) await descargarCsv(d.csv);
      else if (t.id === 'nuevo-consumo') await abrirConsumo();
      else if (t.id === 'verificar') await verificar();
      else if (t.id === 'manipular') { const n = await Datos._demoManipular(); await pintar(); aviso(`Demo: se ha alterado el importe del asiento n.º ${n} directamente en el almacenamiento. Pulsa «Verificar la cadena».`); }
      else if (t.id === 'cr-reiniciar') { await Datos.reiniciar(); empresa = await Datos.empresaActual(); await pintar(); aviso('Demo restablecida con los datos de ejemplo.'); }
      else if (t.closest('.pf-cerrar, .pf-cerrar2')) $('cr-dialogo').close();
    } catch (err) { if (!(err instanceof ErrorDatos)) console.warn(err); aviso(err.message); }
  });
  async function verificar() {
    const p = $('cadena'), r = await Datos.verificarCadena();
    document.querySelectorAll('.pf-cr-roto').forEach((x) => x.classList.remove('pf-cr-roto'));
    p.hidden = false;
    p.className = `pf-cr-cadena ${r.ok ? 'pf-cr-ok' : 'pf-cr-ko'}`;
    if (r.ok) p.innerHTML = `<b>Cadena íntegra ✓</b> · ${r.total} asientos verificados con SHA-256. Última huella: <code class="pf-cr-hash">${esc(r.ultimo)}</code>`;
    else { p.innerHTML = `<b>Cadena rota en el asiento n.º ${r.n}</b>: ${esc(r.motivo)}. Los asientos desde el n.º ${r.n} no son fiables.`; const fila = $(`asiento-${r.n}`); if (fila) fila.classList.add('pf-cr-roto'); }
  }
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'f-tipo') { filtros.tipo = e.target.value; await pintar(); $('f-tipo').focus(); }
    if (e.target.id === 'f-ue') { filtros.soloUe = e.target.checked; await pintar(); $('f-ue').focus(); }
    if (e.target.id === 'f-estado') { filtros.estado = e.target.value; await pintar(); $('f-estado').focus(); }
  });
  $('cr-tabs').addEventListener('keydown', (e) => {
    const i = PESTANAS.findIndex(([id]) => id === actual);
    const sig = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: PESTANAS.length - 1 }[e.key];
    if (sig === undefined) return;
    e.preventDefault();
    $(`tab-${PESTANAS[(sig + PESTANAS.length) % PESTANAS.length][0]}`).click();
  });
  $('cr-dialogo').addEventListener('click', (e) => { if (e.target.id === 'cr-dialogo') $('cr-dialogo').close(); });

  // --- arranque ---
  (async () => {
    if (GESTOR) {
      document.body.classList.add('pf-cr-gestor');
      $('cr-eyebrow').textContent = 'Módulo c · Vista de gestor (demo)';
      $('cr-titulo').textContent = 'Gestión de créditos y servicios valorados';
      $('cr-intro').textContent = 'Bandeja de solicitudes, asignación desde los lotes, registro de consumo con evidencia y libro de registro verificable.';
      $('cr-aviso-texto').innerHTML = 'Vista de gestor de demostración: en esta versión no hay control de acceso y todo se guarda solo en tu navegador. <a href="/plataforma/creditos/">Ir a la vista de empresa</a> ·';
    } else {
      $('cr-aviso-texto').insertAdjacentHTML('beforeend', ' <a href="/plataforma/creditos/?vista=gestor">Ver la vista de gestor (demo)</a> ·');
    }
    try { empresa = await Datos.empresaActual(); } catch (e) { $('cr-paneles').innerHTML = `<p class="pf-vacio">${esc(e.message)}</p>`; return; }
    await pintar();
  })();
})();
