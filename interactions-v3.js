import './cloud-bridge.js';
// CHAMBEA beta multiusuario: interacciones reales y COBROS SIMULADOS.
// No integra una pasarela de pagos ni retira dinero real.
import { getApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, onSnapshot, orderBy, query, limit, runTransaction, updateDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const app=getApp(), auth=getAuth(app), db=getFirestore(app);
const jobsCol=()=>collection(db,'chambea_jobs');
const jobDoc=id=>doc(db,'chambea_jobs',String(id));
const quoteDoc=(id,uid)=>doc(db,'chambea_jobs',String(id),'quotes',uid);
const quoteCol=id=>collection(db,'chambea_jobs',String(id),'quotes');
const msgCol=(id,uid)=>collection(db,'chambea_jobs',String(id),'quotes',uid,'messages');
const $id=id=>document.getElementById(id);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsonArg=s=>JSON.stringify(String(s)).replace(/"/g,'&quot;');
const mx=n=>Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const notifyDate=timestamp=>timestamp?.toDate?.()?.toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'})||'';
const jobName=j=>String(j.category||j.cat||'Servicio');
const failure=e=>e?.code==='permission-denied'?'Permiso denegado. Debes publicar las reglas actualizadas de Firestore para habilitar este flujo.':e?.code==='unavailable'?'Sin conexión con Firebase. Verifica Internet.':e?.message||String(e);
const local={uid:null,jobs:new Map(),quotes:new Map(),messages:new Map(),stops:new Map(),jobsStop:null,read:new Set(),loadDone:false,busy:false,notifications:[]};
const key=(id,uid)=>String(id)+'/'+String(uid);
const myUid=()=>auth.currentUser?.uid||null;
function currentJob(id){return local.jobs.get(String(id))||data.jobs.find(j=>String(j.id)===String(id))||null;}
function forOwner(j){return !!myUid()&&String(j.ownerUid)===myUid();}
function quoted(j){
  const id=String(j.id),list=local.quotes.get(id);
  if(Array.isArray(list))return list;
  return Array.isArray(j.offers)?j.offers:[];
}
function visibleQuote(j,uid){return quoted(j).find(q=>q.providerUid===uid||q.id===uid)||null;}
function chooseQuoteIndex(j,uid){return (j.offers||[]).findIndex(q=>q.providerUid===uid||q.id===uid);}
function oneJobStatus(j){
  if(j.status==='accepted')return 'Cotización aceptada';
  if(j.status==='closed')return 'Cerrada';
  return 'Abierta';
}
function paymentLabel(v){return ({unpaid:'Pendiente de prueba',declined:'Simulación rechazada',simulated_paid:'Aprobado (SIMULADO)',released:'Liberado (SIMULADO)'})[v]||'Sin pago de prueba';}
function workLabel(v){return ({accepted:'Por iniciar',started:'Trabajo iniciado',completed:'Trabajo terminado'})[v]||'Por iniciar';}
function safeRender(){if(['job','quotes','tracking','wallet','notifications','messages','chat','proHome','opportunities','worklist','jobs','home'].includes(S.page)){try{render()}catch(ex){console.error(ex)}}}
function stopAll(){
  if(local.jobsStop){local.jobsStop();local.jobsStop=null;}
  for(const stop of local.stops.values())try{stop()}catch(ex){console.warn(ex)}
  local.stops.clear();local.jobs.clear();local.quotes.clear();local.messages.clear();local.notifications=[];local.loadDone=false;
}
function watchConversation(jobId,providerUid){
  const k=key(jobId,providerUid);if(local.stops.has('messages/'+k))return;
  const stop=onSnapshot(query(msgCol(jobId,providerUid),orderBy('createdAt','asc'),limit(150)),snapshot=>{
    local.messages.set(k,snapshot.docs.map(x=>({id:x.id,...x.data()})));
    refreshNotifications();safeRender();
  },error=>console.error('Mensajes de CHAMBEA',failure(error)));
  local.stops.set('messages/'+k,stop);
}
function watchOwnerQuotes(jobId){
  const k='owner-quotes/'+jobId;if(local.stops.has(k))return;
  const stop=onSnapshot(quoteCol(jobId),snapshot=>{
    const list=snapshot.docs.map(d=>({id:d.id,providerUid:d.id,...d.data()}));
    local.quotes.set(String(jobId),list);
    for(const q of list)watchConversation(jobId,q.providerUid);
    refreshNotifications();safeRender();
  },error=>console.error('Cotizaciones de CHAMBEA',failure(error)));
  local.stops.set(k,stop);
}
function watchMyQuote(jobId){
  const k='my-quote/'+jobId;if(local.stops.has(k)||!myUid())return;
  const uid=myUid();
  const stop=onSnapshot(quoteDoc(jobId,uid),snapshot=>{
    const d=snapshot.exists()?snapshot.data():null;
    local.quotes.set(String(jobId),d?[{id:uid,providerUid:uid,...d}]:[]);
    if(d)watchConversation(jobId,uid);
    refreshNotifications();safeRender();
  },error=>console.error('Mi cotización CHAMBEA',failure(error)));
  local.stops.set(k,stop);
}
function startWatch(user){
  local.uid=user.uid;
  try{local.read=new Set(JSON.parse(localStorage.getItem('chambea_notices_read_'+user.uid)||'[]'))}catch{local.read=new Set()}
  local.jobsStop=onSnapshot(query(jobsCol(),orderBy('createdAt','desc'),limit(150)),snapshot=>{
    local.jobs.clear();
    for(const d of snapshot.docs){
      const j={id:d.id,...d.data()};local.jobs.set(d.id,j);
      if(forOwner(j))watchOwnerQuotes(j.id);else watchMyQuote(j.id);
    }
    local.loadDone=true;refreshNotifications();safeRender();
  },error=>{
    console.error('Solicitudes',error);
    if(typeof toast==='function')toast(failure(error));
  });
}
onAuthStateChanged(auth,user=>{stopAll();local.uid=user?.uid||null;if(user)startWatch(user);safeRender()});

function jobCardData(j){
  const raw=currentJob(j.id)||j;
  return {...j,...raw,offers:quoted(j),mine:forOwner(raw),cat:jobName(raw),desc:raw.description||j.desc||'',city:raw.zone||j.city||''};
}
function feedItem({id,title,description,target,jobId,providerUid,when}){
  local.notifications.push({id,title,description,target,jobId,providerUid,when:when?.toMillis?.()||0});
}
function refreshNotifications(){
  local.notifications=[];const uid=myUid();if(!uid)return;
  for(const job of local.jobs.values()){
    if(forOwner(job)){
      feedItem({id:'posted/'+job.id,title:'Solicitud publicada',description:job.category+' · '+job.zone,target:'job',jobId:job.id,when:job.createdAt});
      const offers=quoted(job);
      for(const q of offers){
        feedItem({id:'quote/'+job.id+'/'+q.providerUid,title:'Recibiste una cotización',description:q.providerName+' · '+mx(q.amount),target:'quotes',jobId:job.id,when:q.createdAt});
      }
    }else if(job.status==='open'){
      feedItem({id:'job/'+job.id,title:'Solicitud disponible',description:job.category+' · '+job.zone,target:'opportunities',jobId:job.id,when:job.createdAt});
    }
    if(job.status==='accepted'&&(forOwner(job)||job.acceptedProviderUid===uid)){
      const target=forOwner(job)?'tracking':'worklist';
      feedItem({id:'accepted/'+job.id,title:'Cotización aceptada',description:job.category+' · '+mx(job.acceptedAmount),target,jobId:job.id,when:job.updatedAt||job.createdAt});
      if(['simulated_paid','released'].includes(job.paymentStatus))feedItem({id:'paid/'+job.id,title:'Pago de prueba '+(job.paymentStatus==='released'?'liberado':'aprobado'),description:mx(job.acceptedAmount)+' · SIN DINERO REAL',target:'wallet',jobId:job.id,when:job.updatedAt||job.createdAt});
      if(job.workStatus==='completed')feedItem({id:'completed/'+job.id,title:'Trabajo terminado',description:job.category+' · Confirma el cierre de prueba',target:'tracking',jobId:job.id,when:job.updatedAt||job.createdAt});
    }
  }
  for(const [k,items] of local.messages.entries()){
    const [jobId,providerUid]=k.split('/'),j=local.jobs.get(jobId);if(!j)continue;
    for(const message of items){
      if(message.senderUid===uid)continue;
      feedItem({id:'message/'+jobId+'/'+providerUid+'/'+message.id,title:'Nuevo mensaje',description:String(message.body||'').slice(0,100),target:'chat',jobId,providerUid,when:message.createdAt});
    }
  }
  local.notifications.sort((a,b)=>b.when-a.when);
  local.notifications=local.notifications.slice(0,100);
}
function unread(){return local.notifications.filter(n=>!local.read.has(n.id)).length;}
const beforeTopbar=window.topbar;
window.topbar=function(){let s=beforeTopbar();if(!unread())s=s.replace('class="headbutton alert"','class="headbutton"');return s;};
window.notifications=function(){
  refreshNotifications();const rows=local.notifications;
  return topbar()+'<div class="area" style="padding-top:13px">'+head('Notificaciones')+
    '<h1 class="headline">Actividad entre celulares</h1><p class="sub">Pulsa una notificación para abrir su solicitud, cotización o conversación. Aparecen con CHAMBEA abierta y conectada a Internet; no son notificaciones push de Android.</p>'+
    '<div class="stack" style="margin-top:16px">'+(rows.length?rows.map(n=>
      '<button type="button" style="border:0;background:transparent;padding:0;text-align:left" onclick="openNotice('+jsonArg(n.id)+')">'+
      '<div class="request-card" style="border-left:4px solid '+(local.read.has(n.id)?'#cbd7d5':'#ff7b16')+'">'+
      '<div class="between"><strong>'+escapeHtml(n.title)+'</strong>'+(!local.read.has(n.id)?'<span class="badge warn">Nueva</span>':'')+'</div><p>'+escapeHtml(n.description)+'</p><small class="muted">'+escapeHtml(n.when?new Date(n.when).toLocaleString('es-MX'):'')+'</small></div></button>'
    ).join(''):'<div class="empty">No hay actividad todavía. Publica una solicitud desde otro celular.</div>')+'</div></div>';
};
window.openNotice=function(id){
  const n=local.notifications.find(x=>x.id===id);if(!n)return;
  local.read.add(n.id);
  try{localStorage.setItem('chambea_notices_read_'+myUid(),JSON.stringify(Array.from(local.read).slice(-500)))}catch{}
  if(n.target==='chat')return openChatFor(n.jobId,n.providerUid);
  if(n.target==='job'||n.target==='quotes'||n.target==='tracking')return go(n.target,n.jobId);
  go(n.target||'jobs');
};
window.job=function(){
  const j=jobCardData(currentJob(S.jobid)||{id:S.jobid}),isMine=j.mine;
  if(!j.id||!j.cat||j.cat==='Servicio'&&!j.desc)return topbar()+'<div class="area">'+head('Solicitud')+'No encontramos esa solicitud.</div>';
  return topbar()+'<div class="area" style="padding-top:13px">'+head('Detalle de solicitud')+
    '<div class="request-card"><div class="between"><h2>'+escapeHtml(j.cat)+'</h2><span class="badge">'+oneJobStatus(j)+'</span></div><p>'+escapeHtml(j.desc)+'</p>'+
    '<p>📍 '+escapeHtml(j.city)+'</p><p>Presupuesto: '+mx(j.budget)+'</p></div><div class="stack" style="margin-top:15px">'+
    (isMine?'<button class="btn primary block" onclick="go(\'quotes\','+jsonArg(j.id)+')">Ver cotizaciones ('+quoted(j).length+')</button>':'<button class="btn primary block" onclick="offerForm('+jsonArg(j.id)+')">Cotizar solicitud</button>')+
    (j.status==='accepted'&&(isMine||j.acceptedProviderUid===myUid())?'<button class="btn outline block" onclick="go(\'tracking\','+jsonArg(j.id)+')">Seguimiento y cobro de prueba</button>':'')+
    '</div><div class="notice" style="margin-top:15px">Las acciones se sincronizan con Firebase. No se aceptan cobros bancarios reales.</div></div>';
};
window.quotes=function(){
  const j=jobCardData(currentJob(S.jobid)||{id:S.jobid});if(!j.id)return topbar()+'<div class="area">Solicitud no disponible</div>';
  const owner=j.mine,offers=quoted(j);
  if(!owner)return topbar()+'<div class="area">'+head('Cotizaciones')+'Solo el cliente puede ver las cotizaciones de otros proveedores.</div>';
  return topbar()+'<div class="area" style="padding-top:13px">'+head('Cotizaciones recibidas')+
    '<h1 class="headline">Compara las propuestas</h1><p class="sub">'+escapeHtml(j.cat)+' · '+offers.length+' cotización(es) reales de prueba.</p>'+
    '<div class="stack" style="margin-top:18px">'+(offers.length?offers.map(q=>{
      const selected=j.acceptedProviderUid===q.providerUid;
      return '<div class="quote-card" style="border:'+ (selected?'2px solid #008974':'1px solid #e1e8e7')+'"><div class="between"><h3>'+escapeHtml(q.providerName||'Proveedor')+'</h3><strong>'+mx(q.amount)+'</strong></div>'+
        '<p>'+escapeHtml(q.note||'')+'</p><p class="sub">Proveedor registrado · Identidad NO verificada</p>'+ (selected?'<span class="badge">Cotización aceptada</span>':'')+
        '<div class="grid2" style="margin-top:12px"><button class="btn outline" onclick="openChatFor('+jsonArg(j.id)+','+jsonArg(q.providerUid)+')">Chatear</button>'+
        '<button class="btn primary" '+(j.status!=='open'?'disabled':'')+' onclick="acceptQuote('+jsonArg(j.id)+','+jsonArg(q.providerUid)+')">'+(selected?'Aceptada':'Aceptar oferta')+'</button></div></div>';
    }).join(''):'<div class="empty">Aún no hay cotizaciones. Abre CHAMBEA desde otro celular con otra cuenta.</div>')+'</div></div>';
};
window.acceptQuote=async function(jobId,providerUid){
  const j=currentJob(jobId);if(!j||!forOwner(j))return toast('Solo el cliente puede aceptar la cotización.');
  if(j.status!=='open')return toast('Esta solicitud ya no admite una nueva aceptación.');
  if(local.busy)return;local.busy=true;
  try{
    if(!confirm('¿Aceptar esta cotización? El proveedor será informado y podrás simular un pago SIN DINERO REAL.'))return;
    await runTransaction(db,async tx=>{
      const jd=await tx.get(jobDoc(jobId)),qd=await tx.get(quoteDoc(jobId,providerUid));
      if(!jd.exists()||jd.data().ownerUid!==myUid()||jd.data().status!=='open'||!qd.exists())throw Error('La cotización ya no está disponible.');
      tx.update(jobDoc(jobId),{
        status:'accepted',acceptedProviderUid:providerUid,acceptedAmount:qd.data().amount,
        paymentStatus:'unpaid',workStatus:'accepted',updatedAt:new Date()
      });
    });
    toast('Cotización aceptada. El proveedor verá el nuevo estado.');go('tracking',jobId);
  }catch(ex){toast(failure(ex));}finally{local.busy=false;}
};
function requireAssigned(j){return !!j&&j.status==='accepted'&&(forOwner(j)||j.acceptedProviderUid===myUid());}
window.tracking=function(){
  const j=currentJob(S.jobid);if(!requireAssigned(j))return topbar()+'<div class="area">'+head('Seguimiento')+'El trabajo todavía no tiene una cotización aceptada.</div>';
  const owner=forOwner(j),name=visibleQuote(j,j.acceptedProviderUid)?.providerName||'Proveedor asignado';
  const amount=mx(j.acceptedAmount);
  return topbar()+'<div class="area" style="padding-top:13px">'+head('Seguimiento de servicio')+
    '<h1 class="headline">'+escapeHtml(jobName(j))+'</h1><p class="sub">'+escapeHtml(j.description||'')+'</p>'+
    '<div class="panel" style="padding:18px;margin-top:16px"><p><strong>'+escapeHtml(name)+'</strong> · Cotización aceptada: '+amount+'</p>'+ 
    '<div class="separator"></div><p><b>Estado del trabajo:</b> '+workLabel(j.workStatus)+'</p><p><b>Pago:</b> '+paymentLabel(j.paymentStatus)+'</p>'+ 
    '<p class="sub">Esta es una simulación entre celulares. No existe geolocalización del proveedor ni se mueve dinero.</p></div>'+
    '<div class="stack" style="margin-top:14px"><button class="btn outline block" onclick="openChatFor('+jsonArg(j.id)+','+jsonArg(j.acceptedProviderUid)+')">Abrir chat real con el '+(owner?'proveedor':'cliente')+'</button>'+
    (owner&&['unpaid','declined'].includes(j.paymentStatus)?'<button class="btn primary block" onclick="simulatedCharge('+jsonArg(j.id)+',\'approve\')">Simular COBRO aprobado '+amount+'</button>'+(j.paymentStatus==='unpaid'?'<button class="btn outline block" onclick="simulatedCharge('+jsonArg(j.id)+',\'decline\')">Simular COBRO rechazado</button>':''):'')+
    (!owner&&j.paymentStatus==='simulated_paid'&&j.workStatus==='accepted'?'<button class="btn primary block" onclick="advanceWork('+jsonArg(j.id)+')">Marcar trabajo iniciado</button>':'')+
    (!owner&&j.workStatus==='started'?'<button class="btn primary block" onclick="advanceWork('+jsonArg(j.id)+')">Marcar trabajo terminado</button>':'')+
    (owner&&j.workStatus==='completed'&&j.paymentStatus==='simulated_paid'?'<button class="btn primary block" onclick="releaseTestPayment('+jsonArg(j.id)+')">Simular liberación del pago al proveedor</button>':'')+
    '<button class="btn pale block" onclick="go(\'wallet\')">Ver billetera de pruebas</button></div></div>';
};
window.simulatedCharge=async function(id,outcome){
  const j=currentJob(id);
  if(!j||!forOwner(j)||j.status!=='accepted'||!['unpaid','declined'].includes(j.paymentStatus))return toast('Operación no disponible.');
  if(local.busy)return;
  if(!confirm('SIMULACIÓN exclusivamente: no se utilizará ninguna tarjeta ni se realizará un cargo bancario. ¿Continuar?'))return;
  local.busy=true;
  try{
    await updateDoc(jobDoc(id),{paymentStatus:outcome==='approve'?'simulated_paid':'declined',updatedAt:new Date()});
    toast(outcome==='approve'?'Cobro ficticio aprobado; el proveedor ya puede empezar.':'Cobro ficticio rechazado; puedes volver a probar.');safeRender();
  }catch(ex){toast(failure(ex))}finally{local.busy=false;}
};
window.advanceWork=async function(id){
  const j=currentJob(id);
  if(!j||j.status!=='accepted'||j.acceptedProviderUid!==myUid()||j.paymentStatus!=='simulated_paid')return toast('No puedes actualizar este trabajo.');
  const next=j.workStatus==='accepted'?'started':j.workStatus==='started'?'completed':null;
  if(!next)return toast('El trabajo ya está terminado.');if(local.busy)return;
  local.busy=true;
  try{await updateDoc(jobDoc(id),{workStatus:next,updatedAt:new Date()});toast(next==='started'?'El cliente verá «Trabajo iniciado».':'El cliente verá «Trabajo terminado».');safeRender();}
  catch(ex){toast(failure(ex))}finally{local.busy=false;}
};
window.releaseTestPayment=async function(id){
  const j=currentJob(id);
  if(!j||!forOwner(j)||j.status!=='accepted'||j.workStatus!=='completed'||j.paymentStatus!=='simulated_paid')return toast('El trabajo debe finalizar antes del pago de prueba.');
  if(!confirm('¿Liberar '+mx(j.acceptedAmount)+' EN SIMULACIÓN al proveedor? No habrá transferencia de dinero real.'))return;
  if(local.busy)return;local.busy=true;
  try{await updateDoc(jobDoc(id),{paymentStatus:'released',updatedAt:new Date()});toast('Liberación ficticia realizada; el proveedor verá el saldo simulado.');safeRender();}
  catch(ex){toast(failure(ex))}finally{local.busy=false;}
};
window.withdrawSimulation=async function(id){
  const j=currentJob(id);
  if(!j||j.acceptedProviderUid!==myUid()||j.paymentStatus!=='released'||j.withdrawStatus==='withdrawn')return toast('Saldo no disponible para retirar.');
  if(!confirm('¿Simular el RETIRO de '+mx(j.acceptedAmount)+'? No se transfiere dinero real.'))return;
  if(local.busy)return;local.busy=true;
  try{await updateDoc(jobDoc(id),{withdrawStatus:'withdrawn',updatedAt:new Date()});toast('Retiro ficticio completado.');safeRender();}
  catch(ex){toast(failure(ex))}finally{local.busy=false;}
};
window.wallet=function(){
  const uid=myUid(),mine=Array.from(local.jobs.values()).filter(j=>j.status==='accepted'&&(j.ownerUid===uid||j.acceptedProviderUid===uid));
  const providerJobs=mine.filter(j=>j.acceptedProviderUid===uid);
  const balance=providerJobs.filter(j=>j.paymentStatus==='released'&&j.withdrawStatus!=='withdrawn').reduce((sum,j)=>sum+Number(j.acceptedAmount||0),0);
  const pending=providerJobs.filter(j=>j.paymentStatus==='simulated_paid').reduce((sum,j)=>sum+Number(j.acceptedAmount||0),0);
  return topbar()+'<div class="area" style="padding-top:13px">'+head('Mi billetera')+
    '<h1 class="headline">Billetera de pruebas</h1><p class="sub">Todas las cifras son FICTICIAS y se actualizan mediante Firebase entre los celulares. No conectamos bancos, tarjetas ni Mercado Pago.</p>'+
    '<div class="wallet" style="margin:17px 0"><small>Saldo disponible · SIMULADO</small><strong>'+mx(balance)+'</strong><small>En espera · SIMULADO: '+mx(pending)+'</small><small>SALDO REAL: $0.00 MXN</small></div>'+
    '<h2 style="font-size:20px">Movimientos de prueba</h2><div class="stack" style="margin-top:13px">'+(mine.length?mine.map(j=>{
      const owner=j.ownerUid===uid,amount=mx(j.acceptedAmount);
      return '<div class="request-card"><div class="between"><strong>'+escapeHtml(jobName(j))+'</strong><strong>'+amount+'</strong></div><p>'+paymentLabel(j.paymentStatus)+'</p>'+ 
      '<p class="sub">'+(owner?'Tú eres el cliente':'Tú eres el proveedor')+' · '+workLabel(j.workStatus)+'</p>'+ 
      '<div class="stack"><button class="btn outline small" onclick="go(\'tracking\','+jsonArg(j.id)+')">Abrir servicio</button>'+ 
      (!owner&&j.paymentStatus==='released'&&j.withdrawStatus!=='withdrawn'?'<button class="btn primary small" onclick="withdrawSimulation('+jsonArg(j.id)+')">Simular retiro '+amount+'</button>':'')+
      (j.withdrawStatus==='withdrawn'?'<span class="badge">Retiro ficticio registrado</span>':'')+'</div></div>';
    }).join(''):'<div class="empty">Aún no hay cotizaciones aceptadas. Acepta una oferta desde el celular del cliente para probar el cobro.</div>')+'</div></div>';
};
window.messages=function(){
  const uid=myUid();const rows=[];
  for(const j of local.jobs.values()){
    if(j.ownerUid!==uid&&j.acceptedProviderUid!==uid&&!local.quotes.get(j.id)?.length)continue;
    for(const q of quoted(j)){
      if(j.ownerUid!==uid&&q.providerUid!==uid)continue;
      const m=local.messages.get(key(j.id,q.providerUid))||[];
      rows.push({j,q,last:m.at(-1),when:m.at(-1)?.createdAt?.toMillis?.()||q.createdAt?.toMillis?.()||0});
    }
  }
  rows.sort((a,b)=>b.when-a.when);
  return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">Mis conversaciones</h1><p class="sub">Mensajes reales de prueba entre cuentas distintas. Pulsa una conversación para abrirla.</p><div class="stack" style="margin-top:15px">'+
    (rows.length?rows.map(({j,q,last})=>'<button type="button" style="border:none;background:transparent;text-align:left;padding:0" onclick="openChatFor('+jsonArg(j.id)+','+jsonArg(q.providerUid)+')"><div class="request-card"><div class="between"><strong>'+escapeHtml(j.ownerUid===uid?q.providerName:'Cliente · '+j.category)+'</strong><span class="badge neutral">'+escapeHtml(j.category)+'</span></div><p>'+escapeHtml(last?.body||'Toca para iniciar la conversación')+'</p></div></button>').join(''):
    '<div class="empty">Primero publica una solicitud y recibe una cotización. Después podrás chatear.</div>')+'</div></div>';
};
window.openChatFor=function(id,providerUid){
  const j=currentJob(id),uid=myUid();
  if(!j||!uid||(uid!==j.ownerUid&&uid!==providerUid))return toast('No tienes acceso a esta conversación.');
  const offer=visibleQuote(j,providerUid);
  if(!offer)return toast('La cotización todavía no está disponible. Espera un momento y vuelve a intentarlo.');
  const normalized=data.jobs.find(x=>String(x.id)===String(id));
  if(normalized&&chooseQuoteIndex(normalized,providerUid)<0){
    normalized.offers=[...(normalized.offers||[]),{...offer,providerUid}];
  }
  const i=chooseQuoteIndex(data.jobs.find(x=>String(x.id)===String(id))||{offers:[offer]},providerUid);
  S.chat={id,idx:Math.max(0,i),providerUid};S.jobid=id;go('chat',S.chat);
};
window.openChat=function(id,index){
  const j=currentJob(id);const q=(data.jobs.find(x=>String(x.id)===String(id))?.offers||[])[index]||quoted(j)[index];
  if(!q)return toast('Todavía no aparece esa cotización.');
  return openChatFor(id,q.providerUid||q.id);
};
window.chat=function(){
  const t=S.chat;if(!t)return topbar()+'<div class="area">'+head('Mensajes')+'Abre una conversación desde Solicitudes.</div>';
  const j=currentJob(t.id),q=visibleQuote(j,t.providerUid);if(!j||!q)return topbar()+'<div class="area">'+head('Mensajes')+'No encontramos esa cotización.</div>';
  const messages=local.messages.get(key(t.id,t.providerUid))||[];
  return topbar()+'<div class="area" style="padding-top:13px">'+head('Chat · '+(forOwner(j)?q.providerName:'Cliente'))+
    '<p class="sub">'+escapeHtml(jobName(j))+' · '+mx(q.amount)+' · Chat conectado a Firebase</p>'+
    '<div class="panel" style="margin:15px 0;padding:12px;min-height:35dvh"><div class="stack" id="chatScroll">'+
    (messages.length?messages.map(m=>'<div class="bubble '+(m.senderUid===myUid()?'mine':'')+'">'+escapeHtml(m.body)+'<div class="muted" style="font-size:10px;margin-top:4px">'+escapeHtml(notifyDate(m.createdAt))+'</div></div>').join(''):
    '<div class="sub">Todavía no hay mensajes. Escribe el primero.</div>')+'</div></div>'+
    '<form class="chatbox" onsubmit="sendMessage(event,'+jsonArg(t.id)+','+jsonArg(t.providerUid)+')"><input class="control" id="msg" maxlength="800" required placeholder="Escribe un mensaje..." aria-label="Escribir mensaje"><button class="btn primary" type="submit">Enviar</button></form>'+
    (j.status==='accepted'?'<button class="btn pale block" style="margin-top:15px" onclick="go(\'tracking\','+jsonArg(j.id)+')">Ver servicio y cobro simulado</button>':'')+'</div>';
};
// Reutiliza el envío real de cloud-bridge.js, pero resuelve siempre la cotización por UID.
const originalSendMessage=window.sendMessage;
window.sendMessage=function(event,id,providerUid){
  const j=data.jobs.find(x=>String(x.id)===String(id));
  const index=j?chooseQuoteIndex(j,providerUid):-1;
  if(index<0)return toast('Cargando cotización, vuelve a enviar el mensaje.');
  return originalSendMessage(event,id,index);
};
window.proHome=function(){
  const available=Array.from(local.jobs.values()).filter(j=>j.status==='open'&&j.ownerUid!==myUid());
  const mine=Array.from(local.jobs.values()).filter(j=>j.acceptedProviderUid===myUid());
  return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">Hola, <span class="orange">'+escapeHtml((data.account.name||'profesional').split(' ')[0])+'</span></h1>'+
    '<p class="sub">Tu panel de pruebas está conectado con Firebase. Las solicitudes provienen de otros usuarios registrados.</p>'+ 
    '<div class="grid2" style="margin-top:16px"><div class="request-card"><strong>Oportunidades</strong><h1>'+available.length+'</h1></div><div class="request-card"><strong>Mis trabajos aceptados</strong><h1>'+mine.length+'</h1></div></div>'+ 
    '<div class="stack" style="margin-top:15px"><button class="btn primary block" onclick="go(\'opportunities\')">Ver solicitudes para cotizar</button>'+ 
    '<button class="btn outline block" onclick="go(\'worklist\')">Ver cotizaciones enviadas</button><button class="btn pale block" onclick="go(\'wallet\')">Billetera de prueba</button></div>'+ 
    '<h2 style="margin-top:22px">Trabajos aceptados</h2><div class="stack">'+(mine.length?mine.map(j=>'<div class="request-card"><strong>'+escapeHtml(j.category)+'</strong><p>'+workLabel(j.workStatus)+' · '+paymentLabel(j.paymentStatus)+'</p><button class="btn primary small" onclick="go(\'tracking\','+jsonArg(j.id)+')">Ver seguimiento</button></div>').join(''):'<p class="sub">Aún no tienes trabajos aceptados.</p>')+'</div></div>';
};
window.opportunities=function(){
  const available=Array.from(local.jobs.values()).filter(j=>j.status==='open'&&j.ownerUid!==myUid());
  return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">Chambas disponibles</h1><p class="sub">Publicadas por otras cuentas. Al aceptar una cotización dejará de estar disponible.</p><div class="stack" style="margin-top:15px">'+
    (available.length?available.map(j=>'<div class="request-card"><div class="between"><strong>'+escapeHtml(j.category)+'</strong><span class="badge">Disponible</span></div><p>'+escapeHtml(j.description)+'</p><p>📍 '+escapeHtml(j.zone)+' · '+mx(j.budget)+'</p>'+ 
    (visibleQuote(j,myUid())?'<button class="btn outline" onclick="openChatFor('+jsonArg(j.id)+','+jsonArg(myUid())+')">Ya cotizaste · Abrir chat</button>':'<button class="btn primary" onclick="offerForm('+jsonArg(j.id)+')">Cotizar esta chamba</button>')+'</div>').join(''):'<div class="empty">No hay solicitudes nuevas para cotizar.</div>')+'</div></div>';
};
// Evitar afirmaciones de verificación o cobro real en las pantallas de bienvenida/perfil.
const oldWelcome=window.welcome;
window.welcome=function(){return oldWelcome().replace('Demo: no se envían datos a un servidor ni se procesan pagos.','Beta conectada a Firebase. Los cobros son simulados; no hay transferencias reales.').replace('Crear perfil de prueba','Crear cuenta').replace('Entrar con mi perfil','Iniciar sesión');};
const oldProfile=window.profile;
window.profile=function(){return oldProfile().replace('Reiniciar datos de prueba','Cerrar sesión').replace('onclick="resetDemo()"','onclick="chambeaLogout()"').replace('Billetera (vista conceptual)','Billetera · Simulación');};
// Impedir falsas operaciones creadas por la demo local.
window.nextStatus=function(id){go('tracking',id)};
window.simulateQuotes=function(){toast('Solo se muestran cotizaciones enviadas por cuentas reales de prueba.');};
console.info('CHAMBEA: interacciones multiusuario y pagos ficticios listas para prueba. Sin pagos bancarios.');