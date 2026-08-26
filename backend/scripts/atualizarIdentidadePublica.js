require('dotenv').config({ quiet: true });

const banco = require('../src/config/banco');

const TEXTO_AVISO_PRIVACIDADE =
  'Li o Aviso de Privacidade e consinto com o tratamento dos dados necessários para minha participação voluntária no projeto Acorda RJ.';

const TEXTOS_ATIVOS = [
  {
    tipo: 'aviso_privacidade',
    versao: 'aviso_privacidade_v4',
    texto: TEXTO_AVISO_PRIVACIDADE
  },
  {
    tipo: 'mensagens',
    versao: 'mensagens_whatsapp_v3',
    texto: 'Autorizo o recebimento de mensagens pelo WhatsApp enviadas pelo projeto Acorda RJ e por Diogo Ventura, incluindo informações sobre ações sociais, projetos comunitários, pesquisas, eventos e conteúdos políticos. Posso revogar esta autorização a qualquer momento pelo canal indicado na Política de Privacidade.'
  },
  {
    tipo: 'ligacoes',
    versao: 'ligacoes_v3',
    texto: 'Autorizo o recebimento de ligações telefônicas relacionadas às ações e iniciativas do projeto Acorda RJ. Posso revogar esta autorização a qualquer momento pelo canal indicado na Política de Privacidade.'
  }
];

async function ativarTexto(cliente, configuracao) {
  await cliente.query(
    `
      UPDATE textos_formulario
      SET ativo = FALSE,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE tipo = $1
        AND ativo = TRUE
        AND (versao <> $2 OR texto <> $3)
    `,
    [configuracao.tipo, configuracao.versao, configuracao.texto]
  );
  await cliente.query(
    `
      INSERT INTO textos_formulario (tipo, versao, texto, ativo)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (tipo, versao)
      DO UPDATE SET
        texto = EXCLUDED.texto,
        ativo = TRUE,
        atualizado_em = CURRENT_TIMESTAMP
    `,
    [configuracao.tipo, configuracao.versao, configuracao.texto]
  );
}

async function atualizarIdentidadePublica() {
  const cliente = await banco.connect();

  try {
    await cliente.query('BEGIN');
    for (const configuracao of TEXTOS_ATIVOS) {
      await ativarTexto(cliente, configuracao);
    }
    const resultadoVersoes = await cliente.query(
      `
        SELECT tipo,
          COUNT(*)::integer AS total_versoes,
          COUNT(*) FILTER (WHERE ativo = TRUE)::integer AS total_ativas
        FROM textos_formulario
        WHERE tipo = ANY($1::text[])
        GROUP BY tipo
        ORDER BY tipo
      `
      ,
      [TEXTOS_ATIVOS.map(function (configuracao) {
        return configuracao.tipo;
      })]
    );
    await cliente.query('COMMIT');
    console.log('Textos públicos atualizados. Versões anteriores preservadas.');
    resultadoVersoes.rows.forEach(function (resultado) {
      console.log(
        resultado.tipo + ': ' + resultado.total_versoes +
        ' versões, ' + resultado.total_ativas + ' ativa.'
      );
    });
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
    await banco.end();
  }
}

atualizarIdentidadePublica().catch(function (erro) {
  console.error(erro.message);
  process.exitCode = 1;
});
