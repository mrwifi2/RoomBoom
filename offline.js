/* ===== RoomBoom offline layer ====================================================
   - RBC: tiny localStorage cache (chat list, messages per chat, profiles, notifications)
   - outbox: text messages typed while offline are queued and sent when the net is back
   Loaded BEFORE the main script. Uses sb / me / msgs / draw / room etc. only at call time. */
const RBC=(function(){
 const K="rb_c_";
 function get(k){try{const v=localStorage.getItem(K+k);return v?JSON.parse(v):null}catch(e){return null}}
 function purge(){try{Object.keys(localStorage).filter(x=>x.startsWith(K+"msgs_")).forEach(x=>localStorage.removeItem(x))}catch(e){}}
 function set(k,v){
  try{localStorage.setItem(K+k,JSON.stringify(v));return true}
  catch(e){try{purge();localStorage.setItem(K+k,JSON.stringify(v));return true}catch(e2){return false}}
 }
 function del(k){try{localStorage.removeItem(K+k)}catch(e){}}
 function clearAll(){
  try{Object.keys(localStorage).filter(x=>x.startsWith(K)||x==="rb_outbox"||x==="rb_ann_seen"||x==="rb_pins"||x==="rb_mutes").forEach(x=>localStorage.removeItem(x))}catch(e){}
 }
 function outbox(){try{return JSON.parse(localStorage.getItem("rb_outbox"))||[]}catch(e){return []}}
 function saveOutbox(a){try{localStorage.setItem("rb_outbox",JSON.stringify(a))}catch(e){}}
 return {get,set,del,clearAll,outbox,saveOutbox};
})();

/* RBS: small local flags per chat (pinned / muted) */
const RBS={
 get(k){try{return new Set(JSON.parse(localStorage.getItem(k))||[])}catch(e){return new Set()}},
 save(k,s){try{localStorage.setItem(k,JSON.stringify([...s]))}catch(e){}},
 has(k,id){return RBS.get(k).has(id)}
};
window.__lpAt=0; /* time of the last long-press, so the tap that follows it is ignored */

/* is this error just "no internet"? */
function isNetErr(err){
 const m=((err&&err.message)||String(err||"")).toLowerCase();
 return !navigator.onLine||m.includes("fetch")||m.includes("network")||m.includes("failed to")||m.includes("load failed")||(err&&err.name==="TypeError");
}

/* ---------- messages cache (per chat, newest 60, text only is enough for reading offline) ---------- */
let _pmT=null;
function persistMsgs(){
 clearTimeout(_pmT);
 _pmT=setTimeout(()=>{
  if(!room)return;
  const arr=[...msgs.values()].filter(m=>!m._pending).sort((a,b)=>T(a.created_at)-T(b.created_at)).slice(-60);
  RBC.set("msgs_"+room,arr);
 },400);
}

/* ---------- outbox: queue text sent while offline ---------- */
function queuedBubble(it){
 return {id:it.tempId,room_id:it.row.room_id,sender_id:it.row.sender_id,body:it.row.body,created_at:it.at||new Date().toISOString(),
  reply_to:it.row.reply_to||null,_pending:true,_queued:true};
}
function queueText(row){
 const it={tempId:"q-"+crypto.randomUUID(),row,at:new Date().toISOString()};
 const q=RBC.outbox();q.push(it);RBC.saveOutbox(q);
 const b=queuedBubble(it);msgs.set(b.id,b);draw(b);
}
function queuedFor(roomId){return RBC.outbox().filter(i=>i.row.room_id===roomId).map(queuedBubble)}

let _flushing=false;
async function flushOutbox(){
 if(_flushing||!navigator.onLine||typeof me==="undefined"||!me)return;
 _flushing=true;
 try{
  let q=RBC.outbox();
  while(q.length){
   const it=q[0];
   const {data,error}=await sb.from("messages").insert(it.row).select().single();
   if(error){
    if(isNetErr(error))break;
    toast("queued message failed: "+error.message,"err");
   }else{
    if(msgs.has(it.tempId)){msgs.delete(it.tempId);const el=$("m-"+it.tempId);if(el)el.remove()}
    if(room===it.row.room_id){msgs.set(data.id,data);draw(data)}
   }
   q.shift();RBC.saveOutbox(q);
  }
 }finally{_flushing=false}
 if(typeof curView!=="undefined"&&curView==="rooms")loadRooms();
}
