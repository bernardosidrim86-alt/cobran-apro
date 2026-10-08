# CobrançaPro

MVP funcional de um SaaS de gestão de cobranças.

## Stack

- React + Vite
- Supabase Auth + PostgreSQL + RLS
- React Router
- Lucide
- CSS próprio

## Rodar localmente

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Preencha `.env.local` com as variáveis do ambiente usado. O frontend só lê as variáveis `VITE_*`; mantenha as chaves administrativas exclusivamente na Vercel:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
VITE_APP_URL=https://cobrancapro.com
VITE_TURNSTILE_SITE_KEY=<public-site-key>
```

As funções de servidor usam `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `PERFECTPAY_WEBHOOK_TOKEN` e `APP_URL`. Configure-as nas variáveis da Vercel por ambiente. `APP_URL` deve ser a origem pública oficial usada nos links de convite; `VITE_APP_URL` deve corresponder à origem autorizada para recuperação de senha. Em domínios alternativos oficiais, configure a origem correspondente.

## Supabase

1. Crie um projeto no Supabase.
2. Abra SQL Editor.
3. Em um projeto novo, aplique em ordem os arquivos de `supabase/migrations/`; `20261006040411_legacy_schema_snapshot.sql` é o snapshot do schema-base. Os quatro arquivos históricos anteriores são marcadores vazios: os efeitos desses passos já estão consolidados no snapshot. `supabase/schema.sql` é a cópia legível e sincronizada desse snapshot.
4. No projeto existente `hbrrvscohzsrvwuwoluh`, não execute o snapshot sobre o banco provisionado. A versão remota já registra quatro migrations históricas (`20261003223718`, `20261003223756`, `20261004060549`, `20261006040410`). Após conferir que o schema remoto corresponde ao snapshot e fazer backup, registre apenas o snapshot como baseline aplicado (`supabase migration repair --status applied --linked 20261006040411`); depois aplique as migrations novas da PR. Não aplique SQL de baseline sem reconciliar esse histórico.
5. Em Authentication > Providers, habilite Email e inclua `https://cobrancapro.com/nova-senha` (e os domínios oficiais de preview/desenvolvimento necessários) em **Redirect URLs**.
6. Configure o bucket `company-avatars` como público para leitura de avatares; uploads, alterações e exclusões dependem das políticas de Storage versionadas.

### Configuração externa de segurança

Essas opções pertencem ao projeto no painel Supabase e não podem ser ativadas por este repositório. Confirme-as manualmente por ambiente:

- Em **Authentication > Security and Protection**, habilite a proteção contra senhas vazadas (Leaked Password Protection). O repositório não consegue confirmar se a opção está ativa.
- Em **Authentication > Bot and Abuse Protection**, configure Cloudflare Turnstile com a chave secreta do site e habilite o CAPTCHA nos fluxos de Auth. Configure `VITE_TURNSTILE_SITE_KEY` na Vercel para cada ambiente; a chave pública precisa corresponder à configuração e aos domínios autorizados no Cloudflare/Supabase. O código por si só não prova que a validação do lado do Supabase está habilitada.
- Revise a lista de URLs de redirecionamento de Auth para incluir os domínios oficiais e os ambientes de preview aprovados; evite curingas amplos em produção.

## Observação

A primeira versão usa `wa.me` para abrir o WhatsApp com a mensagem preenchida. Ela não simula uma integração oficial. A integração oficial do WhatsApp Business Platform pode ser adicionada posteriormente.

## Fluxo

Landing → Cadastro → Onboarding → Dashboard → Clientes/Cobranças/Recebimentos/IA/Configurações.
