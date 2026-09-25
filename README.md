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
npm install
cp .env.example .env.local
npm run dev
```

Preencha `.env.local`:

```env
VITE_SUPABASE_URL=sua_url
VITE_SUPABASE_ANON_KEY=sua_anon_key
```

## Supabase

1. Crie um projeto no Supabase.
2. Abra SQL Editor.
3. Execute `supabase/schema.sql`.
4. Em Authentication > Providers, deixe Email habilitado.
5. Para produção, configure corretamente a URL de redirecionamento do seu domínio.

## Observação

A primeira versão usa `wa.me` para abrir o WhatsApp com a mensagem preenchida. Ela não simula uma integração oficial. A integração oficial do WhatsApp Business Platform pode ser adicionada posteriormente.

## Fluxo

Landing → Cadastro → Onboarding → Dashboard → Clientes/Cobranças/Recebimentos/IA/Configurações.
