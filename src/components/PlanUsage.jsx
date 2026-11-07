import React, { useEffect, useMemo, useState } from "react";
import { TrendingUp, CalendarClock, Users, Receipt, Infinity as InfinityIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PLAN_OPTIONS } from "../lib/plans";

function Metric({label,count,max,icon:Icon}){
  const unlimited=max===null;
  const percent=unlimited?100:Math.min(100,Math.round((count/Math.max(1,max))*100));
  const remaining=unlimited?null:Math.max(0,max-count);
  const danger=!unlimited&&percent>=90;
  return <div className="plan-usage-metric">
    <div className="plan-usage-metric-top">
      <span className="plan-usage-metric-icon"><Icon size={17} aria-hidden="true"/></span>
      <span className="plan-usage-metric-name">{label}</span>
      {unlimited&&<span className="plan-usage-unlimited"><InfinityIcon size={12}/> Sem limite</span>}
    </div>
    <div className="plan-usage-value-row">
      <strong>{count.toLocaleString("pt-BR")}</strong>
      <span>{unlimited?"utilizados":`de ${max.toLocaleString("pt-BR")} disponíveis`}</span>
    </div>
    <div className={"plan-usage-track"+(danger?" danger":"")} role="progressbar" aria-label={label} aria-valuenow={unlimited?0:percent} aria-valuemin={0} aria-valuemax={100}>
      <span style={{width:percent+"%"}}/>
    </div>
    <div className="plan-usage-foot">
      <span>{unlimited?"Uso livre":danger?"Limite próximo":`${percent}% do limite utilizado`}</span>
      {!unlimited&&<span>{remaining.toLocaleString("pt-BR")} restantes</span>}
    </div>
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
  const expiryLabel=remainingDays===null?"":remainingDays===0?"Vence hoje":`Vence em ${remainingDays} ${remainingDays===1?"dia":"dias"}`;
  return <section className="plan-usage-card">
    <div className="plan-usage-head">
      <div className="plan-usage-heading">
        <span className="plan-usage-kicker"><TrendingUp size={13}/> ACOMPANHAMENTO DO PLANO</span>
        <div className="plan-usage-title-line">
          <h2>{plan.title}</h2>
          <span className="plan-usage-plan-tag">PLANO ATUAL</span>
          {expiryLabel&&<span className="plan-usage-expiry-inline"><CalendarClock size={13} aria-hidden="true"/>{expiryLabel}</span>}
        </div>
        <p>Acompanhe o consumo e a capacidade da sua empresa.</p>
      </div>
    </div>
    <div className="plan-usage-metrics">
      <Metric label="Clientes cadastrados" count={counts.customers} max={plan.maxCustomers} icon={Users}/>
      <Metric label="Cobranças neste mês" count={counts.charges} max={plan.maxCharges} icon={Receipt}/>
    </div>
  </section>;
}
