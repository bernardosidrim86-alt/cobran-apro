import { createClient } from "@supabase/supabase-js";

// CobrançaPro usa este projeto Supabase. A URL e a publishable key
// são públicas por design; o acesso aos dados é protegido por RLS.
const SUPABASE_URL = "https://hbrrvscohzsrvwuwoluh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_ATQ9Wc4QNaLPH7TxiTo7IQ_yIm5AQfy";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
