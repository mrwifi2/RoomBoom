/* ===== RoomBoom home screen: long-press multi-select + top action bar ===== (loaded with defer)
   - hold a chat -> selection mode; tap more chats to add / remove; actions live in a bar at the TOP
   - hold an operative -> starts group selection with that person
   uses main-script globals: $, RBC, RBS, RBI, sb, me, toast, modal, loadRooms, refreshRoomsLocal, selMembers, opsMode, paintOp */
(function(){
 const app=$("app"),list=$("rooms"),ops=$("ops");
 const buzz=n=>{try{navigator.vibrate&&navigator.vibrate(n)}catch(e){}};
 const sel=new Set();let active=false;

 /* ---------- UI shell ---------- */
 const bar=document.createElement("div");bar.id="selBar";
 bar.innerHTML='<button class="icon-btn" id="selX" aria-label="Cancel"></button><b id="selN"></b><span class="sp"></span>'+
  '<button class="icon-btn" id="selPin" aria-label="Pin"></button><button class="icon-btn" id="selRead" aria-label="Mark as read"></button>'+
  '<button class="icon-btn" id="selDel" aria-label="Delete"></button><button class="icon-btn" id="selMore" aria-label="More"></button>';
 app.appendChild(bar);
 const menu=document.createElement("div");menu.id="selMenu";app.appendChild(menu);
 const mscrim=document.createElement("div");mscrim.id="selMenuScrim";app.appendChild(mscrim);
 $("selX").innerHTML=RBI.svg("x");$("selPin").innerHTML=RBI.svg("pin");$("selRead").innerHTML=RBI.svg("checks");
 $("selDel").innerHTML=RBI.svg("trash");$("selMore").innerHTML=RBI.svg("more");

 const rowsData=()=>RBC.get("rooms")||[];
 const picked=()=>rowsData().filter(x=>sel.has(x.r.id));
 function closeMenu(){menu.classList.remove("on");mscrim.classList.remove("on")}

 /* ---------- state ---------- */
 function sync(){
  const have=new Set(rowsData().map(x=>x.r.id));
  [...sel].forEach(id=>{if(!have.has(id))sel.delete(id)});
  list.querySelectorAll(".item.row").forEach(d=>{
   if(!d.querySelector(".selck"))d.insertAdjacentHTML("beforeend",'<span class="selck">'+RBI.svg("check")+"</span>");
   d.classList.toggle("sel",sel.has(d.dataset.rid));
  });
  if(active&&!sel.size){exit();return}
  $("selN").textContent=sel.size+" selected";
  const p=picked();
  $("selPin").classList.toggle("on",p.length>0&&p.every(x=>x.pin));
 }
 function enter(id){active=true;app.classList.add("selmode");sel.add(id);sync()}
 function toggle(id){if(sel.has(id))sel.delete(id);else sel.add(id);sync()}
 function exit(silent){
  if(!active)return false;
  active=false;sel.clear();closeMenu();app.classList.remove("selmode");
  list.querySelectorAll(".item.row.sel").forEach(d=>d.classList.remove("sel"));
  return true;
 }
 window.homeSel={active:()=>active,toggle,sync,exit};

 /* ---------- actions ---------- */
 const ids=()=>[...sel];
 function pin(){
  const pins=RBS.get("rb_pins"),p=picked(),all=p.every(x=>x.pin);
  ids().forEach(id=>all?pins.delete(id):pins.add(id));RBS.save("rb_pins",pins);
  toast(all?"unpinned":"pinned to top");exit();refreshRoomsLocal();
 }
 function mute(){
  const mu=RBS.get("rb_mutes"),p=picked(),all=p.every(x=>x.mute);
  ids().forEach(id=>all?mu.delete(id):mu.add(id));RBS.save("rb_mutes",mu);
  toast(all?"unmuted":"muted - no pop-ups from these chats");exit();refreshRoomsLocal();
 }
 async function markRead(){
  const list_=ids();exit();
  const {error}=await sb.from("room_members").update({last_read_at:new Date().toISOString()}).in("room_id",list_).eq("user_id",me.id);
  if(error)toast(error.message,"err");else toast("marked as read");
  loadRooms();
 }
 async function del(){
  const p=picked(),allG=p.every(x=>x.r.type!=="dm"),n=p.length;
  const ok=await modal({title:"> "+(allG?"leave ":"delete ")+n+(n===1?" chat":" chats")+"? history is removed for you",okText:allG?"LEAVE":"DELETE"});
  if(!ok)return;
  const list_=ids();exit();
  const {error}=await sb.from("room_members").delete().in("room_id",list_).eq("user_id",me.id);
  if(error)toast(error.message,"err");else toast(n===1?"chat removed":n+" chats removed");
  loadRooms();
 }
 async function delAll(){
  const n=sel.size;
  const ok=await modal({title:"> delete "+n+(n===1?" group":" groups")+" for EVERYONE? cannot be undone",okText:"DELETE"});
  if(!ok)return;
  const list_=ids();exit();
  let bad=null;
  for(const id of list_){const {error}=await sb.rpc("delete_room",{rid:id});if(error)bad=error}
  if(bad)toast(bad.message,"err");else toast("deleted");
  loadRooms();
 }
 async function rename(){
  const id=ids()[0];
  const nn=await modal({title:"> new group name",placeholder:"name"});if(!nn)return;
  exit();
  const {error}=await sb.rpc("rename_room",{rid:id,new_name:nn});
  if(error)toast(error.message,"err");else toast("group renamed");
  loadRooms();
 }
 function selectAll(){rowsData().forEach(x=>sel.add(x.r.id));sync()}

 $("selX").onclick=()=>exit();
 $("selPin").onclick=pin;$("selRead").onclick=markRead;$("selDel").onclick=del;

 /* ---------- top dropdown ---------- */
 function openMenu(){
  const p=picked(),single=p.length===1,allG=p.length>0&&p.every(x=>x.r.type!=="dm");
  menu.innerHTML="";
  const add=(ic,t,f,danger)=>{
   const b=document.createElement("button");if(danger)b.className="danger";b.innerHTML=RBI.label(ic,t);
   b.onclick=()=>{closeMenu();f()};menu.appendChild(b);
  };
  const total=rowsData().length;
  if(sel.size<total)add("listcheck","Select all",selectAll);
  add("pin",p.every(x=>x.pin)?"Unpin":"Pin to top",pin);
  add("bellOff",p.every(x=>x.mute)?"Unmute":"Mute pop-ups",mute);
  add("checks","Mark as read",markRead);
  if(single&&allG)add("edit","Rename group",rename);
  add(allG?"logout":"trash",allG?"Leave group":"Delete chat",del,true);
  if(allG&&me.role==="admin")add("ban","Delete for everyone",delAll,true);
  menu.classList.add("on");mscrim.classList.add("on");
 }
 $("selMore").onclick=()=>menu.classList.contains("on")?closeMenu():openMenu();
 mscrim.onclick=closeMenu;

 /* ---------- long-press (delegated, so it survives list re-renders) ---------- */
 function onHold(host,selector,fire){
  let t=null,t2=null,sx=0,sy=0,el=null;
  const clear=()=>{clearTimeout(t);clearTimeout(t2);if(el)el.classList.remove("pressing");el=null};
  host.addEventListener("touchstart",e=>{
   clear();if(e.touches.length!==1)return;
   const c=e.target.closest&&e.target.closest(selector);if(!c)return;
   el=c;const p=e.touches[0];sx=p.clientX;sy=p.clientY;
   t2=setTimeout(()=>{if(el)el.classList.add("pressing")},110);
   t=setTimeout(()=>{if(!el)return;const c2=el;el.classList.remove("pressing");el=null;window.__lpAt=Date.now();buzz(14);fire(c2)},420);
  },{passive:true});
  host.addEventListener("touchmove",e=>{const p=e.touches[0];if(p&&(Math.abs(p.clientX-sx)>10||Math.abs(p.clientY-sy)>10))clear()},{passive:true});
  host.addEventListener("touchend",clear,{passive:true});host.addEventListener("touchcancel",clear,{passive:true});
  host.addEventListener("scroll",clear,{passive:true});
  host.addEventListener("contextmenu",e=>{if(e.target.closest(selector))e.preventDefault()});
 }
 onHold(list,".item.row",row=>{
  const id=row.dataset.rid;if(!id)return;
  if(active)toggle(id);else enter(id);
 });
 onHold(ops,".op",row=>{
  const uid=row.dataset.uid;if(!uid)return;
  if(opsMode==="dm"){selMembers.clear();$("modeGrp").click()}
  if(selMembers.has(uid))selMembers.delete(uid);else selMembers.add(uid);
  ops.querySelectorAll(".op").forEach(paintOp);
 });
})();
