import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const url=Deno.env.get("SUPABASE_URL")!;
const secret=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;
const db=createClient(url,secret);
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-automation-secret"};

const phone=(v:string|null)=>{const d=(v||"").replace(/\\D/g,"");return !d?null:d.startsWith("55")?d:(d.length===10||d.length===11?"55"+d:d)};
const money=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n);
const dateBR=(s:string)=>{const [y,m,d]=s.split("-");return `${d}/${m}/${y}`};

async function sendTemplate(id:string,token:string,to:string,name:string,lang:string,p:string[]){const version=Deno.env.get("WHATSAPP_GRAPH_VERSION")||"v24.0";const r=await fetch(`https://graph.facebook.com/${version}/${id}/messages`,{method:"POST",headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to,type:"template",template:{name,language:{code:lang},components:[{type:"body",parameters:p.map((text)=>({type:"text",text}))}]}})});const raw=await r.text();let body:unknown=raw;try{body=JSON.parse(raw)}catch{}return{ok:r.ok,status:r.status,body}};

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const {data:cronSecret}=await db.rpc("get_automation_secret");
  if(!cronSecret||req.headers.get("x-automation-secret")!==cronSecret)return Response.json({ok:false,error:"unauthorized"},{status:401,headers:cors});
  const now=new Date();
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const p=(t:string)=>parts.find(x=>x.type===t)?.value||"";
  const today=`${p("year")}-${p("month")}-${p("day")}`;
  const hour=Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",hour:"2-digit",hour12:false}).format(now));
  const {data:settings,error}=await db.from("whatsapp_automation_settings").select("*").eq("enabled",true);
  if(error)throw error;
  const out={ok:true,today,checked:settings?.length||0,sent:0,skipped:0,errors:[] as unknown[]};
  for(const s of settings||[]){
   if(hour<s.send_start_hour||hour>=s.send_end_hour){out.skipped++;continue}
   const {data:conn}=await db.from("whatsapp_connections").select("*").eq("company_id",s.company_id).eq("status","connected").maybeSingle();
   if(!conn?.phone_number_id){out.skipped++;continue}
   const {data:token}=await db.rpc("get_whatsapp_access_token",{p_company_id:s.company_id});
   if(!token){out.errors.push({company_id:s.company_id,error:"whatsapp_token_missing"});continue}
   const {data:charges,error:ce}=await db.from("charges").select("id,company_id,customer_id,amount,due_date,customers(name,phone)").eq("company_id",s.company_id).eq("status","pending").gte("due_date",new Date(Date.now()-30*86400000).toISOString().slice(0,10)).lte("due_date",new Date(Date.now()+30*86400000).toISOString().slice(0,10));
   if(ce)throw ce;
   for(const c of charges||[]){
    const customer=Array.isArray(c.customers)?c.customers[0]:c.customers;const to=phone(customer?.phone);if(!to)continue;
    const diff=Math.round((new Date(c.due_date+"T00:00:00-03:00").getTime()-new Date(today+"T00:00:00-03:00").getTime())/86400000);
    let kind:string|null=null,name:string|null=null,template="";
    if(diff>0&&diff===s.reminder_before_days&&s.template_before_name){kind="before";name=s.template_before_name;template=s.template_before}
    else if(diff===0&&s.reminder_on_due&&s.template_due_name){kind="due";name=s.template_due_name;template=s.template_due}
    else if(diff<0&&(s.reminder_after_days||[]).includes(Math.abs(diff))&&s.template_after_name){kind="after";name=s.template_after_name;template=s.template_after}
    if(!kind||!name)continue;
    const key=`${kind}:${c.due_date}`;
    const {data:exists}=await db.from("message_logs").select("id").eq("charge_id",c.id).eq("automation_key",key).limit(1);if(exists?.length)continue;
    const amount=money(Number(c.amount));const message=template.replaceAll("{nome}",customer.name).replaceAll("{valor}",amount).replaceAll("{vencimento}",dateBR(c.due_date));
    const sent=await sendTemplate(conn.phone_number_id,token,to,name,s.template_language||"pt_BR",[customer.name,amount,dateBR(c.due_date)]);
    await db.from("message_logs").insert({company_id:c.company_id,customer_id:c.customer_id,charge_id:c.id,channel:"whatsapp",message,status:sent.ok?"sent":"error",sent_at:sent.ok?new Date().toISOString():null,automation_key:key,error:sent.ok?null:JSON.stringify(sent.body).slice(0,2000)});
    if(sent.ok)out.sent++;else out.errors.push({charge_id:c.id,status:sent.status,error:sent.body});
   }
  }
  return Response.json(out,{headers:{...cors,"Content-Type":"application/json"}});
 }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:"unknown_error"},{status:500,headers:cors})}
});
