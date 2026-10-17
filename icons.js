/* ===== RoomBoom icon system =====================================================
   One consistent set of thin line icons (24px grid, round caps) instead of emojis.
   Icons take the colour of the surrounding text (currentColor), so themes just work.
   Use in HTML:   <span data-ico="bell"></span>
   Use in JS:     RBI.svg("bell")  |  RBI.label("trash","DELETE")  |  RBI.btn("trash","DELETE",fn,{danger:true})
   Loaded BEFORE the main script so everything can use RBI. ==================== */
(function(){
 const P={
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  refresh:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  megaphone:'<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  home:'<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  chat:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
  user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  userplus:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  bomb:'<circle cx="11" cy="13" r="8"/><path d="m14.5 5.5 2-2a2.4 2.4 0 0 1 3.4 0l.6.6a2.4 2.4 0 0 1 0 3.4l-2 2"/><path d="m21 3-1 1"/>',
  clip:'<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  send:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  reply:'<path d="m9 14-5-5 5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  edit:'<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  ban:'<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  check:'<path d="m20 6-11 11-5-5"/>',
  checks:'<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  alert:'<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
  down:'<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  wifioff:'<path d="M2 2l20 20"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M10.7 5.1A15 15 0 0 1 22 8.8"/><path d="M5 12.9a10 10 0 0 1 5.2-2.7"/><path d="M13.9 10.4A10 10 0 0 1 19 12.9"/><path d="M12 20h.01"/>',
  dot:'<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'
 };
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 function svg(name,cls){
  return '<svg class="i'+(cls?" "+cls:"")+'" viewBox="0 0 24 24" aria-hidden="true">'+(P[name]||P.info)+'</svg>';
 }
 /* icon + text as an HTML string (text is escaped) */
 function label(name,text){return svg(name)+'<span class="lb">'+esc(text)+'</span>'}
 /* ready-made action-sheet row */
 function btn(name,text,fn,opts){
  const b=document.createElement("button");b.className="sbtn"+(opts&&opts.danger?" danger":"");
  b.innerHTML=label(name,text);if(fn)b.onclick=fn;return b;
 }
 /* fill every <span data-ico="name"></span> that has not been filled yet */
 function hydrate(root){
  (root||document).querySelectorAll("[data-ico]:not([data-ico-done])").forEach(e=>{
   e.innerHTML=svg(e.getAttribute("data-ico"),e.getAttribute("data-ico-cls")||"");
   e.setAttribute("data-ico-done","1");
  });
 }
 window.RBI={P,svg,label,btn,hydrate,esc};
 hydrate();
})();
