import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight, Bell, Check, ChevronRight, CircleDollarSign, CreditCard,
  CalendarDays, ChevronLeft, LayoutDashboard, LogOut, Menu, MessageCircle, Plus, Receipt, Settings,
  Sparkles, TrendingUp, UserRound, Users, X, Wallet, Search, MoreHorizontal, Lock, Sun, Moon
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { PLAN_OPTIONS } from "./lib/plans";

const money = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
const todayISO = () => new Date().toISOString().slice(0,10);
const TRIAL_DAYS = 7;
const trialEnd = (createdAt) => new Date(new Date(createdAt).getTime() + TRIAL_DAYS * 86400000);
const trialDaysLeft = (createdAt) => Math.max(0, Math.ceil((trialEnd(createdAt) - new Date()) / 86400000));

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
    <Route path="/" element={<Landing session={session} />} />
    <Route path="/login" element={session ? <SessionRedirect session={session}/> : <Login />} />
    <Route path="/cadastro" element={session ? <SessionRedirect session={session}/> : <Signup />} />
    <Route path="/recuperar" element={<ForgotPassword />} />
    <Route path="/nova-senha" element={<ResetPassword />} />
    <Route path="/onboarding" element={session ? <Onboarding session={session}/> : <Navigate to="/login" replace/>} />
    <Route path="/app/*" element={session ? <AppShell session={session}/> : <Navigate to="/login" replace/>} />
    <Route path="*" element={<Navigate to="/" replace/>} />
  </Routes>;
}

function getPendingCheckout() {
  try { return localStorage.getItem("pendingPerfectPayCheckout"); } catch { return null; }
}

function continuePendingCheckout(userId) {
  const pending = getPendingCheckout();
  if (!pending || !userId) return false;
  try {
    const checkoutUrl = new URL(pending);
    if (!["checkout.perfectpay.com.br","go.perfectpay.com.br"].includes(checkoutUrl.hostname)) return false;
    checkoutUrl.searchParams.set("utm_content", userId);
    localStorage.removeItem("pendingPerfectPayCheckout");
    window.location.href = checkoutUrl.toString();
    return true;
  } catch {
    localStorage.removeItem("pendingPerfectPayCheckout");
    return false;
  }
}

function SessionRedirect({session}) {
  const nav = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function redirect() {
      if (continuePendingCheckout(session?.user?.id)) return;

      // Usuário já autenticado não deve voltar para o onboarding toda vez
      // que abrir /login. Só novos usuários sem empresa precisam configurar o negócio.
      if (!supabase || !session?.user?.id) {
        if (active) nav("/login", {replace:true});
        return;
      }

      const {data: profile, error} = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (!error && profile?.company_id) {
        nav("/app", {replace:true});
      } else {
        nav("/onboarding", {replace:true});
      }
    }

    redirect().finally(() => {
      if (active) setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [session, nav]);

  return <div className="screen-center">{checking ? "Entrando..." : "Continuando..."}</div>;
}

function ScrollReveal({children, className="", delay=0}) {
  const ref = React.useRef(null);
  useEffect(()=>{
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry])=>{
      if (entry.isIntersecting) {
        el.style.setProperty("--reveal-delay", `${delay}ms`);
        el.classList.add("is-visible");
        observer.unobserve(el);
      }
    }, {threshold:0.14, rootMargin:"0px 0px -8% 0px"});
    observer.observe(el);
    return ()=>observer.disconnect();
  }, [delay]);
  return <div ref={ref} className={`scroll-reveal ${className}`}>{children}</div>;
}


function BrowserFrame({src, alt, width, height, priority}) {
  return <div className="lp-frame">
    <div className="lp-frame-bar" aria-hidden="true"><i></i><i></i><i></i></div>
    <img src={src} alt={alt} width={width} height={height} loading={priority?"eager":"lazy"} decoding="async" />
  </div>;
}

function PhoneFrame({src, alt, className=""}) {
  return <div className={`lp-phone ${className}`}><img src={src} alt={alt} width="620" height="1341" loading="lazy" decoding="async" /></div>;
}

function Landing({session}) {
  const [annualBilling,setAnnualBilling]=useState(false);
  useEffect(()=>{
    if(window.location.hash!=="#precos") return;
    const scrollToPlans=()=>document.getElementById("precos")?.scrollIntoView({behavior:"auto",block:"start"});
    const timer=setTimeout(scrollToPlans,80);
    return()=>clearTimeout(timer);
  },[]);

  useEffect(()=>{
    const selectors=[
      ".lp-problem-grid > h2",
      ".lp-problem-list > li",
      "#como .lp-heading",
      "#como .lp-step",
      "#recursos .lp-heading",
      "#recursos .lp-features > div",
      ".lp-who-text",
      "#precos .lp-heading",
      "#precos .lp-billing",
      "#precos .price-card",
      "#duvidas .lp-heading",
      "#duvidas .lp-faq > details",
      ".lp-final-in > div",
      ".lp-final-in > a"
    ];
    const items=[...document.querySelectorAll(selectors.join(","))];
    if(!items.length) return;

    items.forEach((el,index)=>{
      el.classList.add("lp-animate");
      el.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 45}ms`);
    });

    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){
      items.forEach(el=>el.classList.add("is-visible"));
      return;
    }

    const observer=new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },{
      threshold:0.08,
      rootMargin:"0px 0px -5% 0px"
    });

    items.forEach(el=>observer.observe(el));
    return()=>observer.disconnect();
  },[]);

  const steps=[
    {n:"01",title:"Cadastre seus clientes",text:"Nome, telefone e e-mail de cada cliente em um só lugar, com busca rápida. Nada de procurar contato em conversa antiga.",img:"/landing/clientes.webp",alt:"Lista de clientes do CobrançaPro com telefone e e-mail"},
    {n:"02",title:"Crie as cobranças",text:"Defina valor, vencimento e recorrência. O sistema separa sozinho o que está a receber, o que vence hoje, o que atrasou e o que já foi pago.",img:"/landing/cobrancas.webp",alt:"Lista de cobranças com status pago, a receber e atrasado"},
    {n:"03",title:"Cobre pelo WhatsApp",text:"Um clique abre o WhatsApp com a mensagem de cobrança pronta. Você confere, ajusta se quiser e envia. Quando o cliente pagar, registre o recebimento.",crop:"/landing/cobrar.webp",alt:"Cobranças atrasadas com o botão Cobrar ao lado de cada cliente"},
    {n:"04",title:"Acompanhe o resultado",text:"Veja quanto entrou, quanto está em aberto e a taxa de recebimento por período, de 7 dias até datas personalizadas.",img:"/landing/relatorios.webp",alt:"Relatórios com gráfico de cobrado e recebido por período"},
  ];
  const features=[
    ["Painel financeiro","A receber, vencendo hoje, atrasado e recebido, logo na primeira tela."],
    ["Clientes","Cadastro com telefone e e-mail, organizado e fácil de buscar."],
    ["Cobranças","Status automático, filtros por situação e recorrência."],
    ["Recebimentos","Histórico de tudo o que já foi pago, com cliente, valor e forma."],
    ["Relatórios","Gráficos de cobrado e recebido para 7, 30 ou 90 dias."],
    ["WhatsApp por link","Mensagem pronta para cada cobrança. Você revisa e envia."],
    ["Assistente de cobrança","Mensagens de cobrança adaptadas a cada situação, para você revisar e usar."],
    ["Celular e computador","Funciona direto no navegador, sem instalar nada."],
  ];
  const faq=[
    ["Preciso de cartão de crédito para testar?","Não. O teste dura 7 dias e não pede cartão de crédito."],
    ["Como funciona a cobrança pelo WhatsApp?","Em cada cobrança há um botão que abre a conversa do cliente no WhatsApp com a mensagem de cobrança pronta. Você confere e envia."],
    ["Funciona no celular?","Sim. Funciona no navegador do celular e do computador, sem instalar nada."],
    ["Posso mudar de plano depois?","Sim. Você pode começar pelo teste e escolher outro plano quando precisar."],
    ["Como é feito o pagamento da assinatura?","A assinatura, mensal ou anual, é processada pela Perfect Pay."],
    ["Meus dados ficam separados dos de outras empresas?","Sim. Cada empresa acessa apenas os próprios clientes, cobranças e recebimentos."],
  ];

  return <div className="lp">
    <header className="lp-header">
      <div className="lp-wrap lp-header-in">
        <Link to="/" className="lp-brand"><img src="/logo.png" alt="CobrançaPro" /></Link>
        <nav className="lp-nav" aria-label="Seções da página"><a href="#como">Como funciona</a><a href="#recursos">Recursos</a><a href="#precos">Planos</a><a href="#duvidas">Dúvidas</a></nav>
        <div className="lp-header-cta">
          {session ? <Link to="/app" className="lp-btn lp-btn-primary lp-btn-sm">Abrir painel</Link> : <><Link to="/login" className="lp-link">Entrar</Link><Link to="/cadastro" className="lp-btn lp-btn-primary lp-btn-sm">Começar grátis</Link></>}
        </div>
      </div>
    </header>

    <main>
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="lp-kicker">Gestão de cobranças para pequenos negócios</p>
            <h1>Todo o dinheiro que você tem a receber, <span>em uma tela só.</span></h1>
            <p className="lp-lead">Cadastre clientes, crie cobranças e veja na hora quem pagou, quem vence hoje e quem está atrasado. Cobre pelo WhatsApp com a mensagem pronta.</p>
            <div className="lp-cta-row">
              <Link to="/cadastro" className="lp-btn lp-btn-primary lp-btn-lg">Começar grátis <ArrowRight size={18}/></Link>
              <a href="#como" className="lp-btn lp-btn-ghost lp-btn-lg">Ver como funciona</a>
            </div>
            <p className="lp-micro">7 dias grátis · Sem cartão de crédito</p>
          </div>
          <div className="lp-hero-shot">
            <BrowserFrame src="/landing/dash.webp" alt="Painel do CobrançaPro mostrando valores a receber, atrasados e recebidos" width="1600" height="1000" priority />
            <PhoneFrame src="/landing/m-dash.webp" alt="Painel do CobrançaPro no celular" className="lp-phone-hero" />
            <p className="lp-caption">Telas reais do sistema, com dados de exemplo.</p>
          </div>
        </div>
      </section>

      <section className="lp-problem">
        <div className="lp-wrap lp-problem-grid">
          <h2>Cobrança espalhada em planilha, caderno e WhatsApp vira dinheiro esquecido.</h2>
          <ul className="lp-problem-list">
            <li><b>Você esquece quem venceu.</b><span>Sem um lugar único, o atraso só aparece quando o caixa aperta.</span></li>
            <li><b>Você não sabe quanto já entrou.</b><span>Somar pagamentos de várias fontes toma tempo e raramente fecha.</span></li>
            <li><b>Cobrar dá trabalho, então fica para depois.</b><span>Achar o telefone, lembrar o valor e escrever a mensagem pesa na hora de cobrar.</span></li>
          </ul>
        </div>
      </section>

      <section id="como" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-heading"><p className="lp-kicker">Como funciona</p><h2>Do cadastro ao dinheiro na conta, em quatro passos.</h2></div>
          <div className="lp-steps">
            {steps.map(st=><article className="lp-step" key={st.n}>
              <div className="lp-step-text"><span className="lp-step-n">{st.n}</span><h3>{st.title}</h3><p>{st.text}</p></div>
              <div className="lp-step-media">
                {st.crop ? <div className="lp-crop"><img src={st.crop} alt={st.alt} width="1200" height="568" loading="lazy" decoding="async" /></div> : <BrowserFrame src={st.img} alt={st.alt} width="1400" height="900" />}
              </div>
            </article>)}
          </div>
        </div>
      </section>

      <section id="recursos" className="lp-section lp-soft">
        <div className="lp-wrap">
          <div className="lp-heading"><p className="lp-kicker">Recursos</p><h2>O que vem no sistema.</h2></div>
          <dl className="lp-features">
            {features.map(([t,d])=><div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
          </dl>
        </div>
      </section>

      <section className="lp-who">
        <div className="lp-wrap">
          <p className="lp-kicker">Para quem é</p>
          <p className="lp-who-text">Feito para quem precisa receber: <b>prestadores de serviço</b>, <b>barbearias e salões</b>, <b>clínicas e consultórios</b>, <b>oficinas e negócios locais</b>, <b>profissionais autônomos</b> e <b>pequenas empresas</b> que cobram todo mês.</p>
        </div>
      </section>

      <section id="precos" className="lp-section lp-soft lp-plans">
        <div className="lp-wrap">
          <div className="lp-heading"><p className="lp-kicker">Planos</p><h2>Comece de graça. Faça upgrade quando precisar.</h2><p className="lp-sub">Teste por 7 dias, sem cartão de crédito. A assinatura é processada pela Perfect Pay.</p></div>
          <div className="lp-billing" role="group" aria-label="Periodicidade do plano">
            <button type="button" className={!annualBilling?"active":""} onClick={()=>setAnnualBilling(false)}>Mensal</button>
            <button type="button" className={annualBilling?"active":""} onClick={()=>setAnnualBilling(true)}>Anual <span>Economize 20%</span></button>
          </div>
          <div className="pricing">
            {PLAN_OPTIONS.map(plan => <Price key={plan.key} plan={plan} featured={plan.key==="profissional"} session={session} annual={annualBilling}/>)}
          </div>
        </div>
      </section>

      <section id="duvidas" className="lp-section">
        <div className="lp-wrap lp-faq-grid">
          <div className="lp-heading"><p className="lp-kicker">Dúvidas</p><h2>Perguntas frequentes.</h2></div>
          <div className="lp-faq">
            {faq.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-wrap lp-final-in">
          <div><h2>Chega de planilha para saber quem está te devendo.</h2><p>7 dias grátis · Sem cartão de crédito</p></div>
          <Link to="/cadastro" className="lp-final-cta">Começar grátis <ArrowRight size={18}/></Link>
        </div>
      </section>
    </main>

    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-in">
        <span>© 2026 CobrançaPro</span>
        <nav aria-label="Rodapé"><a href="#precos">Planos</a><Link to="/login">Entrar</Link><Link to="/cadastro">Criar conta</Link></nav>
      </div>
    </footer>
  </div>;
}

function DashboardPreview() {
  return <div className="preview-wrap">
    <div className="glow"></div>
    <div className="preview dashboard-screenshot-preview">
      <img
        src="https://i.imgur.com/6ZO9UMY.png"
        alt="Prévia do dashboard do CobrançaPro"
        className="dashboard-screenshot-image"
      />
    </div>
  </div>;
}

function Price({plan, featured, session, annual=false}) {
  const isFree = !!plan.free;
  const displayPrice = annual ? plan.annualPrice : plan.monthlyPrice;
  const periodLabel = annual ? "/ano" : "/mês";

  function startCheckout(url) {
    if (!url) return;

    const checkoutUrl = new URL(url);
    if (["checkout.perfectpay.com.br","go.perfectpay.com.br"].includes(checkoutUrl.hostname) === false) {
      console.error("Checkout inválido.");
      return;
    }

    if (session?.user?.id) {
      checkoutUrl.searchParams.set("utm_content", session.user.id);
      window.location.href = checkoutUrl.toString();
      return;
    }

    window.location.href = "/cadastro?checkout=" + encodeURIComponent(checkoutUrl.toString());
  }

  return <div className={`price-card ${featured?"featured":""} ${isFree?"free-card":""}`}>
    {featured && <div className="popular">Mais escolhido</div>}

    <div className="price-head">
      <div>
        <span className="price-kicker">
          {isFree ? "PARA COMEÇAR" : plan.key==="business" ? "PARA EQUIPES" : plan.key==="profissional" ? "PARA CRESCER" : "PARA ORGANIZAR"}
        </span>
        <h3>{plan.title}</h3>
      </div>
    </div>

    <p>{plan.desc}</p>

    <div className="price">
      <small>R$</small>{displayPrice}
      <span>{isFree ? "7 dias grátis" : periodLabel}</span>
    </div>

    <div className="price-billing-note">
      {isFree
        ? "Sem cartão de crédito."
        : annual
          ? <><strong>R$ {(Number(plan.annualPrice.replace(".","").replace(",","."))/12).toFixed(2).replace(".",",")} por mês</strong> no plano anual</>
          : "Cancele quando quiser."}
    </div>

    <div className="price-benefits-title">O que está incluído</div>
    <div className="price-items">
      {plan.items.map(i=><div className="price-item" key={i}><Check size={16}/><span>{i}</span></div>)}
    </div>

    <div className="price-actions">
      {isFree
        ? <Link to="/cadastro" className="btn btn-secondary full">Começar grátis <ArrowRight size={16}/></Link>
        : <button
            type="button"
            onClick={()=>startCheckout(annual ? plan.annualCheckout : plan.monthlyCheckout)}
            className={`btn ${featured ? "btn-primary" : "btn-secondary"} full`}
          >
            {annual ? "Escolher plano anual" : "Escolher plano"}
            <ArrowRight size={16}/>
          </button>}
    </div>

    <div className="price-note">
      {isFree ? "7 dias grátis · Sem cartão de crédito." : annual ? "Cobrança anual" : "Cobrança mensal"}
    </div>
  </div>;
}
function AuthLayout({children,title,subtitle}) {
  return <div className="auth-page"><div className="auth-card"><Link to="/" className="brand auth-brand"><img className="brand-logo" src="/logo.png" alt="CobrançaPro" /></Link><div className="auth-heading"><h1>{title}</h1><p>{subtitle}</p></div>{children}</div></div>
}

function Login() {
  const nav=useNavigate(); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const checkout=new URLSearchParams(window.location.search).get("checkout");
  async function submit(e){
    e.preventDefault();setError("");setBusy(true);
    if(!supabase){setError("Configure o Supabase no arquivo .env.local.");setBusy(false);return;}
    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error){setError(error.message==="Invalid login credentials"?"E-mail ou senha incorretos.":error.message);setBusy(false);return;}
    if(continuePendingCheckout(data?.user?.id)) return;
    if(checkout && data?.user?.id){
      const checkoutUrl=new URL(checkout);
      checkoutUrl.searchParams.set("utm_content",data.user.id);
      window.location.href=checkoutUrl.toString();
      return;
    }
    nav("/app");setBusy(false);
  }
  return <AuthLayout title="Bem-vindo de volta" subtitle="Entre na sua conta para continuar."><form onSubmit={submit} className="form-stack"><Input label="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><Input label="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><div className="form-meta"><Link to="/recuperar">Esqueci minha senha</Link></div>{error&&<div className="error">{error}</div>}<Button disabled={busy}>{busy?"Entrando...":"Entrar"}</Button></form><div className="auth-bottom">Ainda não tem conta? <Link to={checkout?`/cadastro?checkout=${encodeURIComponent(checkout)}`:"/cadastro"}>Criar conta</Link></div></AuthLayout>
}

function Signup() {
  const nav=useNavigate(); const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [company,setCompany]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const checkout=new URLSearchParams(window.location.search).get("checkout");
  function continueToCheckout(userId){
    if(continuePendingCheckout(userId)) return true;
    if(!checkout || !userId) return false;
    const checkoutUrl=new URL(checkout);
    checkoutUrl.searchParams.set("utm_content",userId);
    window.location.href=checkoutUrl.toString();
    return true;
  }
  async function submit(e){e.preventDefault();setError("");setBusy(true); if(!supabase){setError("Configure o Supabase no arquivo .env.local.");setBusy(false);return;}
    const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name,company_name:company}}});
    if(error){setError(error.message);setBusy(false);return;}
    if(data.session){
      if(!continueToCheckout(data.user?.id)) nav("/onboarding");
      setBusy(false);
      return;
    }

    if(data.user && Array.isArray(data.user.identities) && data.user.identities.length===0){
      setError("Este e-mail já possui uma conta. Faça login ou use \"Esqueci minha senha\".");
      setBusy(false);
      return;
    }

    // Se a confirmação de e-mail estiver ativa no Supabase, não existe sessão ainda.
    // Mantemos o checkout na URL e orientamos o usuário a confirmar o e-mail e entrar.
    if(data.user && checkout){
      setError("Conta criada. Confirme seu e-mail e depois entre na sua conta para continuar o pagamento.");
      setBusy(false);
      return;
    }

    const {error:loginError,data:loginData}=await supabase.auth.signInWithPassword({email,password});
    if(loginError) setError(loginError.message==="Invalid login credentials"?"Este e-mail já possui uma conta com outra senha. Faça login ou recupere a senha.":loginError.message);
    else if(!continueToCheckout(loginData?.user?.id)) nav("/onboarding");
    setBusy(false);
  }
  return <AuthLayout title="Crie sua conta" subtitle="Teste o CobrançaPro grátis por 7 dias, sem cartão de crédito."><form onSubmit={submit} className="form-stack"><Input label="Seu nome" value={name} onChange={e=>setName(e.target.value)} required/><Input label="Nome da empresa" value={company} onChange={e=>setCompany(e.target.value)} required/><Input label="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><Input label="Senha" type="password" minLength="6" value={password} onChange={e=>setPassword(e.target.value)} required/>{error&&<div className="error">{error}</div>}<Button disabled={busy}>{busy?"Criando...":"Criar conta"}</Button></form><div className="auth-bottom">Já possui uma conta? <Link to="/login">Entrar</Link></div></AuthLayout>
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
  const nav=useNavigate(); const loc=useLocation(); const [mobile,setMobile]=useState(false); const [notificationsOpen,setNotificationsOpen]=useState(false); const [profileOpen,setProfileOpen]=useState(false); const [notificationCount,setNotificationCount]=useState(0); const [trialBlocked,setTrialBlocked]=useState(false); const [trialLoading,setTrialLoading]=useState(true); const [trialDays,setTrialDays]=useState(TRIAL_DAYS); const [currentPlan,setCurrentPlan]=useState("free"); const [expiredPaidSubscription,setExpiredPaidSubscription]=useState(false); const touchStartX=React.useRef(null); const touchStartY=React.useRef(null); const pointerStartX=React.useRef(null); const pointerStartY=React.useRef(null);
  const [theme,setTheme]=useState(()=>{
    try { return localStorage.getItem("cobrancapro-theme")==="dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  useEffect(()=>{
    if(theme==="dark") document.documentElement.setAttribute("data-theme","dark");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("cobrancapro-theme",theme); } catch {}
    return ()=>{
      document.documentElement.removeAttribute("data-theme");
    };
  },[theme]);
  const fullName=session.user.user_metadata?.full_name||"Usuário"; const email=session.user.email||""; const initials=(fullName||email||"U").slice(0,1).toUpperCase(); const [companyAvatar,setCompanyAvatar]=useState("");
  const [companyId,setCompanyId]=useState(null);
  const [globalSearch,setGlobalSearch]=useState("");
  const [globalResults,setGlobalResults]=useState({customers:[],charges:[]});
  const [chargesOpen,setChargesOpen]=useState(loc.pathname.startsWith("/app/cobrancas"));
  useEffect(()=>{if(loc.pathname.startsWith("/app/cobrancas"))setChargesOpen(true);},[loc.pathname]);
   useEffect(()=>{let active=true;async function loadAccount(){const {data:profile}=await supabase.from("profiles").select("company_id,plan,billing_cycle,subscription_expires_at,subscription_status").eq("id",session.user.id).single();if(!active)return;const planKey=profile?.plan||"free";const expires=profile?.subscription_expires_at?new Date(profile.subscription_expires_at):trialEnd(session.user.created_at);const now=new Date();const paidPlan=planKey!=="free";const paidAccess=paidPlan&&expires>now;const expiredPaidSubscription=paidPlan&&expires<=now;setCompanyId(profile?.company_id||null);setCurrentPlan(paidAccess?planKey:"free");const days=Math.max(0,Math.ceil((expires-now)/86400000));setTrialDays(days);setTrialBlocked(expires<=now);setExpiredPaidSubscription(expiredPaidSubscription);setTrialLoading(false);if(!profile?.subscription_expires_at){await supabase.from("profiles").update({subscription_expires_at:expires.toISOString()}).eq("id",session.user.id);}if(!profile?.company_id){return;}const {data:company}=await supabase.from("companies").select("avatar_url").eq("id",profile.company_id).maybeSingle();if(active)setCompanyAvatar(company?.avatar_url||"");const {data}=await supabase.from("charges").select("id,due_date,status").eq("company_id",profile.company_id).eq("status","pending");if(active)setNotificationCount((data||[]).filter(x=>x.due_date<=todayISO()).length);}loadAccount();return()=>{active=false};},[session.user.id,session.user.created_at]);
  useEffect(()=>{if(trialDays>0&&!trialBlocked)document.title=`CobrançaPro · ${trialDays} dias grátis`;},[trialDays,trialBlocked]);
  useEffect(()=>{
    const term=globalSearch.trim();
    if(!companyId||term.length<2){setGlobalResults({customers:[],charges:[]});return;}
    let active=true;
    const timer=setTimeout(async()=>{
      const like="%" + term + "%";
      const [{data:customers},{data:charges}]=await Promise.all([
        supabase.from("customers").select("id,name,phone,email").eq("company_id",companyId).or("name.ilike."+like+",phone.ilike."+like+",email.ilike."+like).order("name").limit(5),
        supabase.from("charges").select("id,description,amount,due_date,status,customer_id,customers(name)").eq("company_id",companyId).ilike("description",like).order("due_date",{ascending:true}).limit(5)
      ]);
      if(active)setGlobalResults({customers:customers||[],charges:charges||[]});
    },220);
    return()=>{active=false;clearTimeout(timer)};
  },[globalSearch,companyId]);
  async function logout(){await supabase?.auth.signOut();nav("/");}
  if(trialLoading) return <div className="screen-center">Verificando seu acesso...</div>;
  if(trialBlocked) return <div className="auth-page"><div className="auth-card"><Link to="/" className="brand auth-brand"><img className="brand-logo" src="/logo.png" alt="CobrançaPro" /></Link><div className="auth-heading"><h1>{expiredPaidSubscription?"Sua assinatura expirou":"Seu teste grátis terminou"}</h1><p>{expiredPaidSubscription?"O período da sua assinatura chegou ao fim. Escolha um plano para continuar usando o CobrançaPro.":"Seus 7 dias de acesso chegaram ao fim. Escolha um plano para continuar usando o CobrançaPro."}</p></div><div className="finish-box"><CreditCard size={20}/><div><b>Escolha seu plano</b><span>Assine o Essencial, Profissional ou Business e continue de onde parou.</span></div></div><a href="/#precos" className="btn btn-primary full">Ver planos <ArrowRight size={16}/></a><button className="btn btn-secondary full" onClick={logout}>Sair da conta</button></div></div>;
  function openNotifications(){setNotificationsOpen(x=>!x);setProfileOpen(false);setMobile(false);}
  function openProfile(){setProfileOpen(x=>!x);setNotificationsOpen(false);setMobile(false);}
  function handleTouchStart(e){const t=e.touches?.[0];if(!t)return;touchStartX.current=t.clientX;touchStartY.current=t.clientY;}
  function handleTouchEnd(e){const t=e.changedTouches?.[0],sx=touchStartX.current,sy=touchStartY.current;touchStartX.current=null;touchStartY.current=null;if(!t||sx===null||sy===null)return;const dx=t.clientX-sx,dy=t.clientY-sy;if(Math.abs(dx)<45||Math.abs(dx)<=Math.abs(dy)*1.05)return;setMobile(false);setNotificationsOpen(false);setProfileOpen(false);}  function handlePointerDown(e){if(e.pointerType==="mouse")return;pointerStartX.current=e.clientX;pointerStartY.current=e.clientY;}
  function handlePointerUp(e){if(e.pointerType==="mouse")return;const sx=pointerStartX.current,sy=pointerStartY.current;pointerStartX.current=null;pointerStartY.current=null;if(sx===null||sy===null)return;const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.05){setMobile(false);setNotificationsOpen(false);setProfileOpen(false);}}

  const hasAIAccess=currentPlan==="profissional"||currentPlan==="business";
  const links=[["/app",LayoutDashboard,"Dashboard"],["/app/clientes",Users,"Clientes"],["/app/cobrancas",Receipt,"Cobranças"],["/app/recebimentos",Wallet,"Recebimentos"],["/app/calendario",CalendarDays,"Calendário"],["/app/relatorios",TrendingUp,"Relatórios"],["/app/ia",Sparkles,"Assistente IA"],["/app/configuracoes",Settings,"Configurações"]];
  return <div className="app-layout" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>{mobile&&<button className="sidebar-backdrop" aria-label="Fechar menu" onClick={()=>setMobile(false)}></button>}<aside className={`sidebar ${mobile?"open":""}`}><div className="mobile-sidebar-head"><Link to="/" className="brand side-brand"><img className="brand-logo" src="/logo.png" alt="CobrançaPro" /></Link>{mobile&&<button className="mobile-sidebar-close" onClick={()=>setMobile(false)} aria-label="Fechar menu"><X size={20}/></button>}</div><div className="side-nav">
    {links.slice(0,2).map(([path,Icon,label])=><Link onClick={()=>setMobile(false)} className={loc.pathname===path?"active":""} to={path} key={path}><Icon size={18}/>{label}</Link>)}
    <div className="side-nav-group">
      <button type="button" className={"side-nav-parent "+(loc.pathname.startsWith("/app/cobrancas")?"active":"")} onClick={()=>setChargesOpen(x=>!x)}>
        <Receipt size={18}/><span>Cobranças</span><ChevronRight size={14} className={chargesOpen?"side-nav-chevron open":"side-nav-chevron"}/>
      </button>
      {chargesOpen&&<div className="side-nav-sub">
        <Link onClick={()=>setMobile(false)} className={loc.search.includes("filter=pending")?"active":""} to="/app/cobrancas?filter=pending"><span>A receber</span></Link>
        <Link onClick={()=>setMobile(false)} className={loc.search.includes("filter=overdue")?"active":""} to="/app/cobrancas?filter=overdue"><span>Atrasadas</span></Link>
        <Link onClick={()=>setMobile(false)} className={loc.search.includes("filter=paid")?"active":""} to="/app/cobrancas?filter=paid"><span>Recebidas</span></Link>
      </div>}
    </div>
    {links.slice(3).map(([path,Icon,label])=>{const locked=path==="/app/ia"&&!hasAIAccess;return <Link onClick={()=>{setMobile(false);if(locked){setTrialBlocked(false);}}} className={loc.pathname===path?"active":""} to={path} key={path}><Icon size={18}/>{label}{locked&&<Lock size={13} className="nav-lock"/>}</Link>;})}
  </div><div className="side-bottom"><button className="user-mini user-mini-button" onClick={openProfile}><div className="avatar">{initials}</div><div><b>{fullName}</b><span>{email}</span></div></button><button onClick={logout} className="logout"><LogOut size={17}/> Sair</button></div></aside><div className="app-main"><header className="app-header"><button className="mobile-menu" onClick={()=>setMobile(x=>!x)}><Menu/></button><div className="header-search global-search"><Search size={17}/><input placeholder="Buscar clientes ou cobranças..." value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} /><span className="global-search-count">{globalSearch.trim().length>=2?(globalResults.customers.length+globalResults.charges.length):""}</span>{globalSearch.trim().length>=2&&<div className="global-search-results">{globalResults.customers.length===0&&globalResults.charges.length===0?<div className="global-search-empty">Nenhum resultado encontrado.</div>:<>{globalResults.customers.length>0&&<><div className="global-search-section">Clientes</div>{globalResults.customers.map(c=><Link key={c.id} to={"/app/clientes?q="+encodeURIComponent(c.name)} onClick={()=>setGlobalSearch("")}><Users size={15}/><div><b>{c.name}</b><span>{c.phone||c.email||"Cliente"}</span></div></Link>)}</>}{globalResults.charges.length>0&&<><div className="global-search-section">Cobranças</div>{globalResults.charges.map(c=><Link key={c.id} to={"/app/cobrancas?q="+encodeURIComponent(c.description||c.customers?.name||"")} onClick={()=>setGlobalSearch("")}><Receipt size={15}/><div><b>{c.customers?.name||"Cliente"} · {money(c.amount)}</b><span>{c.description||"Cobrança"} · {new Date(c.due_date+"T12:00:00").toLocaleDateString("pt-BR")}</span></div></Link>)}</>}</>}</div>}</div><div className="header-right"><div className="theme-switch" role="group" aria-label="Tema do sistema"><button type="button" className={`theme-choice ${theme==="light"?"active":""}`} onClick={()=>setTheme("light")} aria-label="Modo claro" aria-pressed={theme==="light"} title="Modo claro"><Sun size={17}/></button><button type="button" className={`theme-choice ${theme==="dark"?"active":""}`} onClick={()=>setTheme("dark")} aria-label="Modo escuro" aria-pressed={theme==="dark"} title="Modo escuro"><Moon size={17}/></button></div><div className="header-menu"><button className={`header-icon-button ${notificationsOpen?"active":""}`} onClick={openNotifications} aria-label="Notificações"><Bell size={18}/>{notificationCount>0&&<span className="notification-dot">{notificationCount>9?"9+":notificationCount}</span>}</button>{notificationsOpen&&<div className="header-dropdown notifications-dropdown"><div className="dropdown-head"><div><b>Notificações</b><span>{notificationCount ? notificationCount+" cobrança(s) precisam de atenção." : "Tudo em dia por aqui."}</span></div></div>{notificationCount?<Link to="/app/cobrancas" onClick={()=>setNotificationsOpen(false)} className="notification-item"><div className="dropdown-icon danger"><Receipt size={16}/></div><div><b>Cobranças vencidas ou vencendo hoje</b><span>Veja as cobranças que precisam de atenção.</span></div><ChevronRight size={15}/></Link>:<div className="dropdown-empty"><Check size={18}/><span>Nenhuma notificação nova.</span></div>}</div>}</div><div className="header-menu"><button className={`avatar avatar-button ${profileOpen?"active":""}`} onClick={openProfile} aria-label="Perfil">{companyAvatar?<img src={companyAvatar} alt="" />:initials}</button>{profileOpen&&<div className="header-dropdown profile-dropdown"><div className="profile-summary"><div className="avatar large">{companyAvatar?<img src={companyAvatar} alt="" />:initials}</div><div><b>{fullName}</b><span>{email}</span></div></div><div className="dropdown-divider"></div><Link to="/app/configuracoes" onClick={()=>setProfileOpen(false)}><UserRound size={16}/> Meu perfil <ChevronRight size={14}/></Link><Link to="/app/configuracoes" onClick={()=>setProfileOpen(false)}><Settings size={16}/> Configurações <ChevronRight size={14}/></Link><button onClick={logout}><LogOut size={16}/> Sair <ChevronRight size={14}/></button></div>}</div></div></header><div className="page">{currentPlan==="free"&&<div className="trial-banner"><span><strong>Teste grátis</strong> · {trialDays} {trialDays===1?"dia":"dias"} restantes</span><a href="/#precos">Ver planos <ArrowRight size={14}/></a></div>}<Routes><Route index element={<Dashboard session={session}/>}/><Route path="clientes" element={<Customers/>}/><Route path="cobrancas" element={<Charges/>}/><Route path="recebimentos" element={<Payments/>}/><Route path="calendario" element={<CalendarPage/>}/><Route path="relatorios" element={<Reports/>}/><Route path="ia" element={<AIPage locked={!hasAIAccess} currentPlan={currentPlan}/>}/><Route path="configuracoes/*" element={<SettingsPage canUseAI={hasAIAccess}/>}/><Route path="*" element={<Navigate to="/app" replace/>}/></Routes></div></div></div>
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

function Dashboard({session}) {
  const companyId=useCompany();
  const [data,setData]=useState({customers:0,receive:0,today:0,overdue:0,paid:0,charges:[]});

  useEffect(()=>{
    if(!companyId)return;
    let active=true;    async function load(){
      const [c,ch,p]=await Promise.all([
        supabase.from("customers").select("id",{count:"exact",head:true}).eq("company_id",companyId),
        supabase.from("charges").select("*,customers(name,phone)").eq("company_id",companyId).order("due_date"),
        supabase.from("payments").select("*").eq("company_id",companyId)
      ]);
      if(!active)return;
      const charges=ch.data||[];
      setData({
        customers:c.count||0,
        receive:charges.filter(x=>x.status==="pending").reduce((a,x)=>a+Number(x.amount),0),
        today:charges.filter(x=>x.status==="pending"&&x.due_date===todayISO()).reduce((a,x)=>a+Number(x.amount),0),
        overdue:charges.filter(x=>x.status==="pending"&&x.due_date<todayISO()).reduce((a,x)=>a+Number(x.amount),0),
        paid:(p.data||[]).reduce((a,x)=>a+Number(x.amount),0),
        charges
      });
    }
    load();
    return()=>{active=false};
  },[companyId]);

  const firstName=(session?.user?.user_metadata?.full_name||"").trim().split(/\\s+/)[0]||"";
  const title=firstName ? "Olá, "+firstName : "Dashboard";
  const attention=data.overdue+data.today;
  const progress=data.receive>0 ? Math.min(100,Math.round((data.paid/(data.paid+data.receive))*100)) : 0;

  return <div className="dashboard-page">
    <div className="dashboard-hero">
      <div>
        <span className="eyebrow">VISÃO GERAL</span>
        <h1>{title}</h1>
        <p>Acompanhe o que entrou, o que falta receber e o que precisa de atenção.</p>
      </div>
      <div className="dashboard-hero-actions">
        <Link to="/app/cobrancas" className="btn btn-primary"><Plus size={16}/> Nova cobrança</Link>
      </div>
    </div>

    <div className="metric-grid dashboard-metrics">
      <Metric title="A receber" value={money(data.receive)} icon={CircleDollarSign}/>
      <Metric title="Vencendo hoje" value={money(data.today)} icon={Receipt} tone="warning"/>
      <Metric title="Atrasado" value={money(data.overdue)} icon={Receipt} tone="danger"/>
      <Metric title="Total recebido" value={money(data.paid)} icon={Wallet} tone="success"/>
    </div>

    <div className="dashboard-action-grid">
      <div className="panel">
        <div className="panel-head"><div><span className="panel-kicker">ATENÇÃO</span><h2>Quem eu preciso cobrar hoje?</h2><p>Clientes com cobrança vencendo hoje ou em atraso.</p></div><Link to="/app/cobrancas" className="link-btn">Ver todas <ArrowRight size={15}/></Link></div>
        {data.charges.filter(c=>c.status==="pending"&&c.due_date<=todayISO()).length===0 ? <Empty text="Nenhuma cobrança precisa de atenção hoje."/> : <div className="charge-list">{data.charges.filter(c=>c.status==="pending"&&c.due_date<=todayISO()).slice(0,6).map(c=><div className="charge-row" key={c.id}><div className="charge-person"><span className="person-avatar">{(c.customers?.name||"C").slice(0,1).toUpperCase()}</span><div><b>{c.customers?.name||"Cliente"}</b><span>{c.description||"Cobrança"}</span></div></div><strong>{money(c.amount)}</strong><span className={`charge-status ${c.due_date<todayISO()?"overdue":"today"}`}><i></i>{c.due_date<todayISO()?"Atrasado":"Vence hoje"}</span></div>)}</div>}
      </div>
      <div className="panel dashboard-forecast-panel">
        <div className="panel-head"><div><span className="panel-kicker">PRÓXIMOS 7 DIAS</span><h2>Previsão de recebimento</h2><p>O que está programado para entrar nos próximos dias.</p></div><Link to="/app/calendario" className="link-btn">Abrir calendário <ArrowRight size={15}/></Link></div>
        <div className="dashboard-forecast-list">
          {Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);const iso=d.toISOString().slice(0,10);const items=data.charges.filter(c=>c.status==="pending"&&c.due_date===iso);const total=items.reduce((a,c)=>a+Number(c.amount||0),0);return <div className="dashboard-forecast-row" key={iso}><span>{i===0?"Hoje":d.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","")}<small>{d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}</small></span><div><i style={{width:(total?Math.max(8,Math.min(100,total/Math.max(1,data.receive)*100)):0)+"%"}}/></div><strong>{money(total)}</strong></div>})}
        </div>
      </div>
    </div>
  </div>;
}
function Metric({title,value,icon:Icon,tone=""}){return <div className="metric"><div className={`metric-icon ${tone}`}><Icon size={19}/></div><span>{title}</span><strong>{value}</strong></div>;}
function PageTitle({title,subtitle,action}){return <div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;}
function Empty({text}){return <div className="empty"><Receipt size={24}/><span>{text}</span></div>;}
function ChargeDetail({charge,onClose,onPaid,customers=[]}){
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [repeating,setRepeating]=useState(false);
  const [editing,setEditing]=useState(false);
  const [repeatDate,setRepeatDate]=useState("");
  const [editForm,setEditForm]=useState({
    customer_id:charge.customer_id||"",
    description:charge.description||"",
    amount:String(charge.amount??""),
    due_date:charge.due_date||todayISO(),
    payment_method:charge.payment_method||"Pix",
    recurrence:charge.recurrence||"none",
    notes:charge.notes||""
  });
  const [editError,setEditError]=useState("");

  useEffect(()=>{
    setEditing(false);
    setEditError("");
    setEditForm({
      customer_id:charge.customer_id||"",
      description:charge.description||"",
      amount:String(charge.amount??""),
      due_date:charge.due_date||todayISO(),
      payment_method:charge.payment_method||"Pix",
      recurrence:charge.recurrence||"none",
      notes:charge.notes||""
    });
  },[charge.id]);

  function addDays(date,days){
    const d=new Date(date+"T12:00:00");
    d.setDate(d.getDate()+days);
    return d.toISOString().slice(0,10);
  }

  function addMonths(date,months){
    const d=new Date(date+"T12:00:00");
    const day=d.getDate();
    const target=new Date(d.getFullYear(),d.getMonth()+months,1,12);
    const last=new Date(target.getFullYear(),target.getMonth()+1,0,12).getDate();
    target.setDate(Math.min(day,last));
    return target.toISOString().slice(0,10);
  }

  function nextMonthDate(date){
    const d=new Date(date+"T12:00:00");
    const next=new Date(d.getFullYear(),d.getMonth()+1,1,12);
    const lastDay=new Date(next.getFullYear(),next.getMonth()+1,0,12).getDate();
    next.setDate(Math.min(d.getDate(),lastDay));
    return next.toISOString().slice(0,10);
  }

  function openRepeat(){
    setRepeatDate(nextMonthDate(charge.due_date));
    setRepeating(true);
    setEditing(false);
  }

  async function saveEdit(e){
    e.preventDefault();
    setEditError("");
    const amount=Number(editForm.amount);
    if(!Number.isFinite(amount)||amount<=0){
      setEditError("Informe um valor maior que zero.");
      return;
    }
    if(!editForm.customer_id){
      setEditError("Selecione um cliente.");
      return;
    }

    setSaving(true);
    try{
      let linkedPayment=null;
      const paymentChanged =
        charge.status==="paid" &&
        (amount!==Number(charge.amount)||editForm.customer_id!==charge.customer_id);

      if(paymentChanged){
        const {data:payments,error:paymentsError}=await supabase
          .from("payments")
          .select("id,amount,customer_id")
          .eq("charge_id",charge.id)
          .eq("company_id",charge.company_id);

        if(paymentsError) throw paymentsError;
        if(!payments?.length){
          throw new Error("Não foi encontrado o recebimento vinculado a esta cobrança.");
        }
        if(payments.length!==1){
          throw new Error("Esta cobrança possui mais de um recebimento vinculado. O valor/cliente não pode ser alterado por segurança.");
        }

        linkedPayment=payments[0];

        const {error:paymentUpdateError}=await supabase
          .from("payments")
          .update({amount,customer_id:editForm.customer_id})
          .eq("id",linkedPayment.id)
          .eq("company_id",charge.company_id);

        if(paymentUpdateError) throw paymentUpdateError;
      }

      const {error}=await supabase
        .from("charges")
        .update({
          customer_id:editForm.customer_id,
          description:editForm.description.trim(),
          amount,
          due_date:editForm.due_date,
          payment_method:editForm.payment_method,
          recurrence:editForm.recurrence,
          notes:editForm.notes.trim()
        })
        .eq("id",charge.id)
        .eq("company_id",charge.company_id);

      if(error){
        if(linkedPayment){
          await supabase.from("payments").update({
            amount:linkedPayment.amount,
            customer_id:linkedPayment.customer_id
          }).eq("id",linkedPayment.id).eq("company_id",charge.company_id);
        }
        throw error;
      }

      setEditing(false);
      onPaid();
    }catch(error){
      setEditError(error?.message||"Não foi possível salvar as alterações.");
    }finally{
      setSaving(false);
    }
  }

  async function repeat(){
    setSaving(true);
    const {data:user}=await supabase.auth.getUser();
    const {data:profile}=await supabase.from("profiles").select("plan").eq("id",user.user.id).single();
    const plan=PLAN_OPTIONS.find(p=>p.key===(profile?.plan||"free"))||PLAN_OPTIONS[0];
    let query=supabase.from("charges").select("id",{count:"exact",head:true}).eq("company_id",charge.company_id);
    if(plan.maxCharges!==null){
      const startOfMonth=new Date();
      startOfMonth.setDate(1);
      const firstDay=startOfMonth.toISOString().slice(0,10);
      const nextMonth=new Date(startOfMonth.getFullYear(),startOfMonth.getMonth()+1,1);
      const nextDay=nextMonth.toISOString().slice(0,10);
      query=query.gte("created_at",firstDay).lt("created_at",nextDay);
    }
    const {count}=await query;
    if(plan.maxCharges!==null&&(count||0)>=plan.maxCharges){
      setSaving(false);
      return;
    }
    const {error}=await supabase.from("charges").insert({
      company_id:charge.company_id,
      customer_id:charge.customer_id,
      description:charge.description,
      amount:Number(charge.amount),
      due_date:repeatDate,
      payment_method:charge.payment_method,
      status:"pending",
      recurrence:"none"
    });
    if(!error){
      setRepeating(false);
      onPaid();
    }
    setSaving(false);
  }

  async function removeCharge(){
    if(!window.confirm("Excluir esta cobrança? Essa ação não pode ser desfeita."))return;
    setDeleting(true);
    const {error:paymentError}=await supabase.from("payments").delete().eq("charge_id",charge.id).eq("company_id",charge.company_id);
    if(paymentError){
      setDeleting(false);
      return;
    }
    const {error}=await supabase.from("charges").delete().eq("id",charge.id).eq("company_id",charge.company_id);
    if(!error){
      onPaid();
    }
    setDeleting(false);
  }

  async function paid(){
    setSaving(true);
    const {error}=await supabase.from("charges").update({status:"paid"}).eq("id",charge.id).eq("company_id",charge.company_id);
    if(!error){
      await supabase.from("payments").insert({
        company_id:charge.company_id,
        customer_id:charge.customer_id,
        charge_id:charge.id,
        amount:charge.amount,
        payment_method:charge.payment_method,
        paid_at:new Date().toISOString()
      });
      if(charge.recurrence&&charge.recurrence!=="none"){
        const nextDate=charge.recurrence==="weekly"
          ? addDays(charge.due_date,7)
          : charge.recurrence==="biweekly"
            ? addDays(charge.due_date,14)
            : charge.recurrence==="annual"
              ? addMonths(charge.due_date,12)
              : addMonths(charge.due_date,1);
        await supabase.from("charges").insert({
          company_id:charge.company_id,
          customer_id:charge.customer_id,
          description:charge.description,
          amount:Number(charge.amount),
          due_date:nextDate,
          payment_method:charge.payment_method,
          status:"pending",
          recurrence:charge.recurrence
        });
      }
      onPaid();
    }
    setSaving(false);
  }

  const selectedCustomer=customers.find(c=>c.id===editForm.customer_id);

  return <div className="modal-backdrop">
    <div className="modal">
      <button className="modal-x" type="button" onClick={onClose}><X/></button>
      {editing ? <form onSubmit={saveEdit}>
        <div className="modal-head">
          <div className="icon-box"><Receipt/></div>
          <div><h2>Editar cobrança</h2><p>Atualize os dados desta cobrança.</p></div>
        </div>
        {editError&&<div className="error">{editError}</div>}
        <label className="field">
          <span>Cliente</span>
          <select value={editForm.customer_id} onChange={e=>setEditForm({...editForm,customer_id:e.target.value})} required>
            <option value="">Selecione</option>
            {customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
        </label>
        <Input label="Descrição" value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})} required/>
        <Input label="Valor" type="number" step="0.01" min="0.01" value={editForm.amount} onChange={e=>setEditForm({...editForm,amount:e.target.value})} required/>
        <Input label="Vencimento" type="date" value={editForm.due_date} onChange={e=>setEditForm({...editForm,due_date:e.target.value})} required/>
        <label className="field">
          <span>Método</span>
          <select value={editForm.payment_method} onChange={e=>setEditForm({...editForm,payment_method:e.target.value})}>
            ["Pix","Dinheiro","Cartão","Transferência","Outro"].map(x=><option key={x}>{x}</option>)
          </select>
        </label>
        <label className="field">
          <span>Recorrência</span>
          <select value={editForm.recurrence} onChange={e=>setEditForm({...editForm,recurrence:e.target.value})}>
            <option value="none">Não repetir</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quinzenal</option>
            <option value="monthly">Mensal</option>
            <option value="annual">Anual</option>
          </select>
        </label>
        <label className="field">
          <span>Observações</span>
          <textarea value={editForm.notes} onChange={e=>setEditForm({...editForm,notes:e.target.value})}/>
        </label>
        {charge.status==="paid"&&selectedCustomer&&selectedCustomer.id!==charge.customer_id&&<div className="modal-note">Como esta cobrança já foi paga, o recebimento vinculado também será atualizado para o novo cliente.</div>}
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={()=>{setEditing(false);setEditError("")}}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving?"Salvando...":"Salvar alterações"}</Button>
        </div>
      </form> : repeating ? <>
        <div className="modal-head">
          <div className="icon-box"><Receipt/></div>
          <div><h2>Repetir cobrança</h2><p>Crie a próxima mensalidade para o mesmo cliente.</p></div>
        </div>
        <div className="repeat-summary">
          <div><span>Cliente</span><b>{charge.customers?.name}</b></div>
          <div><span>Descrição</span><b>{charge.description}</b></div>
          <div><span>Valor</span><b>{money(charge.amount)}</b></div>
        </div>
        <Input label="Novo vencimento" type="date" value={repeatDate} onChange={e=>setRepeatDate(e.target.value)} required/>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={()=>setRepeating(false)}>Voltar</Button>
          <Button type="button" onClick={repeat} disabled={saving}>{saving?"Criando...":"Criar próxima cobrança"}</Button>
        </div>
      </> : <>
        <div className="modal-head">
          <div className="icon-box"><Receipt/></div>
          <div><h2>{charge.customers?.name}</h2><p>{charge.description}</p></div>
        </div>
        <div className="detail-grid">
          <div><span>Valor</span><b>{money(charge.amount)}</b></div>
          <div><span>Vencimento</span><b>{new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")}</b></div>
          <div><span>Método</span><b>{charge.payment_method}</b></div>
        </div>
        <div className="message-box">Oi! Tudo bem? Passando para lembrar da cobrança de {money(charge.amount)} com vencimento em {new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")}. Quando puder, consegue verificar? Obrigado!</div>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={()=>{setEditing(true);setEditError("")}} disabled={deleting}><Receipt size={16}/> Editar</Button>
          <Button type="button" variant="secondary" className="danger-action" onClick={removeCharge} disabled={deleting}>{deleting?"Excluindo...":"Excluir cobrança"}</Button>
          {charge.status==="paid"
            ? <Button type="button" onClick={openRepeat}><Receipt size={16}/> Repetir cobrança</Button>
            : <>
              <Button type="button" variant="secondary" onClick={()=>{
                const phone=(charge.customers?.phone||"").replace(/\\D/g,"");
                const message="Oi! Tudo bem? Passando para lembrar da cobrança de "+money(charge.amount)+" com vencimento em "+new Date(charge.due_date+"T12:00:00").toLocaleDateString("pt-BR")+". Quando puder, consegue verificar? Obrigado!";
                window.open(phone?"https://wa.me/"+phone+"?text="+encodeURIComponent(message):"https://wa.me/?text="+encodeURIComponent(message),"_blank");
              }}>Abrir WhatsApp</Button>
              <Button type="button" onClick={paid} disabled={saving}><Check size={16}/> Marcar como pago</Button>
            </>
          }
        </div>
        <p className="modal-note">{charge.status==="paid"?"A cobrança original continua como paga. A nova cobrança será criada para o mesmo cliente.":"O botão do WhatsApp abre uma conversa com a mensagem preenchida. Ele não simula um envio pela plataforma."}</p>
      </>}
    </div>
  </div>;
}

function Customers() {
  const companyId=useCompany();
  const [rows,setRows]=useState([]);
  const [search,setSearch]=useState("");
  const loc=useLocation();
  useEffect(()=>{const q=new URLSearchParams(loc.search).get("q");if(q)setSearch(q)},[loc.search]);
  const [open,setOpen]=useState(false);
  const [menuCustomer,setMenuCustomer]=useState(null);
  const [menuPosition,setMenuPosition]=useState(null);
  const [form,setForm]=useState({name:"",phone:"",email:"",notes:""});
  const [deleting,setDeleting]=useState(false);
  const [editingCustomer,setEditingCustomer]=useState(null);
  const [editingForm,setEditingForm]=useState({name:"",phone:"",email:"",notes:""});
  const [editingSaving,setEditingSaving]=useState(false);
  const [editingError,setEditingError]=useState("");
  const [customerView,setCustomerView]=useState(null);
  const [history,setHistory]=useState({charges:[],payments:[],loading:false});

  async function load(){
    if(!companyId)return;
    const {data}=await supabase.from("customers").select("*").eq("company_id",companyId).order("created_at",{ascending:false});
    setRows(data||[]);
  }

  useEffect(()=>{load()},[companyId]);

  function closeMenu(){
    setMenuCustomer(null);
    setMenuPosition(null);
  }

  function getMenuPosition(button){
    const rect=button.getBoundingClientRect();
    const menuWidth=190;
    const menuHeight=195;
    const gap=6;
    let left=rect.right-menuWidth;
    let top=rect.bottom+gap;
    if(left<10)left=10;
    if(left+menuWidth>window.innerWidth-10)left=Math.max(10,window.innerWidth-menuWidth-10);
    if(top+menuHeight>window.innerHeight-10)top=Math.max(10,rect.top-menuHeight-gap);
    return {top,left};
  }

  function openMenu(c,e){
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition(getMenuPosition(e.currentTarget));
    setMenuCustomer(c);
  }

  useEffect(()=>{
    if(!menuCustomer)return;
    function reposition(){
      const button=document.querySelector(".customer-menu-trigger[data-customer-id=\"" + menuCustomer.id + "\"]");
      if(button)setMenuPosition(getMenuPosition(button));
    }
    window.addEventListener("resize",reposition);
    window.addEventListener("scroll",reposition,true);
    return()=>{
      window.removeEventListener("resize",reposition);
      window.removeEventListener("scroll",reposition,true);
    };
  },[menuCustomer]);

  async function openCustomer(c){
    setCustomerView(c);
    setHistory({charges:[],payments:[],loading:true});
    const [{data:charges},{data:payments}]=await Promise.all([
      supabase.from("charges").select("id,description,amount,due_date,status,payment_method").eq("company_id",companyId).eq("customer_id",c.id).order("due_date",{ascending:false}),
      supabase.from("payments").select("id,amount,paid_at,payment_method,charge_id").eq("company_id",companyId).eq("customer_id",c.id).order("paid_at",{ascending:false})
    ]);
    setHistory({charges:charges||[],payments:payments||[],loading:false});
  }

  function openCustomerEditor(c){
    closeMenu();
    setCustomerView(null);
    setEditingError("");
    setEditingCustomer(c);
    setEditingForm({
      name:c.name||"",
      phone:c.phone||"",
      email:c.email||"",
      notes:c.notes||""
    });
  }

  async function saveCustomerEdit(e){
    e.preventDefault();
    setEditingError("");
    if(!editingForm.name.trim()){
      setEditingError("Informe o nome do cliente.");
      return;
    }
    setEditingSaving(true);
    const {error}=await supabase
      .from("customers")
      .update({
        name:editingForm.name.trim(),
        phone:editingForm.phone.trim(),
        email:editingForm.email.trim(),
        notes:editingForm.notes.trim()
      })
      .eq("id",editingCustomer.id)
      .eq("company_id",companyId);

    if(error){
      setEditingError(error.message);
    }else{
      const updated={
        ...editingCustomer,
        name:editingForm.name.trim(),
        phone:editingForm.phone.trim(),
        email:editingForm.email.trim(),
        notes:editingForm.notes.trim()
      };
      setRows(prev=>prev.map(c=>c.id===updated.id?updated:c));
      setEditingCustomer(null);
    }
    setEditingSaving(false);
  }

  async function save(e){
    e.preventDefault();
    const {data:user}=await supabase.auth.getUser();
    const {data:profile}=await supabase.from("profiles").select("plan").eq("id",user.user.id).single();
    const plan=PLAN_OPTIONS.find(p=>p.key===(profile?.plan||"free"))||PLAN_OPTIONS[0];
    const {count}=await supabase.from("customers").select("id",{count:"exact",head:true}).eq("company_id",companyId);
    if(plan.maxCustomers!==null&&(count||0)>=plan.maxCustomers){
      alert("O plano "+plan.title+" permite até "+plan.maxCustomers+" clientes. Faça upgrade para adicionar mais.");
      return;
    }
    const {error}=await supabase.from("customers").insert({...form,company_id:companyId});
    if(error)alert(error.message);
    else{
      setForm({name:"",phone:"",email:"",notes:""});
      setOpen(false);
      load();
    }
  }

  async function removeCustomer(c){
    if(!window.confirm('Excluir o cliente "'+c.name+'"? As cobranças e recebimentos vinculados também serão excluídos. Essa ação não pode ser desfeita.'))return;
    setDeleting(true);
    const {error:paymentsError}=await supabase.from("payments").delete().eq("customer_id",c.id).eq("company_id",companyId);
    if(paymentsError){alert(paymentsError.message);setDeleting(false);return;}
    const {error:chargesError}=await supabase.from("charges").delete().eq("customer_id",c.id).eq("company_id",companyId);
    if(chargesError){alert(chargesError.message);setDeleting(false);return;}
    const {error}=await supabase.from("customers").delete().eq("id",c.id).eq("company_id",companyId);
    if(error)alert(error.message);
    else{
      closeMenu();
      load();
    }
    setDeleting(false);
  }

  function whatsapp(c){
    const phone=(c.phone||"").replace(/\D/g,"");
    const message="Oi! Tudo bem, "+c.name+"? Passando para falar com você.";
    window.open(phone?"https://wa.me/"+phone+"?text="+encodeURIComponent(message):"https://wa.me/?text="+encodeURIComponent(message),"_blank");
    closeMenu();
  }

  function showData(c){closeMenu();openCustomer(c);}

  const filtered=rows.filter(x=>(x.name+" "+(x.phone||"")+" "+(x.email||"")).toLowerCase().includes(search.toLowerCase()));

  const floatingMenu=menuCustomer&&menuPosition?createPortal(
    <>
      <button
        type="button"
        aria-label="Fechar menu de ações"
        onClick={closeMenu}
        style={{position:"fixed",inset:0,border:0,padding:0,margin:0,background:"transparent",zIndex:2147483646,cursor:"default"}}
      />
      <div
        className="customer-menu customer-menu-floating"
        style={{position:"fixed",width:190,zIndex:2147483647,pointerEvents:"auto","--menu-top":menuPosition.top+"px","--menu-left":menuPosition.left+"px"}}
      >
        <button type="button" onClick={()=>openCustomerEditor(menuCustomer)}>Editar</button>
        <button type="button" onClick={()=>showData(menuCustomer)}>Ver dados</button>
        <button type="button" onClick={()=>whatsapp(menuCustomer)}>Abrir WhatsApp</button>
        <button type="button" className="danger-menu-item" onClick={()=>removeCustomer(menuCustomer)} disabled={deleting}>
          {deleting?"Excluindo...":"Excluir cliente"}
        </button>
      </div>
    </>,
    document.body
  ):null;

  return <>
    <PageTitle title="Clientes" subtitle="Organize seus clientes e acompanhe o histórico." action={<Button onClick={()=>setOpen(true)}><Plus size={17}/> Novo cliente</Button>}/>
    <div className="toolbar">
      <div className="searchbox">
        <Search size={17}/>
        <input placeholder="Buscar cliente..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
    </div>
    <div className="panel table-panel">
      <div className="customers-table-wrap">
        {filtered.length===0?<Empty text="Você ainda não possui clientes."/>:<table>
          <thead><tr><th>Cliente</th><th>Telefone</th><th>E-mail</th><th>Criado em</th><th className="customer-actions-head"></th></tr></thead>
          <tbody>
            {filtered.map(c=><tr key={c.id} onClick={()=>openCustomer(c)} style={{cursor:"pointer"}}>
              <td><b>{c.name}</b></td>
              <td>{c.phone||"—"}</td>
              <td>{c.email||"—"}</td>
              <td>{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
              <td className="customer-actions-cell">
                <button
                  type="button"
                  data-customer-id={c.id}
                  className={"customer-menu-trigger "+(menuCustomer?.id===c.id?"active":"")}
                  aria-label={"Ações de "+c.name}
                  onClick={e=>openMenu(c,e)}
                >
                  <MoreHorizontal size={19}/>
                </button>
              </td>
            </tr>)}
          </tbody>
        </table>}
      </div>
    </div>

    {open&&<div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <button type="button" className="modal-x" onClick={()=>setOpen(false)}><X/></button>
        <div className="modal-head"><div className="icon-box"><UserRound/></div><div><h2>Novo cliente</h2><p>Cadastre os dados básicos.</p></div></div>
        <Input label="Nome" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/>
        <Input label="Telefone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
        <Input label="E-mail" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
        <label className="field"><span>Observações</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button>
          <Button type="submit">Criar cliente</Button>
        </div>
      </form>
    </div>}

    {editingCustomer&&<div className="modal-backdrop">
      <form className="modal" onSubmit={saveCustomerEdit}>
        <button type="button" className="modal-x" onClick={()=>setEditingCustomer(null)}><X/></button>
        <div className="modal-head"><div className="icon-box"><UserRound/></div><div><h2>Editar cliente</h2><p>Atualize os dados do cliente.</p></div></div>
        {editingError&&<div className="error">{editingError}</div>}
        <Input label="Nome" value={editingForm.name} onChange={e=>setEditingForm({...editingForm,name:e.target.value})} required/>
        <Input label="Telefone" value={editingForm.phone} onChange={e=>setEditingForm({...editingForm,phone:e.target.value})}/>
        <Input label="E-mail" type="email" value={editingForm.email} onChange={e=>setEditingForm({...editingForm,email:e.target.value})}/>
        <label className="field"><span>Observações</span><textarea value={editingForm.notes} onChange={e=>setEditingForm({...editingForm,notes:e.target.value})}/></label>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={()=>setEditingCustomer(null)}>Cancelar</Button>
          <Button type="submit" disabled={editingSaving}>{editingSaving?"Salvando...":"Salvar alterações"}</Button>
        </div>
      </form>
    </div>}

    {floatingMenu}

    {customerView&&<div className="modal-backdrop">
      <div className="modal customer-history-modal">
        <button type="button" className="modal-x" onClick={()=>setCustomerView(null)}><X/></button>
        <div className="modal-head">
          <div className="icon-box"><UserRound/></div>
          <div><h2>{customerView.name}</h2><p>Histórico completo do cliente</p></div>
        </div>
        <div className="customer-history-contact">
          <span>{customerView.phone||"Telefone não informado"}</span>
          <span>{customerView.email||"E-mail não informado"}</span>
        </div>
        {history.loading?<div className="customer-history-loading">Carregando histórico...</div>:<>
          <div className="customer-history-kpis">
            <div><span>Total pago</span><b>{money(history.payments.reduce((a,x)=>a+Number(x.amount||0),0))}</b></div>
            <div><span>Em aberto</span><b>{money(history.charges.filter(x=>x.status==="pending").reduce((a,x)=>a+Number(x.amount||0),0))}</b></div>
            <div><span>Cobranças</span><b>{history.charges.length}</b></div>
            <div><span>Pagamentos</span><b>{history.payments.length}</b></div>
          </div>
          <div className="customer-history-timeline">
            {[...history.charges.map(x=>({date:x.due_date+"T12:00:00",type:"charge",title:"Cobrança criada",detail:x.description||"Cobrança",value:Number(x.amount||0),status:x.status})),...history.payments.map(x=>({date:x.paid_at,type:"payment",title:"Pagamento recebido",detail:x.payment_method||"Pagamento",value:Number(x.amount||0)}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((item,i)=><div className="customer-history-event" key={i}>
              <span className={item.type==="payment"?"event-dot paid":"event-dot charge"}></span>
              <div><b>{item.title}</b><span>{item.detail}</span><small>{new Date(item.date).toLocaleDateString("pt-BR")} · {item.type==="charge"?(item.status==="paid"?"Pago":"A receber"): "Recebido"}</small></div>
              <strong>{money(item.value)}</strong>
            </div>)}
            {history.charges.length===0&&history.payments.length===0&&<Empty text="Ainda não há movimentações para este cliente."/>}
          </div>
        </>}
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={()=>openCustomerEditor(customerView)}>Editar cliente</Button>
          <Button type="button" onClick={()=>setCustomerView(null)}>Fechar</Button>
        </div>
      </div>
    </div>}
  </>;
}

function Charges() {
  const companyId=useCompany();
  const loc=useLocation();
  const [rows,setRows]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [open,setOpen]=useState(false);
  const [selected,setSelected]=useState(null);
  const [filter,setFilter]=useState("all");
  const [form,setForm]=useState({customer_id:"",description:"",amount:"",due_date:todayISO(),payment_method:"Pix",recurrence:"none",notes:""});

  async function load(){
    if(!companyId)return;
    const [{data:c},{data:cu}]=await Promise.all([
      supabase.from("charges").select("*,customers(name,phone)").eq("company_id",companyId).order("due_date"),
      supabase.from("customers").select("*").eq("company_id",companyId).order("name")
    ]);
    setRows(c||[]);
    setCustomers(cu||[]);
  }

  useEffect(()=>{load()},[companyId]);
  useEffect(()=>{
    const requested=new URLSearchParams(loc.search).get("filter");
    if(["pending","overdue","paid"].includes(requested)) setFilter(requested);
    else if(loc.pathname==="/app/cobrancas") setFilter("pending");
  },[loc.search,loc.pathname]);

  async function save(e){
    e.preventDefault();
    const {data:user}=await supabase.auth.getUser();
    const {data:profile}=await supabase.from("profiles").select("plan").eq("id",user.user.id).single();
    const plan=PLAN_OPTIONS.find(p=>p.key===(profile?.plan||"free"))||PLAN_OPTIONS[0];
    let query=supabase.from("charges").select("id",{count:"exact",head:true}).eq("company_id",companyId);
    if(plan.maxCharges!==null){
      const start=new Date();
      start.setDate(1);
      const firstDay=start.toISOString().slice(0,10);
      const next=new Date(start.getFullYear(),start.getMonth()+1,1);
      const nextDay=next.toISOString().slice(0,10);
      query=query.gte("created_at",firstDay).lt("created_at",nextDay);
    }
    const {count}=await query;
    if(plan.maxCharges!==null&&(count||0)>=plan.maxCharges){
      alert(`O plano ${plan.title} permite até ${plan.maxCharges} cobranças por mês. Faça upgrade para adicionar mais.`);
      return;
    }
    const {error}=await supabase.from("charges").insert({...form,company_id:companyId,amount:Number(form.amount)});
    if(error) alert(error.message);
    else{
      setOpen(false);
      setForm({customer_id:"",description:"",amount:"",due_date:todayISO(),payment_method:"Pix",recurrence:"none",notes:""});
      load();
    }
  }

  const queryText=(new URLSearchParams(loc.search).get("q")||"").toLowerCase();
  const filtered=rows.filter(x=>{const statusMatch=filter==="paid"?x.status==="paid":filter==="overdue"?x.status==="pending"&&x.due_date<todayISO():x.status==="pending"&&x.due_date>=todayISO();const text=(x.description+" "+(x.customers?.name||"")).toLowerCase();return statusMatch&&(!queryText||text.includes(queryText));});

  const sectionTitle=filter==="paid"?"Recebidas":filter==="overdue"?"Atrasadas":"A receber";
  const sectionSubtitle=filter==="paid"?"Histórico de cobranças já recebidas.":filter==="overdue"?"Cobranças vencidas que precisam de atenção.":"Cobranças pendentes e dentro do prazo.";

  return <>
    <PageTitle title={sectionTitle} subtitle={sectionSubtitle} action={<Button onClick={()=>setOpen(true)}><Plus size={17}/> Nova cobrança</Button>}/>
    <div className="panel table-panel">
      {filtered.length===0?<Empty text="Nenhuma cobrança encontrada."/>:<table>
        <thead><tr><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Ação</th></tr></thead>
        <tbody>{filtered.map(c=><tr key={c.id} onClick={()=>setSelected(c)} style={{cursor:"pointer"}}>
          <td><b>{c.customers?.name}</b></td>
          <td>{c.description}</td>
          <td><b>{money(c.amount)}</b></td>
          <td>{new Date(c.due_date+"T12:00:00").toLocaleDateString("pt-BR")}</td>
          <td><span className={`badge ${c.status==="paid"?"green":c.due_date<todayISO()?"red":c.due_date===todayISO()?"yellow":"gray"}`}>{c.status==="paid"?"Pago":c.due_date<todayISO()?"Atrasado":c.due_date===todayISO()?"Vence hoje":"A receber"}</span></td>
          <td className="charge-action-cell">{c.status==="paid"?<button className="btn btn-secondary btn-sm charge-repeat-action" onClick={(e)=>{e.stopPropagation();setSelected(c)}}><Receipt size={14}/> Repetir</button>:<button className="btn btn-secondary btn-sm charge-repeat-action" onClick={(e)=>{e.stopPropagation();setSelected(c)}}><MessageCircle size={14}/> Cobrar</button>}</td>
        </tr>)}</tbody>
      </table>}
    </div>

    {open&&<div className="modal-backdrop"><form className="modal" onSubmit={save}>
      <button type="button" className="modal-x" onClick={()=>setOpen(false)}><X/></button>
      <div className="modal-head"><div className="icon-box"><Receipt/></div><div><h2>Nova cobrança</h2><p>Crie um valor a receber.</p></div></div>
      <label className="field"><span>Cliente</span><select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} required><option value="">Selecione</option>{customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      <Input label="Descrição" placeholder="Ex.: Mensalidade" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required/>
      <Input label="Valor" type="number" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/>
      <Input label="Vencimento" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} required/>
      <label className="field"><span>Método</span><select value={form.payment_method} onChange={e=>setForm({...form,payment_method:e.target.value})}>{["Pix","Dinheiro","Cartão","Transferência","Outro"].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className="field"><span>Recorrência</span><select value={form.recurrence} onChange={e=>setForm({...form,recurrence:e.target.value})}><option value="none">Não repetir</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label>
      <div className="recurrence-hint">{form.recurrence==="none"?"Cobrança única.":"Ao marcar como paga, a próxima cobrança será criada automaticamente."}</div><div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setOpen(false)}>Cancelar</Button><Button type="submit">Criar cobrança</Button></div>
    </form></div>}

    {selected&&<ChargeDetail charge={selected} customers={customers} onClose={()=>setSelected(null)} onPaid={()=>{setSelected(null);load();}}/>}
  </>;
}
function CalendarPage(){
  const companyId=useCompany();
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [charges,setCharges]=useState([]);
  const [payments,setPayments]=useState([]);
  const [selectedDate,setSelectedDate]=useState(todayISO());

  useEffect(()=>{
    if(!companyId)return;
    const start=new Date(month.getFullYear(),month.getMonth(),1);
    const next=new Date(month.getFullYear(),month.getMonth()+1,1);
    Promise.all([
      supabase.from("charges").select("id,customer_id,description,amount,due_date,status,payment_method,customers(name,phone)").eq("company_id",companyId).gte("due_date",start.toISOString().slice(0,10)).lt("due_date",next.toISOString().slice(0,10)).order("due_date"),
      supabase.from("payments").select("id,customer_id,amount,paid_at,payment_method,customers(name)").eq("company_id",companyId).gte("paid_at",start.toISOString()).lt("paid_at",next.toISOString()).order("paid_at")
    ]).then(([c,p])=>{setCharges(c.data||[]);setPayments(p.data||[])});
  },[companyId,month]);

  const year=month.getFullYear(), monthIndex=month.getMonth();
  const firstDay=new Date(year,monthIndex,1);
  const offset=(firstDay.getDay()+6)%7;
  const daysInMonth=new Date(year,monthIndex+1,0).getDate();
  const cells=[];
  for(let i=0;i<42;i++){
    const day=i-offset+1;
    cells.push(day<1||day>daysInMonth?null:year+"-"+String(monthIndex+1).padStart(2,"0")+"-"+String(day).padStart(2,"0"));
  }

  const monthCharges=charges.filter(x=>x.status!=="cancelled");
  const expected=monthCharges.reduce((a,x)=>a+Number(x.amount||0),0);
  const received=payments.reduce((a,x)=>a+Number(x.amount||0),0);
  const open=monthCharges.filter(x=>x.status==="pending").reduce((a,x)=>a+Number(x.amount||0),0);
  const overdue=monthCharges.filter(x=>x.status==="pending"&&x.due_date<todayISO()).reduce((a,x)=>a+Number(x.amount||0),0);
  const monthLabel=month.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
  const selectedCharges=charges.filter(x=>x.due_date===selectedDate);
  const selectedPayments=payments.filter(x=>x.paid_at.slice(0,10)===selectedDate);
  const selectedExpected=selectedCharges.reduce((a,x)=>a+Number(x.amount||0),0);
  const selectedReceived=selectedPayments.reduce((a,x)=>a+Number(x.amount||0),0);
  const isCurrentMonth=month.getFullYear()===new Date().getFullYear()&&month.getMonth()===new Date().getMonth();

  function shiftMonth(delta){
    const nextMonth=new Date(year,monthIndex+delta,1);
    setMonth(nextMonth);
    setSelectedDate(nextMonth.getFullYear()+"-"+String(nextMonth.getMonth()+1).padStart(2,"0")+"-01");
  }
  function goToday(){
    const now=new Date();
    setMonth(new Date(now.getFullYear(),now.getMonth(),1));
    setSelectedDate(todayISO());
  }

  return <div className="calendar-page">
    <PageTitle title="Calendário financeiro" subtitle="Visualize suas cobranças e recebimentos ao longo do mês."/>
    <div className="calendar-summary-grid">
      <div className="calendar-summary-card"><span>Previsto no mês</span><strong>{money(expected)}</strong><small>{monthCharges.length} cobranças</small></div>
      <div className="calendar-summary-card"><span>Recebido no mês</span><strong>{money(received)}</strong><small>{payments.length} recebimentos</small></div>
      <div className="calendar-summary-card"><span>Em aberto</span><strong>{money(open)}</strong><small>Valores pendentes</small></div>
      <div className="calendar-summary-card danger"><span>Em atraso</span><strong>{money(overdue)}</strong><small>Precisa de atenção</small></div>
    </div>

    <div className="calendar-layout">
      <div className="panel calendar-panel">
        <div className="calendar-head">
          <div className="calendar-month-nav">
            <button type="button" className="calendar-nav-btn" onClick={()=>shiftMonth(-1)} aria-label="Mês anterior"><ChevronLeft size={18}/></button>
            <button type="button" className="calendar-today-btn" onClick={goToday}>Hoje</button>
            <button type="button" className="calendar-nav-btn" onClick={()=>shiftMonth(1)} aria-label="Próximo mês"><ChevronRight size={18}/></button>
          </div>
          <h2>{monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1)}</h2>
          <span className={isCurrentMonth?"calendar-current-label":"calendar-current-label muted"}>{isCurrentMonth?"Mês atual":" "}</span>
        </div>

        <div className="calendar-weekdays">{["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(x=><span key={x}>{x}</span>)}</div>
        <div className="calendar-grid">
          {cells.map((iso,i)=>{
            if(!iso)return <div className="calendar-cell empty-day" key={i}/>;
            const chargeList=charges.filter(x=>x.due_date===iso);
            const paymentList=payments.filter(x=>x.paid_at.slice(0,10)===iso);
            const total=chargeList.filter(x=>x.status!=="cancelled").reduce((a,x)=>a+Number(x.amount||0),0);
            const totalPaid=paymentList.reduce((a,x)=>a+Number(x.amount||0),0);
            const late=chargeList.some(x=>x.status==="pending"&&x.due_date<todayISO());
            const today=iso===todayISO();
            return <button type="button" key={iso} className={"calendar-cell "+(selectedDate===iso?"selected ":"")+(today?"today":"")} onClick={()=>setSelectedDate(iso)}>
              <span className="calendar-day-number">{Number(iso.slice(-2))}</span>
              {today&&<span className="calendar-day-today">Hoje</span>}
              <div className="calendar-day-values">
                {total>0&&<span className={late?"late":"charge"}>{money(total)}</span>}
                {totalPaid>0&&<span className="received">+ {money(totalPaid)}</span>}
              </div>
            </button>;
          })}
        </div>

        <div className="calendar-legend">
          <span><i className="charge"/> A cobrar</span>
          <span><i className="received"/> Recebido</span>
          <span><i className="late"/> Em atraso</span>
        </div>
      </div>

      <aside className="panel calendar-day-panel">
        <div className="calendar-day-header">
          <div>
            <span className="panel-kicker">DETALHES DO DIA</span>
            <h2>{new Date(selectedDate+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</h2>
          </div>
        </div>
        <div className="calendar-day-summary">
          <div><span>A cobrar</span><b>{money(selectedExpected)}</b></div>
          <div><span>Recebido</span><b>{money(selectedReceived)}</b></div>
        </div>
        <div className="calendar-events">
          {selectedCharges.map(x=><Link to={"/app/cobrancas?q="+encodeURIComponent(x.description||x.customers?.name||"")} className="calendar-event" key={x.id}>
            <span className={x.status==="paid"?"event-dot paid":x.due_date<todayISO()?"event-dot late":"event-dot charge"}/>
            <div><b>{x.customers?.name||"Cliente"}</b><small>{x.description||"Cobrança"} · {x.status==="paid"?"Pago":x.due_date<todayISO()?"Atrasado":"A receber"}</small></div>
            <strong>{money(x.amount)}</strong>
          </Link>)}
          {selectedPayments.map(x=><div className="calendar-event" key={x.id}>
            <span className="event-dot paid"/>
            <div><b>{x.customers?.name||"Cliente"}</b><small>Recebimento · {x.payment_method||"Pagamento"}</small></div>
            <strong>+ {money(x.amount)}</strong>
          </div>)}
          {selectedCharges.length===0&&selectedPayments.length===0&&<div className="calendar-empty-day"><CalendarDays size={22}/><b>Nada agendado para este dia</b><span>As próximas cobranças aparecerão aqui.</span></div>}
        </div>
      </aside>
    </div>
  </div>;
}
function Payments(){const companyId=useCompany();const [rows,setRows]=useState([]);useEffect(()=>{if(companyId)supabase.from("payments").select("*,customers(name),charges(description)").eq("company_id",companyId).order("paid_at",{ascending:false}).then(({data})=>setRows(data||[]));},[companyId]);const total=rows.reduce((a,x)=>a+Number(x.amount),0);return <div className="payments-page"><PageTitle title="Recebimentos" subtitle="Tudo que sua empresa já recebeu."/><div className="metric-grid three payments-metrics"><Metric title="Total recebido" value={money(total)} icon={Wallet} tone="success"/><Metric title="Recebido hoje" value={money(rows.filter(x=>x.paid_at.slice(0,10)===todayISO()).reduce((a,x)=>a+Number(x.amount),0))} icon={Check} tone="success"/><Metric title="Lançamentos" value={rows.length} icon={Receipt}/></div><div className="panel table-panel payments-table-panel"><div className="payments-table-head"><div><span>HISTÓRICO</span><b>Recebimentos registrados</b></div><small>{rows.length} {rows.length===1?"lançamento":"lançamentos"}</small></div>{rows.length===0?<Empty text="Nenhum recebimento registrado ainda."/>:<div className="payments-responsive-list">{rows.map(x=><div className="payments-responsive-row" key={x.id}><div className="payments-responsive-main"><b>{x.customers?.name||"Cliente"}</b><strong>{money(x.amount)}</strong></div><div className="payments-responsive-meta"><span>{new Date(x.paid_at).toLocaleDateString("pt-BR")}</span><span>{x.payment_method||"—"}</span></div></div>)}</div>}</div></div>
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
function AIPage({locked=false,currentPlan="free"}){
  const companyId=useCompany();
  const [tone,setTone]=useState("Amigável");
  const [context,setContext]=useState("mensalidade de R$350 vence hoje");
  const [result,setResult]=useState("");
  const [question,setQuestion]=useState("");
  const [messages,setMessages]=useState([]);
  const [data,setData]=useState({customers:[],charges:[],payments:[]});
  const [loading,setLoading]=useState(true);
  const [aiLoading,setAiLoading]=useState(false);

  useEffect(()=>{
    if(!companyId)return;
    let active=true;
    async function load(){
      setLoading(true);
      const [customers,charges,payments]=await Promise.all([
        supabase.from("customers").select("id,name,phone,email").eq("company_id",companyId).order("name"),
        supabase.from("charges").select("id,customer_id,description,amount,due_date,status,customers(name)").eq("company_id",companyId).order("due_date"),
        supabase.from("payments").select("id,customer_id,amount,paid_at,payment_method,customers(name)").eq("company_id",companyId).order("paid_at",{ascending:false})
      ]);
      if(active){
        setData({customers:customers.data||[],charges:charges.data||[],payments:payments.data||[]});
        setLoading(false);
      }
    }
    load();
    return()=>{active=false};
  },[companyId]);

  async function ask(text=question){
    const clean=text.trim();
    if(!clean||aiLoading)return;
    const nextMessages=[...messages,{role:"user",text:clean}];
    setMessages(nextMessages);
    setQuestion("");
    setAiLoading(true);
    try{
      const {data:sessionData}=await supabase.auth.getSession();
      const accessToken=sessionData?.session?.access_token;
      if(!accessToken) throw new Error("Sua sessão expirou. Faça login novamente.");
      const response=await fetch("/api/ai-chat",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+accessToken},
        body:JSON.stringify({messages:nextMessages,mode:"chat"})
      });
      const json=await response.json();
      if(!response.ok) throw new Error(json.error||"Não foi possível consultar a IA.");
      setMessages(prev=>[...prev,{role:"assistant",text:json.answer}]);
    }catch(error){
      setMessages(prev=>[...prev,{role:"assistant",text:"Não consegui consultar a IA agora. "+error.message}]);
    }finally{
      setAiLoading(false);
    }
  }

  async function generate(){
    const clean=context.trim();
    if(!clean){
      setResult("Digite o contexto da cobrança para gerar a mensagem.");
      return;
    }
    setAiLoading(true);
    try{
      const {data:sessionData}=await supabase.auth.getSession();
      const accessToken=sessionData?.session?.access_token;
      if(!accessToken) throw new Error("Sua sessão expirou. Faça login novamente.");
      const response=await fetch("/api/ai-chat",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+accessToken},
        body:JSON.stringify({mode:"message",tone,context:clean})
      });
      const json=await response.json();
      if(!response.ok) throw new Error(json.error||"Não foi possível gerar a mensagem.");
      setResult(json.answer);
    }catch(error){
      setResult("Não consegui gerar a mensagem agora. "+error.message);
    }finally{
      setAiLoading(false);
    }
  }

  const suggestions=["Quanto tenho para receber?","Quem está atrasado?","Quanto recebi?","Quem eu preciso cobrar hoje?"];
  const planLabel=currentPlan==="essencial"?"Essencial":"Teste grátis";

  return <>
    <PageTitle title="Assistente IA" subtitle="Pergunte sobre seu negócio e prepare mensagens de cobrança."/>
    {locked ? <div className="panel ai-locked-panel"><div className="ai-locked-icon"><Lock size={24}/></div><span className="panel-kicker">RECURSO PREMIUM</span><h2>Assistente IA</h2><p>O Assistente IA está disponível a partir do plano Profissional.</p><small>Seu plano atual: <b>{planLabel}</b></small><a href="/#precos" className="btn btn-primary">Ver planos</a><div className="ai-locked-features"><span><Check size={14}/> Análise das suas cobranças</span><span><Check size={14}/> Respostas sobre recebimentos</span><span><Check size={14}/> Mensagens de cobrança com IA</span></div></div> : <div className="ai-layout">
      <div className="panel ai-chat-panel">
        <div className="panel-head">
          <div><span className="panel-kicker">ASSISTENTE</span><h2>Converse com seus dados</h2><p>Pergunte sobre clientes, cobranças e recebimentos.</p></div>
          <Sparkles size={19}/>
        </div>
        <div className="ai-chat-messages">
          {messages.length===0 && <div className="ai-chat-empty"><div className="ai-chat-icon"><Sparkles size={20}/></div><b>Como posso ajudar?</b><span>Eu consigo consultar os dados da sua empresa e responder perguntas rápidas.</span><div className="ai-suggestions">{suggestions.map(x=><button type="button" key={x} onClick={()=>ask(x)}>{x}</button>)}</div></div>}
          {messages.map((m,i)=><div className={`ai-message ${m.role}`} key={i}><span>{m.role==="assistant"?"IA":"Você"}</span><p>{m.text}</p></div>)}
        </div>
        <form className="ai-chat-input" onSubmit={e=>{e.preventDefault();ask()}}>
          <input value={question} onChange={e=>setQuestion(e.target.value)} placeholder={loading?"Carregando seus dados...":aiLoading?"Pensando...":"Ex.: quanto tenho para receber?"} disabled={loading||aiLoading}/>
          <Button type="submit" disabled={loading||aiLoading||!question.trim()}><ArrowRight size={16}/></Button>
        </form>
      </div>

      <div className="panel ai-result">
        <div className="panel-head"><div><span className="panel-kicker">MENSAGEM</span><h2>Preparar cobrança</h2><p>Crie uma mensagem pronta para enviar.</p></div></div>
        <label className="field"><span>Tom</span><select value={tone} onChange={e=>setTone(e.target.value)}>{["Profissional","Amigável","Direto","Informal"].map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Contexto</span><textarea rows="4" value={context} onChange={e=>setContext(e.target.value)} placeholder="Ex.: mensalidade de R$350 vence hoje"/></label>
        <Button onClick={generate} disabled={aiLoading}><Sparkles size={16}/> {aiLoading?"Gerando...":"Gerar mensagem"}</Button>
        {result?<><div className="generated">{result}</div><div className="modal-actions"><Button variant="secondary" onClick={generate}>Gerar outra</Button><Button onClick={()=>navigator.clipboard?.writeText(result)}>Copiar</Button></div></>:<div className="empty small"><Sparkles size={22}/><b>Sua mensagem aparecerá aqui.</b></div>}
      </div>
    </div>}
  </>;
}
function SettingsPage({canUseAI=false}){const companyId=useCompany();const [tab,setTab]=useState("empresa");const [profile,setProfile]=useState(null);const [company,setCompany]=useState({name:"",phone:"",segment:"",avatar_url:""});const [avatarUploading,setAvatarUploading]=useState(false);const [whatsapp,setWhatsapp]=useState("");const [savingWhatsApp,setSavingWhatsApp]=useState(false);const [savedWhatsApp,setSavedWhatsApp]=useState(false);const [whatsappError,setWhatsappError]=useState("");
useEffect(()=>{supabase?.auth.getUser().then(async({data})=>{if(!data.user)return;const [{data:p},{data:c},{data:a}]=await Promise.all([supabase.from("profiles").select("plan,billing_cycle,subscription_status,subscription_expires_at").eq("id",data.user.id).single(),companyId?supabase.from("companies").select("name,phone,segment,avatar_url").eq("id",companyId).single():Promise.resolve({data:null})]);setProfile(p||null);if(c){setCompany({name:c.name||"",phone:c.phone||"",segment:c.segment||"",avatar_url:c.avatar_url||""});setWhatsapp(c.phone||"");}});},[companyId]);
function normalizeWhatsApp(value){const digits=(value||"").replace(/\D/g,"");if(!digits)return "";if(digits.startsWith("55"))return digits;return "55"+digits;}
function formatWhatsApp(value){const digits=(value||"").replace(/\D/g,"");if(digits.length===13&&digits.startsWith("55"))return "+"+digits.slice(0,2)+" ("+digits.slice(2,4)+") "+digits.slice(4,9)+"-"+digits.slice(9);if(digits.length===11)return "("+digits.slice(0,2)+") "+digits.slice(2,7)+"-"+digits.slice(7);return value||"";}
async function uploadAvatar(file){if(!file||!companyId)return;const allowed=["image/jpeg","image/png","image/webp"];if(!allowed.includes(file.type)){alert("Use uma imagem JPG, PNG ou WebP.");return;}if(file.size>3*1024*1024){alert("A imagem deve ter no máximo 3 MB.");return;}setAvatarUploading(true);try{const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";const path=companyId+"/avatar."+ext;const {error:uploadError}=await supabase.storage.from("company-avatars").upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});if(uploadError)throw uploadError;const {data:pub}=supabase.storage.from("company-avatars").getPublicUrl(path);const url=pub?.publicUrl+"?v="+Date.now();const {error:updateError}=await supabase.from("companies").update({avatar_url:url}).eq("id",companyId);if(updateError)throw updateError;setCompany(v=>({...v,avatar_url:url}));}catch(error){alert("Não foi possível salvar a foto agora. "+(error?.message||""));}finally{setAvatarUploading(false);}}async function saveWhatsApp(){setWhatsappError("");setSavedWhatsApp(false);const normalized=normalizeWhatsApp(whatsapp);if(!/^55\d{10,11}$/.test(normalized)){setWhatsappError("Digite um número válido com DDD. Ex.: (24) 99999-9999");return;}setSavingWhatsApp(true);const {error}=await supabase.from("companies").update({phone:normalized}).eq("id",companyId);if(error)setWhatsappError("Não foi possível salvar agora. "+error.message);else{setCompany(v=>({...v,phone:normalized}));setWhatsapp(formatWhatsApp(normalized));setSavedWhatsApp(true);}setSavingWhatsApp(false);}


return <><PageTitle title="Configurações" subtitle="Personalize o CobrançaPro para sua empresa."/><div className="settings-layout"><div className="settings-nav">{[["empresa","Empresa"],["whatsapp","WhatsApp"],...(canUseAI?[["ia","IA"]]:[]),["plano","Plano"]].map(([x,l])=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{l}</button>)}</div><div className="panel settings-panel">{tab==="empresa"&&<><h2>Empresa</h2><p>Dados básicos do seu negócio.</p><div className="company-profile-editor"><div className="company-profile-avatar">{company.avatar_url?<img src={company.avatar_url} alt={company.name||"Empresa"}/>:<span>{(company.name||"E").slice(0,1).toUpperCase()}</span>}</div><div><b>Foto da empresa</b><p>Essa imagem aparece no canto superior direito do sistema.</p><label className="btn btn-secondary upload-avatar-btn">{avatarUploading?"Enviando...":"Alterar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarUploading} onChange={e=>{uploadAvatar(e.target.files?.[0]);e.target.value=""}}/></label></div></div><div className="form-grid"><Input label="Nome da empresa" value={company.name} placeholder="Minha empresa" readOnly/><Input label="Telefone" value={formatWhatsApp(company.phone)} placeholder="(24) 99999-9999" readOnly/><Input label="Segmento" value={company.segment} placeholder="Ex.: clínica" readOnly/></div><small>Os dados básicos da empresa são definidos no cadastro inicial.</small></>}{tab==="whatsapp"&&<><h2>WhatsApp</h2><p>Configure o número e as cobranças automáticas pelo WhatsApp.</p><div className="connection"><div><span className="status-dot" style={{background:whatsapp?"#22c55e":"#9ca3af"}}></span><b>{whatsapp?"WhatsApp configurado":"WhatsApp não configurado"}</b><small>{whatsapp?"Número salvo: "+formatWhatsApp(whatsapp):"Cadastre o número do WhatsApp da sua empresa para deixar o canal pronto."}</small></div></div><div className="form-stack" style={{marginTop:20}}><Input label="Número do WhatsApp" value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} placeholder="(24) 99999-9999" inputMode="tel" autoComplete="tel"/><small>Use o número completo com DDD. O CobrançaPro salva o número no formato internacional.</small>{whatsappError&&<div className="error">{whatsappError}</div>}{savedWhatsApp&&<div className="success-box"><Check size={18}/> Número do WhatsApp salvo com sucesso.</div>}<div className="modal-actions"><Button type="button" onClick={saveWhatsApp} disabled={savingWhatsApp}>{savingWhatsApp?"Salvando...":"Salvar número"}</Button>{whatsapp&&<Button type="button" variant="secondary" onClick={()=>window.open("https://wa.me/"+normalizeWhatsApp(whatsapp),"_blank")}>Testar WhatsApp</Button>}</div></div></>}{tab==="ia"&&<><h2>Assistente IA</h2><p>Defina como o assistente deve escrever.</p><label className="field"><span>Nome do assistente</span><input defaultValue="Assistente CobrançaPro"/></label><label className="field"><span>Instruções</span><textarea rows="5" placeholder="Seja objetivo, educado e nunca invente valores."/></label><Button>Salvar</Button></>}{tab==="plano"&&<><h2>Plano</h2><p>Confira seu período de teste e sua assinatura atual.</p><div className="plan-box"><b>{profile?.plan==="free"||!profile?.plan?"Teste grátis":profile.plan.charAt(0).toUpperCase()+profile.plan.slice(1)}</b><strong>{profile?.plan==="essencial"?"R$49,90":profile?.plan==="profissional"?"R$99,90":profile?.plan==="business"?"R$199,90":"7 dias"}</strong><span>Status: {profile?.subscription_status||"inactive"}{profile?.billing_cycle?(" · "+(profile.billing_cycle==="annual"?"Anual":"Mensal")):""}</span><a href="/#precos" className="btn btn-primary">Ver planos</a></div></>}</div></div></>}


export default App;