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
 const add=(t,f)=>{const b=document.createElement("button");b.textContent=t;b.onclick=()=>{close();f()};s.appendChild(b)};
 add("💬 NEW DIRECT MESSAGE",async()=>{await openOps();$("modeDm").click()});
 add("👥 NEW GROUP",async()=>{await openOps();$("modeGrp").click()});
 if(me&&me.role==="admin")add("🛡 NEW OPERATIVE",()=>{go("admin");setTitle("> COMMAND");loadUsers()});
 add("✕ CANCEL",()=>{});
}
$("navAdd").onclick=openAddSheet;
$("navHome").onclick=()=>{
 if(typeof closeDrawer==="function")closeDrawer();
 closeNotifPanel();closeProfilePanel();
 if($("sheet"))$("sheet").style.display="none";
 viewStack=["rooms"];show("rooms");afterNav("rooms");
};
$("navProfile").onclick=()=>openProfilePanel();

/* ---------- notification centre (in-app only for now; announcements tab
   will be wired to Supabase + admin "make announcement" panel in phase 2) ---------- */
function openNotifPanel(){$("notifOverlay").classList.add("on");$("notifPanel").classList.add("on")}
function closeNotifPanel(){$("notifOverlay").classList.remove("on");$("notifPanel").classList.remove("on")}
$("notifBtn").onclick=openNotifPanel;
$("notifClose").onclick=closeNotifPanel;
$("notifOverlay").onclick=closeNotifPanel;
function switchNotifTab(tab){
 $("tabNotif").classList.toggle("active",tab==="notif");
 $("tabAnn").classList.toggle("active",tab==="ann");
 $("notifBody").innerHTML=tab==="notif"
  ?'<div class="panelEmpty">&gt; no notifications yet</div>'
  :'<div class="panelEmpty">&gt; no announcements yet<br><small style="opacity:.7">admin announcements will appear here</small></div>';
}
$("tabNotif").onclick=()=>switchNotifTab("notif");
$("tabAnn").onclick=()=>switchNotifTab("ann");

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
$("ppLogout").onclick=()=>$("out").click();

/* ---------- drag-to-dismiss (swipe gesture): drawer, sheet, side panels
   all follow the finger and either snap closed (past threshold) or snap
   back open — same feel as a native bottom-sheet / side-drawer. ---------- */
function dragToDismiss(panel,{axis,getOpen,onClose,threshold=80,handle}){
 const h=handle||panel;
 let sx=0,sy=0,dx=0,dy=0,active=false,armed=false;
 h.addEventListener("touchstart",e=>{
  if(!getOpen())return;
  sx=e.touches[0].clientX;sy=e.touches[0].clientY;dx=0;dy=0;active=true;armed=false;
 },{passive:true});
 h.addEventListener("touchmove",e=>{
  if(!active)return;
  dx=e.touches[0].clientX-sx;dy=e.touches[0].clientY-sy;
  if(!armed){
   if(axis==="x"&&dx<-10&&Math.abs(dx)>Math.abs(dy))armed=true;
   else if(axis==="y"&&dy>10&&Math.abs(dy)>Math.abs(dx))armed=true;
   else return;
  }
  panel.style.transition="none";
  panel.style.transform=axis==="x"?"translateX("+dx+"px)":"translateY("+dy+"px)";
 },{passive:true});
 h.addEventListener("touchend",()=>{
  if(!active)return;active=false;
  if(!armed)return;
  armed=false;
  const moved=axis==="x"?dx:dy;
  const closing=axis==="x"?moved<-threshold:moved>threshold;
  if(closing){
   panel.style.transition="transform .22s ease-out";
   panel.style.transform=axis==="x"?"translateX(-100%)":"translateY(100%)";
   setTimeout(()=>{onClose();panel.style.transition="";panel.style.transform=""},220);
  }else{
   panel.style.transition="transform .25s cubic-bezier(.2,.8,.3,1)";
   panel.style.transform=axis==="x"?"translateX(0)":"translateY(0)";
   setTimeout(()=>{panel.style.transition="";panel.style.transform=""},260);
  }
 });
}
dragToDismiss($("drawer"),{axis:"x",getOpen:()=>$("drawer").classList.contains("open"),onClose:closeDrawer,threshold:70});
dragToDismiss($("notifPanel"),{axis:"y",getOpen:()=>$("notifPanel").classList.contains("on"),onClose:closeNotifPanel,threshold:80,handle:$("notifPanel").querySelector(".panelHead")});
dragToDismiss($("profilePanel"),{axis:"y",getOpen:()=>$("profilePanel").classList.contains("on"),onClose:closeProfilePanel,threshold:80,handle:$("profilePanel").querySelector(".panelHead")});
dragToDismiss($("sheet"),{axis:"y",getOpen:()=>$("sheet").style.display==="flex",onClose:()=>{$("sheet").style.display="none"},threshold:70});

syncBnavActive();
