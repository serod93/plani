/* Recorrido guiado de Plani: se muestra la primera vez, se puede saltar y se reabre con «Ver tutorial». */
(function(){
  var KEY='plani-tutorial-v1';
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pasos=[
    {titulo:'Bienvenida a Plani',img:true,
     texto:'Plani te ayuda a repartir el tiempo de un taller: ves cada módulo en una línea de tiempo y lo ajustas arrastrando. Te muestro lo básico en menos de un minuto.'},
    {sel:'#title',titulo:'Ponle nombre a tu actividad',
     texto:'Escribe el nombre del taller o la jornada. Va en el encabezado de los archivos que exportes.'},
    {sel:'#barra',titulo:'Fija el horario',
     texto:'Define la fecha, la hora de inicio y la de término. Plani calcula cuánto dura el taller y puedes ver las duraciones en <b>minutos</b> o en <b>horas</b>.'},
    {sel:'#summary',titulo:'Mira cómo se reparte el tiempo',
     texto:'Aquí ves cuánto tiempo llevas asignado, cuánto queda libre y cómo se divide entre exposición y trabajo de los participantes.'},
    {sel:'#panel-linea',titulo:'Crea y ajusta módulos',
     texto:'Toca un espacio con <b>+</b> para crear un módulo. Después <b>arrastra el borde</b> izquierdo o derecho de un módulo para cambiar su inicio o su término, de a 5 minutos. También sirven las flechas del teclado. Con la vista <b>Ampliada</b> puedes deslizar para ver el detalle, y con <b>Compacta</b> ves todo el taller de un vistazo.'},
    {sel:'#panel-linea',titulo:'Si un módulo choca con otro',
     texto:'Cuando estiras un borde sobre el módulo vecino, Plani te pregunta qué hacer: <b>recortar</b> al vecino o <b>desplazar</b> todo el cronograma en esa dirección. Si no te convence, cancelas o deshaces.'},
    {sel:'#panel-modulos',titulo:'Detalla cada módulo',
     texto:'En la lista cambias el nombre, el tipo, las horas y la duración. El botón <b>Ficha</b> abre la descripción, el responsable y los recursos de ese módulo: escribe un recurso y presiona <b>Enter</b> para dejarlo como etiqueta. Si no abres la ficha, no estorba.'},
    {sel:'#panel-trans',titulo:'Recursos de todo el taller',
     texto:'Lo que usas en toda la jornada (proyector, plumones…) va aquí, una sola vez. Si un recurso se repite en varios módulos, Plani te sugiere hacerlo transversal.'},
    {sel:'#acts',titulo:'Exporta, comparte y vuelve',
     texto:'<b>Exportar PDF</b> te deja elegir qué incluir (por ejemplo, sin fichas para enviarlo a un cliente). También hay <b>Excel</b> y <b>Guardar para Plani</b>, un archivo editable que se abre con <b>Importar .plani</b>. Al exportar el PDF puedes sumar al final una <b>checklist de recursos</b> en una hoja aparte, para ir marcando lo que ya tienes. Todo se guarda en tu navegador mientras trabajas.'},
    {titulo:'Listo, a planificar',final:true,
     texto:'Puedes volver a este recorrido cuando quieras con <b>Ver tutorial</b>. Si prefieres practicar, cargo un ejemplo que puedes deshacer.'}
  ];
  var i=0, abierto=false, dim, spot, card, previo=null, raf=0, vigia=0;

  function visto(){try{return localStorage.getItem(KEY)==='1'}catch(e){return false}}
  function marcar(){try{localStorage.setItem(KEY,'1')}catch(e){}}

  function construir(){
    dim=document.createElement('div'); dim.className='tour-dim';
    spot=document.createElement('div'); spot.className='tour-spot';
    card=document.createElement('div'); card.className='tour-card';
    card.setAttribute('role','dialog'); card.setAttribute('aria-modal','true');
    card.setAttribute('aria-labelledby','tour-titulo'); card.setAttribute('aria-describedby','tour-texto');
    document.body.append(dim,spot,card);
  }

  function pintar(){
    var p=pasos[i], hay=window.PlaniApp&&window.PlaniApp.hayModulos();
    var puntos=''; for(var k=0;k<pasos.length;k++) puntos+='<i'+(k===i?' class="on"':'')+'></i>';
    var botones='<button type="button" class="tour-saltar" data-a="saltar">Saltar tutorial</button><span class="espacio"></span>';
    if(i>0) botones+='<button type="button" class="btn" data-a="atras">Atrás</button>';
    if(p.final){
      if(!hay) botones+='<button type="button" class="btn" data-a="ejemplo">Cargar un ejemplo</button>';
      botones+='<button type="button" class="btn primary" data-a="fin">Empezar</button>';
    }else botones+='<button type="button" class="btn primary" data-a="sig">Siguiente</button>';
    card.innerHTML=(p.img?'<img class="solo-dia" src="plimplam/hero-persona.webp" alt=""><img class="solo-noche" src="plimplam/hero-persona-noche.webp" alt="">':'')
      +'<div class="tour-paso">Paso '+(i+1)+' de '+pasos.length+'</div>'
      +'<h2 class="tour-titulo" id="tour-titulo">'+p.titulo+'</h2>'
      +'<p class="tour-texto" id="tour-texto">'+p.texto+'</p>'
      +'<div class="tour-puntos" aria-hidden="true">'+puntos+'</div>'
      +'<div class="tour-botones">'+botones+'</div>';
    var foco=card.querySelector('[data-a="sig"],[data-a="fin"]'); if(foco) foco.focus({preventScroll:true});
  }

  function objetivo(){var p=pasos[i];return p.sel?document.querySelector(p.sel):null}

  function ubicar(){
    raf=0; if(!abierto) return;
    var t=objetivo(), pad=8, vw=innerWidth, vh=innerHeight;
    if(!t){spot.style.display='none'; dim.style.display='block';
      card.style.left=Math.max(16,(vw-Math.min(400,vw-32))/2)+'px'; card.style.width=Math.min(400,vw-32)+'px';
      card.style.top=Math.max(16,(vh-card.offsetHeight)/2)+'px'; return}
    var r=t.getBoundingClientRect();
    dim.style.display='none'; spot.style.display='block';
    spot.style.left=(r.left-pad)+'px'; spot.style.top=(r.top-pad)+'px'; spot.style.width=(r.width+2*pad)+'px'; spot.style.height=(r.height+2*pad)+'px';
    var cw=Math.min(380,vw-32); card.style.width=cw+'px';
    var ch=card.offsetHeight, left=Math.min(Math.max(16,r.left),vw-cw-16), top;
    if(r.bottom+pad+12+ch<=vh-16) top=r.bottom+pad+12;
    else if(r.top-pad-12-ch>=16) top=r.top-pad-12-ch;
    else top=vh-ch-16;
    card.style.left=left+'px'; card.style.top=top+'px';
  }
  function pedirUbicar(){if(!raf) raf=setTimeout(ubicar,16)}

  function mostrar(){
    pintar();
    var t=objetivo();
    if(t){
      var r=t.getBoundingClientRect(), grande=r.height>innerHeight*.6;
      t.scrollIntoView({block:grande?'start':'center',behavior:reduce||document.hidden?'auto':'smooth'});
    }
    ubicar(); setTimeout(ubicar,reduce?0:420);
  }

  function ir(n){i=Math.max(0,Math.min(pasos.length-1,n)); mostrar()}
  function cerrar(){
    if(!abierto) return; abierto=false; marcar(); clearInterval(vigia); clearTimeout(raf); raf=0;
    dim.remove(); spot.remove(); card.remove();
    removeEventListener('resize',pedirUbicar); removeEventListener('scroll',pedirUbicar,true); removeEventListener('keydown',teclas,true);
    if(previo&&previo.focus) previo.focus(); previo=null;
  }
  function abrir(){
    if(abierto) return; abierto=true; i=0; previo=document.activeElement;
    construir();
    vigia=setInterval(ubicar,250); /* sigue al elemento aunque cambie el diseño o termine un desplazamiento */
    addEventListener('resize',pedirUbicar); addEventListener('scroll',pedirUbicar,true); addEventListener('keydown',teclas,true);
    card.addEventListener('click',function(e){
      var b=e.target.closest('[data-a]'); if(!b) return; var a=b.dataset.a;
      if(a==='sig') ir(i+1); else if(a==='atras') ir(i-1);
      else if(a==='saltar'||a==='fin') cerrar();
      else if(a==='ejemplo'){cerrar(); if(window.PlaniApp) window.PlaniApp.cargarEjemplo()}
    });
    mostrar();
  }
  function teclas(e){
    if(!abierto) return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cerrar();return}
    if(e.key==='ArrowRight'){e.preventDefault();ir(i+1);return}
    if(e.key==='ArrowLeft'){e.preventDefault();ir(i-1);return}
    if(e.key==='Tab'){
      var f=card.querySelectorAll('button'); if(!f.length) return;
      var a=f[0], z=f[f.length-1];
      if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}
      else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
      else if(!card.contains(document.activeElement)){e.preventDefault();a.focus()}
    }
  }

  document.getElementById('ver-tutorial').addEventListener('click',abrir);
  window.PlaniTutorial={abrir:abrir,cerrar:cerrar};
  if(!visto()) setTimeout(abrir,900);
})();
