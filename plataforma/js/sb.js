// Cliente mínimo de Supabase (UE, Fráncfort) sin dependencias: acceso por enlace al correo,
// API de datos (PostgREST) y funciones (RPC). La seguridad la dan las políticas RLS de la base
// de datos; aquí solo va la clave pública (anon), que está pensada para ir en el navegador.
(function () {
  const URL_SB = 'https://vigdxoarfgvydzvnsdme.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpZ2R4b2FyZmd2eWR6dm5zZG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MjEwMDgsImV4cCI6MjEwNzk5NzAwOH0._DrlP_6zZuVffhC_8gEiCbjI4qg387WzsVY-pJ2LM2Y';
  const CLAVE = 'sb-vigdxoarfgvydzvnsdme-auth-token';

  const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; } };
  const guardar = (s) => s ? localStorage.setItem(CLAVE, JSON.stringify(s)) : localStorage.removeItem(CLAVE);

  async function pedir(ruta, { metodo = 'GET', cuerpo, cabeceras = {}, sinSesion = false } = {}) {
    const s = sinSesion ? null : await sesion();
    const r = await fetch(URL_SB + ruta, {
      method: metodo,
      headers: { apikey: ANON, Authorization: 'Bearer ' + (s ? s.access_token : ANON), 'Content-Type': 'application/json', ...cabeceras },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
    const txt = await r.text();
    let datos = null; try { datos = txt ? JSON.parse(txt) : null; } catch { datos = txt; }
    if (!r.ok) {
      const msg = (datos && (datos.message || datos.msg || datos.error_description || datos.error)) || ('Error ' + r.status);
      const e = new Error(traducir(msg)); e.status = r.status; e.detalle = datos; throw e;
    }
    return datos;
  }

  // Mensajes de la base de datos que puede ver la persona usuaria
  function traducir(m) {
    if (/duplicate key.*nif/i.test(m)) return 'Ya hay una empresa dada de alta con ese NIF. Pide acceso a la persona que la registró.';
    if (/rate limit/i.test(m)) return 'Has pedido demasiados enlaces seguidos. Espera unos minutos y vuelve a intentarlo.';
    if (/Invalid login credentials/i.test(m)) return 'El correo o la contraseña no son correctos.';
    if (/already registered/i.test(m)) return 'Ya hay una cuenta con ese correo. Entra con tu contraseña.';
    if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
    if (/JWT expired/i.test(m)) return 'La sesión ha caducado. Vuelve a entrar.';
    return m;
  }

  async function sesion() {
    let s = leer();
    if (!s) return null;
    if (s.expires_at && s.expires_at * 1000 < Date.now() + 60000) {
      try {
        const n = await pedir('/auth/v1/token?grant_type=refresh_token', { metodo: 'POST', cuerpo: { refresh_token: s.refresh_token }, sinSesion: true });
        s = { ...n, expires_at: Math.floor(Date.now() / 1000) + n.expires_in };
        guardar(s);
      } catch { guardar(null); return null; }
    }
    return s;
  }

  // Al volver del enlace del correo, Supabase deja los tokens en el fragmento (#access_token=…)
  function recogerRetorno() {
    if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return null;
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    if (p.get('error')) return { error: p.get('error_description') || p.get('error') };
    const s = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: +p.get('expires_at') || Math.floor(Date.now() / 1000) + (+p.get('expires_in') || 3600) };
    guardar(s);
    return { ok: true };
  }
  const retorno = recogerRetorno();

  const SB = {
    retorno,
    async usuario() { const s = await sesion(); if (!s) return null; try { return await pedir('/auth/v1/user'); } catch { return null; } },
    async enviarEnlace(email, volverA) {
      return pedir('/auth/v1/otp?redirect_to=' + encodeURIComponent(volverA || location.href.split('#')[0]), { metodo: 'POST', cuerpo: { email, create_user: true }, sinSesion: true });
    },
    // Alta y acceso con contraseña (mientras el envío de enlaces por correo no esté activo)
    async registrar(email, clave) {
      const r = await pedir('/auth/v1/signup', { metodo: 'POST', cuerpo: { email, password: clave }, sinSesion: true });
      if (r && r.access_token) guardar({ ...r, expires_at: Math.floor(Date.now() / 1000) + r.expires_in });
      return r;
    },
    async entrar(email, clave) {
      const r = await pedir('/auth/v1/token?grant_type=password', { metodo: 'POST', cuerpo: { email, password: clave }, sinSesion: true });
      guardar({ ...r, expires_at: Math.floor(Date.now() / 1000) + r.expires_in });
      return r;
    },
    async recuperar(email, volverA) {
      return pedir('/auth/v1/recover?redirect_to=' + encodeURIComponent(volverA || location.href.split('#')[0]), { metodo: 'POST', cuerpo: { email }, sinSesion: true });
    },
    async salir() { try { await pedir('/auth/v1/logout', { metodo: 'POST' }); } catch { /* sin sesión */ } guardar(null); },
    // tabla: 'empresas'; consulta: 'select=*&id=eq.…'
    leer: (tabla, consulta = 'select=*') => pedir(`/rest/v1/${tabla}?${consulta}`),
    // minimo: no devuelve la fila (para tablas con columnas que el usuario no puede leer)
    insertar: (tabla, fila, minimo) => pedir(`/rest/v1/${tabla}`, { metodo: 'POST', cuerpo: fila, cabeceras: { Prefer: minimo ? 'return=minimal' : 'return=representation' } }),
    actualizar: (tabla, filtro, cambios, minimo) => pedir(`/rest/v1/${tabla}?${filtro}`, { metodo: 'PATCH', cuerpo: cambios, cabeceras: { Prefer: minimo ? 'return=minimal' : 'return=representation' } }),
    rpc: (fn, args = {}) => pedir(`/rest/v1/rpc/${fn}`, { metodo: 'POST', cuerpo: args })
  };
  window.SB = SB;
})();
