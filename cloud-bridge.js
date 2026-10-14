import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig={
  apiKey:'AIzaSyDzRHFCHEOszcMUfONy3FpPyz7l-87DHYQ',
  authDomain:'chambea-app.firebaseapp.com',
  projectId:'chambea-app',
  storageBucket:'chambea-app.firebasestorage.app',
  messagingSenderId:'853197148466',
  appId:'1:853197148466:web:9c16f209f5a9c8eeec872b'
};
const cloudApp=initializeApp(firebaseConfig);
const cloudAuth=getAuth(cloudApp);
const cloudDB=getFirestore(cloudApp);
const jobsRef=()=>collection(cloudDB,'chambea_jobs');
const jobRef=id=>doc(cloudDB,'chambea_jobs',String(id));
const quotesRef=id=>collection(cloudDB,'chambea_jobs',String(id),'quotes');
const quoteRef=(id,uid)=>doc(cloudDB,'chambea_jobs',String(id),'quotes',uid);
const messagesRef=(id,uid)=>collection(cloudDB,'chambea_jobs',String(id),'quotes',uid,'messages');
const current={user:null,online:[],quotes:new Map(),stops:[],chatStop:null,chat:null,loaded:false};

function banner(message,failed=false) {
  const node=document.getElementById('cloudStatus');
  if(node){node.textContent=message;node.style.background=failed?'#9b2828':'#005450';}
}
const errorMessage=error=>{
  if(error?.code==='permission-denied')return 'Firebase no autorizó esta operación. Revisa las reglas de Firestore.';
  if(error?.code==='auth/email-already-in-use')return 'Ese correo ya está registrado. Elige Iniciar sesión.';
  if(error?.code==='auth/invalid-credential')return 'Correo o contraseña incorrectos.';
  if(error?.code==='auth/weak-password')return 'La contraseña debe tener al menos 6 caracteres.';
  if(error?.code==='unavailable')return 'No hay conexión con Firebase. Revisa tu Internet.';
  return error?.message||String(error);
};
function guard(){
  if(current.user)return true;
  toast('Inicia sesión para continuar. Las solicitudes se comparten entre usuarios registrados.');
  authMode('login');
  return false;
}
function quota(id){const q=current.quotes.get(String(id));return Array.isArray(q)?q:[];}
function normalize(d,id){
  const offers=quota(id);
  return {
    id,ownerUid:d.ownerUid,cat:d.category||'Servicio',desc:d.description||'',city:d.zone||'',
    budget:d.budget||0,date:'',materials:false,photos:[],status:d.status==='closed'?'finalizado':'publicado',
    mine:d.ownerUid===current.user?.uid,created:d.createdAt?.toMillis?.()||Date.now(),
    offers,accepted:null,cloud:true
  };
}
function redraw(){
  if(!current.user)return;
  data.jobs=current.online.map(j=>normalize(j.data,j.id));
  // No se publican ni se migran las solicitudes antiguas de localStorage.
  const safePages=['home','jobs','job','quotes','proHome','opportunities','worklist','messages','profile','notifications'];
  if(safePages.includes(S.page))render();
}
function release(){
  current.stops.forEach(stop=>{try{stop()}catch{}});current.stops=[];
  if(current.chatStop){current.chatStop();current.chatStop=null;}
  current.online=[];current.quotes.clear();data.jobs=[];
}
function watchQuote(id,owner){
  const stop=owner?
    onSnapshot(quotesRef(id), snap=>{
      current.quotes.set(String(id),snap.docs.map(d=>({id:d.id,pro:d.id,name:d.data().providerName||'Profesional',price:d.data().amount,
        message:d.data().note||'',providerUid:d.id,demo:false,created:d.data().createdAt?.toMillis?.()||0}))
        .sort((a,b)=>a.created-b.created));
      redraw();
    },ex=>{banner(errorMessage(ex),true);console.error('quotes',ex);})
    :
    onSnapshot(quoteRef(id,current.user.uid),snap=>{
      const d=snap.exists()?snap.data():null;
      current.quotes.set(String(id),d?[{id:current.user.uid,pro:'local',name:d.providerName||'Mi cotización',price:d.amount,
        message:d.note||'',providerUid:current.user.uid,demo:false,created:d.createdAt?.toMillis?.()||0}]:[]);
      redraw();
    },ex=>{banner(errorMessage(ex),true);console.error('my quote',ex);});
  current.stops.push(stop);
}
function startJobs(user){
  let nestedStops=[];
  const stop=onSnapshot(query(jobsRef(),orderBy('createdAt','desc')),snapshot=>{
    nestedStops.forEach(unsub=>unsub());nestedStops=[];
    current.online=snapshot.docs.map(d=>({id:d.id,data:d.data()}));
    const ids=new Set(current.online.map(j=>j.id));
    for(const id of current.quotes.keys())if(!ids.has(id))current.quotes.delete(id);
    for(const j of current.online){
      const owner=j.data.ownerUid===user.uid;
      const unsub=owner?
        onSnapshot(quotesRef(j.id),snap=>{
          current.quotes.set(j.id,snap.docs.map(d=>({
            id:d.id,pro:d.id,name:d.data().providerName,price:d.data().amount,message:d.data().note,
            providerUid:d.id,demo:false,created:d.data().createdAt?.toMillis?.()||0
          })).sort((a,b)=>a.created-b.created));
          redraw();
        },ex=>banner(errorMessage(ex),true))
        :
        onSnapshot(quoteRef(j.id,user.uid),snap=>{
          const d=snap.exists()?snap.data():null;
          current.quotes.set(j.id,d?[{id:user.uid,pro:'local',name:d.providerName,
            price:d.amount,message:d.note,providerUid:user.uid,demo:false,created:d.createdAt?.toMillis?.()||0}]:[]);
          redraw();
        },ex=>banner(errorMessage(ex),true));
      nestedStops.push(unsub);
    }
    redraw();banner('En línea · Firebase conectado');
  },ex=>{banner(errorMessage(ex),true);console.error('chambea jobs',ex)});
  current.stops.push(()=>{stop();nestedStops.forEach(unsub=>unsub())});
}
async function readProfile(user){
  const snapshot=await getDoc(doc(cloudDB,'usuarios',user.uid));
  if(cloudAuth.currentUser?.uid!==user.uid)return;
  const profile=snapshot.exists()?snapshot.data():{};
  data.account={
    name:profile.name||user.displayName||data.account.name||'',
    email:user.email||'',city:profile.zone||'Guadalajara',
    specialty:profile.skill||'Plomería',bio:profile.bio||''
  };
  data.session=true;
  data.jobs=[];save();
  if(S.page==='auth'||S.page==='welcome'){S.previous=[];S.page='home';}
  render();
}
onAuthStateChanged(cloudAuth,async user=>{
  if(current.user?.uid===user?.uid&&current.loaded)return;
  release();current.user=user;current.loaded=true;
  if(!user){
    data.session=false;data.jobs=[];save();
    if(S.page!=='auth'&&S.page!=='welcome')S.page='welcome';
    banner('Modo de prueba · Inicia sesión para conectar');
    render();return;
  }
  banner('Conectando solicitudes...');
  try{await readProfile(user)}catch(ex){banner(errorMessage(ex),true);console.error('profile',ex)}
  startJobs(user);
});

window.auth=function(){
  return '<div class="authwrap">'+logo(205)+head(S.auth==='register'?'Crea tu cuenta':'Inicia sesión')+
    '<p class="sub">CHAMBEA Beta · Tus solicitudes, cotizaciones y mensajes se conectan mediante Firebase.</p>'+
    '<form onsubmit="enterDemo(event)">'+
    (S.auth==='register'?'<div class="field"><label class="label">Nombre</label><input class="control" id="regname" required maxlength="70" placeholder="Tu nombre"></div>':'')+
    '<div class="field"><label class="label">Correo electrónico</label><input class="control" id="regemail" type="email" autocomplete="email" required placeholder="tu@correo.com"></div>'+
    '<div class="field"><label class="label">Contraseña (mínimo 6 caracteres)</label><input class="control" id="regpassword" type="password" minlength="6" autocomplete="'+(S.auth==='register'?'new-password':'current-password')+'" required></div>'+
    (S.auth==='register'?'<div class="field"><label class="label">Ciudad</label><select class="control" id="regcity">'+cityOptions('Guadalajara')+'</select></div>':'')+
    '<button class="btn primary block" type="submit">'+(S.auth==='register'?'Crear cuenta':'Iniciar sesión')+' '+ico('arrow')+'</button></form>'+
    '<button class="btn outline block" style="margin-top:12px" onclick="authMode(\''+(S.auth==='register'?'login':'register')+'\')">'+
    (S.auth==='register'?'¿Ya tienes cuenta? Inicia sesión':'¿No tienes cuenta? Regístrate')+'</button>'+
    '<p class="sub" style="font-size:11px;margin-top:20px">Solo pruebas: no hay pagos reales ni verificaciones de identidad activas.</p></div>';
};
window.enterDemo=async function(ev){
  ev.preventDefault();
  const mail=document.getElementById('regemail')?.value.trim();
  const password=document.getElementById('regpassword')?.value||'';
  const button=ev.target.querySelector('button[type=submit]');button.disabled=true;
  try{
    if(S.auth==='register'){
      const name=document.getElementById('regname')?.value.trim();
      const city=document.getElementById('regcity')?.value||'Guadalajara';
      if(!name)throw Error('Indica tu nombre.');
      const result=await createUserWithEmailAndPassword(cloudAuth,mail,password);
      await setDoc(doc(cloudDB,'usuarios',result.user.uid),{
        name,zone:city,skill:'Plomería',email:mail,updatedAt:serverTimestamp()
      },{merge:true});
      data.account={...data.account,name,city,email:mail};
    }else{
      await signInWithEmailAndPassword(cloudAuth,mail,password);
    }
    S.previous=[];S.page='home';data.session=true;save();render();
    toast('Cuenta conectada a Firebase');
  }catch(ex){toast(errorMessage(ex));}
  finally{button.disabled=false;}
};
window.guest=function(){
  toast('Para compartir solicitudes entre teléfonos necesitas iniciar sesión.');
  authMode('login');
};
window.submitPost=async function(ev){
  ev.preventDefault();if(!guard())return;
  const description=document.getElementById('description')?.value.trim()||'';
  const category=document.getElementById('service')?.value||'';
  const zone=document.getElementById('locality')?.value||'';
  const budget=Number(document.getElementById('budget')?.value||0);
  if(description.length<10||description.length>1200||!category||zone.length<2||budget<0||budget>10000000){
    toast('Completa servicio, descripción, zona y presupuesto válido.');return;
  }
  const button=ev.target.querySelector('button[type=submit]');button.disabled=true;
  try{
    const result=await addDoc(jobsRef(),{
      ownerUid:current.user.uid,category,description,zone,budget,status:'open',createdAt:serverTimestamp()
    });
    S.photo=[];S.previous=[];S.jobid=result.id;S.page='jobs';
    render();toast('Solicitud publicada: ya pueden verla otros usuarios');
  }catch(ex){toast(errorMessage(ex))}
  finally{button.disabled=false}
};
window.sendOffer=async function(ev){
  ev.preventDefault();if(!guard())return;
  const job=S.offer;
  if(!job||job.ownerUid===current.user.uid){toast('No puedes cotizar tu propio trabajo');return;}
  const amount=Number(document.getElementById('offerPrice')?.value||0);
  const note=document.getElementById('offerText')?.value.trim()||'';
  if(!Number.isFinite(amount)||amount<=0||amount>10000000||note.length<10||note.length>1000){
    toast('Escribe un precio y describe la propuesta en al menos 10 caracteres');return;
  }
  const button=ev.target.querySelector('button[type=submit]');button.disabled=true;
  try{
    await setDoc(quoteRef(job.id,current.user.uid),{
      providerUid:current.user.uid,clientUid:job.ownerUid,
      providerName:data.account.name||'Profesional de prueba',
      amount,note,status:'sent',createdAt:serverTimestamp()
    });
    S.offerOpen=false;S.offer=null;S.previous=[];S.page='worklist';
    render();toast('Cotización enviada: el cliente puede verla');
  }catch(ex){toast(errorMessage(ex))}
  finally{button.disabled=false}
};
window.acceptQuote=function(){toast('Aceptar cotizaciones es una función pendiente. Por ahora solo se prueban cotizaciones y chat.');};
window.simulateQuotes=function(){toast('Las cotizaciones de ejemplo están desactivadas en el piloto conectado.');};
window.sampleJobs=function(){return []};
window.opportunities=function(){
  const available=data.jobs.filter(j=>!j.mine&&j.status==='publicado');
  return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">Chambas disponibles</h1>'+
    '<p class="sub">Solicitudes publicadas en línea por otras cuentas. Puedes cotizarlas.</p><div class="stack" style="margin-top:16px">'+
    (available.length?available.map(proOpp).join(''):'<div class="empty">'+ico('file')+
      '<h3>Aún no hay solicitudes disponibles</h3><p>Publica una chamba desde otro teléfono con otra cuenta.</p></div>')+
    '</div></div>';
};
window.proHome=function(){
  const available=data.jobs.filter(j=>!j.mine&&j.status==='publicado');
  const proposals=data.jobs.flatMap(j=>(j.offers||[]).filter(q=>q.providerUid===current.user?.uid));
  return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">Hola, <span class="orange">'+
    e((data.account.name||'profesional').split(' ')[0])+'</span></h1>'+
    '<p class="sub">Tus oportunidades reales de prueba, conectadas con Firebase.</p>'+
    '<div class="statrow" style="margin-top:17px"><div><div class="tiny">'+ico('file','inlineicon')+' Solicitudes disponibles</div><div class="big">'+available.length+'</div></div>'+
    '<div style="background:#fff6ed"><div class="tiny">'+ico('briefcase','inlineicon')+' Mis cotizaciones</div><div class="big">'+proposals.length+'</div></div>'+
    '<div style="background:#edf7fc"><div class="tiny">'+ico('star','inlineicon')+' Estado</div><div class="big" style="font-size:18px">Beta</div></div></div>'+
    '<div class="panel" style="padding:16px;margin-top:14px"><div class="between"><div><strong>Mi especialidad</strong><p class="sub">'+e(data.account.specialty)+'</p></div>'+
    '<button class="btn outline small" onclick="go(\'profile\')">Editar perfil</button></div></div>'+
    section('Solicitudes cerca de ti','<button class="link" onclick="go(\'opportunities\')">Ver todas →</button>')+
    '<div class="stack">'+(available.length?available.slice(0,3).map(proOpp).join(''):
      '<div class="empty">Aún no hay nuevas solicitudes de otros usuarios.</div>')+'</div></div>';
};
window.worklist=function(){
  const mine=data.jobs.flatMap(j=>(j.offers||[]).filter(q=>q.providerUid===current.user?.uid).map(q=>({j,q})));
  const form=S.offerOpen?'<form class="panel" onsubmit="sendOffer(event)" style="padding:17px;margin:18px 0"><h3>Cotizar: '+e(S.offer?.cat||'')+'</h3>'+
    '<p class="sub">'+e(S.offer?.desc||'')+'</p><div class="field"><label class="label">Mi precio (MXN)</label>'+
    '<input class="control" id="offerPrice" type="number" min="1" max="10000000" required></div>'+
    '<div class="field"><label class="label">¿Qué incluye y cuándo puedes realizarlo?</label>'+
    '<textarea class="control" id="offerText" required minlength="10" maxlength="1000"></textarea></div>'+
    '<button class="btn primary block" type="submit">Enviar cotización al cliente</button></form>':'';
  return topbar()+'<div class="area" style="padding-top:13px"><h1 class="headline">Mis cotizaciones</h1>'+
    '<p class="sub">Propuestas que enviaste desde esta cuenta.</p>'+form+
    '<div class="stack" style="margin-top:16px">'+
    (mine.length?mine.map(({j,q})=>{
      const idx=j.offers.findIndex(o=>o.providerUid===q.providerUid);
      return '<div class="request-card"><h3>'+e(j.cat)+'</h3><p>'+e(j.desc)+'</p>'+
        '<strong>'+fmt(q.price)+'</strong><p class="sub">'+e(q.message)+'</p>'+
        '<button class="btn primary small" onclick="openChat('+JSON.stringify(j.id)+','+idx+')">'+ico('chat')+' Hablar con el cliente</button></div>';
    }).join(''):'<div class="empty">'+ico('briefcase')+
      '<h3>No has enviado cotizaciones</h3><button class="btn primary" onclick="go(\'opportunities\')">Ver solicitudes</button></div>')+
    '</div></div>';
};
window.openChat=function(id,index){
  if(!guard())return;
  const j=getJob(id),q=j?.offers?.[index];
  if(!j||!q||!q.providerUid){toast('No encontramos esta conversación');return;}
  const providerUid=q.providerUid;
  if(!j.mine&&providerUid!==current.user.uid){toast('Esta conversación es privada');return;}
  if(current.chatStop)current.chatStop();
  S.chat={id,idx:index};current.chat={id,index,providerUid};go('chat',S.chat);
  current.chatStop=onSnapshot(query(messagesRef(id,providerUid),orderBy('createdAt','asc')),snap=>{
    const key=threadKey(id,index);
    data.messages[key]=snap.docs.map(d=>({
      text:d.data().body,mine:d.data().senderUid===current.user?.uid,
      at:d.data().createdAt?.toDate?.().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})||''
    }));
    if(S.page==='chat'&&S.chat?.id===id)render();
  },ex=>banner(errorMessage(ex),true));
};
window.sendMessage=async function(ev,id,index){
  ev.preventDefault();if(!guard())return;
  const body=document.getElementById('msg')?.value.trim()||'';
  if(!body||body.length>400)return;
  const job=getJob(id),q=job?.offers?.[index];
  if(!q?.providerUid){toast('No se encontró el destinatario');return;}
  const button=ev.target.querySelector('button[type=submit]');button.disabled=true;
  try{
    await addDoc(messagesRef(id,q.providerUid),{
      senderUid:current.user.uid,body,createdAt:serverTimestamp()
    });
    document.getElementById('msg').value='';
  }catch(ex){toast(errorMessage(ex))}
  finally{button.disabled=false}
};
const oldProfile=window.profile;
window.profile=function(){
  const html=oldProfile();
  return html.replace('Sin autenticación real, verificación de identidad ni cobros. Los datos existen solo en este dispositivo.',
    'Cuenta conectada a Firebase. Las verificaciones de identidad y los cobros aún no están habilitados.')
    .replace('</form><div class="separator"></div>','</form><div class="separator"></div>'+
      '<button class="btn outline block" style="margin-bottom:12px" onclick="chambeaLogout()">Cerrar sesión</button>');
};
window.saveMyProfile=async function(ev){
  ev.preventDefault();if(!guard())return;
  const name=document.getElementById('name')?.value.trim()||'';
  const zone=document.getElementById('mycity')?.value||'Guadalajara';
  const skill=document.getElementById('myskill')?.value||data.account.specialty;
  const bio=document.getElementById('mybio')?.value.trim()||data.account.bio;
  if(!name){toast('Escribe tu nombre');return;}
  try{
    await setDoc(doc(cloudDB,'usuarios',current.user.uid),{
      name,zone,skill,bio,email:current.user.email,updatedAt:serverTimestamp()
    },{merge:true});
    data.account={...data.account,name,city:zone,specialty:skill,bio};
    save();render();toast('Perfil guardado en Firebase');
  }catch(ex){toast(errorMessage(ex))}
};
window.chambeaLogout=async function(){
  try{await signOut(cloudAuth);toast('Cerraste sesión');}catch(ex){toast(errorMessage(ex))}
};
banner('Preparando conexión Firebase...');
