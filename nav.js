/* ===== RoomBoom — Phase 1 UI overhaul (bottom nav / notification centre /
   profile panel / ripple feedback / tap-anywhere-dismiss) =====
   Loaded with `defer` AFTER the main inline script, so it can freely use
   $, go, show, openOps, modal, toast, withBusy, av, me, profiles,
   viewStack, curView, setTitle, loadUsers — all already defined. Kept in
   its own file so future additions stay separate and easy to edit. */

/* ---------- ripple / water-touch feedback on every icon button ---------- */
document.addEventListener("pointerdown",e=>{
 const el=e.target.closest(".icon-btn,#bnav button");
 if(!el)return;
 const r=document.createElement("span");r.className="rb-ripple";
 const rect=el.getBoundingClientRect();
 const size=Math.max(rect.width,rect.height);
 r.style.width=r.style.height=size+"px";
 r.style.left=(e.clientX-rect.left-size/2)+"px";
 r.style.top=(e.clientY-rect.top-size/2)+"px";
 el.appendChild(r);
 setTimeout(()=>r.remove(),520);
},{passive:true});

/* ---------- #sheet backdrop: tap anywhere outside to dismiss ---------- */
(function(){
 const sheet=$("sheet"),ov=$("sheetOverlay");
 if(!sheet||!ov)return;
 function sync(){ov.classList.toggle("on",sheet.style.display==="flex")}
 new MutationObserver(sync).observe(sheet,{attributes:true,attributeFilter:["style"]});
 ov.onclick=()=>{sheet.style.display="none"};
 sync();
})();

/* ---------- bottom nav ---------- */
function syncBnavActive(){
 const profOpen=$("profilePanel").classList.contains("on");
 $("navProfile").classList.toggle("active",profOpen);
 $("navHome").classList.toggle("active",!profOpen&&$("v-rooms").classList.contains("on"));
}
new MutationObserver(syncBnavActive).observe($("v-rooms"),{attributes:true,attributeFilter:["class"]});

function openAddSheet(){
 const s=$("sheet");s.innerHTML="";s.style.display="flex";
 const close=()=>s.style.display="none";
 const add=(ic,t,f)=>{s.appendChild(RBI.btn(ic,t,()=>{close();f()}))};
 add("chat","NEW DIRECT MESSAGE",async()=>{await openOps();$("modeDm").click()});
 add("users","NEW GROUP",async()=>{await openOps();$("modeGrp").click()});
 if(me&&me.role==="admin")add("userplus","NEW OPERATIVE",()=>{go("admin");setTitle("> COMMAND");loadUsers()});
 add("x","CANCEL",()=>{});
}
$("navAdd").onclick=openAddSheet;
$("navHome").onclick=()=>{
 if(typeof closeDrawer==="function")closeDrawer();
 closeNotifPanel();closeProfilePanel();
 if($("sheet"))$("sheet").style.display="none";
 if(curView==="rooms"){const l=$("rooms");if(l)l.scrollTo({top:0,behavior:"smooth"});return}
 viewStack=["rooms"];show("rooms");afterNav("rooms");
};
$("navProfile").onclick=()=>openProfilePanel();

/* ---------- notification centre: notifications + announcements
   (both real, wired to Supabase "notifications" / "announcements" tables) ---------- */
let annList=[];
let notifList=[];
function annTime(iso){return typeof fmt==="function"?fmt(iso):new Date(iso).toLocaleString()}
/* open any URL in the phone's default browser (Capacitor App.openUrl -> Android ACTION_VIEW) */
function normUrl(u){u=(u||"").trim();if(!u)return "";return /^[a-z][a-z0-9+.-]*:/i.test(u)?u:"https://"+u}
function openExternal(url){
 url=normUrl(url);if(!url)return;
 const AP=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.App;
 if(AP&&AP.openUrl){AP.openUrl({url}).catch(()=>window.open(url,"_system"));return}
 window.open(url,"_blank");
}
function annFileUrl(path){return sb.storage.from("announcements").getPublicUrl(path).data.publicUrl}
function renderAnnCard(a){
 const d=document.createElement("div");d.className="annCard";
 const at=document.createElement("span");at.className="at";at.textContent=annTime(a.created_at);
 const ttl=document.createElement("span");ttl.className="ttl";ttl.innerHTML=RBI.svg("megaphone")+"<span></span>";ttl.lastChild.textContent=a.title||"announcement";
 const bd=document.createElement("div");bd.className="bd";bd.textContent=a.body||"";
 d.appendChild(at);d.appendChild(ttl);d.appendChild(bd);
 if(a.link){
  const link=document.createElement("a");link.href="#";link.innerHTML=RBI.svg("link")+"<span></span>";link.lastChild.textContent=a.link;
  link.onclick=e=>{e.preventDefault();openExternal(a.link)};
  d.appendChild(link);
 }
 if(a.file_path){
  const fl=document.createElement("a");fl.className="fileLink";fl.href="#";fl.innerHTML=RBI.svg("download")+"<span></span>";fl.lastChild.textContent=a.file_name||"download file";
  fl.onclick=e=>{e.preventDefault();openExternal(annFileUrl(a.file_path))};
  d.appendChild(fl);
 }
 return d;
}
/* repaint a list only when its content really changed (no flash on cache -> network refresh) */
function paintList(body,list,render,kind){
 const sig=kind+":"+list.map(x=>x.id).join(",");
 if(body.dataset.sig===sig&&body.children.length)return;
 body.dataset.sig=sig;body.innerHTML="";list.forEach(x=>body.appendChild(render(x)));
}
async function loadAnnouncements(){
 const body=$("notifBody");
 const cached=RBC.get("ann");
 if(cached&&cached.length){annList=cached;paintList(body,annList,renderAnnCard,"a")}
 else{body.dataset.sig="";body.innerHTML='<div class="panelEmpty">&gt; loading...</div>'}
 const {data,error}=await sb.from("announcements").select("*").order("created_at",{ascending:false}).limit(50);
 if(error&&cached&&cached.length)return;
 if(error){body.dataset.sig="";body.innerHTML='<div class="panelEmpty">&gt; failed to load announcements<br><small style="opacity:.7">'+error.message+'</small></div>';return}
 annList=data||[];RBC.set("ann",annList);
 if(!annList.length){body.dataset.sig="";body.innerHTML='<div class="panelEmpty">&gt; no announcements yet<br><small style="opacity:.7">admin announcements will appear here</small></div>'}
 else paintList(body,annList,renderAnnCard,"a");
 try{if(annList.length)localStorage.setItem("rb_ann_seen",annList[0].created_at)}catch(e){}
 checkBellDot();
}
function subscribeAnnouncements(){
 sb.channel("ann").on("postgres_changes",{event:"INSERT",schema:"public",table:"announcements"},p=>{
  toast("new announcement: "+(p.new.title||""));
  $("notifDot").style.display="";
  if($("notifPanel").classList.contains("on")&&$("tabAnn").classList.contains("active")){
   annList.unshift(p.new);$("notifBody").prepend(renderAnnCard(p.new));$("notifBody").dataset.sig="a:"+annList.map(x=>x.id).join(",");
  }
 }).subscribe();
}

/* ---------- personal notifications (new message / group add / admin action)
   wired to Supabase "notifications" table — phase 2b ---------- */
function notifIcon(t){return t==="message"?"chat":t==="group_add"?"users":"shield"}
function renderNotifCard(n){
 const d=document.createElement("div");d.className="annCard notifCard"+(n.read_at?"":" unread");
 const at=document.createElement("span");at.className="at";at.textContent=annTime(n.created_at);
 const ttl=document.createElement("span");ttl.className="ttl";ttl.innerHTML=RBI.svg(notifIcon(n.type))+"<span></span>";ttl.lastChild.textContent=n.title||"";
 d.appendChild(at);d.appendChild(ttl);
 if(n.body){const bd=document.createElement("div");bd.className="bd";bd.textContent=n.body;d.appendChild(bd)}
 if((n.type==="message"||n.type==="group_add")&&n.room_id){
  d.style.cursor="pointer";
  d.onclick=()=>{closeNotifPanel();openRoomById(n.room_id)};
 }
 return d;
}
async function loadNotifications(){
 const body=$("notifBody");
 const cached=RBC.get("notifs");
 if(cached&&cached.length){notifList=cached;paintList(body,notifList,renderNotifCard,"n")}
 else{body.dataset.sig="";body.innerHTML='<div class="panelEmpty">&gt; loading...</div>'}
 const {data,error}=await sb.from("notifications").select("*").eq("user_id",me.id).order("created_at",{ascending:false}).limit(50);
 if(error&&cached&&cached.length)return;
 if(error){body.dataset.sig="";body.innerHTML='<div class="panelEmpty">&gt; failed to load notifications<br><small style="opacity:.7">'+error.message+'</small></div>';return}
 notifList=data||[];
 if(!notifList.length){body.dataset.sig="";body.innerHTML='<div class="panelEmpty">&gt; no notifications yet<br><small style="opacity:.7">new messages, group adds &amp; account updates will appear here</small></div>'}
 else paintList(body,notifList,renderNotifCard,"n")
 const unreadIds=notifList.filter(n=>!n.read_at).map(n=>n.id);
 if(unreadIds.length){
  try{await sb.from("notifications").update({read_at:new Date().toISOString()}).in("id",unreadIds).eq("user_id",me.id)}catch(e){}
  notifList.forEach(n=>{if(!n.read_at)n.read_at=new Date().toISOString()});
 }
 RBC.set("notifs",notifList);
 checkBellDot();
}
async function openRoomById(roomId){
 if(!roomId)return;
 try{
  const {data:r,error}=await sb.from("rooms").select("*").eq("id",roomId).single();
  if(error||!r){toast("chat not found","err");return}
  let name=r.name||"room";
  if(r.type==="dm"){
   const {data:mm}=await sb.from("room_members").select("user_id").eq("room_id",roomId);
   const otherM=(mm||[]).find(x=>x.user_id!==me.id);
   if(otherM){
    if(typeof fetchProfiles==="function")await fetchProfiles();
    name=(profiles[otherM.user_id]&&(profiles[otherM.user_id].callsign||profiles[otherM.user_id].username))||"?";
   }
  }
  openRoom(r.id,name,r.type);
 }catch(e){toast("could not open chat","err")}
}
function subscribeNotifications(){
 sb.channel("notif_"+me.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"user_id=eq."+me.id},p=>{
  toast(p.new.title||"new notification");
  $("notifDot").style.display="";
  if($("notifPanel").classList.contains("on")&&$("tabNotif").classList.contains("active")){
   notifList.unshift(p.new);$("notifBody").prepend(renderNotifCard(p.new));$("notifBody").dataset.sig="n:"+notifList.map(x=>x.id).join(",");
   sb.from("notifications").update({read_at:new Date().toISOString()}).eq("id",p.new.id).then(()=>{});
  }
 }).subscribe();
}

/* ---------- combined bell-dot: lit if an unseen announcement OR any unread notification ---------- */
async function checkBellDot(){
 let show=false;
 try{
  const {data}=await sb.from("announcements").select("created_at").order("created_at",{ascending:false}).limit(1);
  const latest=data&&data[0];
  let seen=null;try{seen=localStorage.getItem("rb_ann_seen")}catch(e){}
  if(latest&&(!seen||new Date(latest.created_at)>new Date(seen)))show=true;
 }catch(e){}
 if(!show){
  try{
   const {count}=await sb.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",me.id).is("read_at",null);
   if(count>0)show=true;
  }catch(e){}
 }
 $("notifDot").style.display=show?"":"none";
}

(function(){
 let inited=false;
 function tryInit(){
  if(inited||$("app").style.display!=="flex")return;
  inited=true;checkBellDot();subscribeAnnouncements();subscribeNotifications();
 }
 new MutationObserver(tryInit).observe($("app"),{attributes:true,attributeFilter:["style"]});
 tryInit();
})();

function openNotifPanel(){
 $("notifOverlay").classList.add("on");$("notifPanel").classList.add("on");
 switchNotifTab($("tabAnn").classList.contains("active")?"ann":"notif");
}
function closeNotifPanel(){$("notifOverlay").classList.remove("on");$("notifPanel").classList.remove("on")}
$("notifBtn").onclick=openNotifPanel;
$("notifClose").onclick=closeNotifPanel;
$("notifOverlay").onclick=closeNotifPanel;
function switchNotifTab(tab){
 $("tabNotif").classList.toggle("active",tab==="notif");
 $("tabAnn").classList.toggle("active",tab==="ann");
 if(tab==="notif")loadNotifications();
 else loadAnnouncements();
}
$("tabNotif").onclick=()=>switchNotifTab("notif");
$("tabAnn").onclick=()=>switchNotifTab("ann");

/* ---------- make announcement (admin only) ---------- */
let annFile=null;
function openAnnouncePanel(){
 $("annTitle").value="";$("annBody").value="";$("annLink").value="";$("annErr").textContent="";
 annFile=null;$("annFileName").style.display="none";$("annFileName").textContent="";
 $("announceOverlay").classList.add("on");$("announcePanel").classList.add("on");
}
function closeAnnouncePanel(){$("announceOverlay").classList.remove("on");$("announcePanel").classList.remove("on")}
$("drawerAnnounce").onclick=()=>{closeDrawer();openAnnouncePanel()};
$("announceClose").onclick=closeAnnouncePanel;
$("announceOverlay").onclick=closeAnnouncePanel;
$("annFileBtn").onclick=()=>$("annFileIn").click();
$("annFileIn").onchange=e=>{
 const f=e.target.files[0];e.target.value="";if(!f)return;
 annFile=f;$("annFileName").innerHTML=RBI.svg("clip")+"<span></span>";$("annFileName").lastChild.textContent=f.name+" ("+Math.round(f.size/1024)+" KB)";$("annFileName").style.display="flex";
};
$("annSend").onclick=()=>withBusy($("annSend"),async()=>{
 const title=$("annTitle").value.trim(),body=$("annBody").value.trim(),link=$("annLink").value.trim();
 if(!title&&!body){$("annErr").style.color="var(--r)";$("annErr").textContent="> title ya message likho";return}
 $("annErr").textContent="";
 try{
  let file_path=null,file_name=null;
  if(annFile){
   const safe=annFile.name.replace(/[^A-Za-z0-9._-]+/g,"_");
   const path=crypto.randomUUID()+"/"+safe;
   const {error:upErr}=await sb.storage.from("announcements").upload(path,annFile,{contentType:annFile.type||"application/octet-stream"});
   if(upErr)throw upErr;
   file_path=path;file_name=annFile.name;
  }
  const {error}=await sb.from("announcements").insert({created_by:me.id,title:title||"announcement",body:body||null,link:normUrl(link)||null,file_path,file_name});
  if(error)throw error;
  toast("announcement sent");closeAnnouncePanel();
  if($("notifPanel").classList.contains("on")&&$("tabAnn").classList.contains("active"))loadAnnouncements();
 }catch(err){$("annErr").style.color="var(--r)";$("annErr").textContent="> "+(err.message||err)}
});

/* ---------- profile panel ---------- */
function refreshProfilePanel(){
 if(!me)return;
 const box=$("ppAvBox");box.innerHTML="";
 if(typeof av==="function")box.appendChild(av(me.callsign||me.username,56));
 $("ppName").textContent=me.callsign||me.username;
 $("ppUser").textContent="@"+me.username+(me.role==="admin"?" · ADMIN":"");
}
function openProfilePanel(){refreshProfilePanel();$("profileOverlay").classList.add("on");$("profilePanel").classList.add("on");syncBnavActive()}
function closeProfilePanel(){$("profileOverlay").classList.remove("on");$("profilePanel").classList.remove("on");syncBnavActive()}
$("profileClose").onclick=closeProfilePanel;
$("profileOverlay").onclick=closeProfilePanel;
$("ppLogout").onclick=()=>logoutFlow($("ppLogout"));

syncBnavActive();
