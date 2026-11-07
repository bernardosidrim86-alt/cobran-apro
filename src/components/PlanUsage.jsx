import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { PLAN_OPTIONS } from "../lib/plans";

function UsageItem({ label, count, max }) {
  const unlimited = max === null;
  const percent = unlimited || !max ? 0 : Math.min(100, Math.round((count / max) * 100));

  return (
    <div className="cp-plan-usage__item">
      <div className="cp-plan-usage__item-head">
        <span className="cp-plan-usage__label">{label}</span>
        <strong className="cp-plan-usage__value">
          {unlimited
            ? `${count.toLocaleString("pt-BR")} usados · Ilimitado`
            : `${count.toLocaleString("pt-BR")} / ${max.toLocaleString("pt-BR")}`}
        </strong>
      </div>
      {!unlimited && (
        <div
          className="cp-plan-usage__track"
          role="progressbar"
          aria-label={`${label}: ${count} de ${max}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: percent + "%" }} />
        </div>
      )}
    </div>
  );
}

export function PlanUsage({ companyId, planKey = "free", expiresAt = null }) {
  const [counts, setCounts] = useState({ customers: 0, charges: 0 });
  const plan = useMemo(
    () => PLAN_OPTIONS.find((option) => option.key === planKey) || PLAN_OPTIONS[0],
    [planKey]
  );

  useEffect(() => {
    if (!companyId) return;
    let active = true;

    async function load() {
      const start = new Date();
      start.setDate(1);
      const first = start.toISOString().slice(0, 10);
      const next = new Date(start.getFullYear(), start.getMonth() + 1, 1).toISOString().slice(0, 10);

      const [{ count: customers }, { count: charges }] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("charges").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", first).lt("created_at", next)
      ]);

      if (active) setCounts({ customers: customers || 0, charges: charges || 0 });
    }

    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [companyId]);

  if (!companyId) return null;

  const expiry = expiresAt ? new Date(expiresAt) : null;
  const remainingDays = expiry && !Number.isNaN(expiry.getTime())
    ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000))
    : null;
  const expiryLabel = remainingDays === null
    ? ""
    : remainingDays === 0
      ? "Vence hoje"
      : `Vence em ${remainingDays} ${remainingDays === 1 ? "dia" : "dias"}`;

  return (
    <section id="plan-usage-panel" className="cp-plan-usage" aria-labelledby="plan-usage-title">
      <div className="cp-plan-usage__header">
        <div className="cp-plan-usage__plan">
          <span className="cp-plan-usage__eyebrow">USO DO PLANO</span>
          <h2 id="plan-usage-title">{plan.title}</h2>
        </div>
        {expiryLabel && <span className="cp-plan-usage__expiry">{expiryLabel}</span>}
      </div>

      <div className="cp-plan-usage__grid">
        <UsageItem label="Clientes" count={counts.customers} max={plan.maxCustomers} />
        <UsageItem label="Cobranças no mês" count={counts.charges} max={plan.maxCharges} />
      </div>
    </section>
  );
}
