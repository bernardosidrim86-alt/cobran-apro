// Endpoint antigo desativado por segurança. Use /api/perfectpay-webhook.
export default function handler(req, res) {
  return res.status(410).json({ ok: false, error: "endpoint_disabled" });
}
