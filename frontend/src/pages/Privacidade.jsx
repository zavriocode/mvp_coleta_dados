import PaginaLegal from '../components/PaginaLegal';

function Privacidade() {
  return (
    <PaginaLegal
      etiqueta="Proteção de dados"
      titulo="Política de Privacidade"
      introducao="Este documento explica como os dados pessoais são tratados no projeto Acorda RJ."
    >
      <p><strong>Versão 1.0 · Última atualização: 28 de julho de 2026.</strong></p>

      <section>
        <h2>Controlador dos dados</h2>
        <p>
          O controlador e responsável pelas decisões sobre o tratamento dos dados é
          <strong> Diogo Ventura</strong>, responsável pelo projeto Acorda RJ, no Rio de
          Janeiro. O canal de contato do controlador é informado ao final desta página.
        </p>
      </section>

      <section>
        <h2>Dados coletados</h2>
        <p>
          O formulário poderá coletar nome, telefone, idade, bairro, principal necessidade
          informada, vínculo com evento e as escolhas de autorização para mensagens pelo
          WhatsApp e ligações telefônicas. Também são registrados a data, a origem, a versão
          do texto apresentado e o histórico das autorizações.
        </p>
        <p>
          Para segurança e funcionamento, os provedores de infraestrutura poderão registrar
          dados técnicos, como endereço IP, data e hora do acesso, navegador e registros de erro.
        </p>
      </section>

      <section>
        <h2>Finalidades</h2>
        <p>Os dados são utilizados para:</p>
        <ul>
          <li>identificar demandas e necessidades dos bairros;</li>
          <li>organizar cadastros e participações em eventos;</li>
          <li>manter o histórico e a segurança das operações realizadas;</li>
          <li>entrar em contato somente nos canais e finalidades autorizados pela pessoa.</li>
        </ul>
      </section>

      <section>
        <h2>Bases legais</h2>
        <p>
          O cadastro e a participação no projeto são voluntários e utilizam o consentimento
          da pessoa como base legal. O consentimento para participar é separado das
          autorizações opcionais de WhatsApp e ligações.
        </p>
        <p>
          A proteção do sistema, a prevenção de fraude e a produção de estatísticas
          agregadas poderão se apoiar no legítimo interesse, sempre com avaliação de
          necessidade e respeito aos direitos da pessoa. Registros estritamente necessários
          também poderão ser conservados para cumprimento de obrigação legal ou exercício
          regular de direitos.
        </p>
      </section>

      <section>
        <h2>Participação de crianças e adolescentes</h2>
        <p>
          O formulário não estabelece idade mínima para o cadastro. Quando houver dados de
          crianças ou adolescentes, o tratamento deverá respeitar seu melhor interesse, usar
          somente os dados necessários e observar a legislação aplicável. A idade deve ser
          informada corretamente.
        </p>
      </section>

      <section>
        <h2>Comunicações pelo WhatsApp e ligações</h2>
        <p>
          O aceite do Aviso de Privacidade não autoriza automaticamente mensagens ou
          ligações. Cada autorização é opcional, separada e começa desmarcada.
        </p>
        <p>
          Quando houver autorização específica, as mensagens pelo WhatsApp poderão incluir
          ações sociais, projetos comunitários, pesquisas, eventos e conteúdos políticos do
          projeto Acorda RJ e de Diogo Ventura. A autorização pode ser cancelada a qualquer
          momento pelo canal de atendimento informado nesta página.
        </p>
        <p>
          O formulário não solicita opinião política, filiação partidária ou intenção de
          voto. Os dados coletados não serão usados para inferir essas informações nem para
          segmentar pessoas com base em suposta opinião política. Qualquer mudança futura
          dependerá de nova avaliação e informação prévia.
        </p>
      </section>

      <section>
        <h2>Compartilhamento e fornecedores</h2>
        <p>
          Os dados poderão ser tratados por fornecedores de infraestrutura necessários ao
          funcionamento e à segurança do sistema, atualmente Vercel e DigitalOcean.
        </p>
        <p>
          Os dados não serão vendidos nem compartilhados para finalidades incompatíveis com
          esta política, salvo quando houver obrigação legal.
        </p>
        <p>
          Vercel e DigitalOcean podem processar dados em infraestrutura localizada fora do
          Brasil, inclusive nos Estados Unidos. Essas operações devem observar as regras da
          LGPD para transferências internacionais e as medidas contratuais e de segurança
          aplicáveis aos fornecedores.
        </p>
      </section>

      <section>
        <h2>Armazenamento e eliminação</h2>
        <p>
          Os dados serão mantidos enquanto forem necessários para as finalidades do projeto.
          A necessidade de conservação será revisada periodicamente, pelo menos uma vez por
          ano. Os dados serão eliminados quando deixarem de ser necessários ou mediante
          solicitação da pessoa, ressalvadas as hipóteses legais de conservação.
        </p>
        <p>
          Registros de autorização, revogação e atendimento de direitos serão conservados
          apenas pelo período necessário para demonstrar o cumprimento da LGPD e exercer
          direitos. Depois disso, serão eliminados ou anonimizados. Cópias de segurança seguem
          o ciclo de retenção do provedor e não são usadas para comunicações.
        </p>
      </section>

      <section>
        <h2>Segurança</h2>
        <p>
          O projeto adota controles de acesso à área administrativa, senhas protegidas,
          conexões seguras, registros de auditoria, limitação de requisições e cópias de
          segurança. Nenhuma medida elimina totalmente os riscos, e os controles são revisados
          conforme a evolução do sistema.
        </p>
      </section>

      <section>
        <h2>Seus direitos</h2>
        <p>
          A pessoa poderá solicitar confirmação do tratamento, acesso, correção, revogação
          das autorizações, bloqueio ou exclusão dos seus dados. Para proteger o cadastro,
          poderá ser necessária uma confirmação de identidade antes do atendimento.
        </p>
        <p>
          Também poderá solicitar informações sobre compartilhamento, opor-se a tratamento
          irregular e apresentar reclamação à Autoridade Nacional de Proteção de Dados.
        </p>
      </section>
    </PaginaLegal>
  );
}

export default Privacidade;
