// Hub de créditos y servicios contra la base de datos real (Supabase UE). Sin dependencias.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => n == null ? '—' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const ESTADOS = { pendiente: 'Pendiente de revisión', validada: 'Validada', asignada: 'Asignada', activada: 'Activada', cerrada: 'Cerrada', rechazada: 'Rechazada' };
  const TIPOS_SERV = { formacion: 'Formación', mentoria: 'Mentoría', consultoria: 'Consultoría', prueba_concepto: 'Prueba de concepto', diagnostico: 'Diagnóstico', otro: 'Otro' };
  let cuenta = null, items = [], elegido = null;

  function aviso(t, err) { const m = $('msg'); m.textContent = t; m.hidden = !t; m.classList.toggle('pf-error', !!err); if (t) m.scrollIntoView({ block: 'nearest' }); }

  async function cargar() {
    const u = await SB.usuario();
    if (!u) { $('v-sin-sesion').hidden = false; return; }
    cuenta = await SB.rpc('mi_cuenta');
    if (!cuenta.empresa) { $('v-sin-sesion').hidden = false; return; }
    $('v-main').hidden = false;
    $('u-empresa').textContent = cuenta.empresa.razon_social;
    const val = cuenta.empresa.estado === 'validada';
    $('u-estado').textContent = val ? 'Empresa validada: puedes solicitar' : 'Tu empresa está pendiente de validación por AES; podrás solicitar cuando esté validada';
    const [progs, servs] = await Promise.all([
      SB.leer('programas_credito', 'select=id,nombre_publico,tipo,modo_activacion,elegibilidad,importe_max_eur,caducidad_meses,verificado&order=nombre_publico'),
      SB.leer('servicios_oferta', 'select=id,aportante_publico,tipo,concepto,descripcion,importe_eur,plazas,modalidad&publicado=eq.true&order=concepto')
    ]);
    items = [
      ...progs.map((p) => ({ clase: 'programa', id: p.id, titulo: p.nombre_publico, etq: p.tipo === 'cloud' ? 'Créditos cloud' : 'Créditos de modelos de IA',
        texto: [p.elegibilidad, p.importe_max_eur ? 'Hasta ' + eur(p.importe_max_eur) : '', p.caducidad_meses ? `Caducan a los ${p.caducidad_meses} meses` : ''].filter(Boolean).join(' · '), verificado: p.verificado })),
      ...servs.map((s) => ({ clase: 'servicio', id: s.id, titulo: s.concepto, etq: TIPOS_SERV[s.tipo] + ' · ' + s.aportante_publico,
        texto: [s.descripcion, s.modalidad, `Valor ${eur(s.importe_eur)} por empresa`, `${s.plazas} plazas`].filter(Boolean).join(' · '), verificado: true }))
    ];
    $('catalogo').innerHTML = items.length ? items.map((it, i) => `<div class="pf-mod"><span class="pf-etq">${esc(it.etq)}</span><h3>${esc(it.titulo)}</h3><p>${esc(it.texto)}</p>${it.verificado ? '' : '<p class="pf-ayuda">Condiciones pendientes de verificar con el socio.</p>'}<button class="pf-btn" type="button" data-sol="${i}" ${val ? '' : 'disabled'}>Solicitar</button></div>`).join('')
      : '<div class="pf-tarjeta"><p>El catálogo se está cargando con las aportaciones de los socios tecnológicos. Vuelve pronto.</p></div>';
    await misSolicitudes();
  }

  async function misSolicitudes() {
    const s = await SB.leer('solicitudes_credito', 'select=id,programa_id,servicio_id,necesidad,consumo_estimado_eur,estado,motivo_estado,creado_en&order=creado_en.desc');
    const nombre = (r) => (items.find((it) => it.id === (r.programa_id || r.servicio_id)) || {}).titulo || 'Programa o servicio';
    $('mis-sol').innerHTML = s.length ? `<div class="pf-tabla"><table><thead><tr><th>Fecha</th><th>Qué</th><th>Estado</th><th>Necesidad</th></tr></thead><tbody>${s.map((r) => `<tr><td>${esc(new Date(r.creado_en).toLocaleDateString('es-ES'))}</td><td>${esc(nombre(r))}</td><td>${esc(ESTADOS[r.estado] || r.estado)}${r.motivo_estado ? '<br><span class="pf-ayuda">' + esc(r.motivo_estado) + '</span>' : ''}</td><td>${esc(r.necesidad)}</td></tr>`).join('')}</tbody></table></div>` : '<p>Aún no has enviado ninguna solicitud.</p>';
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sol]'); if (!b) return;
    elegido = items[+b.dataset.sol];
    $('s-titulo').textContent = 'Solicitar: ' + elegido.titulo;
    $('s-consumo-l').hidden = elegido.clase !== 'programa';
    $('f-sol').hidden = false; $('s-necesidad').focus();
  });
  $('s-cancelar').addEventListener('click', () => { $('f-sol').hidden = true; elegido = null; });
  $('f-sol').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nec = $('s-necesidad').value.trim();
    if (nec.length < 20) return aviso('Cuéntanos un poco más para qué lo necesitas (al menos 20 caracteres).', true);
    const fila = { empresa_id: cuenta.empresa.id, necesidad: nec, estado: 'pendiente' };
    if (elegido.clase === 'programa') { fila.programa_id = elegido.id; const c = $('s-consumo').value; if (c) fila.consumo_estimado_eur = Number(c); } else fila.servicio_id = elegido.id;
    $('s-btn').disabled = true;
    try { await SB.insertar('solicitudes_credito', fila); aviso('Solicitud enviada. AES la revisará y te escribirá.'); $('f-sol').hidden = true; $('f-sol').reset(); await misSolicitudes(); }
    catch (e) { aviso(/row-level security/i.test(e.message) ? 'Tu empresa aún no está validada por AES.' : e.message, true); }
    $('s-btn').disabled = false;
  });

  cargar().catch((e) => aviso(e.message, true));
})();
