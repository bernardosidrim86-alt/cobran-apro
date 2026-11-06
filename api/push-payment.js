import {
  createAdminClient,
  getAuthenticatedUser,
  sendToSubscriptionRows,
  jsonError,
} from "./_lib/push.js";

const isUuid = value =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));

const brl = value =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

export default async function handler(req, res) {
  if (req.method !== "POST") return jsonError(res, 405, "Método não permitido.");

  try {
    const admin = createAdminClient();
    const user = await getAuthenticatedUser(req, admin);
    if (!user) return jsonError(res, 401, "Sessão inválida.");

    const chargeId = req.body?.charge_id;
    if (!isUuid(chargeId)) return jsonError(res, 400, "Cobrança inválida.");

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.company_id) return res.status(200).json({ ok: true, sent: 0 });

    const { data: charge, error: chargeError } = await admin
      .from("charges")
      .select("id,company_id,amount,description,status,customers(name)")
      .eq("id", chargeId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (chargeError) throw chargeError;
    if (!charge || charge.status !== "paid") {
      return jsonError(res, 404, "Pagamento confirmado não encontrado.");
    }

    const { data: rows, error: rowsError } = await admin
      .from("push_subscriptions")
      .select("id,subscription")
      .eq("user_id", user.id)
      .eq("notify_payments", true);

    if (rowsError) throw rowsError;
    if (!rows?.length) return res.status(200).json({ ok: true, sent: 0 });

    const customer = charge.customers?.name || "Cliente";
    const description = charge.description ? " · " + charge.description : "";
    const result = await sendToSubscriptionRows(admin, rows, {
      title: "Pagamento confirmado",
      body: customer + " pagou " + brl(charge.amount) + description,
      url: "/app/recebimentos",
      tag: "payment-" + charge.id,
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("Payment push failed:", error?.message || "unknown_error");
    return jsonError(res, 500, "Não foi possível enviar a notificação de pagamento.");
  }
}
