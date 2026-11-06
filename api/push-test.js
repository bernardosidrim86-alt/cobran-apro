import {
  createAdminClient,
  getAuthenticatedUser,
  sendToSubscriptionRows,
  jsonError,
} from "../server/push.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return jsonError(res, 405, "Método não permitido.");

  try {
    const admin = createAdminClient();
    const user = await getAuthenticatedUser(req, admin);
    if (!user) return jsonError(res, 401, "Sua sessão expirou. Entre novamente.");

    const { data: rows, error } = await admin
      .from("push_subscriptions")
      .select("id,subscription")
      .eq("user_id", user.id);

    if (error) throw error;
    if (!rows?.length) return jsonError(res, 409, "Ative as notificações neste dispositivo antes de enviar um teste.");

    const minuteKey = "test:" + Math.floor(Date.now() / 60000);
    const { error: logError } = await admin
      .from("push_delivery_log")
      .insert({ user_id: user.id, event_key: minuteKey });

    if (logError?.code === "23505") {
      return jsonError(res, 429, "Aguarde um minuto para enviar outro teste.");
    }
    if (logError) throw logError;

    const result = await sendToSubscriptionRows(admin, rows, {
      title: "CobrançaPro está conectado",
      body: "As notificações deste dispositivo estão funcionando corretamente.",
      url: "/app/configuracoes?tab=notificacoes",
      tag: "cobrancapro-test",
    });

    if (!result.sent) {
      await admin.from("push_delivery_log").delete().eq("user_id", user.id).eq("event_key", minuteKey);
      return jsonError(res, 502, "Não foi possível entregar o teste. Confira se as notificações ainda estão permitidas no aparelho.");
    }

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("Push test failed:", error?.message || "unknown_error");
    return jsonError(res, 500, "Não foi possível enviar a notificação de teste.");
  }
}
