Warning: truncated output (original token count: 28963)
Total output lines: 1738

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight, Bell, Check, ChevronRight, CircleDollarSign, CreditCard, QrCode,
  CalendarDays, ChevronLeft, LayoutDashboard, LogOut, Menu, MessageCircle, Plus, Receipt, Settings,
  Sparkles, TrendingUp, UserRound, Users, X, Wallet, Search, MoreHorizontal, Lock, Sun, Moon, RefreshCw
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { money, todayISO } from "./lib/formatters";
import { Button, Input, Empty, PageTitle } from "./components/AppPrimitives";
import { Customers } from "./pages/Customers";
import { TeamManagement } from "./pages/TeamManagement";
import { Charges } from "./pages/Charges";
import { PlanUsage } from "./components/PlanUsage";
import { toast, confirmDialog } from "./ui";
import { Terms, Privacy } from "./Legal";
import { PLAN_OPTIONS } from "./lib/plans";
import { hasFreeTrialAccess, hasPaidSubscriptionAccess } from "./lib/subscription-access";
import TurnstileCaptcha from "./TurnstileCaptcha";


function formatNotificationMoney(value){
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));
}

function notificationTime(value){
  if(!value) return "";
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
}

function buildNotifications(charges=[],payments=[]){
  const today=todayISO();
  const tomorrow=new Date();
  tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowISO=tomorrow.toISOString().slice(0,10);
  const items=[];

  charges
    .filter(x=>x.status==="pending"&&x.due_date&&x.due_date<today)
    .sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0,8)
    .forEach(x=>{
      const due=new Date(x.due_date+"T12:00:00");
      const days=Math.max(1,Math.floor((Date.now()-due.getTime())/86400000));
      const customer=x.customers?.name||"Cliente";
      items.push({
        id:"overdue:"+x.id,
        type:"overdue",
        priority:1,
        icon:"danger",
        title:`Cobrança atrasada · ${customer}`,
        description:`${formatNotificationMoney(x.amount)} · ${days} ${days===1?"dia":"dias"} de atraso`,
        href:"/app/cobrancas?filter=overdue",
        date:x.due_date
      });
    });

  charges
    .filter(x=>x.status==="pending"&&x.due_date===today)
    .sort((a,b)=>Number(b.amount||0)-Number(a.amount||0))
    .slice(0,8)
    .forEach(x=>{
      const customer=x.customers?.name||"Cliente";
      items.push({
        id:"today:"+x.id,
        type:"today",
        priority:2,
        icon:"warning",
        title:`Cobrança vence hoje · ${customer}`,
        description:formatNotificationMoney(x.amount),
        href:"/app/cobrancas",
        date:x.due_date
      });
    });

  charges
    .filter(x=>x.status==="pending"&&x.due_date===tomorrowISO)
    .sort((a,b)=>Number(b.amount||0)-Number(a.amount||0))
    .slice(0,6)
    .forEach(x=>{
      const customer=x.customers?.name||"Cliente";
      items.push({
        id:"tomorrow:"+x.id,
        type:"tomorrow",
        priority:3,
        icon:"calendar",
        title:`Cobrança vence amanhã · ${customer}`,
        description:formatNotificationMoney(x.amount),
        href:"/app/cobrancas",
        date:x.due_date
      });
    });

  const since=Date.now()-86400000;
  payments
    .filter(x=>x.paid_at&&new Date(x.paid_at).getTime()>=since)
    .sort((a,b)=>new Date(b.paid_at)-new Date(a.paid_at))
    .slice(0,8)
    .forEach(x=>{
      const customer=x.customers?.name||"Cliente";
      items.push({
        id:"payment:"+x.id,
        type:"payment",
        priority:4,
        icon:"payment",
        title:`Recebimento registrado · ${customer}`,
        description:formatNotificationMoney(x.amount)+` · ${notificationTime(x.paid_at)}`,
        href:"/app/recebimentos",
        date:x.paid_at
      });
    });

  return items.sort((a,b)=>(a.priority-b.priority)||String(b.date).localeCompare(String(a.date)));
}
const TRIAL_DAYS = 7;
const trialEnd = (createdAt) => new Date(new Date(createdAt).getTime() + TRIAL_DAYS * 86400000);
const trialDaysLeft = (createdAt) => Math.max(0, Math.ceil((trialEnd(createdAt) - new Date()) / 86400000));

class AppErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error,info){console.error("CobrançaPro runtime error:",error,info);}
  render(){
    if(this.state.error){
      return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:"24px",background:"#f7f7fa",fontFamily:"Inter,system-ui,sans-serif"}}>
        <div style={{width:"min(520px,100%)",background:"#fff",border:"1px solid #e5e6eb",borderRadius:"16px",padding:"24px",boxShadow:"0 20px 50px rgba(20,22,45,.08)"}}>
          <b style={{fontSize:"16px"}}>Não foi possível abrir o painel</b>
          <p style={{fontSize:"12px",color:"#777",lineHeight:"1.6",margin:"10px 0 16px"}}>O CobrançaPro encontrou um erro ao carregar esta tela. Recarregue a página para tentar novamente.</p>
          <button type="button" className="btn btn-primary" onClick={()=>window.location.reload()}>Recarregar painel</button>
        </div>
      </div>;
    }
    return this.props.children;
  }
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
  return <AppErrorBoundary><Routes>
    <Route path="/" element={<Landing session={session} />} />
    <Route path="/login" element={session ? <SessionRedirect session={session}/> : <Login />} />
    <Route path="/cadastro" element={session ? <SessionRedirect session={session}/> : <Signup />} />
    <Route path="/termos" element={<Terms />} />
    <Route path="/privacidade" element={<Privacy />} />
    <Route path="/recuperar" element={<ForgotPassword />} />
    <Route path="/nova-senha" element={<ResetPassword />} />
    <Route path="/onboarding" element={session ? <Onboarding session={session}/> : <Navigate to="/login" replace/>} />
    <Route path="/app/*" element={session ? <AppShell session={session}/> : <Navigate to="/login" replace/>} />
    <Route path="*" element={<Navigate to="/" replace/>} />
  </Routes></AppErrorBoundary>;
}

const ALLOWED_CHECKOUT_HOSTS=new Set(["checkout.perfectpay.com.br","go.perfectpay.com.br"]);
function getSafeCheckout(value){
  if(!value)return null;
  try{
    const url=new URL(value);
    if(url.protocol!=="https:"||!ALLOWED_CHECKOUT_HOSTS.has(url.hostname))return null;
    return url;
  }catch{
    return null;
  }
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

function ImageLightbox({image, onClose}) {
  useEffect(()=>{
    if(!image) return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKeyDown=(event)=>{
      if(event.key==="Escape") onClose();
    };
    window.addEventListener("keydown",onKeyDown);
    return ()=>{
      document.body.style.overflow=previousOverflow;
      window.removeEventListener("keydown",onKeyDown);
    };
  },[image,onClose]);

  if(!image) return null;

  return createPortal(
    <div
      className="lp-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Visualização ampliada: ${image.alt}`}
      onMouseDown={(event)=>{
        if(event.target===event.currentTarget) onClose();
      }}
    >
      <button type="button" className="lp-lightbox-close" onClick={onClose} aria-label="Fechar imagem ampliada">
        <X size={22}/>
      </button>
      <div className="lp-lightbox-content">
        <img src={image.src} alt={image.alt} />
        <span>Clique fora ou pressione Esc para fechar</span>
      </div>
    </div>,
    document.body
  );
}

function Landing({session}) {
  const [annualBilling,setAnnualBilling]=useState(false);
  const [lightbox,setLightbox]=useState(null);
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
    ["Copiloto de cobrança","Leitura inteligente da sua carteira, com prioridades claras sobre o que cobrar primeiro."],
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
                <div
                  className="lp-image-zoom"
                  role="button"
                  tabIndex={0}
                  onClick={()=>setLightbox({src:st.crop||st.img,alt:st.alt})}
                  onKeyDown={(event)=>{
                    if(event.key==="Enter"||event.key===" "){
                      event.preventDefault();
                      setLightbox({src:st.crop||st.img,alt:st.alt});
                    }
                  }}
                  aria-label={`Ampliar: ${st.alt}`}
                >
                  {st.crop ? <div className="lp-crop"><img src={st.crop} alt={st.alt} width="1200" height="568" loading="lazy" decoding="async" /></div> : <BrowserFrame src={st.img} alt={st.alt} width="1400" height="900" />}
                  <span className="lp-image-zoom-hint" aria-hidden="true"><Search size={16}/></span>
                </div>
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
        <nav aria-label="Rodapé"><a href="#precos">Planos</a><Link to="/login">Entrar</Link><Link to="/cadastro">Criar conta</Link><Link to="/termos">Termos de uso</Link><Link to="/privacidade">Privacidade</Link></nav>
      </div>
    </footer>
  <ImageLightbox image={lightbox} onClose={()=>setLightbox(null)} />
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
    if (!getSafeCheckout(checkoutUrl.toString())) {
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
  const nav=useNavigate(); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [captchaToken,setCaptchaToken]=useState(""); const [captchaKey,setCaptchaKey]=useState(0);
  const checkout=getSafeCheckout(new URLSearchParams(window.location.search).get("checkout"))?.toString()||null;
  async function submit(e){
    e.preventDefault();setError("");setBusy(true);
    if(!supabase){setError("Configure o Supabase no arquivo .env.local.");setBusy(false);return;}
    if(!captchaToken){setError("Confirme a verificação de segurança para continuar.");setBusy(false);return;}
    const {data,error}=await supabase.auth.signInWithPassword({email,password,options:{captchaToken}});
    setCaptchaKey(key=>key+1);
    if(error){setError(error.message==="Invalid login credentials"?"E-mail ou senha incorretos.":error.message);setBusy(false);return;}
    if(continuePendingCheckout(data?.user?.id)) return;
    if(checkout && data?.user?.id){
      const checkoutUrl=getSafeCheckout(checkout);
      if(checkoutUrl){
        checkoutUrl.searchParams.set("utm_content",data.user.id);
        window.location.href=checkoutUrl.toString();
        return;
      }
    }
    nav("/app");setBusy(false);
  }
  return <AuthLayout title="Bem-vindo de volta" subtitle="Entre na sua conta para continuar."><form onSubmit={submit} className="form-stack"><Input label="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><Input label="Senha" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/><TurnstileCaptcha key={captchaKey} onToken={setCaptchaToken}/><div className="form-meta"><Link to="/recuperar">Esqueci minha senha</Link></div>{error&&<div className="error">{error}</div>}<Button disabled={busy}>{busy?"Entrando...":"Entrar"}</Button></form><div className="auth-bottom">Ainda não tem conta? <Link to={checkout?`/cadastro?checkout=${encodeURIComponent(checkout)}`:"/cadastro"}>Criar conta</Link></div></AuthLayout>
}

function Signup() {
  const nav=useNavigate(); const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [company,setCompany]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [captchaToken,setCaptchaToken]=useState(""); const [captchaKey,setCaptchaKey]=useState(0);
  const checkout=getSafeCheckout(new URLSearchParams(window.location.search).get("checkout"))?.toString()||null;
  function continueToCheckout(userId){
    if(continuePendingCheckout(userId)) return true;
    if(!checkout || !userId) return false;
    const checkoutUrl=getSafeCheckout(checkout);
    if(!checkoutUrl)return false;
    checkoutUrl.searchParams.set("utm_content",userId);
    window.location.href=checkoutUrl.toString();
    return true;
  }
  async function submit(e){e.preventDefault();setError("");setBusy(true); if(!supabase){setError("Configure o Supabase no arquivo .env.local.");setBusy(false);return;}
    if(!captchaToken){setError("Confirme a verificação de segurança para continuar.");setBusy(false);return;}
    const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name,company_name:company},captchaToken}});
    setCaptchaKey(key=>key+1);
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
  return <AuthLayout title="Crie sua conta" subtitle="Teste o CobrançaPro grátis por 7 dias, sem cartão de crédito."><form onSubmit={submit} className="form-stack"><Input label="Seu nome" value={name} onChange={e=>setName(e.target.value)} required/><Input label="Nome da empresa" value={company} onChange={e=>setCompany(e.target.value)} required/><Input label="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><Input label="Senha" type="password" autoComplete="new-password" minLength="8" value={password} onChange={e=>setPassword(e.target.value)} required/><TurnstileCaptcha key={captchaKey} onToken={setCaptchaToken}/>{error&&<div className="error">{error}</div>}<Button disabled={busy}>{busy?"Criando...":"Criar conta"}</Button><p className="legal-note">Ao criar sua conta, você concorda com os <Link to="/termos" target="_blank">Termos de Uso</Link> e a <Link to="/privacidade" target="_blank">Política de Privacidade</Link>.</p></form><div className="auth-bottom">Já possui uma conta? <Link to="/login">Entrar</Link></div></AuthLayout>
}

function ForgotPassword() {
  const nav=useNavigate();
  const [email,setEmail]=useState("");
  const [token,setToken]=useState("");
  const [sent,setSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [captchaToken,setCaptchaToken]=useState("");
  const [captchaKey,setCaptchaKey]=useState(0);

  async function sendCode(e){
    e.preventDefault();
    setError("");
    if(!supabase){setError("Configure o Supabase primeiro.");return;}
    if(!captchaToken){setError("Confirme a verificação de segurança para continuar.");return;}

    setBusy(true);
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{
      redirectTo:`${(import.meta.env.VITE_APP_URL||window.location.origin).replace(/\/$/,"")}/nova-senha`,
      captchaToken
    });
    setCaptchaKey(key=>key+1);
    setCaptchaToken("");
    if(error)setError(error.message);
    else setSent(true);
    setBusy(false);
  }

  async function verifyCode(e){
    e.preventDefault();
    setError("");
    const cleanToken=token.trim().replace(/\D/g,"");
    if(!/^\d{6}$/.test(cleanToken)){
      setError("Digite o código de 6 dígitos recebido no e-mail.");
      return;
    }

    setBusy(true);
    const {error}=await supabase.auth.verifyOtp({
      email:email.trim(),
      token:cleanToken,
      type:"recovery"
    });
    if(error){
      setError(error.message==="Token has expired or is invalid"?"Código inválido ou expirado. Solicite um novo código.":error.message);
    }else{
      nav("/nova-senha",{replace:true});
    }
    setBusy(false);
  }

  return <AuthLayout title="Recuperar senha" subtitle={sent?"Digite o código de 6 dígitos enviado para seu e-mail.":"Enviaremos um código para você criar uma nova senha."}>
    {sent
      ? <form onSubmit={verifyCode} className="form-stack">
          <Input label="Código de recuperação" inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={token} onChange={e=>setToken(e.target.value.replace(/\D/g,"").slice(0,6))} required/>
          {error&&<div className="error">{error}</div>}
          <Button disabled={busy}>{busy?"Verificando...":"Confirmar código"}</Button>
          <button type="button" className="link-button" onClick={()=>{setSent(false);setToken("");setError("");setCaptchaKey(key=>key+1);}} disabled={busy}>Enviar outro código</button>
        </form>
      : <form onSubmit={sendCode} className="form-stack">
          <Input label="E-mail" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/>
          <TurnstileCaptcha key={captchaKey} onToken={setCaptchaToken}/>
          {error&&<div className="error">{error}</div>}
          <Button disabled={busy}>{busy?"Enviando...":"Enviar código"}</Button>
        </form>}
    <div className="auth-bottom"><Link to="/login">Voltar para login</Link></div>
  </AuthLayout>
}
function ResetPassword() {
  const nav=useNavigate(); const [password,setPassword]=useState(""); const [done,setDone]=useState(false); const [error,setError]=useState("");
  async function submit(e){e.preventDefault();if(!supabase)return setError("Configure o Supabase.");const {error}=await supabase.auth.updateUser({password});if(error)setError(error.message);else{setDone(true);setTimeout(()=>nav("/app"),900);}}
  return <AuthLayout title="Nova senha" subtitle="Escolha uma senha nova para sua conta.">{done?<div className="success-box"><Check size={20}/> Senha alterada. Entrando...</div>:<form onSubmit={submit} className="form-stack"><Input label="Nova senha" type="password" autoComplete="new-password" minLength="8" value={password} onChange={e=>setPassword(e.target.value)} required/>{error&&<div className="error">{error}</div>}<Button>Salvar nova senha</Button></form>}</AuthLayout>
}

function Onboarding({session}) {
  const nav=useNavigate(); const [step,setStep]=useState(1); const [company,setCompany]=useState(""); const [segment,setSegment]=useState(""); const [phone,setPhone]=useState(""); const [methods,setMethods]=useState(["Pix"]); const [busy,setBusy]=useState(false);
  async function finish(){if(!supabase)return;setBusy(true);const {data:profile}=await supabase.from("profiles").select("id,company_id").eq("id",session.user.id).single();let companyId=profile?.company_id;
if(!companyId){const {data:newId,error}=await supabase.rpc("create_my_company",{p_name:company||session.user.user_metadata?.company_name||"Minha empresa",p_segment:segment||null,p_phone:phone||null});if(error){toast(error.message);setBusy(false);return;}companyId=newId;await supabase.from("profiles").update({full_name:session.user.user_metadata?.full_name||""}).eq("id",session.user.id);}
await supabase.from("company_settings").upsert({company_id:companyId,default_payment_methods:methods},{onConflict:"company_id"});await supabase.from("ai_settings").upsert({company_id:companyId},{onConflict:"company_id"});
    setBusy(false);nav("/app");
  }
  return <div className="auth-page"><div className="onboard-card"><Link to="/" className="brand"><img className="brand-logo" src="/logo.png" alt="CobrançaPro" /></Link><div className="progress"><span style={{width:`${step*33.33}%`}}></span></div>{step===1&&<><div className="auth-heading"><h1>Vamos configurar seu negócio.</h1><p>Leva menos de 1 minuto.</p></div><div className="form-stack"><Input label="Nome da empresa" value={company} onChange={e=>setCompany(e.target.value)} required/><Input label="Segmento" placeholder="Ex.: salão, clínica, agência..." value={segment} onChange={e=>setSegment(e.target.value)}/><Input label="Telefone" value={phone} onChange={e=>setPhone(e.target.value)}/><Button onClick={()=>setStep(2)}>Continuar <ArrowRight size={16}/></Button></div></>}{step===2&&<><div className="auth-heading"><h1>Como você recebe?</h1><p>Selecione as formas que sua empresa utiliza.</p></div><div className="choice-grid">{["Pix","Dinheiro","Cartão","Transferência","Outro"].map(m=><button type="button" className={`choice ${methods.includes(m)?"selected":""}`} onClick={()=>setMethods(x=>x.includes(m)?x.filter(a=>a!==m):[...x,m])} key={m}>{methods.includes(m)&&<Check size={16}/>} {m}</button>)}</div><div className="onboard-actions"><Button variant="secondary" onClick={()=>setStep(1)}>Voltar</Button><Button onClick={()=>setStep(3)}>Continuar <ArrowRight size={16}/></Button></div></>}{step===3&&<><div className="auth-heading"><h1>Seu CobrançaPro está pronto.</h1><p>Você poderá configurar o WhatsApp e a IA depois.</p></div><div className="finish-box"><MessageCircle size={20}/><div><b>WhatsApp</b><span>Envie cobranças com mensagens prontas.</span></div></div><div className="finish-box"><Sparkles size={20}/><div><b>Assistente IA</b><span>Crie mensagens naturais para cada situação.</span></div></div><div className="onboard-actions"><Button variant="secondary" onClick={()=>setStep(2)}>Voltar</Button><Button onClick={finish} disabled={busy}>{busy?"Salvando...":"Ir para o dashboard"} <ArrowRight size={16}/></Button></div></>}</div></div>
}

function AppShell({session}) {
  const nav=useNavigate(); const loc=useLocation(); const [mobile,setMobile]=useState(false); const [notificationsOpen,setNotificationsOpen]=useState(false); const [profileOpen,setProfileOpen]=useState(false); const [notifications,setNotifications]=useState([]); const [readNotificationIds,setReadNotificationIds]=useState([]); const [trialBlocked,setTrialBlocked]=useState(false); const [trialLoading,setTrialLoading]=useState(true); const [trialDays,setTrialDays]=useState(TRIAL_DAYS); const [currentPlan,setCurrentPlan]=useState("free"); const [expiredPaidSubscription,setExpiredPaidSubscription]=useState(false); const touchStartX=React.useRef(null); const touchStartY=React.useRef(null); const pointerStartX=React.useRef(null); const pointerStartY=React.useRef(null);
  const [theme,setTheme]=useState(()=>{
    try { return localStorage.getItem("cobrancapro-theme")==="dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  useEffect(()=>{
    if(theme==="dark") document.documentElement.setAttribute("data-theme","dark");
    else document.documentElement.r…8963 tokens truncated…0),0);
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
  const [charges,setCharges]=useState([]),[payments,setPayments]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");

  const parseLocalDate=(value,endOfDay=false)=>{
    if(!value)return null;
    const [y,m,d]=String(value).split("-").map(Number);
    if(!y||!m||!d)return null;
    const date=new Date(y,m-1,d);
    if(endOfDay)date.setHours(23,59,59,999);
    else date.setHours(0,0,0,0);
    return date;
  };

  const dates=useMemo(()=>{
    const todayEnd=new Date();
    todayEnd.setHours(23,59,59,999);
    if(range==="custom"){
      const start=parseLocalDate(from);
      const end=parseLocalDate(to||from,true);
      return {start,end};
    }
    const start=new Date(todayEnd);
    start.setDate(start.getDate()-(range==="7"?6:range==="90"?89:29));
    start.setHours(0,0,0,0);
    return {start,end:todayEnd};
  },[range,from,to]);

  useEffect(()=>{
    let active=true;
    if(!companyId){
      setLoading(false);
      setCharges([]);
      setPayments([]);
      return()=>{active=false};
    }
    async function load(){
      setLoading(true);
      setError("");
      try{
        const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error("A consulta demorou demais. Verifique sua conexão e tente novamente.")),12000));
        const query=Promise.all([
          supabase.from("charges").select("id,amount,due_date,status,created_at,customers(name)").eq("company_id",companyId).order("due_date",{ascending:true}),
          supabase.from("payments").select("id,amount,paid_at,customer_id,customers(name)").eq("company_id",companyId).order("paid_at",{ascending:true})
        ]);
        const [chargeRes,paymentRes]=await Promise.race([query,timeout]);
        if(!active)return;
        const firstError=chargeRes.error||paymentRes.error;
        setCharges(chargeRes.data||[]);
        setPayments(paymentRes.data||[]);
        setError(firstError?.message||"");
      }catch(err){
        if(active)setError(err?.message||"Não foi possível carregar os dados do relatório.");
      }finally{
        if(active)setLoading(false);
      }
    }
    load();
    return()=>{active=false};
  },[companyId]);

  async function refresh(){
    if(!companyId)return;
    setLoading(true);
    setError("");
    try{
      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error("A consulta demorou demais. Verifique sua conexão e tente novamente.")),12000));
      const query=Promise.all([
        supabase.from("charges").select("id,amount,due_date,status,created_at,customers(name)").eq("company_id",companyId).order("due_date",{ascending:true}),
        supabase.from("payments").select("id,amount,paid_at,customer_id,customers(name)").eq("company_id",companyId).order("paid_at",{ascending:true})
      ]);
      const [chargeRes,paymentRes]=await Promise.race([query,timeout]);
      setCharges(chargeRes.data||[]);
      setPayments(paymentRes.data||[]);
      const firstError=chargeRes.error||paymentRes.error;
      setError(firstError?.message||"");
    }catch(err){
      setError(err?.message||"Não foi possível atualizar o relatório.");
    }finally{
      setLoading(false);
    }
  }

  const customInvalid=range==="custom"&&(!dates.start||!dates.end||dates.end<dates.start);

  const inChargePeriod=value=>{
    if(customInvalid||!dates.start||!dates.end||!value)return false;
    const d=parseLocalDate(value);
    return d&&d>=dates.start&&d<=dates.end;
  };

  const inPaymentPeriod=value=>{
    if(customInvalid||!dates.start||!dates.end||!value)return false;
    const d=new Date(value);
    return !Number.isNaN(d.getTime())&&d>=dates.start&&d<=dates.end;
  };

  const periodCharges=useMemo(
    ()=>charges.filter(x=>x.status!=="cancelled"&&inChargePeriod(x.due_date)),
    [charges,dates,customInvalid]
  );
  const periodPayments=useMemo(
    ()=>payments.filter(x=>inPaymentPeriod(x.paid_at)),
    [payments,dates,customInvalid]
  );

  const billed=periodCharges.reduce((sum,x)=>sum+Number(x.amount||0),0);
  const received=periodPayments.reduce((sum,x)=>sum+Number(x.amount||0),0);
  const open=periodCharges.filter(x=>x.status==="pending").reduce((sum,x)=>sum+Number(x.amount||0),0);
  const overdue=periodCharges.filter(x=>x.status==="pending"&&x.due_date<todayISO()).reduce((sum,x)=>sum+Number(x.amount||0),0);

  const paidCount=periodCharges.filter(x=>x.status==="paid").length;
  const lateCount=periodCharges.filter(x=>x.status==="pending"&&x.due_date<todayISO()).length;
  const pendingCount=periodCharges.filter(x=>x.status==="pending"&&x.due_date>=todayISO()).length;
  const statusTotal=paidCount+lateCount+pendingCount;
  const rate=statusTotal?Math.round(paidCount/statusTotal*100):0;
  const ticket=periodPayments.length?received/periodPayments.length:0;
  const paidPct=statusTotal?paidCount/statusTotal*100:0;
  const pendingPct=statusTotal?pendingCount/statusTotal*100:0;
  const latePct=statusTotal?lateCount/statusTotal*100:0;

  const niceMax=value=>{
    if(value<=0)return 100;
    const magnitude=Math.pow(10,Math.floor(Math.log10(value)));
    const normalized=value/magnitude;
    const step=normalized<=1?1:normalized<=2?2:normalized<=5?5:10;
    return step*magnitude;
  };

  const buckets=useMemo(()=>{
    if(customInvalid||!dates.start||!dates.end)return [];
    const totalDays=Math.max(1,Math.floor((dates.end.getTime()-dates.start.getTime())/86400000)+1);
    const count=Math.min(7,totalDays);
    return Array.from({length:count},(_,index)=>{
      const startOffset=Math.floor(index*totalDays/count);
      const endOffset=Math.max(startOffset,Math.floor((index+1)*totalDays/count)-1);
      const start=new Date(dates.start);
      start.setDate(start.getDate()+startOffset);
      const end=new Date(dates.start);
      end.setDate(end.getDate()+endOffset);
      if(end>dates.end)end.setTime(dates.end.getTime());
      const b=periodCharges.filter(x=>{
        const d=parseLocalDate(x.due_date);
        return d&&d>=start&&d<=end;
      }).reduce((sum,x)=>sum+Number(x.amount||0),0);
      const r=periodPayments.filter(x=>{
        const d=new Date(x.paid_at);
        return !Number.isNaN(d.getTime())&&d>=start&&d<=new Date(end.getFullYear(),end.getMonth(),end.getDate(),23,59,59,999);
      }).reduce((sum,x)=>sum+Number(x.amount||0),0);
      const label=totalDays<=14
        ? start.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})
        : totalDays<=45
          ? start.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})
          : start.toLocaleDateString("pt-BR",{month:"short"}).replace(".","");
      return {index,start,end,label,b:r?b:0,r};
    });
  },[dates,periodCharges,periodPayments,customInvalid]);

  const chartMax=niceMax(Math.max(0,...buckets.flatMap(x=>[x.b,x.r])));
  const periodLabel=range==="7"?"7 dias":range==="90"?"90 dias":range==="custom"?"período selecionado":"30 dias";

  const customerMap={};
  periodPayments.forEach(x=>{
    const name=x.customers?.name||"Cliente";
    customerMap[name]=(customerMap[name]||0)+Number(x.amount||0);
  });
  const ranking=Object.entries(customerMap).sort((a,b)=>b[1]-a[1]).slice(0,5);

  return <div className="cp-reports-page">
    <PageTitle title="Relatórios" subtitle="Acompanhe o desempenho financeiro da sua empresa."/>
    <div className="cp-report-toolbar">
      <div className="cp-report-periods" role="group" aria-label="Período do relatório">
        {[["7","7 dias"],["30","30 dias"],["90","90 dias"],["custom","Personalizado"]].map(([value,label])=>
          <button key={value} type="button" className={range===value?"active":""} onClick={()=>setRange(value)}>{label}</button>
        )}
      </div>
      <div className="cp-report-toolbar-right">
        {range==="custom"&&<div className="cp-report-dates">
          <label>De<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label>
          <span>até</span>
          <label>Até<input type="date" value={to} min={from||undefined} max={todayISO()} onChange={e=>setTo(e.target.value)}/></label>
        </div>}
        <button type="button" className="cp-report-refresh" onClick={refresh} disabled={loading} aria-label="Atualizar relatório" title="Atualizar relatório"><RefreshCw size={15} className={loading?"is-spinning":""}/><span>Atualizar</span></button>
      </div>
    </div>

    {customInvalid&&<div className="cp-report-notice">Selecione um período válido para visualizar o relatório.</div>}
    {error&&<div className="cp-report-error"><div><strong>Não foi possível carregar todos os dados.</strong><span>{error}</span></div><button type="button" onClick={refresh}>Tentar novamente</button></div>}

    {loading?<div className="cp-report-loading"><div className="cp-report-loading-card"/><div className="cp-report-loading-card"/><div className="cp-report-loading-card"/><div className="cp-report-loading-card"/><div className="cp-report-loading-panel"/><div className="cp-report-loading-panel"/></div>:!customInvalid&&<>
      <div className="cp-report-kpis">
        <div className="cp-report-kpi cp-report-kpi-success"><span>Recebido no período</span><strong>{money(received)}</strong><small>{periodPayments.length} recebimento{periodPayments.length===1?"":"s"}</small></div>
        <div className="cp-report-kpi"><span>Em aberto</span><strong>{money(open)}</strong><small>{pendingCount+lateCount} cobrança{pendingCount+lateCount===1?"":"s"} pendente{pendingCount+lateCount===1?"":"s"}</small></div>
        <div className="cp-report-kpi cp-report-kpi-danger"><span>Atrasado</span><strong>{money(overdue)}</strong><small>{lateCount} cobrança{lateCount===1?"":"s"} em atraso</small></div>
        <div className="cp-report-kpi"><span>Taxa de recebimento</span><strong>{rate}%</strong><small>{paidCount} de {statusTotal} cobranças pagas</small></div>
      </div>

      <div className="cp-report-grid cp-report-top-grid">
        <section className="cp-report-panel cp-report-chart-panel">
          <div className="cp-report-panel-head">
            <div><span className="cp-report-eyebrow">DESEMPENHO</span><h2>Cobrado x recebido</h2><p>{periodLabel}</p></div>
            <div className="cp-report-legend"><span><i className="billed"/>Cobrado</span><span><i className="received"/>Recebido</span></div>
          </div>
          {buckets.length===0||!periodCharges.length&&!periodPayments.length
            ? <div className="cp-report-empty-chart"><TrendingUp size={19}/><strong>Sem movimentações no período</strong><span>Crie cobranças ou registre recebimentos para gerar o gráfico.</span></div>
            : <div className="cp-report-chart">
                <div className="cp-report-axis"><span>{money(chartMax)}</span><span>{money(chartMax/2)}</span><span>R$ 0</span></div>
                <div className="cp-report-bars">
                  <div className="cp-report-grid-lines" aria-hidden="true"><i/><i/><i/></div>
                  {buckets.map(bucket=>
                    <div className="cp-report-bar-col" key={bucket.index} title={bucket.label}>
                      <div className="cp-report-bar-wrap">
                        <i className="billed" style={{height:(bucket.b?Math.max(4,bucket.b/chartMax*100):0)+"%"}} aria-label={"Cobrado "+money(bucket.b)}/>
                        <i className="received" style={{height:(bucket.r?Math.max(4,bucket.r/chartMax*100):0)+"%"}} aria-label={"Recebido "+money(bucket.r)}/>
                      </div>
                      <span>{bucket.label}</span>
                    </div>
                  )}
                </div>
              </div>
          }
          <div className="cp-report-chart-foot"><div><span>Valor cobrado</span><strong>{money(billed)}</strong></div><div><span>Valor recebido</span><strong>{money(received)}</strong></div></div>
        </section>

        <section className="cp-report-panel cp-report-status-panel">
          <div className="cp-report-panel-head"><div><span className="cp-report-eyebrow">STATUS</span><h2>Situação das cobranças</h2><p>{statusTotal} no período</p></div></div>
          <div className="cp-report-status-score"><strong>{rate}%</strong><span>taxa paga</span></div>
          <div className="cp-report-status-track" aria-hidden="true">
            <span className="paid" style={{width:paidPct+"%"}}/>
            <span className="pending" style={{width:pendingPct+"%"}}/>
            <span className="late" style={{width:latePct+"%"}}/>
          </div>
          <div className="cp-report-status-list">
            <div><span><i className="paid"/>Pagas</span><strong>{paidCount}</strong></div>
            <div><span><i className="pending"/>A receber</span><strong>{pendingCount}</strong></div>
            <div><span><i className="late"/>Atrasadas</span><strong>{lateCount}</strong></div>
          </div>
          <div className="cp-report-status-foot"><span>Taxa calculada por quantidade de cobranças.</span></div>
        </section>
      </div>

      <div className="cp-report-grid cp-report-bottom-grid">
        <section className="cp-report-panel">
          <div className="cp-report-panel-head"><div><span className="cp-report-eyebrow">RECEITA</span><h2>Recebimentos por cliente</h2><p>Clientes que mais geraram receita</p></div></div>
          {ranking.length
            ? <div className="cp-report-ranking">{ranking.map(([name,value],index)=><div className="cp-report-rank" key={name}>
                <span className="position">{index+1}</span>
                <div className="main"><b>{name}</b><em><i style={{width:Math.max(7,value/(ranking[0]?.[1]||1)*100)+"%"}}/></em></div>
                <strong>{money(value)}</strong>
              </div>)}</div>
            : <div className="cp-report-empty">Nenhum recebimento registrado no período.</div>
          }
        </section>

        <section className="cp-report-panel">
          <div className="cp-report-panel-head"><div><span className="cp-report-eyebrow">RESUMO</span><h2>Indicadores do período</h2><p>Visão geral das movimentações</p></div></div>
          <div className="cp-report-summary">
            <div><span>Cobranças emitidas</span><strong>{periodCharges.length}</strong></div>
            <div><span>Cobranças pagas</span><strong>{paidCount}</strong></div>
            <div><span>Valor cobrado</span><strong>{money(billed)}</strong></div>
            <div><span>Valor recebido</span><strong>{money(received)}</strong></div>
            <div><span>Valor em aberto</span><strong>{money(open)}</strong></div>
            <div><span>Ticket médio recebido</span><strong>{money(ticket)}</strong></div>
          </div>
        </section>
      </div>
    </>}
  </div>;
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
function SettingsPage({canUseAI=false,companyId=null}){const [tab,setTab]=useState("empresa");const [profile,setProfile]=useState(null);const [teamRole,setTeamRole]=useState(null);const [company,setCompany]=useState({name:"",phone:"",segment:"",avatar_url:""});const [avatarUploading,setAvatarUploading]=useState(false);const [whatsapp,setWhatsapp]=useState("");const [savingWhatsApp,setSavingWhatsApp]=useState(false);const [savedWhatsApp,setSavedWhatsApp]=useState(false);const [whatsappError,setWhatsappError]=useState("");const [pix,setPix]=useState({key:"",name:"",city:""});const [savingPix,setSavingPix]=useState(false);const [savedPix,setSavedPix]=useState(false);const [pixError,setPixError]=useState("");
useEffect(()=>{let active=true;async function load(){const {data}=await supabase.auth.getUser();if(!data?.user)return;const [{data:p},{data:c},{data:ps},{data:membership}]=await Promise.all([supabase.from("profiles").select("plan,billing_cycle,subscription_status,subscription_expires_at").eq("id",data.user.id).single(),companyId?supabase.from("companies").select("name,phone,segment,avatar_url").eq("id",companyId).single():Promise.resolve({data:null}),companyId?supabase.from("company_settings").select("pix_key,pix_name,pix_city").eq("company_id",companyId).maybeSingle():Promise.resolve({data:null}),companyId?supabase.from("company_members").select("role").eq("company_id",companyId).eq("user_id",data.user.id).maybeSingle():Promise.resolve({data:null})]);if(!active)return;setProfile(p||null);setTeamRole(membership?.role||null);if(c){setCompany({name:c.name||"",phone:c.phone||"",segment:c.segment||"",avatar_url:c.avatar_url||""});setWhatsapp(c.phone||"");}if(ps){setPix({key:ps.pix_key||"",name:ps.pix_name||"",city:ps.pix_city||""});}}load();const refresh=()=>load();window.addEventListener("focus",refresh);const timer=window.setInterval(load,15000);return()=>{active=false;window.removeEventListener("focus",refresh);window.clearInterval(timer);};},[companyId]);

function normalizeWhatsApp(value){const digits=(value||"").replace(/\D/g,"");if(!digits)return "";if(digits.startsWith("55"))return digits;return "55"+digits;}
function formatWhatsApp(value){const digits=(value||"").replace(/\D/g,"");if(digits.length===13&&digits.startsWith("55"))return "+"+digits.slice(0,2)+" ("+digits.slice(2,4)+") "+digits.slice(4,9)+"-"+digits.slice(9);if(digits.length===11)return "("+digits.slice(0,2)+") "+digits.slice(2,7)+"-"+digits.slice(7);return value||"";}
async function uploadAvatar(file){if(!file||!companyId)return;const allowed=["image/jpeg","image/png","image/webp"];if(!allowed.includes(file.type)){toast("Use uma imagem JPG, PNG ou WebP.");return;}if(file.size>3*1024*1024){toast("A imagem deve ter no máximo 3 MB.");return;}setAvatarUploading(true);try{const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";const path=companyId+"/avatar."+ext;const {error:uploadError}=await supabase.storage.from("company-avatars").upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});if(uploadError)throw uploadError;const {data:pub}=supabase.storage.from("company-avatars").getPublicUrl(path);const url=pub?.publicUrl+"?v="+Date.now();const {error:updateError}=await supabase.from("companies").update({avatar_url:url}).eq("id",companyId);if(updateError)throw updateError;setCompany(v=>({...v,avatar_url:url}));}catch(error){toast("Não foi possível salvar a foto agora. "+(error?.message||""));}finally{setAvatarUploading(false);}}async function saveWhatsApp(){setWhatsappError("");setSavedWhatsApp(false);const normalized=normalizeWhatsApp(whatsapp);if(!/^55\d{10,11}$/.test(normalized)){setWhatsappError("Digite um número válido com DDD. Ex.: (24) 99999-9999");return;}setSavingWhatsApp(true);const {error}=await supabase.from("companies").update({phone:normalized}).eq("id",companyId);if(error)setWhatsappError("Não foi possível salvar agora. "+error.message);else{setCompany(v=>({...v,phone:normalized}));setWhatsapp(formatWhatsApp(normalized));setSavedWhatsApp(true);}setSavingWhatsApp(false);}
async function savePix(){setPixError("");setSavedPix(false);if(!companyId){setPixError("Sua empresa ainda está carregando. Aguarde alguns segundos.");return;}const key=String(pix.key||"").trim(),name=String(pix.name||"").trim(),city=String(pix.city||"").trim();if(!key){setPixError("Informe a chave Pix da empresa.");return;}if(!name){setPixError("Informe o nome que aparecerá no pagamento.");return;}if(name.length>25){setPixError("O nome do recebedor deve ter no máximo 25 caracteres.");return;}if(!city){setPixError("Informe a cidade da empresa.");return;}if(city.length>15){setPixError("A cidade deve ter no máximo 15 caracteres.");return;}setSavingPix(true);const {error}=await supabase.from("company_settings").upsert({company_id:companyId,pix_key:key,pix_name:name,pix_city:city},{onConflict:"company_id"});if(error)setPixError("Não foi possível salvar o Pix agora. "+error.message);else{setPix({key,name,city});setSavedPix(true);}setSavingPix(false);}


useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("tab");if(requested==="empresa"||(teamRole==="owner"&&["whatsapp","pix","ia","plano"].includes(requested)&&!(requested==="ia"&&!canUseAI))||(requested==="equipe"&&teamRole==="owner"))setTab(requested);},[canUseAI,teamRole,profile?.plan]);

return <><PageTitle title="Configurações" subtitle="Personalize o CobrançaPro para sua empresa."/><div className="settings-layout"><div className="settings-nav">{[["empresa","Empresa"],...(teamRole==="owner"?[["whatsapp","WhatsApp"],["pix","Pix"],...(canUseAI?[["ia","IA"]]:[]),["plano","Plano"],["equipe","Equipe"]]:[])].map(([x,l])=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{l}</button>)}</div><div className="panel settings-panel">{tab==="empresa"&&<><h2>Empresa</h2><p>Dados básicos do seu negócio.</p><div className="company-profile-editor"><div className="company-profile-avatar">{company.avatar_url?<img src={company.avatar_url} alt={company.name||"Empresa"}/>:<span>{(company.name||"E").slice(0,1).toUpperCase()}</span>}</div>{teamRole==="owner"&&<div><b>Foto da empresa</b><p>Essa imagem aparece no canto superior direito do sistema.</p><label className="btn btn-secondary upload-avatar-btn">{avatarUploading?"Enviando...":"Alterar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarUploading} onChange={e=>{uploadAvatar(e.target.files?.[0]);e.target.value=""}}/></label></div>}</div><div className="form-grid"><Input label="Nome da empresa" value={company.name} placeholder="Minha empresa" readOnly/><Input label="Telefone" value={formatWhatsApp(company.phone)} placeholder="(24) 99999-9999" readOnly/><Input label="Segmento" value={company.segment} placeholder="Ex.: clínica" readOnly/></div><small>Os dados básicos da empresa são definidos no cadastro inicial.</small></>}{tab==="whatsapp"&&<><h2>WhatsApp</h2><p>Configure o número usado nas mensagens de cobrança pelo WhatsApp.</p><div className="connection"><div><span className="status-dot" style={{background:whatsapp?"#22c55e":"#9ca3af"}}></span><b>{whatsapp?"WhatsApp configurado":"WhatsApp não configurado"}</b><small>{whatsapp?"Número salvo: "+formatWhatsApp(whatsapp):"Cadastre o número do WhatsApp da sua empresa para deixar o canal pronto."}</small></div></div><div className="form-stack" style={{marginTop:20}}><Input label="Número do WhatsApp" value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} placeholder="(24) 99999-9999" inputMode="tel" autoComplete="tel"/><small>Use o número completo com DDD. O CobrançaPro salva o número no formato internacional.</small>{whatsappError&&<div className="error">{whatsappError}</div>}{savedWhatsApp&&<div className="success-box"><Check size={18}/> Número do WhatsApp salvo com sucesso.</div>}<div className="modal-actions"><Button type="button" onClick={saveWhatsApp} disabled={savingWhatsApp}>{savingWhatsApp?"Salvando...":"Salvar número"}</Button>{whatsapp&&<Button type="button" variant="secondary" onClick={()=>window.open("https://wa.me/"+normalizeWhatsApp(whatsapp),"_blank")}>Testar WhatsApp</Button>}</div></div></>}{tab==="pix"&&<><div className="settings-section-heading"><div className="settings-section-icon"><QrCode size={18}/></div><div><h2>Pix</h2><p>Configure a chave que será usada para gerar o Pix Copia e Cola das cobranças.</p></div><span className={"settings-connection-badge "+(pix.key?"is-active":"")}>{pix.key?"Configurado":"Não configurado"}</span></div><div className="settings-pix-card"><div className="settings-pix-fields"><Input label="Chave Pix" value={pix.key} onChange={e=>setPix(v=>({...v,key:e.target.value}))} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" autoComplete="off"/><Input label="Nome do recebedor" value={pix.name} onChange={e=>setPix(v=>({...v,name:e.target.value}))} placeholder={company.name||"Nome da empresa"} maxLength={25}/><Input label="Cidade" value={pix.city} onChange={e=>setPix(v=>({...v,city:e.target.value.toUpperCase()}))} placeholder="Ex.: BARRA MANSA" maxLength={15}/></div><div className="settings-pix-note"><QrCode size={16}/><span>Esses dados aparecem no Pix gerado para cada cobrança. O nome aceita até 25 caracteres e a cidade até 15.</span></div>{pixError&&<div className="error">{pixError}</div>}{savedPix&&<div className="success-box"><Check size={18}/> Configuração Pix salva com sucesso.</div>}<div className="modal-actions"><Button type="button" onClick={savePix} disabled={savingPix}>{savingPix?"Salvando...":"Salvar configuração Pix"}</Button></div></div></>}{tab==="ia"&&<><h2>Assistente IA</h2><p>Defina como o assistente deve escrever.</p><label className="field"><span>Nome do assistente</span><input defaultValue="Assistente CobrançaPro"/></label><label className="field"><span>Instruções</span><textarea rows="5" placeholder="Seja objetivo, educado e nunca invente valores."/></label><Button>Salvar</Button></>}{tab==="plano"&&<><h2>Plano</h2><p>Confira seu período de teste e sua assinatura atual.</p><div className="plan-box"><b>{profile?.plan==="free"||!profile?.plan?"Teste grátis":profile.plan.charAt(0).toUpperCase()+profile.plan.slice(1)}</b><strong>{profile?.plan==="essencial"?"R$49,90":profile?.plan==="profissional"?"R$99,90":profile?.plan==="business"?"R$199,90":"7 dias"}</strong><span>Status: {profile?.subscription_status||"inactive"}{profile?.billing_cycle?(" · "+(profile.billing_cycle==="annual"?"Anual":"Mensal")):""}</span><a href="/#precos" className="btn btn-primary">Ver planos</a></div></>}{tab==="equipe"&&teamRole==="owner"&&<TeamManagement companyId={companyId} plan={profile?.plan}/>}</div></div></>}


export default App;
