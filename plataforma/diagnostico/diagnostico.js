// Plataforma AlianzaIA · Módulo b: autodiagnóstico de madurez en IA.
// MVP: lee /plataforma/data/cuestionario.json y calcula la puntuación en el
// navegador. El resultado se guarda en localStorage; cuando el proyecto
// Supabase UE esté activo, se guarda en `diagnosticos` y `respuestas`
// (el primero de cada empresa con es_linea_base = true, el T0 de impacto).
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLAVE = 'alianzaia_diagnosticos';
  const PERFIL = [
    { id: 'P.sector', texto: 'Sector principal', tipo: 'select', opciones: ['Agroalimentario', 'Industria y fabricación', 'Construcción', 'Comercio y distribución', 'Turismo y hostelería', 'Transporte y logística', 'Tecnología y comunicaciones', 'Servicios profesionales', 'Salud y servicios sociales', 'Educación', 'Energía y medio ambiente', 'Otro'] },
    { id: 'P.cnae', texto: 'CNAE (opcional)', tipo: 'texto', opcional: true },
    { id: 'P.empleados', texto: 'Número de empleados', tipo: 'select', opciones: ['1-9', '10-49', '50-249', '250 o más'] },
    { id: 'P.facturacion', texto: 'Facturación anual aproximada', tipo: 'select', opciones: ['Menos de 2 M€', '2-10 M€', '10-50 M€', 'Más de 50 M€'] },
    { id: 'P.ccaa', texto: 'Comunidad autónoma', tipo: 'select', opciones: ['Andalucía', 'Aragón', 'Asturias', 'Illes Balears', 'Canarias', 'Cantabria', 'Castilla-La Mancha', 'Castilla y León', 'Cataluña', 'Comunitat Valenciana', 'Extremadura', 'Galicia', 'La Rioja', 'Comunidad de Madrid', 'Región de Murcia', 'Navarra', 'País Vasco', 'Ceuta', 'Melilla'] },
    { id: 'P.provincia', texto: 'Provincia', tipo: 'texto' },
    { id: 'P.startup', texto: '¿Sois una startup?', tipo: 'select', opciones: ['Sí', 'No'] }
  ];
  const ENLACES = {
    creditos: { t: 'Créditos cloud y de IA', d: 'Puedes solicitar créditos de la bolsa común para tus primeros casos.' },
    formacion: { t: 'Formación', d: 'Itinerarios para preparar a tu equipo.' },
    consultoria: { t: 'Acompañamiento', d: 'Una sesión para ordenar datos y elegir el primer caso.' },
    legal: { t: 'Guías de RGPD y Reglamento de IA', d: 'Qué obligaciones tienes y cómo cumplirlas.' }
  };
  let Q, casos = [], paso = 0, pasos = [];
  const resp = {};

  function campoPregunta(p) {
    const n = `q-${p.id}`;
    let html = `<fieldset class="pf-preg" data-id="${esc(p.id)}"><legend><span class="pf-qid">${esc(p.id)}</span> ${esc(p.texto)}</legend>`;
    if (p.ayuda) html += `<small>${esc(p.ayuda)}</small>`;
    const ops = p.tipo === 'escala' ? Q.escala.map((e) => ({ etiqueta: `${e.puntos} · ${e.etiqueta}`, puntos: e.puntos })) : p.opciones;
    const tipo = p.tipo === 'multiple' ? 'checkbox' : 'radio';
    html += '<div class="pf-ops">' + ops.map((o, i) => {
      const marcado = p.tipo === 'multiple' ? (resp[p.id] || []).includes(i) : resp[p.id] === i;
      return `<label><input type="${tipo}" name="${n}" value="${i}"${marcado ? ' checked' : ''}> ${esc(o.etiqueta)}</label>`;
    }).join('') + '</div></fieldset>';
    return html;
  }

  function campoPerfil(p) {
    const v = resp[p.id] || '';
    if (p.tipo === 'texto') return `<label class="pf-campo">${esc(p.texto)}<input type="text" data-id="${p.id}" value="${esc(v)}"></label>`;
    return `<label class="pf-campo">${esc(p.texto)}<select data-id="${p.id}"><option value="">Elige…</option>${p.opciones.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  }

  function pintar() {
    const s = pasos[paso];
    $('paso').textContent = `Paso ${paso + 1} de ${pasos.length} · ${s.titulo}`;
    $('barra').style.width = `${Math.round((paso / pasos.length) * 100)}%`;
    $('form').innerHTML = `<h2>${esc(s.titulo)}</h2>${s.intro ? `<p>${esc(s.intro)}</p>` : ''}` +
      (s.perfil ? `<div class="pf-perfil">${PERFIL.map(campoPerfil).join('')}</div>` : s.preguntas.map(campoPregunta).join(''));
    $('atras').disabled = paso === 0;
    $('siguiente').textContent = paso === pasos.length - 1 ? 'Ver mi resultado' : 'Siguiente';
    window.scrollTo({ top: $('paso').offsetTop - 24, behavior: 'smooth' });
  }

  function leerPaso() {
    const s = pasos[paso];
    let falta = null;
    if (s.perfil) {
      PERFIL.forEach((p) => {
        const el = $('form').querySelector(`[data-id="${p.id}"]`);
        resp[p.id] = el.value.trim();
        if (!p.opcional && !resp[p.id] && !falta) falta = el;
      });
    } else {
      s.preguntas.forEach((p) => {
        const marcados = [...$('form').querySelectorAll(`input[name="q-${p.id}"]:checked`)].map((x) => Number(x.value));
        if (p.tipo === 'multiple') resp[p.id] = marcados; // ninguna marcada = 0 puntos
        else if (marcados.length) resp[p.id] = marcados[0];
        else if (!falta) falta = $('form').querySelector(`[data-id="${p.id}"]`);
      });
    }
    $('form').querySelectorAll('.pf-falta').forEach((x) => x.classList.remove('pf-falta'));
    if (falta) { falta.classList.add('pf-falta'); falta.scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
    return true;
  }

  function puntos(p) {
    if (p.tipo === 'escala') return Q.escala[resp[p.id]].puntos;
    if (p.tipo === 'multiple') return Math.min((resp[p.id] || []).length, p.tope);
    return p.opciones[resp[p.id]].puntos;
  }

  function calcular() {
    const dims = Q.dimensiones.map((d) => {
      const num = d.preguntas.reduce((a, p) => a + p.peso * puntos(p), 0);
      const den = d.preguntas.reduce((a, p) => a + p.peso * 5, 0);
      return { id: d.id, nombre: d.nombre, peso: d.peso, nota: Math.round((num / den) * 100) };
    });
    const global = Math.round(dims.reduce((a, d) => a + d.peso * d.nota, 0));
    const nivel = Q.niveles.find((n) => global <= n.hasta) || Q.niveles[Q.niveles.length - 1];
    return { dims, global, nivel };
  }

  function recomendar(r) {
    const debiles = [...r.dims].filter((d) => d.nota < 100).sort((a, b) => a.nota - b.nota).slice(0, 2).map((d) => d.id);
    const brecha = r.dims.filter((d) => (d.id === 'D3' || d.id === 'D4') && d.nota < 40).map((d) => d.id);
    const encaje = (c) => (c.dimensiones_dmat || []).filter((x) => debiles.includes(x)).length;
    const hoja = { '3m': [], '6m': [], '12m': [] };
    casos.forEach((c) => {
      const necesitaBrecha = (c.dimensiones_dmat || []).some((x) => brecha.includes(x));
      if (c.madurez_minima <= r.nivel.nivel && !necesitaBrecha) hoja['3m'].push(c);
      else if (c.madurez_minima === r.nivel.nivel + 1 && !necesitaBrecha) hoja['6m'].push(c);
      else hoja['12m'].push(c);
    });
    Object.values(hoja).forEach((l) => l.sort((a, b) => encaje(b) - encaje(a)));
    return { debiles, hoja };
  }

  function guardar(r) {
    const previos = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    const reg = { version_cuestionario: Q.version, fecha: new Date().toISOString(), es_linea_base: previos.length === 0,
      puntuaciones: Object.fromEntries(r.dims.map((d) => [d.id.toLowerCase(), d.nota])), global: r.global, nivel_global: r.nivel.nivel, respuestas: { ...resp } };
    previos.push(reg);
    localStorage.setItem(CLAVE, JSON.stringify(previos));
    return { reg, base: previos[0] };
  }

  function resultado() {
    const r = calcular(), rec = recomendar(r), { reg, base } = guardar(r);
    const frenos = (resp.X1 || []).map((i) => Q.aparte[0].opciones[i].enlace).filter(Boolean);
    const conoceCreditos = resp.X2 !== undefined ? Q.aparte[1].opciones[resp.X2].etiqueta : null;
    const lista = (l) => l.length ? `<ul>${l.map((c) => `<li><a href="/plataforma/casos/#${esc(c.codigo)}">${esc(c.titulo)}</a> <span class="pf-tag">Madurez ${esc(c.madurez_minima)}+</span></li>`).join('')}</ul>` : '<p class="pf-vacio">Ningún caso del catálogo en este horizonte.</p>';
    $('form').hidden = true; document.querySelector('.pf-nav').hidden = true; $('paso').hidden = true; $('barra').style.width = '100%';
    $('resultado').hidden = false;
    $('resultado').innerHTML = `
      <div class="pf-res-cab">
        <div class="pf-nota"><strong>${r.global}</strong><span>/100</span></div>
        <div><span class="pf-eyebrow pf-oscuro">Tu nivel</span><h2>Nivel ${r.nivel.nivel} · ${esc(r.nivel.nombre)}</h2>
        <p>${reg.es_linea_base ? 'Este es tu primer diagnóstico: queda guardado como punto de partida para medir tu evolución.' : `Punto de partida: ${base.global}/100 (${new Date(base.fecha).toLocaleDateString('es-ES')}). Diferencia: ${r.global - base.global >= 0 ? '+' : ''}${r.global - base.global}.`}</p></div>
      </div>
      <h3>Por dimensión</h3>
      <div class="pf-dims">${r.dims.map((d) => `<div class="pf-dim${rec.debiles.includes(d.id) ? ' pf-debil' : ''}"><span>${esc(d.id)} · ${esc(d.nombre)}</span><div class="pf-dim-barra"><div style="width:${d.nota}%"></div></div><b>${d.nota}</b></div>`).join('')}</div>
      <p class="pf-nota-pie">Marcadas en naranja, las dos dimensiones donde más margen de mejora tienes. Las recomendaciones empiezan por los casos que las refuerzan.</p>
      <h3>Tu hoja de ruta</h3>
      <div class="pf-hoja">
        <div><h4>A 3 meses</h4>${lista(rec.hoja['3m'])}</div>
        <div><h4>A 6 meses</h4>${lista(rec.hoja['6m'])}</div>
        <div><h4>A 12 meses</h4>${lista(rec.hoja['12m'])}</div>
      </div>
      ${frenos.length ? `<h3>Para lo que os frena</h3><div class="pf-modulos">${[...new Set(frenos)].map((k) => `<div class="pf-mod pf-pronto"><h3>${esc(ENLACES[k].t)}</h3><p>${esc(ENLACES[k].d)}</p><span class="pf-estado">Próximamente</span></div>`).join('')}</div>` : ''}
      ${conoceCreditos === 'Sí' ? '<p class="pf-nota-pie">Ya habéis usado un programa de créditos: algunos solo se conceden una vez. Lo revisaremos al tramitar vuestra solicitud.</p>' : ''}
      <div class="pf-acciones"><button class="pf-btn" type="button" id="repetir">Repetir el diagnóstico</button><a class="pf-btn pf-sec" href="/plataforma/casos/">Ver todos los casos</a></div>`;
    $('repetir').addEventListener('click', () => { paso = 0; $('form').hidden = false; document.querySelector('.pf-nav').hidden = false; $('paso').hidden = false; $('resultado').hidden = true; pintar(); });
    window.scrollTo({ top: $('resultado').offsetTop - 24, behavior: 'smooth' });
  }

  $('siguiente').addEventListener('click', () => {
    if (!leerPaso()) return;
    if (paso < pasos.length - 1) { paso++; pintar(); } else resultado();
  });
  $('atras').addEventListener('click', () => { leerPaso(); if (paso > 0) { paso--; pintar(); } });

  Promise.all([
    fetch('/plataforma/data/cuestionario.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('/plataforma/data/casos.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => [])
  ]).then(([q, c]) => {
    Q = q; casos = c;
    pasos = [{ titulo: 'Tu empresa', intro: 'Estos datos no puntúan: sirven para ajustar las recomendaciones.', perfil: true },
      ...Q.dimensiones.map((d) => ({ titulo: `${d.id}. ${d.nombre}`, preguntas: d.preguntas })),
      { titulo: 'Para terminar', intro: 'Estas dos preguntas no puntúan: nos ayudan a orientarte.', preguntas: Q.aparte }];
    pintar();
  }).catch(() => { $('form').innerHTML = '<p class="pf-vacio">No se ha podido cargar el cuestionario.</p>'; });
})();
