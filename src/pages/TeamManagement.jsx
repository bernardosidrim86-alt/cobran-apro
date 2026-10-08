import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, Input, PageTitle } from "../components/AppPrimitives";
import { supabase } from "../lib/supabase";
import "./team-management.css";

const BUSINESS_SEAT_LIMIT = 5;

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function activityLabel(event) {
  if (event.event_type === "team_member_invited") return "Convidou uma pessoa para a equipe";
  if (event.event_type === "team_member_removed") return "Removeu uma pessoa da equipe";
  const verbs = { insert: "Criou", update: "Atualizou", delete: "Removeu" };
  const nouns = {
    customers: "um cliente",
    charges: "uma cobrança",
    payments: "um recebimento",
    message_logs: "um registro de mensagem",
  };
  return (verbs[event.event_type] || "Alterou") + " " + (nouns[event.entity_type] || "um registro");
}

export function TeamManagement({ companyId }) {
  const [members, setMembers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [email, setEmail] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      setError("Sua sessão expirou. Entre novamente para carregar a equipe.");
      setLoading(false);
      return;
    }
    setCurrentUserId(authData.user.id);

    const { data: rows, error: listError } = await supabase
      .from("company_members")
      .select("id,user_id,email,role,status,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (listError) {
      setError("Não foi possível carregar a equipe. Confira se a migração de equipe já foi aplicada.");
      setMembers([]);
      setActivity([]);
      setLoading(false);
      return;
    }

    const safeRows = rows || [];
    setMembers(safeRows);
    const owner = safeRows.some((row) => row.user_id === authData.user.id && row.role === "owner");
    setIsOwner(owner);

    if (owner) {
      const { data: events, error: activityError } = await supabase
        .from("company_activity")
        .select("id,actor_user_id,event_type,entity_type,created_at,changed_fields")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(30);
      setActivity(activityError ? [] : events || []);
    } else {
      setActivity([]);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const usedSeats = useMemo(
    () => members.filter((member) => ["active", "invited"].includes(member.status)).length,
    [members]
  );
  const membersByUser = useMemo(
    () => new Map(members.filter((member) => member.user_id).map((member) => [member.user_id, member])),
    [members]
  );

  async function request(action, payload = {}) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error("Sua sessão expirou. Entre novamente.");
    }
    const response = await fetch("/api/team", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + sessionData.session.access_token,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir a solicitação.");
    return result;
  }

  async function invite(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSending(true);
    try {
      const result = await request("invite", { email });
      setEmail("");
      setNotice(result.message || "Convite enviado.");
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  async function remove(member) {
    const label = member.email || "esta pessoa";
    if (!window.confirm("Remover o acesso de " + label + " à empresa?")) return;
    setError("");
    setNotice("");
    setRemovingId(member.id);
    try {
      const result = await request("remove", { membershipId: member.id });
      setNotice(result.message || "Acesso removido.");
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRemovingId("");
    }
  }

  return (
    <div className="team-management">
      <PageTitle
        title="Equipe"
        subtitle="Convide pessoas para trabalhar na mesma carteira de clientes e cobranças."
      />

      {!isOwner && !loading && (
        <div className="team-notice">
          O proprietário da empresa gerencia os convites e acessos da equipe.
        </div>
      )}

      {isOwner && (
        <>
          <section className="team-card">
            <div className="team-card-heading">
              <div>
                <h2>Pessoas da empresa</h2>
                <p>O limite é de {BUSINESS_SEAT_LIMIT} pessoas no total: proprietário + 4 membros. Assentos adicionais não estão disponíveis.</p>
              </div>
              <span className="team-seat-count">{usedSeats} / {BUSINESS_SEAT_LIMIT} assentos</span>
            </div>

            <div className="team-seat-track" aria-label={usedSeats + " de " + BUSINESS_SEAT_LIMIT + " assentos ocupados"}>
              <span style={{ width: Math.min(100, (usedSeats / BUSINESS_SEAT_LIMIT) * 100) + "%" }} />
            </div>

            <form className="team-invite-form" onSubmit={invite}>
              <Input
                label="E-mail da pessoa"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@empresa.com"
                required
              />
              <Button type="submit" disabled={sending || usedSeats >= BUSINESS_SEAT_LIMIT}>
                {sending ? "Enviando convite..." : "Convidar pessoa"}
              </Button>
            </form>
            <p className="team-help">
              A pessoa receberá um convite por e-mail e usará o próprio login. O acesso é compartilhado com a empresa.
            </p>
          </section>

          <section className="team-card">
            <h2>Acessos</h2>
            {loading ? (
              <p className="team-muted">Carregando pessoas…</p>
            ) : members.length === 0 ? (
              <Empty text="Nenhuma pessoa encontrada nesta empresa." />
            ) : (
              <div className="team-table-wrap">
                <table className="team-table">
                  <thead>
                    <tr><th>Pessoa</th><th>Acesso</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.id}>
                        <td>{member.email || "Proprietário"}</td>
                        <td>{member.role === "owner" ? "Proprietário" : "Membro"}</td>
                        <td>
                          <span className={"team-status " + (member.status === "active" ? "is-active" : "")}>
                            {member.status === "active" ? "Ativo" : "Convite pendente"}
                          </span>
                        </td>
                        <td className="team-actions">
                          {member.role === "member" && member.user_id !== currentUserId && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={removingId === member.id}
                              onClick={() => remove(member)}
                            >
                              {removingId === member.id ? "Removendo…" : "Remover"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="team-card">
            <h2>Atividade recente</h2>
            <p className="team-help">O histórico registra ações sem guardar o conteúdo de clientes, cobranças ou mensagens.</p>
            {loading ? (
              <p className="team-muted">Carregando atividade…</p>
            ) : activity.length === 0 ? (
              <Empty text="As alterações feitas pela equipe aparecerão aqui." />
            ) : (
              <ul className="team-activity-list">
                {activity.map((event) => {
                  const actor = membersByUser.get(event.actor_user_id);
                  return (
                    <li key={event.id}>
                      <div>
                        <strong>{activityLabel(event)}</strong>
                        <span>{actor?.email || (event.actor_user_id ? "Pessoa removida" : "Sistema")}</span>
                      </div>
                      <time dateTime={event.created_at}>{dateTime(event.created_at)}</time>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="success-box" role="status">{notice}</div>}
    </div>
  );
}
