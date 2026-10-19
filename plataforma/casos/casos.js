// Plataforma AlianzaIA · Módulo a: catálogo de casos de uso.
// MVP: lee /plataforma/data/casos.json. Cuando el proyecto Supabase UE esté
// activo, la fuente pasa a la tabla `casos` (solo filas publicadas) con la
// misma forma de datos.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let casos = [];

  function opciones(sel, valores) {
    [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'es')).forEach((v) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v; sel.appendChild(o);
    });
  }

  function filtrados() {
    const t = $('f-texto').value.trim().toLowerCase();
    const sector = $('f-sector').value, funcion = $('f-funcion').value;
    const madurez = Number($('f-madurez').value) || 0, rep = $('f-rep').checked;
    return casos.filter((c) =>
      (!t || [c.titulo, c.resumen, c.sector, c.funcion, ...(c.tecnologias || [])].join(' ').toLowerCase().includes(t)) &&
      (!sector || c.sector === sector) &&
      (!funcion || c.funcion === funcion) &&
      (!madurez || c.madurez_minima <= madurez) &&
      (!rep || c.replicable));
  }

  function pintar() {
    const lista = filtrados();
    $('casos').innerHTML = lista.length ? lista.map((c) => `
      <article class="pf-card">
        ${c.ejemplo || c.replicable ? `<div class="pf-tags">${c.ejemplo ? '<span class="pf-tag pf-ej">Ejemplo</span>' : ''}${c.replicable ? '<span class="pf-tag pf-rep">Replicable</span>' : ''}</div>` : ''}
        <h3>${esc(c.titulo)}</h3>
        <span class="pf-meta">${esc(c.sector)} · Madurez ${esc(c.madurez_minima)}+</span>
        <p>${esc(c.resumen)}</p>
        ${(c.tecnologias || []).length ? `<span class="pf-tecs">${(c.tecnologias || []).map(esc).join(' · ')}</span>` : ''}
        <button class="pf-ver" type="button" data-codigo="${esc(c.codigo)}" aria-label="Ver ficha: ${esc(c.titulo)}">Ver ficha →</button>
      </article>`).join('') : '<p class="pf-vacio">No hay casos con esos filtros.</p>';
  }

  function ficha(codigo) {
    const c = casos.find((x) => x.codigo === codigo);
    if (!c) return;
    $('ficha-in').innerHTML = `
      <span class="pf-estado">${esc(c.codigo)} · ${esc(c.sector)} · ${esc(c.funcion)}</span>
      <h2 id="ficha-titulo">${esc(c.titulo)}</h2>
      <p>${esc(c.resumen)}</p>
      <h4>El problema</h4><p>${esc(c.problema)}</p>
      <h4>La solución</h4><p>${esc(c.solucion)}</p>
      <h4>Qué necesitas</h4><p>${esc(c.requisitos)}</p>
      ${c.datos_necesarios ? `<h4>Datos necesarios</h4><p>${esc(c.datos_necesarios)}</p>` : ''}
      <h4>Coste, plazo y esfuerzo orientativos</h4><p>${esc(c.coste_orientativo)} · ${esc(c.plazo_orientativo)}${c.esfuerzo_interno ? ` · ${esc(c.esfuerzo_interno)} de vuestro equipo` : ''}</p>
      ${(c.fases || []).length ? `<h4>Fases</h4><ol>${c.fases.map((f) => `<li><b>${esc(f.nombre)}</b> (${esc(f.semanas)} sem.): ${esc(f.entregable)}</li>`).join('')}</ol>` : ''}
      <h4>Cómo se mide</h4><ul>${(c.kpis || []).map((k) => `<li>${esc(k.nombre || k)}</li>`).join('')}</ul>
      ${c.riesgo_ai_act === 'limitado' ? '<p class="pf-meta">Este caso interactúa con personas: hay que avisar de que responde una IA (AI Act, art. 50).</p>' : ''}
      <div class="pf-acciones">
        <button class="pf-btn" type="button" disabled title="Disponible con el área de empresa">Quiero replicarlo</button>
        <button class="pf-btn pf-sec pf-cerrar2" type="button">Volver al catálogo</button>
        <small>«Quiero replicarlo» estará disponible con el área de empresa.</small>
      </div>`;
    $('ficha').showModal();
    $('ficha').scrollTop = 0;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-codigo]');
    if (b) return ficha(b.dataset.codigo);
    if (e.target.closest('.pf-cerrar, .pf-cerrar2')) $('ficha').close();
  });
  $('ficha').addEventListener('click', (e) => { if (e.target.id === 'ficha') $('ficha').close(); });
  ['f-texto', 'f-sector', 'f-funcion', 'f-madurez', 'f-rep'].forEach((id) => $(id).addEventListener('input', pintar));

  fetch('/plataforma/data/casos.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((d) => {
      casos = d;
      opciones($('f-sector'), casos.map((c) => c.sector));
      opciones($('f-funcion'), casos.map((c) => c.funcion));
      pintar();
      if (location.hash) ficha(decodeURIComponent(location.hash.slice(1))); // enlace desde el diagnóstico
    })
    .catch(() => { $('casos').innerHTML = '<p class="pf-vacio">No se ha podido cargar el catálogo.</p>'; });
})();
