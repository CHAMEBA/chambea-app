import { initializeApp, getApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, addDoc, setDoc, getDoc, onSnapshot, query, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const config={apiKey:'AIzaSyDzRHFCHEOszcMUfONy3FpPyz7l-87DHYQ',authDomain:'chambea-app.firebaseapp.com',projectId:'chambea-app',storageBucket:'chambea-app.firebasestorage.app',messagingSenderId:'853197148466',appId:'1:853197148466:web:9c16f209f5a9c8eeec872b'};
const auth=getAuth(getApp()),db=getFirestore(auth.app);
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const jobs=()=>collection(db,'chambea_jobs'), jr=id=>doc(db,'chambea_jobs',id), quotes=id=>collection(db,'chambea_jobs',id,'quotes'), qr=(j,u)=>doc(db,'chambea_jobs',j,'quotes',u),msgs=(j,u)=>collection(db,'chambea_jobs',j,'quotes',u,'messages');
let user=null,rows=[],chosen=null,peer=null,unsubJobs=()=>{},unsubQuotes=()=>{},unsubChat=()=>{};
function err(e){return e.code==='permission-denied'?'Sin permiso de Firebase: falta publicar las reglas seguras de la beta.':e.message||String(e)}
function note(msg,fail=false){$('betaNote').innerHTML='<p style="padding:12px;border-radius:9px;background:'+(fail?'#ffeded':'#e5f5ef')+'">'+esc(msg)+'</p>'}
function view(name){
  $('betaTitle').textContent=name;
  $('betaStart').hidden=name!=='Chambas en línea';
  $('betaForm').hidden=name!=='Publicar solicitud';
  $('betaDetail').hidden=name!=='Cotizaciones y mensajes';
  $('betaChat').hidden=name!=='Conversación';
  $('betaScreen').scrollIntoView({behavior:'smooth'});
}
function card(j,owner){
  const el=document.createElement('div');el.style='border:1px solid #dce9e7;border-radius:12px;padding:13px;margin:10px 0';
  el.innerHTML='<b>'+esc(j.category)+'</b><p>'+esc(j.description)+'</p><small>📍 '+esc(j.zone)+(j.budget?' · $'+Number(j.budget).toLocaleString('es-MX'):'')+'</small><p><button class="btn"> '+(owner?'Ver cotizaciones':'Cotizar y contactar')+'</button></p>';
  el.querySelector('button').onclick=()=>openJob(j.id);
  return el;
}
function render(){
  for(const [id,own] of [['betaMine',true],['betaOther',false]]){
    const box=$(id);box.replaceChildren();
    if(!user){box.textContent='Primero inicia sesión en Perfil.';continue}
    const list=rows.filter(j=>own?j.ownerUid===user.uid:j.ownerUid!==user.uid&&j.status==='open');
    if(!list.length)box.textContent=own?'No has publicado solicitudes en línea.':'No hay solicitudes de otros usuarios todavía.';
    for(const j of list)box.appendChild(card(j,own));
  }
}
function openJob(id){
  unsubQuotes();chosen=rows.find(j=>j.id===id);if(!chosen)return;
  const owner=chosen.ownerUid===user?.uid;
  $('betaJobInfo').textContent=chosen.category+' · '+chosen.description+' · '+chosen.zone;
  $('betaOfferForm').hidden=owner;
  $('betaOffers').replaceChildren();
  view('Cotizaciones y mensajes');
  if(owner){
    unsubQuotes=onSnapshot(quotes(id),snap=>{
      const box=$('betaOffers');box.replaceChildren();
      if(snap.empty)box.textContent='Esperando cotizaciones de otros celulares…';
      snap.forEach(d=>{
        const x=d.data(),node=document.createElement('div');node.className='card';
        node.innerHTML='<b>'+esc(x.providerName)+'</b><p>$'+Number(x.amount).toLocaleString('es-MX')+' MXN</p><p>'+esc(x.note)+'</p><button class="btn">Abrir conversación</button>';
        node.querySelector('button').onclick=()=>openChat(d.id);
        box.appendChild(node);
      });
    },e=>note(err(e),true));
  }else{
    getDoc(qr(id,user.uid)).then(s=>{
      if(chosen?.id!==id)return;
      if(s.exists()){
        $('betaOfferForm').hidden=true;
        $('betaOffers').innerHTML='<p class="notice">Ya enviaste una cotización.</p><button class="btn" id="goChat">Contactar al cliente</button>';
        $('goChat').onclick=()=>openChat(user.uid);
      }
    }).catch(e=>note(err(e),true));
  }
}
function openChat(provider){
  unsubChat();peer=provider;view('Conversación');
  $('betaMessages').replaceChildren();
  unsubChat=onSnapshot(query(msgs(chosen.id,provider),orderBy('createdAt','asc')),snap=>{
    const box=$('betaMessages');box.replaceChildren();
    snap.forEach(d=>{
      const x=d.data(),p=document.createElement('p');
      p.style='background:'+(x.senderUid===user.uid?'#ddf5e8':'#f1f5f5')+';padding:10px;border-radius:10px;margin:7px 0';
      p.textContent=(x.senderUid===user.uid?'Tú: ':'Otro usuario: ')+x.body;box.appendChild(p);
    });box.scrollTop=box.scrollHeight;
  },e=>note(err(e),true));
}
function setup(){
  const host=document.createElement('section');
  host.id='betaScreen';host.style='background:white;padding:18px 20px;border-top:5px solid #087b78';
  host.innerHTML='<h2 id="betaTitle">Chambas en línea</h2><div id="betaNote"></div><div id="betaStart"><p class="muted">Piloto conectado: publica, cotiza y conversa con cuentas diferentes.</p><button class="cta" id="betaNew">+ Publicar solicitud en línea</button><h3>Solicitudes de otros clientes</h3><div id="betaOther"></div><h3>Mis solicitudes</h3><div id="betaMine"></div></div><form id="betaForm" hidden><label>Servicio</label><select id="betaCat" required></select><label>Descripción</label><textarea id="betaDesc" minlength="10" maxlength="1200" required></textarea><label>Zona general (sin dirección exacta)</label><input id="betaZone" minlength="2" maxlength="100" required><label>Presupuesto opcional</label><input id="betaBudget" type="number" min="0" max="10000000"><button class="cta">Publicar para otros celulares</button></form><div id="betaDetail" hidden><p id="betaJobInfo"></p><form id="betaOfferForm"><label>Nombre de proveedor</label><input id="betaName" minlength="2" maxlength="70" required><label>Importe MXN</label><input id="betaAmount" type="number" min="1" max="10000000" required><label>Tu propuesta</label><textarea id="betaOfferNote" minlength="10" maxlength="1000" required></textarea><button class="cta">Enviar cotización</button></form><div id="betaOffers"></div></div><div id="betaChat" hidden><div id="betaMessages" style="max-height:350px;overflow:auto"></div><form id="betaMessageForm"><label>Mensaje de prueba</label><textarea id="betaMessage" maxlength="800" required></textarea><button class="cta">Enviar mensaje</button></form></div><button class="btn" id="betaBack" style="margin:15px 0">Volver a chambas en línea</button>';
  document.querySelector('.app').appendChild(host);
  $('betaCat').innerHTML='<option value="">Selecciona</option>'+['Plomería','Electricidad','Construcción','Pintura','Limpieza','Jardinería','Climatización','Carpintería','Seguridad','Energía solar','Mudanzas','Lavado de autos'].map(x=>'<option>'+x+'</option>').join('');
  $('betaNew').onclick=()=>view('Publicar solicitud');$('betaBack').onclick=()=>view('Chambas en línea');
  const nav=document.querySelector('.nav');const b=document.createElement('button');b.innerHTML='<b>☁</b>En línea';b.onclick=()=>view('Chambas en línea');nav.appendChild(b);
  $('betaForm').onsubmit=async e=>{e.preventDefault();if(!user)return note('Primero entra a Perfil e inicia sesión.',true);
    try{await addDoc(jobs(),{ownerUid:user.uid,category:$('betaCat').value,description:$('betaDesc').value.trim(),zone:$('betaZone').value.trim(),budget:Number($('betaBudget').value)||0,status:'open',createdAt:serverTimestamp()});$('betaForm').reset();note('Solicitud publicada para los demás usuarios.');view('Chambas en línea')}catch(x){note(err(x),true)}};
  $('betaOfferForm').onsubmit=async e=>{e.preventDefault();if(!user||!chosen||user.uid===chosen.ownerUid)return;
    try{await setDoc(qr(chosen.id,user.uid),{providerUid:user.uid,clientUid:chosen.ownerUid,providerName:$('betaName').value.trim(),amount:Number($('betaAmount').value),note:$('betaOfferNote').value.trim(),status:'sent',createdAt:serverTimestamp()});note('Cotización enviada.');openJob(chosen.id)}catch(x){note(err(x),true)}};
  $('betaMessageForm').onsubmit=async e=>{e.preventDefault();if(!user||!chosen||!peer)return;
    try{await addDoc(msgs(chosen.id,peer),{senderUid:user.uid,body:$('betaMessage').value.trim(),createdAt:serverTimestamp()});$('betaMessage').value=''}catch(x){note(err(x),true)}};
  onAuthStateChanged(auth,u=>{
    user=u;unsubJobs();rows=[];render();if(!u)return;
    unsubJobs=onSnapshot(query(jobs(),orderBy('createdAt','desc')),snap=>{rows=snap.docs.map(d=>({id:d.id,...d.data()}));render()},e=>note(err(e),true));
  });
  render();
}
setup();
