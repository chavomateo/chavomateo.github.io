// Plataforma AlianzaIA · Módulo d: acceso a datos de formación, blueprints y mentorías.
// MODO DEMO: el catálogo sale de /plataforma/data/formacion-demo.json y lo que hace
// cada persona (progreso, mentorías) se guarda en localStorage. Toda la UI pasa por
// `Datos` (métodos async), así que al activar Supabase UE solo cambia este fichero:
//   catálogo  → tablas `recursos` (publicado = true) e `itinerarios`; blueprints → `casos_recursos` (tipo 'blueprint')
//   progreso  → tabla `progreso` (perfil_id, recurso_id, empresa_id, completado_en, minutos)
//   mentorías → tabla `mentorias` (empresa_id, perfil_id, mentor_id, tema, estado, fecha, horas, asistencia, valoracion…)
// El autodiagnóstico (módulo b) solo se LEE: localStorage `alianzaia_diagnosticos` → tabla `diagnosticos`.
(function () {
  const CLAVE = 'alianzaia_formacion_demo';
  const CLAVE_DIAG = 'alianzaia_diagnosticos';
  const ESTADOS = ['solicitada', 'asignada', 'realizada', 'valorada', 'cancelada'];
  let catalogo = null, cuestionario = null;

  const leer = () => {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (d && Array.isArray(d.progreso) && Array.isArray(d.mentorias)) return d;
    } catch (e) { /* datos corruptos: se reinician */ }
    return { perfil_activo: null, rol: 'empresa', progreso: [], mentorias: [] };
  };
  const escribir = (d) => localStorage.setItem(CLAVE, JSON.stringify(d));
  const ahora = () => new Date().toISOString();
  const nuevoId = () => 'MEN-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  async function cargar() {
    if (!catalogo) {
      const r = await fetch('/plataforma/data/formacion-demo.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('No se ha podido cargar el catálogo de formación');
      catalogo = await r.json();
    }
    return catalogo;
  }

  function mentoria(d, id) {
    const m = d.mentorias.find((x) => x.id === id);
    if (!m) throw new Error('Mentoría no encontrada');
    return m;
  }
  function pasar(m, estado, quien) {
    m.estado = estado;
    m.historial.push({ estado, en: ahora(), por: quien });
  }

  window.Datos = {
    modo: 'demo',
    ESTADOS_MENTORIA: ESTADOS,

    // ---- Catálogo (solo lectura) ----
    async catalogo() { return cargar(); },
    async itinerarios() { return (await cargar()).itinerarios; },
    async recursos() { return (await cargar()).recursos.filter((r) => r.publicado); },
    async blueprints() { return (await cargar()).blueprints; },
    async mentores() { return (await cargar()).mentores; },
    async perfiles() { return (await cargar()).perfiles; },
    async empresa() { return (await cargar()).empresa; },
    async casos() {
      const r = await fetch('/plataforma/data/casos.json', { cache: 'no-cache' });
      return r.ok ? r.json() : [];
    },
    async cuestionario() {
      if (!cuestionario) {
        const r = await fetch('/plataforma/data/cuestionario.json', { cache: 'no-cache' });
        cuestionario = r.ok ? await r.json() : { dimensiones: [], niveles: [], aparte: [] };
      }
      return cuestionario;
    },

    // ---- Preferencias de la demo (en producción salen de la sesión) ----
    async sesion() {
      const d = leer(), perfiles = (await cargar()).perfiles;
      const perfil = perfiles.find((p) => p.id === d.perfil_activo) || perfiles[0];
      return { perfil, rol: d.rol || 'empresa' };
    },
    async fijarSesion({ perfil_id, rol }) {
      const d = leer();
      if (perfil_id) d.perfil_activo = perfil_id;
      if (rol) d.rol = rol;
      escribir(d);
    },

    // ---- Progreso (tabla `progreso`) ----
    async progreso(perfil_id) { return leer().progreso.filter((p) => p.perfil_id === perfil_id); },
    async marcarRecurso(perfil_id, recurso_id, completado) {
      const d = leer(), cat = await cargar();
      const rec = cat.recursos.find((r) => r.id === recurso_id);
      const perfil = cat.perfiles.find((p) => p.id === perfil_id);
      if (!rec || !perfil) throw new Error('Recurso o participante no válido');
      d.progreso = d.progreso.filter((p) => !(p.perfil_id === perfil_id && p.recurso_id === recurso_id));
      if (completado) d.progreso.push({ perfil_id, recurso_id, empresa_id: perfil.empresa_id, completado_en: ahora(), minutos: rec.duracion_min });
      escribir(d);
    },

    // ---- Autodiagnóstico (módulo b, solo lectura) ----
    async ultimoDiagnostico() {
      try {
        const l = JSON.parse(localStorage.getItem(CLAVE_DIAG) || '[]');
        return Array.isArray(l) && l.length ? l[l.length - 1] : null;
      } catch (e) { return null; }
    },

    // ---- Mentorías (tabla `mentorias`) ----
    async mentorias() { return leer().mentorias.slice().sort((a, b) => b.creado_en.localeCompare(a.creado_en)); },
    async solicitarMentoria({ perfil_id, tema, descripcion, itinerario_id }) {
      tema = String(tema || '').trim();
      if (!tema) throw new Error('Indica el tema de la mentoría');
      const d = leer(), cat = await cargar();
      const perfil = cat.perfiles.find((p) => p.id === perfil_id);
      const m = { id: nuevoId(), empresa_id: perfil.empresa_id, perfil_id, mentor_id: null, tema, descripcion: String(descripcion || '').trim() || null,
        itinerario_id: itinerario_id || null, estado: 'solicitada', fecha: null, horas: null, asistencia: null, valoracion: null, comentario: null,
        creado_en: ahora(), historial: [{ estado: 'solicitada', en: ahora(), por: 'empresa' }] };
      d.mentorias.push(m);
      escribir(d);
      return m;
    },
    async asignarMentoria(id, { mentor_id, fecha }) {
      const d = leer(), m = mentoria(d, id);
      if (m.estado !== 'solicitada') throw new Error('Solo se asignan mentorías solicitadas');
      if (!mentor_id || !fecha) throw new Error('Elige mentor y fecha');
      m.mentor_id = mentor_id; m.fecha = new Date(fecha).toISOString();
      pasar(m, 'asignada', 'gestor');
      escribir(d);
    },
    async registrarRealizada(id, { asistencia, horas }) {
      const d = leer(), m = mentoria(d, id);
      if (m.estado !== 'asignada') throw new Error('Solo se cierran mentorías asignadas');
      const h = asistencia ? Number(horas) : 0;
      if (asistencia && !(h > 0 && h <= 24)) throw new Error('Indica las horas (entre 0,5 y 24)');
      m.asistencia = !!asistencia; m.horas = Math.round(h * 10) / 10;
      pasar(m, 'realizada', 'mentor');
      escribir(d);
    },
    async valorarMentoria(id, { valoracion, comentario }) {
      const d = leer(), m = mentoria(d, id), v = Number(valoracion);
      if (m.estado !== 'realizada' || !m.asistencia) throw new Error('Solo se valoran mentorías realizadas con asistencia');
      if (!(v >= 1 && v <= 5)) throw new Error('Elige una valoración de 1 a 5');
      m.valoracion = v; m.comentario = String(comentario || '').trim() || null;
      pasar(m, 'valorada', 'empresa');
      escribir(d);
    },
    async cancelarMentoria(id, quien) {
      const d = leer(), m = mentoria(d, id);
      if (!['solicitada', 'asignada'].includes(m.estado)) throw new Error('Esta mentoría ya no se puede cancelar');
      pasar(m, 'cancelada', quien);
      escribir(d);
    },

    async borrarTodo() { localStorage.removeItem(CLAVE); }
  };
})();
