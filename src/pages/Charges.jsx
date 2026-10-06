import React, { useEffect, useMemo, useState } from "react";
import { MessageCircle, Plus, Receipt, X, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PLAN_OPTIONS } from "../lib/plans";
import { money, todayISO } from "../lib/formatters";
import { Button, Input, Empty, PageTitle } from "../components/AppPrimitives";
import { toast, confirmDialog } from "../ui";

function ChargeDetail({charge,onClose,onPaid,customers=[]}){
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [repeating,setRepeating]=useState(false);
  const [editing,setEditing]=useState(false);
  const [repeatDate,setRepeatDate]=useState("");
  const [editForm,setEditForm]=useState({
    customer_id:charge.customer_id||"",
    description:charge.description||"",
    amount:String(charge.amount??""),
    due_date:charge.due_date||todayISO(),
    payment_method:charge.payment_method||"Pix",
    recurrence:charge.recurrence||"none",
    notes:charge.notes||""
  });
  const [editError,setEditError]=useState("");

  useEffect(()=>{
    setEditing(false);
    setEditError("");
    setEditForm({
      customer_id:charge.customer_id||"",
      description:charge.description||"",
      amount:String(charge.amount??""),
      due_date:charge.due_date||todayISO(),
      payment_method:charge.payment_method||"Pix",
      recurrence:charge.recurrence||"none",
      notes:charge.notes||""
    });
  },[charge.id]);

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

  function nextMonthDate(date){
    const d=new Date(date+"T12:00:00");
    const next=new Date(d.getFullYear(),d.getMonth()+1,1,12);
    const lastDay=new Date(next.getFullYear(),next.getMonth()+1,0,12).getDate();
    next.setDate(Math.min(d.getDate(),lastDay));
    return next.toISOString().slice(0,10);
  }

  function openRepeat(){
    setRepeatDate(nextMonthDate(charge.due_date));
    setRepeating(true);
    setEditing(false);
  }

  async function saveEdit(e){
    e.preventDefault();
    setEditError("");
    const amount=Number(editForm.amount);
    if(!Number.isFinite(amount)||amount<=0){
      setEditError("Informe um valor maior que zero.");
      return;
    }
    if(!editForm.customer_id){
      setEditError("Selecione um cliente.");
      return;
    }

    setSaving(true);
    try{
      let linkedPayment=null;
      const paymentChanged =
        charge.status==="paid" &&
        (amount!==Number(charge.amount)||editForm.customer_id!==charge.customer_id);

      if(paymentChanged){
        const {data:payments,error:paymentsError}=await supabase
          .from("payments")
          .select("id,amount,customer_id")
          .eq("charge_id",charge.id)
          .eq("company_id",charge.company_id);

        if(paymentsError) throw paymentsError;
        if(!payments?.length){
          throw new Error("Não foi encontrado o recebimento vinculado a esta cobrança.");
        }
        if(payments.length!==1){
          throw new Error("Esta cobrança possui mais de um recebimento vinculado. O valor/cliente não pode ser alterado por segurança.");
        }

        linkedPayment=payments[0];

        const {error:paymentUpdateError}=await supabase
          .from("payments")
          .update({amount,customer_id:editForm.customer_id})
          .eq("id",linkedPayment.id)
          .eq("company_id",charge.company_id);

        if(paymentUpdateError) throw paymentUpdateError;
      }

      const {error}=await supabase
        .from("charges")
        .update({
          customer_id:editForm.customer_id,
          description:editForm.description.trim(),
          amount,
          due_date:editForm.due_date,
          payment_method:editForm.payment_method,
          recurrence:editForm.recurrence,
          notes:editForm.notes.trim()
        })
        .eq("id",charge.id)
        .eq("company_id",charge.company_id);

      if(error){
        if(linkedPayment){
          await supabase.from("payments").update({
            amount:linkedPayment.amount,
            customer_id:linkedPayment.customer_id
          }).eq("id",linkedPayment.id).eq("company_id",charge.company_id);
        }
        throw error;
      }

      setEditing(false);
      onPaid();
    }catch(error){
      setEditError(error?.message||"Não foi possível salvar as alterações.");
    }finally{
      setSaving(false);
    }
  }

  async function repeat(){
    setSaving(true);
    const {data:user}=await supabase.auth.getUser();
    const {data:profile}=await supabase.from("profiles").select("plan").eq("id",user.user.id).single();
    const plan=PLAN_OPTIONS.find(p=>p.key===(profile?.plan||"free"))||PLAN_OPTIONS[0];
    let query=supabase.from("charges").select("id",{count:"exact",head:true}).eq("company_id",charge.company_id);
    if(plan.maxCharges!==null){
      const startOfMonth=new Date();
      startOfMonth.setDate(1);
      const firstDay=startOfMonth.toISOString().slice(0,10);
      const nextMonth=new Date(startOfMonth.getFullYear(),startOfMonth.getMonth()+1,1);
      const nextDay=nextMonth.toISOString().slice(0,10);
      query=query.gte("created_at",firstDay).lt("created_at",nextDay);
    }
    const {count}=await query;
    if(plan.maxCharges!==null&&(count||0)>=plan.maxCharges){
      toast("O plano "+plan.title+" permite até "+plan.maxCharges+" cobranças por mês. Faça upgrade para adicionar mais.");
      setSaving(false);
      return;
    }
    const {error}=await supabase.from("charges").insert({
      company_id:charge.company_id,
      customer_id:charge.customer_id,
      description:charge.description,
      amount:Number(charge.amount),
      due_date:repeatDate,
      payment_method:charge.payment_method,
      status:"pending",
      recurrence:"none"
    });
    if(error){
      toast(error.message);
    }else{
      setRepeating(false);
      onPaid();
    }
    setSaving(false);
  }

  async function removeCharge(){
    if(!(await confirmDialog("Excluir esta cobrança? Essa ação não pode ser desfeita.",{confirmText:"Excluir",danger:true})))return;
    setDeleting(true);
    const {error:paymentError}=await supabase.from("payments").delete().eq("charge_id",charge.id).eq("company_id",charge.company_id);
    if(paymentError){
      toast(paymentError.message);
      setDeleting(false);
      return;
    }
    const {error}=await supabase.from("charges").delete().eq("id",charge.id).eq("company_id",charge.company_id);
    if(error) toast(error.message);
    else onPaid();
    setDeleting(false);
  }

  async function paid(){
    setSaving(true);
    const {error}=await supabase.from("charges").update({status:"paid"}).eq("id",charge.id).eq("company_id",charge.company_id);
    if(!error){
      await supabase.from("payments").insert({
        company_id:charge.company_id,
        customer_id:charge.customer_id,
        charge_id:charge.id,
        amount:charge.amount,
        payment_method:charge.payment_method,
        paid_at:new Date().toISOString()
      });
      if(charge.recurrence&&charge.recurrence!=="none"){
        const nextDate=charge.recurrence==="weekly"
          ? addDays(charge.due_date,7)
          : charge.recurrence==="biweekly"
            ? addDays(charge.due_date,14)
            : charge.recurrence==="annual"
              ? addMonths(charge.due_date,12)
              : addMonths(charge.due_date,1);
        await supabase.from("charges").insert({
          company_id:charge.company_id,
          customer_id:charge.customer_id,
          description:charge.description,
          amount:Number(charge.amount),
          due_date:nextDate,
          payment_method:charge.payment_method,
          status:"pending",
          recurrence:charge.recurrence
        });
      }
      onPaid();
    }else{
      toast(error.message);
    }
    setSaving(false);
  }

  const selectedCustomer=customers.find(c=>c.id===editForm.customer_id);

  return <div className="modal-backdrop">
    <div className="modal">
      <button className="modal-x" type="button" onClick={onClose}><X/></button>
      {editing ? <form onSubmit={saveEdit}>
        <div className="modal-head">
          <div className="icon-box"><Receipt/></div>
          <div><h2>Editar cobrança</h2><p>Atualize os dados desta cobrança.</p></div>
        </div>
        {editError&&<div className="error">{editError}</div>}
        <label className="field">
          <span>Cliente</span>
          <select value={editForm.customer_id} onChange={e=>setEditForm({...editForm,customer_id:e.target.value})} required>
            <option value="">Selecione</option>
            {customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
        </label>
        <Input label="Descrição" value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})} required/>
        <Input label="Valor" type="number" step="0.01" min="0.01" value={editForm.amount} onChange={e=>setEditForm({...editForm,amount:e.target.value})} required/>
        <Input label="Vencimento" type="date" value={editForm.due_date} onChange={e=>setEditForm({...editForm,due_date:e.target.value})} required/>
        <label className="field">
          <span>Método</span>
          <select value={editForm.payment_method} onChange={e=>setEditForm({...editForm,payment_method:e.target.value})}>
            {["Pix","Dinheiro","Cartão","Transferência","Outro"].map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Recorrência</span>
          <select value={editForm.recurrence} onChange={e=>setEditForm({...editForm,recurrence:e.target.value})}>
            <option value="none">Não repetir</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quinzenal</option>
            <option value="monthly">Mensal</option>
            <option value="annual">Anual</option>
          </select>
        </label>
        <label className="field">
          <span>Observações</span>
          <textarea value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})}/>
        </label>
        {charge.status==="paid"&&selectedCustomer&&selectedCustomer.id!==charge.customer_id&&<div className="modal-note">Como esta cobrança já foi paga, o recebimento vinculado também será atualizado para o novo cliente.</div>}
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={()=>{setEditing(false);setEditError("")}}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving?"Salvando...":"Salvar alterações"}</Button>
        </div>
      </form> : repeating ? <>
        <div className="modal-head">
          <div className="icon-box"><Receipt/></div>
          <div><h2>Repetir cobrança</h2><p>Crie a próxima mensalidade para o mesmo cliente.</p></div>
        </div>
        <div className="repeat-summary">
          <div><span>Cliente</span><b>{charge.customers?.name}</b></div>
          <div><span>Descrição</span><b>{charge.description}</b></div>
          <div><span>Valor</span><b>{money(charge.amount)}</b></div>
        </div>
        <Input label="Novo vencimento" type="date" value={repeatDate} onChange={e=>setRepeatDate(e.target.value)} required/>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={()=>setRepeating(false)}>Voltar</Button>
          <Button type="button" onClick={repeat} disabled={saving}>{saving?"Criando...":"Criar próxima cobrança"}</Button>
        </div>
      </> : <>
        <div className="modal-head">
          <div className="icon-box"><Receipt/></div>
          <div><h2>{charge.customers?.name}</h2><p>{charge.description}</p></div>
        </div>
        <div className="detail-grid">
          <div><span>Valor</span><b>{money(charge.amount)}</b></div>
          <div><span>Vencimento</span><b>{new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")}</b></div>
          <div><span>Método</span><b>{charge.payment_method}</b></div>
        </div>
        <div className="message-box">Oi! Tudo bem? Passando para lembrar da cobrança de {money(charge.amount)} com vencimento em {new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")}. Quando puder, consegue verificar? Obrigado!</div>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={()=>{setEditing(true);setEditError("")}} disabled={deleting}><Receipt size={16}/> Editar</Button>
          <Button type="button" variant="secondary" className="danger-action" onClick={removeCharge} disabled={deleting}>{deleting?"Excluindo...":"Excluir cobrança"}</Button>
          {charge.status==="paid"
            ? <Button type="button" onClick={openRepeat}><Receipt size={16}/> Repetir cobrança</Button>
            : <>
              <Button type="button" variant="secondary" onClick={()=>{
                const phone=(charge.customers?.phone||"").replace(/\D/g,"");
                const message="Oi! Tudo bem? Passando para lembrar da cobrança de "+money(charge.amount)+" com vencimento em "+new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")+". Quando puder, consegue verificar? Obrigado!";
                window.open(phone?"https://wa.me/"+phone+"?text="+encodeURIComponent(message):"https://wa.me/?text="+encodeURIComponent(message),"_blank","noopener,noreferrer");
              }}>Abrir WhatsApp</Button>
              <Button type="button" onClick={paid} disabled={saving}><Check size={16}/> Marcar como pago</Button>
            </>
          }
        </div>
        <p className="modal-note">{charge.status==="paid"?"A cobrança original continua como paga. A nova cobrança será criada para o mesmo cliente.":"O botão do WhatsApp abre uma conversa com a mensagem preenchida. Ele não simula um envio pela plataforma."}</p>
      </>}
    </div>
  </div>;
}

function Charges({companyId: companyIdProp}) {
  const [resolvedCompanyId,setResolvedCompanyId]=useState(null);
  const companyId=companyIdProp||resolvedCompanyId;
  const loc=useLocation();
  const [rows,setRows]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState(null);
  const [filter,setFilter]=useState("all");
  const [form,setForm]=useState({customer_id:"",description:"",amount:"",due_date:todayISO(),payment_method:"Pix",recurrence:"none",notes:""});
  const [saving,setSaving]=useState(false);

  async function load(){
    if(!companyId)return;
    const [{data:c},{data:cu}]=await Promise.all([
      supabase.from("charges").select("*,customers(name,phone)").eq("company_id",companyId).order("due_date"),
      supabase.from("customers").select("*").eq("company_id",companyId).order("name")
    ]);
    setRows(c||[]);
    setCustomers(cu||[]);
  }

  useEffect(()=>{
    let active=true;
    async function resolveCompany(){
      if(companyIdProp){
        setResolvedCompanyId(null);
        return;
      }
      try{
        const {data:user,error:userError}=await supabase.auth.getUser();
        if(userError||!user?.user?.id||!active)return;
        const {data:profile,error:profileError}=await supabase
          .from("profiles")
          .select("company_id")
          .eq("id",user.user.id)
          .maybeSingle();
        if(!active)return;
        if(!profileError&&profile?.company_id){
          setResolvedCompanyId(profile.company_id);
          return;
        }
        const {data:newCompanyId,error:createError}=await supabase.rpc("create_my_company",{
          p_name:user.user.user_metadata?.company_name||"Minha empresa",
          p_segment:null,
          p_phone:null
        });
        if(!active)return;
        if(createError){
          console.error("Falha ao recuperar empresa:",createError);
          return;
        }
        setResolvedCompanyId(newCompanyId||null);
      }catch(error){
        console.error("Falha ao resolver empresa:",error);
      }
    }
    resolveCompany();
    return()=>{active=false};
  },[companyIdProp]);

  useEffect(()=>{load()},[companyId]);
  useEffect(()=>{
    const requested=new URLSearchParams(loc.search).get("filter");
    if(["pending","overdue","paid"].includes(requested)) setFilter(requested);
    else if(loc.pathname==="/app/cobrancas") setFilter("pending");
  },[loc.search,loc.pathname]);

  async function save(e){
    e.preventDefault();
    if(saving)return;

    if(!companyId){
      toast("Não foi possível identificar sua empresa. Recarregue a página e tente novamente.");
      return;
    }

    const customerId=String(form.customer_id||"").trim();
    const description=String(form.description||"").trim();
    const amount=Number(form.amount);
    const dueDate=String(form.due_date||"").trim();

    if(!customerId){toast("Selecione um cliente.");return;}
    if(!description){toast("Informe a descrição da cobrança.");return;}
    if(!Number.isFinite(amount)||amount<=0){toast("Informe um valor válido para a cobrança.");return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)){toast("Informe uma data de vencimento válida.");return;}

    setSaving(true);
    try{
      const {data:user,error:userError}=await Promise.race([
        supabase.auth.getUser(),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error("Sua sessão demorou para responder.")),7000))
      ]);
      if(userError||!user?.user?.id){
        throw new Error(userError?.message||"Sua sessão expirou. Faça login novamente.");
      }

      const {data:profile,error:profileError}=await Promise.race([
        supabase.from("profiles").select("plan").eq("id",user.user.id).maybeSingle(),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error("Não foi possível validar sua conta agora.")),7000))
      ]);
      if(profileError)throw new Error(profileError.message||"Não foi possível validar sua conta agora.");

      const plan=PLAN_OPTIONS.find(p=>p.key===(profile?.plan||"free"))||PLAN_OPTIONS[0];

      if(plan.maxCharges!==null){
        const startOfMonth=new Date();
        startOfMonth.setDate(1);
        const firstDay=startOfMonth.toISOString().slice(0,10);
        const nextMonth=new Date(startOfMonth.getFullYear(),startOfMonth.getMonth()+1,1);
        const nextDay=nextMonth.toISOString().slice(0,10);

        const {count,error:countError}=await Promise.race([
          supabase.from("charges").select("id",{count:"exact",head:true})
            .eq("company_id",companyId)
            .gte("created_at",firstDay)
            .lt("created_at",nextDay),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error("A verificação do limite demorou demais.")),7000))
        ]);

        if(countError)throw new Error(countError.message||"Não foi possível verificar o limite de cobranças.");
        if((count||0)>=plan.maxCharges){
          toast("Seu plano atingiu o limite de "+plan.maxCharges+" cobranças neste mês.");
          return;
        }
      }

      const payload={
        company_id:companyId,
        customer_id:customerId,
        description,
        amount,
        due_date:dueDate,
        payment_method:form.payment_method||"Pix",
        recurrence:form.recurrence||"none",
        notes:String(form.notes||"").trim()||null
      };

      const {data:created,error:insertError}=await Promise.race([
        supabase.from("charges").insert(payload).select("id").single(),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error("A criação da cobrança demorou demais. Tente novamente.")),10000))
      ]);

      if(insertError){
        throw new Error(insertError.message||"Não foi possível criar a cobrança.");
      }
      if(!created?.id){
        throw new Error("A cobrança não foi confirmada pelo banco.");
      }

      setOpen(false);
      setForm({
        customer_id:"",
        description:"",
        amount:"",
        due_date:todayISO(),
        payment_method:"Pix",
        recurrence:"none",
        notes:""
      });
      await load();
      toast("Cobrança criada com sucesso.","success");
    }catch(error){
      console.error("Erro ao criar cobrança:",error);
      toast(error?.message||"Não foi possível criar a cobrança.");
    }finally{
      setSaving(false);
    }
  }

  const queryText=(new URLSearchParams(loc.search).get("q")||"").toLowerCase();
  const filtered=rows.filter(x=>{const statusMatch=filter==="paid"?x.status==="paid":filter==="overdue"?x.status==="pending"&&x.due_date<todayISO():x.status==="pending"&&x.due_date>=todayISO();const text=(x.description+" "+(x.customers?.name||"")).toLowerCase();return statusMatch&&(!queryText||text.includes(queryText));});

  const sectionTitle=filter==="paid"?"Recebidas":filter==="overdue"?"Atrasadas":"A receber";
  const sectionSubtitle=filter==="paid"?"Histórico de cobranças já recebidas.":filter==="overdue"?"Cobranças vencidas que precisam de atenção.":"Cobranças pendentes e dentro do prazo.";

  return <>
    <PageTitle title={sectionTitle} subtitle={sectionSubtitle} action={<Button onClick={()=>setOpen(true)}><Plus size={17}/> Nova cobrança</Button>}/>
    <div className="panel table-panel">
      {filtered.length===0?<Empty text="Nenhuma cobrança encontrada."/>:<table>
        <thead><tr><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Ação</th></tr></thead>
        <tbody>{filtered.map(c=><tr key={c.id} onClick={()=>setSelected(c)} style={{cursor:"pointer"}}>
          <td><b>{c.customers?.name}</b></td>
          <td>{c.description}</td>
          <td><b>{money(c.amount)}</b></td>
          <td>{new Date(c.due_date+"T12:00:00").toLocaleDateString("pt-BR")}</td>
          <td><span className={`badge ${c.status==="paid"?"green":c.due_date<todayISO()?"red":c.due_date===todayISO()?"yellow":"gray"}`}>{c.status==="paid"?"Pago":c.due_date<todayISO()?"Atrasado":c.due_date===todayISO()?"Vence hoje":"A receber"}</span></td>
          <td className="charge-action-cell">{c.status==="paid"?<button className="btn btn-secondary btn-sm charge-repeat-action" onClick={(e)=>{e.stopPropagation();setSelected(c)}}><Receipt size={14}/> Repetir</button>:<button className="btn btn-secondary btn-sm charge-repeat-action" onClick={(e)=>{e.stopPropagation();setSelected(c)}}><MessageCircle size={14}/> Cobrar</button>}</td>
        </tr>)}</tbody>
      </table>}
    </div>

    {open&&<div className="modal-backdrop"><form className="modal" onSubmit={save} noValidate>
      <button type="button" className="modal-x" onClick={()=>setOpen(false)}><X/></button>
      <div className="modal-head"><div className="icon-box"><Receipt/></div><div><h2>Nova cobrança</h2><p>Crie um valor a receber.</p></div></div>
      <label className="field"><span>Cliente</span><select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} required><option value="">Selecione</option>{customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      <Input label="Descrição" placeholder="Ex.: Mensalidade" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required/>
      <Input label="Valor" type="number" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/>
      <Input label="Vencimento" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} required/>
      <label className="field"><span>Método</span><select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}>{["Pix","Dinheiro","Cartão","Transferência","Outro"].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="field"><span>Recorrência</span><select value={form.recurrence} onChange={e=>setForm({...form,recurrence:e.target.value})}><option value="none">Não repetir</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label>
      <div className="recurrence-hint">{form.recurrence==="none"?"Cobrança única.":"Ao marcar como paga, a próxima cobrança será criada automaticamente."}</div><div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving?"Criando...":"Criar cobrança"}</Button></div>
    </form></div>}

    {selected&&<ChargeDetail charge={selected} customers={customers} onClose={()=>setSelected(null)} onPaid={()=>{setSelected(null);load();}}/>}
  </>;
}
export { Charges };
