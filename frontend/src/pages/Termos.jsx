import PaginaLegal from '../components/PaginaLegal';

function Termos() {
  return (
    <PaginaLegal
      etiqueta="Uso do formulário"
      titulo="Termos de Uso"
      introducao="Estes termos apresentam as condições de utilização do formulário público do projeto Acorda RJ."
    >
      <section>
        <h2>Participação voluntária</h2>
        <p>
          O formulário é destinado à participação voluntária. O envio das informações não cria
          relação comercial, trabalhista ou garantia de que a demanda apresentada será executada.
        </p>
        <p>
          Ao prosseguir, a pessoa declara que informou sua idade verdadeira. O tratamento de
          dados de crianças e adolescentes deve observar seu melhor interesse e a legislação aplicável.
        </p>
      </section>

      <section>
        <h2>Informações fornecidas</h2>
        <p>
          A pessoa deve fornecer informações verdadeiras e relacionadas ao próprio cadastro.
          Não é permitido utilizar dados de terceiros sem autorização, tentar acessar áreas
          administrativas ou interferir no funcionamento e na segurança do sistema.
        </p>
      </section>

      <section>
        <h2>Eventos</h2>
        <p>
          O mesmo formulário poderá ser usado para cadastro geral ou participação em um evento
          ativo. Quando houver evento, essa informação será apresentada antes da conclusão do
          cadastro e o contato será vinculado ao evento sem criar duplicidade.
        </p>
      </section>

      <section>
        <h2>Privacidade e comunicações</h2>
        <p>
          O tratamento dos dados segue a Política de Privacidade. Autorizações para WhatsApp e
          ligações são opcionais e podem ser recusadas ou revogadas sem impedir o cadastro no
          projeto.
        </p>
      </section>

      <section>
        <h2>Atualizações destes termos</h2>
        <p>
          Estes termos poderão ser atualizados quando o funcionamento do projeto mudar. A
          versão aplicável será sempre a publicada nesta página.
        </p>
      </section>
    </PaginaLegal>
  );
}

export default Termos;
