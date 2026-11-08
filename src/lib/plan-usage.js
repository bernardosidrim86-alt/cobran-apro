import { supabase } from "./supabase";

export async function getPlanUsage(){
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  const token=data?.session?.access_token;
  if(!token)throw new Error("Sua sessão expirou. Entre novamente.");

  const response=await fetch("/api/plan-usage",{
    method:"GET",
    headers:{Authorization:"Bearer "+token},
    cache:"no-store"
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result?.error||"Não foi possível consultar o uso do plano.");

  return {
    plan:result.plan||"free",
    customers:Number(result.customers)||0,
    charges:Number(result.charges)||0
  };
}
