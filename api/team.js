import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL || "https://www.cobrancaproai.site";
const BUSINESS_SEAT_LIMIT = 5;

function respond(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function safeError(error, fallback = "Não foi possível concluir a solicitação.") {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("seat_limit_reached")) {
    return "O plano Business inclui até " + BUSINESS_SEAT_LIMIT + " pessoas no total, contando o proprietário.";
  }
  if (message.includes("member_already_exists")) {
    return "Este e-mail já tem convite ou acesso a esta empresa.";
  }
  if (message.includes("business_plan_required")) {
    return "Convites estão disponíveis apenas para empresas com plano Business ativo.";
  }
  if (message.includes("owner_required")) {
    return "Somente o proprietário pode gerenciar a equipe.";
  }
  if (message.includes("member_not_found")) {
    return "Este acesso não foi encontrado.";
  }
  if (message.includes("cannot_remove_owner")) {
    return "O proprietário não pode ser removido pela equipe.";
  }
  return fallback;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "Método não permitido." });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return respond(res, 500, { error: "Configuração do servidor incompleta." });
  }

  const authorization = req.headers.authorization || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond(res, 401, { error: "Faça login para continuar." });

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return respond(res, 401, { error: "Sessão inválida. Entre novamente." });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("company_id,plan,billing_cycle,subscription_status,subscription_expires_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.company_id) return respond(res, 403, { error: "Sua conta não pertence a uma empresa." });

    const { data: ownerMembership, error: membershipError } = await supabaseAdmin
      .from("company_members")
      .select("id")
      .eq("company_id", profile.company_id)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!ownerMembership) return respond(res, 403, { error: "Somente o proprietário pode gerenciar a equipe." });

    const action = String(req.body?.action || "");
    if (action === "invite") {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
        return respond(res, 400, { error: "Informe um e-mail válido." });
      }
      if (email === String(user.email || "").trim().toLowerCase()) {
        return respond(res, 400, { error: "Use outro e-mail para convidar uma pessoa da equipe." });
      }

      const expiresAt = profile.subscription_expires_at
        ? new Date(profile.subscription_expires_at).getTime()
        : 0;
      if (
        profile.plan !== "business" ||
        profile.subscription_status !== "active" ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now()
      ) {
        return respond(res, 403, {
          error: "Convites estão disponíveis apenas para empresas com plano Business ativo.",
        });
      }

      const { data: inviteId, error: reserveError } = await supabaseAdmin.rpc(
        "reserve_company_invite",
        {
          p_company_id: profile.company_id,
          p_email: email,
          p_invited_by: user.id,
        }
      );
      if (reserveError) return respond(res, 400, { error: safeError(reserveError) });

      let invitedUserId = null;
      try {
        const { data: inviteData, error: inviteError } =
          await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            redirectTo: new URL("/login", APP_URL).toString(),
          });
        if (inviteError || !inviteData?.user?.id) {
          if (inviteError) throw inviteError;
          throw new Error("invite_user_not_created");
        }

        invitedUserId = inviteData.user.id;

        const { error: memberError } = await supabaseAdmin
          .from("company_members")
          .update({ user_id: invitedUserId })
          .eq("id", inviteId)
          .is("user_id", null);
        if (memberError) throw memberError;

        const { error: invitedProfileError } = await supabaseAdmin
          .from("profiles")
          .update({
            company_id: profile.company_id,
            plan: profile.plan,
            billing_cycle: profile.billing_cycle,
            subscription_status: profile.subscription_status,
            subscription_expires_at: profile.subscription_expires_at,
          })
          .eq("id", invitedUserId);
        if (invitedProfileError) throw invitedProfileError;

        return respond(res, 200, { ok: true, message: "Convite enviado." });
      } catch (error) {
        if (invitedUserId) {
          await supabaseAdmin.auth.admin.deleteUser(invitedUserId);
        }
        await supabaseAdmin.from("company_members").delete().eq("id", inviteId);

        const message = String(error?.message || "").toLowerCase();
        const publicMessage = message.includes("already registered") ||
          message.includes("already been registered") ||
          message.includes("already exists")
          ? "Este e-mail já possui uma conta no CobrançaPro. Use um endereço ainda não cadastrado."
          : "Não foi possível enviar o convite. Confira a configuração de e-mail do Supabase e tente novamente.";
        return respond(res, 400, { error: publicMessage });
      }
    }

    if (action === "remove") {
      const membershipId = String(req.body?.membershipId || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(membershipId)) {
        return respond(res, 400, { error: "Acesso de equipe inválido." });
      }

      const { error: revokeError } = await supabaseAdmin.rpc("revoke_company_member", {
        p_company_id: profile.company_id,
        p_membership_id: membershipId,
        p_actor_id: user.id,
      });
      if (revokeError) return respond(res, 400, { error: safeError(revokeError) });
      return respond(res, 200, { ok: true, message: "Acesso removido." });
    }

    return respond(res, 400, { error: "Ação de equipe inválida." });
  } catch (error) {
    console.error("Team management request failed", error?.code || error?.name || "unknown");
    return respond(res, 500, { error: "Não foi possível concluir a solicitação." });
  }
}
