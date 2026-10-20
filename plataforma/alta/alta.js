// Alta real de empresas en la Plataforma AlianzaIA (Supabase UE). Sin dependencias.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CCAA = ['Andalucía', 'Aragón', 'Asturias', 'Illes Balears', 'Canarias', 'Cantabria', 'Castilla-La Mancha', 'Castilla y León', 'Cataluña', 'Comunitat Valenciana', 'Extremadura', 'Galicia', 'La Rioja', 'Comunidad de Madrid', 'Región de Murcia', 'Navarra', 'País Vasco', 'Ceuta', 'Melilla'];
  const VERSION = '1.0';
  const ESTADOS = {
    pendiente: ['Pendiente de validación', 'AES revisará los datos de tu empresa y te escribirá. Mientras tanto ya puedes hacer el autodiagnóstico y ver los casos de uso.'],
    validada: ['Validada', 'Tu empresa ya puede solicitar créditos y servicios.'],
    baja: ['De baja', 'Si crees que es un error, escribe a legal@asociacionstartups.es.']
  };
  let modo = 'nueva';

  // NIF / NIE / CIF con dígito de control (mismo algoritmo que el módulo e)
  const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE';
  function nifValido(entrada) {
    const v = String(entrada || '').toUpperCase().replace(/[\s.\-]/g, '');
    if (/^\d{8}[A-Z]$/.test(v)) return LETRAS[Number(v.slice(0, 8)) % 23] === v[8];
    if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return LETRAS[Number('XYZ'.indexOf(v[0]) + v.slice(1, 8)) % 23] === v[8];
    if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
      let s = 0;
      for (let i = 0; i < 7; i++) { const n = Number(v[i + 1]); if (i % 2 === 0) { const x = n * 2; s += Math.floor(x / 10) + (x % 10); } else s += n; }
      const c = (10 - (s % 10)) % 10, l = 'JABCDEFGHI'[c], k = v[8];
      if ('PQRSNW'.includes(v[0])) return k === l;
      if ('ABEH'.includes(v[0])) return k === String(c);
      return k === l || k === String(c);
    }
    return false;
  }

  function aviso(txt, error) {
    const m = $('msg'); m.textContent = txt; m.hidden = !txt; m.classList.toggle('pf-error', !!error);
    if (txt) m.scrollIntoView({ block: 'nearest' });
  }
  function ver(id) { for (const v of ['v-cargando', 'v-acceso', 'v-empresa', 'v-cuenta']) $(v).hidden = v !== id; }
  function ocupado(btn, si, texto) { btn.disabled = si; if (texto) btn.textContent = texto; }

  function modoAcceso(m) {
    modo = m;
    $('t-nueva').setAttribute('aria-selected', m === 'nueva');
    $('t-entrar').setAttribute('aria-selected', m === 'entrar');
    $('a-btn').textContent = m === 'nueva' ? 'Crear cuenta y continuar' : 'Entrar';
    $('a-clave').autocomplete = m === 'nueva' ? 'new-password' : 'current-password';
    aviso('');
  }

  async function pintar() {
    const u = await SB.usuario();
    if (!u) { ver('v-acceso'); return; }
    let c;
    try { c = await SB.rpc('mi_cuenta'); } catch (e) { aviso(e.message, true); ver('v-acceso'); return; }
    if (!c.empresa) {
      $('e-usuario').textContent = u.email;
      if (c.perfil && c.perfil.rol !== 'empresa') { aviso('Tu usuario es de gestión. Entra en el panel de gestión.'); location.href = '/plataforma/gestion/'; return; }
      ver('v-empresa'); return;
    }
    const e = c.empresa, [est, exp] = ESTADOS[e.estado] || [e.estado, ''];
    $('c-usuario').textContent = u.email;
    $('c-razon').textContent = e.razon_social;
    $('c-nif').textContent = e.nif;
    $('c-estado').innerHTML = `<span class="pf-estado pf-est-${esc(e.estado)}">${esc(est)}</span>`;
    $('c-fecha').textContent = new Date(e.creado_en).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
    $('c-explica').textContent = exp;
    const nombres = { condiciones: 'Condiciones de uso', privacidad: 'Política de privacidad', comercial: 'Información de otros programas de AES', minimis: 'Declaración de minimis' };
    $('c-acept').innerHTML = (c.aceptaciones || []).map((a) => `<li>${esc(nombres[a.documento] || a.documento)} v${esc(a.version)}: ${a.aceptado ? 'aceptado' : 'no marcado'} el ${esc(new Date(a.creado_en).toLocaleString('es-ES'))}</li>`).join('') || '<li>Ninguno</li>';
    ver('v-cuenta');
  }

  $('t-nueva').addEventListener('click', () => modoAcceso('nueva'));
  $('t-entrar').addEventListener('click', () => modoAcceso('entrar'));

  $('f-acceso').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('a-email').value.trim(), clave = $('a-clave').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return aviso('Escribe un correo válido.', true);
    if (clave.length < 8) return aviso('La contraseña debe tener al menos 8 caracteres.', true);
    const b = $('a-btn'), t = b.textContent; ocupado(b, true, 'Un momento…');
    try {
      if (modo === 'nueva') { const r = await SB.registrar(email, clave); if (!r.access_token) await SB.entrar(email, clave); }
      else await SB.entrar(email, clave);
      aviso(''); $('a-clave').value = '';
      await pintar();
    } catch (e) { aviso(e.message, true); }
    ocupado(b, false, t);
  });

  $('f-empresa').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = (id) => $(id).value.trim();
    const errores = [];
    if (!nifValido(v('e-nif'))) errores.push('El NIF o CIF no es válido: revisa el dígito de control.');
    if (!v('e-razon')) errores.push('Falta la razón social.');
    if (!v('e-tipo')) errores.push('Elige el tipo de empresa.');
    if (!v('e-tamano')) errores.push('Elige el tamaño.');
    if (!/^\d{4}$/.test(v('e-cnae'))) errores.push('El CNAE son 4 cifras.');
    if (!v('e-ccaa') || !v('e-provincia')) errores.push('Indica comunidad autónoma y provincia.');
    if (!v('e-nombre') || !v('e-cargo')) errores.push('Indica tu nombre y tu cargo.');
    if (!$('e-condiciones').checked) errores.push('Para darte de alta tienes que aceptar las Condiciones de uso.');
    if (errores.length) return aviso(errores.join(' '), true);
    const b = $('e-btn'), t = b.textContent; ocupado(b, true, 'Dando de alta…');
    try {
      await SB.rpc('alta_empresa', { p_nif: v('e-nif'), p_razon_social: v('e-razon'), p_tipo: v('e-tipo'), p_tamano: v('e-tamano'), p_cnae: v('e-cnae'), p_ccaa: v('e-ccaa'), p_provincia: v('e-provincia'), p_nombre: v('e-nombre'), p_cargo: v('e-cargo') });
      await SB.rpc('registrar_aceptacion', { p_documento: 'condiciones', p_version: VERSION, p_aceptado: true });
      await SB.rpc('registrar_aceptacion', { p_documento: 'privacidad', p_version: VERSION, p_aceptado: true });
      await SB.rpc('registrar_aceptacion', { p_documento: 'comercial', p_version: VERSION, p_aceptado: $('e-comercial').checked });
      aviso('Empresa dada de alta. AES la revisará y te escribirá.');
      await pintar();
    } catch (e) { aviso(e.message, true); }
    ocupado(b, false, t);
  });

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-salir]')) { await SB.salir(); aviso(''); modoAcceso('entrar'); ver('v-acceso'); }
  });

  $('e-ccaa').insertAdjacentHTML('beforeend', CCAA.map((c) => `<option>${esc(c)}</option>`).join(''));
  if (SB.retorno && SB.retorno.error) aviso(SB.retorno.error, true);
  pintar();
})();
