import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

function LegalLayout({title,children}){
  return <div className="legal-page">
    <header className="legal-header">
      <div className="legal-header-inner">
        <Link to="/" className="legal-brand" aria-label="Voltar para a página inicial">
          <img src="/logo.png" alt="CobrançaPro" />
        </Link>
        <Link to="/" className="legal-back"><ArrowLeft size={16}/> Voltar ao início</Link>
      </div>
    </header>

    <main className="legal-main">
      <div className="legal-wrap">
        <div className="legal-meta">
          <span>DOCUMENTAÇÃO</span>
          <span>Última atualização · 02/10/2026</span>
        </div>

        <div className="legal-title">
          <h1>{title}</h1>
          <p>Informações importantes sobre o uso e o tratamento de dados no CobrançaPro.</p>
        </div>

        <article className="legal-card">
          <div className="legal-content">{children}</div>
        </article>

        <div className="legal-bottom">
          <Link to="/termos">Termos de Uso</Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacidade">Política de Privacidade</Link>
        </div>
      </div>
    </main>

    <footer className="legal-footer">
      <div className="legal-footer-inner">
        <span>© 2026 CobrançaPro</span>
        <Link to="/">Página inicial</Link>
      </div>
    </footer>
  </div>;
}

export function Terms(){
  return <LegalLayout title="Termos de Uso">
    <h2>1. Aceitação</h2>
    <p>Ao criar uma conta e usar o CobrançaPro, você concorda com estes Termos de Uso. Se não concordar, não utilize o serviço.</p>
    <h2>2. O serviço</h2>
    <p>O CobrançaPro é um sistema online para organizar clientes, cobranças e recebimentos de pequenos negócios e MEIs. O sistema registra e acompanha cobranças; ele não processa pagamentos entre você e seus clientes e não é uma instituição financeira.</p>
    <h2>3. Sua conta</h2>
    <p>Você é responsável por manter a senha em segurança, pelas informações cadastradas e por toda atividade realizada na sua conta. Informe dados verdadeiros e mantenha-os atualizados.</p>
    <h2>4. Teste grátis, planos e pagamento</h2>
    <p>Novas contas têm 7 dias de teste grátis, sem cartão de crédito. Após o teste, o uso continuado depende da contratação de um plano pago. Os pagamentos são processados pela Perfect Pay, e as condições de cada plano (valores e limites) estão na página de planos. Planos de assinatura são renovados no período contratado até serem cancelados. Você pode exercer o direito de arrependimento em até 7 dias após a contratação, conforme o Código de Defesa do Consumidor.</p>
    <h2>5. Dados dos seus clientes</h2>
    <p>Os dados dos seus clientes que você cadastra no sistema são de sua responsabilidade. Você declara ter o direito de usá-los para fins de cobrança e se compromete a enviar mensagens de cobrança de forma respeitosa e dentro da lei. Nesses dados, você atua como controlador e o CobrançaPro como operador, conforme a LGPD.</p>
    <h2>6. Uso proibido</h2>
    <p>É proibido usar o serviço para fins ilegais, para assediar ou constranger pessoas, para tentar acessar dados de outras contas, burlar limites de plano ou comprometer a segurança e a disponibilidade do sistema.</p>
    <h2>7. Disponibilidade</h2>
    <p>Trabalhamos para manter o serviço disponível, mas podem ocorrer interrupções para manutenção ou por fatores fora do nosso controle. Recomendamos manter seus próprios registros importantes.</p>
    <h2>8. Limitação de responsabilidade</h2>
    <p>O CobrançaPro é fornecido como ferramenta de apoio à gestão. Não garantimos o recebimento de valores de seus clientes. Na máxima extensão permitida em lei, nossa responsabilidade se limita ao valor pago por você nos últimos 12 meses.</p>
    <h2>9. Propriedade intelectual</h2>
    <p>O sistema, a marca e o conteúdo do CobrançaPro pertencem aos seus titulares. Os dados que você cadastra continuam sendo seus.</p>
    <h2>10. Cancelamento</h2>
    <p>Você pode parar de usar o serviço e cancelar sua assinatura a qualquer momento. Podemos suspender contas que violem estes termos.</p>
    <h2>11. Alterações e foro</h2>
    <p>Podemos atualizar estes termos, e a data de atualização estará no topo desta página. Estes termos são regidos pela lei brasileira, e fica eleito o foro do domicílio do consumidor para resolver eventuais conflitos.</p>
    <h2>12. Contato</h2>
    <p>Dúvidas sobre estes termos podem ser enviadas pelos canais de atendimento indicados no site e no sistema.</p>
    <p className="legal-links">Veja também a <Link to="/privacidade">Política de Privacidade</Link>.</p>
  </LegalLayout>;
}

export function Privacy(){
  return <LegalLayout title="Política de Privacidade">
    <p>Esta política explica como o CobrançaPro trata dados pessoais, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).</p>
    <h2>1. Dados que coletamos</h2>
    <ul>
      <li>Dados da sua conta: nome, e-mail, senha (armazenada de forma protegida) e nome da empresa.</li>
      <li>Dados que você cadastra: clientes (nome, telefone, e-mail, observações), cobranças e recebimentos.</li>
      <li>Dados de assinatura: plano contratado, status e validade, informados pela Perfect Pay. Não armazenamos dados de cartão.</li>
      <li>Dados técnicos básicos de acesso, necessários para o funcionamento e a segurança do sistema.</li>
    </ul>
    <h2>2. Para que usamos</h2>
    <p>Para criar e manter sua conta, fornecer as funções do sistema, liberar o plano contratado, dar suporte, garantir a segurança e cumprir obrigações legais.</p>
    <h2>3. Bases legais</h2>
    <p>Execução do contrato com você, cumprimento de obrigações legais, legítimo interesse (segurança e prevenção a fraudes) e consentimento, quando aplicável.</p>
    <h2>4. Com quem compartilhamos</h2>
    <p>Usamos prestadores que processam dados em nosso nome: Supabase (banco de dados e autenticação), Vercel (hospedagem), Perfect Pay (pagamentos) e um provedor de inteligência artificial (Groq), quando você usa o Assistente IA. Esses prestadores podem armazenar ou processar dados fora do Brasil, com medidas de proteção adequadas. Não vendemos seus dados.</p>
    <h2>5. Dados dos seus clientes</h2>
    <p>Os dados dos clientes que você cadastra são de sua responsabilidade. Nós os tratamos apenas para fornecer o serviço a você, seguindo suas instruções.</p>
    <h2>6. Por quanto tempo guardamos</h2>
    <p>Mantemos os dados enquanto sua conta estiver ativa e pelo tempo necessário para cumprir obrigações legais. Você pode pedir a exclusão da conta e dos dados.</p>
    <h2>7. Seus direitos</h2>
    <p>Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade, exclusão, informação sobre compartilhamento e revogação de consentimento, nos termos do art. 18 da LGPD.</p>
    <h2>8. Segurança</h2>
    <p>Adotamos medidas técnicas para proteger os dados, como conexão criptografada e controle de acesso para que cada empresa veja somente as próprias informações. Nenhum sistema é totalmente livre de riscos.</p>
    <h2>9. Armazenamento no navegador</h2>
    <p>Usamos armazenamento local do navegador para manter sua sessão ativa e lembrar preferências, como o tema claro ou escuro.</p>
    <h2>10. Contato e atualizações</h2>
    <p>Para exercer seus direitos ou tirar dúvidas, use os canais de atendimento indicados no site e no sistema. Esta política pode ser atualizada, e a data estará no topo da página.</p>
    <p className="legal-links">Veja também os <Link to="/termos">Termos de Uso</Link>.</p>
  </LegalLayout>;
}
