let host;
function ensureHost(){
  if(host&&document.body.contains(host))return host;
  host=document.createElement("div");
  host.className="cp-toast-host";
  host.setAttribute("role","status");
  host.setAttribute("aria-live","polite");
  document.body.appendChild(host);
  return host;
}
export function toast(message,type="error"){
  const el=document.createElement("div");
  el.className="cp-toast cp-toast-"+type;
  const text=document.createElement("span");
  text.textContent=String(message||"");
  const close=document.createElement("button");
  close.type="button";
  close.setAttribute("aria-label","Fechar");
  close.textContent="×";
  let removing=false;
  const remove=()=>{if(removing)return;removing=true;el.classList.add("out");const reducedMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;setTimeout(()=>el.remove(),reducedMotion?0:180);};
  close.onclick=remove;
  el.append(text,close);
  ensureHost().appendChild(el);
  setTimeout(remove,type==="error"?6000:4000);
}
export function confirmDialog(message,{confirmText="Confirmar",cancelText="Cancelar",danger=false}={}){
  return new Promise(resolve=>{
    const back=document.createElement("div");
    back.className="cp-confirm-backdrop";
    const box=document.createElement("div");
    box.className="cp-confirm";
    box.setAttribute("role","alertdialog");
    box.setAttribute("aria-modal","true");
    const p=document.createElement("p");
    p.textContent=message;
    const actions=document.createElement("div");
    actions.className="cp-confirm-actions";
    const cancel=document.createElement("button");
    cancel.type="button";cancel.className="cp-btn";cancel.textContent=cancelText;
    const ok=document.createElement("button");
    ok.type="button";ok.className="cp-btn "+(danger?"cp-btn-danger":"cp-btn-primary");ok.textContent=confirmText;
    const onKey=e=>{if(e.key==="Escape")done(false);};
    let settled=false;
    const done=v=>{if(settled)return;settled=true;document.removeEventListener("keydown",onKey);back.classList.add("is-closing");box.classList.add("is-closing");resolve(v);const reducedMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;setTimeout(()=>back.remove(),reducedMotion?0:160);};
    cancel.onclick=()=>done(false);
    ok.onclick=()=>done(true);
    back.addEventListener("click",e=>{if(e.target===back)done(false);});
    document.addEventListener("keydown",onKey);
    actions.append(cancel,ok);
    box.append(p,actions);
    back.appendChild(box);
    document.body.appendChild(back);
    ok.focus();
  });
}
