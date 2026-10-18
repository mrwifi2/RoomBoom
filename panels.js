/* ===== RoomBoom panels (loaded with defer, last) =====
   Profile panel extras: status line (bio), activity stats, copy username, change password, hide last seen
   Sidebar tools:       starred messages, archived chats, terminal commands, storage & cache, about / debug
   Also: tap a DM title -> small profile card.
   Uses main-script globals: $, me, profiles, sb, RBC, RBS, RBI, toast, modal, withBusy, openRoom, jumpToMsg, refreshRoomsLocal ... */
(function(){
 const APP_VERSION="1.5";
 const jget=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}};
 const jset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
 const buzz=n=>{try{navigator.vibrate&&navigator.vibrate(n)}catch(e){}};
 async function copyText(t){
  try{await navigator.clipboard.writeText(t);return true}
  catch(e){try{const ta=document.createElement("textarea");ta.value=t;ta.style.cssText="position:fixed;opacity:0";document.body.appendChild(ta);ta.select();const ok=document.execCommand("copy");ta.remove();return ok}catch(e2){return false}}
 }
 const fmtB=b=>b<1024?b+" B":b<1048576?(b/1024).toFixed(1)+" KB":(b/1048576).toFixed(2)+" MB";
 const mk=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e};
 const saveMe=()=>{profiles[me.id]=me;try{localStorage.setItem("rb_me",JSON.stringify(me))}catch(e){}};
 const needSql=err=>/bio|hide_last_seen|column/i.test((err&&err.message)||"")?"run panels.sql in Supabase first":((err&&err.message)||"failed");

 /* remember the last few errors so "copy debug info" is useful */
 const errs=[];
 addEventListener("error",e=>{errs.push((e.message||"error")+" @"+(e.filename||"").split("/").pop()+":"+e.lineno);if(errs.length>5)errs.shift()});
 addEventListener("unhandledrejection",e=>{errs.push("promise: "+((e.reason&&e.reason.message)||e.reason));if(errs.length>5)errs.shift()});

 /* ============================================================ sub page (full screen, slides from the right) */
 const page=mk("div",null,'<div class="spHead"><button class="icon-btn" id="spBack" aria-label="Back"></button><h3 id="spTitle"></h3></div><div class="spBody" id="spBody"></div>');
 page.id="subPage";document.body.appendChild(page);
 $("spBack").innerHTML=RBI.svg("back");
 const card=mk("div",null,"");card.id="userCard";const cscrim=mk("div",null,"");cscrim.id="userScrim";
 document.body.appendChild(cscrim);document.body.appendChild(card);
 function closeCard(){if(!card.classList.contains("on"))return false;card.classList.remove("on");cscrim.classList.remove("on");return true}
 cscrim.onclick=closeCard;
 function closePage(){
  if(closeCard())return true;
  if(!page.classList.contains("on"))return false;
  page.classList.remove("on");return true;
 }
 $("spBack").onclick=closePage;
 let curFill=null,curTitle="";
 function openPage(title,fill){
  curFill=fill;curTitle=title;$("spTitle").textContent=title;
  const b=$("spBody");b.innerHTML="";b.scrollTop=0;fill(b);
  page.classList.add("on");
  if($("drawer").classList.contains("open"))closeDrawer();
 }
 const refill=()=>{if(curFill&&page.classList.contains("on")){const b=$("spBody"),y=b.scrollTop;b.innerHTML="";curFill(b);b.scrollTop=y}};
 window.subPage={open:openPage,close:closePage,isOpen:()=>page.classList.contains("on")||card.classList.contains("on")};
 /* swipe from the left edge to go back */
 (function(){
  let st=null;
  page.addEventListener("touchstart",e=>{const t=e.touches[0];st=t.clientX<26?{x:t.clientX,y:t.clientY,mode:0,dx:0}:null},{passive:true});
  page.addEventListener("touchmove",e=>{
   if(!st)return;const t=e.touches[0],dx=t.clientX-st.x,dy=t.clientY-st.y;
   if(st.mode===0){if(Math.abs(dx)<8&&Math.abs(dy)<8)return;if(dx>0&&Math.abs(dx)>Math.abs(dy)){st.mode=1;page.classList.add("drag")}else{st=null;return}}
   st.dx=Math.max(0,dx);page.style.transform="translateX("+st.dx+"px)";
  },{passive:true});
  const end=()=>{
   if(!st)return;const s=st;st=null;if(s.mode!==1)return;
   page.classList.remove("drag");
   if(s.dx>innerWidth*.33){page.style.transform="";closePage()}
   else{page.style.transition="transform .25s cubic-bezier(.22,.8,.3,1)";page.style.transform="";setTimeout(()=>page.style.transition="",260)}
  };
  page.addEventListener("touchend",end,{passive:true});page.addEventListener("touchcancel",end,{passive:true});
 })();

 /* ============================================================ starred messages (stored on this device) */
 const stars=()=>jget("rb_stars",[]);
 window.RBstars={
  has:id=>stars().some(s=>s.id===id),
  toggle(m){
   let a=stars();
   if(a.some(s=>s.id===m.id))a=a.filter(s=>s.id!==m.id);
   else a.unshift({id:m.id,room:m.room_id||room,roomName:($("title").textContent||"").replace(/^#\s*/,""),roomType:roomType,
    body:m.body||"",kind:m.media_type||"",sender:(profiles[m.sender_id]&&profiles[m.sender_id].callsign)||"?",at:m.created_at});
   jset("rb_stars",a.slice(0,300));
  }
 };
 function starsPage(b){
  const a=stars();
  if(!a.length){b.appendChild(mk("div","spEmpty","> nothing starred yet<br>hold any message in a chat and choose STAR MESSAGE"));return}
  a.forEach(s=>{
   const c=mk("div","spCard");
   c.innerHTML='<div class="who"></div><div class="tx"></div><div class="meta"></div><button class="x" aria-label="Remove star"></button>';
   c.querySelector(".who").textContent=s.sender;
   c.querySelector(".tx").textContent=s.kind==="image"?"[photo]":s.kind==="voice"?"[voice note]":s.body;
   c.querySelector(".meta").textContent=(s.roomType==="group"?"# ":"")+s.roomName+" · "+(typeof fmt==="function"?fmt(s.at):"");
   const x=c.querySelector(".x");x.innerHTML=RBI.svg("star");
   x.onclick=ev=>{ev.stopPropagation();jset("rb_stars",stars().filter(z=>z.id!==s.id));c.style.transition="opacity .2s,transform .2s";c.style.opacity="0";c.style.transform="scale(.96)";setTimeout(refill,200)};
   c.onclick=()=>{closePage();openRoom(s.room,s.roomName,s.roomType);setTimeout(()=>window.jumpToMsg&&jumpToMsg(s.id),1000)};
   b.appendChild(c);
  });
 }

 /* ============================================================ archived chats */
 function archPage(b){
  const rows=(RBC.get("rooms")||[]).filter(x=>x.arch);
  if(!rows.length){b.appendChild(mk("div","spEmpty","> no archived chats<br>select chats on the home screen and choose Archive"));return}
  rows.forEach(x=>{
   const r=mk("div","spRow",'<div class="mid"><b class="glow"></b><small class="pv"></small></div>');
   r.prepend(av(x.name,46));
   r.querySelector("b").textContent=(x.r.type==="dm"?"":"# ")+x.name;
   if(typeof pvInto==="function")pvInto(r.querySelector(".pv"),x.lm);
   const u=mk("button","spBtn","UNARCHIVE");
   u.onclick=ev=>{ev.stopPropagation();const ar=RBS.get("rb_arch");ar.delete(x.r.id);RBS.save("rb_arch",ar);refreshRoomsLocal();toast("moved back to chats");refill()};
   r.appendChild(u);
   r.onclick=()=>{closePage();openRoom(x.r.id,x.name,x.r.type)};
   b.appendChild(r);
  });
 }

 /* ============================================================ terminal commands + gestures cheat sheet */
 function cmdsPage(b){
  const c=(cmd,txt)=>{const d=mk("div","cmd","<code></code><p></p>");d.querySelector("code").textContent=cmd;d.querySelector("p").textContent=txt;b.appendChild(d)};
  b.appendChild(mk("div","spSec","> TYPE THESE IN ANY CHAT"));
  c("/boom 10","every message you send self-destructs 10 seconds after it is sent. any number of seconds works.");
  c("/boom off","turn the self-destruct timer off.");
  c("/theme green","change the colour theme. options: green, blue, red, amber.");
  c("/clear","clears the messages on your screen only. nothing is deleted for anyone.");
  b.appendChild(mk("div","spSec","> GESTURES"));
  c("hold a message","reactions, reply, copy, star, edit, delete.");
  c("swipe a message","reply. incoming: left to right, your own: right to left.");
  c("drag chat left","slide the timestamps in from the right edge.");
  c("hold a chat (home)","multi-select: pin, mute, mark read, archive, delete.");
  c("pull down (home)","refresh the chat list.");
  c("swipe right (home)","open this side menu.");
 }

 /* ============================================================ storage & cache */
 function sizes(){
  let msgs=0,other=0,n=0;
  try{Object.keys(localStorage).forEach(k=>{
   if(!k.startsWith("rb_c_"))return;const l=(localStorage.getItem(k)||"").length*2;
   if(k.startsWith("rb_c_msgs_")){msgs+=l;n++}else other+=l;
  })}catch(e){}
  return{msgs,other,n};
 }
 function storagePage(b){
  const s=sizes();
  const kv=(k,v)=>{const d=mk("div","kv","<span></span><span></span>");d.children[0].textContent=k;d.children[1].textContent=v;b.appendChild(d);return d};
  b.appendChild(mk("div","spSec","> SAVED ON THIS PHONE"));
  kv("saved messages",fmtB(s.msgs)+" · "+s.n+(s.n===1?" chat":" chats"));
  kv("chat list, people, notices",fmtB(s.other));
  kv("waiting to send",String(RBC.outbox().length));
  const media=kv("photos & voice notes you sent","...");
  sb.from("messages").select("id",{count:"exact",head:true}).eq("sender_id",me.id).not("media_path","is",null)
   .then(r=>{media.children[1].textContent=r.error?"offline":String(r.count||0)},()=>{media.children[1].textContent="offline"});
  b.appendChild(mk("div","spSec","> CLEAN UP"));
  const row=(ic,t,sub,fn)=>{const r=mk("button","ppRow",RBI.svg(ic)+'<span class="lb"></span><small></small>');r.querySelector(".lb").textContent=t;r.querySelector("small").textContent=sub;r.onclick=fn;b.appendChild(r)};
  row("trash","CLEAR SAVED MESSAGES",fmtB(s.msgs),async()=>{
   const ok=await modal({title:"> clear saved messages? they download again when you open a chat online",okText:"CLEAR"});if(!ok)return;
   Object.keys(localStorage).filter(k=>k.startsWith("rb_c_msgs_")).forEach(k=>localStorage.removeItem(k));toast("saved messages cleared");refill();
  });
  row("database","CLEAR ALL CACHE",fmtB(s.msgs+s.other),async()=>{
   const ok=await modal({title:"> clear all cached data? messages waiting to send are kept",okText:"CLEAR"});if(!ok)return;
   Object.keys(localStorage).filter(k=>k.startsWith("rb_c_")).forEach(k=>localStorage.removeItem(k));toast("cache cleared");refill();
  });
 }

 /* ============================================================ about / help / debug */
 function debugText(){
  const s=sizes();
  return["RoomBoom v"+APP_VERSION,"user: @"+me.username+" ("+(me.role||"user")+")","online: "+navigator.onLine,
   "view: "+curView,"cache: "+fmtB(s.msgs+s.other),"queued: "+RBC.outbox().length,"screen: "+innerWidth+"x"+innerHeight,
   "ua: "+navigator.userAgent,"errors: "+(errs.length?errs.join(" | "):"none")].join("\n");
 }
 function aboutPage(b){
  b.appendChild(mk("div","bigRB",'<b>RB</b><small>RoomBoom · v'+APP_VERSION+"</small>"));
  const kv=(k,v)=>{const d=mk("div","kv","<span></span><span></span>");d.children[0].textContent=k;d.children[1].textContent=v;b.appendChild(d);return d};
  kv("signed in as","@"+me.username);
  kv("role",me.role||"user");
  const conn=kv("connection",navigator.onLine?"online":"offline");
  b.appendChild(mk("div","spSec","> HELP"));
  const row=(ic,t,sub,fn)=>{const r=mk("button","ppRow",RBI.svg(ic)+'<span class="lb"></span><small></small>');r.querySelector(".lb").textContent=t;r.querySelector("small").textContent=sub;r.onclick=fn;b.appendChild(r);return r};
  const lt=row("pulse","LINK TEST","check the server",async()=>{
   const t0=performance.now();lt.querySelector("small").textContent="testing...";
   try{const r=await sb.from("profiles").select("id",{count:"exact",head:true});
    const ms=Math.round(performance.now()-t0);
    if(r.error)throw r.error;
    lt.querySelector("small").textContent=ms+" ms";conn.children[1].textContent="online";toast("link ok · "+ms+" ms");
   }catch(e){lt.querySelector("small").textContent="unreachable";conn.children[1].textContent="offline";toast("server not reachable","err")}
  });
  row("bug","REPORT A BUG","copies debug info",async()=>{
   const ok=await copyText(debugText());toast(ok?"debug info copied - paste it to the developer":"could not copy",ok?undefined:"err");
  });
 }

 /* ============================================================ drawer: TOOLS section */
 (function(){
  const dr=$("drawer"),anchor=$("drawerAdmin");
  dr.insertBefore(mk("div","dsec","&gt; TOOLS"),anchor);
  [["star","STARRED MESSAGES",starsPage],["archive","ARCHIVED CHATS",archPage],["terminal","TERMINAL COMMANDS",cmdsPage],
   ["database","STORAGE & CACHE",storagePage],["info","ABOUT & HELP",aboutPage]].forEach(([ic,t,fn])=>{
    const b=mk("button","dtool",RBI.label(ic,t));
    b.onclick=()=>openPage(t,fn);
    dr.insertBefore(b,anchor);
   });
 })();

 /* ============================================================ profile panel extras */
 const body=$("profilePanel").querySelector(".panelBody"),logout=$("ppLogout");
 const ex=mk("div",null,"");ex.id="ppExtra";body.insertBefore(ex,logout);
 const bioBtn=mk("button","ppBio",""),stats=mk("div","ppStats","");
 ex.appendChild(bioBtn);ex.appendChild(stats);
 const row=(ic,t,sub,fn)=>{const r=mk("button","ppRow",RBI.svg(ic)+'<span class="lb"></span><small></small>');r.querySelector(".lb").textContent=t;r.querySelector("small").textContent=sub||"";r.onclick=fn;ex.appendChild(r);return r};
 const rCopy=row("copy","COPY USERNAME","",async()=>{
  const ok=await copyText("@"+me.username);toast(ok?"copied @"+me.username:"could not copy",ok?undefined:"err");
 });
 row("key","CHANGE PASSKEY","",()=>pwDialog());
 const rSeen=row("eyeoff","HIDE LAST SEEN","",()=>setHide(!me.hide_last_seen));
 rSeen.appendChild(mk("span","sw",""));

 bioBtn.onclick=async()=>{
  const v=await modal({title:"> status line (max 70 characters)",placeholder:"what are you up to?",value:me.bio||"",okText:"SAVE"});
  if(v===null)return;
  const nv=String(v).trim().slice(0,70);
  const {error}=await sb.from("profiles").update({bio:nv}).eq("id",me.id);
  if(error){toast(needSql(error),"err");return}
  me.bio=nv;saveMe();paintBio();toast("status updated");
 };
 function paintBio(){
  bioBtn.classList.toggle("empty",!me.bio);
  bioBtn.innerHTML="<span></span>"+RBI.svg("edit");
  bioBtn.firstChild.textContent=me.bio||"add a status line";
 }
 async function setHide(val){
  rSeen.querySelector(".sw").classList.toggle("on",val);
  const {error}=await sb.from("profiles").update({hide_last_seen:val}).eq("id",me.id);
  if(error){rSeen.querySelector(".sw").classList.toggle("on",!!me.hide_last_seen);toast(needSql(error),"err");return}
  me.hide_last_seen=val;saveMe();
  rSeen.querySelector("small").textContent=val?"others can't see it":"";
  toast(val?"last seen hidden":"last seen visible");
 };

 /* activity stats: counted up like a terminal readout */
 let shown={tx:0,groups:0,links:0};
 function paintStats(s){
  const lines=[["tx","TRANSMISSIONS LOGGED"],["groups","GROUPS JOINED"],["links","ACTIVE LINKS"]];
  if(!stats.children.length)lines.forEach(([k,t])=>stats.appendChild(mk("div",null,"&gt; <b data-k='"+k+"'>0</b>"+t)));
  const t0=performance.now(),from={...shown};
  (function step(now){
   const p=Math.min(1,(now-t0)/600),e=1-Math.pow(1-p,3);
   lines.forEach(([k])=>{stats.querySelector("[data-k='"+k+"']").textContent=Math.round(from[k]+(s[k]-from[k])*e)});
   if(p<1)requestAnimationFrame(step);else shown={...s};
  })(t0);
 }
 async function loadStats(){
  const c=jget("rb_stats",null);if(c)paintStats(c);
  try{
   const [a,g,l]=await Promise.all([
    sb.from("messages").select("id",{count:"exact",head:true}).eq("sender_id",me.id),
    sb.from("room_members").select("room_id,rooms!inner(type)",{count:"exact",head:true}).eq("user_id",me.id).eq("rooms.type","group"),
    sb.from("room_members").select("room_id",{count:"exact",head:true}).eq("user_id",me.id)]);
   if(a.error&&l.error)return;
   const s={tx:a.count||0,groups:g.error?0:(g.count||0),links:l.count||0};
   jset("rb_stats",s);paintStats(s);
  }catch(e){}
 }
 const _refresh=window.refreshProfilePanel;
 window.refreshProfilePanel=function(){
  if(_refresh)_refresh();
  paintBio();
  rSeen.querySelector(".sw").classList.toggle("on",!!me.hide_last_seen);
  rSeen.querySelector("small").textContent=me.hide_last_seen?"others can't see it":"";
  rCopy.querySelector("small").textContent="@"+me.username;
  loadStats();
 };

 /* change password dialog (verifies the current one first) */
 function pwDialog(){
  const w=$("modalWrap"),b=$("modalBox");b.innerHTML="";
  b.appendChild(mk("div","mt","> change passkey"));
  const f=(ph)=>{const i=mk("input","pwf");i.type="password";i.placeholder=ph;i.autocomplete="off";b.appendChild(i);return i};
  const cur=f("current passkey"),nw=f("new passkey (min 6 characters)"),rep=f("repeat new passkey");
  const err=mk("div","perr","");b.appendChild(err);
  const rowEl=mk("div","mb","");const cancel=mk("button",null,"CANCEL"),ok=mk("button",null,"CHANGE");
  rowEl.appendChild(cancel);rowEl.appendChild(ok);b.appendChild(rowEl);
  const close=()=>{w.classList.remove("on");w.onclick=null};
  cancel.onclick=close;w.onclick=e=>{if(e.target===w)close()};
  ok.onclick=async()=>{
   err.textContent="";
   if(!cur.value){err.textContent="enter your current passkey";return}
   if(nw.value.length<6){err.textContent="new passkey must be at least 6 characters";return}
   if(nw.value!==rep.value){err.textContent="the two new passkeys don't match";return}
   if(nw.value===cur.value){err.textContent="new passkey is the same as the old one";return}
   ok.disabled=true;ok.innerHTML='<span class="spin"></span>';
   try{
    const u=await sb.auth.getUser();const email=u.data&&u.data.user&&u.data.user.email;
    if(!email)throw new Error("session expired - log in again");
    const chk=await sb.auth.signInWithPassword({email,password:cur.value});
    if(chk.error){err.textContent="current passkey is wrong";return}
    const up=await sb.auth.updateUser({password:nw.value});
    if(up.error){err.textContent=up.error.message;return}
    close();toast("passkey changed");
   }catch(e){err.textContent=(typeof isNetErr==="function"&&isNetErr(e))?"no internet":(e.message||"failed")}
   finally{ok.disabled=false;ok.textContent="CHANGE"}
  };
  w.classList.add("on");setTimeout(()=>cur.focus(),60);
 }

 /* ============================================================ tap a DM title -> profile card */
 window.openUserCard=function(uid){
  const p=profiles[uid];if(!p)return;
  card.innerHTML="";
  card.appendChild(av(p.callsign||p.username,64));
  card.appendChild(mk("b","glow","")).textContent=p.callsign||p.username;
  card.appendChild(mk("div","un","")).textContent="@"+p.username+(p.role==="admin"?" · ADMIN":"");
  if(p.bio)card.appendChild(mk("div","bio","")).textContent=p.bio;
  if(!p.hide_last_seen&&p.last_seen){
   const on=Date.now()-new Date(p.last_seen)<120000;
   card.appendChild(mk("div","ls","")).textContent=on?"online now":"last seen "+fmt(p.last_seen);
  }
  void card.offsetWidth;card.classList.add("on");cscrim.classList.add("on");
 };
})();
