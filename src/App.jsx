import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight, Bell, Check, ChevronRight, CircleDollarSign, CreditCard,
  LayoutDashboard, LogOut, Menu, MessageCircle, Plus, Receipt, Settings,
  Sparkles, TrendingUp, UserRound, Users, X, Wallet, Search, MoreHorizontal
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { PLAN_OPTIONS } from "./lib/plans";

const money = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
const todayISO = () => new Date().toISOString().slice(0,10);

function Button({children, variant="primary", className="", ...props}) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>;
}

function Input({label, ...props}) {
  return <label className="field"><span>{label}</span><input {...props}/></label>;
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setLoading(false); });
    const {data: listener} = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="screen-center">Carregando...</div>;
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={session ? <Navigate to="/app" replace/> : <Login />} />
    <Route path="/cadastro" element={session ? <Navigate to="/onboarding" replace/> : <Signup />} />
    <Route path="/recuperar" element={<ForgotPassword />} />
    <Route path="/nova-senha" element={<ResetPassword />} />
    <Route path="/onboarding" element={session ? <Onboarding session={session}/> : <Navigate to="/login" replace/>} />
    <Route path="/app/*" element={session ? <AppShell session={session}/> : <Navigate to="/login" replace/>} />
    <Route path="*" element={<Navigate to="/" replace/>} />
  </Routes>;
}

function Landing() {
  return <div>
    <header className="site-header">
      <Link to="/" className="brand"><img className="brand-logo" src="/logo.png" alt="CobrançaPro" /></Link>
      <nav><a href="#recursos">Recursos</a><a href="#como">Como funciona</a><a href="#precos">Preços</a></nav>
      <div className="header-actions"><Link to="/login" className="link-btn">Entrar</Link><Link to="/cadastro" className="btn btn-primary">Começar grátis <ArrowRight size={16}/></Link></div>
    </header>
    <main>
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow"><span className="dot"></span> Gestão de cobranças simples</div>
          <h1>Receba no prazo.<br/><em>Sem ficar correndo atrás.</em></h1>
          <p>Organize suas cobranças, veja quem precisa ser cobrado hoje e envie lembretes pelo WhatsApp em poucos cliques.</p>
          <div className="hero-actions"><Link to="/cadastro" className="btn btn-primary btn-lg">Começar grátis <ArrowRight size={18}/></Link><a href="#como" className="btn btn-secondary btn-lg">Ver como funciona</a></div>
          <div className="trust"><Check size={16}/> Feito para pequenos negócios <Check size={16}/> Comece grátis</div>
        </div>
        <DashboardPreview/>
      </section>

      <section id="como" className="section soft"><div className="container">
        <div className="section-heading"><span className="eyebrow">Como funciona</span><h2>Uma visão clara de tudo que você precisa receber.</h2></div>
        <div className="steps">
          {[
            ["01","Cadastre seus clientes","Tenha todos os contatos e históricos em um só lugar."],
            ["02","Crie suas cobranças","Defina valor, vencimento, serviço e recorrência."],
            ["03","Veja quem cobrar","O dashboard destaca automaticamente o que precisa de atenção."],
            ["04","Envie pelo WhatsApp","Abra uma mensagem pronta e cobre de forma profissional."]
          ].map(x=><div className="step" key={x[0]}><span>{x[0]}</span><h3>{x[1]}</h3><p>{x[2]}</p></div>)}
        </div>
      </div></section>

      <section id="recursos" className="section"><div className="container">
        <div className="section-heading"><span className="eyebrow">Recursos</span><h2>Tudo que você precisa para receber melhor.</h2></div>
        <div className="feature-grid">
          {[
            [LayoutDashboard,"Dashboard financeiro","Veja a receber, vencendo hoje, atrasado e recebido."],
            [Users,"Clientes","Cadastre clientes e acompanhe todo o histórico."],
            [Receipt,"Cobranças","Crie, acompanhe e marque cobranças como pagas."],
            [MessageCircle,"WhatsApp","Mensagens prontas para cobrar sem perder tempo."],
            [Sparkles,"Assistente IA","Crie mensagens naturais para cada situação."],
            [TrendingUp,"Relatórios","Acompanhe recebimentos e cobranças em um só lugar."]
          ].map(([Icon,t,p])=><div className="feature-card" key={t}><div className="icon-box"><Icon size={20}/></div><h3>{t}</h3><p>{p}</p></div>)}
        </div>
      </div></section>

      <section id="precos" className="section soft"><div className="container">
        <div className="section-heading center"><span className="eyebrow">Preços</span><h2>Escolha o plano ideal para sua empresa.</h2><p>Comece grátis e faça upgrade quando precisar de mais recursos.</p></div>
        <div className="pricing">
          {PLAN_OPTIONS.map(plan => <Price key={plan.key} plan={plan} featured={plan.key==="profissional"}/>)}
        </div>
      </div></section>

      <section className="cta"><div className="container cta-inner"><div><span className="eyebrow">CobrançaPro</span><h2>Comece a organizar suas cobranças hoje.</h2></div><Link to="/cadastro" className="btn btn-white btn-lg">Criar minha conta <ArrowRight size={18}/></Link></div></section>
    </main>
    <footer className="footer"><div className="container"><span>© 2026 CobrançaPro</span><span>Receba no prazo. Sem ficar correndo atrás.</span></div></footer>
  </div>;
}

function DashboardPreview() {
  return <div className="preview-wrap"><div className="glow"></div><div className="preview">
    <div className="preview-top"><div><b>Bom dia, Lucas</b><span>Aqui está o que precisa da sua atenção.</span></div><Bell size={18}/></div>
    <div className="preview-cards"><div><span>A receber</span><b>R$ 12.450</b></div><div><span>Vencendo hoje</span><b>R$ 1.280</b></div><div><span>Atrasado</span><b>R$ 2.430</b></div></div>
    <div className="preview-list"><div className="list-title">Quem eu preciso cobrar hoje?</div>
      {[["João Silva","Mensalidade","R$ 350","Hoje"],["Maria Souza","Serviço","R$ 180","2 dias atrasado"],["Carlos Lima","Consultoria","R$ 900","Amanhã"]].map(x=><div className="preview-row" key={x[0]}><div><b>{x[0]}</b><span>{x[1]}</span></div><strong>{x[2]}</strong><small>{x[3]}</small></div>)}
    </div>
  </div></div>
}

function Price({plan, featured}) {
  const isFree = !!plan.free;
  return <div className={`price-card ${featured?"featured":""} ${isFree?"free-card":""}`}>
    {featured && <div className="popular">Mais escolhido</div>}
    <div className="price-head">
      <div><span className="price-kicker">{isFree ? "PARA COMEÇAR" : plan.key==="business" ? "PARA EQUIPES" : plan.key==="profissional" ? "PARA CRESCER" : "PARA ORGANIZAR"}</span><h3>{plan.title}</h3></div>
    </div>
    <p>{plan.desc}</p>
    <div className="price"><small>R$</small>{plan.monthlyPrice}<span>{isFree ? "para sempre" : "/mês"}</span></div>
    {!isFree && <div className="price-annual"><b>R$ {plan.annualPrice}</b><span>/ano no plano anual</span></div>}
    <div className="price-benefits-title">O que está incluído:</div>
    <div className="price-items">{plan.items.map(i=><div className="price-item" key={i}><Check size={16}/><span>{i}</span></div>)}</div>
    <div className="price-actions">
      {isFree ? <Link to="/cadastro" className="btn btn-secondary full">Começar grátis <ArrowRight size={16}/></Link> : <>
        <a href={plan.monthlyCheckout} className={`btn ${featured?"btn-primary":"btn-secondary"} full`}>Assinar mensal</a>
        <a href={plan.annualCheckout} className="btn btn-secondary full">Assinar anual</a>
      </>}
    </div>
    <div className="price-note">{isFree ? "Sem cartão de crédito." : `Economize no anual: R$ ${plan.annualPrice}/ano`}</div>
  </div>;
}

function AuthLayout({children,title,subtitle}) {
  return <div className="auth-page"><div className="auth-card"><Link to="/" className="brand auth-brand"><img className="brand-logo" src="/logo.png" alt="CobrançaPro" /></Link><div className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></div>{children}</div></div>
}

function Login() {
  const nav=useNavigate(); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setError("");setBusy(true); if(!supabase){setError("Configure o Supabase no arquivo .env.local.");setBusy(false);return;} const {error}=await supabase.auth.signInWithPassword({email,password}); if(error)setError(error.message==="Invalid login credentials"?"E-mail ou senha incorretos.":error.message);else nav("/app");setBusy(false);}
  return <AuthLayout title="Bem-vindo de volta" subtitle="Entre na sua conta para continuar."><form onSubmit={submit} className="form-stack"><Input label="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><Input label="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><div className="form-meta"><Link to="/recuperar">Esqueci minha senha</Link></div>{error&&<div className="error">{error}</div>}<Button disabled={busy}>{busy?"Entrando...":"Entrar"}</Button></form><div className="auth-bottom">Ainda não tem conta? <Link to="/cadastro">Criar conta</Link></div></AuthLayout>
}

function Signup() {
  const nav=useNavigate(); const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [company,setCompany]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setError("");setBusy(true); if(!supabase){setError("Configure o Supabase no arquivo .env.local.");setBusy(false);return;}
    const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name,company_name:company}}});
    if(error){setError(error.message);setBusy(false);return;}
    if(data.session){nav("/onboarding");setBusy(false);return;}
  if(data.user && Array.isArray(data.user.identities) && data.user.identities.length===0){setError("Este e-mail já possui uma conta. Faça login ou use \"Esqueci minha senha\".");setBusy(false);return;}
  const {error:loginError}=await supabase.auth.signInWithPassword({email,password});
  if(loginError) setError(loginError.message==="Invalid login credentials"?"Este e-mail já possui uma conta com outra senha. Faça login ou recupere a senha.":loginError.message); else nav("/onboarding");
    setBusy(false);
  }
  return <AuthLayout title="Crie sua conta" subtitle="Comece a organizar suas cobranças gratuitamente."><form onSubmit={submit} className="form-stack"><Input label="Seu nome" value={name} onChange={e=>setName(e.target.value)} required/><Input label="Nome da empresa" value={company} onChange={e=>setCompany(e.target.value)} required/><Input label="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><Input label="Senha" type="password" minLength="6" value={password} onChange={e=>setPassword(e.target.value)} required/>{error&&<div className="error">{error}</div>}<Button disabled={busy}>{busy?"Criando...":"Criar conta"}</Button></form><div className="auth-bottom">Já possui uma conta? <Link to="/login">Entrar</Link></div></AuthLayout>
}

function ForgotPassword() {
  const [email,setEmail]=useState(""); const [done,setDone]=useState(false); const [error,setError]=useState("");
  async function submit(e){e.preventDefault();setError("");if(!supabase){setError("Configure o Supabase primeiro.");return;}const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/nova-senha`});if(error)setError(error.message);else setDone(true);}
  return <AuthLayout title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">{done?<div className="success-box"><Check size={20}/> Verifique seu e-mail para continuar.</div>:<form onSubmit={submit} className="form-stack"><Input label="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>{error&&<div className="error">{error}</div>}<Button>Enviar link</Button></form>}<div className="auth-bottom"><Link to="/login">Voltar para login</Link></div></AuthLayout>
}

function ResetPassword() {
  const nav=useNavigate(); const [password,setPassword]=useState(""); const [done,setDone]=useState(false); const [error,setError]=useState("");
  async function submit(e){e.preventDefault();if(!supabase)return setError("Configure o Supabase.");const {error}=await supabase.auth.updateUser({password});if(error)setError(error.message);else{setDone(true);setTimeout(()=>nav("/app"),900);}}
  return <AuthLayout title="Nova senha" subtitle="Escolha uma senha nova para sua conta.">{done?<div className="success-box"><Check size={20}/> Senha alterada. Entrando...</div>:<form onSubmit={submit} className="form-stack"><Input label="Nova senha" type="password" minLength="6" value={password} onChange={e=>setPassword(e.target.value)} required/>{error&&<div className="error">{error}</div>}<Button>Salvar nova senha</Button></form>}</AuthLayout>
}

function Onboarding({session}) {
  const nav=useNavigate(); const [step,setStep]=useState(1); const [company,setCompany]=useState(""); const [segment,setSegment]=useState(""); const [phone,setPhone]=useState(""); const [methods,setMethods]=useState(["Pix"]); const [busy,setBusy]=useState(false);
  async function finish(){if(!supabase)return;setBusy(true);const {data:profile}=await supabase.from("profiles").select("id,company_id").eq("id",session.user.id).single();let companyId=profile?.company_id;
if(!companyId){const {data:newId,error}=await supabase.rpc("create_my_company",{p_name:company||session.user.user_metadata?.company_name||"Minha empresa",p_segment:segment||null,p_phone:phone||null});if(error){alert(error.message);setBusy(false);return;}companyId=newId;await supabase.from("profiles").update({full_name:session.user.user_metadata?.full_name||""}).eq("id",session.user.id);}
await supabase.from("company_settings").upsert({company_id:companyId,default_payment_methods:methods},{onConflict:"company_id"});await supabase.from("ai_settings").upsert({company_id:companyId},{onConflict:"company_id"});
    setBusy(false);nav("/app");
  }
  return <div className="auth-page"><div className="onboard-card"><Link to="/" className="brand"><img className="brand-logo" src="/logo.png" alt="CobrançaPro" /></Link><div className="progress"><span style={{width:`${step*33.33}%`}}></span></div>{step===1&&<><div className="auth-heading"><h1>Vamos configurar seu negócio.</h1><p>Leva menos de 1 minuto.</p></div><div className="form-stack"><Input label="Nome da empresa" value={company} onChange={e=>setCompany(e.target.value)} required/><Input label="Segmento" placeholder="Ex.: salão, clínica, agência..." value={segment} onChange={e=>setSegment(e.target.value)}/><Input label="Telefone" value={phone} onChange={e=>setPhone(e.target.value)}/><Button onClick={()=>setStep(2)}>Continuar <ArrowRight size={16}/></Button></div></>}{step===2&&<><div className="auth-heading"><h1>Como você recebe?</h1><p>Selecione as formas que sua empresa utiliza.</p></div><div className="choice-grid">{["Pix","Dinheiro","Cartão","Transferência","Outro"].map(m=><button type="button" className={`choice ${methods.includes(m)?"selected":""}`} onClick={()=>setMethods(x=>x.includes(m)?x.filter(a=>a!==m):[...x,m])} key={m}>{methods.includes(m)&&<Check size={16}/>} {m}</button>)}</div><div className="onboard-actions"><Button variant="secondary" onClick={()=>setStep(1)}>Voltar</Button><Button onClick={()=>setStep(3)}>Continuar <ArrowRight size={16}/></Button></div></>}{step===3&&<><div className="auth-heading"><h1>Seu CobrançaPro está pronto.</h1><p>Você poderá configurar o WhatsApp e a IA depois.</p></div><div className="finish-box"><MessageCircle size={20}/><div><b>WhatsApp</b><span>Envie cobranças com mensagens prontas.</span></div></div><div className="finish-box"><Sparkles size={20}/><div><b>Assistente IA</b><span>Crie mensagens naturais para cada situação.</span></div></div><div className="onboard-actions"><Button variant="secondary" onClick={()=>setStep(2)}>Voltar</Button><Button onClick={finish} disabled={busy}>{busy?"Salvando...":"Ir para o dashboard"} <ArrowRight size={16}/></Button></div></>}</div></div>
}

function AppShell({session}) {
  const nav=useNavigate(); const loc=useLocation(); const [mobile,setMobile]=useState(false);
  async function logout(){await supabase?.auth.signOut();nav("/");}
  const links=[["/app",LayoutDashboard,"Dashboard"],["/app/clientes",Users,"Clientes"],["/app/cobrancas",Receipt,"Cobranças"],["/app/recebimentos",Wallet,"Recebimentos"],["/app/relatorios",TrendingUp,"Relatórios"],["/app/ia",Sparkles,"Assistente IA"],["/app/configuracoes",Settings,"Configurações"]];
  return <div className="app-layout"><aside className={`sidebar ${mobile?"open":""}`}><Link to="/" className="brand side-brand"><img className="brand-logo" src="/logo.png" alt="CobrançaPro" /></Link><div className="side-nav">{links.map(([path,Icon,label])=><Link onClick={()=>setMobile(false)} className={loc.pathname===path?"active":""} to={path} key={path}><Icon size={18}/>{label}</Link>)}</div><div className="side-bottom"><div className="user-mini"><div className="avatar">{(session.user.user_metadata?.full_name||session.user.email||"U").slice(0,1).toUpperCase()}</div><div><b>{session.user.user_metadata?.full_name||"Usuário"}</b><span>{session.user.email}</span></div></div><button onClick={logout} className="logout"><LogOut size={17}/> Sair</button></div></aside><div className="app-main"><header className="app-header"><button className="mobile-menu" onClick={()=>setMobile(x=>!x)}><Menu/></button><div className="header-search"><Search size={17}/><input placeholder="Buscar..." /></div><div className="header-right"><Bell size={18}/><div className="avatar">{(session.user.user_metadata?.full_name||"U").slice(0,1).toUpperCase()}</div></div></header><div className="page"><Routes><Route index element={<Dashboard session={session}/>}/><Route path="clientes" element={<Customers/>}/><Route path="cobrancas" element={<Charges/>}/><Route path="recebimentos" element={<Payments/>}/><Route path="relatorios" element={<Reports/>}/><Route path="ia" element={<AIPage/>}/><Route path="configuracoes/*" element={<SettingsPage/>}/><Route path="*" element={<Navigate to="/app" replace/>}/></Routes></div></div></div>
}

function useCompany() {
  const [companyId,setCompanyId]=useState(null);
  useEffect(()=>{supabase?.auth.getUser().then(async({data})=>{if(!data.user)return;const {data:p}=await supabase.from("profiles").select("company_id").eq("id",data.user.id).single();setCompanyId(p?.company_id||null);});},[]);
  return companyId;
}

function usePlanLimits() {
  const [profile,setProfile]=useState(null);
  useEffect(()=>{supabase?.auth.getUser().then(async({data})=>{if(!data.user)return;const {data:p}=await supabase.from("profiles").select("plan").eq("id",data.user.id).single();setProfile(p||null);});},[]);
  const planKey=profile?.plan||"free";
  const plan=PLAN_OPTIONS.find(p=>p.key===planKey)||PLAN_OPTIONS[0];
  return {
    planKey,
    maxCustomers:plan.maxCustomers,
    maxCharges:plan.maxCharges,
    planTitle:plan.title
  };
}

function Dashboard() {
  const companyId=useCompany(); const [data,setData]=useState({customers:0,receive:0,today:0,overdue:0,paid:0,charges:[]});
  useEffect(()=>{if(!companyId)return;let active=true;load();async function load(){const [c,ch,p]=await Promise.all([supabase.from("customers").select("id",{count:"exact",head:true}).eq("company_id",companyId),supabase.from("charges").select("*,customers(name,phone)").eq("company_id",companyId).order("due_date"),supabase.from("payments").select("*").eq("company_id",companyId)]);if(!active)return;setData({customers:c.count||0,receive:(ch.data||[]).filter(x=>x.status==="pending").reduce((a,x)=>a+Number(x.amount),0),today:(ch.data||[]).filter(x=>x.status==="pending"&&x.due_date===todayISO()).reduce((a,x)=>a+Number(x.amount),0),overdue:(ch.data||[]).filter(x=>x.status==="pending"&&x.due_date<todayISO()).reduce((a,x)=>a+Number(x.amount),0),paid:(p.data||[]).reduce((a,x)=>a+Number(x.amount),0),charges:ch.data||[]});}return()=>{active=false};},[companyId]);
  return <><PageTitle title="Dashboard" subtitle="Visão geral da sua operação."/><div className="metric-grid"><Metric title="Clientes" value={data.customers} icon={Users}/><Metric title="A receber" value={money(data.receive)} icon={CircleDollarSign}/><Metric title="Vencendo hoje" value={money(data.today)} icon={Receipt} tone="warning"/><Metric title="Recebido" value={money(data.paid)} icon={Wallet} tone="success"/></div><div className="dashboard-grid"><div className="panel"><div className="panel-head"><div><h2>Cobranças recentes</h2><p>Veja o que precisa da sua atenção.</p></div><Link to="/app/cobrancas" className="link-btn">Ver todas</Link></div>{data.charges.length===0?<Empty text="Você ainda não possui cobranças."/>:<div className="charge-list">{data.charges.slice(0,6).map(c=><div className="charge-row" key={c.id}><div><b>{c.customers?.name||"Cliente"}</b><span>{c.description}</span></div><strong>{money(c.amount)}</strong><small>{c.status==="paid"?"Pago":c.due_date<todayISO()?"Atrasado":c.due_date===todayISO()?"Vence hoje":"A receber"}</small></div>)}</div>}</div><div className="panel"><div className="panel-head"><div><h2>Ações rápidas</h2><p>Atalhos para o dia a dia.</p></div></div><div className="quick-actions"><Link to="/app/clientes"><Users size={18}/> Novo cliente</Link><Link to="/app/cobrancas"><Receipt size={18}/> Nova cobrança</Link><Link to="/app/ia"><Sparkles size={18}/> Criar mensagem</Link></div></div></div></>;
}

function Metric({title,value,icon:Icon,tone=""}){return <div className="metric"><div className={`metric-icon ${tone}`}><Icon size={19}/></div><span>{title}</span><strong>{value}</strong></div>;}
function PageTitle({title,subtitle,action}){return <div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;}
function Empty({text}){return <div className="empty"><Receipt size={24}/><span>{text}</span></div>;}
function ChargeDetail({charge,onClose,onPaid}){const [saving,setSaving]=useState(false);async function paid(){setSaving(true);const {error}=await supabase.from("charges").update({status:"paid"}).eq("id",charge.id);if(!error){await supabase.from("payments").insert({company_id:charge.company_id,customer_id:charge.customer_id,charge_id:charge.id,amount:charge.amount,payment_method:charge.payment_method,paid_at:new Date().toISOString()});onPaid();onClose();}else alert(error.message);setSaving(false);}return <div className="modal-backdrop"><div className="modal"><button className="modal-x" onClick={onClose}><X/></button><div className="modal-head"><div className="icon-box"><Receipt/></div><div><h2>{charge.customers?.name}</h2><p>{charge.description}</p></div></div><div className="detail-grid"><div><span>Valor</span><b>{money(charge.amount)}</b></div><div><span>Vencimento</span><b>{new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")}</b></div><div><span>Método</span><b>{charge.payment_method}</b></div></div><div className="message-box">Oi! Tudo bem? Passando para lembrar da cobrança de {money(charge.amount)} com vencimento em {new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")}. Quando puder, consegue verificar? Obrigado!</div><div className="modal-actions"><Button variant="secondary" onClick={()=>{const phone=(charge.customers?.phone||"").replace(/\D/g,"");const message=`Oi! Tudo bem? Passando para lembrar da cobrança de ${money(charge.amount)} com vencimento em ${new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")}. Quando puder, consegue verificar? Obrigado!`;window.open(phone?`https://wa.me/${phone}?text=${encodeURIComponent(message)}`:`https://wa.me/?text=${encodeURIComponent(message)}`,"_blank")}}>Abrir WhatsApp</Button><Button onClick={paid} disabled={saving}><Check size={16}/> Marcar como pago</Button></div><p className="modal-note">O botão do WhatsApp abre uma conversa com a mensagem preenchida. Ele não simula um envio pela plataforma.</p></div></div>
}

function Customers() {
  const companyId=useCompany(); const [rows,setRows]=useState([]);const [search,setSearch]=useState("");const [open,setOpen]=useState(false);const [form,setForm]=useState({name:"",phone:"",email:"",notes:""});
  async function load(){if(!companyId)return;const {data}=await supabase.from("customers").select("*").eq("company_id",companyId).order("created_at",{ascending:false});setRows(data||[]);}
  useEffect(()=>{load()},[companyId]);
  async function save(e){e.preventDefault();const {data:user}=await supabase.auth.getUser();const {data:profile}=await supabase.from("profiles").select("plan").eq("id",user.user.id).single();const plan=PLAN_OPTIONS.find(p=>p.key===(profile?.plan||"free"))||PLAN_OPTIONS[0];const {count}=await supabase.from("customers").select("id",{count:"exact",head:true}).eq("company_id",companyId);if(plan.maxCustomers!==null&&(count||0)>=plan.maxCustomers){alert(`O plano ${plan.title} permite até ${plan.maxCustomers} clientes. Faça upgrade para adicionar mais.`);return;}const {error}=await supabase.from("customers").insert({...form,company_id:companyId});if(error)alert(error.message);else{setForm({name:"",phone:"",email:"",notes:""});setOpen(false);load();}}
  const filtered=rows.filter(x=>(x.name+" "+(x.phone||"")+" "+(x.email||"")).toLowerCase().includes(search.toLowerCase()));
  return <><PageTitle title="Clientes" subtitle="Organize seus clientes e acompanhe o histórico." action={<Button onClick={()=>setOpen(true)}><Plus size={17}/> Novo cliente</Button>}/><div className="toolbar"><div className="searchbox"><Search size={17}/><input placeholder="Buscar cliente..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="panel table-panel">{filtered.length===0?<Empty text="Você ainda não possui clientes."/>:<table><thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Criado em</th><th></th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><b>{c.name}</b></td><td>{c.phone||"—"}</td><td>{c.email||"—"}</td><td>{new Date(c.created_at).toLocaleDateString("pt-BR")}</td><td><MoreHorizontal size={18}/></td></tr>)}</tbody></table>}</div>{open&&<div className="modal-backdrop"><form className="modal" onSubmit={save}><button type="button" className="modal-x" onClick={()=>setOpen(false)}><X/></button><div className="modal-head"><div className="icon-box"><UserRound/></div><div><h2>Novo cliente</h2><p>Cadastre os dados básicos.</p></div></div><Input label="Nome" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><Input label="Telefone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><Input label="E-mail" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><label className="field"><span>Observações</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button type="submit">Criar cliente</Button></div></form></div>}</>
}

function Charges() {
  const companyId=useCompany();const [rows,setRows]=useState([]);const [customers,setCustomers]=useState([]);const [open,setOpen]=useState(false);const [filter,setFilter]=useState("all");const [form,setForm]=useState({customer_id:"",description:"",amount:"",due_date:todayISO(),payment_method:"Pix",recurrence:"none",notes:""});
  async function load(){if(!companyId)return;const [{data:c},{data:cu}]=await Promise.all([supabase.from("charges").select("*,customers(name,phone)").eq("company_id",companyId).order("due_date"),supabase.from("customers").select("*").eq("company_id",companyId).order("name")]);setRows(c||[]);setCustomers(cu||[]);}
  useEffect(()=>{load()},[companyId]);
  async function save(e){e.preventDefault();const {data:user}=await supabase.auth.getUser();const {data:profile}=await supabase.from("profiles").select("plan").eq("id",user.user.id).single();const plan=PLAN_OPTIONS.find(p=>p.key===(profile?.plan||"free"))||PLAN_OPTIONS[0];let query=supabase.from("charges").select("id",{count:"exact",head:true}).eq("company_id",companyId);if(plan.maxCharges!==null){const start=new Date();start.setDate(1);const firstDay=start.toISOString().slice(0,10);const next=new Date(start.getFullYear(),start.getMonth()+1,1);const nextDay=next.toISOString().slice(0,10);query=query.gte("created_at",firstDay).lt("created_at",nextDay);}const {count}=await query;if(plan.maxCharges!==null&&(count||0)>=plan.maxCharges){alert(`O plano ${plan.title} permite até ${plan.maxCharges} cobranças por mês. Faça upgrade para adicionar mais.`);return;}const {error}=await supabase.from("charges").insert({...form,company_id:companyId,amount:Number(form.amount)});if(error)alert(error.message);else{setOpen(false);setForm({customer_id:"",description:"",amount:"",due_date:todayISO(),payment_method:"Pix",recurrence:"none",notes:""});load();}}
  const filtered=rows.filter(x=>filter==="all"?true:filter==="paid"?x.status==="paid":filter==="overdue"?x.status==="pending"&&x.due_date<todayISO():filter==="today"?x.status==="pending"&&x.due_date===todayISO():x.status==="pending");
  return <><PageTitle title="Cobranças" subtitle="Acompanhe tudo que precisa ser recebido." action={<Button onClick={()=>setOpen(true)}><Plus size={17}/> Nova cobrança</Button>}/><div className="filters">{[["all","Todas"],["pending","A receber"],["today","Vencendo hoje"],["overdue","Atrasadas"],["paid","Pagas"]].map(([v,l])=><button className={filter===v?"selected":""} onClick={()=>setFilter(v)} key={v}>{l}</button>)}</div><div className="panel table-panel">{filtered.length===0?<Empty text="Nenhuma cobrança encontrada."/>:<table><thead><tr><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><b>{c.customers?.name}</b></td><td>{c.description}</td><td><b>{money(c.amount)}</b></td><td>{new Date(c.due_date+"T12:00:00").toLocaleDateString("pt-BR")}</td><td><span className={`badge ${c.status==="paid"?"green":c.due_date<todayISO()?"red":c.due_date===todayISO()?"yellow":"gray"}`}>{c.status==="paid"?"Pago":c.due_date<todayISO()?"Atrasado":c.due_date===todayISO()?"Vence hoje":"A receber"}</span></td></tr>)}</tbody></table>}</div>{open&&<div className="modal-backdrop"><form className="modal" onSubmit={save}><button type="button" className="modal-x" onClick={()=>setOpen(false)}><X/></button><div className="modal-head"><div className="icon-box"><Receipt/></div><div><h2>Nova cobrança</h2><p>Crie um valor a receber.</p></div></div><label className="field"><span>Cliente</span><select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} required><option value="">Selecione</option>{customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><Input label="Descrição" placeholder="Ex.: Mensalidade" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required/><Input label="Valor" type="number" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/><Input label="Vencimento" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} required/><label className="field"><span>Método</span><select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}>{["Pix","Dinheiro","Cartão","Transferência","Outro"].map(x=><option key={x}>{x}</option>)}</select></label><div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button type="submit">Criar cobrança</Button></div></form></div>}</>
}

function Payments(){const companyId=useCompany();const [rows,setRows]=useState([]);useEffect(()=>{if(companyId)supabase.from("payments").select("*,customers(name),charges(description)").eq("company_id",companyId).order("paid_at",{ascending:false}).then(({data})=>setRows(data||[]));},[companyId]);const total=rows.reduce((a,x)=>a+Number(x.amount),0);return <><PageTitle title="Recebimentos" subtitle="Tudo que sua empresa já recebeu."/><div className="metric-grid three"><Metric title="Total recebido" value={money(total)} icon={Wallet} tone="success"/><Metric title="Recebido hoje" value={money(rows.filter(x=>x.paid_at.slice(0,10)===todayISO()).reduce((a,x)=>a+Number(x.amount),0))} icon={Check} tone="success"/><Metric title="Lançamentos" value={rows.length} icon={Receipt}/></div><div className="panel table-panel">{rows.length===0?<Empty text="Nenhum recebimento registrado ainda."/>:<table><thead><tr><th>Cliente</th><th>Valor</th><th>Data</th><th>Método</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td><b>{x.customers?.name||"Cliente"}</b></td><td><b>{money(x.amount)}</b></td><td>{new Date(x.paid_at).toLocaleDateString("pt-BR")}</td><td>{x.payment_method||"—"}</td></tr>)}</tbody></table>}</div></>
}

function Reports(){
  const companyId=useCompany();
  const [range,setRange]=useState("30"),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const [charges,setCharges]=useState([]),[payments,setPayments]=useState([]),[loading,setLoading]=useState(true);
  const dates=useMemo(()=>{const end=new Date();end.setHours(23,59,59,999);if(range==="custom"&&from){const start=new Date(from+"T00:00:00");const finish=to?new Date(to+"T23:59:59"):end;return{start,end:finish}}const start=new Date(end);start.setDate(start.getDate()-(range==="7"?6:range==="90"?89:29));start.setHours(0,0,0,0);return{start,end}},[range,from,to]);
  useEffect(()=>{if(!companyId)return;setLoading(true);Promise.all([supabase.from("charges").select("id,amount,due_date,status,created_at,customers(name)").eq("company_id",companyId),supabase.from("payments").select("id,amount,paid_at,customer_id,customers(name)").eq("company_id",companyId)]).then(([a,p])=>{setCharges(a.data||[]);setPayments(p.data||[]);setLoading(false);if(a.error)console.error(a.error);if(p.error)console.error(p.error)})},[companyId]);
  const inPeriod=v=>{if(!v)return false;const d=new Date(v);return d>=dates.start&&d<=dates.end};
  const pc=charges.filter(x=>x.status!=="cancelled"&&inPeriod(x.due_date+"T12:00:00")),pp=payments.filter(x=>inPeriod(x.paid_at));
  const received=pp.reduce((a,x)=>a+Number(x.amount||0),0),billed=pc.reduce((a,x)=>a+Number(x.amount||0),0),open=pc.filter(x=>x.status==="pending").reduce((a,x)=>a+Number(x.amount||0),0),overdue=pc.filter(x=>x.status==="pending"&&x.due_date<todayISO()).reduce((a,x)=>a+Number(x.amount||0),0);
  const paid=pc.filter(x=>x.status==="paid").length,late=pc.filter(x=>x.status==="pending"&&x.due_date<todayISO()).length,pending=pc.filter(x=>x.status==="pending"&&x.due_date>=todayISO()).length,rate=pc.length?Math.round(paid/pc.length*100):0,ticket=pp.length?received/pp.length:0;
  const buckets=useMemo(()=>{const total=Math.max(1,Math.ceil((dates.end-dates.start)/86400000)+1),step=Math.ceil(total/7);return Array.from({length:7},(_,i)=>{const start=new Date(dates.start);start.setDate(start.getDate()+i*step);const end=new Date(start);end.setDate(end.getDate()+step-1);if(end>dates.end)end.setTime(dates.end.getTime());const b=pc.filter(x=>{const d=new Date(x.due_date+"T12:00:00");return d>=start&&d<=end}).reduce((a,x)=>a+Number(x.amount||0),0),r=pp.filter(x=>{const d=new Date(x.paid_at);return d>=start&&d<=end}).reduce((a,x)=>a+Number(x.amount||0),0);const label=range==="7"?start.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".",""):total>45?start.toLocaleDateString("pt-BR",{month:"short"}).replace(".",""):start.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});return{i,label,b,r}})},[dates,range,pc,pp]);
  const max=Math.max(1,...buckets.flatMap(x=>[x.b,x.r])),map={};pp.forEach(x=>{const n=x.customers?.name||"Cliente";map[n]=(map[n]||0)+Number(x.amount||0)});const ranking=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const totalStatus=paid+pending+late,paidPct=totalStatus?paid/totalStatus*100:0,pendingPct=totalStatus?(paid+pending)/totalStatus*100:0,periodLabel=range==="7"?"7 dias":range==="90"?"90 dias":range==="custom"?"período selecionado":"30 dias";
  return <div className="reports-page"><PageTitle title="Relatórios" subtitle="Acompanhe o desempenho financeiro da sua empresa."/>
    <div className="report-toolbar"><div className="report-periods">{[["7","7 dias"],["30","30 dias"],["90","90 dias"],["custom","Personalizado"]].map(([v,l])=><button type="button" className={range===v?"active":""} onClick={()=>setRange(v)} key={v}>{l}</button>)}</div>{range==="custom"&&<div className="report-dates"><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/><span>até</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>}</div>
    {loading?<div className="report-skeleton"><div/><div/><div/><div/></div>:<>
      <div className="report-kpis"><Metric title="Recebido" value={money(received)} icon={Wallet} tone="success"/><Metric title="Em aberto" value={money(open)} icon={CircleDollarSign}/><Metric title="Atrasado" value={money(overdue)} icon={Receipt} tone="danger"/><Metric title="Taxa de recebimento" value={rate+"%"} icon={TrendingUp}/></div>
      <div className="report-layout">
        <section className="panel report-card report-main"><div className="report-heading"><div><h2>Desempenho financeiro</h2><p>Cobrado x recebido · {periodLabel}</p></div><div className="report-legend"><span><i className="c1"/>Cobrado</span><span><i className="c2"/>Recebido</span></div></div>
          <div className="report-chart-area"><div className="report-y-labels"><span>{money(max)}</span><span>{money(max/2)}</span><span>R$ 0</span></div><div className="report-bars">{buckets.map(x=><div className="report-bar-col" key={x.i}><div className="report-bar-wrap"><i title={"Cobrado: "+money(x.b)} style={{height:(x.b?Math.max(4,x.b/max*100):0)+"%"}}/><i title={"Recebido: "+money(x.r)} style={{height:(x.r?Math.max(4,x.r/max*100):0)+"%"}}/></div><small>{x.label}</small></div>)}</div></div>
          <div className="report-footer"><span>Total cobrado <b>{money(billed)}</b></span><span>Total recebido <b>{money(received)}</b></span></div>
        </section>
        <section className="panel report-card"><div className="report-heading"><div><h2>Status das cobranças</h2><p>Distribuição no período</p></div></div><div className="donut" style={{background:`conic-gradient(#5B5CE2 0 ${paidPct}%,#F59E0B ${paidPct}% ${pendingPct}%,#EF4444 ${pendingPct}% 100%)`}}><div><strong>{pc.length}</strong><span>cobranças</span></div></div><div className="report-status"><div><span><i className="c-paid"/>Pagas</span><b>{paid}</b></div><div><span><i className="c-pending"/>Pendentes</span><b>{pending}</b></div><div><span><i className="c-late"/>Atrasadas</span><b>{late}</b></div></div></section>
      </div>
      <div className="report-layout report-secondary"><section className="panel report-card"><div className="report-heading"><div><h2>Recebimentos por cliente</h2><p>Quem mais gerou receita no período</p></div></div>{ranking.length?<div className="report-ranking">{ranking.map(([name,value],i)=><div className="report-rank" key={name}><span>{i+1}</span><div><b>{name}</b><em><i style={{width:Math.max(6,value/ranking[0][1]*100)+"%"}}/></em></div><strong>{money(value)}</strong></div>)}</div>:<Empty text="Nenhum recebimento no período."/>}</section>
        <section className="panel report-card"><div className="report-heading"><div><h2>Resumo financeiro</h2><p>Principais indicadores</p></div></div><div className="report-summary-list"><div><span>Cobranças emitidas</span><b>{pc.length}</b></div><div><span>Cobranças pagas</span><b>{paid}</b></div><div><span>Valor cobrado</span><b>{money(billed)}</b></div><div><span>Valor recebido</span><b>{money(received)}</b></div><div><span>Valor em aberto</span><b>{money(open)}</b></div><div><span>Ticket médio</span><b>{money(ticket)}</b></div></div></section></div>
    </>}</div>;
}
function AIPage(){const [tone,setTone]=useState("Amigável");const [context,setContext]=useState("mensalidade de R$350 vence hoje");const [result,setResult]=useState("");function generate(){const intro=tone==="Profissional"?"Olá, tudo bem?":tone==="Direto"?"Olá!":tone==="Informal"?"Oi! Tudo certo?":"Oi! Tudo bem?";setResult(`${intro}\\n\\nPassando para lembrar sobre a ${context}. Quando puder, consegue verificar? Se precisar de alguma coisa, estou à disposição.`);}return <><PageTitle title="Assistente IA" subtitle="Crie mensagens de cobrança mais naturais."/><div className="ai-layout"><div className="panel"><div className="panel-head"><div><h2>Gerar mensagem</h2><p>Escolha o tom e descreva a situação.</p></div><Sparkles size={19}/></div><label className="field"><span>Tom</span><select value={tone} onChange={e=>setTone(e.target.value)}>{["Profissional","Amigável","Direto","Informal"].map(x=><option key={x}>{x}</option>)}</select></label><label className="field"><span>Contexto</span><textarea rows="4" value={context} onChange={e=>setContext(e.target.value)}/></label><Button onClick={generate}><Sparkles size={16}/> Gerar mensagem</Button></div><div className="panel ai-result"><div className="panel-head"><div><h2>Mensagem</h2><p>Revise antes de enviar.</p></div></div>{result?<><div className="generated">{result}</div><div className="modal-actions"><Button variant="secondary" onClick={generate}>Gerar outra</Button><Button onClick={()=>navigator.clipboard?.writeText(result)}>Copiar</Button></div></>:<div className="empty small"><Sparkles size={22}/><b>Sua mensagem aparecerá aqui.</b></div>}</div></div></>}

function SettingsPage(){const [tab,setTab]=useState("empresa");const [profile,setProfile]=useState(null);useEffect(()=>{supabase?.auth.getUser().then(async({data})=>{if(!data.user)return;const {data:p}=await supabase.from("profiles").select("plan,billing_cycle,subscription_status,subscription_expires_at").eq("id",data.user.id).single();setProfile(p||null);});},[]);return <><PageTitle title="Configurações" subtitle="Personalize o CobrançaPro para sua empresa."/><div className="settings-layout"><div className="settings-nav">{[["empresa","Empresa"],["whatsapp","WhatsApp"],["ia","IA"],["plano","Plano"]].map(([x,l])=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{l}</button>)}</div><div className="panel settings-panel">{tab==="empresa"&&<><h2>Empresa</h2><p>Dados básicos do seu negócio.</p><div className="form-grid"><Input label="Nome da empresa" placeholder="Minha empresa"/><Input label="Telefone" placeholder="(24) 99999-9999"/><Input label="Segmento" placeholder="Ex.: clínica"/></div><Button>Salvar alterações</Button></>}{tab==="whatsapp"&&<><h2>WhatsApp</h2><p>Prepare o canal para uma futura integração oficial.</p><div className="connection"><div><span className="status-dot"></span><b>Não conectado</b><small>Você poderá conectar o WhatsApp Business aqui.</small></div><Button>Conectar WhatsApp</Button></div></>}{tab==="ia"&&<><h2>Assistente IA</h2><p>Defina como o assistente deve escrever.</p><label className="field"><span>Nome do assistente</span><input defaultValue="Assistente CobrançaPro"/></label><label className="field"><span>Instruções</span><textarea rows="5" placeholder="Seja objetivo, educado e nunca invente valores."/></label><Button>Salvar</Button></>}{tab==="plano"&&<><h2>Plano</h2><p>Confira sua assinatura atual.</p><div className="plan-box"><b>{profile?.plan==="free"||!profile?.plan?"Grátis":profile.plan.charAt(0).toUpperCase()+profile.plan.slice(1)}</b><strong>{profile?.plan==="essencial"?"R$49,90":profile?.plan==="profissional"?"R$99,90":profile?.plan==="business"?"R$199,90":"R$0"}</strong><span>Status: {profile?.subscription_status||"inactive"}{profile?.billing_cycle?(" · "+(profile.billing_cycle==="annual"?"Anual":"Mensal")):""}</span><a href="/#precos" className="btn btn-primary">Ver planos</a></div></>}</div></div></>}

export default App;
