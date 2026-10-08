import { createClient } from "@supabase/supabase-js";
import { hasPaidSubscriptionAccess } from "../src/lib/subscription-access.js";

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

  for (const plan of PLANS) {
    if (planCode === plan.monthlyPlanCode) {
      return { ...plan, cycle: "monthly" };
    }

    if (planCode === plan.annualPlanCode) {
      return { ...plan, cycle: "annual" };
    }
  }

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

async function findUserByEmail(email) {
  if (!email) return null;

  const perPage = 1000;
  let page = 1;

  while (page <= 100) {
    const { data: usersData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (usersError) throw usersError;

    const user = usersData.users.find(
      (item) => String(item.email || "").toLowerCase() === email
    );

    if (user) return user;

    if (usersData.users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function findUserByMetadata(metadataIdentifier) {
  if (
    !metadataIdentifier ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      metadataIdentifier
    )
  ) {
    return null;
  }

  const { data: linkedUserData, error: linkedUserError } =
    await supabaseAdmin.auth.admin.getUserById(metadataIdentifier);

  if (linkedUserError) {
    console.error("Erro ao localizar usuário pelo metadata:", linkedUserError);
    return null;
  }

  return linkedUserData?.user || null;
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

    let supabaseProjectHost = null;
    try {
      supabaseProjectHost = new URL(SUPABASE_URL).host;
    } catch {
      supabaseProjectHost = "invalid_url";
    }

    console.log("PerfectPay webhook diagnostic", {
      sale_code: String(payload?.code || "").trim() || null,
      sale_status_enum: Number.isFinite(status) ? status : null,
      sale_status_enum_key: payload?.sale_status_enum_key || null,
      sale_status_detail: payload?.sale_status_detail || null,
      plan_code: payload?.plan?.code || null,
      plan_name: payload?.plan?.name || null,
      subscription_code: payload?.subscription?.code || null,
      subscription_status: payload?.subscription?.status || null,
      subscription_status_event: payload?.subscription?.status_event || null,
      subscription_next_charge_date: payload?.subscription?.next_charge_date || null,
      email_present: Boolean(email),
      metadata_uuid_present: Boolean(metadataIdentifier),
      supabase_project_host: supabaseProjectHost,
    });

    const subscriptionStatus = normalize(payload?.subscription?.status);
    const subscriptionStatusEvent = normalize(payload?.subscription?.status_event);

    const subscriptionRevoked =
      /cancelad|cancell|expired|vencid|inativ/.test(subscriptionStatus) ||
      /cancelad|cancell|expired|vencid|inativ/.test(subscriptionStatusEvent);

    const approved = [2, 8, 10].includes(status);
    const revoked = [5, 6, 7, 9, 13].includes(status) || subscriptionRevoked;
    const saleCode = String(payload?.code || "").trim();

    if (!saleCode) {
      return res.status(400).json({ ok: false, error: "missing_sale_code" });
    }

    if (!approved && !revoked) {
      return res.status(200).json({ ok: true, ignored: true, status });
    }

    // Always prefer the current account found by the Perfect Pay customer email.
    // This prevents an old/deleted CobrançaPro UUID in metadata from selecting
    // the wrong user after the database was rebuilt.
    let user = await findUserByEmail(email);
    let userResolution = user ? "email" : null;

    // Metadata remains a fallback for legacy payloads that do not contain the
    // buyer email.
    if (!user) {
      user = await findUserByMetadata(metadataIdentifier);
      userResolution = user ? "metadata" : null;
    }

    console.log("PerfectPay webhook user resolution", {
      resolution: userResolution,
      user_found: Boolean(user),
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "user_not_found",
        email_present: Boolean(email),
        metadata_uuid_present: Boolean(metadataIdentifier),
      });
    }

    const { data: currentProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, plan, billing_cycle, subscription_status, subscription_expires_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    console.log("PerfectPay webhook profile lookup", {
      profile_found: Boolean(currentProfile),
      current_plan: currentProfile?.plan || null,
      current_status: currentProfile?.subscription_status || null,
      user_resolution: userResolution,
    });

    if (!currentProfile) {
      return res.status(500).json({
        ok: false,
        error: "profile_not_found",
      });
    }

    const eventKey = JSON.stringify([
      saleCode,
      status,
      subscriptionStatus.slice(0, 120),
      subscriptionStatusEvent.slice(0, 120),
      String(payload?.subscription?.next_charge_date || "").slice(0, 80),
    ]);
    const numericAmount = Number(payload?.sale_amount);
    const saleAmount = Number.isFinite(numericAmount) ? numericAmount : null;

    async function recordEvent({
      action,
      eventPlan = currentProfile.plan || null,
      eventBillingCycle = currentProfile.billing_cycle || null,
      profilePlan = currentProfile.plan || "free",
      profileBillingCycle = currentProfile.billing_cycle || null,
      profileStatus = currentProfile.subscription_status || "inactive",
      recordStatus = "cancelled",
      expiresAt = currentProfile.subscription_expires_at || null,
    }) {
      const { data, error } = await supabaseAdmin.rpc("apply_perfectpay_webhook_event", {
        p_event_key: eventKey,
        p_provider_sale_code: saleCode,
        p_provider_plan_code: String(payload?.plan?.code || "").trim().slice(0, 120) || null,
        p_sale_status: status,
        p_subscription_status: subscriptionStatus || null,
        p_subscription_status_event: subscriptionStatusEvent || null,
        p_user_id: user.id,
        p_event_plan: eventPlan,
        p_event_billing_cycle: eventBillingCycle,
        p_profile_plan: profilePlan,
        p_profile_billing_cycle: profileBillingCycle,
        p_profile_status: profileStatus,
        p_subscription_record_status: recordStatus,
        p_amount: saleAmount,
        p_expires_at: expiresAt,
        p_action: action,
      });
      if (error) throw error;
      return data;
    }

    function eventOutcomeResponse(outcome) {
      if (outcome === "applied") return null;
      if (outcome === "out_of_order") {
        return res.status(200).json({ ok: true, ignored: true, reason: "out_of_order_event" });
      }
      return res.status(200).json({ ok: true, ignored: true, reason: "duplicate_event" });
    }

    if (revoked) {
      const cancellationKeepsAccess =
        subscriptionRevoked && [2, 8, 10].includes(status);

      const incomingPlan = detectPlan(payload);

      if (
        incomingPlan &&
        currentProfile?.plan &&
        currentProfile.plan !== "free" &&
        currentProfile.plan !== incomingPlan.key
      ) {
        const recorded = await recordEvent({
          action: "ignored",
          eventPlan: incomingPlan.key,
          eventBillingCycle: incomingPlan.cycle,
        });
        const outcomeResponse = eventOutcomeResponse(recorded);
        if (outcomeResponse) return outcomeResponse;
        return res.status(200).json({
          ok: true,
          ignored: true,
          reason: "revocation_for_different_plan",
        });
      }

      const profilePlan = cancellationKeepsAccess
        ? currentProfile.plan || incomingPlan?.key || "free"
        : "free";
      const profileCycle = cancellationKeepsAccess
        ? currentProfile.billing_cycle || incomingPlan?.cycle || null
        : null;
      const expiresAt = cancellationKeepsAccess
        ? currentProfile.subscription_expires_at
        : new Date().toISOString();
      const subscriptionText = normalize(
        String(payload?.subscription?.status || "") + " " +
        String(payload?.subscription?.status_event || "")
      );
      const recordStatus = /refund|reembols/.test(subscriptionText)
        ? "refunded"
        : /expired|vencid/.test(subscriptionText)
          ? "expired"
          : "cancelled";
      const action = cancellationKeepsAccess ? "cancelled" : "revoked";
      const recorded = await recordEvent({
        action,
        eventPlan: incomingPlan?.key || currentProfile.plan || null,
        eventBillingCycle: incomingPlan?.cycle || currentProfile.billing_cycle || null,
        profilePlan,
        profileBillingCycle: profileCycle,
        profileStatus: "cancelled",
        recordStatus,
        expiresAt,
      });
      const outcomeResponse = eventOutcomeResponse(recorded);
      if (outcomeResponse) return outcomeResponse;

      const updatedProfile = {
        id: user.id,
        plan: profilePlan,
        subscription_status: "cancelled",
        subscription_expires_at: expiresAt,
      };

      console.log("PerfectPay webhook update", {
        action: cancellationKeepsAccess
          ? "subscription_cancelled_until_expiration"
          : "subscription_revoked",
        plan: updatedProfile.plan,
        status: updatedProfile.subscription_status,
      });

      return res.status(200).json({
        ok: true,
        action: cancellationKeepsAccess
          ? "subscription_cancelled_until_expiration"
          : "subscription_revoked",
      });
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
    const currentIsActive = hasPaidSubscriptionAccess(currentProfile);

    if (
      currentIsActive &&
      (planRank[plan.key] ?? 0) < (planRank[currentPlanKey] ?? 0)
    ) {
      const recorded = await recordEvent({
        action: "ignored",
        eventPlan: plan.key,
        eventBillingCycle: plan.cycle,
      });
      const outcomeResponse = eventOutcomeResponse(recorded);
      if (outcomeResponse) return outcomeResponse;
      return res.status(200).json({
        ok: true,
        ignored: true,
        reason: "older_lower_plan",
      });
    }

    const now = new Date();
    const nextChargeDate = payload?.subscription?.next_charge_date
      ? new Date(payload.subscription.next_charge_date)
      : null;

    const hasValidNextChargeDate =
      nextChargeDate && !Number.isNaN(nextChargeDate.getTime()) && nextChargeDate > now;

    if (
      status === 10 &&
      currentIsActive &&
      !(
        hasValidNextChargeDate &&
        (!currentExpiresAt || nextChargeDate > currentExpiresAt)
      )
    ) {
      const recorded = await recordEvent({
        action: "ignored",
        eventPlan: plan.key,
        eventBillingCycle: plan.cycle,
      });
      const outcomeResponse = eventOutcomeResponse(recorded);
      if (outcomeResponse) return outcomeResponse;
      return res.status(200).json({
        ok: true,
        ignored: true,
        reason: "completed_already_active",
      });
    }

    const baseDate =
      hasValidNextChargeDate
        ? nextChargeDate
        : currentIsActive && currentPlanKey === plan.key && currentExpiresAt
          ? currentExpiresAt
          : now;

    const expiresAt = hasValidNextChargeDate
      ? nextChargeDate.toISOString()
      : addDays(
          baseDate,
          plan.cycle === "annual" ? plan.daysAnnual : plan.daysMonthly
        );

    const recorded = await recordEvent({
      action: "activated",
      eventPlan: plan.key,
      eventBillingCycle: plan.cycle,
      profilePlan: plan.key,
      profileBillingCycle: plan.cycle,
      profileStatus: "active",
      recordStatus: "active",
      expiresAt,
    });
    const outcomeResponse = eventOutcomeResponse(recorded);
    if (outcomeResponse) return outcomeResponse;

    const updatedProfile = {
      id: user.id,
      plan: plan.key,
      billing_cycle: plan.cycle,
      subscription_status: "active",
      subscription_expires_at: expiresAt,
    };

    console.log("PerfectPay webhook update", {
      action: "subscription_activated",
      plan: updatedProfile.plan,
      billing_cycle: updatedProfile.billing_cycle,
      status: updatedProfile.subscription_status,
    });

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
