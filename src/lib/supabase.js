import { createClient } from "@supabase/supabase-js";

// CobrançaPro usa este projeto Supabase. A URL e a publishable key
// são públicas por design; o acesso aos dados é protegido por RLS.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.");
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
