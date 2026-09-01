require('dotenv').config({ quiet: true });

process.env.JWT_SECRET = 'segredo-jwt-qa-exclusao-modelos-123456';

const jwt = require('jsonwebtoken');
const aplicacao = require('../src/app');
const banco = require('../src/config/banco');

let verificacoes = 0;

function confirmar(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
  verificacoes += 1;
}

async function iniciarApi() {
  return new Promise(function (resolver) {
    const servidor = aplicacao.listen(0, '127.0.0.1', function () { resolver(servidor); });
  });
}

async function requisitar(servidor, caminho, token, metodo) {
  const endereco = servidor.address();
  const resposta = await fetch('http://127.0.0.1:' + endereco.port + caminho, {
    method: metodo || 'GET',
    headers: { Authorization: 'Bearer ' + token }
  });
  return { resposta, corpo: await resposta.json() };
}

function token(usuario) {
  return jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '10m' });
}

async function inserirModelo(usuarioId, nome, opcoes) {
  const dados = Object.assign({
    origem: 'interno', status: 'rascunho', statusOficial: null, templateId: null
  }, opcoes || {});
  return (await banco.query(`
    INSERT INTO modelos_mensagem (
      nome, categoria, texto, ativo, meta_nome, meta_idioma, meta_categoria,
      meta_status, meta_template_id, meta_status_oficial, meta_origem,
      criado_por_usuario_id, atualizado_por_usuario_id
    ) VALUES ($1, 'QA', 'Mensagem de teste local.', TRUE, $2, 'pt_BR', 'UTILITY',
      $3, $4, $5, $6, $7, $7)
    RETURNING id
  `, [nome, 'qa_' + Date.now() + '_' + Math.random().toString(16).slice(2), dados.status,
    dados.templateId, dados.statusOficial, dados.origem, usuarioId])).rows[0];
}

async function registrarHistorico(modeloId, usuarioId, acao) {
  await banco.query(`
    INSERT INTO historico_modelos_mensagem_meta (modelo_id, acao, origem, usuario_id)
    VALUES ($1, $2, 'sistema', $3)
  `, [modeloId, acao, usuarioId]);
}

async function executar() {
  let servidor;
  const modelos = [];
  let campanhaId;
  let operadorId;
  try {
    const administrador = (await banco.query(
      "SELECT id FROM usuarios WHERE perfil='administrador' AND ativo=TRUE ORDER BY id LIMIT 1"
    )).rows[0];
    confirmar(Boolean(administrador), 'Administrador QA nao encontrado.');
    const operador = (await banco.query(`
      INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
      VALUES ('Operador exclusao modelo QA', $1, 'hash-apenas-qa', 'operador', TRUE)
      RETURNING id
    `, ['operador.exclusao.modelo.' + process.pid + '@invalid.local'])).rows[0];
    operadorId = operador.id;

    const rascunho = await inserirModelo(administrador.id, 'Rascunho excluivel QA');
    modelos.push(rascunho.id);
    await registrarHistorico(rascunho.id, administrador.id, 'rascunho_criado');

    const aprovado = await inserirModelo(administrador.id, 'Modelo aprovado protegido QA', {
      origem: 'meta', status: 'aprovado', statusOficial: 'APPROVED', templateId: 'approved-qa-' + process.pid
    });
    modelos.push(aprovado.id);
    await registrarHistorico(aprovado.id, administrador.id, 'sincronizacao');

    const utilizado = await inserirModelo(administrador.id, 'Rascunho utilizado protegido QA');
    modelos.push(utilizado.id);
    await registrarHistorico(utilizado.id, administrador.id, 'rascunho_criado');
    campanhaId = (await banco.query(`
      INSERT INTO campanhas (
        nome, finalidade, modelo_id, filtros_snapshot, status,
        responsavel_usuario_id, criado_por_usuario_id, atualizado_por_usuario_id
      ) VALUES ('Campanha protecao modelo QA', 'Validar vinculo', $1, '{}'::jsonb,
        'rascunho', $2, $2, $2)
      RETURNING id
    `, [utilizado.id, administrador.id])).rows[0].id;

    const auditado = await inserirModelo(administrador.id, 'Modelo auditado protegido QA');
    modelos.push(auditado.id);
    await registrarHistorico(auditado.id, administrador.id, 'rascunho_criado');
    await registrarHistorico(auditado.id, administrador.id, 'configuracao_envio');

    servidor = await iniciarApi();
    const tokenAdmin = token(administrador);
    const tokenOperador = token(operador);
    const lista = await requisitar(servidor, '/api/admin/campanhas/templates', tokenAdmin);
    confirmar(lista.resposta.status === 200, 'Listagem de modelos falhou.');
    const porId = new Map(lista.corpo.templates.map(function (item) { return [String(item.id), item]; }));
    confirmar(porId.get(String(rascunho.id)).pode_excluir === true,
      'Rascunho interno e sem uso nao foi liberado para exclusao.');
    confirmar(porId.get(String(aprovado.id)).pode_excluir === false,
      'Modelo APPROVED foi liberado para exclusao.');
    confirmar(porId.get(String(utilizado.id)).pode_excluir === false,
      'Modelo vinculado a campanha foi liberado para exclusao.');
    confirmar(porId.get(String(auditado.id)).pode_excluir === false,
      'Modelo com historico associado foi liberado para exclusao.');

    const negadoOperador = await requisitar(
      servidor, '/api/admin/campanhas/templates/' + rascunho.id, tokenOperador, 'DELETE'
    );
    confirmar(negadoOperador.resposta.status === 403, 'Operador conseguiu excluir modelo.');
    const aindaVisivel = await banco.query(
      'SELECT excluido_em FROM modelos_mensagem WHERE id=$1', [rascunho.id]
    );
    confirmar(aindaVisivel.rows[0].excluido_em === null,
      'Tentativa do operador alterou o rascunho.');

    const excluido = await requisitar(
      servidor, '/api/admin/campanhas/templates/' + rascunho.id, tokenAdmin, 'DELETE'
    );
    confirmar(excluido.resposta.status === 200 && excluido.corpo.mensagem === 'Modelo excluído com sucesso.',
      'Administrador nao conseguiu excluir o rascunho.');
    const preservado = (await banco.query(`
      SELECT ativo, excluido_em, excluido_por_usuario_id,
        (SELECT COUNT(*)::integer FROM historico_modelos_mensagem_meta WHERE modelo_id=$1) AS historicos,
        (SELECT COUNT(*)::integer FROM historico_modelos_mensagem_meta
          WHERE modelo_id=$1 AND acao='exclusao_logica') AS exclusoes
      FROM modelos_mensagem WHERE id=$1
    `, [rascunho.id])).rows[0];
    confirmar(preservado.ativo === false && Boolean(preservado.excluido_em) &&
      String(preservado.excluido_por_usuario_id) === String(administrador.id),
    'Exclusao logica nao preservou o registro com autoria.');
    confirmar(preservado.historicos === 2 && preservado.exclusoes === 1,
      'Historico do rascunho nao permaneceu integro.');
    const listaDepois = await requisitar(servidor, '/api/admin/campanhas/templates', tokenAdmin);
    confirmar(!listaDepois.corpo.templates.some(function (item) { return String(item.id) === String(rascunho.id); }),
      'Rascunho excluido continuou na listagem operacional.');
    const repeticao = await requisitar(
      servidor, '/api/admin/campanhas/templates/' + rascunho.id, tokenAdmin, 'DELETE'
    );
    confirmar(repeticao.resposta.status === 404, 'Exclusao repetida nao foi tratada com seguranca.');

    const bloqueioAprovado = await requisitar(
      servidor, '/api/admin/campanhas/templates/' + aprovado.id, tokenAdmin, 'DELETE'
    );
    confirmar(bloqueioAprovado.resposta.status === 409 &&
      bloqueioAprovado.corpo.mensagem.includes('aprovado pela Meta'),
    'Backend nao bloqueou o modelo APPROVED com mensagem clara.');
    const bloqueioUtilizado = await requisitar(
      servidor, '/api/admin/campanhas/templates/' + utilizado.id, tokenAdmin, 'DELETE'
    );
    confirmar(bloqueioUtilizado.resposta.status === 409,
      'Backend nao bloqueou o modelo vinculado a campanha.');
    confirmar(Number((await banco.query('SELECT COUNT(*)::integer AS total FROM campanhas WHERE id=$1', [campanhaId])).rows[0].total) === 1,
      'A tentativa de exclusao alterou a campanha vinculada.');
    const bloqueioAuditado = await requisitar(
      servidor, '/api/admin/campanhas/templates/' + auditado.id, tokenAdmin, 'DELETE'
    );
    confirmar(bloqueioAuditado.resposta.status === 409,
      'Backend nao bloqueou o modelo com historico associado.');
    confirmar(Number((await banco.query(
      'SELECT COUNT(*)::integer AS total FROM historico_modelos_mensagem_meta WHERE modelo_id=$1', [auditado.id]
    )).rows[0].total) === 2, 'Historico protegido foi alterado.');

    console.log('Exclusao manual protegida de modelos: ' + verificacoes + ' verificacoes aprovadas.');
  } finally {
    if (servidor) await new Promise(function (resolver) { servidor.close(resolver); });
    if (campanhaId) await banco.query('DELETE FROM campanhas WHERE id=$1', [campanhaId]);
    if (modelos.length) {
      await banco.query('DELETE FROM historico_modelos_mensagem_meta WHERE modelo_id=ANY($1::bigint[])', [modelos]);
      await banco.query('DELETE FROM modelos_mensagem WHERE id=ANY($1::bigint[])', [modelos]);
    }
    if (operadorId) await banco.query('DELETE FROM usuarios WHERE id=$1', [operadorId]);
    await banco.end();
  }
}

executar().catch(function (erro) {
  console.error(erro.stack || erro.message);
  process.exitCode = 1;
});
