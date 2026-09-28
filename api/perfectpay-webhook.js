import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PERFECTPAY_WEBHOOK_TOKEN = process.env.PERFECTPAY_WEBHOOK_TOKEN;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PLANS = [
  { key: "essencial", monthly: 49.9, annual: 478.8, daysMonthly: 30, daysAnnual: 365 },
  { key: "profissional", monthly: 99.9, annual: 958.8, daysMonthly: 30, daysAnnual: 365 },
  { key: "business", monthly: 199.9, annual: 1918.8, daysMonthly: 30, daysAnnual: 365 },
];

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function amountMatches(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.01;
}

function detectPlan(payload) {
  const name = normalize(payload?.plan?.name);
  const amount = Number(payload?.sale_amount);

  for (const plan of PLANS) {
    if (name.includes(plan.key)) {
      if (amountMatches(amount, plan.monthly)) return { ...plan, cycle: "monthly" };
      if (amountMatches(amount, plan.annual)) return { ...plan, cycle: "annual" };
      return { ...plan, cycle: amountMatches(amount, plan.annual) ? "annual" : "monthly" };
    }
  }

  for (const plan of PLANS) {
    if (amountMatches(amount, plan.monthly)) return { ...plan, cycle: "monthly" };
    if (amountMatches(amount, plan.annual)) return { ...plan, cycle: "annual" };
  }

  return null;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString();
}

function getCustomerEmail(payload) {
  return String(payload?.customer?.email || payload?.customer_email || "")
    .trim()
    .toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PERFECTPAY_WEBHOOK_TOKEN) {
    console.error("Webhook env vars ausentes.");
    return res.status(500).json({ ok: false, error: "webhook_not_configured" });
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const token = String(payload?.token || "");

    if (!token || token !== PERFECTPAY_WEBHOOK_TOKEN) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const status = Number(payload?.sale_status_enum);
    const email = getCustomerEmail(payload);

    if (!email) {
      return res.status(400).json({ ok: false, error: "customer_email_missing" });
    }

    const approved = [2, 8, 10].includes(status);
    const revoked = [5, 6, 7, 9, 13].includes(status);

    if (!approved && !revoked) {
      return res.status(200).json({ ok: true, ignored: true, status });
    }

    const { data: usersData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (usersError) throw usersError;

    const user = usersData.users.find(
      (item) => String(item.email || "").toLowerCase() === email
    );

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "user_not_found",
        email,
      });
    }

    if (revoked) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          plan: "free",
          billing_cycle: null,
          subscription_status: "cancelled",
          subscription_expires_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      return res.status(200).json({ ok: true, action: "subscription_revoked" });
    }

    const plan = detectPlan(payload);

    if (!plan) {
      return res.status(400).json({
        ok: false,
        error: "plan_not_recognized",
        plan_name: payload?.plan?.name || null,
        sale_amount: payload?.sale_amount || null,
      });
    }

    const now = new Date();
    const expiresAt = addDays(
      now,
      plan.cycle === "annual" ? plan.daysAnnual : plan.daysMonthly
    );

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        plan: plan.key,
        billing_cycle: plan.cycle,
        subscription_status: "active",
        subscription_expires_at: expiresAt,
      })
      .eq("id", user.id);

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      action: "subscription_activated",
      plan: plan.key,
      billing_cycle: plan.cycle,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error("PerfectPay webhook error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
