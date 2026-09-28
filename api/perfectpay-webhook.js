import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PERFECTPAY_WEBHOOK_TOKEN = process.env.PERFECTPAY_WEBHOOK_TOKEN;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PLANS = [
  {
    key: "essencial",
    monthly: 49.9,
    annual: 478.8,
    monthlyPlanCode: "PPLQQQJT2",
    annualPlanCode: "PPLQQQJT7",
    daysMonthly: 30,
    daysAnnual: 365,
  },
  {
    key: "profissional",
    monthly: 99.9,
    annual: 958.8,
    monthlyPlanCode: "PPLQQQJT3",
    annualPlanCode: "PPLQQQJTA",
    daysMonthly: 30,
    daysAnnual: 365,
  },
  {
    key: "business",
    monthly: 199.9,
    annual: 1918.8,
    monthlyPlanCode: "PPLQQQJT4",
    annualPlanCode: "PPLQQQJTC",
    daysMonthly: 30,
    daysAnnual: 365,
  },
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
  const planCode = String(payload?.plan?.code || "").trim();
  const name = normalize(payload?.plan?.name);
  const amount = Number(payload?.sale_amount);

  // Prefer the unique Perfect Pay plan code.
  // This avoids relying on the plan name or price when the code is available.
  for (const plan of PLANS) {
    if (planCode === plan.monthlyPlanCode) {
      return { ...plan, cycle: "monthly" };
    }

    if (planCode === plan.annualPlanCode) {
      return { ...plan, cycle: "annual" };
    }
  }

  // Fallback for older/unusual webhook payloads.
  for (const plan of PLANS) {
    if (name.includes(plan.key)) {
      if (amountMatches(amount, plan.monthly)) {
        return { ...plan, cycle: "monthly" };
      }

      if (amountMatches(amount, plan.annual)) {
        return { ...plan, cycle: "annual" };
      }

      return null;
    }
  }

  // Final fallback by amount only.
  for (const plan of PLANS) {
    if (amountMatches(amount, plan.monthly)) {
      return { ...plan, cycle: "monthly" };
    }

    if (amountMatches(amount, plan.annual)) {
      return { ...plan, cycle: "annual" };
    }
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
    const metadataIdentifier = String(
      payload?.metadata?.utm_content ||
      payload?.metadata?.src ||
      ""
    ).trim();

    const approved = [2, 8, 10].includes(status);
    const revoked = [5, 6, 7, 9, 13].includes(status);
    const saleCode = String(payload?.code || "").trim();

    if (!saleCode) {
      return res.status(400).json({ ok: false, error: "missing_sale_code" });
    }

    if (!approved && !revoked) {
      return res.status(200).json({ ok: true, ignored: true, status });
    }

    let user = null;

    // Prefer the CobrançaPro account identifier sent through Perfect Pay metadata.
    if (
      metadataIdentifier &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        metadataIdentifier
      )
    ) {
      const { data: linkedUserData, error: linkedUserError } =
        await supabaseAdmin.auth.admin.getUserById(metadataIdentifier);

      if (linkedUserError) {
        console.error("Erro ao localizar usuário pelo metadata:", linkedUserError);
      } else {
        user = linkedUserData?.user || null;
      }
    }

    // Backward-compatible fallback for purchases without the account identifier.
    if (!user && email) {
      const { data: usersData, error: usersError } =
        await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

      if (usersError) throw usersError;

      user = usersData.users.find(
        (item) => String(item.email || "").toLowerCase() === email
      );
    }

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "user_not_found",
        email: email || null,
        metadata_identifier: metadataIdentifier || null,
      });
    }

    const { data: currentProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("plan, subscription_status, subscription_expires_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (revoked) {
      // Never revoke a newer/different paid plan because an old Perfect Pay
      // transaction changed state later.
      const incomingPlan = detectPlan(payload);

      if (
        incomingPlan &&
        currentProfile?.plan &&
        currentProfile.plan !== "free" &&
        currentProfile.plan !== incomingPlan.key
      ) {
        return res.status(200).json({
          ok: true,
          ignored: true,
          reason: "revocation_for_different_plan",
        });
      }

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
        plan_code: payload?.plan?.code || null,
        plan_name: payload?.plan?.name || null,
        sale_amount: payload?.sale_amount || null,
      });
    }

    const planRank = {
      free: 0,
      essencial: 1,
      profissional: 2,
      business: 3,
    };

    const currentPlanKey = String(currentProfile?.plan || "free");
    const currentExpiresAt = currentProfile?.subscription_expires_at
      ? new Date(currentProfile.subscription_expires_at)
      : null;
    const currentIsActive =
      currentProfile?.subscription_status === "active" &&
      currentExpiresAt &&
      currentExpiresAt > new Date();

    // An older webhook for a cheaper plan must not downgrade an active
    // subscription purchased later.
    if (
      currentIsActive &&
      (planRank[plan.key] ?? 0) < (planRank[currentPlanKey] ?? 0)
    ) {
      return res.status(200).json({
        ok: true,
        ignored: true,
        reason: "older_lower_plan",
      });
    }

    // Perfect Pay can send both "approved" and "completed" for the same sale.
    // Once an active subscription exists, a later "completed" event must not
    // grant another billing period.
    if (status === 10 && currentIsActive) {
      return res.status(200).json({
        ok: true,
        ignored: true,
        reason: "completed_already_active",
      });
    }

    const now = new Date();
    const baseDate =
      currentIsActive && currentPlanKey === plan.key && currentExpiresAt
        ? currentExpiresAt
        : now;

    const expiresAt = addDays(
      baseDate,
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
