import React, { useEffect, useRef } from "react";

const SITE_KEY = "0x4AAAAAAFNGVdvTQftiuEoI";
let scriptPromise = null;

function loadTurnstile() {
  if (typeof window === "undefined") return Promise.reject(new Error("Turnstile só funciona no navegador."));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cobrancapro-turnstile="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile), { once: true });
      existing.addEventListener("error", () => reject(new Error("Não foi possível carregar o CAPTCHA.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.cobrancaproTurnstile = "true";
    script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile não ficou disponível."));
    script.onerror = () => reject(new Error("Não foi possível carregar o CAPTCHA."));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export default function TurnstileCaptcha({ onToken }) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const onTokenRef = useRef(onToken);

  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;

    onTokenRef.current?.("");

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || !turnstile) return;

        widgetRef.current = turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "auto",
          appearance: "always",
          callback: (token) => onTokenRef.current?.(token),
          "expired-callback": () => onTokenRef.current?.(""),
          "error-callback": () => onTokenRef.current?.(""),
        });
      })
      .catch(() => {
        if (!cancelled) onTokenRef.current?.("");
      });

    return () => {
      cancelled = true;
      if (widgetRef.current != null && window.turnstile) {
        try { window.turnstile.remove(widgetRef.current); } catch {}
      }
      widgetRef.current = null;
    };
  }, []);

  return <div className="turnstile-wrap" ref={containerRef} aria-label="Verificação de segurança" />;
}
