const { createClient } = require("@supabase/supabase-js");

const PLAN_MAP = {
  PPLQQQJT2: { plan: "essencial", billing_cycle: "monthly" },
  PPLQQQJT7: { plan: "essencial", billing_cycle: "annual" },
  PPLQQQJT3: { plan: "profissional", billing_cycle: "monthly" },
  PPLQQQJTA: { plan: "profissional", billing_cycle: "annual" },
  PPLQQQJT4: { plan: "business", billing_cycle: "monthly" },
  PPLQQQJTC: { plan: "business", billing_cycle: "annual" },
};

function pick(obj, paths) {
  for (const path of paths) {
    let value = obj;
    for (const key of path.split(".")) value = value?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function normalizeStatus(payload) {
  const raw = String(
    pick(payload, [
      "sale_status_enum",
      "sale_status",
      "status",
      "event",
      "type",
    ]) || ""
  ).toLowerCase();

  if (raw.includes("refund") || raw.includes("reembols") || raw.includes("refunded")) return "refunded";
  if (raw.includes("cancel")) return "cancelled";
  if (raw.includes("pend")) return "pending";
  if (raw.includes("reject") || raw.includes("recus")) return "pending";
  if (raw.includes("approv") || raw.includes("approved") || raw.includes("paid") || raw.includes("pago")) return "active";
  return "pending";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    const planCode = String(
      pick(payload, [
        "plan.code",
        "product.plan.code",
        "sale.plan.code",
      ]) || ""
    ).toUpperCase();

    const mapped = PLAN_MAP[planCode];
    if (!mapped) {
      return res.status(400).json({ error: "Plano Perfect Pay não reconhecido", planCode });
    }

    const email = String(
      pick(payload, [
        "customer.email",
        "buyer.email",
        "email",
        "customer_email",
      ]) || ""
    ).trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "E-mail do cliente não encontrado" });
    }

    const saleCode = String(
      pick(payload, [
        "sale_code",
        "sale.code",
        "transaction_id",
        "id",
      ]) || ""
    );

    const amount = Number(
      pick(payload, [
        "sale_amount",
        "amount",
        "price",
        "transaction_amount",
      ]) || 0
    ) || null;

    const status = normalizeStatus(payload);

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: "Supabase server environment variables are missing" });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, company_id")
      .ilike("email", email)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
      return res.status(200).json({
        ok: true,
        message: "Webhook recebido, mas usuário ainda não encontrado",
        email,
      });
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + (mapped.billing_cycle === "annual" ? 12 : 1));

    const subscription = {
      user_id: profile.id,
      company_id: profile.company_id,
      provider: "perfectpay",
      provider_plan_code: planCode,
      provider_sale_code: saleCode || null,
      plan: mapped.plan,
      billing_cycle: mapped.billing_cycle,
      status,
      amount,
      currency: "BRL",
      customer_email: email,
      expires_at: expiresAt.toISOString(),
      last_event_status: status,
      last_event_at: now.toISOString(),
      raw_payload: payload,
      updated_at: now.toISOString(),
    };

    const { error: subError } = await supabase
      .from("subscriptions")
      .upsert(subscription, {
        onConflict: "provider_sale_code",
      });

    if (subError) throw subError;

    const profileUpdate = {
      plan: status === "active" ? mapped.plan : "free",
      billing_cycle: status === "active" ? mapped.billing_cycle : null,
      subscription_status: status,
      subscription_expires_at: status === "active" ? expiresAt.toISOString() : null,
      updated_at: now.toISOString(),
    };

    const { error: updateError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", profile.id);

    if (updateError) throw updateError;

    return res.status(200).json({
      ok: true,
      plan: mapped.plan,
      billing_cycle: mapped.billing_cycle,
      status,
    });
  } catch (error) {
    console.error("Perfect Pay webhook error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};
