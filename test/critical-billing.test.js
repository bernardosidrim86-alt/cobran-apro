import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { hasFreeTrialAccess, hasPaidSubscriptionAccess } from "../src/lib/subscription-access.js";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");
const extractFunction = (sql, name) => {
  const start = sql.indexOf(`create or replace function ${name}(`);
  assert.notEqual(start, -1, `Function ${name} must exist`);
  const end = sql.indexOf("$function$;", start);
  assert.notEqual(end, -1, `Function ${name} must be complete`);
  return sql.slice(start, end + "$function$;".length);
};

let db;
const tests = [];
const test = (name, run) => tests.push({ name, run });

async function setup() {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema private;
    create table auth.users (id uuid primary key, created_at timestamptz default now());
    create table public.profiles (
      id uuid primary key, company_id uuid, plan text, billing_cycle text,
      subscription_status text, subscription_expires_at timestamptz,
      subscription_provider_sale_code text
    );
    create table public.company_members (
      company_id uuid, user_id uuid, role text, status text
    );
    create table public.subscriptions (
      id uuid default gen_random_uuid() primary key, user_id uuid, company_id uuid,
      provider text, provider_plan_code text, provider_sale_code text unique,
      plan text, billing_cycle text, status text, amount numeric, currency text,
      expires_at timestamptz, last_event_status text, last_event_at timestamptz,
      last_provider_event_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table public.subscription_webhook_events (
      event_key text primary key, provider_sale_code text not null,
      provider_plan_code text, sale_status integer not null, subscription_status text,
      subscription_status_event text, user_id uuid, company_id uuid, plan text,
      billing_cycle text, action text not null, amount numeric,
      currency text default 'BRL', expires_at timestamptz,
      provider_event_at timestamptz, created_at timestamptz default now()
    );
    create table public.charges (
      id uuid primary key, company_id uuid, customer_id uuid, amount numeric,
      payment_method text, status text
    );
    create table public.payments (
      id uuid default gen_random_uuid() primary key, company_id uuid, charge_id uuid,
      customer_id uuid, amount numeric, payment_method text, paid_at timestamptz
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function private.my_company_id() returns uuid language sql stable as
      $$ select company_id from public.profiles where id = auth.uid() $$;
  `);
  const [teamMigration, paymentMigration, orderingMigration] = await Promise.all([
    read("supabase/migrations/20261008043100_company_team_access.sql"),
    read("supabase/migrations/20261008020827_record_charge_payment.sql"),
    read("supabase/migrations/20261008055739_perfectpay_current_sale_ordering.sql"),
  ]);
  await db.exec(extractFunction(teamMigration, "private.has_active_app_access"));
  await db.exec(extractFunction(paymentMigration, "public.apply_perfectpay_webhook_event"));
  const legacyExpiry = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await db.query(
    "insert into profiles(id,company_id,plan,billing_cycle,subscription_status,subscription_expires_at) values ($1,$2,'profissional','monthly','active',$3)",
    ["90000000-0000-4000-8000-000000000001", "90000000-0000-4000-8000-000000000002", legacyExpiry],
  );
  await db.query(
    `insert into subscriptions(user_id,company_id,provider,provider_plan_code,provider_sale_code,plan,billing_cycle,status,amount,currency,expires_at,last_event_status,last_event_at)
     values ($1,$2,'perfectpay','PP-PRO','legacy-current-sale','profissional','monthly','active',99,'BRL',$3,'2',now())`,
    ["90000000-0000-4000-8000-000000000001", "90000000-0000-4000-8000-000000000002", legacyExpiry],
  );
  try {
    await db.exec(orderingMigration);
  } catch (error) {
    throw new Error(`Current-sale migration failed in PGlite: ${error.message}`, { cause: error });
  }
  await db.exec(extractFunction(paymentMigration, "public.record_charge_payment"));
}

const paidExpiry = (days = 30) => new Date(Date.now() + days * 86_400_000).toISOString();
const providerDate = (value) => new Date(value).toISOString();
const userId = "30000000-0000-4000-8000-000000000001";
const companyId = "30000000-0000-4000-8000-000000000002";

test("migration backfills the exact live sale and locks the profile row", async () => {
  assert.equal((await db.query("select subscription_provider_sale_code from profiles where id=$1", ["90000000-0000-4000-8000-000000000001"])).rows[0].subscription_provider_sale_code, "legacy-current-sale");
  const migration = await read("supabase/migrations/20261008055739_perfectpay_current_sale_ordering.sql");
  const applyFunction = extractFunction(migration, "public.apply_perfectpay_webhook_event");
  assert.match(applyFunction, /from public\.profiles p[\s\S]*?for update/i);
  assert.match(applyFunction, /on conflict \(event_key\) do nothing/i);
});

async function addPaidOwner() {
  await db.exec("truncate table public.subscription_webhook_events, public.subscriptions, public.company_members, public.profiles, auth.users");
  await db.query(
    "insert into profiles(id,company_id,plan,billing_cycle,subscription_status,subscription_expires_at) values ($1,$2,'free',null,'inactive',null)",
    [userId, companyId],
  );
  await db.query("insert into auth.users(id) values ($1)", [userId]);
  await db.query("insert into company_members values ($1,$2,'owner','active')", [companyId, userId]);
  await db.exec(`set request.jwt.claim.sub = '${userId}'`);
}

async function applySale({
  key,
  sale,
  action = "activated",
  plan = "business",
  eventAt,
  expiry = paidExpiry(),
  saleStatus,
  recordStatus,
}) {
  const isActivation = action === "activated";
  const subscriptionStatus = action === "revoked" ? "refunded" : action === "cancelled" ? "cancelled" : "active";
  const profilePlan = isActivation || action === "cancelled" ? plan : "free";
  const profileStatus = isActivation ? "active" : action === "cancelled" ? "cancelled" : "refunded";
  const resolvedRecordStatus = recordStatus || (isActivation ? "active" : action === "cancelled" ? "cancelled" : "refunded");
  const result = await db.query(
    `select public.apply_perfectpay_webhook_event(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
    ) as outcome`,
    [
      key, sale, `PP-${plan}`, saleStatus ?? (isActivation ? 2 : action === "cancelled" ? 6 : 7),
      subscriptionStatus, action, userId, plan, "monthly", profilePlan,
      isActivation || action === "cancelled" ? "monthly" : null,
      profileStatus, resolvedRecordStatus, 199.9, expiry, action,
      eventAt ? providerDate(eventAt) : null,
    ],
  );
  return result.rows[0].outcome;
}

test("paid access continues after cancellation until expiry, then expires", async () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(hasPaidSubscriptionAccess({ plan: "essencial", subscription_status: "cancelled", subscription_expires_at: future }), true);
  assert.equal(hasPaidSubscriptionAccess({ plan: "essencial", subscription_status: "cancelled", subscription_expires_at: past }), false);
  assert.equal(hasFreeTrialAccess({ plan: "free", subscription_status: "refunded" }, new Date().toISOString()), false);

  const userId = "00000000-0000-4000-8000-000000000001";
  const companyId = "00000000-0000-4000-8000-000000000002";
  await db.query("insert into auth.users(id) values ($1)", [userId]);
  await db.query("insert into profiles(id,company_id,plan,billing_cycle,subscription_status,subscription_expires_at) values ($1,$2,'business',null,'cancelled',$3)", [userId, companyId, future]);
  await db.query("insert into company_members values ($1,$2,'owner','active')", [companyId, userId]);
  await db.exec(`set request.jwt.claim.sub = '${userId}'`);
  assert.equal((await db.query("select private.has_active_app_access() as allowed")).rows[0].allowed, true);
  await db.query("update profiles set subscription_expires_at = $1 where id = $2", [past, userId]);
  assert.equal((await db.query("select private.has_active_app_access() as allowed")).rows[0].allowed, false);
  await db.query("update profiles set subscription_status = 'refunded', subscription_expires_at = $1 where id = $2", [future, userId]);
  assert.equal((await db.query("select private.has_active_app_access() as allowed")).rows[0].allowed, false);
  await db.query("update profiles set plan = 'free', subscription_status = 'refunded', subscription_expires_at = $1 where id = $2", [future, userId]);
  assert.equal((await db.query("select private.has_active_app_access() as allowed")).rows[0].allowed, false);
});

test("PerfectPay duplicate event is idempotent and stale activation after revocation is ignored", async () => {
  await addPaidOwner();
  await applySale({ key: "terminal-initial", sale: "sale-terminal-1", eventAt: "2026-10-01T10:00:00Z" });
  assert.equal(await applySale({ key: "cancel-1", sale: "sale-terminal-1", action: "revoked" }), "applied");
  assert.equal(await applySale({ key: "cancel-1", sale: "sale-terminal-1", action: "revoked" }), "duplicate");
  assert.equal(await applySale({ key: "stale-approval-1", sale: "sale-terminal-1", eventAt: "2026-10-01T10:00:00Z" }), "out_of_order");
  assert.deepEqual((await db.query("select plan, subscription_status from profiles where id=$1", [userId])).rows[0], { plan: "free", subscription_status: "refunded" });
  assert.equal((await db.query("select count(*)::int as count from subscriptions where provider_sale_code='sale-terminal-1'")).rows[0].count, 1);
});

test("new sale B stays current when delayed cancellation/refund of A arrives", async () => {
  await addPaidOwner();
  const expiryA = paidExpiry(30);
  const expiryB = paidExpiry(60);
  assert.equal(await applySale({ key: "sale-a-approved", sale: "sale-A", eventAt: "2026-10-01T10:00:00Z", expiry: expiryA }), "applied");
  assert.equal(await applySale({ key: "sale-b-approved", sale: "sale-B", eventAt: "2026-10-02T10:00:00Z", expiry: expiryB }), "applied");
  assert.equal(await applySale({ key: "sale-a-refund-late", sale: "sale-A", action: "revoked", eventAt: "2026-10-01T10:00:00Z" }), "stale_sale");
  assert.deepEqual((await db.query("select plan,subscription_status,subscription_provider_sale_code from profiles where id=$1", [userId])).rows[0], {
    plan: "business", subscription_status: "active", subscription_provider_sale_code: "sale-B",
  });
  assert.equal((await db.query("select private.has_active_app_access() as allowed")).rows[0].allowed, true);
  assert.equal((await db.query("select status from subscriptions where provider_sale_code='sale-A'")).rows[0].status, "refunded");
  assert.equal((await db.query("select status from subscriptions where provider_sale_code='sale-B'")).rows[0].status, "active");
});

test("late approval of old sale A cannot replace newer sale B", async () => {
  await addPaidOwner();
  assert.equal(await applySale({ key: "old-a-active", sale: "sale-A", eventAt: "2026-10-01T10:00:00Z" }), "applied");
  assert.equal(await applySale({ key: "new-b-active", sale: "sale-B", plan: "profissional", eventAt: "2026-10-02T10:00:00Z" }), "applied");
  assert.equal(await applySale({ key: "old-a-approval-late", sale: "sale-A", eventAt: "2026-10-01T10:00:00Z", expiry: paidExpiry(90) }), "out_of_order");
  assert.deepEqual((await db.query("select plan,subscription_provider_sale_code from profiles where id=$1", [userId])).rows[0], {
    plan: "profissional", subscription_provider_sale_code: "sale-B",
  });
  assert.equal((await db.query("select private.has_active_app_access() as allowed")).rows[0].allowed, true);
  const expired = new Date(Date.now() - 60_000).toISOString();
  await db.query("update profiles set subscription_expires_at=$1 where id=$2", [expired, userId]);
  assert.equal(await applySale({ key: "old-a-after-b-expired", sale: "sale-A", eventAt: "2026-10-01T10:00:00Z", expiry: paidExpiry(90) }), "out_of_order");
  const expiredProfile = (await db.query("select plan,subscription_provider_sale_code,subscription_expires_at from profiles where id=$1", [userId])).rows[0];
  assert.equal(expiredProfile.plan, "profissional");
  assert.equal(expiredProfile.subscription_provider_sale_code, "sale-B");
  assert.equal(new Date(expiredProfile.subscription_expires_at).toISOString(), expired);
});

test("different events for one sale serialize and terminal revocation wins", async () => {
  await addPaidOwner();
  await applySale({ key: "race-initial", sale: "sale-race", eventAt: "2026-10-01T10:00:00Z" });
  const expiry = paidExpiry(45);
  const results = await Promise.all([
    applySale({ key: "race-approval", sale: "sale-race", eventAt: "2026-10-02T10:00:00Z", expiry }),
    applySale({ key: "race-cancel", sale: "sale-race", action: "cancelled" }),
  ]);
  assert.deepEqual(results.sort(), ["applied", "applied"]);
  assert.equal((await db.query("select subscription_status from profiles where id=$1", [userId])).rows[0].subscription_status, "cancelled");
  assert.equal((await db.query("select status from subscriptions where provider_sale_code='sale-race'")).rows[0].status, "cancelled");
  assert.equal((await db.query("select private.has_active_app_access() as allowed")).rows[0].allowed, true);
});

test("refund and approval cannot race into reactivating the same sale", async () => {
  await addPaidOwner();
  await applySale({ key: "refund-race-initial", sale: "sale-refund-race", eventAt: "2026-10-01T10:00:00Z" });
  const results = await Promise.all([
    applySale({ key: "refund-race-approval", sale: "sale-refund-race", eventAt: "2026-10-02T10:00:00Z" }),
    applySale({ key: "refund-race-refund", sale: "sale-refund-race", action: "revoked" }),
  ]);
  assert.deepEqual(results.sort(), ["applied", "applied"]);
  assert.equal((await db.query("select subscription_status from profiles where id=$1", [userId])).rows[0].subscription_status, "refunded");
  assert.equal((await db.query("select private.has_active_app_access() as allowed")).rows[0].allowed, false);
});

test("same event delivered in parallel is applied once", async () => {
  await addPaidOwner();
  const args = { key: "same-event-parallel", sale: "sale-parallel", eventAt: "2026-10-01T10:00:00Z" };
  const results = await Promise.all([applySale(args), applySale(args)]);
  assert.deepEqual(results.sort(), ["applied", "duplicate"]);
  assert.equal((await db.query("select count(*)::int as count from subscription_webhook_events where event_key=$1", [args.key])).rows[0].count, 1);
  assert.equal((await db.query("select count(*)::int as count from subscriptions where provider_sale_code=$1", [args.sale])).rows[0].count, 1);
});

test("new purchase and plan switch supersede a cancelled sale without old-sale rollback", async () => {
  await addPaidOwner();
  assert.equal(await applySale({ key: "cancelled-plan-a", sale: "sale-A", plan: "essencial", eventAt: "2026-10-01T10:00:00Z" }), "applied");
  assert.equal(await applySale({ key: "cancel-plan-a", sale: "sale-A", action: "cancelled" }), "applied");
  assert.equal(await applySale({ key: "new-plan-b", sale: "sale-B", plan: "business", eventAt: "2026-10-02T10:00:00Z" }), "applied");
  assert.equal(await applySale({ key: "old-plan-a-refund", sale: "sale-A", action: "revoked" }), "stale_sale");
  assert.deepEqual((await db.query("select plan,subscription_status,subscription_provider_sale_code from profiles where id=$1", [userId])).rows[0], {
    plan: "business", subscription_status: "active", subscription_provider_sale_code: "sale-B",
  });
  assert.equal((await db.query("select private.has_active_app_access() as allowed")).rows[0].allowed, true);
  const history = (await db.query("select provider_sale_code,status from subscriptions order by provider_sale_code")).rows;
  assert.deepEqual(history, [
    { provider_sale_code: "sale-A", status: "refunded" },
    { provider_sale_code: "sale-B", status: "active" },
  ]);
});

test("record_charge_payment rejects a duplicate payment", async () => {
  const userId = "20000000-0000-4000-8000-000000000001";
  const companyId = "20000000-0000-4000-8000-000000000002";
  const chargeId = "20000000-0000-4000-8000-000000000003";
  await db.query("insert into profiles(id,company_id,plan,billing_cycle,subscription_status,subscription_expires_at) values ($1,$2,'free',null,'inactive',null)", [userId, companyId]);
  await db.query("insert into charges values ($1,$2,$3,123.45,'pix','pending')", [chargeId, companyId, userId]);
  await db.exec(`set request.jwt.claim.sub = '${userId}'`);
  await db.query("select public.record_charge_payment($1)", [chargeId]);
  await assert.rejects(db.query("select public.record_charge_payment($1)", [chargeId]), /charge_not_pending/);
  assert.equal((await db.query("select count(*)::int as count from payments where charge_id=$1", [chargeId])).rows[0].count, 1);
});

await setup();
let failures = 0;
for (const { name, run } of tests) {
  try {
    await run();
    process.stdout.write(`✓ ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(`✗ ${name}\n${error.stack || error}\n`);
  }
}
await db.close();
if (failures) process.exitCode = 1;
