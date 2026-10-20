(() => {
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
  function show(message, title="HomeLink", kind="info") {
    let backdrop=document.getElementById("homeLinkMessagePopup");
    if(!backdrop){
      backdrop=document.createElement("div");backdrop.id="homeLinkMessagePopup";backdrop.className="app-modal-backdrop";
      backdrop.innerHTML='<div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="homeLinkPopupTitle"><div class="app-modal-icon" id="homeLinkPopupIcon"><i class="fa-solid fa-circle-info"></i></div><h2 id="homeLinkPopupTitle">HomeLink</h2><p id="homeLinkPopupMessage"></p><button type="button" class="btn-primary" id="homeLinkPopupOkay">Okay</button></div>';
      document.body.appendChild(backdrop);
      backdrop.querySelector("#homeLinkPopupOkay").addEventListener("click",()=>backdrop.classList.remove("open"));
      backdrop.addEventListener("click",e=>{if(e.target===backdrop)backdrop.classList.remove("open")});
      document.addEventListener("keydown",e=>{if(e.key==="Escape"&&backdrop.classList.contains("open"))backdrop.classList.remove("open")});
    }
    backdrop.querySelector("#homeLinkPopupTitle").textContent=title;
    backdrop.querySelector("#homeLinkPopupMessage").textContent=String(message??"");
    const icon=backdrop.querySelector("#homeLinkPopupIcon");
    icon.className="app-modal-icon"+(kind==="error"?" warning":"");
    icon.innerHTML=kind==="error"?'<i class="fa-solid fa-circle-exclamation"></i>':kind==="success"?'<i class="fa-solid fa-circle-check"></i>':'<i class="fa-solid fa-circle-info"></i>';
    backdrop.classList.add("open");
    backdrop.querySelector("#homeLinkPopupOkay").focus();
  }
  window.showHomeLinkPopup=show;
  window.alert=function(message){show(message,"Please check","error")};
})();