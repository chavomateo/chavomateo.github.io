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
        <div class="pf-tags">
          ${c.ejemplo ? '<span class="pf-tag pf-ej">Ejemplo</span>' : ''}
          ${c.replicable ? '<span class="pf-tag pf-rep">Replicable</span>' : ''}
          <span class="pf-tag">${esc(c.sector)}</span>
          <span class="pf-tag">Madurez ${esc(c.madurez_minima)}+</span>
        </div>
        <h3>${esc(c.titulo)}</h3>
        <p>${esc(c.resumen)}</p>
        <div class="pf-tags">${(c.tecnologias || []).map((x) => `<span class="pf-tag">${esc(x)}</span>`).join('')}</div>
        <button type="button" data-codigo="${esc(c.codigo)}">Ver ficha</button>
      </article>`).join('') : '<p class="pf-vacio">No hay casos con esos filtros.</p>';
  }

  function ficha(codigo) {
    const c = casos.find((x) => x.codigo === codigo);
    if (!c) return;
    $('ficha-in').innerHTML = `
      <button class="pf-cerrar" type="button" aria-label="Cerrar">×</button>
      <span class="pf-estado">${esc(c.codigo)} · ${esc(c.sector)} · ${esc(c.funcion)}</span>
      <h2>${esc(c.titulo)}</h2>
      <p>${esc(c.resumen)}</p>
      <h4>El problema</h4><p>${esc(c.problema)}</p>
      <h4>La solución</h4><p>${esc(c.solucion)}</p>
      <h4>Qué necesitas</h4><p>${esc(c.requisitos)}</p>
      <h4>Coste y plazo orientativos</h4><p>${esc(c.coste_orientativo)} · ${esc(c.plazo_orientativo)}</p>
      <h4>Cómo se mide</h4><ul>${(c.kpis || []).map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
      <div class="pf-acciones">
        <button class="pf-btn" type="button" disabled title="Disponible con el área de empresa">Quiero replicarlo</button>
        <button class="pf-btn pf-sec pf-cerrar2" type="button">Volver al catálogo</button>
      </div>`;
    $('ficha').showModal();
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
    })
    .catch(() => { $('casos').innerHTML = '<p class="pf-vacio">No se ha podido cargar el catálogo.</p>'; });
})();
