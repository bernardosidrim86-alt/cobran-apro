const PAID_ACCESS_STATUSES = new Set(["active", "cancelled"]);

export function hasPaidSubscriptionAccess(profile, now = Date.now()) {
  if (!profile || !["essencial", "profissional", "business"].includes(profile.plan)) {
    return false;
  }

  if (!PAID_ACCESS_STATUSES.has(profile.subscription_status)) return false;

  const expiresAt = Date.parse(profile.subscription_expires_at || "");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(expiresAt) && Number.isFinite(nowMs) && expiresAt > nowMs;
}

export function hasFreeTrialAccess(profile, userCreatedAt, now = Date.now()) {
  if (!profile || profile.plan !== "free" || !["inactive", "pending"].includes(profile.subscription_status)) return false;
  const createdAt = Date.parse(userCreatedAt || "");
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(createdAt) && Number.isFinite(nowMs) && createdAt + 7 * 24 * 60 * 60 * 1000 > nowMs;
}
