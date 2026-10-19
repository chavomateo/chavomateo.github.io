// Plataforma AlianzaIA · Módulo d: aula, progreso, recomendación, blueprints y mentorías.
// Toda lectura y escritura pasa por `Datos` (formacion/datos.js).
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MARGEN = 10; // mismo criterio de «Prioridad» que el autodiagnóstico (diagnostico.js)
  const TIPOS = { video: 'Vídeo', documento: 'Documento', ejercicio: 'Ejercicio', blueprint: 'Blueprint', webinar: 'Webinar' };
  const ESTADO_TXT = { solicitada: 'Solicitada', asignada: 'Asignada', realizada: 'Realizada', valorada: 'Valorada', cancelada: 'Cancelada' };
  const PASOS = ['solicitada', 'asignada', 'realizada', 'valorada'];
  const horas = (min) => (Math.round(min / 6) / 10).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' h';
  const fecha = (iso, conHora) => iso ? new Date(iso).toLocaleString('es-ES', conHora
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  let C, Q, ses, abiertos = new Set();
  const dimNombre = (id) => (Q.dimensiones.find((d) => d.id === id) || {}).nombre || id;
  const recurso = (id) => C.recursos.find((r) => r.id === id);

  function estadoIt(it, hechos) {
    const recs = it.recursos.map(recurso).filter(Boolean);
    const total = recs.reduce((a, r) => a + r.duracion_min, 0);
    const hechosIt = recs.filter((r) => hechos.has(r.id));
    const min = hechosIt.reduce((a, r) => a + (hechos.get(r.id) ?? r.duracion_min), 0);
    return { recs, total, min, n: hechosIt.length, pct: recs.length ? Math.round((hechosIt.length / recs.length) * 100) : 0 };
  }

  // ---------- Recomendación según el autodiagnóstico ----------
  async function recomendar() {
    const diag = await Datos.ultimoDiagnostico();
    const box = $('recomendacion');
    if (!diag || !diag.puntuaciones) {
      box.innerHTML = `<h2 id="reco-titulo">Recomendado para ti</h2>
        <p>Haz el autodiagnóstico y te diremos por qué itinerario empezar según tus dimensiones prioritarias.</p>
        <a class="pf-btn" href="/plataforma/diagnostico/">Hacer el autodiagnóstico</a>`;
      return [];
    }
    const dims = Object.entries(diag.puntuaciones).map(([k, nota]) => ({ id: k.toUpperCase(), nota }));
    const prioridad = dims.filter((d) => d.nota <= diag.global - MARGEN).sort((a, b) => a.nota - b.nota).slice(0, 2).map((d) => d.id);
    const nivel = diag.nivel_global || 1;
    const frenoPersonal = ((diag.respuestas || {}).X1 || []).some((i) => ((Q.aparte[0] || {}).opciones || [])[i]?.codigo === 'personal');
    const encaje = (it) => it.dimensiones.filter((x) => prioridad.includes(x)).length * 10
      + it.recursos.map(recurso).filter((r) => r && prioridad.includes(r.dimension)).length
      + (it.nivel <= nivel + 1 ? 2 : 0);
    let elegidos;
    if (prioridad.length) {
      elegidos = C.itinerarios.filter((it) => it.dimensiones.some((x) => prioridad.includes(x)))
        .sort((a, b) => encaje(b) - encaje(a)).slice(0, 2);
    } else {
      // Perfil homogéneo: sin «Prioridad», se propone lo que encaja con el nivel global.
      elegidos = C.itinerarios.filter((it) => it.nivel <= nivel).sort((a, b) => b.nivel - a.nivel).slice(0, 1);
      if (!elegidos.length) elegidos = [C.itinerarios[0]];
    }
    const motivo = (it) => {
      const d = it.dimensiones.filter((x) => prioridad.includes(x));
      return d.length ? `Refuerza ${d.map((x) => `${x} · ${dimNombre(x)}`).join(' y ')} (Prioridad)` : `Encaja con tu nivel ${nivel}`;
    };
    box.innerHTML = `<h2 id="reco-titulo">Recomendado para ti</h2>
      <p>Según tu autodiagnóstico del ${esc(fecha(diag.fecha))} (nivel ${esc(nivel)}, media ${esc(diag.global)}).
      ${prioridad.length ? `Tus dimensiones con la etiqueta «Prioridad»: ${prioridad.map((x) => `<b>${esc(x)} · ${esc(dimNombre(x))}</b>`).join(' y ')}.` : 'Tu perfil es homogéneo: ninguna dimensión queda claramente por debajo de tu media.'}
      ${frenoPersonal ? ' Además, indicaste que os frena la falta de personal preparado.' : ''}</p>
      <ul class="pf-fm-reco-l">${elegidos.map((it) => `<li><a href="#it-${esc(it.id)}" data-abrir="${esc(it.id)}"><b>${esc(it.titulo)}</b></a><span class="pf-meta">${esc(motivo(it))}</span></li>`).join('')}</ul>`;
    return elegidos.map((it) => it.id);
  }

  // ---------- Aula ----------
  async function pintarAula(recomendados) {
    const hechos = new Map((await Datos.progreso(ses.perfil.id)).map((p) => [p.recurso_id, p.minutos]));
    $('fm-itinerarios').innerHTML = C.itinerarios.map((it) => {
      const e = estadoIt(it, hechos);
      return `<article class="pf-fm-it" id="it-${esc(it.id)}">
        <div class="pf-tags">${recomendados.includes(it.id) ? '<span class="pf-tag pf-rep">Recomendado para ti</span>' : ''}${e.pct === 100 ? '<span class="pf-tag">Completado</span>' : ''}</div>
        <h3>${esc(it.titulo)}</h3>
        <span class="pf-meta">Nivel ${esc(it.nivel)} · ${esc(horas(e.total))} · ${it.dimensiones.map((d) => `${esc(d)} ${esc(dimNombre(d))}`).join(' · ')}</span>
        <p>${esc(it.descripcion)}</p>
        <div class="pf-fm-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${e.pct}" aria-label="Progreso en ${esc(it.titulo)}"><div style="width:${e.pct}%"></div></div>
        <span class="pf-fm-pct"><b>${e.pct} %</b> · ${e.n} de ${e.recs.length} recursos · ${esc(horas(e.min))} de ${esc(horas(e.total))}</span>
        ${e.pct === 100 ? `<a class="pf-btn pf-sec" href="/plataforma/formacion/certificado.html?it=${encodeURIComponent(it.id)}&p=${encodeURIComponent(ses.perfil.id)}">Ver certificado</a>` : ''}
        <details data-it="${esc(it.id)}"${abiertos.has(it.id) ? ' open' : ''}><summary>Ver los ${e.recs.length} recursos</summary>
          <ol class="pf-fm-recs">${e.recs.map((r) => {
            const ok = hechos.has(r.id);
            return `<li class="${ok ? 'pf-hecho' : ''}">
              <div><span class="pf-tag">${esc(TIPOS[r.tipo] || r.tipo)}</span> <b>${esc(r.titulo)}</b></div>
              <p>${esc(r.descripcion)}</p>
              <span class="pf-meta">${r.duracion_min} min · Nivel ${esc(r.nivel)} · ${esc(r.dimension)} ${esc(dimNombre(r.dimension))}</span>
              <div class="pf-fm-acc">${r.url ? '' : '<span class="pf-fm-marcador">Contenido pendiente de carga</span>'}
                <button class="pf-btn ${ok ? 'pf-sec' : ''}" type="button" data-recurso="${esc(r.id)}" aria-pressed="${ok}">${ok ? 'Completado ✓ · Desmarcar' : 'Marcar como completado'}</button></div>
            </li>`;
          }).join('')}</ol>
        </details>
      </article>`;
    }).join('');
  }

  // ---------- Mi progreso ----------
  async function pintarProgreso() {
    const prog = await Datos.progreso(ses.perfil.id), hechos = new Map(prog.map((p) => [p.recurso_id, p.minutos]));
    const min = prog.reduce((a, p) => a + (p.minutos || 0), 0);
    const ms = (await Datos.mentorias()).filter((m) => m.perfil_id === ses.perfil.id && m.asistencia);
    const hMen = ms.reduce((a, m) => a + (m.horas || 0), 0);
    const filas = C.itinerarios.map((it) => ({ it, e: estadoIt(it, hechos) }));
    const completos = filas.filter((f) => f.e.pct === 100).length;
    $('fm-progreso').innerHTML = `
      <p>Progreso de <b>${esc(ses.perfil.nombre)}</b> (${esc(ses.perfil.cargo)}).</p>
      <div class="pf-fm-kpis">
        <div><strong>${esc(horas(min))}</strong><span>de formación</span></div>
        <div><strong>${hMen.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h</strong><span>de mentoría</span></div>
        <div><strong>${prog.length} / ${C.recursos.length}</strong><span>recursos completados</span></div>
        <div><strong>${completos} / ${C.itinerarios.length}</strong><span>itinerarios completados</span></div>
      </div>
      <div class="pf-fm-tabla"><table>
        <caption class="pf-oculto">Progreso por itinerario</caption>
        <thead><tr><th scope="col">Itinerario</th><th scope="col">Avance</th><th scope="col">Horas</th><th scope="col">Certificado</th></tr></thead>
        <tbody>${filas.map(({ it, e }) => `<tr><th scope="row">${esc(it.titulo)}</th><td>${e.pct} %</td><td>${esc(horas(e.min))} de ${esc(horas(e.total))}</td>
          <td>${e.pct === 100 ? `<a href="/plataforma/formacion/certificado.html?it=${encodeURIComponent(it.id)}&p=${encodeURIComponent(ses.perfil.id)}">Ver e imprimir</a>` : 'Pendiente'}</td></tr>`).join('')}</tbody>
      </table></div>`;
  }

  // ---------- Blueprints ----------
  async function pintarBlueprints() {
    const casos = await Datos.casos();
    $('fm-blueprints').innerHTML = C.blueprints.map((b) => {
      const c = casos.find((x) => x.codigo === b.caso_codigo);
      return `<article class="pf-card pf-fm-bp">
        <div class="pf-tags"><span class="pf-tag">Blueprint</span>${c && c.ejemplo ? '<span class="pf-tag pf-ej">Ejemplo</span>' : ''}</div>
        <h3>${esc(b.titulo)}</h3>
        <span class="pf-meta">Madurez ${esc(b.nivel)}+ · ${b.dimensiones.map(esc).join(' · ')}</span>
        <p>${esc(b.descripcion)}</p>
        <span class="pf-tecs">${b.componentes.map(esc).join(' · ')}</span>
        ${b.url ? '' : '<span class="pf-fm-marcador">Documento técnico pendiente de carga</span>'}
        ${c ? `<a class="pf-fm-caso" href="/plataforma/casos/#${encodeURIComponent(c.codigo)}">Caso de uso: ${esc(c.titulo)} →</a>` : '<span class="pf-meta">Caso de uso pendiente de publicar</span>'}
      </article>`;
    }).join('');
  }

  // ---------- Mentorías ----------
  async function pintarMentorias() {
    const lista = await Datos.mentorias(), mentores = C.mentores;
    const nombreMentor = (id) => (mentores.find((m) => m.id === id) || {}).nombre || '';
    const nombrePerfil = (id) => (C.perfiles.find((p) => p.id === id) || {}).nombre || '';
    const rol = ses.rol;
    $('fm-solicitud').hidden = rol !== 'empresa';
    const acciones = (m) => {
      if (rol === 'gestor' && m.estado === 'solicitada') return `
        <form class="pf-fm-accion" novalidate data-accion="asignar" data-id="${esc(m.id)}">
          <label class="pf-campo">Mentor<select name="mentor_id" required><option value="">Elige…</option>${mentores.map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)} · ${esc(x.especialidad)}</option>`).join('')}</select></label>
          <label class="pf-campo">Fecha y hora<input name="fecha" type="datetime-local" required></label>
          <button class="pf-btn" type="submit">Asignar</button><button class="pf-btn pf-sec" type="button" data-cancelar="${esc(m.id)}">Cancelar</button>
        </form>`;
      if (rol === 'mentor' && m.estado === 'asignada') return `
        <form class="pf-fm-accion" novalidate data-accion="realizar" data-id="${esc(m.id)}">
          <fieldset class="pf-campo pf-fm-radio"><legend>¿Asistió la empresa?</legend>
            <label><input type="radio" name="asistencia" value="si" required> Sí</label><label><input type="radio" name="asistencia" value="no"> No</label></fieldset>
          <label class="pf-campo">Horas<input name="horas" type="number" min="0.5" max="24" step="0.5" value="1"></label>
          <button class="pf-btn" type="submit">Registrar sesión</button>
        </form>`;
      if (rol === 'empresa' && m.estado === 'realizada' && m.asistencia) return `
        <form class="pf-fm-accion" novalidate data-accion="valorar" data-id="${esc(m.id)}">
          <fieldset class="pf-campo pf-fm-radio pf-fm-estrellas"><legend>Valoración (1 = mala, 5 = excelente)</legend>
            ${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="valoracion" value="${v}" required> ${v}</label>`).join('')}</fieldset>
          <label class="pf-campo">Comentario (opcional)<input name="comentario" type="text" maxlength="300"></label>
          <button class="pf-btn" type="submit">Enviar valoración</button>
        </form>`;
      if (rol === 'empresa' && ['solicitada', 'asignada'].includes(m.estado)) return `<div class="pf-fm-accion"><button class="pf-btn pf-sec" type="button" data-cancelar="${esc(m.id)}">Cancelar la solicitud</button></div>`;
      const pendiente = { solicitada: 'el gestor de la Alianza asigne mentor', asignada: 'el mentor registre la sesión', realizada: m.asistencia ? 'la empresa valore la mentoría' : '' }[m.estado];
      return pendiente ? `<p class="pf-meta">Pendiente de que ${esc(pendiente)}. Cambia «Ver como» para continuar.</p>` : '';
    };
    $('fm-mentorias').innerHTML = lista.length ? `<h3>Solicitudes</h3>` + lista.map((m) => {
      const idx = PASOS.indexOf(m.estado);
      return `<article class="pf-fm-men" aria-labelledby="men-${esc(m.id)}">
        <div class="pf-fm-men-cab"><h4 id="men-${esc(m.id)}">${esc(m.tema)}</h4><span class="pf-estado pf-fm-e-${esc(m.estado)}">${esc(ESTADO_TXT[m.estado])}</span></div>
        ${m.estado === 'cancelada' ? '' : `<ol class="pf-fm-pasos" aria-label="Estado de la mentoría">${PASOS.map((p, i) => `<li class="${i <= idx ? 'pf-ok' : ''}"${i === idx ? ' aria-current="step"' : ''}>${ESTADO_TXT[p]}</li>`).join('')}</ol>`}
        ${m.descripcion ? `<p>${esc(m.descripcion)}</p>` : ''}
        <dl class="pf-fm-dl">
          <dt>Solicitada</dt><dd>${esc(fecha(m.creado_en))} por ${esc(nombrePerfil(m.perfil_id))}</dd>
          ${m.itinerario_id ? `<dt>Itinerario</dt><dd>${esc((C.itinerarios.find((i) => i.id === m.itinerario_id) || {}).titulo)}</dd>` : ''}
          ${m.mentor_id ? `<dt>Mentor</dt><dd>${esc(nombreMentor(m.mentor_id))}</dd><dt>Fecha</dt><dd>${esc(fecha(m.fecha, true))}</dd>` : ''}
          ${m.asistencia !== null ? `<dt>Asistencia</dt><dd>${m.asistencia ? 'Sí' : 'No'}</dd><dt>Horas</dt><dd>${m.horas.toLocaleString('es-ES')} h</dd>` : ''}
          ${m.valoracion ? `<dt>Valoración</dt><dd><span aria-hidden="true">${'★'.repeat(m.valoracion)}${'☆'.repeat(5 - m.valoracion)}</span> ${m.valoracion} de 5${m.comentario ? ` · «${esc(m.comentario)}»` : ''}</dd>` : ''}
        </dl>
        ${acciones(m)}
      </article>`;
    }).join('') : '<p class="pf-vacio">Todavía no hay mentorías solicitadas.</p>';
  }

  async function todo() {
    ses = await Datos.sesion();
    const reco = await recomendar();
    await Promise.all([pintarAula(reco), pintarProgreso(), pintarMentorias()]);
  }

  function aviso(txt) {
    $('fm-estado').textContent = txt;
    $('fm-estado').hidden = false;
  }

  // ---------- Eventos ----------
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-recurso]');
    if (b) {
      const id = b.dataset.recurso, completar = b.getAttribute('aria-pressed') !== 'true';
      await Datos.marcarRecurso(ses.perfil.id, id, completar);
      await todo();
      const nb = document.querySelector(`button[data-recurso="${id}"]`);
      if (nb) nb.focus();
      aviso(completar ? 'Recurso marcado como completado.' : 'Recurso desmarcado.');
      return;
    }
    const c = e.target.closest('button[data-cancelar]');
    if (c) {
      if (!confirm('¿Cancelar esta mentoría?')) return;
      await Datos.cancelarMentoria(c.dataset.cancelar, ses.rol);
      await pintarMentorias();
      aviso('Mentoría cancelada.');
      return;
    }
    const a = e.target.closest('a[data-abrir]');
    if (a) { abiertos.add(a.dataset.abrir); const d = document.querySelector(`details[data-it="${a.dataset.abrir}"]`); if (d) d.open = true; }
  });
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.matches && d.matches('details[data-it]')) d.open ? abiertos.add(d.dataset.it) : abiertos.delete(d.dataset.it);
  }, true);

  document.addEventListener('submit', async (e) => {
    const f = e.target;
    e.preventDefault();
    try {
      if (f.id === 'fm-solicitud') {
        $('fm-sol-error').hidden = true;
        await Datos.solicitarMentoria({ perfil_id: ses.perfil.id, tema: $('fm-tema').value, descripcion: $('fm-desc').value, itinerario_id: $('fm-it-rel').value });
        f.reset();
        await pintarMentorias();
        aviso('Solicitud de mentoría enviada. Queda en estado «Solicitada» hasta que el gestor asigne mentor.');
        return;
      }
      const fd = new FormData(f), id = f.dataset.id;
      if (f.dataset.accion === 'asignar') { await Datos.asignarMentoria(id, { mentor_id: fd.get('mentor_id'), fecha: fd.get('fecha') }); aviso('Mentor asignado.'); }
      else if (f.dataset.accion === 'realizar') {
        if (!fd.get('asistencia')) throw new Error('Indica si asistió la empresa');
        await Datos.registrarRealizada(id, { asistencia: fd.get('asistencia') === 'si', horas: fd.get('horas') }); aviso('Sesión registrada.');
      } else if (f.dataset.accion === 'valorar') { await Datos.valorarMentoria(id, { valoracion: fd.get('valoracion'), comentario: fd.get('comentario') }); aviso('Gracias por tu valoración.'); }
      await Promise.all([pintarMentorias(), pintarProgreso()]);
    } catch (err) {
      if (f.id === 'fm-solicitud') { $('fm-sol-error').textContent = err.message; $('fm-sol-error').hidden = false; $('fm-tema').focus(); }
      else { let p = f.querySelector('.pf-fm-error'); if (!p) { p = document.createElement('p'); p.className = 'pf-fm-error'; p.setAttribute('role', 'alert'); f.appendChild(p); } p.textContent = err.message; }
    }
  });

  $('fm-perfil').addEventListener('change', async (e) => { await Datos.fijarSesion({ perfil_id: e.target.value }); await todo(); });
  $('fm-rol').addEventListener('change', async (e) => { await Datos.fijarSesion({ rol: e.target.value }); ses = await Datos.sesion(); await pintarMentorias(); });
  $('fm-borrar').addEventListener('click', async () => {
    if (!confirm('Se borrarán de este navegador el progreso y las mentorías de demostración. El autodiagnóstico no se toca. ¿Continuar?')) return;
    await Datos.borrarTodo();
    await todo();
    $('fm-perfil').value = ses.perfil.id; $('fm-rol').value = ses.rol;
    aviso('Datos de demostración borrados.');
  });

  (async () => {
    try {
      [C, Q] = await Promise.all([Datos.catalogo(), Datos.cuestionario()]);
      ses = await Datos.sesion();
      $('fm-perfil').innerHTML = C.perfiles.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)} · ${esc(p.cargo)}</option>`).join('');
      $('fm-perfil').value = ses.perfil.id; $('fm-rol').value = ses.rol;
      $('fm-it-rel').insertAdjacentHTML('beforeend', C.itinerarios.map((it) => `<option value="${esc(it.id)}">${esc(it.titulo)}</option>`).join(''));
      await Promise.all([todo(), pintarBlueprints()]);
      if (location.hash && document.querySelector(location.hash)) document.querySelector(location.hash).scrollIntoView();
    } catch (err) {
      $('fm-itinerarios').innerHTML = '<p class="pf-vacio">No se ha podido cargar la formación.</p>';
    }
  })();
})();
