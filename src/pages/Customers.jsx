import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, X, UserRound, MoreHorizontal } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PLAN_OPTIONS } from "../lib/plans";
import { money } from "../lib/formatters";
import { Button, Input, Empty, PageTitle } from "../components/AppPrimitives";
import { toast, confirmDialog } from "../ui";

function Customers() {
  const companyId=useCompany();
  const [rows,setRows]=useState([]);
  const [search,setSearch]=useState("");
  const [clientMenu,setClientMenu]=useState(null);
  const [clientMenuPosition,setClientMenuPosition]=useState(null);
  const loc=useLocation();
  useEffect(()=>{const q=new URLSearchParams(loc.search).get("q");if(q)setSearch(q)},[loc.search]);
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState({name:"",phone:"",email:"",notes:""});
  const [deleting,setDeleting]=useState(false);
  const [editingCustomer,setEditingCustomer]=useState(null);
  const [editingForm,setEditingForm]=useState({name:"",phone:"",email:"",notes:""});
  const [editingSaving,setEditingSaving]=useState(false);
  const [editingError,setEditingError]=useState("");
  const [customerView,setCustomerView]=useState(null);
  const [history,setHistory]=useState({charges:[],payments:[],loading:false});

  async function load(){
    if(!companyId)return;
    const {data}=await supabase.from("customers").select("*").eq("company_id",companyId).order("created_at",{ascending:false});
    setRows(data||[]);
  }

  useEffect(()=>{load()},[companyId]);

  function closeClientMenu(){
    setClientMenu(null);
    setClientMenuPosition(null);
  }

  function getClientMenuPosition(button){
    const rect=button.getBoundingClientRect();
    const width=190;
    const height=178;
    const gap=6;
    let left=rect.right-width;
    let top=rect.bottom+gap;
    if(left<10) left=10;
    if(left+width>window.innerWidth-10) left=Math.max(10,window.innerWidth-width-10);
    if(top+height>window.innerHeight-10) top=Math.max(10,rect.top-height-gap);
    return {top,left};
  }

  function toggleClientMenu(c,e){
    e.preventDefault();
    e.stopPropagation();
    if(clientMenu?.id===c.id){
      closeClientMenu();
      return;
    }
    setClientMenu(c);
    setClientMenuPosition(getClientMenuPosition(e.currentTarget));
  }

  useEffect(()=>{
    if(!clientMenu) return;
    function reposition(){
      const button=document.querySelector('[data-client-menu-trigger="'+clientMenu.id+'"]');
      if(button) setClientMenuPosition(getClientMenuPosition(button));
    }
    function handlePointerDown(e){
      if(
        e.target.closest?.('[data-client-menu-trigger]') ||
        e.target.closest?.('[data-client-menu-v3]')
      ) return;
      closeClientMenu();
    }
    window.addEventListener("resize",reposition);
    window.addEventListener("scroll",reposition,true);
    document.addEventListener("pointerdown",handlePointerDown);
    return()=>{
      window.removeEventListener("resize",reposition);
      window.removeEventListener("scroll",reposition,true);
      document.removeEventListener("pointerdown",handlePointerDown);
    };
  },[clientMenu]);

  async function openCustomer(c){
    setCustomerView(c);
    setHistory({charges:[],payments:[],loading:true});
    const [{data:charges},{data:payments}]=await Promise.all([
      supabase.from("charges").select("id,description,amount,due_date,status,payment_method").eq("company_id",companyId).eq("customer_id",c.id).order("due_date",{ascending:false}),
      supabase.from("payments").select("id,amount,paid_at,payment_method,charge_id").eq("company_id",companyId).eq("customer_id",c.id).order("paid_at",{ascending:false})
    ]);
    setHistory({charges:charges||[],payments:payments||[],loading:false});
  }

  function openCustomerEditor(c){

    setCustomerView(null);
    setEditingError("");
    setEditingCustomer(c);
    setEditingForm({
      name:c.name||"",
      phone:c.phone||"",
      email:c.email||"",
      notes:c.notes||""
    });
  }

  async function saveCustomerEdit(e){
    e.preventDefault();
    setEditingError("");
    if(!editingForm.name.trim()){
      setEditingError("Informe o nome do cliente.");
      return;
    }
    setEditingSaving(true);
    const {error}=await supabase
      .from("customers")
      .update({
        name:editingForm.name.trim(),
        phone:editingForm.phone.trim(),
        email:editingForm.email.trim(),
        notes:editingForm.notes.trim()
      })
      .eq("id",editingCustomer.id)
      .eq("company_id",companyId);

    if(error){
      setEditingError(error.message);
    }else{
      const updated={
        ...editingCustomer,
        name:editingForm.name.trim(),
        phone:editingForm.phone.trim(),
        email:editingForm.email.trim(),
        notes:editingForm.notes.trim()
      };
      setRows(prev=>prev.map(c=>c.id===updated.id?updated:c));
      setEditingCustomer(null);
    }
    setEditingSaving(false);
  }

  async function save(e){
    e.preventDefault();
    const {data:user}=await supabase.auth.getUser();
    const {data:profile}=await supabase.from("profiles").select("plan").eq("id",user.user.id).single();
    const plan=PLAN_OPTIONS.find(p=>p.key===(profile?.plan||"free"))||PLAN_OPTIONS[0];
    const {count}=await supabase.from("customers").select("id",{count:"exact",head:true}).eq("company_id",companyId);
    if(plan.maxCustomers!==null&&(count||0)>=plan.maxCustomers){
      toast("O plano "+plan.title+" permite até "+plan.maxCustomers+" clientes. Faça upgrade para adicionar mais.");
      return;
    }
    const {error}=await supabase.from("customers").insert({...form,company_id:companyId});
    if(error)toast(error.message);
    else{
      setForm({name:"",phone:"",email:"",notes:""});
      setOpen(false);
      load();
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
    if(error)toast(error.message);
    else{

      load();
    }
    setDeleting(false);
  }

  function whatsapp(c){
    const phone=(c.phone||"").replace(/\D/g,"");
    const message="Oi! Tudo bem, "+c.name+"? Passando para falar com você.";
    window.open(phone?"https://wa.me/"+phone+"?text="+encodeURIComponent(message):"https://wa.me/?text="+encodeURIComponent(message),"_blank");

  }

  function showData(c){openCustomer(c);}

  const filtered=rows.filter(x=>(x.name+" "+(x.phone||"")+" "+(x.email||"")).toLowerCase().includes(search.toLowerCase()));

  return <>
    <PageTitle title="Clientes" subtitle="Organize seus clientes e acompanhe o histórico." action={<Button onClick={()=>setOpen(true)}><Plus size={17}/> Novo cliente</Button>}/>
    <div className="toolbar">
      <div className="searchbox">
        <Search size={17}/>
        <input placeholder="Buscar cliente..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
    </div>
    <div className="panel table-panel">
      <div className="customers-table-wrap">
        {filtered.length===0?<Empty text="Você ainda não possui clientes."/>:<table>
          <thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Criado em</th><th className="client-actions-head-v2"></th></tr></thead>
          <tbody>
            {filtered.map(c=><tr key={c.id} onClick={()=>openCustomer(c)} style={{cursor:"pointer"}}>
              <td><b>{c.name}</b></td>
              <td>{c.phone||"—"}</td>
              <td>{c.email||"—"}</td>
              <td>{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
              <td className="client-actions-cell-v3" onClick={e=>e.stopPropagation()}>
                <button
                  type="button"
                  className={"client-actions-trigger-v3 "+(clientMenu?.id===c.id?"active":"")}
                  data-client-menu-trigger={c.id}
                  aria-label={"Ações de "+c.name}
                  onClick={e=>toggleClientMenu(c,e)}
                >
                  <MoreHorizontal size={19}/>
                </button>
              </td>
            </tr>)}
          </tbody>
        </table>}
      </div>
    </div>

    {open&&<div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <button type="button" className="modal-x" onClick={()=>setOpen(false)}><X/></button>
        <div className="modal-head"><div className="icon-box"><UserRound/></div><div><h2>Novo cliente</h2><p>Cadastre os dados básicos.</p></div></div>
        <Input label="Nome" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/>
        <Input label="Telefone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
        <Input label="E-mail" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
        <label className="field"><span>Observações</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button>
          <Button type="submit">Criar cliente</Button>
        </div>
      </form>
    </div>}

    {editingCustomer&&createPortal(
      <div className="client-modal-root" role="dialog" aria-modal="true" aria-label="Editar cliente">
        <form className="client-modal-card" onSubmit={saveCustomerEdit}>
          <button type="button" className="client-modal-close" onClick={()=>setEditingCustomer(null)} aria-label="Fechar"><X size={18}/></button>
          <div className="client-modal-head">
            <div className="client-modal-icon"><UserRound size={19}/></div>
            <div><h2>Editar cliente</h2><p>Atualize os dados do cliente.</p></div>
          </div>
          {editingError&&<div className="error">{editingError}</div>}
          <Input label="Nome" value={editingForm.name} onChange={e=>setEditingForm({...editingForm,name:e.target.value})} required/>
          <Input label="Telefone" value={editingForm.phone} onChange={e=>setEditingForm({...editingForm,phone:e.target.value})}/>
          <Input label="E-mail" type="email" value={editingForm.email} onChange={e=>setEditingForm({...editingForm,email:e.target.value})}/>
          <label className="field"><span>Observações</span><textarea value={editingForm.notes} onChange={e=>setEditingForm({...editingForm,notes:e.target.value})}/></label>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={()=>setEditingCustomer(null)}>Cancelar</Button>
            <Button type="submit" disabled={editingSaving}>{editingSaving?"Salvando...":"Salvar alterações"}</Button>
          </div>
        </form>
      </div>,
      document.body
    )}

    {clientMenu&&clientMenuPosition&&createPortal(
      <div
        data-client-menu-v3
        className="client-actions-menu-v3"
        style={{
          position:"fixed",
          top:clientMenuPosition.top+"px",
          left:clientMenuPosition.left+"px",
          width:"190px"
        }}
      >
        <button type="button" onClick={()=>{closeClientMenu();openCustomerEditor(clientMenu)}}>Editar</button>
        <button type="button" onClick={()=>{closeClientMenu();openCustomer(clientMenu)}}>Ver dados</button>
        <button type="button" onClick={()=>{closeClientMenu();whatsapp(clientMenu)}}>Abrir WhatsApp</button>
        <button type="button" className="danger" onClick={()=>{closeClientMenu();removeCustomer(clientMenu)}} disabled={deleting}>
          {deleting?"Excluindo...":"Excluir cliente"}
        </button>
      </div>,
      document.body
    )}

    {customerView&&createPortal(
      <div className="client-modal-root" role="dialog" aria-modal="true" aria-label={"Dados de "+customerView.name}>
        <div className="client-modal-card client-modal-history">
          <button type="button" className="client-modal-close" onClick={()=>setCustomerView(null)} aria-label="Fechar"><X size={18}/></button>
          <div className="client-modal-head">
            <div className="client-modal-icon"><UserRound size={19}/></div>
            <div><h2>{customerView.name}</h2><p>Histórico completo do cliente</p></div>
          </div>
          <div className="customer-history-contact">
            <span>{customerView.phone||"Telefone não informado"}</span>
            <span>{customerView.email||"E-mail não informado"}</span>
          </div>
          {history.loading?<div className="customer-history-loading">Carregando histórico...</div>:<>
            <div className="customer-history-kpis">
              <div><span>Total pago</span><b>{money(history.payments.reduce((a,x)=>a+Number(x.amount||0),0))}</b></div>
              <div><span>Em aberto</span><b>{money(history.charges.filter(x=>x.status==="pending").reduce((a,x)=>a+Number(x.amount||0),0))}</b></div>
              <div><span>Cobranças</span><b>{history.charges.length}</b></div>
              <div><span>Pagamentos</span><b>{history.payments.length}</b></div>
            </div>
            <div className="customer-history-timeline">
              {[...history.charges.map(x=>({date:x.due_date+"T12:00:00",type:"charge",title:"Cobrança criada",detail:x.description||"Cobrança",value:Number(x.amount||0),status:x.status})),...history.payments.map(x=>({date:x.paid_at,type:"payment",title:"Pagamento recebido",detail:x.payment_method||"Pagamento",value:Number(x.amount||0)}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((item,i)=><div className="customer-history-event" key={i}>
                <span className={item.type==="payment"?"event-dot paid":"event-dot charge"}></span>
                <div><b>{item.title}</b><span>{item.detail}</span><small>{new Date(item.date).toLocaleDateString("pt-BR")} · {item.type==="charge"?(item.status==="paid"?"Pago":"A receber"):"Recebido"}</small></div>
                <strong>{money(item.value)}</strong>
              </div>)}
              {history.charges.length===0&&history.payments.length===0&&<Empty text="Ainda não há movimentações para este cliente."/>}
            </div>
          </>}
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={()=>openCustomerEditor(customerView)}>Editar cliente</Button>
            <Button type="button" onClick={()=>setCustomerView(null)}>Fechar</Button>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>;
}
export { Customers };
