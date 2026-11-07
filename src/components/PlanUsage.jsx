import React, { useEffect, useMemo, useState } from "react";
import { Gauge, Users, Receipt, CalendarClock } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PLAN_OPTIONS } from "../lib/plans";

const numberFormat = new Intl.NumberFormat("pt-BR");

function Metric({ label, count, max, icon: Icon }) {
  const unlimited = max === null;
  const percent = unlimited || !max ? 0 : Math.min(100, Math.round((count / max) * 100));
  const remaining = unlimited ? null : Math.max(0, max - count);
  const tone = percent >= 90 ? "danger" : percent >= 75 ? "warning" : "normal";

  return (
    <article className="plan-usage-metric">
      <div className="plan-usage-metric-top">
        <div className="plan-usage-metric-heading">
          <span className="plan-usage-metric-icon"><Icon size={16} aria-hidden="true" /></span>
          <span>{label}</span>
        </div>
        {unlimited ? (
          <span className="plan-usage-unlimited-badge"><span aria-hidden="true">∞</span> Ilimitado</span>
        ) : (
          <span className={`plan-usage-ratio ${tone}`}>{percent}%</span>
        )}
      </div>

      <div className="plan-usage-count">
        <strong>{numberFormat.format(count)}</strong>
        {!unlimited && <span>/ {numberFormat.format(max)}</span>}
        {unlimited && <span>registros</span>}
      </div>

      {unlimited ? (
        <div className="plan-usage-unlimited-note">
          <span aria-hidden="true">∞</span>
          <span>Sem limite de utilização neste plano</span>
        </div>
      ) : (
        <>
          <div
            className={`plan-usage-track ${tone}`}
            role="progressbar"
            aria-label={`${label}: ${count} de ${max}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span style={{ width: percent + "%" }} />
          </div>
          <div className="plan-usage-progress-meta">
            <span>{percent}% do limite utilizado</span>
            <span>{remaining === 0 ? "Limite atingido" : numberFormat.format(remaining) + " disponíveis"}</span>
          </div>
        </>
      )}
    </article>
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
    <section className="plan-usage-card plan-usage-premium" aria-labelledby="plan-usage-title">
      <div className="plan-usage-header">
        <div className="plan-usage-brand">
          <span className="plan-usage-mark"><Gauge size={19} aria-hidden="true" /></span>
          <div className="plan-usage-heading">
            <div className="plan-usage-title-line">
              <h2 id="plan-usage-title">Uso do plano</h2>
              <span className="plan-usage-plan-badge">{plan.title}</span>
            </div>
            <p>Acompanhe o consumo e os limites da sua empresa.</p>
          </div>
        </div>

        <div className="plan-usage-status">
          {expiryLabel && (
            <span className="plan-usage-expiry">
              <CalendarClock size={14} aria-hidden="true" />
              {expiryLabel}
            </span>
          )}
          <span className="plan-usage-sync"><span aria-hidden="true" /> Atualização automática</span>
        </div>
      </div>

      <div className="plan-usage-grid">
        <Metric label="Clientes cadastrados" count={counts.customers} max={plan.maxCustomers} icon={Users} />
        <Metric label="Cobranças no mês" count={counts.charges} max={plan.maxCharges} icon={Receipt} />
      </div>
    </section>
  );
}
