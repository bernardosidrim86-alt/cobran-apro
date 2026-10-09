import React, { useEffect, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PLAN_OPTIONS } from "../lib/plans";

function Metric({label,count,max}){
  const unlimited=max===null;
  const percent=unlimited?0:Math.min(100,Math.round((count/max)*100));
  return <div className="plan-usage-metric">
    <div className="plan-usage-label"><span>{label}</span><b>{unlimited?count+" usados · Ilimitado":count+" / "+max}</b></div>
    <div className={"plan-usage-track"+(percent>=90?" danger":"")} aria-hidden="true"><span style={{width:unlimited?"100%":percent+"%"}}/></div>
  </div>;
}

export function PlanUsage({companyId,planKey="free",expiresAt=null}){
  const [counts,setCounts]=useState({customers:0,charges:0});
  const plan=useMemo(()=>PLAN_OPTIONS.find(p=>p.key===planKey)||PLAN_OPTIONS[0],[planKey]);

  useEffect(()=>{
    if(!companyId) return;
    let active=true;
    async function load(){
      const start=new Date();
      start.setDate(1);
      const first=start.toISOString().slice(0,10);
      const next=new Date(start.getFullYear(),start.getMonth()+1,1).toISOString().slice(0,10);
      const [{count:customers},{count:charges}]=await Promise.all([
        supabase.from("customers").select("id",{count:"exact",head:true}).eq("company_id",companyId),
        supabase.from("charges").select("id",{count:"exact",head:true}).eq("company_id",companyId).gte("created_at",first).lt("created_at",next)
      ]);
      if(active)setCounts({customers:customers||0,charges:charges||0});
    }
    load();
    const timer=window.setInterval(load,30000);
    return()=>{active=false;window.clearInterval(timer);};
  },[companyId]);

  if(!companyId) return null;
  const expiry=expiresAt?new Date(expiresAt):null;
  const remainingDays=expiry&&!Number.isNaN(expiry.getTime())?Math.max(0,Math.ceil((expiry.getTime()-Date.now())/86400000)):null;
  const expiryLabel=remainingDays===null?"":remainingDays===0?"Termina hoje":`${remainingDays} ${remainingDays===1?"dia":"dias"} restantes`;
  const expiryDate=expiry&&!Number.isNaN(expiry.getTime())?expiry.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
  return <section className="plan-usage-card">
    <div className="plan-usage-head">
      <div><span className="panel-kicker">USO DO PLANO</span><h2>{plan.title}</h2></div>
      <TrendingUp size={18}/>
    </div>
    <Metric label="Clientes" count={counts.customers} max={plan.maxCustomers}/>
    <Metric label="Cobranças no mês" count={counts.charges} max={plan.maxCharges}/>
    {expiryLabel&&<div className="plan-usage-expiry"><span>Tempo restante</span><strong>{expiryLabel}</strong><small>Vencimento: {expiryDate}</small></div>}
  </section>;
}
