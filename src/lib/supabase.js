import { createClient } from "@supabase/supabase-js";

// CobrançaPro usa este projeto Supabase. A URL e a publishable key
// são públicas por design; o acesso aos dados é protegido por RLS.
const SUPABASE_URL = "https://vfywuuazvdkvttbwpjht.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_fHvAxyMhqBwriqUJgAUVNw_hI95QEt8";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
