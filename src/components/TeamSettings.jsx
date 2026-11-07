import React, { useEffect, useState } from "react";
import { Copy, Crown, Link2, Lock, LogOut, Mail, RefreshCw, ShieldCheck, Trash2, Users } from "lucide-react";
import { supabase } from "../lib/supabase";

function teamErrorMessage(error) {
  const raw = String(error?.message || error || "");
  if (raw.includes("business_plan_required")) return "O gerenciamento de equipe está disponível no plano Business.";
  if (raw.includes("seat_limit_reached")) return "A empresa já atingiu o limite de 5 usuários. Remova um membro ou convite para liberar uma vaga.";
  if (raw.includes("invalid_email")) return "Digite um endereço de e-mail válido.";
  if (raw.includes("cannot_invite_self")) return "Você já é o proprietário da empresa e não pode convidar o próprio e-mail.";
  if (raw.includes("member_already_exists")) return "Este e-mail já faz parte da empresa.";
  if (raw.includes("invitation_already_pending")) return "Já existe um convite pendente para este e-mail.";
  if (raw.includes("company_return_state_already_exists")) return "Já existe uma troca de empresa pendente nesta conta. Saia da equipe atual antes de aceitar outro convite.";
  if (raw.includes("not_team_member")) return "Esta conta não está vinculada como membro desta equipe.";
  if (raw.includes("email_already_in_another_company")) return "Este e-mail já está vinculado a outra empresa no CobrançaPro.";
  if (raw.includes("already_linked_to_company")) return "Esta conta já participa de outra equipe. Saia da equipe atual antes de aceitar outro convite.";
  if (raw.includes("invalid_or_expired_invite")) return "Este convite é inválido, já foi utilizado ou expirou.";
  if (raw.includes("email_confirmation_required")) return "Confirme o e-mail da conta antes de aceitar o convite.";
  if (raw.includes("owner_required")) return "Somente o proprietário pode gerenciar a equipe.";
  return raw || "Não foi possível concluir a operação. Tente novamente.";
}

function isSubscriptionActive(profile) {
  if (profile?.plan !== "business") return false;
  if (!["active", "cancelled"].includes(profile?.subscription_status)) return false;
  return !!profile?.subscription_expires_at && new Date(profile.subscription_expires_at).getTime() > Date.now();
}

export function TeamSettings({ profile }) {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  async function loadTeam() {
    setLoading(true);
    const { data, error: loadError } = await supabase.rpc("get_company_team");
    if (loadError) {
      setError(teamErrorMessage(loadError));
      setTeam(null);
    } else {
      setError("");
      setTeam(data || null);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: loadError } = await supabase.rpc("get_company_team");
      if (!active) return;
      if (loadError) {
        setError(teamErrorMessage(loadError));
        setTeam(null);
      } else {
        setError("");
        setTeam(data || null);
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const isOwner = team?.my_role === "owner";
  const businessActive = isSubscriptionActive(profile);
  const members = Array.isArray(team?.members) ? team.members : [];
  const memberCount = Number(team?.member_count || 0);
  const remaining = Math.max(0, 5 - memberCount);

  async function inviteMember(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setInviteLink("");
    setCopied(false);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Informe o e-mail da pessoa que vai entrar na equipe.");
      return;
    }
    setSaving(true);
    const { data, error: inviteError } = await supabase.rpc("create_company_invitation", { p_email: cleanEmail });
    if (inviteError) {
      setError(teamErrorMessage(inviteError));
    } else if (data?.token) {
      const url = window.location.origin + "/convite/" + encodeURIComponent(data.token);
      setInviteLink(url);
      setEmail("");
      setSuccess("Convite criado. Copie o link e envie para a pessoa.");
      await loadTeam();
    } else {
      setError("O convite foi criado, mas o link não foi retornado. Atualize a equipe e tente novamente.");
    }
    setSaving(false);
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setSuccess("Link copiado. Agora é só enviar para o membro.");
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione e copie o link exibido.");
    }
  }

  async function removeMember(member) {
    const label = member.email || member.full_name || "este membro";
    if (!window.confirm(member.status === "invited"
      ? "Cancelar o convite enviado para " + label + "?"
      : "Remover " + label + " da empresa? A pessoa perderá o acesso aos dados compartilhados.")) return;

    setRemovingId(member.id);
    setError("");
    setSuccess("");
    const { error: removeError } = await supabase.rpc("remove_company_member", { p_membership_id: member.id });
    if (removeError) {
      setError(teamErrorMessage(removeError));
    } else {
      setSuccess(member.status === "invited" ? "Convite cancelado." : "Membro removido da empresa.");
      if (inviteLink) setInviteLink("");
      await loadTeam();
    }
    setRemovingId("");
  }

  async function leaveTeam() {
    if (!window.confirm("Sair desta empresa? Você voltará para sua empresa anterior e manterá os dados dela.")) return;

    setLeaving(true);
    setError("");
    setSuccess("");
    const { error: leaveError } = await supabase.rpc("leave_company_and_return");
    if (leaveError) {
      setError(teamErrorMessage(leaveError));
      setLeaving(false);
      return;
    }

    window.location.assign("/app");
  }

  if (loading) {
    return <div className="team-settings"><div className="team-loading"><RefreshCw size={16}/> Carregando equipe...</div></div>;
  }

  return <section className="team-settings">
    <div className="team-settings-heading">
      <div>
        <span className="team-eyebrow">GESTÃO DE ACESSOS</span>
        <h2>Equipe da empresa</h2>
        <p>Compartilhe o mesmo ambiente com as pessoas que trabalham com você.</p>
      </div>
      <div className="team-seat-counter"><Users size={17}/><strong>{memberCount}/5</strong><span>usuários</span></div>
    </div>

    {team?.company_name && <div className="team-company-line"><ShieldCheck size={15}/><span>{team.company_name}</span><span className="team-role-pill">{isOwner ? "Proprietário" : "Membro"}</span></div>}

    {!businessActive && isOwner && <div className="team-upgrade-panel">
      <div className="team-upgrade-icon"><Lock size={19}/></div>
      <div>
        <b>Equipe disponível no plano Business</b>
        <p>Com o Business, você pode ter até 5 usuários na mesma empresa: 1 proprietário e 4 membros. Todos trabalham com os mesmos clientes, cobranças e recebimentos.</p>
        <a href="/#precos">Conhecer o plano Business <Link2 size={14}/></a>
      </div>
    </div>}

    {businessActive && isOwner && <div className="team-invite-panel">
      <div className="team-section-heading"><div><b>Adicionar membro</b><span>{remaining > 0 ? `Você ainda tem ${remaining} vaga(s) disponível(is).` : "Limite de 5 usuários atingido."}</span></div></div>
      <form className="team-invite-form" onSubmit={inviteMember}>
        <label className="team-email-field"><span>E-mail do membro</span><div><Mail size={16}/><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="nome@empresa.com.br" autoComplete="email" required/></div></label>
        <button className="btn btn-primary" type="submit" disabled={saving || remaining <= 0}>{saving ? "Gerando convite..." : "Gerar convite"}</button>
      </form>
      <small className="team-help-text">O convite é válido por 7 dias e só pode ser aceito por uma conta com o mesmo e-mail informado.</small>
      {inviteLink && <div className="team-invite-link">
        <div><b>Link do convite</b><span>Envie este endereço para a pessoa convidada.</span><input value={inviteLink} readOnly onFocus={event => event.target.select()}/></div>
        <button className="btn btn-secondary" type="button" onClick={copyInvite}><Copy size={15}/>{copied ? "Copiado" : "Copiar link"}</button>
      </div>}
    </div>}

    {businessActive && !isOwner && <div className="team-member-notice team-leave-notice">
      <div className="team-member-notice-copy"><ShieldCheck size={16}/><span>Você faz parte desta equipe. Ao sair, sua conta volta para a empresa anterior.</span></div>
      <button type="button" className="btn btn-secondary team-leave-button" onClick={leaveTeam} disabled={leaving}>
        <LogOut size={15}/>{leaving ? "Saindo..." : "Sair da equipe"}
      </button>
    </div>}

    {error && <div className="team-feedback is-error">{error}</div>}
    {success && <div className="team-feedback is-success">{success}</div>}

    <div className="team-roster">
      <div className="team-roster-heading"><div><b>Pessoas com acesso</b><span>O proprietário e os membros vinculados à empresa.</span></div><span>{members.length} registro(s)</span></div>
      {members.length === 0
        ? <div className="team-empty">Nenhum membro encontrado.</div>
        : members.map(member => {
          const expired = member.status === "invited" && member.invite_expires_at && new Date(member.invite_expires_at).getTime() <= Date.now();
          const name = member.full_name || (member.role === "owner" ? "Proprietário" : member.email || "Membro");
          return <div className="team-member-row" key={member.id}>
            <div className="team-member-avatar">{member.role === "owner" ? <Crown size={16}/> : <span>{name.slice(0, 1).toUpperCase()}</span>}</div>
            <div className="team-member-details"><b>{name}</b><span>{member.email || "E-mail não informado"}</span></div>
            <div className="team-member-status">
              <span className={`team-status-pill ${member.role === "owner" ? "owner" : expired ? "expired" : member.status === "invited" ? "pending" : "active"}`}>
                {member.role === "owner" ? "Proprietário" : expired ? "Expirado" : member.status === "invited" ? "Convite pendente" : "Membro ativo"}
              </span>
            </div>
            {isOwner && member.role === "member" && businessActive && <button type="button" className="team-remove-button" onClick={() => removeMember(member)} disabled={removingId === member.id} title={member.status === "invited" ? "Cancelar convite" : "Remover membro"} aria-label={member.status === "invited" ? "Cancelar convite" : "Remover membro"}><Trash2 size={15}/></button>}
          </div>;
        })}
    </div>
  </section>;
}
