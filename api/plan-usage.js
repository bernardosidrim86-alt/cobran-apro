import {
  createAdminClient,
  getAuthenticatedUser,
  jsonError,
} from "../server/push.js";

export default async function handler(req,res){
  if(req.method!=="GET")return jsonError(res,405,"Método não permitido.");

  res.setHeader("Cache-Control","private, no-store");
  res.setHeader("Vary","Authorization");

  try{
    const admin=createAdminClient();
    const user=await getAuthenticatedUser(req,admin);
    if(!user)return jsonError(res,401,"Sua sessão expirou. Entre novamente.");

    const {data:profile,error:profileError}=await admin
      .from("profiles")
      .select("company_id,plan")
      .eq("id",user.id)
      .maybeSingle();

    if(profileError)throw profileError;
    if(!profile)return jsonError(res,403,"Perfil não encontrado.");

    if(!profile.company_id){
      return res.status(200).json({
        plan:profile.plan||"free",
        customers:0,
        charges:0
      });
    }

    // The database uses UTC month boundaries for quota enforcement.
    const now=new Date();
    const monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString();
    const nextMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();

    const [{count:customers,error:customersError},{count:charges,error:chargesError}]=await Promise.all([
      admin.from("customers")
        .select("id",{count:"exact",head:true})
        .eq("company_id",profile.company_id),
      admin.from("company_activity")
        .select("id",{count:"exact",head:true})
        .eq("company_id",profile.company_id)
        .eq("entity_type","charges")
        .eq("event_type","insert")
        .gte("created_at",monthStart)
        .lt("created_at",nextMonth)
    ]);

    if(customersError)throw customersError;
    if(chargesError)throw chargesError;

    return res.status(200).json({
      plan:profile.plan||"free",
      customers:customers||0,
      charges:charges||0
    });
  }catch(error){
    console.error("Plan usage lookup failed:",error?.message||"unknown_error");
    return jsonError(res,500,"Não foi possível consultar o uso do plano.");
  }
}
