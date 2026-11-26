import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import { getFirestore, doc, collection, query, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC4KdInGBaDqWr_X0GLGw-uGlZhYpdhPYk',
  authDomain: 'la-labbrata---magazzino.firebaseapp.com',
  projectId: 'la-labbrata---magazzino',
  storageBucket: 'la-labbrata---magazzino.firebasestorage.app',
  messagingSenderId: '439793737733',
  appId: '1:439793737733:web:89b7d446c33b18804f3c6c',
  measurementId: 'G-G1CEWC8WBV'
};
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let importPayload=null;
let user=null, warehouse=null, warehouseId='', beers=[], moves=[], stopBeers=null, stopMoves=null, working=false, selectedBeer='', camera=null, scanTick=null, scannerBusy=false, detector=null;
const locations={ 'zardelnord@gmail.com':'Zardelnord','lalabbrata@gmail.com':'La Labbrata'};
const localStatus=s=>$('status').textContent=s;
let pendingWarehouseName='';
const toast=s=>{const n=$('toast');n.textContent=s;n.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>n.style.display='none',3300)};
const loading=(b,yes)=>{b.disabled=yes};
function stopListeners(){if(stopBeers){stopBeers();stopBeers=null}if(stopMoves){stopMoves();stopMoves=null}beers=[];moves=[];warehouse=null;warehouseId=''}
function showLogin(error=''){$('appView').classList.add('hidden');$('nav').classList.add('hidden');$('loginView').classList.remove('hidden');$('loginError').textContent=error}
function showApp(){$('loginView').classList.add('hidden');$('appView').classList.remove('hidden');$('nav').classList.remove('hidden');tab('Stock')}
function tab(tabName){for(const name of ['Stock','History','Settings'])$('tab'+name).classList.toggle('hidden',name!==tabName);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tabName))}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';loading($('loginBtn'),true);try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}catch(err){$('loginError').textContent='Accesso non riuscito. Controlla email, password e connessione.'}finally{loading($('loginBtn'),false)}};
$('showRegister').onclick=()=>{$('loginView').classList.add('hidden');$('registerView').classList.remove('hidden');$('registerError').textContent=''};
$('backLogin').onclick=()=>{$('registerView').classList.add('hidden');$('loginView').classList.remove('hidden')};
$('registerForm').onsubmit=async e=>{
 e.preventDefault();$('registerError').textContent='';const btn=$('registerBtn');loading(btn,true);
 try{
  const email=$('registerEmail').value.trim(),pw=$('registerPassword').value,name=$('registerName').value.trim();
  if(name.length<2||name.length>60)throw Error('Il nome del magazzino deve avere da 2 a 60 caratteri.');
  if(pw.length<8)throw Error('Usa una password di almeno 8 caratteri.');
  if(pw!==$('registerConfirm').value)throw Error('Le password non coincidono.');
  pendingWarehouseName=name;
  await createUserWithEmailAndPassword(auth,email,pw);
  // L'autenticazione attiva il listener che crea il magazzino personale.
  $('registerError').textContent='Account creato. Preparazione del magazzino…';
 }catch(err){pendingWarehouseName='';$('registerError').textContent=err.message||'Registrazione non riuscita.'}
 finally{loading(btn,false)}
};
$('logout').onclick=async()=>{stopScanner();stopListeners();await signOut(auth)};
onAuthStateChanged(auth,async u=>{
 stopListeners();user=u;if(!u){$('registerView').classList.add('hidden');showLogin();return}
 try{
  const email=u.email?.toLowerCase()||'';
  const legacy=locations[email];
  const chosen=legacy||('personale_'+u.uid);
  const ref=doc(db,'magazzini',chosen);
  let snap=await getDoc(ref);
  if(!snap.exists()&&!legacy){
    // Solo i nuovi account possono creare un magazzino con ID collegato al proprio UID.
    const suggested=(pendingWarehouseName||('Magazzino '+(u.email?.split('@')[0]||'personale'))).slice(0,60);
    await setDoc(ref,{nome:suggested,tipo:'privato',ownerUid:u.uid});
    snap=await getDoc(ref);
  }
  pendingWarehouseName='';
  if(!snap.exists()||snap.data().ownerUid!==u.uid){
    await signOut(auth);showLogin('Accesso non autorizzato al magazzino. Controlla il proprietario in Firebase.');return;
  }
  warehouseId=chosen;warehouse=snap.data();$('warehouseTitle').textContent=warehouse.nome||chosen;$('subheading').textContent=warehouse.nome||chosen;
  $('registerView').classList.add('hidden');showApp();localStatus('Connessione al magazzino…');
  stopBeers=onSnapshot(collection(db,'magazzini',warehouseId,'birre'),snapshot=>{beers=snapshot.docs.map(d=>({id:d.id,...d.data()}));beers.sort((a,b)=>String(a.name).localeCompare(String(b.name),'it'));render();localStatus('● Online · sincronizzazione attiva')},err=>localStatus('Errore lettura birre: '+err.message));
  stopMoves=onSnapshot(collection(db,'magazzini',warehouseId,'movimenti'),snapshot=>{moves=snapshot.docs.map(d=>({id:d.id,...d.data()}));moves.sort((a,b)=>(b.createdMs||0)-(a.createdMs||0));render()},err=>localStatus('Errore storico: '+err.message));
 }catch(err){$('registerView').classList.add('hidden');showLogin('Impossibile aprire il magazzino: '+(err.code||err.message)+' · Verifica che le regole Firestore v3.2 siano pubblicate.');}
});
function render(){let sum=beers.reduce((a,b)=>a+(Number(b.qty)||0),0);$('total').textContent=sum;$('beerCount').textContent=beers.length;
$('beers').innerHTML=beers.map(b=>`<article class="beer"><div class="row" style="align-items:flex-start;flex-wrap:nowrap"><div style="flex:1;min-width:0"><div class="beerName">🍺 ${esc(b.name)}</div><div class="muted">${b.lot?'Lotto '+esc(b.lot):''}${b.date?' · '+esc(b.date):''}</div></div><div style="text-align:right"><div class="beerQty">${Number(b.qty)||0}</div><div class="mini">bottiglie</div></div></div><div class="tools"><button class="btn small" data-move="${esc(b.id)}">± Carica / Scarica</button>${safeUrl(b.qr)?`<a class="btn alt small" style="text-decoration:none" target="_blank" rel="noopener noreferrer" href="${esc(b.qr)}">🔗 Scheda birra</a>`:''}<button class="btn alt small" data-edit="${esc(b.id)}">Modifica</button><button class="btn danger small" data-delete="${esc(b.id)}">Elimina</button></div></article>`).join('')||'<div class="empty">Magazzino vuoto: aggiungi una birra oppure scansionala.</div>';
$('movements').innerHTML=moves.slice(0,250).map(t=>`<div class="tx"><div><b>${esc(t.beerName||'Birra')}</b><small>${esc(({consumo:'Bevuta',vendita:'Venduta',regalo:'Regalata',carico:'Carico'})[t.type]||t.type)} · ${new Date(t.createdMs||Date.now()).toLocaleString('it-IT')}</small>${t.note?`<small>${esc(t.note)}</small>`:''}</div><strong style="color:${t.type==='carico'?'#b5e4ab':'#ffc1a9'}">${t.type==='carico'?'+':'−'}${Number(t.qty)||0}</strong></div>`).join('')||'<div class="empty">Nessun movimento registrato.</div>'}
function safeUrl(s){try{const u=new URL(s);return u.protocol==='https:'}catch{return false}}
function canon(s){try{const u=new URL(s),host=u.hostname.toLowerCase().replace(/^www\./,'');const p=u.pathname.replace(/\/+$/,'');if(host==='drive.google.com'){const match=p.match(/\/file\/d\/([^/]+)/);if(match)return 'drive:'+match[1]}return host+p.toLowerCase()}catch{return String(s||'').trim().toLowerCase()}}
function openBeer(id='',qr=''){$('beerForm').reset();const b=beers.find(x=>x.id===id);$('beerDlgTitle').textContent=b?'Modifica birra':'Nuova birra';$('beerId').value=id;$('initialBox').classList.toggle('hidden',!!b);$('beerName').value=b?.name||'';$('beerLot').value=b?.lot||'';$('beerDate').value=b?.date||'';$('beerQR').value=b?.qr||qr||'';$('initial').value='0';$('beerDlg').showModal()}
$('newBtn').onclick=()=>openBeer();
document.addEventListener('click',e=>{const move=e.target.closest('[data-move]'),edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]'),close=e.target.closest('[data-close]');if(move)openMove(move.dataset.move);if(edit)openBeer(edit.dataset.edit);if(del)removeBeer(del.dataset.delete);if(close)$(close.dataset.close).close()});
$('beerForm').onsubmit=async e=>{e.preventDefault();const button=$('saveBeer');loading(button,true);try{let id=$('beerId').value,name=$('beerName').value.trim(),lot=$('beerLot').value.trim(),date=$('beerDate').value,qr=$('beerQR').value.trim();if(!name||name.length>90)throw Error('Inserisci un nome valido');if(qr&&!safeUrl(qr))throw Error('Il QR deve contenere un link https://');if(qr&&beers.some(b=>b.id!==id&&canon(b.qr)===canon(qr)))throw Error('QR già assegnato a un’altra birra');const coll=collection(db,'magazzini',warehouseId,'birre');if(id){await updateDoc(doc(coll,id),{name,lot,date,qr})}else{const qty=Number($('initial').value);if(!Number.isSafeInteger(qty)||qty<0||qty>99999)throw Error('Quantità non valida');const beerRef=doc(coll),txRef=doc(collection(db,'magazzini',warehouseId,'movimenti'));await runTransaction(db,async tx=>{tx.set(beerRef,{name,lot,date,qr,qty,createdMs:Date.now()});if(qty>0)tx.set(txRef,{beerId:beerRef.id,beerName:name,type:'carico',qty,note:'Carico iniziale',createdMs:Date.now(),createdAt:serverTimestamp(),operatorUid:user.uid})})}$('beerDlg').close();toast('Birra salvata ✓')}catch(err){alert('Impossibile salvare: '+err.message)}finally{loading(button,false)}};
function openMove(id){selectedBeer=id;let b=beers.find(x=>x.id===id);if(!b)return;$('moveForm').reset();$('moveType').value='consumo';$('moveQty').value=1;$('moveBeerLabel').textContent=b.name+' · '+b.qty+' disponibili';$('moveDlg').showModal()}
$('moveForm').onsubmit=async e=>{e.preventDefault();const btn=$('saveMove');loading(btn,true);try{const type=$('moveType').value,qty=Number($('moveQty').value),note=$('moveNote').value.trim();if(!['consumo','vendita','regalo','carico'].includes(type))throw Error('Operazione non valida');if(!Number.isSafeInteger(qty)||qty<1||qty>99999)throw Error('Quantità non valida');const beerRef=doc(db,'magazzini',warehouseId,'birre',selectedBeer),txRef=doc(collection(db,'magazzini',warehouseId,'movimenti'));
await runTransaction(db,async tx=>{const snap=await tx.get(beerRef);if(!snap.exists())throw Error('Birra non trovata');const b=snap.data(),balance=Number(b.qty)||0,next=balance+(type==='carico'?qty:-qty);if(next<0)throw Error('Scorta insufficiente: disponibili '+balance+' bottiglie');if(next>999999)throw Error('Scorta troppo elevata');tx.update(beerRef,{qty:next});tx.set(txRef,{beerId:selectedBeer,beerName:b.name,type,qty,note,createdMs:Date.now(),createdAt:serverTimestamp(),operatorUid:user.uid})});$('moveDlg').close();toast('Movimento sincronizzato ✓')
}catch(err){alert('Movimento non registrato: '+err.message)}finally{loading(btn,false)}};
async function removeBeer(id){const b=beers.find(x=>x.id===id);if(!b)return;if(!confirm('Eliminare la birra '+b.name+'? Lo storico resta disponibile.'))return;if(b.qty>0&&!confirm('Ci sono ancora '+b.qty+' bottiglie. Confermi definitivamente l’eliminazione?'))return;try{await deleteDoc(doc(db,'magazzini',warehouseId,'birre',id));toast('Birra eliminata')}catch(err){alert('Errore eliminazione: '+err.message)}}
$('backupBtn').onclick=()=>{let data={format:'LaLabbrata-Firebase-v3',warehouse:warehouseId,exportedAt:new Date().toISOString(),beers,movements:moves};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='LaLabbrata_'+warehouseId+'_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
function stopScanner(){scannerBusy=false;if(scanTick){clearTimeout(scanTick);scanTick=null}if(camera){camera.getTracks().forEach(x=>x.stop());camera=null}const video=$('video');video.pause();video.srcObject=null}
$('scanDlg').addEventListener('close',stopScanner);$('closeScan').onclick=()=>$('scanDlg').close();
$('scanBtn').onclick=async()=>{$('manualQR').value='';$('scanStatus').textContent='Avvio fotocamera…';$('scanDlg').showModal();if(!navigator.mediaDevices?.getUserMedia){$('scanStatus').textContent='Fotocamera non disponibile: incolla il link';return}try{camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(!$('scanDlg').open){stopScanner();return}const video=$('video');video.srcObject=camera;await video.play();if('BarcodeDetector' in window){try{detector=new BarcodeDetector({formats:['qr_code']})}catch{detector=null}}scannerBusy=true;scanFrame()}catch(err){$('scanStatus').textContent='Impossibile aprire la fotocamera: verifica permessi o usa il link manuale'}};
async function scanFrame(){if(!scannerBusy)return;try{const v=$('video');if(v.readyState>=2){let raw='';if(detector){const codes=await detector.detect(v);raw=codes[0]?.rawValue||''}if(!raw&&window.jsQR){const c=$('canvas'),scale=Math.min(1,700/v.videoWidth);c.width=Math.max(1,Math.floor(v.videoWidth*scale));c.height=Math.max(1,Math.floor(v.videoHeight*scale));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(v,0,0,c.width,c.height);const x=window.jsQR(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height);raw=x?.data||''}if(raw){$('scanDlg').close();resolveQR(raw);return}}}catch(err){$('scanStatus').textContent='Problema nella lettura: puoi incollare il link.'}scanTick=setTimeout(scanFrame,240)}
function resolveQR(raw){const url=String(raw||'').trim();if(!safeUrl(url)){toast('Il QR non contiene un link https valido');return}const b=beers.find(x=>x.qr&&canon(x.qr)===canon(url));if(b){tab('Stock');openMove(b.id);toast('QR riconosciuto: '+b.name)}else if(confirm('QR non ancora registrato. Vuoi creare una nuova birra?'))openBeer('',url)}
$('findQR').onclick=()=>{const raw=$('manualQR').value;$('scanDlg').close();resolveQR(raw)};

// Importazione conservativa backup v2.1 → Firestore.
const importFile=$('importFile'),previewButton=$('previewImport'),previewBox=$('importPreview'),confirmBox=$('importConfirmBox'),confirmInput=$('importConfirmInput'),confirmLabel=$('importConfirmLabel'),runImportButton=$('runImport'),importStatus=$('importStatus');
function resetImport(){importPayload=null;previewBox.classList.add('hidden');confirmBox.classList.add('hidden');confirmInput.value='';runImportButton.disabled=true;importStatus.textContent=''}
importFile.addEventListener('change',resetImport);
function validateV2(data){
 if(!data||data.version!==1||!Array.isArray(data.beers)||!Array.isArray(data.transactions))throw Error('Il file non è un backup JSON La Labbrata v2.1 valido.');
 if(!data.beers.length)throw Error('Il backup non contiene birre.');
 if(data.beers.length>200||data.transactions.length>250)throw Error('Backup troppo grande: contattaci per una migrazione divisa in blocchi.');
 const ids=new Set(),txIds=new Set();
 for(const b of data.beers){if(!b||typeof b.id!=='string'||!b.id||b.id.includes('/')||ids.has(b.id)||typeof b.name!=='string'||!b.name.trim()||b.name.length>90||!Number.isSafeInteger(b.qty)||b.qty<0||b.qty>999999||typeof b.qr!=='string'||(b.qr&&!safeUrl(b.qr)))throw Error('Una birra ha ID, quantità, nome o URL non valido.');ids.add(b.id)}
 for(const t of data.transactions){if(!t||typeof t.id!=='string'||!t.id||t.id.includes('/')||txIds.has(t.id)||!['carico','consumo','vendita','regalo'].includes(t.type)||!Number.isSafeInteger(t.qty)||t.qty<1||t.qty>999999||!Number.isFinite(Date.parse(t.date))||typeof t.beerId!=='string')throw Error('Uno dei movimenti contiene dati non validi.');txIds.add(t.id)}
 if(data.beers.length+data.transactions.length>400)throw Error('Limite scritture raggiunto.');
 return {beers:data.beers,transactions:data.transactions};
}
previewButton.onclick=async()=>{
 resetImport();try{
  if(!user||!warehouseId)throw Error('Devi effettuare l’accesso.');
  const file=importFile.files?.[0];if(!file)throw Error('Seleziona prima il file JSON.');if(file.size>1024*1024)throw Error('File troppo grande.');
  const d=validateV2(JSON.parse(await file.text()));
  if(beers.length)throw Error('Il magazzino contiene già '+beers.length+' birre. Per evitare duplicati, importa solo in un magazzino senza birre. Rimuovi prima le birre di prova, dopo aver salvato un backup.');
  const sum=d.beers.reduce((a,b)=>a+b.qty,0), name=warehouseId;
  importPayload={...d, target:warehouseId, uid:user.uid};
  previewBox.classList.remove('hidden');
  previewBox.innerHTML='<b>Destinazione: '+esc(name)+'</b><p>'+d.beers.length+' birre, '+sum+' bottiglie, '+d.transactions.length+' movimenti storici.</p><p>'+d.beers.map(b=>esc(b.name)+' ('+b.qty+')').join(' · ')+'</p><p class="bad">Operazione reale nel database condiviso. Non importare nello stesso magazzino due volte. Il backup non verrà eliminato dal tuo dispositivo.</p>';
  confirmBox.classList.remove('hidden');confirmLabel.textContent='Per confermare, scrivi esattamente '+name;
  confirmInput.value='';runImportButton.disabled=true;importStatus.textContent='Controlla la destinazione prima di confermare.';
 }catch(err){importStatus.textContent='Importazione non disponibile: '+err.message}
};
confirmInput.oninput=()=>{runImportButton.disabled=!importPayload||confirmInput.value.trim()!==importPayload.target};
runImportButton.onclick=async()=>{
 if(!importPayload||confirmInput.value.trim()!==importPayload.target||warehouseId!==importPayload.target||user?.uid!==importPayload.uid)return;
 runImportButton.disabled=true;previewButton.disabled=true;importStatus.textContent='Importazione in corso: non chiudere questa pagina…';
 try{
  const data=importPayload,beerColl=collection(db,'magazzini',warehouseId,'birre'),moveColl=collection(db,'magazzini',warehouseId,'movimenti');
  // Una sola transazione: letture di controllo prima di tutte le scritture.
  await runTransaction(db,async tx=>{
   const refs=data.beers.map(b=>doc(beerColl,b.id));const txRefs=data.transactions.map(t=>doc(moveColl,t.id));
   const found=await Promise.all([...refs,...txRefs].map(r=>tx.get(r)));
   if(found.some(s=>s.exists()))throw Error('Almeno un ID è già presente nel database: importazione annullata per evitare doppioni.');
   data.beers.forEach((b,i)=>tx.set(refs[i],{name:b.name,lot:b.lot||'',date:b.date||'',qr:b.qr||'',qty:b.qty,createdMs:Date.now(),importedFrom:'backup-v2.1'}));
   data.transactions.forEach((t,i)=>tx.set(txRefs[i],{beerId:t.beerId,beerName:t.beerName||'',type:t.type,qty:t.qty,note:t.note||'',price:t.price??null,createdMs:Date.parse(t.date),dateOriginale:t.date,importedFrom:'backup-v2.1',operatorUid:user.uid}));
  });
  importStatus.textContent='Importazione completata ✓. Controlla quantità e storico, poi scarica un nuovo backup online.';
  importPayload=null;confirmBox.classList.add('hidden');toast('Backup importato nel magazzino '+warehouseId+' ✓');
 }catch(err){importStatus.textContent='Importazione non eseguita: '+err.message;runImportButton.disabled=false}finally{previewButton.disabled=false}
};
