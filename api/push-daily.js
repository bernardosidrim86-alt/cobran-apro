import {
  createAdminClient,
  sendToSubscriptionRows,
  jsonError,
} from "./_lib/push.js";

function saoPauloDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return jsonError(res, 405, "Método não permitido.");

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== "Bearer " + cronSecret) {
    return jsonError(res, 401, "Não autorizado.");
  }

  try {
    const admin = createAdminClient();
    await admin.from("push_delivery_log").delete().lt("created_at", new Date(Date.now() - 90 * 86400000).toISOString());
    const today = saoPauloDate();
    const tomorrow = addDate(today, 1);
    const yesterday = addDate(today, -1);
    const startOfYesterday = new Date(yesterday + "T00:00:00-03:00").toISOString();
    const startOfToday = new Date(today + "T00:00:00-03:00").toISOString();
    const eventKey = "daily:" + today;

    const { data: subscriptions, error: subscriptionError } = await admin
      .from("push_subscriptions")
      .select("id,user_id,subscription,notify_payments,notify_due,notify_overdue")
      .or("notify_payments.eq.true,notify_due.eq.true,notify_overdue.eq.true");

    if (subscriptionError) throw subscriptionError;
    if (!subscriptions?.length) return res.status(200).json({ ok: true, users: 0, sent: 0 });

    const userIds = [...new Set(subscriptions.map(item => item.user_id))];
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id,company_id")
      .in("id", userIds);

    if (profileError) throw profileError;

    const companyByUser = new Map((profiles || []).map(item => [item.id, item.company_id]));
    const rowsByUser = new Map();
    for (const row of subscriptions) {
      if (!rowsByUser.has(row.user_id)) rowsByUser.set(row.user_id, []);
      rowsByUser.get(row.user_id).push(row);
    }

    let usersProcessed = 0;
    let sent = 0;
    let failed = 0;

    for (const [userId, userRows] of rowsByUser.entries()) {
      const companyId = companyByUser.get(userId);
      if (!companyId) continue;

      const [chargeResult, paymentResult] = await Promise.all([
        admin
          .from("charges")
          .select("id,amount,due_date,customers(name)")
          .eq("company_id", companyId)
          .eq("status", "pending")
          .lte("due_date", tomorrow)
          .order("due_date", { ascending: true })
          .limit(1000),
        admin
          .from("payments")
          .select("id,amount")
          .eq("company_id", companyId)
          .gte("paid_at", startOfYesterday)
          .lt("paid_at", startOfToday)
          .limit(1000),
      ]);

      if (chargeResult.error) throw chargeResult.error;
      if (paymentResult.error) throw paymentResult.error;
      const pending = chargeResult.data || [];
      const receivedYesterday = paymentResult.data || [];
      const overdue = pending.filter(item => item.due_date < today);
      const dueToday = pending.filter(item => item.due_date === today);
      const dueTomorrow = pending.filter(item => item.due_date === tomorrow);

      const needsOverdue = userRows.some(row => row.notify_overdue) && overdue.length > 0;
      const needsDue = userRows.some(row => row.notify_due) && (dueToday.length > 0 || dueTomorrow.length > 0);
      const needsPayments = userRows.some(row => row.notify_payments) && receivedYesterday.length > 0;
      if (!needsOverdue && !needsDue && !needsPayments) continue;

      const { error: logError } = await admin
        .from("push_delivery_log")
        .insert({ user_id: userId, event_key: eventKey });

      if (logError?.code === "23505") continue;
      if (logError) throw logError;

      const overdueTotal = overdue.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const todayTotal = dueToday.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const tomorrowTotal = dueTomorrow.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const receivedTotal = receivedYesterday.reduce((sum, item) => sum + Number(item.amount || 0), 0);

      const sentBeforeUser = sent;
      for (const row of userRows) {
        const parts = [];
        if (row.notify_overdue && overdue.length) {
          parts.push(overdue.length + " atrasada(s): " + brl(overdueTotal));
        }
        if (row.notify_due && dueToday.length) {
          parts.push(dueToday.length + " vence(m) hoje: " + brl(todayTotal));
        }
        if (row.notify_due && dueTomorrow.length) {
          parts.push(dueTomorrow.length + " vence(m) amanhã: " + brl(tomorrowTotal));
        }
        if (row.notify_payments && receivedYesterday.length) {
          parts.push("Ontem: " + receivedYesterday.length + " pagamento(s) recebido(s): " + brl(receivedTotal));
        }
        if (!parts.length) continue;

        const title = row.notify_overdue && overdue.length
          ? "Cobranças precisam de atenção"
          : row.notify_due && (dueToday.length || dueTomorrow.length)
            ? "Vencimentos e recebimentos"
            : "Resumo de recebimentos";

        const result = await sendToSubscriptionRows(admin, [row], {
          title,
          body: parts.join(" · "),
          url: "/app/cobrancas",
          tag: "daily-" + today,
        });
        sent += result.sent;
        failed += result.failed;
      }

      if (userRows.length) usersProcessed += 1;
      if (sent === sentBeforeUser) {
        await admin.from("push_delivery_log").delete().eq("user_id", userId).eq("event_key", eventKey);
      }
    }

    return res.status(200).json({ ok: true, users: usersProcessed, sent, failed, date: today });
  } catch (error) {
    console.error("Daily push failed:", error?.message || "unknown_error");
    return jsonError(res, 500, "Falha ao processar lembretes diários.");
  }
}
