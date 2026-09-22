/* ============================================================
   Alianza IA · Wizard de alta "Únete" (multi-perfil)
   Diseño: CMO-DISENO-FORMULARIOS-ALTA-UNETE-2026-09-22
   Motor data-driven: Paso 0 (perfil) → 1 (captura) → 2 (entidad)
   → 3 (encaje) → 4 (consentimientos) → gracias.
   Envío: POST a FormSubmit (info@alianzaia.org) + fallback mailto.
   ============================================================ */
(function () {
  "use strict";
  var root = document.getElementById("wz-body");
  if (!root) return;

  var ENDPOINT = "https://formsubmit.co/ajax/info@alianzaia.org";

  var PAISES = ["España","Portugal","Andorra","Argentina","Bolivia","Brasil","Chile","Colombia","Costa Rica","Cuba","Ecuador","El Salvador","Guatemala","Honduras","México","Nicaragua","Panamá","Paraguay","Perú","República Dominicana","Uruguay","Venezuela","Otro"];

  // Estado global del wizard
  var S = { type: null, subtype: null, step: 0, data: {} };

  // -------- Definición de perfiles (Paso 0) --------
  var PERFILES = [
    { key:"gobierno", icon:"🏛️", titulo:"Gobiernos y Sector Público", sub:"Ministerios, agencias, ciudades y organismos multilaterales." },
    { key:"lider_ia", icon:"🌐", titulo:"Líderes Globales de IA", sub:"Big tech, hyperscalers, cómputo, modelos fundacionales y grandes adoptantes." },
    { key:"ecosistema", icon:"🚀", titulo:"Ecosistemas Locales", sub:"Startups, universidades, asociaciones y más.",
      subopts:[
        { key:"startup", label:"Startups y Scaleups de IA" },
        { key:"universidad", label:"Universidades y Centros de Investigación" },
        { key:"asociacion", label:"Asociaciones, Clústeres y Cámaras" },
        { key:"otros", label:"Otros (Inversores/VC, Aceleradoras, Fundaciones)" }
      ] }
  ];

  // Clave de rama efectiva
  function branch() {
    if (S.type === "ecosistema") return "eco_" + (S.subtype || "startup");
    return S.type;
  }

  // -------- Propuesta de valor por rama --------
  var VALOR = {
    gobierno:{ t:"Situemos a tu país en el centro de la agenda iberoamericana de IA.", p:"Participa en la gobernanza de la Alianza, accede a benchmarking regional y a propuestas regulatorias equilibradas, y abre un canal directo de colaboración público-privada con los líderes tecnológicos de la Alianza." },
    lider_ia:{ t:"Lidera la agenda de la IA en el mercado iberoamericano de 650M de personas.", p:"Como Partner, gana visibilidad de marca en toda la Alianza, participa en el diseño de estándares y policy, y conecta con gobiernos, talento y el ecosistema de startups de la región." },
    eco_startup:{ t:"Forma parte de la mayor red iberoamericana de IA.", p:"Accede a financiación y grants, a compra pública innovadora y licitaciones, y a visibilidad ante corporates y gobiernos de la región." },
    eco_universidad:{ t:"Forma parte de la mayor red iberoamericana de IA.", p:"Súmate a la red académica: convocatorias de I+D, formación de talento, eventos y colaboración transnacional." },
    eco_asociacion:{ t:"Representa a tus asociados en la agenda iberoamericana de IA.", p:"Acuerdos marco que benefician a toda tu base, co-organización de eventos, canal de policy colectivo y efecto multiplicador." },
    eco_otros:{ t:"Forma parte del ecosistema iberoamericano de IA.", p:"Dealflow cualificado, partners para programas, proyectos de impacto y voz en la gobernanza de la Alianza." }
  };

  // -------- Esquemas de campos: Paso 2 (entidad) y Paso 3 (encaje) --------
  var SCHEMA = {
    gobierno:{
      paso2:[
        {n:"org_oficial",l:"Nombre oficial del organismo",t:"text",req:true,ph:"Ej.: Ministerio de Transformación Digital"},
        {n:"tipo_entidad",l:"Tipo de entidad",t:"select",req:true,opts:["Gobierno nacional","Gobierno regional o estatal","Gobierno local o ciudad","Agencia u organismo autónomo","Regulador","Organismo multilateral"]},
        {n:"ambito",l:"Ámbito geográfico",t:"select",req:true,opts:["Nacional","Subnacional","Municipal","Regional / Multilateral"]},
        {n:"cargo",l:"Cargo del solicitante",t:"text",req:true,ph:"Ej.: Director General de IA"},
        {n:"representacion",l:"¿Tienes capacidad de representación/firma?",t:"radio",req:true,opts:["Sí","No, soy enlace técnico"]},
        {n:"web",l:"Web oficial",t:"url",req:false,ph:"https://"}
      ],
      paso3:[
        {n:"intereses",l:"Áreas de interés prioritarias",t:"multi",req:true,opts:["Regulación y gobernanza","Estrategia nacional de IA","Colaboración público-privada","Talento y formación","Financiación e I+D","Compra pública innovadora","Ética y derechos digitales","Cooperación transnacional"]},
        {n:"estrategia_ia",l:"¿Cuenta tu país/entidad con estrategia nacional de IA?",t:"select",req:false,opts:["Sí, vigente","En elaboración","No","No lo sé"]},
        {n:"adhesion",l:"Nivel de adhesión deseado",t:"radio",req:true,opts:["Firma de MoU institucional","Observador (participación sin firma inicial)","Explorar — quiero una reunión primero"]},
        {n:"objetivo",l:"Vuestro objetivo con la Alianza",t:"textarea",req:false,ph:"Máx. 500 caracteres."}
      ]
    },
    lider_ia:{
      paso2:[
        {n:"empresa",l:"Nombre de la empresa",t:"text",req:true,ph:"Ej.: Acme AI Corp."},
        {n:"tipo_org",l:"Tipo de organización",t:"select",req:true,opts:["Hyperscaler / Cloud & Cómputo","Proveedor de modelos fundacionales","Big tech / Plataforma","Gran empresa adoptante de IA","Proveedor de infraestructura / chips","Consultora / Integrador global"]},
        {n:"hq",l:"Sede / HQ",t:"text",req:true,ph:"Ciudad, País"},
        {n:"presencia",l:"Presencia en Iberoamérica",t:"select",req:true,opts:["Sí, con oficinas","Sí, comercial","En expansión","Aún no"]},
        {n:"cargo",l:"Cargo del solicitante",t:"text",req:true,ph:"Ej.: VP Public Affairs LATAM"},
        {n:"web",l:"Web corporativa",t:"url",req:true,ph:"https://"}
      ],
      paso3:[
        {n:"nivel_partnership",l:"Nivel de partnership de interés",t:"radio",req:true,opts:["Founding Partner","Strategic Partner","Corporate Member","Explorar — quiero hablarlo"]},
        {n:"contribucion",l:"Áreas donde quieres contribuir",t:"multi",req:true,opts:["Cómputo / infraestructura","Modelos y tecnología","Financiación / patrocinio","Policy y estándares","Programas de talento","Acceso a mercado para startups","Casos de uso sectoriales"]},
        {n:"propuesta",l:"Contexto / propuesta",t:"textarea",req:false,ph:"Vuestro interés y posibles aportaciones (máx. 700 car.)."}
      ]
    },
    eco_startup:{
      paso2:[
        {n:"startup",l:"Nombre de la startup",t:"text",req:true,ph:"Ej.: NeuronLab"},
        {n:"web",l:"Web",t:"url",req:true,ph:"https://"},
        {n:"etapa",l:"Etapa",t:"select",req:true,opts:["Idea / Pre-seed","Seed","Serie A","Serie B+","Scaleup"]},
        {n:"vertical",l:"Vertical / sector de IA",t:"text",req:false,ph:"Ej.: salud, fintech, industria"},
        {n:"cargo",l:"Tu rol",t:"text",req:true,ph:"Ej.: CEO / Fundadora"}
      ],
      paso3:[
        {n:"busca",l:"¿Qué buscas en la Alianza?",t:"multi",req:true,opts:["Financiación / grants","Licitaciones y compra pública","Visibilidad ante corporates y gobiernos","Mentoría y talento","Networking regional","Acceso a mercado"]},
        {n:"propuesta",l:"Cuéntanos sobre tu startup",t:"textarea",req:false,ph:"Máx. 500 car."}
      ]
    },
    eco_universidad:{
      paso2:[
        {n:"institucion",l:"Nombre de la institución",t:"text",req:true,ph:"Ej.: Universidad de Chile"},
        {n:"tipo",l:"Tipo",t:"select",req:true,opts:["Universidad","Centro de investigación","Escuela de negocios","Instituto tecnológico"]},
        {n:"web",l:"Web",t:"url",req:true,ph:"https://"},
        {n:"cargo",l:"Cargo del solicitante",t:"text",req:true,ph:"Ej.: Vicerrector de Investigación"}
      ],
      paso3:[
        {n:"busca",l:"¿Qué buscas en la Alianza?",t:"multi",req:true,opts:["Convocatorias de I+D","Formación y talento","Convenios de colaboración","Eventos y divulgación","Networking regional"]},
        {n:"convenio",l:"Nivel de adhesión",t:"radio",req:true,opts:["Adhesión a la comunidad","Convenio de colaboración","Explorar"]},
        {n:"propuesta",l:"Descripción / propuesta",t:"textarea",req:false,ph:"Máx. 500 car."}
      ]
    },
    eco_asociacion:{
      paso2:[
        {n:"org",l:"Nombre de la asociación/clúster/cámara",t:"text",req:true,ph:"Ej.: Cámara de Comercio de Bogotá"},
        {n:"tipo",l:"Tipo",t:"select",req:true,opts:["Asociación empresarial","Clúster","Cámara de comercio","Federación / Confederación","Colegio profesional"]},
        {n:"num_asociados",l:"Nº de organizaciones asociadas",t:"select",req:true,opts:["<50","50–250","250–1.000","1.000+"]},
        {n:"web",l:"Web",t:"url",req:true,ph:"https://"},
        {n:"cargo",l:"Cargo del solicitante",t:"text",req:true,ph:"Ej.: Secretario General"},
        {n:"representacion",l:"Capacidad de representación",t:"radio",req:true,opts:["Represento oficialmente","Soy enlace"]}
      ],
      paso3:[
        {n:"busca",l:"¿Qué buscas en la Alianza?",t:"multi",req:true,opts:["Acuerdo marco para asociados","Co-organización de eventos","Policy colectivo","Formación para socios","Visibilidad","Networking regional"]},
        {n:"adhesion",l:"Nivel de adhesión",t:"radio",req:true,opts:["Convenio de colaboración (acuerdo marco)","Adhesión a la comunidad","Explorar"]},
        {n:"propuesta",l:"Descripción / propuesta",t:"textarea",req:false,ph:"Máx. 500 car."}
      ]
    },
    eco_otros:{
      paso2:[
        {n:"org",l:"Nombre de la organización",t:"text",req:true,ph:"Ej.: Fondo Andino Ventures"},
        {n:"tipo_otros",l:"Tipo de organización",t:"select",req:true,opts:["Inversor / VC / Family Office","Aceleradora / Incubadora / Hub","Fundación / ONG","Sociedad civil / Think tank","Otro"]},
        {n:"web",l:"Web",t:"url",req:true,ph:"https://"},
        {n:"cargo",l:"Cargo del solicitante",t:"text",req:true,ph:"Ej.: Managing Partner / Directora"}
      ],
      paso3:[
        {n:"busca",l:"¿Qué buscas en la Alianza?",t:"multi",req:true,opts:["Dealflow / co-inversión","Partners para programas","Proyectos de impacto","Policy / incidencia","Visibilidad","Comunidad"]},
        {n:"propuesta",l:"Descripción / propuesta",t:"textarea",req:false,ph:"Máx. 500 car."}
      ]
    }
  };

  // -------- Mensajes thank-you por rama --------
  function graciasMsg() {
    var nom = (S.data.nombre || "").split(" ")[0] || "";
    var org = S.data.org || S.data.org_oficial || S.data.empresa || S.data.startup || S.data.institucion || "tu organización";
    var m = {
      gobierno:"Hemos recibido la solicitud de "+org+". Dada su naturaleza institucional, un responsable de Relaciones Institucionales de la Alianza os contactará para coordinar los siguientes pasos y, si procede, la firma del Memorando de Entendimiento.",
      lider_ia:"Hemos recibido el interés de "+org+". Un responsable de Partnerships de la Alianza se pondrá en contacto para explorar el encaje y compartir el dossier de Founding/Strategic Partners.",
      eco_startup:org+" ya forma parte del ecosistema de la Alianza. Te enviaremos el kit de bienvenida y las oportunidades (financiación, licitaciones, mercado) que mejor encajen con tu perfil.",
      eco_universidad:org+" se une a la red académica de la Alianza. Te enviaremos el kit de bienvenida y las próximas convocatorias de I+D.",
      eco_asociacion:"Valoramos enormemente sumar a "+org+" y a su base de asociados. Un responsable de Alianzas te contactará para definir el marco de colaboración.",
      eco_otros:org+" ya forma parte del ecosistema de la Alianza. Te haremos llegar el kit de bienvenida y las oportunidades que mejor encajen con tu perfil."
    };
    return "Gracias, "+nom+". "+(m[branch()]||m.eco_otros);
  }

  // ---------------- Utilidades de render ----------------
  function el(html){ var d=document.createElement("div"); d.innerHTML=html.trim(); return d.firstChild; }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }

  function fieldHTML(f){
    var id="f_"+f.n, val=S.data[f.n], req=f.req?' required':'', star=f.req?' <span class="wz-req">*</span>':'';
    var help=f.help?'<span class="wz-help">'+esc(f.help)+'</span>':'';
    var head='<label class="wz-label" for="'+id+'">'+esc(f.l)+star+'</label>'+help;
    if(f.t==="text"||f.t==="email"||f.t==="url"||f.t==="tel"){
      return '<div class="wz-field">'+head+'<input class="wz-input" id="'+id+'" name="'+f.n+'" type="'+f.t+'"'+req+' placeholder="'+esc(f.ph||"")+'" value="'+esc(val||"")+'"></div>';
    }
    if(f.t==="textarea"){
      return '<div class="wz-field">'+head+'<textarea class="wz-input" id="'+id+'" name="'+f.n+'" rows="3"'+req+' placeholder="'+esc(f.ph||"")+'">'+esc(val||"")+'</textarea></div>';
    }
    if(f.t==="select"){
      var o='<option value="">Selecciona…</option>'+f.opts.map(function(x){return '<option'+(val===x?' selected':'')+'>'+esc(x)+'</option>';}).join("");
      return '<div class="wz-field">'+head+'<select class="wz-input" id="'+id+'" name="'+f.n+'"'+req+'>'+o+'</select></div>';
    }
    if(f.t==="radio"){
      var r=f.opts.map(function(x,i){return '<label class="wz-opt"><input type="radio" name="'+f.n+'" value="'+esc(x)+'"'+(val===x?' checked':'')+(f.req&&i===0?' data-req="1"':'')+'> <span>'+esc(x)+'</span></label>';}).join("");
      return '<div class="wz-field" data-radio="'+f.n+'"'+(f.req?' data-required="1"':'')+'>'+head+'<div class="wz-opts">'+r+'</div></div>';
    }
    if(f.t==="multi"){
      var arr=Array.isArray(val)?val:[];
      var c=f.opts.map(function(x){return '<label class="wz-opt"><input type="checkbox" name="'+f.n+'" value="'+esc(x)+'"'+(arr.indexOf(x)>=0?' checked':'')+'> <span>'+esc(x)+'</span></label>';}).join("");
      return '<div class="wz-field" data-multi="'+f.n+'"'+(f.req?' data-required="1"':'')+'>'+head+'<div class="wz-opts wz-opts-grid">'+c+'</div></div>';
    }
    return "";
  }

  function collect(scope){
    // Guarda en S.data todos los inputs presentes en 'scope'
    scope.querySelectorAll("input,select,textarea").forEach(function(inp){
      var n=inp.name; if(!n) return;
      if(inp.type==="checkbox"){
        if(inp.closest("[data-multi]")){
          var key=inp.closest("[data-multi]").getAttribute("data-multi");
          var a=Array.isArray(S.data[key])?S.data[key]:[];
          a=a.filter(function(v){return v!==inp.value;});
          if(inp.checked) a.push(inp.value);
          S.data[key]=a;
        } else { S.data[n]=inp.checked; }
      } else if(inp.type==="radio"){ if(inp.checked) S.data[n]=inp.value; }
      else { S.data[n]=inp.value; }
    });
  }

  function validate(scope){
    var ok=true, first=null;
    scope.querySelectorAll("input,select,textarea").forEach(function(inp){
      if(inp.hasAttribute("required")){
        var bad = (inp.type==="checkbox") ? !inp.checked : !String(inp.value).trim();
        if(inp.type==="email" && inp.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inp.value)) bad=true;
        mark(inp.closest(".wz-field")||inp, bad); if(bad&&!first) first=inp; if(bad) ok=false;
      }
    });
    scope.querySelectorAll("[data-required][data-radio],[data-required][data-multi]").forEach(function(g){
      var checked=g.querySelectorAll("input:checked").length>0;
      mark(g,!checked); if(!checked){ ok=false; if(!first) first=g; }
    });
    if(first){ (first.scrollIntoView?first:first).scrollIntoView({behavior:"smooth",block:"center"}); }
    return ok;
  }
  function mark(node,bad){ if(!node)return; node.classList.toggle("wz-invalid",!!bad); }

  // ---------------- Render de pasos ----------------
  function render(){
    root.innerHTML="";
    updateProgress();
    if(S.step===0) return renderPerfil();
    if(S.step===1) return renderCaptura();
    if(S.step===2) return renderEsquema("paso2","Datos de la entidad","Paso 2 de 4");
    if(S.step===3) return renderEsquema("paso3","Encaje y modalidad","Paso 3 de 4");
    if(S.step===4) return renderConsentimientos();
    if(S.step===5) return renderGracias();
  }

  function updateProgress(){
    var pr=document.getElementById("wz-progress");
    if(!pr) return;
    if(S.step>=1 && S.step<=4){
      pr.hidden=false;
      var pct=[0,25,50,75,100][S.step];
      document.getElementById("wz-progress-fill").style.width=pct+"%";
      document.getElementById("wz-progress-label").textContent="Paso "+S.step+" de 4";
    } else { pr.hidden=true; }
  }

  function renderPerfil(){
    var wrap=el('<div class="wz-step"><h3 class="wz-h">¿Quién eres?</h3><p class="wz-p">Elige tu perfil para adaptar el proceso de adhesión.</p><div class="wz-cards"></div><div class="wz-sub" hidden></div><div class="wz-nav"></div></div>');
    var cards=wrap.querySelector(".wz-cards"), subBox=wrap.querySelector(".wz-sub"), nav=wrap.querySelector(".wz-nav");
    PERFILES.forEach(function(p){
      var c=el('<button type="button" class="wz-card'+(S.type===p.key?' active':'')+'"><span class="wz-card-ic">'+p.icon+'</span><span class="wz-card-t">'+esc(p.titulo)+'</span><span class="wz-card-s">'+esc(p.sub)+'</span></button>');
      c.addEventListener("click",function(){
        S.type=p.key; S.subtype=null;
        cards.querySelectorAll(".wz-card").forEach(function(x){x.classList.remove("active");});
        c.classList.add("active");
        if(p.subopts){ renderSub(subBox,p.subopts); subBox.hidden=false; } else { subBox.hidden=true; renderContinue(nav,true); }
        if(!p.subopts) renderContinue(nav,true); else renderContinue(nav,!!S.subtype);
      });
      cards.appendChild(c);
    });
    // restaurar sub si aplica
    var cur=PERFILES.filter(function(p){return p.key===S.type;})[0];
    if(cur&&cur.subopts){ renderSub(subBox,cur.subopts); subBox.hidden=false; }
    renderContinue(nav, S.type && (S.type!=="ecosistema"||S.subtype));
    root.appendChild(wrap);
  }
  function renderSub(box,subopts){
    box.innerHTML='<p class="wz-sub-t">¿Qué tipo de organización?</p>';
    var grid=el('<div class="wz-subgrid"></div>');
    subopts.forEach(function(s){
      var b=el('<button type="button" class="wz-chip'+(S.subtype===s.key?' active':'')+'">'+esc(s.label)+'</button>');
      b.addEventListener("click",function(){
        S.subtype=s.key;
        grid.querySelectorAll(".wz-chip").forEach(function(x){x.classList.remove("active");});
        b.classList.add("active");
        renderContinue(box.parentNode.querySelector(".wz-nav"),true);
      });
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }
  function renderContinue(nav,enabled){
    nav.innerHTML="";
    var btn=el('<button type="button" class="btn btn-primary btn-lg wz-next"'+(enabled?"":" disabled")+'>Continuar →</button>');
    btn.addEventListener("click",function(){ if(S.type&&(S.type!=="ecosistema"||S.subtype)){ S.step=1; render(); } });
    nav.appendChild(btn);
  }

  function renderCaptura(){
    var v=VALOR[branch()]||{};
    var wrap=el('<div class="wz-step"><div class="wz-valor"><strong>'+esc(v.t||"")+'</strong><span>'+esc(v.p||"")+'</span></div><h3 class="wz-h">Empecemos</h3><p class="wz-p">Solo 2 minutos. Con estos datos ya guardamos tu solicitud.</p><div class="wz-fields"></div><div class="wz-nav"></div></div>');
    var box=wrap.querySelector(".wz-fields");
    [ {n:"nombre",l:"Nombre y apellidos",t:"text",req:true,ph:"Ej.: María Fernández",help:"Persona de contacto para esta solicitud."},
      {n:"email",l:"Email corporativo/institucional",t:"email",req:true,ph:"nombre@organizacion.org",help:"Usa tu correo profesional; evita Gmail/Hotmail personales."},
      {n:"org",l:"Organización / Entidad",t:"text",req:true,ph:"Ej.: Ministerio de Ciencia / Acme AI",help:"Nombre oficial de tu organización."},
      {n:"pais",l:"País",t:"select",req:true,opts:PAISES,help:"País donde opera tu organización."}
    ].forEach(function(f){ box.appendChild(el(fieldHTML(f))); });
    box.appendChild(el('<div class="wz-field"><label class="wz-opt wz-consent"><input type="checkbox" name="consent_contacto" required'+(S.data.consent_contacto?" checked":"")+'> <span>Acepto que la Alianza me contacte sobre mi solicitud de adhesión. <a href="privacidad.html" target="_blank" rel="noopener">Política de Privacidad</a>.<span class="wz-req"> *</span></span></label></div>'));
    navBtns(wrap.querySelector(".wz-nav"), 0, function(scope){ if(validate(scope)){ collect(scope); S.step=2; render(); } });
    root.appendChild(wrap);
  }

  function renderEsquema(paso,titulo,label){
    var fields=(SCHEMA[branch()]||{})[paso]||[];
    var wrap=el('<div class="wz-step"><h3 class="wz-h">'+esc(titulo)+'</h3><div class="wz-fields"></div><div class="wz-nav"></div></div>');
    var box=wrap.querySelector(".wz-fields");
    fields.forEach(function(f){ box.appendChild(el(fieldHTML(f))); });
    navBtns(wrap.querySelector(".wz-nav"), paso==="paso2"?1:2, function(scope){
      if(validate(scope)){ collect(scope); S.step=(paso==="paso2")?3:4; render(); }
    });
    root.appendChild(wrap);
  }

  function renderConsentimientos(){
    var ligera = branch().indexOf("eco_")===0 && branch()!=="eco_asociacion";
    var wrap=el('<div class="wz-step"><h3 class="wz-h">Casi listo</h3><div class="wz-fields"></div><div class="wz-nav"></div></div>');
    var box=wrap.querySelector(".wz-fields");
    box.appendChild(el(fieldHTML({n:"telefono",l:"Teléfono de contacto",t:"tel",req:false,ph:"+34 …",help:"Opcional; agiliza la coordinación."})));
    box.appendChild(el(fieldHTML({n:"como_conociste",l:"¿Cómo nos conociste?",t:"select",req:false,opts:["Evento","Recomendación","Redes / LinkedIn","Prensa","Búsqueda","Otro"]})));
    box.appendChild(el('<div class="wz-field"><label class="wz-opt wz-consent"><input type="checkbox" name="consent_principios" required'+(S.data.consent_principios?" checked":"")+'> <span>Acepto los Principios de la Alianza: una IA ética, inclusiva y competitiva.<span class="wz-req"> *</span></span></label></div>'));
    box.appendChild(el('<div class="wz-field"><label class="wz-opt wz-consent"><input type="checkbox" name="consent_rgpd" required'+(S.data.consent_rgpd?" checked":"")+'> <span>He leído y acepto la <a href="privacidad.html" target="_blank" rel="noopener">Política de Privacidad</a> y el tratamiento de mis datos (RGPD/LGPD).<span class="wz-req"> *</span></span></label></div>'));
    box.appendChild(el('<div class="wz-field"><label class="wz-opt wz-consent"><input type="checkbox" name="opt_newsletter"'+(S.data.opt_newsletter?" checked":"")+'> <span>Quiero recibir la newsletter y comunicaciones de la Alianza.</span></label></div>'));
    var lbl = ligera ? "Unirme a la comunidad" : "Enviar solicitud de adhesión";
    navBtns(wrap.querySelector(".wz-nav"), 3, function(scope){
      if(validate(scope)){ collect(scope); submit(); }
    }, lbl);
    root.appendChild(wrap);
  }

  function renderGracias(){
    var wrap=el('<div class="wz-step wz-gracias"><div class="wz-check">✓</div><h3 class="wz-h">'+esc(graciasMsg())+'</h3><p class="wz-p" id="wz-status"></p><div class="wz-nav"><a href="#inicio" class="btn btn-line btn-lg">Volver al inicio</a></div></div>');
    root.appendChild(wrap);
  }

  function navBtns(nav, backStep, onNext, nextLabel){
    var back=el('<button type="button" class="btn btn-line wz-back">← Atrás</button>');
    back.addEventListener("click",function(){ collect(root); S.step=backStep; render(); });
    var next=el('<button type="button" class="btn btn-primary btn-lg wz-next">'+(nextLabel||"Continuar →")+'</button>');
    next.addEventListener("click",function(){ onNext(root); });
    nav.appendChild(back); nav.appendChild(next);
  }

  // ---------------- Envío ----------------
  function payload(){
    var p={ _subject:"Nueva solicitud de adhesión — "+ (S.data.org||"") +" ("+branch()+")", member_type:S.type||"", member_subtype:S.subtype||"", rama:branch() };
    Object.keys(S.data).forEach(function(k){ var v=S.data[k]; p[k]=Array.isArray(v)?v.join(", "):(v===true?"Sí":v===false?"":v); });
    return p;
  }
  function submit(){
    var next=root.querySelector(".wz-next"); if(next){ next.disabled=true; next.textContent="Enviando…"; }
    var data=payload();
    S.step=5; render();
    var st=document.getElementById("wz-status"); if(st) st.textContent="Registrando tu solicitud…";
    fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(data)})
      .then(function(r){return r.json().catch(function(){return {};});})
      .then(function(){ if(st) st.textContent="Solicitud registrada. Te contactaremos muy pronto."; })
      .catch(function(){
        if(st){ st.innerHTML='No hemos podido registrar la solicitud automáticamente. Escríbenos a <a href="mailto:info@alianzaia.org">info@alianzaia.org</a> y la tramitamos.'; }
      });
  }

  // Preselección de perfil vía hash (#unete-gobierno, etc.) — opcional
  function preselect(){
    var h=(location.hash||"").replace("#","");
    var map={ "unete-gobierno":["gobierno",null], "unete-lider":["lider_ia",null], "unete-startup":["ecosistema","startup"], "unete-universidad":["ecosistema","universidad"], "unete-asociacion":["ecosistema","asociacion"], "unete-inversor":["ecosistema","otros"] };
    if(map[h]){ S.type=map[h][0]; S.subtype=map[h][1]; S.step=1; }
  }

  preselect();
  render();
})();
