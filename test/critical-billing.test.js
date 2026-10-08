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
    create schema auth;
    create schema private;
    create table auth.users (id uuid primary key, created_at timestamptz default now());
    create table public.profiles (
      id uuid primary key, company_id uuid, plan text, billing_cycle text,
      subscription_status text, subscription_expires_at timestamptz
    );
    create table public.company_members (
      company_id uuid, user_id uuid, role text, status text
    );
    create table public.subscriptions (
      id uuid default gen_random_uuid() primary key, user_id uuid, company_id uuid,
      provider text, provider_plan_code text, provider_sale_code text unique,
      plan text, billing_cycle text, status text, amount numeric, currency text,
      expires_at timestamptz, last_event_status text, last_event_at timestamptz,
      updated_at timestamptz default now()
    );
    create table public.subscription_webhook_events (
      event_key text primary key, provider_sale_code text not null,
      provider_plan_code text, sale_status integer not null, subscription_status text,
      subscription_status_event text, user_id uuid, company_id uuid, plan text,
      billing_cycle text, action text not null, amount numeric,
      currency text default 'BRL', expires_at timestamptz, created_at timestamptz default now()
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
  const [teamMigration, paymentMigration] = await Promise.all([
    read("supabase/migrations/20261008043100_company_team_access.sql"),
    read("supabase/migrations/20261008020827_record_charge_payment.sql"),
  ]);
  await db.exec(extractFunction(teamMigration, "private.has_active_app_access"));
  await db.exec(extractFunction(paymentMigration, "public.apply_perfectpay_webhook_event"));
  await db.exec(extractFunction(paymentMigration, "public.record_charge_payment"));
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
  await db.query("insert into profiles values ($1,$2,'business',null,'cancelled',$3)", [userId, companyId, future]);
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
  const userId = "10000000-0000-4000-8000-000000000001";
  const companyId = "10000000-0000-4000-8000-000000000002";
  await db.query("insert into profiles values ($1,$2,'free',null,'inactive',null)", [userId, companyId]);
  const apply = (eventKey, action, profileStatus, recordStatus, expiry) => db.query(
    `select public.apply_perfectpay_webhook_event(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
    ) as outcome`,
    [eventKey, "sale-terminal-1", "PP-BIZ", action === "activated" ? 2 : 9,
      action === "activated" ? "active" : "cancelled", action, userId,
      "business", "monthly", action === "activated" ? "business" : "free",
      action === "activated" ? "monthly" : null, profileStatus, recordStatus,
      199.9, expiry, action],
  );
  const expiry = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal((await apply("cancel-1", "revoked", "refunded", "refunded", new Date().toISOString())).rows[0].outcome, "applied");
  assert.equal((await apply("cancel-1", "revoked", "refunded", "refunded", new Date().toISOString())).rows[0].outcome, "duplicate");
  assert.equal((await apply("stale-approval-1", "activated", "active", "active", expiry)).rows[0].outcome, "out_of_order");
  assert.deepEqual((await db.query("select plan, subscription_status from profiles where id=$1", [userId])).rows[0], { plan: "free", subscription_status: "refunded" });
  assert.equal((await db.query("select count(*)::int as count from subscriptions where provider_sale_code='sale-terminal-1'")).rows[0].count, 1);
});

test("record_charge_payment rejects a duplicate payment", async () => {
  const userId = "20000000-0000-4000-8000-000000000001";
  const companyId = "20000000-0000-4000-8000-000000000002";
  const chargeId = "20000000-0000-4000-8000-000000000003";
  await db.query("insert into profiles values ($1,$2,'free',null,'inactive',null)", [userId, companyId]);
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
