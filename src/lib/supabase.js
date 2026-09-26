import { createClient } from "@supabase/supabase-js";

// URL e chave publishable são públicas por design (o acesso é protegido por RLS).
// O fallback garante que o app funcione mesmo quando as variáveis de ambiente
// não chegaram ao build (preview ou deploy antigo).
const FALLBACK_URL = "https://hbrrvscohzsrvwuwoluh.supabase.co";
const FALLBACK_ANON_KEY =
  "sb_publishable_ATQ9Wc4QNaLPH7TxiTo7IQ_yIm5AQfy";

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  FALLBACK_URL;
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  FALLBACK_ANON_KEY;

export const supabase = createClient(url, key);
