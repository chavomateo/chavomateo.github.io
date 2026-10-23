const products = [
  {id:'movilidad-flujos',title:'Flujos de movilidad urbana',provider:'Proveedor piloto de movilidad',sector:'Movilidad',source:'federado',sourceLabel:'Federado',mode:'aprobacion',modeLabel:'Con aprobación',version:'1.2',coverage:'Madrid · cuadrícula 500 m',updated:'Diaria',format:'API JSON',quality:'Completitud 96 %',lineage:'Sensores agregados y validados',purpose:'Planificación y simulación de movilidad',license:'Acuerdo específico por caso',sla:'Respuesta a solicitudes: 5 días',description:'Indicadores agregados de intensidad, velocidad y franjas horarias sin trayectorias individuales.'},
  {id:'industria-anomalias',title:'Detección de anomalías industriales',provider:'Startup candidata validada',sector:'Industria',source:'propio',sourceLabel:'AlianzaIA',mode:'compute',modeLabel:'Cómputo seguro',version:'0.9',coverage:'Series temporales sintéticas',updated:'Por ejecución',format:'Algoritmo en contenedor',quality:'Prueba reproducible incluida',lineage:'Telemetría permanece en origen',purpose:'Mantenimiento predictivo',license:'Licencia de servicio piloto',sla:'Resultado en menos de 30 min',description:'El algoritmo viaja al dato y devuelve únicamente indicadores autorizados y trazados.'},
  {id:'energia-edificios',title:'Consumo energético de edificios',provider:'Consorcio piloto de energía',sector:'Energía',source:'federado',sourceLabel:'Federado',mode:'restringido',modeLabel:'Restringido',version:'2.0',coverage:'España · mensual',updated:'Mensual',format:'CSV y API',quality:'Cobertura declarada 91 %',lineage:'Medidores agregados por edificio',purpose:'Benchmark y eficiencia energética',license:'Uso no redistributivo',sla:'Disponibilidad objetivo 99,5 %',description:'Consumos normalizados por tipología para análisis comparativo y recomendaciones.'}
];

const grid=document.querySelector('#ds-grid');
const results=document.querySelector('#ds-resultados');
const q=document.querySelector('#ds-q');
const mode=document.querySelector('#ds-modalidad');
const source=document.querySelector('#ds-fuente');
const dialog=document.querySelector('#ds-dialog');
const dialogBody=document.querySelector('#ds-dialog-body');
const esc=(value)=>String(value).replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function render(){
  const term=q.value.trim().toLocaleLowerCase('es');
  const filtered=products.filter((p)=>`${p.title} ${p.provider} ${p.sector}`.toLocaleLowerCase('es').includes(term)&&(!mode.value||p.mode===mode.value)&&(!source.value||p.source===source.value));
  results.textContent=`${filtered.length} producto${filtered.length===1?'':'s'} de demostración`;
  grid.innerHTML=filtered.length?filtered.map((p)=>`<article class="pf-card pf-product-card"><div class="pf-card-top"><span class="pf-status pf-status-sim">Simulado</span><span class="pf-source">${esc(p.sourceLabel)}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><div class="pf-tags"><span class="pf-tag">${esc(p.sector)}</span><span class="pf-tag pf-rep">${esc(p.modeLabel)}</span></div><dl class="pf-card-facts"><div><dt>Proveedor</dt><dd>${esc(p.provider)}</dd></div><div><dt>Actualización</dt><dd>${esc(p.updated)}</dd></div><div><dt>Versión</dt><dd>${esc(p.version)}</dd></div></dl><button class="pf-ver" type="button" data-product="${esc(p.id)}">Ver condiciones y calidad</button></article>`).join(''):'<p class="pf-vacio">No hay productos que coincidan. Quita algún filtro o cambia la búsqueda.</p>';
}

function openProduct(p){
  dialogBody.innerHTML=`<span class="pf-status pf-status-sim">Simulado</span><h2 id="ds-dialog-title">${esc(p.title)}</h2><p>${esc(p.description)}</p><div class="pf-detail-grid"><section><h3>Producto</h3><dl><div><dt>Proveedor</dt><dd>${esc(p.provider)}</dd></div><div><dt>Versión</dt><dd>${esc(p.version)}</dd></div><div><dt>Cobertura</dt><dd>${esc(p.coverage)}</dd></div><div><dt>Formato</dt><dd>${esc(p.format)}</dd></div></dl></section><section><h3>Confianza</h3><dl><div><dt>Calidad</dt><dd>${esc(p.quality)}</dd></div><div><dt>Procedencia</dt><dd>${esc(p.lineage)}</dd></div><div><dt>Finalidad</dt><dd>${esc(p.purpose)}</dd></div><div><dt>Licencia</dt><dd>${esc(p.license)}</dd></div><div><dt>SLA</dt><dd>${esc(p.sla)}</dd></div></dl></section></div><div class="pf-acciones"><button class="pf-btn" type="button" data-demo-action="request">Simular solicitud de acceso</button><button class="pf-btn pf-sec" type="button" data-demo-action="jsonld">Ver JSON-LD</button><small>Estas acciones no envían información ni crean compromisos.</small></div>`;
  dialog.showModal();
}

document.querySelector('#ds-filtros').addEventListener('input',render);
grid.addEventListener('click',(event)=>{const button=event.target.closest('[data-product]');if(button)openProduct(products.find((p)=>p.id===button.dataset.product));});
dialog.querySelector('.pf-cerrar').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',(event)=>{if(event.target===dialog)dialog.close();});

const toast=document.querySelector('#ds-toast');
function showToast(text){toast.textContent=text;toast.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>{toast.hidden=true;},4200);}
document.addEventListener('click',(event)=>{const action=event.target.closest('[data-demo-action]');if(!action)return;const messages={pilot:'Piloto de ejemplo preparado: falta seleccionar organizaciones y validar derechos.',join:'Recorrido simulado: organización → rol → verificación → reglas → acuerdo → credencial.',publish:'Publicación simulada: borrador → validación → revisión → publicación.',request:'Solicitud simulada: no se ha enviado información.',jsonld:'La API v0.9 incluye exportación DCAT-AP/JSON-LD.'};showToast(messages[action.dataset.demoAction]);});

const run=document.querySelector('#ds-run');
const timeline=[...document.querySelectorAll('#ds-timeline li')];
const evidence=document.querySelector('#ds-evidence');
run.addEventListener('click',async()=>{
  run.disabled=true;evidence.hidden=true;
  timeline.forEach((item)=>{item.classList.remove('is-done');item.querySelector('b').textContent='Pendiente';});
  for(const item of timeline){await new Promise((resolve)=>setTimeout(resolve,260));item.classList.add('is-done');item.querySelector('b').textContent='Verificado';}
  evidence.hidden=false;evidence.focus();run.disabled=false;run.textContent='Repetir demostración';
});
document.querySelector('#ds-export').addEventListener('click',()=>{
  const payload={label:'SIMULADO',flowId:'DEMO-0001',events:timeline.map((item,index)=>({sequence:index+1,name:item.querySelector('strong').textContent,status:'verified'})),integrity:{algorithm:'SHA-256',status:'demo-verified'}};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='alianzaia-evidencia-DEMO-0001.json';a.click();URL.revokeObjectURL(url);
});
render();
