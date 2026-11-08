import React, { useEffect, useMemo, useState } from "react";
import { TrendingUp, CalendarClock } from "lucide-react";
import { getPlanUsage } from "../lib/plan-usage";
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
  const [currentPlanKey,setCurrentPlanKey]=useState(planKey);
  const plan=useMemo(()=>PLAN_OPTIONS.find(p=>p.key===currentPlanKey)||PLAN_OPTIONS[0],[currentPlanKey]);

  useEffect(()=>{
    if(!companyId)return;
    let active=true;
    async function load(){
      try{
        const usage=await getPlanUsage();
        if(active){
          setCounts({customers:usage.customers,charges:usage.charges});
          setCurrentPlanKey(usage.plan||planKey);
        }
      }catch(error){
        console.warn("Não foi possível atualizar o uso do plano:",error?.message||error);
      }
    }
    load();
    const timer=window.setInterval(load,30000);
    return()=>{active=false;window.clearInterval(timer);};
  },[companyId,planKey]);

  if(!companyId)return null;
  const expiry=expiresAt?new Date(expiresAt):null;
  const remainingDays=expiry&&!Number.isNaN(expiry.getTime())?Math.max(0,Math.ceil((expiry.getTime()-Date.now())/86400000)):null;
  const expiryLabel=remainingDays===null?"":remainingDays===0?"Vence hoje":`Vence em ${remainingDays} ${remainingDays===1?"dia":"dias"}`;
  return <section className="plan-usage-card">
    <div className="plan-usage-head">
      <div><span className="panel-kicker">USO DO PLANO</span><div className="plan-usage-title-line"><h2>{plan.title}</h2>{expiryLabel&&<span className="plan-usage-expiry-inline"><CalendarClock size={12} aria-hidden="true"/>{expiryLabel}</span>}</div></div>
      <TrendingUp size={18}/>
    </div>
    <Metric label="Clientes" count={counts.customers} max={plan.maxCustomers}/>
    <Metric label="Cobranças no mês" count={counts.charges} max={plan.maxCharges}/>
  </section>;
}
