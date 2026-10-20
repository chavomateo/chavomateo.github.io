// Panel de gestión de AES (rol gestor) contra Supabase UE. Las políticas RLS impiden su uso a otros roles.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (n) => n == null ? '—' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fecha = (d) => new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const tabla = (cab, filas) => filas.length ? `<div class="pf-tabla"><table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>` : '<p>No hay registros.</p>';
  function aviso(t, err) { const m = $('msg'); m.textContent = t; m.hidden = !t; m.classList.toggle('pf-error', !!err); if (t) m.scrollIntoView({ block: 'nearest' }); }
  let empresas = [], programas = [], servicios = [];

  async function inicio() {
    const u = await SB.usuario();
    if (!u) { $('f-login').hidden = false; $('v-panel').hidden = true; return; }
    const c = await SB.rpc('mi_cuenta');
    if (!c.perfil || c.perfil.rol !== 'gestor') { aviso('Este usuario no tiene rol de gestor.', true); await SB.salir(); $('f-login').hidden = false; return; }
    $('g-usuario').textContent = u.email; $('f-login').hidden = true; $('v-panel').hidden = false;
    await recargar();
  }

  async function recargar() {
    [empresas, programas, servicios] = await Promise.all([
      SB.leer('empresas', 'select=*&order=creado_en.desc'),
      SB.leer('programas_credito', 'select=*&order=nombre_publico'),
      SB.rpc('staff_servicios_oferta')
    ]);
    const sol = await SB.leer('solicitudes_credito', 'select=*&order=creado_en.desc');
    const est = { pendiente: 'Pendiente', validada: 'Validada', baja: 'Baja' };
    $('t-empresas').innerHTML = tabla(['Alta', 'Empresa', 'NIF', 'Tipo y tamaño', 'CNAE · CCAA', 'Estado', ''], empresas.map((e) => `<tr><td>${esc(fecha(e.creado_en))}</td><td>${esc(e.razon_social)}</td><td>${esc(e.nif)}</td><td>${esc(e.tipo)} · ${esc(e.tamano || '—')}</td><td>${esc(e.cnae || '—')} · ${esc(e.ccaa || '—')}</td><td><span class="pf-estado pf-est-${esc(e.estado)}">${esc(est[e.estado] || e.estado)}</span></td><td>${e.estado !== 'validada' ? `<button class="pf-btn" data-emp="${e.id}" data-est="validada">Validar</button>` : ''} ${e.estado !== 'baja' ? `<button class="pf-btn pf-sec" data-emp="${e.id}" data-est="baja">Baja</button>` : ''}</td></tr>`));
    const nomEmp = (id) => (empresas.find((e) => e.id === id) || {}).razon_social || id;
    const nomItem = (r) => r.programa_id ? (programas.find((p) => p.id === r.programa_id) || {}).nombre_publico : (servicios.find((s) => s.id === r.servicio_id) || {}).concepto;
    $('t-solicitudes').innerHTML = tabla(['Fecha', 'Empresa', 'Qué', 'Necesidad', 'Consumo est.', 'Estado', ''], sol.map((r) => `<tr><td>${esc(fecha(r.creado_en))}</td><td>${esc(nomEmp(r.empresa_id))}</td><td>${esc(nomItem(r) || '—')}</td><td>${esc(r.necesidad)}</td><td>${eur(r.consumo_estimado_eur)}</td><td>${esc(r.estado)}${r.motivo_estado ? '<br><span class="pf-ayuda">' + esc(r.motivo_estado) + '</span>' : ''}</td><td>${r.estado === 'pendiente' ? `<button class="pf-btn" data-sol="${r.id}" data-est="validada">Validar</button> <button class="pf-btn pf-sec" data-sol="${r.id}" data-est="rechazada">Rechazar</button>` : ''}</td></tr>`));
    $('t-servicios').innerHTML = tabla(['Socio (interno)', 'Público', 'Tipo', 'Concepto', 'Valor', 'Plazas', 'Publicado', ''], servicios.map((s) => `<tr><td>${esc(s.aportante_interno)}</td><td>${esc(s.aportante_publico)}</td><td>${esc(s.tipo)}</td><td>${esc(s.concepto)}</td><td>${eur(s.importe_eur)}</td><td>${esc(s.plazas)}</td><td>${s.publicado ? 'Sí' : 'No'}</td><td><button class="pf-btn pf-sec" data-serv="${s.id}" data-pub="${!s.publicado}">${s.publicado ? 'Retirar' : 'Publicar'}</button></td></tr>`));
    $('t-programas').innerHTML = tabla(['Programa', 'Tipo', 'Activación', 'Máx.', 'Caducidad', 'Verificado'], programas.map((p) => `<tr><td>${esc(p.nombre_publico)}</td><td>${esc(p.tipo)}</td><td>${esc(p.modo_activacion)}</td><td>${eur(p.importe_max_eur)}</td><td>${p.caducidad_meses ? esc(p.caducidad_meses) + ' meses' : '—'}</td><td>${p.verificado ? 'Sí' : 'Por verificar'}</td></tr>`));
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b === t)); document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; }); return; }
    const b = e.target.closest('button[data-emp],button[data-sol],button[data-serv]'); if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.emp) await SB.actualizar('empresas', 'id=eq.' + b.dataset.emp, { estado: b.dataset.est });
      if (b.dataset.sol) {
        let motivo = null;
        if (b.dataset.est === 'rechazada') { motivo = prompt('Motivo del rechazo (lo verá la empresa):'); if (!motivo) { b.disabled = false; return; } }
        await SB.actualizar('solicitudes_credito', 'id=eq.' + b.dataset.sol, { estado: b.dataset.est, motivo_estado: motivo });
      }
      if (b.dataset.serv) await SB.actualizar('servicios_oferta', 'id=eq.' + b.dataset.serv, { publicado: b.dataset.pub === 'true' }, true);
      aviso('Guardado.'); await recargar();
    } catch (err) { aviso(err.message, true); b.disabled = false; }
  });

  $('f-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await SB.entrar($('l-email').value.trim(), $('l-clave').value); $('l-clave').value = ''; aviso(''); await inicio(); } catch (e) { aviso(e.message, true); }
  });
  $('salir').addEventListener('click', async () => { await SB.salir(); location.reload(); });

  $('f-servicio').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = (id) => $(id).value.trim();
    if (!v('sv-interno') || !v('sv-publico') || !v('sv-concepto') || !(+v('sv-importe') > 0) || v('sv-plazas') === '') return aviso('Rellena socio, nombre público, concepto, valor y plazas.', true);
    try {
      await SB.insertar('servicios_oferta', { aportante_interno: v('sv-interno'), aportante_publico: v('sv-publico'), tipo: v('sv-tipo'), concepto: v('sv-concepto'), descripcion: v('sv-desc') || null, importe_eur: +v('sv-importe'), plazas: +v('sv-plazas'), modalidad: v('sv-modalidad') || null, publicado: $('sv-publicado').checked }, true);
      ev.target.reset(); aviso('Servicio guardado.'); await recargar();
    } catch (e) { aviso(e.message, true); }
  });

  $('f-programa').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = (id) => $(id).value.trim();
    if (!v('pr-interno') || !v('pr-publico') || !v('pr-nombre')) return aviso('Rellena proveedor, nombre público y nombre del programa.', true);
    try {
      const provs = await SB.rpc('staff_proveedores');
      let prov = provs.find((p) => p.nombre_interno.toLowerCase() === v('pr-interno').toLowerCase());
      if (!prov) { prov = { id: crypto.randomUUID() }; await SB.insertar('proveedores', { id: prov.id, nombre_interno: v('pr-interno'), nombre_publico: v('pr-publico'), tipo: v('pr-tipo') === 'cloud' ? 'cloud' : 'modelos_ia' }, true); }
      await SB.insertar('programas_credito', { proveedor_id: prov.id, nombre_publico: v('pr-nombre'), tipo: v('pr-tipo'), modo_activacion: v('pr-modo'), elegibilidad: v('pr-eleg') || null, importe_max_eur: v('pr-max') ? +v('pr-max') : null, caducidad_meses: v('pr-cad') ? +v('pr-cad') : null, fuente_info: v('pr-fuente') || null, fecha_info: new Date().toISOString().slice(0, 10), verificado: $('pr-verif').checked });
      ev.target.reset(); aviso('Programa guardado.'); await recargar();
    } catch (e) { aviso(e.message, true); }
  });

  inicio().catch((e) => aviso(e.message, true));
})();
