import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, X, UserRound, MoreHorizontal, Download } from "lucide-react";
import { supabase } from "../lib/supabase";
import { money } from "../lib/formatters";
import { downloadCsv } from "../lib/export";
import { Button, Input, Empty, PageTitle } from "../components/AppPrimitives";
import { toast, confirmDialog } from "../ui";

export function Customers({companyId}){
  const [rows,setRows]=useState([]);
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState("recent");
  const [clientMenu,setClientMenu]=useState(null);
  const [clientMenuPosition,setClientMenuPosition]=useState(null);
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState({name:"",phone:"",email:"",notes:""});
  const [deleting,setDeleting]=useState(false);
  const [saving,setSaving]=useState(false);
  const [editingCustomer,setEditingCustomer]=useState(null);
  const [editingForm,setEditingForm]=useState({name:"",phone:"",email:"",notes:""});
  const [editingSaving,setEditingSaving]=useState(false);
  const [editingError,setEditingError]=useState("");
  const [customerView,setCustomerView]=useState(null);
  const [history,setHistory]=useState({charges:[],payments:[],loading:false});

  async function load(){
    if(!companyId)return;
    const {data,error}=await supabase.from("customers").select("*").eq("company_id",companyId).order("created_at",{ascending:false});
    if(error){console.error(error);toast("Não foi possível carregar os clientes.");return;}
    setRows(data||[]);
  }
  useEffect(()=>{load()},[companyId]);

  function closeClientMenu(){setClientMenu(null);setClientMenuPosition(null);}
  function getClientMenuPosition(button){
    const rect=button.getBoundingClientRect();
    const width=190,height=178,gap=6;
    let left=rect.right-width,top=rect.bottom+gap;
    if(left<10)left=10;
    if(left+width>window.innerWidth-10)left=Math.max(10,window.innerWidth-width-10);
    if(top+height>window.innerHeight-10)top=Math.max(10,rect.top-height-gap);
    return {top,left};
  }
  function toggleClientMenu(c,e){
    e.preventDefault();e.stopPropagation();
    if(clientMenu?.id===c.id){closeClientMenu();return;}
    setClientMenu(c);setClientMenuPosition(getClientMenuPosition(e.currentTarget));
  }
  useEffect(()=>{
    if(!clientMenu)return;
    function reposition(){
      const button=document.querySelector('[data-client-menu-trigger="'+clientMenu.id+'"]');
      if(button)setClientMenuPosition(getClientMenuPosition(button));
    }
    function handlePointerDown(e){
      if(e.target.closest?.('[data-client-menu-trigger]')||e.target.closest?.('[data-client-menu-modern]'))return;
      closeClientMenu();
    }
    window.addEventListener("resize",reposition);
    window.addEventListener("scroll",reposition,true);
    document.addEventListener("pointerdown",handlePointerDown);
    return()=>{window.removeEventListener("resize",reposition);window.removeEventListener("scroll",reposition,true);document.removeEventListener("pointerdown",handlePointerDown)};
  },[clientMenu]);

  async function openCustomer(c){
    setCustomerView(c);setHistory({charges:[],payments:[],loading:true});
    const [{data:charges,error:chargeError},{data:payments,error:paymentError}]=await Promise.all([
      supabase.from("charges").select("id,description,amount,due_date,status,payment_method").eq("company_id",companyId).eq("customer_id",c.id).order("due_date",{ascending:false}),
      supabase.from("payments").select("id,amount,paid_at,payment_method,charge_id").eq("company_id",companyId).eq("customer_id",c.id).order("paid_at",{ascending:false})
    ]);
    if(chargeError||paymentError)toast("Não foi possível carregar o histórico completo.");
    setHistory({charges:charges||[],payments:payments||[],loading:false});
  }
  function openCustomerEditor(c){
    setCustomerView(null);setEditingError("");setEditingCustomer(c);
    setEditingForm({name:c.name||"",phone:c.phone||"",email:c.email||"",notes:c.notes||""});
  }
  async function saveCustomerEdit(e){
    e.preventDefault();setEditingError("");
    if(!editingForm.name.trim()){setEditingError("Informe o nome do cliente.");return;}
    setEditingSaving(true);
    const {error}=await supabase.from("customers").update({
      name:editingForm.name.trim(),phone:editingForm.phone.trim(),email:editingForm.email.trim(),notes:editingForm.notes.trim()
    }).eq("id",editingCustomer.id).eq("company_id",companyId);
    if(error)setEditingError(error.message);
    else{
      const updated={...editingCustomer,...editingForm,name:editingForm.name.trim(),phone:editingForm.phone.trim(),email:editingForm.email.trim(),notes:editingForm.notes.trim()};
      setRows(prev=>prev.map(c=>c.id===updated.id?updated:c));setEditingCustomer(null);
    }
    setEditingSaving(false);
  }
  async function save(e){
    e.preventDefault();
    if(saving)return;
    if(!companyId){
      toast("Sua empresa ainda está carregando. Tente novamente em instantes.");
      return;
    }
    const name=form.name.trim();
    if(!name){
      toast("Informe o nome do cliente.");
      return;
    }

    setSaving(true);
    try{
      const {data:userData,error:userError}=await supabase.auth.getUser();
      if(userError)throw userError;
      if(!userData?.user?.id){
        toast("Sua sessão expirou. Entre novamente.");
        return;
      }

      // O banco aplica o limite do plano no trigger, evitando divergência
      // entre a contagem do navegador e o limite real da empresa.
      const {error}=await supabase.from("customers").insert({
        name,
        phone:form.phone.trim()||null,
        email:form.email.trim()||null,
        notes:form.notes.trim()||null,
        company_id:companyId
      });

      if(error){
        const message=String(error.message||"");
        if(message.includes("plan_customer_limit")){
          toast("Você atingiu o limite de clientes do seu plano. Consulte os planos para continuar.");
        }else if(message.includes("subscription_inactive")){
          toast("Seu acesso está inativo. Confira o status da sua assinatura.");
        }else if(message.includes("company_access_denied")){
          toast("Não foi possível validar a empresa. Atualize a página e tente novamente.");
        }else{
          console.error("CobrançaPro: erro ao criar cliente:",error);
          toast("Não foi possível criar o cliente. "+(message||"Tente novamente."));
        }
        return;
      }

      setForm({name:"",phone:"",email:"",notes:""});
      setOpen(false);
      await load();
      toast("Cliente criado.","success");
    }catch(error){
      console.error("CobrançaPro: falha ao criar cliente:",error);
      toast("Falha ao criar cliente. Verifique sua conexão e tente novamente.");
    }finally{
      setSaving(false);
    }
  }
  async function removeCustomer(c){
    if(!(await confirmDialog('Excluir o cliente "'+c.name+'"? As cobranças e recebimentos vinculados também serão excluídos. Essa ação não pode ser desfeita.',{confirmText:"Excluir",danger:true})))return;
    setDeleting(true);
    const {error:paymentsError}=await supabase.from("payments").delete().eq("customer_id",c.id).eq("company_id",companyId);
    if(paymentsError){toast(paymentsError.message);setDeleting(false);return;}
    const {error:chargesError}=await supabase.from("charges").delete().eq("customer_id",c.id).eq("company_id",companyId);
    if(chargesError){toast(chargesError.message);setDeleting(false);return;}
    const {error}=await supabase.from("customers").delete().eq("id",c.id).eq("company_id",companyId);
    if(error)toast(error.message);else{load();toast("Cliente excluído.","success");}
    setDeleting(false);
  }
  function whatsapp(c){
    const phone=(c.phone||"").replace(/\D/g,"");
    const message="Oi! Tudo bem, "+c.name+"? Passando para falar com você.";
    window.open(phone?"https://wa.me/"+phone+"?text="+encodeURIComponent(message):"https://wa.me/?text="+encodeURIComponent(message),"_blank","noopener,noreferrer");
  }

  const filtered=useMemo(()=>rows
    .filter(x=>(x.name+" "+(x.phone||"")+" "+(x.email||"")).toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>{
      if(sort==="name-asc")return String(a.name).localeCompare(String(b.name),"pt-BR");
      if(sort==="name-desc")return String(b.name).localeCompare(String(a.name),"pt-BR");
      return new Date(b.created_at)-new Date(a.created_at);
    }),[rows,search,sort]);

  function exportCustomers(){
    downloadCsv("cobrancapro-clientes.csv",[
      {label:"Nome",value:r=>r.name},{label:"Telefone",value:r=>r.phone||""},{label:"E-mail",value:r=>r.email||""},
      {label:"Observações",value:r=>r.notes||""},{label:"Criado em",value:r=>new Date(r.created_at).toLocaleDateString("pt-BR")}
    ],filtered);
    toast("Planilha exportada.","success");
  }

  return <div className="modern-page modern-customers-page">
    <PageTitle title="Clientes" subtitle="Organize seus clientes e acompanhe o histórico." action={<Button onClick={()=>setOpen(true)}><Plus size={17}/> Novo cliente</Button>}/>
    <div className="modern-toolbar">
      <div className="searchbox modern-search"><Search size={17}/><input placeholder="Buscar por nome, telefone ou e-mail" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="modern-toolbar-actions">
        <label className="modern-select"><span>Ordenar</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Mais recentes</option><option value="name-asc">Nome A–Z</option><option value="name-desc">Nome Z–A</option></select></label>
        <Button variant="secondary" onClick={exportCustomers} disabled={!filtered.length}><Download size={16}/> Exportar</Button>
      </div>
    </div>
    <div className="modern-list-meta"><span>{filtered.length} {filtered.length===1?"cliente":"clientes"}</span>{search&&<span>Busca: “{search}”</span>}</div>
    <div className="panel modern-table-panel">
      {filtered.length===0?<Empty text={search?"Nenhum cliente corresponde à busca.":"Você ainda não possui clientes."}/>:<div className="modern-table-wrap"><table className="modern-table">
        <thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Criado em</th><th></th></tr></thead>
        <tbody>{filtered.map(c=><tr key={c.id} onClick={()=>openCustomer(c)}>
          <td><div className="modern-person"><span className="modern-avatar">{(c.name||"C").slice(0,1).toUpperCase()}</span><div><b>{c.name}</b><small>{c.notes||"Cliente cadastrado"}</small></div></div></td>
          <td>{c.phone||"—"}</td><td>{c.email||"—"}</td><td>{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
          <td className="modern-actions-cell" onClick={e=>e.stopPropagation()}><button type="button" className="modern-actions-trigger" data-client-menu-trigger={c.id} aria-label={"Ações de "+c.name} onClick={e=>toggleClientMenu(c,e)} style={{border:"0",background:"transparent",boxShadow:"none",outline:"none",padding:0}}><MoreHorizontal size={19}/></button></td>
        </tr>)}</tbody>
      </table></div>}
    </div>

    {open&&<div className="modal-backdrop"><form className="modal modern-modal" onSubmit={save}>
      <button type="button" className="modal-x" onClick={()=>setOpen(false)}><X/></button>
      <div className="modal-head"><div className="icon-box"><UserRound/></div><div><h2>Novo cliente</h2><p>Cadastre os dados básicos.</p></div></div>
      <Input label="Nome" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/>
      <Input label="Telefone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
      <Input label="E-mail" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
      <label className="field"><span>Observações</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving?"Criando...":"Criar cliente"}</Button></div>
    </form></div>}

    {editingCustomer&&createPortal(<div className="client-modal-root" role="dialog" aria-modal="true">
      <form className="client-modal-card modern-modal" onSubmit={saveCustomerEdit}>
        <button type="button" className="client-modal-close" onClick={()=>setEditingCustomer(null)} aria-label="Fechar"><X size={18}/></button>
        <div className="client-modal-head"><div className="client-modal-icon"><UserRound size={19}/></div><div><h2>Editar cliente</h2><p>Atualize os dados do cliente.</p></div></div>
        {editingError&&<div className="error">{editingError}</div>}
        <Input label="Nome" value={editingForm.name} onChange={e=>setEditingForm({...editingForm,name:e.target.value})} required/>
        <Input label="Telefone" value={editingForm.phone} onChange={e=>setEditingForm({...editingForm,phone:e.target.value})}/>
        <Input label="E-mail" type="email" value={editingForm.email} onChange={e=>setEditingForm({...editingForm,email:e.target.value})}/>
        <label className="field"><span>Observações</span><textarea value={editingForm.notes} onChange={e=>setEditingForm({...editingForm,notes:e.target.value})}/></label>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setEditingCustomer(null)}>Cancelar</Button><Button type="submit" disabled={editingSaving}>{editingSaving?"Salvando...":"Salvar alterações"}</Button></div>
      </form>
    </div>,document.body)}

    {clientMenu&&clientMenuPosition&&createPortal(
      <div
        data-client-menu-modern
        role="menu"
        aria-label={"Ações de "+clientMenu.name}
        onMouseDown={e=>e.stopPropagation()}
        onClick={e=>e.stopPropagation()}
        style={{
          position:"fixed",
          top:clientMenuPosition.top+"px",
          left:clientMenuPosition.left+"px",
          zIndex:2000,
          width:"190px",
          padding:"5px",
          display:"grid",
          gap:"2px",
          background:"#fff",
          border:"1px solid #e3e4eb",
          borderRadius:"11px",
          boxShadow:"0 16px 40px rgba(20,22,45,.18)"
        }}
      >
        <button type="button" role="menuitem" onClick={()=>{closeClientMenu();openCustomerEditor(clientMenu)}} style={{width:"100%",height:"36px",display:"flex",alignItems:"center",padding:"0 10px",border:0,borderRadius:"7px",background:"transparent",color:"#303139",fontSize:"11px",fontWeight:600,textAlign:"left"}}>
          Editar
        </button>
        <button type="button" role="menuitem" onClick={()=>{closeClientMenu();openCustomer(clientMenu)}} style={{width:"100%",height:"36px",display:"flex",alignItems:"center",padding:"0 10px",border:0,borderRadius:"7px",background:"transparent",color:"#303139",fontSize:"11px",fontWeight:600,textAlign:"left"}}>
          Ver dados
        </button>
        <button type="button" role="menuitem" onClick={()=>{closeClientMenu();whatsapp(clientMenu)}} style={{width:"100%",height:"36px",display:"flex",alignItems:"center",padding:"0 10px",border:0,borderRadius:"7px",background:"transparent",color:"#303139",fontSize:"11px",fontWeight:600,textAlign:"left"}}>
          Abrir WhatsApp
        </button>
        <button type="button" role="menuitem" onClick={()=>{closeClientMenu();removeCustomer(clientMenu)}} disabled={deleting} style={{width:"100%",height:"36px",display:"flex",alignItems:"center",padding:"0 10px",border:0,borderRadius:"7px",background:"transparent",color:"#c83d3d",fontSize:"11px",fontWeight:600,textAlign:"left",opacity:deleting?.6:1,cursor:deleting?"wait":"pointer"}}>
          {deleting?"Excluindo...":"Excluir cliente"}
        </button>
      </div>,
      document.body
    )}

    {customerView&&createPortal(<div className="client-modal-root" role="dialog" aria-modal="true">
      <div className="client-modal-card client-modal-history modern-modal">
        <button type="button" className="client-modal-close" onClick={()=>setCustomerView(null)} aria-label="Fechar"><X size={18}/></button>
        <div className="client-modal-head"><div className="client-modal-icon"><UserRound size={19}/></div><div><h2>{customerView.name}</h2><p>Histórico completo do cliente</p></div></div>
        <div className="customer-history-contact"><span>{customerView.phone||"Telefone não informado"}</span><span>{customerView.email||"E-mail não informado"}</span></div>
        {history.loading?<div className="customer-history-loading">Carregando histórico...</div>:<>
          <div className="customer-history-kpis">
            <div><span>Total pago</span><b>{money(history.payments.reduce((a,x)=>a+Number(x.amount||0),0))}</b></div>
            <div><span>Em aberto</span><b>{money(history.charges.filter(x=>x.status==="pending").reduce((a,x)=>a+Number(x.amount||0),0))}</b></div>
            <div><span>Cobranças</span><b>{history.charges.length}</b></div>
            <div><span>Pagamentos</span><b>{history.payments.length}</b></div>
          </div>
          <div className="customer-history-timeline">
            {[...history.charges.map(x=>({date:x.due_date+"T12:00:00",type:"charge",title:"Cobrança criada",detail:x.description||"Cobrança",value:Number(x.amount||0),status:x.status})),...history.payments.map(x=>({date:x.paid_at,type:"payment",title:"Pagamento recebido",detail:x.payment_method||"Pagamento",value:Number(x.amount||0)}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((item,i)=><div className="customer-history-event" key={i}>
              <span className={item.type==="payment"?"event-dot paid":"event-dot charge"}></span><div><b>{item.title}</b><span>{item.detail}</span><small>{new Date(item.date).toLocaleDateString("pt-BR")} · {item.type==="charge"?(item.status==="paid"?"Pago":"A receber"):"Recebido"}</small></div><strong>{money(item.value)}</strong>
            </div>)}
            {history.charges.length===0&&history.payments.length===0&&<Empty text="Ainda não há movimentações para este cliente."/>}
          </div>
        </>}
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>openCustomerEditor(customerView)}>Editar cliente</Button><Button type="button" onClick={()=>setCustomerView(null)}>Fechar</Button></div>
      </div>
    </div>,document.body)}
  </div>;
}
