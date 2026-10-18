/**
 * CHAMBEA V1 — operaciones compartidas entre usuarios.
 * Una única capa de datos y acciones sobre Firebase Auth / Firestore.
 * Los pagos son simulaciones explícitas: no se solicita tarjeta ni se mueve dinero.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, updateDoc, runTransaction } from 'firebase/firestore';

const app=initializeApp({
  apiKey:'AIzaSyDzRHFCHEOszcMUfONy3FpPyz7l-87DHYQ',
  authDomain:'chambea-app.firebaseapp.com', projectId:'chambea-app',
  storageBucket:'chambea-app.firebasestorage.app', messagingSenderId:'853197148466',
  appId:'1:853197148466:web:9c16f209f5a9c8eeec872b'
});
const auth=getAuth(app), db=getFirestore(app);
const C={user:null,ready:false,jobs:new Map(),quotes:new Map(),messages:new Map(),listeners:new Map(),jobStop:null,profileStop:null,noticeRead:new Set(),notices:[],agreements:new Map(),busy:false,errors:[],lastStatus:''};
const uid=()=>C.user?.uid||null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arg=s=>JSON.stringify(String(s)).replace(/"/g,'&quot;');
const money=v=>Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const stamp=v=>v?.toMillis?.()||v?.toDate?.()?.getTime?.()||0;
const shortDate=v=>stamp(v)?new Date(stamp(v)).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}):'';
const categories=['Plomería','Electricidad','Pintura','Albañilería','Carpintería','Aire acondicionado','Jardinería','Limpieza'];
const jobDoc=id=>doc(db,'chambea_jobs',String(id));
const quoteDoc=(id,p)=>doc(db,'chambea_jobs',String(id),'quotes',String(p));
const quoteCol=id=>collection(db,'chambea_jobs',String(id),'quotes');
const msgCol=(id,p)=>collection(db,'chambea_jobs',String(id),'quotes',String(p),'messages');
const msgKey=(id,p)=>String(id)+'/'+String(p);
const own=j=>Boolean(uid()&&j&&j.ownerUid===uid());
const job=id=>C.jobs.get(String(id))||null;
const qs=id=>C.quotes.get(String(id))||[];
const offer=(id,p)=>qs(id).find(q=>q.providerUid===p)||null;
const participant=j=>j&&(own(j)||j.acceptedProviderUid===uid());
const payText=p=>({unpaid:'Pendiente',declined:'Rechazado (simulado)',simulated_paid:'Aprobado (simulado)',released:'Liberado (simulado)'})[p]||'Sin iniciar';
const workText=w=>({accepted:'Pendiente de iniciar',started:'Trabajo iniciado',completed:'Trabajo terminado'})[w]||'Sin iniciar';
function msgError(ex){const c=ex?.code||'';
  if(c==='permission-denied')return 'Firebase rechazó esta acción. Revisa las reglas publicadas y la cuenta que inició sesión.';
  if(c==='auth/invalid-credential')return 'El correo o la contraseña no son correctos.';
  if(c==='auth/email-already-in-use')return 'Este correo ya tiene una cuenta. Utiliza Iniciar sesión.';
  if(c==='auth/weak-password')return 'Utiliza una contraseña de al menos seis caracteres.';
  if(c==='auth/network-request-failed'||c==='unavailable')return 'No hay conexión con Firebase. Revisa Internet.';
  if(c==='auth/too-many-requests')return 'Se realizaron demasiados intentos. Intenta más tarde.';
  return ex?.message||'No se pudo completar la acción.';
}
function alertError(ex){console.error('CHAMBEA V1',ex);toast(msgError(ex));}
function banner(s,isError=false){const el=document.getElementById('cloudStatus');if(!el)return;C.lastStatus=s;
  el.textContent=s;el.style.cssText='position:fixed;z-index:90;left:50%;top:0;transform:translateX(-50%);max-width:480px;width:100%;padding:4px 10px;text-align:center;font:600 11px system-ui;color:white;pointer-events:none;background:'+(isError?'#a52626':'#005450')+';';
  if(!isError&&s==='Conectado a Firebase · CHAMBEA V1'){el.style.opacity='.78';el.style.fontSize='9px';el.style.padding='2px';}
}
function guard(){if(uid())return true;toast('Primero inicia sesión para compartir las operaciones entre celulares.');S.auth='login';go('auth');return false;}
function btn(text,action,kind='primary',extra=''){return '<button type="button" class="btn '+kind+'" '+extra+' onclick="'+action+'">'+text+'</button>';}
function sectionTitle(t,side=''){return '<div class="section-title"><h2>'+esc(t)+'</h2>'+side+'</div>';}
function note(text){return '<div class="notice" style="margin-top:14px">'+text+'</div>';}
function shell(title,subtitle,content){return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">'+esc(title)+'</h1>'+(subtitle?'<p class="sub">'+subtitle+'</p>':'')+content+'</div>';}
function empty(title,desc,action=''){return '<div class="empty">'+ico('file')+'<h3>'+esc(title)+'</h3><p>'+esc(desc)+'</p>'+action+'</div>';}
function safeRender(force=false){
  if(!C.ready)return;
  const active=document.activeElement;
  const editing=active&&['INPUT','TEXTAREA','SELECT'].includes(active.tagName)&&document.getElementById('app')?.contains(active);
  // En el chat sí actualizamos mensajes sin perder el borrador que se está escribiendo.
  const chatDraft=editing&&S.page==='chat'&&active.id==='msg'?active.value:null;
  if(!force&&editing&&chatDraft===null)return;
  try{
    render();
    if(chatDraft!==null){const target=document.getElementById('msg');if(target){target.value=chatDraft;target.focus();}}
  }catch(ex){console.error('Render V1',ex);banner('No se pudo actualizar una pantalla',true)}
}
function route(page,id){if(id!==undefined)return go(page,id);return go(page);}
function rememberRead(){try{localStorage.setItem('chambea_v1_read_'+uid(),JSON.stringify([...C.noticeRead].slice(-400)))}catch{}}
function markRead(id){C.noticeRead.add(id);rememberRead();}
function clean(){
  if(C.jobStop){C.jobStop();C.jobStop=null;}
  if(C.profileStop){C.profileStop();C.profileStop=null;}
  for(const stop of C.listeners.values())try{stop()}catch{}
  C.listeners.clear();C.jobs.clear();C.quotes.clear();C.messages.clear();C.agreements.clear();C.notices=[];
  data.jobs=[];data.messages={};
}
function addWatch(k,ref,fn){if(C.listeners.has(k))return;
  try{const stop=onSnapshot(ref,fn,ex=>{console.error('Firebase listener '+k,ex);banner(msgError(ex),true)});C.listeners.set(k,stop)}catch(ex){alertError(ex)}
}
function watchChat(id,p){addWatch('msg/'+msgKey(id,p),query(msgCol(id,p),orderBy('createdAt','asc'),limit(150)),snap=>{
  C.messages.set(msgKey(id,p),snap.docs.map(x=>({id:x.id,...x.data()})));
  notices();safeRender();
});}
function watchQuotes(j){
  if(own(j)){
    addWatch('owner/'+j.id,quoteCol(j.id),snap=>{
      let arr=snap.docs.map(x=>({id:x.id,...x.data(),providerUid:x.id})).sort((a,b)=>stamp(a.createdAt)-stamp(b.createdAt));
      C.quotes.set(j.id,arr);
      for(const q of arr)watchChat(j.id,q.providerUid);
      syncLegacy();notices();safeRender();
    });
  }else{
    addWatch('provider/'+j.id,quoteDoc(j.id,uid()),snap=>{
      const arr=snap.exists()?[{id:snap.id,...snap.data(),providerUid:snap.id}]:[];
      C.quotes.set(j.id,arr);if(arr.length)watchChat(j.id,uid());
      syncLegacy();notices();safeRender();
    });
  }
}
function syncLegacy(){data.jobs=[...C.jobs.values()].map(j=>({
  id:j.id,ownerUid:j.ownerUid,cat:j.category,desc:j.description,city:j.zone,
  budget:j.budget,created:stamp(j.createdAt),mine:own(j),cloud:true,
  status:j.status==='open'?'publicado':j.status==='accepted'?'aceptado':'finalizado',
  offers:qs(j.id).map(q=>({...q,name:q.providerName,price:q.amount,message:q.note})),
  accepted:j.acceptedProviderUid?Math.max(0,qs(j.id).findIndex(q=>q.providerUid===j.acceptedProviderUid)):null
}));}
function startSession(user){
  C.ready=true;
  try{C.noticeRead=new Set(JSON.parse(localStorage.getItem('chambea_v1_read_'+user.uid)||'[]'))}catch{C.noticeRead=new Set()}
  try{data.mode=localStorage.getItem('chambea_v1_mode_'+user.uid)==='profesional'?'profesional':'cliente'}catch{data.mode='cliente'}
  C.profileStop=onSnapshot(doc(db,'usuarios',user.uid),snap=>{
    const p=snap.exists()?snap.data():{};
    data.account={name:p.name||data.account.name||'',email:user.email||'',city:p.zone||'Guadalajara',specialty:p.skill||'Plomería',bio:p.bio||''};
    data.session=true;safeRender();
  },ex=>banner(msgError(ex),true));
  C.jobStop=onSnapshot(query(collection(db,'chambea_jobs'),orderBy('createdAt','desc'),limit(100)),snap=>{
    const before=new Set(C.jobs.keys());C.jobs.clear();
    for(const row of snap.docs){C.jobs.set(row.id,{id:row.id,...row.data()});before.delete(row.id);}
    for(const id of before){for(const k of [...C.listeners.keys()])if(k.startsWith('owner/'+id)||k.startsWith('provider/'+id)||k.startsWith('msg/'+id+'/')||k==='agreement/'+id){
      C.listeners.get(k)();C.listeners.delete(k);}C.quotes.delete(id);C.agreements.delete(id);}
    for(const j of C.jobs.values()){watchQuotes(j);if(j.status==='accepted')watchAgreement(j);}
    syncLegacy();notices();banner('Conectado a Firebase · CHAMBEA V1');safeRender();
  },ex=>banner(msgError(ex),true));
  data.session=true;
  if(['welcome','auth'].includes(S.page)){S.previous=[];S.page=data.mode==='profesional'?'proHome':'home';}
  safeRender(true);
}
onAuthStateChanged(auth,user=>{
  if(C.user?.uid===user?.uid&&C.ready)return;
  clean();C.user=user||null;C.ready=true;
  if(!user){data.session=false;data.account={name:'',email:'',city:'Guadalajara',specialty:'Plomería',bio:''};
    if(!['welcome','auth'].includes(S.page)){S.page='welcome';S.previous=[];}
    banner('CHAMBEA V1 · Inicia sesión');safeRender(true);return;
  }
  banner('Conectando con Firebase...');startSession(user);
});
function makeNotice(id,title,description,page,j,p,time){C.notices.push({id,title,description,page,jobId:j,providerUid:p,time:stamp(time)});}
function notices(){C.notices=[];if(!uid())return;
  for(const j of C.jobs.values()){
    if(own(j)){
      makeNotice('job/'+j.id,'Solicitud publicada',j.category+' · '+j.zone,'job',j.id,null,j.createdAt);
      for(const q of qs(j.id))makeNotice('quote/'+j.id+'/'+q.providerUid+'/'+q.status,
          q.status==='rejected'?'Presupuesto rechazado':q.status==='changes_requested'?'Modificación solicitada':'Cotización recibida',
          q.providerName+' · '+money(q.amount),'quotes',j.id,q.providerUid,q.updatedAt||q.createdAt);
    } else if(j.status==='open')makeNotice('available/'+j.id,'Nueva oportunidad',j.category+' · '+j.zone,'opportunities',j.id,null,j.createdAt);
    if(j.status==='accepted'&&(own(j)||j.acceptedProviderUid===uid())){
      makeNotice('assigned/'+j.id,own(j)?'Contratación confirmada':'Tu cotización fue aceptada',j.category+' · '+money(j.acceptedAmount),'tracking',j.id,j.acceptedProviderUid,j.updatedAt);
      if(j.paymentStatus&&j.paymentStatus!=='unpaid')makeNotice('paid/'+j.id+'/'+j.paymentStatus,'Estado del pago ficticio',payText(j.paymentStatus)+' · '+money(j.acceptedAmount),'wallet',j.id,null,j.updatedAt);
      if(j.workStatus==='completed')makeNotice('completed/'+j.id,'Trabajo terminado',j.category+' · confirma la liberación ficticia','tracking',j.id,null,j.updatedAt);
    }
  }
  for(const j of C.jobs.values()){
    if(!own(j)){
      const mine=offer(j.id,uid());
      if(mine)makeNotice('offerstatus/'+j.id+'/'+mine.status,
        mine.status==='changes_requested'?'Tu presupuesto necesita cambios':mine.status==='rejected'?'El cliente rechazó tu presupuesto':j.acceptedProviderUid===uid()?'Fuiste contratado':'Cotización enviada',
        j.category+' · '+money(mine.amount),mine.status==='changes_requested'?'worklist':'worklist',j.id,uid(),mine.updatedAt||mine.createdAt);
    }
    const a=agreement(j.id);
    if(j.status==='accepted'&&a&&participant(j)){
      makeNotice('schedule/'+j.id+'/'+a.appointmentStatus+'/'+(stamp(a.updatedAt)||0),
        a.appointmentStatus==='proposed'?'Propuesta de fecha recibida':a.appointmentStatus==='confirmed'?'Fecha de servicio confirmada':'Agenda de servicio',
        j.category+' · '+scheduleState(a),'tracking',j.id,j.acceptedProviderUid,a.updatedAt);
      if(a.revisionStatus==='pending'||a.revisionStatus==='approved'||a.revisionStatus==='rejected')
        makeNotice('revision/'+j.id+'/'+a.revisionStatus,
          a.revisionStatus==='pending'?'Recotización pendiente de respuesta':a.revisionStatus==='approved'?'Nuevo presupuesto aceptado':'Nuevo presupuesto rechazado',
          j.category+' · '+money(a.revisedAmount||j.acceptedAmount),'tracking',j.id,j.acceptedProviderUid,a.updatedAt);
    }
  }
  for(const [k,items] of C.messages){const [j,p]=k.split('/');for(const m of items){if(m.senderUid!==uid())makeNotice('msg/'+j+'/'+p+'/'+m.id,'Nuevo mensaje',String(m.body||'').slice(0,80),'chat',j,p,m.createdAt)}}
  C.notices.sort((a,b)=>b.time-a.time);C.notices=C.notices.slice(0,100);
  const badge=document.getElementById('v1NoticeBadge');if(badge)badge.textContent=String(C.notices.filter(n=>!C.noticeRead.has(n.id)).length||'');
}
function jumpNotice(id){const n=C.notices.find(x=>x.id===id);if(!n)return;
  markRead(id);
  if(n.page==='chat')return openChatFor(n.jobId,n.providerUid);
  if(['job','quotes','tracking'].includes(n.page))return route(n.page,n.jobId);
  route(n.page);
}
window.openNotice=jumpNotice;

// Pantallas: únicamente muestran opciones respaldadas por acciones reales.
window.topbar=function(){const count=C.notices.filter(n=>!C.noticeRead.has(n.id)).length;
  return '<header class="top">'+logo(155)+'<div class="actions"><button class="headbutton '+(count?'alert':'')+'" aria-label="Notificaciones" onclick="go(\'notifications\')">'+ico('bell')+(count?'<span id="v1NoticeBadge" style="font-size:9px;color:#f60">'+count+'</span>':'<span id="v1NoticeBadge"></span>')+'</button><button class="headbutton" aria-label="Mi perfil" onclick="go(\'profile\')">'+ico('user')+'</button></div></header>';
};
window.welcome=function(){return '<div class="welcome-page"><div class="welcome-photo"><div class="copy">'+logo(205)+'<h1>Tu hogar en<br><span class="orange">buenas manos</span></h1><p>Encuentra ayuda para tu hogar y solicita cotizaciones de profesionales registrados.</p></div></div><div class="welcome-foot"><div class="welcomefeat"><div class="item">'+ico('search')+'Elige un<br>servicio</div><div class="item">'+ico('file')+'Recibe<br>cotizaciones</div><div class="item">'+ico('calendar')+'Contrata y<br>coordina</div></div>'+btn('Crear cuenta '+ico('arrow'),"authMode('register')",'primary block')+btn('Iniciar sesión',"authMode('login')",'outline block','style="margin-top:10px"')+'<p class="sub" style="font-size:11px;margin-top:16px">CHAMBEA V1 · Para contratar o trabajar necesitas registrarte. Los pagos disponibles son exclusivamente simulaciones.</p></div></div>';};
window.auth=function(){const reg=S.auth==='register';return '<div class="authwrap">'+logo(210)+head(reg?'Crear mi cuenta':'Entrar a CHAMBEA')+
  '<p class="sub">La cuenta funciona en todos tus celulares. Utiliza el mismo correo para acceder desde distintos equipos.</p><form onsubmit="enterDemo(event)">'+
  (reg?'<div class="field"><label class="label">Nombre completo</label><input class="control" id="regname" required maxlength="70" autocomplete="name" placeholder="Tu nombre"></div>':'')+
  '<div class="field"><label class="label">Correo electrónico</label><input class="control" id="regemail" required type="email" autocomplete="email" placeholder="tu@correo.com"></div>'+
  '<div class="field"><label class="label">Contraseña</label><input class="control" id="regpassword" required type="password" minlength="6" autocomplete="'+(reg?'new-password':'current-password')+'" placeholder="Mínimo 6 caracteres"></div>'+
  (reg?'<div class="field"><label class="label">Ciudad</label><select id="regcity" class="control">'+cityOptions('Guadalajara')+'</select></div>':'')+
  '<button class="btn primary block" type="submit">'+(reg?'Crear cuenta':'Iniciar sesión')+' '+ico('arrow')+'</button></form>'+
  '<div class="stack" style="margin-top:12px">'+btn(reg?'Ya tengo cuenta':'Crear una cuenta nueva',"authMode('"+(reg?'login':'register')+"')",'outline block')+
  (!reg?btn('Olvidé mi contraseña',"resetPassword()",'pale block'):'')+'</div>'+note('La contratación y los pagos en esta versión son simulados; no se procesan tarjetas ni dinero.')+'</div>';
};
window.enterDemo=async function(ev){ev.preventDefault();if(C.busy)return;C.busy=true;const b=ev.target.querySelector('button[type=submit]');if(b)b.disabled=true;
  const email=document.getElementById('regemail')?.value.trim()||'',password=document.getElementById('regpassword')?.value||'';
  try{
    if(S.auth==='register'){
      const name=document.getElementById('regname')?.value.trim()||'';
      if(name.length<2||name.length>70)throw Error('Escribe un nombre válido.');
      const city=document.getElementById('regcity')?.value||'Guadalajara';
      const created=await createUserWithEmailAndPassword(auth,email,password);
      await setDoc(doc(db,'usuarios',created.user.uid),{name,zone:city,skill:'Plomería',bio:'',email:created.user.email,updatedAt:serverTimestamp()},{merge:true});
      data.account={name,city,email,specialty:'Plomería',bio:''};
    } else await signInWithEmailAndPassword(auth,email,password);
    S.previous=[];S.page='home';safeRender(true);
  }catch(ex){alertError(ex)}finally{C.busy=false;if(b?.isConnected)b.disabled=false}
};
window.resetPassword=async function(){const email=document.getElementById('regemail')?.value.trim();if(!email)return toast('Escribe tu correo y después pulsa Recuperar contraseña.');
  try{await sendPasswordResetEmail(auth,email);toast('Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.')}catch(ex){alertError(ex)}
};
window.guest=function(){toast('Regístrate para utilizar CHAMBEA entre celulares.');authMode('register')};
window.chambeaLogout=async function(){try{await signOut(auth);S.page='welcome';S.previous=[];render();toast('Sesión cerrada.')}catch(ex){alertError(ex)}};
window.navigateMode=function(mode){if(!guard())return;data.mode=mode==='profesional'?'profesional':'cliente';
  try{localStorage.setItem('chambea_v1_mode_'+uid(),data.mode)}catch{}
  S.page=data.mode==='cliente'?'home':'proHome';S.previous=[];safeRender(true);window.scrollTo(0,0);
};
const originalGo=window.go;
window.go=function(page,arg){if(!uid()&&!['welcome','auth'].includes(page)){S.auth='login';return originalGo('auth')};return originalGo(page,arg)};
window.home=function(){if(!guard())return '';
  const mine=[...C.jobs.values()].filter(own),recent=mine.slice(0,2);
  return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">Hola, '+esc((data.account.name||'bienvenido').split(' ')[0])+'</h1><p class="sub">'+ico('pin','inlineicon')+' '+esc(data.account.city||'Guadalajara')+', Jalisco</p>'+ 
   '<div class="hero-banner" style="margin-top:15px"><div class="copy"><h2>Encuentra<br><span class="orange">expertos</span> cerca de ti</h2><p>Plomería, electricidad, pintura y más.</p>'+btn('Publicar mi solicitud '+ico('arrow'),"startPost()",'primary small')+'</div></div>'+ 
   sectionTitle('Categorías de servicios',btn('Ver todas →',"go('explore')",'link'))+catTiles()+
   sectionTitle('Tus solicitudes',btn('Ver todas →',"go('jobs')",'link'))+
   (recent.length?recent.map(j=>jobPreview(j)).join(''):empty('Tu primera solicitud','Publica lo que necesitas y otros usuarios podrán cotizar.',btn('Publicar solicitud',"startPost()")))+
   '<div class="stack" style="margin-top:17px">'+btn('Explorar servicios',"go('explore')",'outline block')+btn('Consultar mensajes',"go('messages')",'pale block')+'</div></div>';
};
window.explore=function(){
 const filter=(S.search||'').toLowerCase().trim(),found=categories.filter(c=>c.toLowerCase().includes(filter));
 return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">Explorar servicios</h1><p class="sub">Elige el oficio que necesitas y publica tu solicitud para recibir cotizaciones de usuarios reales.</p>'+ 
 '<div class="search" style="margin:17px 0">'+ico('search')+'<input type="search" id="query" value="'+esc(S.search)+'" placeholder="Buscar servicio" oninput="searchChanged(this.value)"></div>'+ 
 '<div id="v1Categories">'+categoryRows(found)+'</div>'+ 
 note('Los perfiles e identidades aún no cuentan con verificación. No mostramos reseñas ficticias.')+
 '<div class="stack" style="margin-top:15px">'+btn('Publicar solicitud',"startPost()",'primary block')+'</div></div>';
};
function categoryRows(arr){return arr.length?'<div class="tilegrid">'+arr.map(c=>'<button type="button" class="tile" onclick="go(\'category\','+arg(c)+')"><div class="graphic">'+ico((CATS.find(x=>x[0]===c)||[])[1]||'wrench')+'</div><span>'+esc(c)+'</span></button>').join('')+'</div>':empty('Sin resultados','Prueba escribir otro servicio.');}
window.searchChanged=function(v){S.search=v;const box=document.getElementById('v1Categories');if(box)box.innerHTML=categoryRows(categories.filter(x=>x.toLowerCase().includes(v.trim().toLowerCase())))};
window.category=function(){const cat=S.cat||'Plomería';return shell(cat,'Publica una solicitud y recibe propuestas reales de usuarios registrados.',
 '<div class="service-hero" style="margin-top:15px"><div class="text"><h1>'+esc(cat)+'</h1><p>Compararás precios, plazos y condiciones antes de aceptar.</p></div></div>'+ 
 '<div class="squares" style="margin-top:16px"><div><strong>1</strong><small>Publica</small></div><div><strong>2</strong><small>Recibe cotizaciones</small></div><div><strong>3</strong><small>Contrata</small></div></div>'+ 
 '<div class="stack" style="margin-top:20px">'+btn('Solicitar cotización '+ico('arrow'),"startPost("+arg(cat)+")",'primary block')+btn('Ver mis solicitudes',"go('jobs')",'outline block')+'</div>');
};
window.provider=function(){return shell('Profesionales','Actualmente puedes conocer al proveedor cuando recibas una cotización.',
 empty('Directorio en preparación','No mostramos perfiles inventados como si fueran profesionales registrados.',btn('Solicitar un servicio',"go('explore')")));
};
window.post=function(){return topbar()+'<div class="area" style="padding-top:13px">'+head('Nueva solicitud')+'<h1 class="headline">¿Qué trabajo necesitas?</h1><p class="sub">La solicitud aparecerá para otros usuarios con cuenta en CHAMBEA.</p>'+ 
 '<form id="postform" onsubmit="submitPost(event)"><div class="field"><label class="label" for="service">Servicio</label><select class="control" id="service">'+categories.map(c=>'<option '+(S.cat===c?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+ 
 '<div class="field"><label class="label" for="description">Describe el trabajo</label><textarea class="control" id="description" required minlength="10" maxlength="1200" placeholder="Ej. Necesito pintar dos habitaciones de mi casa..."></textarea></div>'+ 
 '<div class="field"><label class="label" for="locality">Ciudad</label><select class="control" id="locality">'+cityOptions(data.account.city)+'</select></div>'+ 
 '<div class="field"><label class="label" for="budget">Presupuesto aproximado (MXN)</label><input class="control" id="budget" type="number" min="0" max="10000000" step="1" inputmode="decimal" placeholder="Ej. 2500"></div>'+ 
 note('Evita publicar direcciones exactas, teléfonos o datos personales. Compártelos por el chat únicamente cuando sea necesario.')+
 '<button class="btn primary block" style="margin-top:18px" type="submit">Publicar solicitud '+ico('arrow')+'</button></form></div>';
};
window.submitPost=async function(ev){ev.preventDefault();if(!guard()||C.busy)return;
 const category=document.getElementById('service')?.value||'Plomería',description=document.getElementById('description')?.value.trim()||'',zone=document.getElementById('locality')?.value||'Guadalajara';
 const budget=Number(document.getElementById('budget')?.value||0);
 if(description.length<10||description.length>1200||zone.length<2||!Number.isFinite(budget)||budget<0||budget>10000000)return toast('Revisa la descripción, la ciudad y el presupuesto.');
 C.busy=true;const b=ev.target.querySelector('button[type=submit]');b.disabled=true;
 try{const created=await addDoc(collection(db,'chambea_jobs'),{ownerUid:uid(),category,description,zone,budget,status:'open',createdAt:serverTimestamp()});
 S.jobid=created.id;S.previous=[];S.page='job';S.cat='';safeRender(true);toast('Solicitud publicada: otros celulares podrán verla.');
 }catch(ex){alertError(ex)}finally{C.busy=false;if(b?.isConnected)b.disabled=false}
};
function jobPreview(j,provider=false){let count=qs(j.id).length;
 const status=j.status==='open'?'Abierta':'Contratada';
 return '<div class="request-card"><div class="between"><h3>'+esc(j.category)+'</h3><span class="badge neutral">'+status+'</span></div><p>'+esc(j.description)+'</p><p>'+ico('pin','inlineicon')+' '+esc(j.zone)+' · '+money(j.budget)+'</p>'+ 
 '<div class="between"><span class="muted">'+(own(j)?count+' cotización(es)':'')+'</span>'+btn(provider?'Ver solicitud':'Abrir solicitud',"go('job',"+arg(j.id)+")",'primary small')+'</div></div>';
}
window.jobs=function(){const mine=[...C.jobs.values()].filter(own);
 return shell('Mis solicitudes','Aquí encontrarás tus solicitudes, cotizaciones y servicios contratados.',
 '<div class="stack" style="margin:16px 0">'+btn('Publicar nueva solicitud '+ico('plus'),"startPost()",'primary block')+'</div>'+ 
 '<div class="stack">'+(mine.length?mine.map(j=>jobPreview(j)).join(''):empty('Sin solicitudes','Publica tu primera solicitud desde CHAMBEA.'))+'</div>');
};
window.job=function(){const j=job(S.jobid);if(!j)return shell('Solicitud','Todavía se está cargando o ya no está disponible.',btn('Volver a solicitudes',"go('jobs')"));
 const mine=own(j),myQuote=offer(j.id,uid());
 return topbar()+'<div class="area" style="padding-top:13px">'+head('Detalle de solicitud')+
 '<div class="request-card"><div class="between"><h2>'+esc(j.category)+'</h2><span class="badge">'+(j.status==='open'?'Abierta':'Contratada')+'</span></div><p>'+esc(j.description)+'</p><div class="separator"></div><p>'+ico('pin','inlineicon')+' '+esc(j.zone)+'</p><p>'+ico('money','inlineicon')+' Presupuesto: '+money(j.budget)+'</p><small class="muted">'+shortDate(j.createdAt)+'</small></div>'+ 
 '<div class="stack" style="margin-top:15px">'+
 (mine?btn('Ver cotizaciones ('+qs(j.id).length+')',"go('quotes',"+arg(j.id)+")",'primary block'):j.status==='open'&&!myQuote?btn('Enviar cotización',"offerForm("+arg(j.id)+")",'primary block'):'')+
 (myQuote?btn('Abrir chat con el cliente',"openChatFor("+arg(j.id)+","+arg(uid())+")",'outline block'):'')+
 (j.status==='accepted'&&participant(j)?btn('Seguimiento y pago simulado',"go('tracking',"+arg(j.id)+")",'primary block'):'')+
 (mine?btn('Mis solicitudes',"go('jobs')",'outline block'):btn('Ver otras oportunidades',"go('opportunities')",'outline block'))+'</div>'+note('Solo la persona que publicó la solicitud puede aceptar una cotización.')+'</div>';
};
window.quotes=function(){const j=job(S.jobid);if(!j||!own(j))return shell('Cotizaciones','Solo el cliente que publicó la solicitud puede consultar todas sus ofertas.',btn('Ir a mis solicitudes',"go('jobs')"));
 const arr=qs(j.id);return topbar()+'<div class="area" style="padding-top:13px">'+head('Cotizaciones recibidas')+'<h1 class="headline">'+esc(j.category)+'</h1><p class="sub">'+arr.length+' propuestas recibidas. Solo puedes aceptar una.</p>'+ 
 '<div class="stack" style="margin-top:17px">'+(arr.length?arr.map(q=>'<div class="quote-card"><div class="between"><h3>'+esc(q.providerName||'Profesional')+'</h3><strong>'+money(q.amount)+'</strong></div><p>'+esc(q.note)+'</p><p class="sub">Usuario registrado · identidad no verificada</p>'+ 
 (j.acceptedProviderUid===q.providerUid?'<p class="badge">Oferta aceptada</p>':'')+
 '<div class="grid2">'+btn('Conversar',"openChatFor("+arg(j.id)+","+arg(q.providerUid)+")",'outline')+
 (j.status==='open'?btn('Aceptar oferta',"acceptQuote("+arg(j.id)+","+arg(q.providerUid)+")"):'')+'</div></div>').join(''):empty('Sin cotizaciones todavía','En otro celular cambia a Ofrezco servicios y cotiza esta solicitud.'))+'</div>'+
 (j.status==='accepted'?'<div class="stack" style="margin-top:16px">'+btn('Seguir servicio',"go('tracking',"+arg(j.id)+")",'primary block')+'</div>':'')+'</div>';
};
window.proHome=function(){const opportunities=[...C.jobs.values()].filter(j=>j.status==='open'&&!own(j));const selected=[...C.jobs.values()].filter(j=>j.acceptedProviderUid===uid());
 const sent=[...C.jobs.values()].filter(j=>offer(j.id,uid()));
 return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">Hola, <span class="orange">'+esc((data.account.name||'profesional').split(' ')[0])+'</span></h1><p class="sub">Panel profesional · CHAMBEA V1</p>'+ 
 '<div class="statrow" style="margin-top:15px"><div><div class="tiny">Solicitudes</div><div class="big">'+opportunities.length+'</div></div><div style="background:#fff6ed"><div class="tiny">Cotizadas</div><div class="big">'+sent.length+'</div></div><div style="background:#eaf8f4"><div class="tiny">Trabajos asignados</div><div class="big">'+selected.length+'</div></div></div>'+ 
 '<div class="stack" style="margin-top:17px">'+btn('Ver oportunidades y cotizar',"go('opportunities')",'primary block')+btn('Mis cotizaciones y trabajos',"go('worklist')",'outline block')+btn('Mi billetera simulada',"go('wallet')",'pale block')+'</div>'+ 
 sectionTitle('Mis servicios aceptados')+'<div class="stack">'+(selected.length?selected.map(j=>'<div class="request-card"><h3>'+esc(j.category)+'</h3><p>'+workText(j.workStatus)+' · '+payText(j.paymentStatus)+'</p>'+btn('Abrir seguimiento',"go('tracking',"+arg(j.id)+")",'primary small')+'</div>').join(''):empty('Aún no tienes trabajos asignados','Envía cotizaciones para comenzar.'))+'</div></div>';
};
window.opportunities=function(){const list=[...C.jobs.values()].filter(j=>j.status==='open'&&!own(j));
 return shell('Oportunidades','Solicitudes de otros usuarios registrados. Aquí puedes enviar una cotización.',
 '<div class="stack" style="margin-top:17px">'+(list.length?list.map(j=>'<div class="request-card"><div class="between"><h3>'+esc(j.category)+'</h3><span class="badge neutral">Abierta</span></div><p>'+esc(j.description)+'</p><p>'+esc(j.zone)+' · '+money(j.budget)+'</p>'+ 
 '<div class="stack">'+(offer(j.id,uid())?btn('Ver mi cotización y conversar',"openChatFor("+arg(j.id)+","+arg(uid())+")",'outline block'):btn('Cotizar esta solicitud',"offerForm("+arg(j.id)+")",'primary block'))+'</div></div>').join(''):empty('Sin nuevas solicitudes','Cuando un cliente publique, aparecerá aquí.'))+'</div>');
};
window.offerForm=function(id){if(!guard())return;const j=job(id);if(!j)return toast('Esta solicitud ya no está disponible.');if(own(j))return toast('No puedes cotizar tu propia solicitud.');
 if(j.status!=='open')return toast('El cliente ya contrató un proveedor.');if(offer(j.id,uid()))return toast('Ya enviaste una cotización para esta solicitud.');
 S.offer=j;S.jobid=id;S.offerOpen=true;route('worklist');
};
window.worklist=function(){const list=[...C.jobs.values()].flatMap(j=>qs(j.id).filter(q=>q.providerUid===uid()).map(q=>({j,q})));
 const j=S.offerOpen&&S.offer?job(S.offer.id):null;
 return shell('Mis cotizaciones','Revisa tus propuestas, conversaciones y trabajos aceptados.',
 (j?'<form class="panel" onsubmit="sendOffer(event)" style="padding:17px;margin:16px 0"><h3>Cotizar: '+esc(j.category)+'</h3><p class="sub">'+esc(j.description)+'</p>'+ 
 '<div class="field"><label class="label">Precio ofrecido (MXN)</label><input class="control" id="offerPrice" required type="number" min="1" max="10000000" step="1" placeholder="Ej. 1800"></div>'+ 
 '<div class="field"><label class="label">Qué incluye tu oferta y cuándo puedes realizarla</label><textarea class="control" id="offerText" required minlength="10" maxlength="1000" placeholder="Incluye mano de obra..." ></textarea></div>'+ 
 '<button class="btn primary block" type="submit">Enviar cotización</button>'+btn('Cancelar',"cancelOffer()",'outline block','style="margin-top:10px"')+'</form>':'')+
 '<div class="stack" style="margin-top:17px">'+(list.length?list.map(({j,q})=>'<div class="request-card"><div class="between"><h3>'+esc(j.category)+'</h3><span class="badge">'+(j.acceptedProviderUid===uid()?'Contratado':j.status==='open'?'Enviada':'No seleccionada')+'</span></div><p>'+esc(j.description)+'</p><p><strong>'+money(q.amount)+'</strong></p><p>'+esc(q.note)+'</p>'+ 
 '<div class="stack">'+btn('Abrir chat',"openChatFor("+arg(j.id)+","+arg(uid())+")",'outline block')+
 (j.acceptedProviderUid===uid()?btn('Seguimiento y cobros',"go('tracking',"+arg(j.id)+")",'primary block'):'')+'</div></div>').join(''):empty('Aún no has cotizado','Explora solicitudes y envía tu primera propuesta.',btn('Ver oportunidades',"go('opportunities')")))+'</div>');
};
window.cancelOffer=function(){S.offerOpen=false;S.offer=null;safeRender(true)};
window.sendOffer=async function(ev){ev.preventDefault();if(!guard()||C.busy)return;
 const j=job(S.offer?.id);if(!j||j.ownerUid===uid()||j.status!=='open')return toast('No está disponible esa oportunidad.');
 const amount=Number(document.getElementById('offerPrice')?.value||0),note=document.getElementById('offerText')?.value.trim()||'';
 if(!Number.isFinite(amount)||amount<=0||amount>10000000||note.length<10||note.length>1000)return toast('Escribe un precio válido y una descripción de al menos diez caracteres.');
 C.busy=true;const b=ev.target.querySelector('button[type=submit]');b.disabled=true;
 try{
   if((await getDoc(quoteDoc(j.id,uid()))).exists())throw Error('Ya cotizaste este trabajo. Puedes abrir el chat con el cliente.');
   await setDoc(quoteDoc(j.id,uid()),{providerUid:uid(),clientUid:j.ownerUid,providerName:(data.account.name||'Profesional').slice(0,70),amount,note,status:'sent',createdAt:serverTimestamp()});
   S.offerOpen=false;S.offer=null;safeRender(true);toast('Propuesta enviada. El cliente podrá verla desde otro celular.');
 }catch(ex){alertError(ex)}finally{C.busy=false;if(b?.isConnected)b.disabled=false}
};
window.acceptQuote=async function(id,p){if(!guard()||C.busy)return;const j=job(id);if(!j||!own(j)||j.status!=='open')return toast('Esta oferta ya no se puede aceptar.');
 if(!confirm('¿Aceptar esta cotización? El pago que aparece después es exclusivamente SIMULADO.'))return;
 C.busy=true;
 try{await runTransaction(db,async tx=>{
   const [a,b]=await Promise.all([tx.get(jobDoc(id)),tx.get(quoteDoc(id,p))]);
   if(!a.exists()||a.data().ownerUid!==uid()||a.data().status!=='open'||!b.exists())throw Error('La oferta dejó de estar disponible.');
   tx.update(jobDoc(id),{status:'accepted',acceptedProviderUid:p,acceptedAmount:b.data().amount,paymentStatus:'unpaid',workStatus:'accepted',updatedAt:serverTimestamp()});
 });S.jobid=id;route('tracking',id);toast('Oferta aceptada. El proveedor verá la contratación.');
 }catch(ex){alertError(ex)}finally{C.busy=false}
};
window.tracking=function(){const j=job(S.jobid);if(!j||j.status!=='accepted'||!participant(j))return shell('Seguimiento','Solo el cliente y el proveedor contratado pueden abrir este servicio.',btn('Volver',"go('jobs')"));
 const client=own(j),p=j.acceptedProviderUid,selected=offer(j.id,p),price=money(j.acceptedAmount);
 return topbar()+'<div class="area" style="padding-top:13px">'+head('Seguimiento del servicio')+'<h1 class="headline">'+esc(j.category)+'</h1><p class="sub">'+esc(j.description)+'</p>'+ 
 '<div class="panel" style="padding:17px;margin:17px 0"><div class="between"><h3>Servicio contratado</h3><strong>'+price+'</strong></div><p>Profesional: '+esc(selected?.providerName||(client?'Usuario contratado':'Tú'))+'</p><p><b>Trabajo:</b> '+workText(j.workStatus)+'</p><p><b>Pago:</b> '+payText(j.paymentStatus)+'</p>'+ 
 '<div class="squares"><div><strong>1</strong><small>Oferta aceptada</small></div><div><strong>2</strong><small>'+esc(j.workStatus==='accepted'?'Por iniciar':j.workStatus==='started'?'En progreso':'Finalizado')+'</small></div><div><strong>3</strong><small>Pago ficticio</small></div></div></div>'+ 
 '<div class="stack">'+btn('Abrir conversación',"openChatFor("+arg(j.id)+","+arg(p)+")",'outline block')+
 (client&&['unpaid','declined'].includes(j.paymentStatus)?btn('Simular cobro aprobado '+price,"simulatedCharge("+arg(j.id)+",'approve')",'primary block')+btn('Simular cobro rechazado',"simulatedCharge("+arg(j.id)+",'decline')",'outline block'):'')+
 (!client&&j.paymentStatus==='simulated_paid'&&j.workStatus==='accepted'?btn('Confirmar que inicié el trabajo',"advanceWork("+arg(j.id)+")",'primary block'):'')+
 (!client&&j.paymentStatus==='simulated_paid'&&j.workStatus==='started'?btn('Marcar el trabajo como terminado',"advanceWork("+arg(j.id)+")",'primary block'):'')+
 (client&&j.paymentStatus==='simulated_paid'&&j.workStatus==='completed'?btn('Liberar PAGO FICTICIO al proveedor',"releaseTestPayment("+arg(j.id)+")",'primary block'):'')+
 btn('Ir a billetera simulada',"go('wallet')",'pale block')+'</div>'+note('<b>SIMULACIÓN:</b> no hay geolocalización en tiempo real, cobros bancarios, dinero retenido ni transferencias.')+'</div>';
};
window.simulatedCharge=async function(id,result){const j=job(id);if(!j||!own(j)||j.status!=='accepted'||!['unpaid','declined'].includes(j.paymentStatus))return toast('Este pago no está disponible.');
 if(C.busy||!confirm('PAGO FICTICIO. No se usa tarjeta ni se mueve dinero. ¿Continuar?'))return;C.busy=true;
 try{await updateDoc(jobDoc(id),{paymentStatus:result==='approve'?'simulated_paid':'declined',updatedAt:serverTimestamp()});toast(result==='approve'?'Pago FICTICIO aprobado; el proveedor puede empezar.':'Pago FICTICIO rechazado. Puedes intentar otra vez.');}catch(ex){alertError(ex)}finally{C.busy=false}
};
window.advanceWork=async function(id){const j=job(id);if(!j||j.acceptedProviderUid!==uid()||j.paymentStatus!=='simulated_paid')return toast('No puedes actualizar ese servicio.');
 const next=j.workStatus==='accepted'?'started':j.workStatus==='started'?'completed':null;if(!next)return toast('El trabajo ya se completó.');
 if(C.busy)return;C.busy=true;try{await updateDoc(jobDoc(id),{workStatus:next,updatedAt:serverTimestamp()});toast(next==='started'?'Trabajo iniciado, el cliente puede verlo.':'Trabajo terminado, falta liberar el pago ficticio.');}catch(ex){alertError(ex)}finally{C.busy=false}
};
window.releaseTestPayment=async function(id){const j=job(id);if(!j||!own(j)||j.workStatus!=='completed'||j.paymentStatus!=='simulated_paid')return toast('Primero debe terminar el servicio.');
 if(C.busy||!confirm('¿Liberar '+money(j.acceptedAmount)+' FICTICIOS? No hay transferencia real.'))return;C.busy=true;
 try{await updateDoc(jobDoc(id),{paymentStatus:'released',updatedAt:serverTimestamp()});toast('Pago simulado liberado. El proveedor lo verá en su billetera.');}catch(ex){alertError(ex)}finally{C.busy=false}
};
window.withdrawSimulation=async function(id){const j=job(id);if(!j||j.acceptedProviderUid!==uid()||j.paymentStatus!=='released'||j.withdrawStatus==='withdrawn')return toast('No hay saldo ficticio disponible para retirar.');
 if(C.busy||!confirm('RETIRO SIMULADO de '+money(j.acceptedAmount)+'. No sale dinero real. ¿Continuar?'))return;C.busy=true;
 try{await updateDoc(jobDoc(id),{withdrawStatus:'withdrawn',updatedAt:serverTimestamp()});toast('Retiro ficticio registrado. Saldo simulado actualizado.');}catch(ex){alertError(ex)}finally{C.busy=false}
};
window.wallet=function(){const relevant=[...C.jobs.values()].filter(j=>j.status==='accepted'&&(own(j)||j.acceptedProviderUid===uid()));
 const provider=relevant.filter(j=>j.acceptedProviderUid===uid());
 const available=provider.filter(j=>j.paymentStatus==='released'&&j.withdrawStatus!=='withdrawn').reduce((a,j)=>a+Number(j.acceptedAmount||0),0);
 const pending=provider.filter(j=>j.paymentStatus==='simulated_paid').reduce((a,j)=>a+Number(j.acceptedAmount||0),0);
 return shell('Mi billetera','Movimientos 100 % simulados. Saldo real: $0.00 MXN.',
 '<div class="wallet" style="margin:20px 0"><small style="display:block">Saldo disponible · FICTICIO</small><strong style="display:block;margin:12px 0">'+money(available)+'</strong><small style="display:block;margin:6px 0">Pendiente de liberar: '+money(pending)+'</small><small style="display:block">NO ES DINERO REAL</small></div>'+ 
 sectionTitle('Movimientos de CHAMBEA')+'<div class="stack">'+(relevant.length?relevant.map(j=>'<div class="request-card"><div class="between"><h3>'+esc(j.category)+'</h3><strong>'+money(j.acceptedAmount)+'</strong></div><p>'+payText(j.paymentStatus)+'</p><p class="sub">'+(own(j)?'Cliente':'Proveedor')+' · '+workText(j.workStatus)+'</p>'+ 
 '<div class="stack">'+btn('Ver servicio',"go('tracking',"+arg(j.id)+")",'outline block')+
 (j.acceptedProviderUid===uid()&&j.paymentStatus==='released'&&j.withdrawStatus!=='withdrawn'?btn('Simular retiro',"withdrawSimulation("+arg(j.id)+")",'primary block'):'')+
 (j.withdrawStatus==='withdrawn'?'<p class="sub">Retiro ficticio ya realizado.</p>':'')+'</div></div>').join(''):empty('Sin movimientos','Aparecerán al aceptar una cotización y simular un cobro.'))+'</div>');
};
window.openChatFor=function(id,p){if(!guard())return;const j=job(id);if(!j||(!own(j)&&p!==uid()))return toast('No tienes acceso a esta conversación.');
 if(!offer(id,p))return toast('Espera a que aparezca la cotización y vuelve a intentar.');S.chat={id,providerUid:p};S.jobid=id;route('chat',S.chat);
};
window.openChat=function(id,index){const q=qs(id)[index];if(!q)return toast('No encontramos la cotización.');openChatFor(id,q.providerUid)};
window.messages=function(){const all=[];
 for(const j of C.jobs.values())for(const q of qs(j.id))if(own(j)||q.providerUid===uid()){
  const arr=C.messages.get(msgKey(j.id,q.providerUid))||[];all.push({j,q,last:arr.at(-1),time:stamp(arr.at(-1)?.createdAt)||stamp(q.createdAt)});
 }
 all.sort((a,b)=>b.time-a.time);
 return shell('Mis mensajes','Conversaciones entre cuentas de CHAMBEA; se sincronizan mediante Firebase.',
 '<div class="stack" style="margin-top:17px">'+(all.length?all.map(({j,q,last})=>'<div class="request-card"><div class="between"><h3>'+esc(own(j)?q.providerName:'Cliente')+'</h3><span class="badge neutral">'+esc(j.category)+'</span></div><p>'+esc(last?.body||'Abre el chat para iniciar una conversación.')+'</p>'+btn('Abrir chat',"openChatFor("+arg(j.id)+","+arg(q.providerUid)+")",'primary small')+'</div>').join(''):empty('Sin conversaciones','Publica o cotiza una solicitud y comienza a conversar.'))+'</div>');
};
window.chat=function(){const t=S.chat||{};const j=job(t.id),q=j&&offer(t.id,t.providerUid);
 if(!j||!q||(!own(j)&&t.providerUid!==uid()))return shell('Chat','No se encontró una conversación autorizada.',btn('Ver mensajes',"go('messages')"));
 const arr=C.messages.get(msgKey(t.id,t.providerUid))||[];
 return topbar()+'<div class="area" style="padding-top:13px">'+head('Conversación · '+(own(j)?q.providerName:'Cliente'))+'<p class="sub">'+esc(j.category)+' · '+money(q.amount)+'</p>'+ 
 '<div class="panel" style="padding:15px;margin:15px 0;min-height:35dvh"><div class="stack" id="chatScroll">'+(arr.length?arr.map(m=>'<div class="bubble '+(m.senderUid===uid()?'mine':'')+'">'+esc(m.body)+'<div class="muted" style="font-size:10px;margin-top:5px">'+esc(shortDate(m.createdAt))+'</div></div>').join(''):'<p class="sub">Envía el primer mensaje.</p>')+'</div></div>'+ 
 '<form class="chatbox" onsubmit="sendMessage(event,'+arg(t.id)+','+arg(t.providerUid)+')"><input class="control" id="msg" required maxlength="800" placeholder="Escribe tu mensaje..." aria-label="Mensaje"><button type="submit" class="btn primary">Enviar</button></form>'+ 
 (j.status==='accepted'&&participant(j)?'<div class="stack" style="margin-top:15px">'+btn('Ver seguimiento y pago ficticio',"go('tracking',"+arg(j.id)+")",'pale block')+'</div>':'')+'</div>';
};
window.sendMessage=async function(ev,id,p){ev.preventDefault();const b=ev.target.querySelector('button[type=submit]'),input=document.getElementById('msg');const body=input?.value.trim()||'';
 const j=job(id);if(!j||(!own(j)&&p!==uid())||!offer(id,p))return toast('No puedes participar en esta conversación.');
 if(body.length<1||body.length>800||C.busy)return;C.busy=true;if(b)b.disabled=true;
 try{await addDoc(msgCol(id,p),{senderUid:uid(),body,createdAt:serverTimestamp()});if(input?.isConnected)input.value='';toast('Mensaje enviado.');}catch(ex){alertError(ex)}finally{C.busy=false;if(b?.isConnected)b.disabled=false}
};
window.notifications=function(){notices();return shell('Notificaciones','Al tocar una notificación se abre la solicitud, la cotización o el chat correspondiente.',
 '<div class="stack" style="margin-top:15px">'+(C.notices.length?C.notices.map(n=>'<button type="button" style="padding:0;border:0;background:transparent;text-align:left" onclick="openNotice('+arg(n.id)+')"><div class="request-card" style="border-left:4px solid '+(C.noticeRead.has(n.id)?'#d2dedb':'#ff7b16')+'"><div class="between"><strong>'+esc(n.title)+'</strong>'+(!C.noticeRead.has(n.id)?'<span class="badge">Nuevo</span>':'')+'</div><p>'+esc(n.description)+'</p><small class="muted">'+(n.time?new Date(n.time).toLocaleString('es-MX'):'')+'</small></div></button>').join(''):empty('Sin notificaciones','La actividad aparecerá al recibir solicitudes, ofertas y mensajes.'))+'</div>'+note('Estas notificaciones se muestran dentro de CHAMBEA al estar abierta. Las notificaciones del sistema con la aplicación cerrada aún no están activadas.'));
};
window.profile=function(){return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">Mi perfil</h1><p class="sub">Cuenta CHAMBEA V1 · '+esc(data.account.email||'')+'</p>'+ 
 '<div class="switch" style="margin:17px 0"><button class="'+(data.mode==='cliente'?'on':'')+'" onclick="navigateMode(\'cliente\')">Quiero contratar</button><button class="'+(data.mode==='profesional'?'on':'')+'" onclick="navigateMode(\'profesional\')">Ofrezco servicios</button></div>'+ 
 '<form onsubmit="saveMyProfile(event)"><div class="field"><label class="label">Nombre completo</label><input class="control" id="name" required maxlength="70" value="'+esc(data.account.name)+'"></div>'+ 
 '<div class="field"><label class="label">Correo (solo lectura)</label><input class="control" type="email" disabled value="'+esc(data.account.email)+'"></div>'+ 
 '<div class="field"><label class="label">Ciudad</label><select class="control" id="mycity">'+cityOptions(data.account.city)+'</select></div>'+ 
 '<div class="field"><label class="label">Mi oficio</label><select class="control" id="myskill">'+categories.map(c=>'<option '+(data.account.specialty===c?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+ 
 '<div class="field"><label class="label">Sobre mí (opcional)</label><textarea class="control" maxlength="400" id="mybio" placeholder="Qué servicios realizas...">'+esc(data.account.bio||'')+'</textarea></div>'+ 
 '<button class="btn primary block" type="submit">Guardar perfil</button></form><div class="separator"></div><div class="stack">'+btn('Billetera de pagos simulados',"go('wallet')",'outline block')+btn('Cerrar sesión',"chambeaLogout()",'pale block')+'</div>'+ 
 '<p class="sub" style="margin-top:16px;font-size:11px">No se verifican identidades ni se procesa dinero real. No compartas información bancaria.</p></div>';
};
window.saveMyProfile=async function(ev){ev.preventDefault();if(!guard()||C.busy)return;
 const name=document.getElementById('name')?.value.trim()||'',zone=document.getElementById('mycity')?.value||'Guadalajara',skill=document.getElementById('myskill')?.value||'Plomería',bio=document.getElementById('mybio')?.value.trim()||'';
 if(name.length<2||name.length>70||bio.length>400)return toast('Revisa los datos de tu perfil.');C.busy=true;
 try{await setDoc(doc(db,'usuarios',uid()),{name,zone,skill,bio,email:C.user.email,updatedAt:serverTimestamp()},{merge:true});
 data.account={name,city:zone,specialty:skill,bio,email:C.user.email};toast('Perfil actualizado y guardado en Firebase.');safeRender(true);
 }catch(ex){alertError(ex)}finally{C.busy=false}
};
window.resetDemo=function(){toast('Para proteger tu información, esta versión no borra datos de Firebase. Usa Cerrar sesión.');};
window.simulateQuotes=function(){toast('No se generan ofertas falsas. Para recibir una cotización inicia sesión como proveedor en otro celular.');};
window.nextStatus=function(id){route('tracking',id);};
window.favorite=function(){toast('Todavía no hay perfiles públicos verificados que puedas guardar.');};
window.proOpp=function(j){return jobPreview(j,true)};
// El menú siempre abre pantallas operativas; no se incluyen controles sin una acción.
window.nav=function(){const role=data.mode==='profesional';const items=role?
 [['proHome','Inicio','home'],['opportunities','Solicitudes','file'],['worklist','Mis trabajos','calendar'],['messages','Mensajes','chat'],['profile','Perfil','user']]:
 [['home','Inicio','home'],['explore','Explorar','search'],['jobs','Solicitudes','file'],['messages','Mensajes','chat'],['profile','Perfil','user']];
 const visible=!['welcome','auth'].includes(S.page);document.getElementById('bottom').classList.toggle('hide',!visible);
 document.getElementById('bottom').innerHTML=visible?items.map(([id,label,icon])=>'<button aria-label="'+label+'" class="'+(S.page===id?'on':'')+'" onclick="go(\''+id+'\')">'+ico(icon)+'<span>'+label+'</span></button>').join(''):'';
};
// Indicador de versión para ver qué APK está efectivamente instalado.
const originalRender=window.render;
window.render=function(){originalRender();const appRoot=document.getElementById('app');if(!appRoot)return;
 const old=document.getElementById('chambeaVersion');if(old)old.remove();
 const el=document.createElement('div');el.id='chambeaVersion';el.setAttribute('aria-label','Versión de la aplicación');
 el.style.cssText='font:600 10px system-ui;color:#567;margin:14px auto 5px;text-align:center';el.textContent='CHAMBEA V1 · Pagos simulados';
 if(S.page!=='welcome'&&S.page!=='auth')appRoot.appendChild(el);
};
// Interceptar métodos inseguros de la maqueta: no se utilizan en V1.
window.guest=()=>{S.auth='register';route('auth')};
window.addEventListener('offline',()=>banner('Sin conexión a Internet. La sincronización se reanudará al conectarte.',true));
window.addEventListener('online',()=>banner('Conexión recuperada. Sincronizando CHAMBEA...'));
window.addEventListener('unhandledrejection',event=>{console.error('CHAMBEA error inesperado',event.reason);banner('Ocurrió un error. Intenta de nuevo o revisa tu conexión.',true)});
banner('Iniciando CHAMBEA V1...');
console.info('CHAMBEA V1: autenticación, solicitudes, cotizaciones, conversación y pagos ficticios en Firebase.');


/* CHAMBEA V1 — acuerdo operativo: respuesta formal, agenda y recotización. */
const agreementDoc=id=>doc(db,'chambea_jobs',String(id),'agreements','current');
const agreement=id=>C.agreements.get(String(id))||null;
const quoteState=q=>({sent:'Enviada · esperando respuesta',changes_requested:'Cliente pidió modificar',rejected:'Rechazada por cliente'})[q.status]||'Enviada';
const scheduleState=a=>({unscheduled:'Pendiente de proponer fecha',proposed:'Fecha propuesta · falta confirmación',confirmed:'Fecha confirmada por ambas partes'})[a?.appointmentStatus]||'Sin programar';
const revisionState=a=>({none:'Pendiente de inspección',pending:'Nueva cotización pendiente de respuesta',approved:'Nueva cotización aceptada',rejected:'Nuevo precio rechazado',original_confirmed:'Importe original confirmado'})[a?.revisionStatus]||'Pendiente';
function watchAgreement(j){
  if(!participant(j))return;
  addWatch('agreement/'+j.id,agreementDoc(j.id),snap=>{
    C.agreements.set(j.id,snap.exists()?snap.data():null);
    notices();safeRender();
  });
}
async function ensureAgreement(id){
  const snap=await getDoc(agreementDoc(id));
  if(snap.exists()){C.agreements.set(id,snap.data());return snap.data();}
  const jSnap=await getDoc(jobDoc(id));
  const j=jSnap.data();
  if(!j||j.ownerUid!==uid()||j.status!=='accepted')throw Error('Solo el cliente que contrató puede iniciar el acuerdo.');
  const initial={
    clientUid:uid(),providerUid:j.acceptedProviderUid,baseAmount:j.acceptedAmount,
    appointmentStatus:'unscheduled',visitStatus:'pending',revisionStatus:'none',
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  };
  await setDoc(agreementDoc(id),initial);
  return initial;
}
const _acceptQuoteV1=window.acceptQuote;
window.acceptQuote=async function(id,p){
  if(offer(id,p)?.status!=='sent')return toast('Esta propuesta no está disponible para aceptar.');
  await _acceptQuoteV1(id,p);
  const snap=await getDoc(jobDoc(id)).catch(()=>null);
  if(snap?.data()?.status==='accepted'&&snap.data().acceptedProviderUid===p){
    try{await ensureAgreement(id)}catch(ex){alertError(ex)}
  }
};
window.respondQuote=async function(id,p,answer){
  if(!guard()||C.busy)return;
  const j=job(id),q=offer(id,p);
  if(!j||!own(j)||j.status!=='open'||q?.status!=='sent')return toast('La oferta ya cambió de estado.');
  if(!confirm(answer==='rejected'?'¿Rechazar esta cotización?':'¿Solicitar un nuevo presupuesto? El proveedor podrá ajustar su propuesta.'))return;
  C.busy=true;
  try{
    await updateDoc(quoteDoc(id,p),{status:answer,updatedAt:serverTimestamp()});
    toast(answer==='rejected'?'Cotización rechazada. El proveedor verá el estado.':'Se solicitó una modificación. El proveedor podrá enviar otro importe.');
  }catch(ex){alertError(ex)}finally{C.busy=false}
};
window.reviseOffer=async function(ev,id){
  ev.preventDefault();if(!guard()||C.busy)return;
  const j=job(id),q=offer(id,uid());
  if(!j||own(j)||j.status!=='open'||q?.status!=='changes_requested')return toast('Esta cotización no puede modificarse.');
  const amount=Number(ev.target.querySelector('[name=reofferAmount]')?.value||0);
  const note=ev.target.querySelector('[name=reofferNote]')?.value.trim()||'';
  if(amount<=0||amount>10000000||!Number.isFinite(amount)||note.length<10||note.length>1000)return toast('Escribe el nuevo precio y los conceptos incluidos.');
  C.busy=true;
  try{await updateDoc(quoteDoc(id,uid()),{amount,note,status:'sent',updatedAt:serverTimestamp()});toast('Nueva propuesta enviada al cliente.');}
  catch(ex){alertError(ex)}finally{C.busy=false}
};
window.quotes=function(){
  const j=job(S.jobid);
  if(!j||!own(j))return shell('Cotizaciones','Solo quien publicó el trabajo puede responder las ofertas.',btn('Mis solicitudes',"go('jobs')"));
  const arr=qs(j.id);
  return shell('Cotizaciones recibidas',esc(j.category)+' · '+arr.length+' propuesta(s). Cada decisión se refleja en el celular del proveedor.',
    '<div class="stack" style="margin-top:16px">'+
    (arr.length?arr.map(q=>'<div class="quote-card"><div class="between"><strong>'+esc(q.providerName||'Proveedor')+'</strong><strong>'+money(q.amount)+'</strong></div>'+
    '<p>'+esc(q.note)+'</p><p class="sub">'+quoteState(q)+'</p>'+
    '<div class="stack">'+btn('Abrir chat',"openChatFor("+arg(j.id)+","+arg(q.providerUid)+")",'outline block')+
    (j.status==='open'&&q.status==='sent'?btn('Aceptar presupuesto',"acceptQuote("+arg(j.id)+","+arg(q.providerUid)+")",'primary block')+
      btn('Pedir modificación',"respondQuote("+arg(j.id)+","+arg(q.providerUid)+",'changes_requested')",'outline block')+
      btn('Rechazar presupuesto',"respondQuote("+arg(j.id)+","+arg(q.providerUid)+",'rejected')",'pale block'):'')+
    (j.acceptedProviderUid===q.providerUid?btn('Ver acuerdo y fecha',"go('tracking',"+arg(j.id)+")",'primary block'):'')+
    '</div></div>').join(''):empty('Todavía sin propuestas','Cuando otro usuario cotice desde otro celular, aparecerá aquí.'))+
    '</div>');
};
window.worklist=function(){
  const list=[...C.jobs.values()].flatMap(j=>qs(j.id).filter(q=>q.providerUid===uid()).map(q=>({j,q})));
  const j=S.offerOpen&&S.offer?job(S.offer.id):null;
  return shell('Mis cotizaciones','Comprueba cuáles fueron aceptadas, rechazadas o requieren modificaciones.',
    (j?'<form class="panel" onsubmit="sendOffer(event)" style="padding:17px;margin:16px 0"><h3>'+esc(j.category)+'</h3><p>'+esc(j.description)+'</p>'+
      '<div class="field"><label class="label">Precio de la propuesta (MXN)</label><input class="control" id="offerPrice" type="number" required min="1" max="10000000"></div>'+
      '<div class="field"><label class="label">Mano de obra, materiales, plazo y condiciones</label><textarea class="control" id="offerText" required minlength="10" maxlength="1000"></textarea></div>'+
      '<button class="btn primary block" type="submit">Enviar cotización</button>'+btn('Cancelar',"cancelOffer()",'outline block')+'</form>':'')+
    '<div class="stack" style="margin-top:17px">'+
    (list.length?list.map(({j,q})=>'<div class="request-card"><div class="between"><h3>'+esc(j.category)+'</h3><strong>'+money(q.amount)+'</strong></div>'+
      '<p>'+esc(q.note)+'</p>'+
      '<p class="sub">'+(j.acceptedProviderUid===uid()?'ACEPTADA · Contratado':j.status==='accepted'?'No seleccionado':quoteState(q))+'</p>'+
      '<div class="stack">'+btn('Conversar con cliente',"openChatFor("+arg(j.id)+","+arg(uid())+")",'outline block')+
      (j.status==='open'&&q.status==='changes_requested'?'<form onsubmit="reviseOffer(event,'+arg(j.id)+')">'+
        '<div class="field"><label class="label">Nuevo importe MXN</label><input name="reofferAmount" class="control" type="number" required min="1" max="10000000" value="'+Number(q.amount)+'"></div>'+
        '<div class="field"><label class="label">Qué incluye la propuesta corregida</label><textarea name="reofferNote" class="control" required minlength="10" maxlength="1000">'+esc(q.note)+'</textarea></div>'+
        '<button class="btn primary block" type="submit">Enviar propuesta modificada</button></form>':'')+
      (j.acceptedProviderUid===uid()?btn('Abrir agenda y trabajo',"go('tracking',"+arg(j.id)+")",'primary block'):'')+
      '</div></div>').join(''):empty('No has cotizado todavía','Busca oportunidades y envía presupuestos.',btn('Ver oportunidades',"go('opportunities')")))+
    '</div>');
};
window.proposeAppointment=async function(ev,id){
  ev.preventDefault();if(!guard()||C.busy)return;
  const j=job(id);if(!j||!participant(j))return toast('No tienes acceso a la agenda.');
  const value=document.getElementById('appointmentDate')?.value;
  const date=value?new Date(value):null;
  if(!date||!Number.isFinite(date.valueOf())||date.getTime()<Date.now()+60000||date.getTime()>Date.now()+366*86400000)return toast('Elige una fecha futura válida.');
  C.busy=true;
  try{
    if(own(j))await ensureAgreement(id);
    await updateDoc(agreementDoc(id),{appointmentAt:date,appointmentBy:uid(),appointmentStatus:'proposed',updatedAt:serverTimestamp()});
    toast('Fecha propuesta. La otra persona debe confirmarla.');
  }catch(ex){alertError(ex)}finally{C.busy=false}
};
window.confirmAppointment=async function(id){
  const a=agreement(id),j=job(id);
  if(!a||!j||!participant(j)||a.appointmentStatus!=='proposed'||a.appointmentBy===uid())return toast('Esta fecha debe confirmarla la otra persona.');
  try{await updateDoc(agreementDoc(id),{appointmentStatus:'confirmed',updatedAt:serverTimestamp()});toast('Fecha confirmada por ambas partes.');}
  catch(ex){alertError(ex)}
};
window.finishVisit=async function(id){
  const j=job(id),a=agreement(id);
  if(!j||j.acceptedProviderUid!==uid()||a?.appointmentStatus!=='confirmed'||a.visitStatus!=='pending')return toast('Primero ambos deben confirmar la fecha.');
  if(!confirm('¿Ya revisaste personalmente el alcance del trabajo?'))return;
  try{await updateDoc(agreementDoc(id),{visitStatus:'inspected',updatedAt:serverTimestamp()});toast('Visita registrada. Confirma el presupuesto o propone un cambio.');}
  catch(ex){alertError(ex)}
};
window.confirmOriginal=async function(id){
  const j=job(id),a=agreement(id);
  if(!j||j.acceptedProviderUid!==uid()||a?.visitStatus!=='inspected'||!['none','rejected'].includes(a.revisionStatus))return toast('No puedes confirmar ese importe ahora.');
  try{await updateDoc(agreementDoc(id),{revisionStatus:'original_confirmed',updatedAt:serverTimestamp()});toast('Precio original confirmado para el trabajo.');}
  catch(ex){alertError(ex)}
};
window.proposeFieldPrice=async function(ev,id){
  ev.preventDefault();
  const j=job(id),a=agreement(id);
  if(!j||j.acceptedProviderUid!==uid()||a?.visitStatus!=='inspected'||!['none','rejected'].includes(a.revisionStatus))return toast('No puedes recotizar en este momento.');
  const amount=Number(document.getElementById('fieldPrice')?.value||0);
  const reason=document.getElementById('fieldReason')?.value.trim()||'';
  if(amount<=0||amount>10000000||!Number.isFinite(amount)||reason.length<10||reason.length>500)return toast('Indica el nuevo importe y el motivo del cambio.');
  try{
    await updateDoc(agreementDoc(id),{revisionStatus:'pending',revisedAmount:amount,revisionReason:reason,updatedAt:serverTimestamp()});
    toast('Recotización enviada. Solo el cliente puede aprobar el importe nuevo.');
  }catch(ex){alertError(ex)}
};
window.answerFieldPrice=async function(id,yes){
  const a=agreement(id),j=job(id);
  if(!j||!own(j)||a?.revisionStatus!=='pending')return toast('No tienes un cambio pendiente de aprobar.');
  if(!confirm(yes?'¿Aceptar nuevo presupuesto de '+money(a.revisedAmount)+'?':'¿Rechazar el cambio de presupuesto?'))return;
  try{await updateDoc(agreementDoc(id),{revisionStatus:yes?'approved':'rejected',updatedAt:serverTimestamp()});
    toast(yes?'Nuevo presupuesto aprobado. Confirma el importe antes del pago simulado.':'Precio nuevo rechazado. El proveedor debe mantener el original o presentar otra propuesta.');}
  catch(ex){alertError(ex)}
};
window.applyApprovedPrice=async function(id){
  const a=agreement(id),j=job(id);
  if(!j||!own(j)||a?.revisionStatus!=='approved')return toast('No hay nueva cotización aceptada.');
  if(!confirm('Actualizar acuerdo a '+money(a.revisedAmount)+'?'))return;
  try{await updateDoc(jobDoc(id),{acceptedAmount:a.revisedAmount,updatedAt:serverTimestamp()});toast('Importe acordado actualizado.');}
  catch(ex){alertError(ex)}
};
const _simulatedChargeV1=window.simulatedCharge;
window.simulatedCharge=function(id,result){
  const a=agreement(id),j=job(id);
  if(!a||a.appointmentStatus!=='confirmed'||a.visitStatus!=='inspected'||!['original_confirmed','approved'].includes(a.revisionStatus))
    return toast('Antes de simular un pago, confirma agenda, visita y presupuesto.');
  if(a.revisionStatus==='approved'&&Number(j?.acceptedAmount)!==Number(a.revisedAmount))
    return toast('Primero actualiza el precio a la recotización aceptada.');
  return _simulatedChargeV1(id,result);
};
window.tracking=function(){
  const j=job(S.jobid);
  if(!j||j.status!=='accepted'||!participant(j))return shell('Servicio','Solo las personas contratantes pueden consultar este acuerdo.',btn('Mis solicitudes',"go('jobs')"));
  const client=own(j),a=agreement(j.id),partner=j.acceptedProviderUid,quote=offer(j.id,partner);
  const parts=[];
  parts.push('<div class="request-card"><h3>'+esc(j.category)+' · '+money(j.acceptedAmount)+'</h3><p>'+esc(j.description)+'</p><p>'+esc(quote?.providerName||'Profesional')+'</p><p><strong>Trabajo: </strong>'+workText(j.workStatus)+'</p><p><strong>Pago: </strong>'+payText(j.paymentStatus)+'</p></div>');
  if(!a){
    parts.push(empty('Preparando acuerdo','El cliente debe activar la coordinación entre ambas personas.',
      client?btn('Iniciar acuerdo y agenda',"initAgreementScreen("+arg(j.id)+")",'primary block'):''));
  }else{
    parts.push('<div class="request-card"><h3>1. Agenda de visita o servicio</h3><p>'+scheduleState(a)+'</p>'+
      (a.appointmentAt?'<p><b>Fecha:</b> '+new Date(a.appointmentAt.toMillis?.()||0).toLocaleString('es-MX',{dateStyle:'full',timeStyle:'short'})+'</p>':'')+
      (a.visitStatus==='pending'?'<form onsubmit="proposeAppointment(event,'+arg(j.id)+')"><div class="field"><label class="label">Propón fecha y hora</label><input class="control" id="appointmentDate" type="datetime-local" required></div>'+
        '<button type="submit" class="btn outline block">Enviar fecha para confirmar</button></form>':'')+
      (a.appointmentStatus==='proposed'&&a.appointmentBy!==uid()?btn('Confirmar fecha propuesta',"confirmAppointment("+arg(j.id)+")",'primary block'):'')+'</div>');
    parts.push('<div class="request-card"><h3>2. Revisión del trabajo en campo</h3><p>'+(a.visitStatus==='inspected'?'Visita registrada':'Pendiente de inspección')+'</p>'+
      (!client&&a.appointmentStatus==='confirmed'&&a.visitStatus==='pending'?btn('Confirmar visita y revisión',"finishVisit("+arg(j.id)+")",'primary block'):'')+'</div>');
    parts.push('<div class="request-card"><h3>3. Precio y condiciones</h3><p><b>Original:</b> '+money(a.baseAmount)+'</p><p>'+revisionState(a)+'</p>'+
      (a.revisedAmount?'<p><b>Recotización:</b> '+money(a.revisedAmount)+' · '+esc(a.revisionReason||'')+'</p>':'')+
      (!client&&a.visitStatus==='inspected'&&['none','rejected'].includes(a.revisionStatus)?
        btn('Mantener presupuesto original',"confirmOriginal("+arg(j.id)+")",'outline block')+
        '<form onsubmit="proposeFieldPrice(event,'+arg(j.id)+')"><div class="field"><label class="label">Nuevo presupuesto MXN</label><input class="control" id="fieldPrice" type="number" min="1" max="10000000" required></div>'+
        '<div class="field"><label class="label">Motivo técnico / cambio de alcance</label><textarea class="control" id="fieldReason" required minlength="10" maxlength="500"></textarea></div><button type="submit" class="btn primary block">Solicitar cambio de precio</button></form>':'')+
      (client&&a.revisionStatus==='pending'?btn('Aceptar nuevo precio',"answerFieldPrice("+arg(j.id)+",true)",'primary block')+
        btn('Rechazar nuevo precio',"answerFieldPrice("+arg(j.id)+",false)",'outline block'):'')+
      (client&&a.revisionStatus==='approved'&&Number(j.acceptedAmount)!==Number(a.revisedAmount)?
        btn('Confirmar importe final '+money(a.revisedAmount),"applyApprovedPrice("+arg(j.id)+")",'primary block'):'')+'</div>');
    const ready=a.appointmentStatus==='confirmed'&&a.visitStatus==='inspected'&&['original_confirmed','approved'].includes(a.revisionStatus)
      &&(a.revisionStatus!=='approved'||Number(j.acceptedAmount)===Number(a.revisedAmount));
    parts.push('<div class="request-card"><h3>4. Ejecución y pagos simulados</h3><p>'+(ready?'Acuerdo confirmado entre ambas partes.':'La simulación queda bloqueada hasta confirmar fecha, visita y precio.')+'</p>'+
      (client&&ready&&['unpaid','declined'].includes(j.paymentStatus)?btn('Simular pago aprobado '+money(j.acceptedAmount),"simulatedCharge("+arg(j.id)+",'approve')",'primary block')+
        btn('Simular pago rechazado',"simulatedCharge("+arg(j.id)+",'decline')",'outline block'):'')+
      (!client&&j.paymentStatus==='simulated_paid'&&['accepted','started'].includes(j.workStatus)?
        btn(j.workStatus==='accepted'?'Confirmar inicio de trabajo':'Confirmar trabajo terminado',"advanceWork("+arg(j.id)+")",'primary block'):'')+
      (client&&j.paymentStatus==='simulated_paid'&&j.workStatus==='completed'?
        btn('Liberar pago FICTICIO',"releaseTestPayment("+arg(j.id)+")",'primary block'):'')+'</div>');
  }
  parts.push('<div class="stack">'+btn('Abrir conversación',"openChatFor("+arg(j.id)+","+arg(partner)+")",'outline block')+
    btn('Billetera simulada',"go('wallet')",'pale block')+'</div>');
  return shell('Acuerdo y seguimiento',client?'Vista del cliente':'Vista del proveedor',parts.join('')+note('Todos los importes son ficticios. Las direcciones exactas no deben publicarse en las solicitudes.'));
};
window.initAgreementScreen=async function(id){try{await ensureAgreement(id);toast('Acuerdo creado. Ahora ambas partes pueden programar la fecha.');}catch(ex){alertError(ex)}};
