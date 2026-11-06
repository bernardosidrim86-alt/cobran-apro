import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const b64url = value => Buffer.from(value).toString("base64url");

function fromB64url(value) {
  return Buffer.from(String(value || ""), "base64url");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function hkdfExpand(prk, info, length) {
  let previous = Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for (let counter = 1; size < length; counter += 1) {
    previous = hmac(prk, Buffer.concat([previous, info, Buffer.from([counter])]));
    chunks.push(previous);
    size += previous.length;
  }
  return Buffer.concat(chunks, size).subarray(0, length);
}

export function createAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.COBRANCAPRO_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.COBRANCAPRO_SUPABASE_SECRET_KEY ||
    process.env.COBRANCAPRO_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase server credentials are not configured.");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthenticatedUser(req, admin) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
}

function getVapidCredentials() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || process.env.VITE_WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT || "https://cobrancapro.com";

  if (!publicKey || !privateKey) {
    throw new Error("Web Push VAPID keys are not configured.");
  }

  const publicBytes = fromB64url(publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    throw new Error("Invalid Web Push public key.");
  }

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: b64url(publicBytes.subarray(1, 33)),
    y: b64url(publicBytes.subarray(33, 65)),
    d: String(privateKey),
  };

  return { publicKey, privateKey: crypto.createPrivateKey({ key: jwk, format: "jwk" }), subject };
}

function createVapidToken(audience, credentials) {
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = b64url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: credentials.subject,
  }));
  const unsigned = header + "." + payload;
  const signature = crypto.sign("sha256", Buffer.from(unsigned), {
    key: credentials.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return unsigned + "." + b64url(signature);
}

function encryptPayload(subscription, payload) {
  const clientPublic = fromB64url(subscription?.keys?.p256dh);
  const authSecret = fromB64url(subscription?.keys?.auth);

  if (clientPublic.length !== 65 || clientPublic[0] !== 4 || authSecret.length < 16) {
    throw new Error("Invalid push subscription keys.");
  }

  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(clientPublic);

  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    clientPublic,
    serverPublic,
  ]);
  const inputKeyMaterial = hkdfExpand(hmac(authSecret, sharedSecret), keyInfo, 32);

  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, inputKeyMaterial);
  const contentKey = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);

  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payload), "utf8"), Buffer.from([2])]);
  const cipher = crypto.createCipheriv("aes-128-gcm", contentKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([serverPublic.length]), serverPublic, ciphertext]);
}

function isTrustedPushEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;

  const host = url.hostname.toLowerCase();
  return (
    host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com") ||
    host === "fcm.googleapis.com" ||
    host.endsWith(".fcm.googleapis.com") ||
    host === "updates.push.services.mozilla.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host === "notify.windows.com" ||
    host.endsWith(".notify.windows.com")
  );
}

export async function sendWebPush(subscription, payload) {
  if (!subscription?.endpoint || !isTrustedPushEndpoint(subscription.endpoint)) {
    throw new Error("Untrusted push endpoint.");
  }

  const credentials = getVapidCredentials();
  const endpoint = new URL(subscription.endpoint);
  const body = encryptPayload(subscription, payload);
  const token = createVapidToken(endpoint.origin, credentials);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "vapid t=" + token + ", k=" + credentials.publicKey,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
    signal: AbortSignal.timeout(10000),
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    expired: response.status === 404 || response.status === 410,
    status: response.status,
  };
}

export async function sendToSubscriptionRows(admin, rows, payload) {
  let sent = 0;
  let expired = 0;
  let failed = 0;
  const expiredIds = [];

  for (const row of rows || []) {
    try {
      const result = await sendWebPush(row.subscription, payload);
      if (result.ok) sent += 1;
      else if (result.expired) {
        expired += 1;
        expiredIds.push(row.id);
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("Web Push delivery failed:", error?.message || "unknown_error");
    }
  }

  if (expiredIds.length) {
    const { error } = await admin.from("push_subscriptions").delete().in("id", expiredIds);
    if (error) console.error("Could not remove expired push subscriptions:", error.message);
  }

  return { sent, expired, failed };
}

export function jsonError(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}
