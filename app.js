/* =========================================================================
   AES — motion del sitio. Lenis (smooth scroll) + GSAP/ScrollTrigger para
   reveals/parallax; reveals con trigger POR ELEMENTO (secciones largas se
   leen paso a paso). Respeta prefers-reduced-motion también en JS.
   Degradación segura si falla el CDN: todo el contenido queda visible.
   ========================================================================= */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showAll() {
    $$('[data-reveal], [data-split], .hero-sub, .hero-actions').forEach(function (e) {
      e.style.opacity = 1; e.style.transform = 'none';
    });
  }

  /* ---- Contadores animados (independientes de GSAP: solo IO) ---- */
  function initCounters() {
    var counters = $$('[data-count]');
    if (!counters.length) return;
    function paint(el, value) {
      var pre = el.getAttribute('data-prefix') || '', suf = el.getAttribute('data-suffix') || '';
      el.textContent = pre + String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + suf;
    }
    function countUp(el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      if (reduceMotion || target < 10) { paint(el, target); return; }
      var t0 = performance.now();
      (function step(now) {
        var p = Math.min(1, (now - t0) / 1200), e = 1 - Math.pow(1 - p, 3);
        paint(el, target * e);
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }
    if ('IntersectionObserver' in window) {
      var cio = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) { countUp(en.target); cio.unobserve(en.target); } });
      }, { threshold: 0.1, rootMargin: "60px" });
      counters.forEach(function (c) { cio.observe(c); });
    } else {
      counters.forEach(function (c) { paint(c, parseFloat(c.getAttribute('data-count')) || 0); });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNetworks();
    initLoadMore();
    initMenu();
    initFAQ();
    initMotive();
    initCounters();

    if (!window.gsap || reduceMotion) { showAll(); initNav(null); return; }
    var gsap = window.gsap;
    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

    /* ---- Lenis smooth scroll (no si reduce motion) ---- */
    var lenis = null;
    try {
      if (window.Lenis) {
        lenis = new window.Lenis({ duration: 1.15, smoothWheel: true });
        window.__lenis = lenis;
        lenis.on('scroll', function () { if (window.ScrollTrigger) window.ScrollTrigger.update(); });
        gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
        gsap.ticker.lagSmoothing(0);
      }
    } catch (e) {}
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href'); if (id.length < 2) return;
        var t = $(id); if (!t) return; e.preventDefault();
        if (lenis) lenis.scrollTo(t, { offset: -10 }); else t.scrollIntoView({ behavior: 'smooth' });
      });
    });

    /* ---- Hero: fade + translateY 20px al cargar (no necesita ScrollTrigger) ---- */
    var heroTitle = $('.hero-title');
    if (heroTitle) {
      gsap.fromTo(heroTitle, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', delay: 0.1 });
      gsap.to('.hero-sub, .hero-actions', { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.1, delay: 0.35 });
    }

    if (!window.ScrollTrigger) { showAll(); initNav(lenis); return; }

    /* ---- Titulares: fade discreto al entrar ---- */
    $$('[data-split]').forEach(function (h) {
      if (h.classList.contains('hero-title')) return;
      gsap.fromTo(h, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out',
        scrollTrigger: { trigger: h, start: 'top 88%' } });
    });

    /* ---- Reveals con trigger POR ELEMENTO (las secciones largas — sistema,
       país — se van leyendo a medida que se scrollea, no todas de golpe) ---- */
    $$('[data-reveal]').forEach(function (el) {
      gsap.to(el, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' } });
    });

    /* ---- "Cómo cambia un país": la línea se dibuja con el scroll ---- */
    var paisSteps = $('.pais-steps');
    if (paisSteps) {
      gsap.fromTo(paisSteps, { '--line-p': 0 }, { '--line-p': 1, ease: 'none',
        scrollTrigger: { trigger: paisSteps, start: 'top 78%', end: 'bottom 50%', scrub: true } });
    }

    /* ---- Parallax scroll-linked ---- */
    $$('[data-parallax]').forEach(function (el) {
      var amt = parseFloat(el.getAttribute('data-parallax')) || 40;
      gsap.fromTo(el, { yPercent: -amt * 0.5 }, { yPercent: amt * 0.5, ease: 'none',
        scrollTrigger: { trigger: el.closest('.section') || el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    /* ---- Burbujas flotantes (Impulsa) ---- */
    var istage = $('.impulsa-stage');
    if (istage) {
      if ('IntersectionObserver' in window) {
        var sio = new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) { istage.classList.add('in'); sio.disconnect(); } });
        }, { threshold: 0.25 });
        sio.observe(istage);
      } else { istage.classList.add('in'); }
    }

    initNav(lenis);
  });

  /* ---- NAV (estado scrolled/on-dark) + CTA flotante ---- */
  function initNav(lenis) {
    var fcta = $('#float-cta');
    if (fcta) {
      var toggleF = function () { fcta.classList.toggle('show', (window.pageYOffset || 0) > window.innerHeight * 0.85); };
      window.addEventListener('scroll', toggleF, { passive: true });
      if (lenis) lenis.on('scroll', toggleF);
      toggleF();
    }
    var nav = $('#nav'), darkZones = $$('.hero, .section-dark, .section-cta, .manifesto, .pais, .footer');
    function navState() {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      if (nav) nav.classList.toggle('scrolled', y > 40);
      var onDark = false;
      darkZones.forEach(function (z) { var r = z.getBoundingClientRect(); if (r.top <= 64 && r.bottom >= 64) onDark = true; });
      if (nav) nav.classList.toggle('on-dark', onDark);
    }
    window.addEventListener('scroll', navState, { passive: true });
    if (lenis) lenis.on('scroll', navState);
    navState();
  }

  /* ---- Red de nodos (el ecosistema) — azul + cian ---- */
  function initNetworks() { $$('canvas.net').forEach(setupNet); }
  function setupNet(canvas) {
    var ctx = canvas.getContext('2d'); if (!ctx) return;
    var nodes = [], w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function col(a, cyan) { return (cyan ? '25,227,200,' : '90,120,255,') + a + ')'; }
    function resize() {
      var r = canvas.getBoundingClientRect(); w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.max(28, Math.min(68, Math.round(w / 24))); nodes = [];
      for (var i = 0; i < count; i++) nodes.push({ x: Math.random()*w, y: Math.random()*h, vx:(Math.random()-.5)*.28, vy:(Math.random()-.5)*.28, r: Math.random()*1.6+1, c: Math.random() < .4 });
    }
    var DIST = 150;
    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i]; n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1;
        for (var j = i + 1; j < nodes.length; j++) {
          var m = nodes[j], dx = n.x-m.x, dy = n.y-m.y, d = Math.sqrt(dx*dx+dy*dy);
          if (d < DIST) { ctx.strokeStyle = 'rgba(' + col((1-d/DIST)*.42, n.c && m.c); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(n.x,n.y); ctx.lineTo(m.x,m.y); ctx.stroke(); }
        }
      }
      for (var k = 0; k < nodes.length; k++) {
        var p = nodes[k];
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fillStyle = 'rgba(' + col(.95, p.c); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r*3.4, 0, 6.2832); ctx.fillStyle = 'rgba(' + col(.08, p.c); ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    resize(); var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 200); });
    requestAnimationFrame(frame);
  }

  /* ---- "Load more": revela las noticias ocultas ---- */
  function initLoadMore() {
    var btn = document.getElementById('load-more'); if (!btn) return;
    btn.addEventListener('click', function () {
      $$('.news-row.is-hidden').forEach(function (row, i) {
        row.classList.remove('is-hidden');
        if (window.gsap) window.gsap.fromTo(row, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .6, ease: 'power3.out', delay: i * .05 });
      });
      btn.style.display = 'none';
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    });
  }

  /* ---- Menú hamburguesa (móvil/tablet) ---- */
  function initMenu() {
    var nav = document.getElementById('nav');
    var toggle = document.getElementById('nav-toggle');
    if (!nav || !toggle) return;
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    $$('#nav-links a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  /* ---- Acordeón / FAQ (un panel abierto a la vez) ---- */
  function initFAQ() {
    $$('.faq-item').forEach(function (item) {
      var q = $('.faq-q', item), a = $('.faq-a', item);
      if (!q || !a) return;
      q.addEventListener('click', function () {
        var isOpen = item.classList.contains('open');
        $$('.faq-item.open').forEach(function (o) {
          o.classList.remove('open');
          var oa = $('.faq-a', o); if (oa) oa.style.maxHeight = null;
        });
        if (!isOpen) { item.classList.add('open'); a.style.maxHeight = a.scrollHeight + 'px'; }
      });
    });
  }

  /* ---- Selector de motivo (contacto) ---- */
  function initMotive() {
    var motives = $$('.motive');
    if (!motives.length) return;
    motives.forEach(function (m) {
      if (m.tagName === 'A') return; /* chips-enlace de la home no son selector */
      m.addEventListener('click', function () {
        motives.forEach(function (x) { x.classList.remove('is-active'); });
        m.classList.add('is-active');
        var label = document.getElementById('motive-label');
        if (label) label.textContent = m.getAttribute('data-motive') || m.textContent;
      });
    });
  }
})();

// Analítica y atribución propias para AlianzaIA. No escribe en el navegador ni envía
// eventos hasta que la persona acepta la medición. Los datos se agregan con los de
// las demás webs del grupo en el colector de AES, sin nombre, email ni IP completa.
(function(){
  'use strict';
  var ENDPOINT='https://asociacionstartups.es/api/alta';
  var TTL=30*24*60*60*1000;
  var KEYS=['ai_utm','ai_utm_last','ai_sid','ai_exp'];
  var sent={};
  function get(k){try{return localStorage.getItem(k)||''}catch(_){return ''}}
  function put(k,v){try{localStorage.setItem(k,v)}catch(_){}}
  function del(){KEYS.forEach(function(k){try{localStorage.removeItem(k)}catch(_){}})}
  function consent(){return Number(get('ai_consent_exp'))>Date.now()&&get('ai_analytics_consent')==='yes'}
  function uuid(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36)}
  function collect(){
    if(!consent()){del();return}
    var now=Date.now();if(Number(get('ai_exp'))<=now){del();put('ai_sid',uuid());put('ai_exp',String(now+TTL))}
    if(!get('ai_sid')){put('ai_sid',uuid());put('ai_exp',String(now+TTL))}
    var p=new URLSearchParams(location.search),out=new URLSearchParams();
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','link_id'].forEach(function(k){var v=p.get(k);if(v&&!/@|%40/i.test(v))out.set(k,v.slice(0,100))});
    var tagged=out.toString().slice(0,500);if(tagged){if(!get('ai_utm'))put('ai_utm',tagged);put('ai_utm_last',tagged)}
  }
  function device(){var w=Math.min(screen.width||innerWidth,innerWidth||screen.width);return w<768?'mobile':w<1024?'tablet':'desktop'}
  window.aiTrack=function(evento,detalle){
    if(!consent()||!(/^(page_view|cta_click|form_start|form_step|form_success|form_error|outbound_click)$/).test(evento))return;
    var key=evento+'|'+(detalle||'');if(sent[key])return;sent[key]=1;collect();
    var body=JSON.stringify({tipo:'evento',evento:evento,detalle:detalle||'',analyticsConsent:true,site:'alianzaia',utm:get('ai_utm'),utmLast:get('ai_utm_last'),sid:get('ai_sid'),opKey:uuid(),event_id:uuid(),ruta:location.pathname,referrer:document.referrer||'',device:device(),is_qa:new URLSearchParams(location.search).get('qa')==='1'});
    fetch(ENDPOINT,{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){});
  };
  function page(){window.aiTrack('page_view',document.title.slice(0,100))}
  function banner(){
    if(document.getElementById('ai-analytics-choice'))return;
    var box=document.createElement('section');box.id='ai-analytics-choice';box.setAttribute('aria-label','Preferencias de medición');
    box.style.cssText='position:fixed;bottom:14px;left:14px;right:14px;max-width:680px;margin:auto;z-index:9999;background:#fff;color:#17233b;padding:18px;border:1px solid #ccd3dd;border-radius:14px;box-shadow:0 4px 25px #0003;font:15px/1.5 sans-serif';
    box.innerHTML='<p style="margin:0 0 12px">¿Nos permites medir de forma anónima el uso de la web y saber qué campañas funcionan? Es opcional. <a href="/cookies.html">Más información</a></p><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" data-choice="yes">Aceptar medición</button><button type="button" data-choice="no">Rechazar</button></div>';
    box.addEventListener('click',function(e){var c=e.target.getAttribute('data-choice');if(c!=='yes'&&c!=='no')return;put('ai_analytics_consent',c);put('ai_consent_exp',String(Date.now()+365*24*60*60*1000));if(c==='yes'){collect();page()}else del();box.remove()});document.body.appendChild(box);
  }
  document.addEventListener('click',function(ev){
    var a=ev.target&&ev.target.closest&&ev.target.closest('a,button');if(!a)return;
    var label=a.getAttribute('data-ai-cta')||a.getAttribute('data-aes-cta')||((a.textContent||'').trim().slice(0,80));
    if(a.hasAttribute('data-ai-cta')||a.hasAttribute('data-aes-cta'))window.aiTrack('cta_click',label);
    if(a.tagName==='A'&&/^https?:/i.test(a.href)){try{var u=new URL(a.href);if(u.origin!==location.origin)window.aiTrack('outbound_click',u.hostname)}catch(_){}}
  },true);
  var pref=document.createElement('button');pref.type='button';pref.textContent='Preferencias de privacidad';pref.style.cssText='background:none;border:0;color:inherit;text-decoration:underline;cursor:pointer;padding:0;font:inherit';pref.addEventListener('click',banner);var footer=document.querySelector('footer .footer-legal-links')||document.querySelector('footer');if(footer)footer.appendChild(pref);
  collect();if(consent())page();else if(Number(get('ai_consent_exp'))<=Date.now())banner();
})();
