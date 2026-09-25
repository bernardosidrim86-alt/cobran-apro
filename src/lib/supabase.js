import { createClient } from "@supabase/supabase-js";

// URL e chave anon são públicas por design (o acesso é protegido por RLS).
// O fallback garante que o app funcione mesmo quando as variáveis de ambiente
// não chegaram ao build (preview ou deploy antigo).
const FALLBACK_URL = "https://oephewcgnqljcnrwvxcj.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lcGhld2NnbnFsamNucnd2eGNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjMxMDcsImV4cCI6MjEwNTkzOTEwN30.ZgX8mL3q--A4Lmt41qTlvYadhYOUnOpIe7DGEwJk2D0";

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  FALLBACK_URL;
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  FALLBACK_ANON_KEY;

export const supabase = createClient(url, key);
