import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  LoaderCircle,
  Power,
  Send,
  Smartphone,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const DEFAULT_PREFERENCES = {
  notify_payments: true,
  notify_due: true,
  notify_overdue: true,
};

function decodeBase64Url(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function getStandaloneMode() {
  return Boolean(
    window.navigator.standalone ||
    window.matchMedia?.("(display-mode: standalone)")?.matches
  );
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

export function PushNotificationsSettings() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState("default");
  const [enabled, setEnabled] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [userId, setUserId] = useState(null);
  const [otherDevices, setOtherDevices] = useState(0);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const iosNeedsHomeScreen = useMemo(
    () => isIOSDevice() && !getStandaloneMode(),
    []
  );

  async function loadSettings() {
    setLoading(true);
    setError("");
    try {
      const canPush =
        window.isSecureContext &&
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window;
      setSupported(canPush);
      if (!canPush) {
        setLoading(false);
        return;
      }

      setPermission(Notification.permission);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData?.user;
      if (!user?.id) throw new Error("Entre novamente na sua conta.");

      setUserId(user.id);
      const registration = await navigator.serviceWorker.ready;
      const currentSubscription = await registration.pushManager.getSubscription();
      setSubscription(currentSubscription);

      const { data: rows, error: rowsError } = await supabase
        .from("push_subscriptions")
        .select("id,endpoint,notify_payments,notify_due,notify_overdue")
        .eq("user_id", user.id);

      if (rowsError) throw rowsError;

      const list = rows || [];
      const currentRow = list.find(row => row.endpoint === currentSubscription?.endpoint);
      setEnabled(Boolean(currentRow));
      setOtherDevices(Math.max(0, list.length - (currentRow ? 1 : 0)));
      setPreferences(currentRow ? {
        notify_payments: currentRow.notify_payments,
        notify_due: currentRow.notify_due,
        notify_overdue: currentRow.notify_overdue,
      } : (list[0] ? {
        notify_payments: list[0].notify_payments,
        notify_due: list[0].notify_due,
        notify_overdue: list[0].notify_overdue,
      } : DEFAULT_PREFERENCES));
    } catch (loadError) {
      setError(loadError?.message || "Não foi possível carregar as configurações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function updatePreference(key, value) {
    setSaved(false);
    setPreferences(current => ({ ...current, [key]: value }));
  }

  async function enableNotifications() {
    setError("");
    setNotice("");
    setSaved(false);

    if (iosNeedsHomeScreen) {
      setError("No iPhone, abra o CobrançaPro pelo ícone da Tela de Início para ativar o push.");
      return;
    }
    if (!supported) {
      setError("Este navegador não oferece suporte a notificações push neste dispositivo.");
      return;
    }
    if (!import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY) {
      setError("A chave pública de notificações ainda não foi configurada.");
      return;
    }

    setBusy(true);
    try {
      // This request stays directly inside the user's button gesture, as required by iOS.
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        throw new Error(
          result === "denied"
            ? "As notificações estão bloqueadas nas configurações do aparelho ou navegador."
            : "Permita as notificações para continuar."
        );
      }

      const registration = await navigator.serviceWorker.ready;
      let currentSubscription = await registration.pushManager.getSubscription();
      if (!currentSubscription) {
        currentSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeBase64Url(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY),
        });
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData?.user;
      if (!user?.id) throw new Error("Sua sessão expirou. Entre novamente.");

      const { error: saveError } = await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: currentSubscription.endpoint,
        subscription: currentSubscription.toJSON(),
        user_agent: navigator.userAgent.slice(0, 500),
        ...preferences,
        updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });

      if (saveError) throw saveError;

      setUserId(user.id);
      setSubscription(currentSubscription);
      setEnabled(true);
      setNotice("Notificações ativadas neste aparelho.");
    } catch (enableError) {
      setError(enableError?.message || "Não foi possível ativar as notificações.");
    } finally {
      setBusy(false);
    }
  }

  async function savePreferences() {
    if (!subscription || !userId) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { error: updateError } = await supabase
        .from("push_subscriptions")
        .update({ ...preferences, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("endpoint", subscription.endpoint);

      if (updateError) throw updateError;
      setSaved(true);
      setNotice("Preferências salvas.");
    } catch (saveError) {
      setError(saveError?.message || "Não foi possível salvar as preferências.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setError("");
    setNotice("");
    setTesting(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Sua sessão expirou. Entre novamente.");

      const response = await fetch("/api/push-test", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível enviar o teste.");
      setNotice("Notificação de teste enviada. Confira a Central de Notificações do aparelho.");
    } catch (testError) {
      setError(testError?.message || "Não foi possível enviar a notificação de teste.");
    } finally {
      setTesting(false);
    }
  }

  async function disableNotifications() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (subscription && userId) {
        const { error: deleteError } = await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .eq("endpoint", subscription.endpoint);
        if (deleteError) throw deleteError;
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setSubscription(null);
      setNotice("Notificações desativadas neste aparelho.");
    } catch (disableError) {
      setError(disableError?.message || "Não foi possível desativar as notificações.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="push-settings">
      <div className="push-settings-heading">
        <div className="push-settings-icon"><BellRing size={20} /></div>
        <div>
          <h2>Notificações no celular</h2>
          <p>Receba avisos do CobrançaPro mesmo quando o aplicativo estiver fechado.</p>
        </div>
        <span className={enabled ? "push-status is-on" : "push-status"}>
          <i />{enabled ? "Ativas" : "Desativadas"}
        </span>
      </div>

      {iosNeedsHomeScreen && (
        <div className="push-settings-note">
          <Smartphone size={18} />
          <span>Abra o CobrançaPro pelo ícone que você adicionou à Tela de Início. O iPhone só libera o push nesse modo.</span>
        </div>
      )}

      {!supported && !loading && (
        <div className="push-settings-note">
          <AlertCircle size={18} />
          <span>Este navegador ou aparelho não oferece suporte ao push. Use um navegador atualizado e, no iPhone, o app instalado na Tela de Início.</span>
        </div>
      )}

      <div className="push-settings-device">
        <div className="push-device-icon"><Smartphone size={19} /></div>
        <div>
          <b>Este aparelho</b>
          <span>
            {loading ? "Verificando suporte e permissão..." :
              enabled ? "Este dispositivo está cadastrado para receber avisos." :
              permission === "denied" ? "A permissão está bloqueada no sistema." :
              "Ative para começar a receber notificações."}
          </span>
        </div>
        {loading ? <LoaderCircle className="push-spin" size={18} /> :
          enabled ? <CheckCircle2 className="push-active-check" size={19} /> : null}
      </div>

      <div className="push-preferences">
        <div className="push-preferences-title">
          <b>Quais avisos você quer receber?</b>
          <span>As preferências abaixo valem para este aparelho.</span>
        </div>

        <label className="push-preference">
          <span><b>Pagamentos confirmados</b><small>Quando uma cobrança for marcada como recebida.</small></span>
          <input type="checkbox" checked={preferences.notify_payments} onChange={event => updatePreference("notify_payments", event.target.checked)} disabled={!enabled || busy} />
        </label>
        <label className="push-preference">
          <span><b>Vencimentos próximos</b><small>Resumo diário do que vence hoje ou amanhã.</small></span>
          <input type="checkbox" checked={preferences.notify_due} onChange={event => updatePreference("notify_due", event.target.checked)} disabled={!enabled || busy} />
        </label>
        <label className="push-preference">
          <span><b>Cobranças atrasadas</b><small>Resumo diário dos valores em atraso.</small></span>
          <input type="checkbox" checked={preferences.notify_overdue} onChange={event => updatePreference("notify_overdue", event.target.checked)} disabled={!enabled || busy} />
        </label>
      </div>

      {error && <div className="push-feedback is-error"><AlertCircle size={16} /><span>{error}</span></div>}
      {notice && <div className="push-feedback is-success"><CheckCircle2 size={16} /><span>{notice}</span></div>}

      {permission === "denied" && (
        <p className="push-permission-help">Para liberar novamente, abra os Ajustes do iPhone ou as configurações do navegador, encontre o CobrançaPro e permita notificações.</p>
      )}

      <div className="push-settings-actions">
        {!enabled ? (
          <button type="button" className="btn btn-primary" onClick={enableNotifications} disabled={loading || busy || !supported}>
            {busy ? <LoaderCircle className="push-spin" size={16} /> : <BellRing size={16} />}
            {busy ? "Ativando..." : "Ativar notificações"}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={savePreferences} disabled={busy || saved}>
              {busy ? <LoaderCircle className="push-spin" size={16} /> : <CheckCircle2 size={16} />}
              {saved ? "Preferências salvas" : "Salvar preferências"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={sendTest} disabled={testing || busy}>
              {testing ? <LoaderCircle className="push-spin" size={16} /> : <Send size={16} />}
              {testing ? "Enviando..." : "Enviar teste"}
            </button>
            <button type="button" className="push-disable-btn" onClick={disableNotifications} disabled={busy}>
              <Power size={15} /> Desativar neste aparelho
            </button>
          </>
        )}
      </div>
      {otherDevices > 0 && (
        <p className="push-other-devices">{otherDevices} outro(s) aparelho(s) também está(ão) cadastrado(s) para receber notificações.</p>
      )}
    </div>
  );
}
