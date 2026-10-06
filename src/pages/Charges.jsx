import React, { useEffect, useMemo, useState } from "react";
import { MessageCircle, Plus, Receipt, X, Check, Download, ArrowDownUp, Copy, QrCode, Settings } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PLAN_OPTIONS } from "../lib/plans";
import { money, todayISO } from "../lib/formatters";
import { downloadCsv } from "../lib/export";
import { buildPixPayload } from "../lib/pix";
import { Button, Input, Empty, PageTitle } from "../components/AppPrimitives";
import { toast, confirmDialog } from "../ui";

function addDays(date,days){
  const d=new Date(date+"T12:00:00");
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}
function addMonths(date,months){
  const d=new Date(date+"T12:00:00");
  const day=d.getDate();
  const target=new Date(d.getFullYear(),d.getMonth()+months,1,12);
  const last=new Date(target.getFullYear(),target.getMonth()+1,0,12).getDate();
  target.setDate(Math.min(day,last));
  return target.toISOString().slice(0,10);
}

function ChargeDetail({charge,onClose,onPaid,customers=[],pixSettings={}}){
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [repeating,setRepeating]=useState(false);
  const [editing,setEditing]=useState(false);
  const [repeatDate,setRepeatDate]=useState("");
  const [editForm,setEditForm]=useState({
    customer_id:charge.customer_id||"",description:charge.description||"",amount:String(charge.amount??""),
    due_date:charge.due_date||todayISO(),payment_method:charge.payment_method||"Pix",recurrence:charge.recurrence||"none",notes:charge.notes||""
  });
  const [editError,setEditError]=useState("");
  const [copied,setCopied]=useState(false);

  useEffect(()=>{
    setEditing(false);setEditError("");
    setEditForm({
      customer_id:charge.customer_id||"",description:charge.description||"",amount:String(charge.amount??""),
      due_date:charge.due_date||todayISO(),payment_method:charge.payment_method||"Pix",recurrence:charge.recurrence||"none",notes:charge.notes||""
    });
  },[charge.id]);

  function nextMonthDate(date){
    const d=new Date(date+"T12:00:00");
    const next=new Date(d.getFullYear(),d.getMonth()+1,1,12);
    const lastDay=new Date(next.getFullYear(),next.getMonth()+1,0,12).getDate();
    next.setDate(Math.min(d.getDate(),lastDay));
    return next.toISOString().slice(0,10);
  }
  function openRepeat(){setRepeatDate(nextMonthDate(charge.due_date));setRepeating(true);setEditing(false);}

  async function saveEdit(e){
    e.preventDefault();setEditError("");
    const amount=Number(editForm.amount);
    if(!Number.isFinite(amount)||amount<=0){setEditError("Informe um valor maior que zero.");return;}
    if(!editForm.customer_id){setEditError("Selecione um cliente.");return;}
    setSaving(true);
    try{
      let linkedPayment=null;
      const paymentChanged=charge.status==="paid"&&(amount!==Number(charge.amount)||editForm.customer_id!==charge.customer_id);
      if(paymentChanged){
        const {data:payments,error}=await supabase.from("payments").select("id,amount,customer_id").eq("charge_id",charge.id).eq("company_id",charge.company_id);
        if(error)throw error;
        if(!payments?.length)throw new Error("Não foi encontrado o recebimento vinculado a esta cobrança.");
        if(payments.length!==1)throw new Error("Esta cobrança possui mais de um recebimento vinculado. O valor/cliente não pode ser alterado por segurança.");
        linkedPayment=payments[0];
        const {error:paymentUpdateError}=await supabase.from("payments").update({amount,customer_id:editForm.customer_id}).eq("id",linkedPayment.id).eq("company_id",charge.company_id);
        if(paymentUpdateError)throw paymentUpdateError;
      }
      const {error}=await supabase.from("charges").update({
        customer_id:editForm.customer_id,description:editForm.description.trim(),amount,due_date:editForm.due_date,
        payment_method:editForm.payment_method,recurrence:editForm.recurrence,notes:editForm.notes.trim()
      }).eq("id",charge.id).eq("company_id",charge.company_id);
      if(error){
        if(linkedPayment)await supabase.from("payments").update({amount:linkedPayment.amount,customer_id:linkedPayment.customer_id}).eq("id",linkedPayment.id).eq("company_id",charge.company_id);
        throw error;
      }
      setEditing(false);onPaid();
    }catch(error){setEditError(error?.message||"Não foi possível salvar as alterações.");}
    finally{setSaving(false);}
  }

  async function repeat(){
    setSaving(true);
    try{
      const {data:user}=await supabase.auth.getUser();
      if(!user?.user?.id)throw new Error("Sua sessão expirou. Entre novamente.");
      const {data:profile}=await supabase.from("profiles").select("plan").eq("id",user.user.id).single();
      const plan=PLAN_OPTIONS.find(p=>p.key===(profile?.plan||"free"))||PLAN_OPTIONS[0];
      let query=supabase.from("charges").select("id",{count:"exact",head:true}).eq("company_id",charge.company_id);
      if(plan.maxCharges!==null){
        const start=new Date();start.setDate(1);
        query=query.gte("created_at",start.toISOString().slice(0,10)).lt("created_at",new Date(start.getFullYear(),start.getMonth()+1,1).toISOString().slice(0,10));
      }
      const {count}=await query;
      if(plan.maxCharges!==null&&(count||0)>=plan.maxCharges){toast("O plano "+plan.title+" permite até "+plan.maxCharges+" cobranças por mês. Faça upgrade para adicionar mais.");return;}
      const {error}=await supabase.from("charges").insert({company_id:charge.company_id,customer_id:charge.customer_id,description:charge.description,amount:Number(charge.amount),due_date:repeatDate,payment_method:charge.payment_method,status:"pending",recurrence:"none"});
      if(error)throw error;
      setRepeating(false);onPaid();toast("Próxima cobrança criada.","success");
    }catch(error){toast(error?.message||"Não foi possível repetir a cobrança.");}
    finally{setSaving(false);}
  }

  async function removeCharge(){
    if(!(await confirmDialog("Excluir esta cobrança? Essa ação não pode ser desfeita.",{confirmText:"Excluir",danger:true})))return;
    setDeleting(true);
    const {error:paymentError}=await supabase.from("payments").delete().eq("charge_id",charge.id).eq("company_id",charge.company_id);
    if(paymentError){toast(paymentError.message);setDeleting(false);return;}
    const {error}=await supabase.from("charges").delete().eq("id",charge.id).eq("company_id",charge.company_id);
    if(error)toast(error.message);else{onPaid();toast("Cobrança excluída.","success");}
    setDeleting(false);
  }

  async function paid(){
    setSaving(true);
    try{
      const {error}=await supabase.from("charges").update({status:"paid"}).eq("id",charge.id).eq("company_id",charge.company_id);
      if(error)throw error;
      const {error:paymentError}=await supabase.from("payments").insert({company_id:charge.company_id,customer_id:charge.customer_id,charge_id:charge.id,amount:charge.amount,payment_method:charge.payment_method,paid_at:new Date().toISOString()});
      if(paymentError)throw paymentError;
      if(charge.recurrence&&charge.recurrence!=="none"){
        const nextDate=charge.recurrence==="weekly"?addDays(charge.due_date,7):charge.recurrence==="biweekly"?addDays(charge.due_date,14):charge.recurrence==="annual"?addMonths(charge.due_date,12):addMonths(charge.due_date,1);
        await supabase.from("charges").insert({company_id:charge.company_id,customer_id:charge.customer_id,description:charge.description,amount:Number(charge.amount),due_date:nextDate,payment_method:charge.payment_method,status:"pending",recurrence:charge.recurrence});
      }
      onPaid();toast("Recebimento registrado.","success");
    }catch(error){toast(error?.message||"Não foi possível registrar o pagamento.");}
    finally{setSaving(false);}
  }

  function createPix(){
    return buildPixPayload({
      key:pixSettings.pix_key,amount:Number(charge.amount),
      merchantName:pixSettings.pix_name||"Minha empresa",
      merchantCity:pixSettings.pix_city||"SAO PAULO",
      txid:String(charge.id).replace(/-/g,"").slice(0,25)
    });
  }
  const pixPayload=createPix();
  async function copyPix(){
    if(!pixPayload){toast("Configure a chave Pix da empresa primeiro.");return;}
    try{
      await navigator.clipboard.writeText(pixPayload);setCopied(true);toast("Pix Copia e Cola copiado.","success");window.setTimeout(()=>setCopied(false),1800);
    }catch{toast("Não foi possível copiar. Selecione o código manualmente.");}
  }
  function sendPixWhatsApp(){
    if(!pixPayload)return;
    const phone=(charge.customers?.phone||"").replace(/\D/g,"");
    const message="Olá! Segue o Pix da cobrança de "+money(charge.amount)+" ("+charge.description+").\n\n"+pixPayload;
    window.open(phone?"https://wa.me/"+phone+"?text="+encodeURIComponent(message):"https://wa.me/?text="+encodeURIComponent(message),"_blank","noopener,noreferrer");
  }

  const selectedCustomer=customers.find(c=>c.id===editForm.customer_id);
  return <div className="modal-backdrop"><div className="modal modern-charge-modal">
    <button className="modal-x" type="button" onClick={onClose}><X/></button>
    {editing?<form onSubmit={saveEdit}>
      <div className="modal-head"><div className="icon-box"><Receipt/></div><div><h2>Editar cobrança</h2><p>Atualize os dados desta cobrança.</p></div></div>
      {editError&&<div className="error">{editError}</div>}
      <label className="field"><span>Cliente</span><select value={editForm.customer_id} onChange={e=>setEditForm({...editForm,customer_id:e.target.value})} required><option value="">Selecione</option>{customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      <Input label="Descrição" value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})} required/>
      <Input label="Valor" type="number" step="0.01" min="0.01" value={editForm.amount} onChange={e=>setEditForm({...editForm,amount:e.target.value})} required/>
      <Input label="Vencimento" type="date" value={editForm.due_date} onChange={e=>setEditForm({...editForm,due_date:e.target.value})} required/>
      <label className="field"><span>Método</span><select value={editForm.payment_method} onChange={e=>setEditForm({...editForm,payment_method:e.target.value})}>{["Pix","Dinheiro","Cartão","Transferência","Outro"].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="field"><span>Recorrência</span><select value={editForm.recurrence} onChange={e=>setEditForm({...editForm,recurrence:e.target.value})}><option value="none">Não repetir</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label>
      <label className="field"><span>Observações</span><textarea value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})}/></label>
      {charge.status==="paid"&&selectedCustomer&&selectedCustomer.id!==charge.customer_id&&<div className="modal-note">O recebimento vinculado também será atualizado para o novo cliente.</div>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>{setEditing(false);setEditError("")}}>Cancelar</Button><Button type="submit" disabled={saving}>{saving?"Salvando...":"Salvar alterações"}</Button></div>
    </form>:repeating?<div>
      <div className="modal-head"><div className="icon-box"><Receipt/></div><div><h2>Repetir cobrança</h2><p>Crie a próxima cobrança para o mesmo cliente.</p></div></div>
      <div className="repeat-summary"><div><span>Cliente</span><b>{charge.customers?.name}</b></div><div><span>Descrição</span><b>{charge.description}</b></div><div><span>Valor</span><b>{money(charge.amount)}</b></div></div>
      <Input label="Novo vencimento" type="date" value={repeatDate} onChange={e=>setRepeatDate(e.target.value)} required/>
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setRepeating(false)}>Voltar</Button><Button type="button" onClick={repeat} disabled={saving}>{saving?"Criando...":"Criar próxima cobrança"}</Button></div>
    </div>:<div>
      <div className="modal-head"><div className="icon-box"><Receipt/></div><div><h2>{charge.customers?.name}</h2><p>{charge.description}</p></div></div>
      <div className="detail-grid"><div><span>Valor</span><b>{money(charge.amount)}</b></div><div><span>Vencimento</span><b>{new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")}</b></div><div><span>Método</span><b>{charge.payment_method||"Não informado"}</b></div></div>
      <div className="message-box">Oi! Tudo bem? Passando para lembrar da cobrança de {money(charge.amount)} com vencimento em {new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")}. Quando puder, consegue verificar? Obrigado!</div>
      {pixPayload?<div className="charge-pix-box"><div className="charge-pix-head"><div><span className="panel-kicker">PIX</span><h3>Pagamento por Pix</h3><p>Use este código para pagar exatamente o valor desta cobrança.</p></div><QrCode size={22}/></div><textarea readOnly value={pixPayload} aria-label="Pix Copia e Cola"/><div className="charge-pix-actions"><Button type="button" variant="secondary" onClick={copyPix}><Copy size={15}/>{copied?"Copiado":"Copiar Pix"}</Button><Button type="button" variant="secondary" onClick={sendPixWhatsApp}><MessageCircle size={15}/> Enviar pelo WhatsApp</Button></div></div>:<div className="charge-pix-empty"><QrCode size={20}/><div><b>Pix não configurado</b><span>Cadastre a chave Pix da empresa para gerar o Copia e Cola.</span></div><Button type="button" variant="secondary" onClick={()=>window.location.href="/app/configuracoes?tab=pix"}><Settings size={15}/> Configurar Pix</Button></div>}
      <div className="modal-actions">
        <Button type="button" variant="secondary" onClick={()=>{setEditing(true);setEditError("")}} disabled={deleting}><Receipt size={16}/> Editar</Button>
        <Button type="button" variant="secondary" className="danger-action" onClick={removeCharge} disabled={deleting}>{deleting?"Excluindo...":"Excluir cobrança"}</Button>
        {charge.status==="paid"?<Button type="button" onClick={openRepeat}><Receipt size={16}/> Repetir cobrança</Button>:<><Button type="button" variant="secondary" onClick={()=>{const phone=(charge.customers?.phone||"").replace(/\D/g,"");const message="Oi! Tudo bem? Passando para lembrar da cobrança de "+money(charge.amount)+" com vencimento em "+new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")+". Quando puder, consegue verificar? Obrigado!";window.open(phone?"https://wa.me/"+phone+"?text="+encodeURIComponent(message):"https://wa.me/?text="+encodeURIComponent(message),"_blank","noopener,noreferrer")}}><MessageCircle size={15}/> Abrir WhatsApp</Button><Button type="button" onClick={paid} disabled={saving}><Check size={16}/> Marcar como pago</Button></>}
      </div>
      <p className="modal-note">{charge.status==="paid"?"A cobrança original continua como paga.":"O botão do WhatsApp abre uma conversa com a mensagem preenchida. Ele não simula um envio pela plataforma."}</p>
    </div>}
  </div></div>;
}

export function Charges({companyId}){
  const loc=useLocationSafe();
  const [rows,setRows]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [pixSettings,setPixSettings]=useState({});
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState(null);
  const [filter,setFilter]=useState("pending");
  const [sort,setSort]=useState("due-asc");
  const [form,setForm]=useState({customer_id:"",description:"",amount:"",due_date:todayISO(),payment_method:"Pix",recurrence:"none",notes:""});
  const [saving,setSaving]=useState(false);

  async function load(){
    if(!companyId)return;
    const [{data:c,error:chargeError},{data:cu,error:customerError},{data:settings}]=await Promise.all([
      supabase.from("charges").select("*,customers(name,phone)").eq("company_id",companyId).order("due_date"),
      supabase.from("customers").select("*").eq("company_id",companyId).order("name"),
      supabase.from("company_settings").select("pix_key,pix_name,pix_city").eq("company_id",companyId).maybeSingle()
    ]);
    if(chargeError||customerError){console.error(chargeError||customerError);toast("Não foi possível carregar as cobranças.");return;}
    setRows(c||[]);setCustomers(cu||[]);setPixSettings(settings||{});
  }
  useEffect(()=>{load()},[companyId]);
  useEffect(()=>{
    const requested=new URLSearchParams(loc.search).get("filter");
    if(["pending","overdue","paid"].includes(requested))setFilter(requested);
    else if(loc.pathname==="/app/cobrancas")setFilter("pending");
  },[loc.search,loc.pathname]);

  const filtered=useMemo(()=>{
    const queryText=(new URLSearchParams(loc.search).get("q")||"").toLowerCase();
    const result=rows.filter(x=>{
      const statusMatch=filter==="paid"?x.status==="paid":filter==="overdue"?x.status==="pending"&&x.due_date<todayISO():x.status==="pending"&&x.due_date>=todayISO();
      const text=(x.description+" "+(x.customers?.name||"")).toLowerCase();
      return statusMatch&&(!queryText||text.includes(queryText));
    });
    return result.sort((a,b)=>{
      if(sort==="due-desc")return String(b.due_date).localeCompare(String(a.due_date));
      if(sort==="amount-desc")return Number(b.amount)-Number(a.amount);
      if(sort==="amount-asc")return Number(a.amount)-Number(b.amount);
      if(sort==="customer")return String(a.customers?.name||"").localeCompare(String(b.customers?.name||""),"pt-BR");
      if(sort==="status")return String(a.status).localeCompare(String(b.status));
      return String(a.due_date).localeCompare(String(b.due_date));
    });
  },[rows,filter,sort,loc.search]);

  function exportCharges(){
    downloadCsv("cobrancapro-cobrancas.csv",[
      {label:"Cliente",value:r=>r.customers?.name||""},{label:"Descrição",value:r=>r.description||""},
      {label:"Valor",value:r=>Number(r.amount||0).toFixed(2).replace(".",",")},{label:"Vencimento",value:r=>new Date(r.due_date+"T12:00:00").toLocaleDateString("pt-BR")},
      {label:"Status",value:r=>r.status==="paid"?"Pago":r.due_date<todayISO()?"Atrasado":r.due_date===todayISO()?"Vence hoje":"A receber"},
      {label:"Método",value:r=>r.payment_method||""},{label:"Recorrência",value:r=>r.recurrence||"none"}
    ],filtered);
    toast("Planilha exportada.","success");
  }

  async function save(e){
    e.preventDefault();if(saving)return;
    if(!companyId){toast("Sua empresa ainda está carregando. Tente novamente em instantes.");return;}
    const customerId=String(form.customer_id||"").trim(),description=String(form.description||"").trim(),amount=Number(form.amount),dueDate=String(form.due_date||"").trim();
    if(!customerId){toast("Selecione um cliente.");return;}
    if(!description){toast("Informe a descrição da cobrança.");return;}
    if(!Number.isFinite(amount)||amount<=0){toast("Informe um valor válido para a cobrança.");return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)){toast("Informe uma data de vencimento válida.");return;}
    setSaving(true);
    try{
      const {data:user,error:userError}=await supabase.auth.getUser();
      if(userError||!user?.user?.id)throw new Error(userError?.message||"Sua sessão expirou. Faça login novamente.");
      const {data:profile,error:profileError}=await supabase.from("profiles").select("plan").eq("id",user.user.id).maybeSingle();
      if(profileError)throw profileError;
      const plan=PLAN_OPTIONS.find(p=>p.key===(profile?.plan||"free"))||PLAN_OPTIONS[0];
      if(plan.maxCharges!==null){
        const start=new Date();start.setDate(1);
        const {count,error}=await supabase.from("charges").select("id",{count:"exact",head:true}).eq("company_id",companyId).gte("created_at",start.toISOString().slice(0,10)).lt("created_at",new Date(start.getFullYear(),start.getMonth()+1,1).toISOString().slice(0,10));
        if(error)throw error;
        if((count||0)>=plan.maxCharges){toast("Seu plano atingiu o limite de "+plan.maxCharges+" cobranças neste mês.");return;}
      }
      const {data:created,error}=await supabase.from("charges").insert({company_id:companyId,customer_id:customerId,description,amount,due_date:dueDate,payment_method:form.payment_method||"Pix",recurrence:form.recurrence||"none",notes:String(form.notes||"").trim()||null}).select("id").single();
      if(error)throw error;
      if(!created?.id)throw new Error("A cobrança não foi confirmada pelo banco.");
      setOpen(false);setForm({customer_id:"",description:"",amount:"",due_date:todayISO(),payment_method:"Pix",recurrence:"none",notes:""});
      await load();toast("Cobrança criada com sucesso.","success");
    }catch(error){console.error(error);toast(error?.message||"Não foi possível criar a cobrança.");}
    finally{setSaving(false);}
  }

  const sectionTitle=filter==="paid"?"Recebidas":filter==="overdue"?"Atrasadas":"A receber";
  const sectionSubtitle=filter==="paid"?"Histórico de cobranças já recebidas.":filter==="overdue"?"Cobranças vencidas que precisam de atenção.":"Cobranças pendentes e dentro do prazo.";

  return <div className="modern-page modern-charges-page">
    <PageTitle title={sectionTitle} subtitle={sectionSubtitle} action={<Button onClick={()=>setOpen(true)}><Plus size={17}/> Nova cobrança</Button>}/>
    <div className="modern-toolbar">
      <div className="modern-filter-tabs"><button className={filter==="pending"?"active":""} onClick={()=>setFilter("pending")}>A receber</button><button className={filter==="overdue"?"active":""} onClick={()=>setFilter("overdue")}>Atrasadas</button><button className={filter==="paid"?"active":""} onClick={()=>setFilter("paid")}>Recebidas</button></div>
      <div className="modern-toolbar-actions"><label className="modern-select"><span><ArrowDownUp size={14}/> Ordenar</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="due-asc">Vencimento mais próximo</option><option value="due-desc">Vencimento mais distante</option><option value="amount-desc">Maior valor</option><option value="amount-asc">Menor valor</option><option value="customer">Cliente A–Z</option></select></label><Button variant="secondary" onClick={exportCharges} disabled={!filtered.length}><Download size={16}/> Exportar</Button></div>
    </div>
    <div className="modern-list-meta"><span>{filtered.length} {filtered.length===1?"cobrança":"cobranças"}</span><span>Ordenação: {sort==="customer"?"Cliente A–Z":sort==="amount-desc"?"Maior valor":sort==="amount-asc"?"Menor valor":sort==="due-desc"?"Vencimento distante":"Vencimento próximo"}</span></div>
    <div className="panel modern-table-panel">
      {filtered.length===0?<Empty text="Nenhuma cobrança encontrada."/>:<div className="modern-table-wrap"><table className="modern-table">
        <thead><tr><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Ação</th></tr></thead>
        <tbody>{filtered.map(c=><tr key={c.id} onClick={()=>setSelected(c)}>
          <td><div className="modern-person"><span className="modern-avatar">{(c.customers?.name||"C").slice(0,1).toUpperCase()}</span><div><b>{c.customers?.name||"Cliente"}</b><small>{c.payment_method||"Pagamento"}</small></div></div></td>
          <td>{c.description}</td><td><b>{money(c.amount)}</b></td><td>{new Date(c.due_date+"T12:00:00").toLocaleDateString("pt-BR")}</td>
          <td><span className={"modern-status "+(c.status==="paid"?"paid":c.due_date<todayISO()?"overdue":c.due_date===todayISO()?"today":"pending")}>{c.status==="paid"?"Pago":c.due_date<todayISO()?"Atrasado":c.due_date===todayISO()?"Vence hoje":"A receber"}</span></td>
          <td className="modern-charge-action" onClick={e=>e.stopPropagation()}>{c.status==="paid"?<Button variant="secondary" className="btn-sm" onClick={()=>setSelected(c)}><Receipt size={14}/> Repetir</Button>:<Button variant="secondary" className="btn-sm" onClick={()=>setSelected(c)}><MessageCircle size={14}/> Cobrar</Button>}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>

    {open&&<div className="modal-backdrop"><form className="modal modern-charge-modal" onSubmit={save} noValidate>
      <button type="button" className="modal-x" onClick={()=>setOpen(false)}><X/></button>
      <div className="modal-head"><div className="icon-box"><Receipt/></div><div><h2>Nova cobrança</h2><p>Crie um valor a receber.</p></div></div>
      <label className="field"><span>Cliente</span><select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} required><option value="">Selecione</option>{customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      <Input label="Descrição" placeholder="Ex.: Mensalidade" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required/>
      <Input label="Valor" type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/>
      <Input label="Vencimento" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} required/>
      <label className="field"><span>Método</span><select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}>{["Pix","Dinheiro","Cartão","Transferência","Outro"].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="field"><span>Recorrência</span><select value={form.recurrence} onChange={e=>setForm({...form,recurrence:e.target.value})}><option value="none">Não repetir</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label>
      <div className="recurrence-hint">{form.recurrence==="none"?"Cobrança única.":"Ao marcar como paga, a próxima cobrança será criada automaticamente."}</div>
      {form.payment_method==="Pix"&&!pixSettings.pix_key&&<div className="charge-pix-config-hint"><QrCode size={17}/><span>Pix selecionado, mas a chave da empresa ainda não foi configurada.</span><button type="button" onClick={()=>window.location.href="/app/configuracoes?tab=pix"}>Configurar</button></div>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving?"Criando...":"Criar cobrança"}</Button></div>
    </form></div>}

    {selected&&<ChargeDetail charge={selected} customers={customers} pixSettings={pixSettings} onClose={()=>setSelected(null)} onPaid={()=>{setSelected(null);load();}}/>}
  </div>;
}

function useLocationSafe(){
  const [location,setLocation]=useState(()=>({pathname:window.location.pathname,search:window.location.search}));
  useEffect(()=>{
    const onPop=()=>setLocation({pathname:window.location.pathname,search:window.location.search});
    window.addEventListener("popstate",onPop);
    const id=window.setInterval(()=>{const next={pathname:window.location.pathname,search:window.location.search};setLocation(prev=>prev.pathname===next.pathname&&prev.search===next.search?prev:next)},250);
    return()=>{window.removeEventListener("popstate",onPop);window.clearInterval(id)};
  },[]);
  return location;
}
