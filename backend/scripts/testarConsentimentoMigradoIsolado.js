// Não carrega .env. Exige PostgreSQL local explícito e cria banco descartável.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const pg = require('pg');

require('./bloquearRedeExternaQa');

async function importarTeste() {
  const banco = require('../src/config/banco');
  const app = require('../src/app');
  const jwt = require('jsonwebtoken');
  const ExcelJS = require('exceljs');
  const servico = require('../src/modules/importacoes/importacaoService');
  let servidor;
  let checks = 0;
  const ok = (condicao, texto) => { assert.ok(condicao, texto); checks++; };
  try {
    const admin = (await banco.query("SELECT * FROM usuarios WHERE perfil='administrador' LIMIT 1")).rows[0];
    const operador = (await banco.query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES('QA operador','op@invalid.local','fake','operador') RETURNING *")).rows[0];
    servidor = app.listen(0, '127.0.0.1');
    await new Promise(resolve => servidor.once('listening', resolve));
    const base = 'http://127.0.0.1:' + servidor.address().port + '/api/admin/importacoes';
    const token = u => jwt.sign({ id: u.id, perfil: u.perfil }, process.env.JWT_SECRET);
    const request = async (u, rota, body) => {
      const r = await fetch(base + rota, { method: 'POST', headers: { Authorization: 'Bearer ' + token(u) }, body });
      return { status: r.status, body: await r.json() };
    };
    const form = (texto, opcao, nome = 'antiga.csv') => {
      const f = new FormData();
      f.append('origem', 'QA base anterior');
      f.append('arquivo', new Blob([texto]), nome);
      if (opcao !== undefined) f.append('consentimentoMigrado', String(opcao));
      return f;
    };
    const csv = (num, extra = '') => `telefone;nome;campo_obsoleto;consentimento_whatsapp\n2197000${num};Pessoa QA;ignorar;true${extra}`;
    let r = await request(operador, '/pre-visualizar', form(csv('0001')));
    ok(r.status === 201, 'Operador mantém importação normal');
    r = await request(operador, '/' + r.body.importacao.importacaoId + '/confirmar');
    ok(r.status === 200 && r.body.relatorio.criados === 1, 'Importação normal confirmada');
    const normal = (await banco.query("SELECT * FROM contatos WHERE telefone_normalizado='21970000001'")).rows[0];
    ok(normal.consentimento_whatsapp === null && normal.consentimento_mensagens === false, 'Coluna extra não concede consentimento');
    ok((await banco.query('SELECT id FROM consentimentos WHERE contato_id=$1', [normal.id])).rowCount === 0, 'Fluxo antigo não cria consentimento');
    r = await request(operador, '/pre-visualizar', form(csv('0002'), true));
    ok(r.status === 403, 'Operador bloqueado no upload');
    r = await request(admin, '/pre-visualizar', form(csv('0002'), 'sim'));
    ok(r.status === 400, 'Flag inválida rejeitada');
    r = await request(admin, '/pre-visualizar', form('BEGIN:VCARD\nVERSION:3.0\nFN:QA\nTEL:21970000002\nEND:VCARD', true, 'qa.vcf'));
    ok(r.status === 400, 'Migração limitada a CSV/XLSX');
    r = await request(admin, '/pre-visualizar', form(csv('0002', '\n21970000002;Duplicado;x;true\n123;Invalido;x;true'), true));
    ok(r.status === 201 && r.body.importacao.consentimentoMigrado, 'ADMIN pode declarar');
    const imp = r.body.importacao.importacaoId;
    r = await request(operador, '/' + imp + '/confirmar');
    ok(r.status === 403, 'Operador não confirma declaração feita por admin');
    ok((await banco.query('SELECT status FROM importacoes WHERE id=$1', [imp])).rows[0].status === 'pre_visualizada', '403 não altera importação');
    r = await request(admin, '/' + imp + '/confirmar');
    const rel = r.body.relatorio;
    ok(r.status === 200 && rel.criados === 1 && rel.duplicados === 1 && rel.invalidos === 1, 'Somente linha válida criada');
    ok(rel.totalConsentimentosMigrados === 1 && rel.totalImportado === 1 && String(rel.administradorResponsavelId) === String(admin.id), 'Contagens e responsável auditados');
    ok(rel.registradoEm && rel.nomeArquivo === 'antiga.csv' && rel.origemConsentimento === 'sistema/base anterior', 'Data, arquivo e origem auditados');
    const salvo = (await banco.query('SELECT relatorio FROM importacoes WHERE id=$1', [imp])).rows[0].relatorio;
    assert.deepEqual(salvo, rel); checks++;
    const consent = (await banco.query("SELECT c.*, ct.consentimento_whatsapp FROM consentimentos c JOIN contatos ct ON ct.id=c.contato_id WHERE ct.telefone_normalizado='21970000002'")).rows[0];
    ok(consent.estado === 'autorizado' && consent.resposta && consent.ativo && consent.consentimento_whatsapp, 'Contato novo autorizado');
    ok(consent.origem_registro === 'migracao_legado' && consent.canal === 'importacao' && consent.texto_apresentado.includes('Não coletado pelo ACORDA RJ'), 'Sem atribuir coleta ao sistema');
    const hist = (await banco.query("SELECT * FROM historico_contatos WHERE contato_id=$1 AND tipo_evento='consentimento_migrado'", [consent.contato_id])).rows[0];
    ok(String(hist.registrado_por_usuario_id) === String(admin.id) && String(hist.dados_novos.importacaoId) === String(imp) && hist.criado_em, 'Histórico vinculado ao arquivo/importação/admin');
    ok((await request(admin, '/' + imp + '/confirmar')).status === 409, 'Confirmação repetida rejeitada');

    // Três restrições independentes, incluindo revogação inativa histórica.
    for (const [n, estado] of [[3, 'bloqueado'], [4, 'recusado'], [5, 'revogado']]) {
      const c = (await banco.query(`INSERT INTO contatos(nome,telefone,telefone_normalizado,consentimento_armazenamento,
        consentimento_whatsapp,bloqueado_para_mensagens,origem_id,status_contato)
        VALUES ('Restrito',$1,$1,TRUE,FALSE,$2,$3,'ativo') RETURNING id`, ['2197000000' + n, estado === 'bloqueado', normal.origem_id])).rows[0];
      await banco.query(`INSERT INTO consentimentos(contato_id,contato_id_original,tipo,resposta,texto_apresentado,
        versao_texto,canal,origem_registro,estado,ativo,revogado_em)
        VALUES($1,$1,'mensagens',FALSE,'Restrição QA','qa','outro','revogacao',$2,$3,$4)`,
      [c.id, estado === 'bloqueado' ? 'recusado' : estado, estado !== 'revogado', estado === 'revogado' ? new Date() : null]);
    }
    const antes = (await banco.query("SELECT row_to_json(c) contato,(SELECT jsonb_agg(s ORDER BY s.id) FROM consentimentos s WHERE s.contato_id=c.id) consentimentos FROM contatos c WHERE telefone_normalizado IN ('21970000003','21970000004','21970000005') ORDER BY c.id")).rows;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Antiga');
    ws.addRow(['telefone', 'nome', 'campo antigo']);
    for (const n of [3, 4, 5, 6]) ws.addRow(['2197000000' + n, n === 6 ? 'Novo XLSX' : 'Restrito', 'extra']);
    r = await request(admin, '/pre-visualizar', form(await wb.xlsx.writeBuffer(), true, 'antiga.xlsx'));
    ok(r.status === 201, 'XLSX com extras aceita: ' + JSON.stringify(r));
    r = await request(admin, '/' + r.body.importacao.importacaoId + '/confirmar');
    ok(r.status === 200 && r.body.relatorio.criados === 1 && r.body.relatorio.ignorados === 3 && r.body.relatorio.totalConsentimentosMigrados === 1, 'Duplicados restritos não recebem autorização: ' + JSON.stringify(r));
    const depois = (await banco.query("SELECT row_to_json(c) contato,(SELECT jsonb_agg(s ORDER BY s.id) FROM consentimentos s WHERE s.contato_id=c.id) consentimentos FROM contatos c WHERE telefone_normalizado IN ('21970000003','21970000004','21970000005') ORDER BY c.id")).rows;
    assert.deepEqual(depois, antes); checks++;
    r = await request(admin, '/pre-visualizar', form(csv('0007')));
    r = await request(admin, '/' + r.body.importacao.importacaoId + '/confirmar');
    ok(r.status === 200 && !r.body.relatorio.consentimentoMigrado, 'Opção não vaza para importação seguinte');
    // Colisão com um contato sem declaração também não concede autorização.
    r = await request(admin, '/pre-visualizar', form(csv('0001'), true));
    r = await request(admin, '/' + r.body.importacao.importacaoId + '/confirmar');
    ok(r.body.relatorio.totalConsentimentosMigrados === 0, 'Duplicado normal não é reautorizado');
    // Falha de auditoria deve reverter contatos e consentimentos da confirmação.
    const pre = await servico.preVisualizar({ originalname: 'rollback.csv', buffer: Buffer.from(csv('0008')) }, 'QA rollback', admin, true);
    await banco.query("CREATE FUNCTION qa_erro_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA'; END $$; CREATE TRIGGER qa_erro_consent BEFORE INSERT ON consentimentos FOR EACH ROW EXECUTE FUNCTION qa_erro_consent()");
    await assert.rejects(servico.confirmar(pre.importacaoId, admin)); checks++;
    ok((await banco.query("SELECT id FROM contatos WHERE telefone_normalizado='21970000008'")).rowCount === 0, 'Erro de auditoria faz rollback integral');
    ok((await banco.query('SELECT status FROM importacoes WHERE id=$1', [pre.importacaoId])).rows[0].status === 'pre_visualizada', 'Rollback preserva prévia');
    await banco.query('DROP TRIGGER qa_erro_consent ON consentimentos; DROP FUNCTION qa_erro_consent()');
    console.log(JSON.stringify({ importacaoChecks: checks, restricoesPreservadas: true }));
  } finally { if (servidor) await new Promise(resolve => servidor.close(resolve)); await banco.end(); }
}

async function xlsxCarga() {
  const banco = require('../src/config/banco');
  const servico = require('../src/modules/importacoes/importacaoService');
  const ExcelJS = require('exceljs');
  const pasta = new ExcelJS.Workbook();
  const aba = pasta.addWorksheet('Legado');
  aba.addRow(['telefone', 'nome', 'bairro', 'idade', 'campo antigo']);
  for (let i = 1; i <= 2000; i++) aba.addRow(['21975' + String(i).padStart(6, '0'), 'Pessoa XLSX ' + i, 'Centro', 30, 'ignorado']);
  const buffer = await pasta.xlsx.writeBuffer();
  const inicio = process.memoryUsage();
  let rssMaximo = inicio.rss;
  const amostrar = () => { rssMaximo = Math.max(rssMaximo, process.memoryUsage().rss); };
  const timer = setInterval(amostrar, 10);
  try {
    const admin = (await banco.query("SELECT * FROM usuarios WHERE perfil='administrador' LIMIT 1")).rows[0];
    const pre = await servico.preVisualizar({ originalname: '2000.xlsx', buffer }, 'QA XLSX', admin, true);
    assert.equal(pre.validos, 2000);
    const rel = await servico.confirmar(pre.importacaoId, admin);
    assert.equal(rel.criados, 2000); assert.equal(rel.totalConsentimentosMigrados, 2000);
    assert.equal((await banco.query("SELECT count(*)::int n FROM contatos WHERE bairro='Centro' AND idade=30")).rows[0].n, 2000);
    amostrar();
    console.log(JSON.stringify({ xlsxCarga: 2000, criados: rel.criados, migrados: rel.totalConsentimentosMigrados, bytes: buffer.length, inicio, rssMaximo, final: process.memoryUsage() }));
  } finally { clearInterval(timer); await banco.end(); }
}

async function escala(fase) {
  const banco = require('../src/config/banco');
  const campanha = require('../src/modules/campanhas/campanhaService');
  const msg = require('../src/modules/mensageria/mensageriaService');
  const imp = require('../src/modules/importacoes/importacaoService');
  const usuario = (await banco.query("SELECT * FROM usuarios WHERE perfil='administrador' LIMIT 1")).rows[0];
  const frontend = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/CampanhasAdministrativas.jsx'), 'utf8');
  const limite = Number(frontend.match(/const concorrencia\s*=\s*(\d+)/)[1]);
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  const inicio = process.memoryUsage(), pico = { ...inicio }, cpuInicio = process.cpuUsage(), comeco = Date.now();
  let ativas = 0, concorrencia = 0, chamadas = 0, conexoes = 0, fila = 0;
  const amostras = [];
  const amostrar = () => {
    const m = process.memoryUsage();
    Object.keys(m).forEach(k => { pico[k] = Math.max(pico[k], m[k]); });
    conexoes = Math.max(conexoes, banco.totalCount);
    fila = Math.max(fila, banco.waitingCount);
  };
  const timer = setInterval(amostrar, 20);
  msg.definirProviderParaTeste(async (url, opcoes) => {
    ativas++; concorrencia = Math.max(concorrencia, ativas); chamadas++;
    const r = await banco.query('INSERT INTO qa_aceites(destino) VALUES($1) RETURNING id', [JSON.parse(opcoes.body).to]);
    await new Promise(resolve => setTimeout(resolve, 50 + (chamadas % 5) * 25));
    ativas--;
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.qa.' + r.rows[0].id }] }) };
  });
  try {
    let ids, campanhaId;
    if (fase === 'escala') {
      const linhas = ['telefone;nome;campo antigo'];
      for (let i = 1; i <= 2000; i++) linhas.push('21971' + String(i).padStart(6, '0') + ';QA ESCALA ' + i + ';ignorar');
      const pre = await imp.preVisualizar({ originalname: '2000.csv', buffer: Buffer.from(linhas.join('\n')) }, 'QA escala', usuario, true);
      const rel = await imp.confirmar(pre.importacaoId, usuario);
      assert.equal(rel.criados, 2000); assert.equal(rel.totalConsentimentosMigrados, 2000);
      await campanha.atualizarLimite({ valor: 2000, motivo: 'QA isolado' }, usuario);
      await banco.query(`INSERT INTO sincronizacoes_limite_meta(limite_anterior,limite_novo,tier_anterior,tier_novo,origem,status,usuario_id)
        VALUES(2000,2000,'TIER_2000','TIER_2000','webhook_meta','sucesso',$1)`, [usuario.id]);
      const modelo = (await banco.query(`INSERT INTO modelos_mensagem(nome,categoria,texto,ativo,meta_nome,meta_idioma,
        meta_categoria,meta_status,meta_template_id,meta_status_oficial,meta_componentes,meta_configuracao_envio,meta_origem)
        VALUES('QA','Geral','Olá',TRUE,'qa','pt_BR','MARKETING','aprovado','qa','APPROVED',
        '[{"type":"BODY","text":"Olá"}]','{}','meta') RETURNING id`)).rows[0];
      const c = await campanha.criar({ nome: 'QA ESCALA', finalidade: 'QA', modeloId: modelo.id, filtros: { nome: 'QA ESCALA' } }, usuario);
      campanhaId = c.id;
      await campanha.alterarStatus(c.id, 'pronta', usuario);
      const publico = await campanha.visualizarPublico(c.id, 2000);
      assert.equal(publico.publicoApto, 2000); assert.equal(publico.capacidade.disponivel, 2000);
      const p = await campanha.prepararEnvio(c.id, { quantidade: 2000, chaveIdempotencia: 'unico-inicio' }, usuario);
      assert.equal(p.tentativas.length, 2000);
      ids = p.tentativas.slice(0, 1000);
    } else {
      msg.definirRelogioParaTeste(() => new Date(Date.now() + 180000));
      await msg.recuperarProcessamentoPendente();
      assert.equal(chamadas, 0);
      campanhaId = (await banco.query("SELECT id FROM campanhas WHERE nome='QA ESCALA'")).rows[0].id;
      ids = (await banco.query("SELECT t.id FROM campanha_tentativas t JOIN campanha_participacoes p ON p.id=t.participacao_id WHERE p.campanha_id=$1 AND t.status='pendente' ORDER BY t.id", [campanhaId])).rows.map(r => r.id);
      assert.equal(ids.length, 1000);
    }
    for (let i = 0; i < ids.length; i += limite) {
      await Promise.all(ids.slice(i, i + limite).map(id => msg.enviar(id)));
      if ((i + limite) % 200 === 0) { amostrar(); amostras.push({ enviados: i + limite, ...process.memoryUsage() }); }
    }
    assert.equal(chamadas, 1000); assert.ok(concorrencia <= limite);
    const totais = (await banco.query(`SELECT count(*)::int total,count(DISTINCT p.contato_id)::int unicos,
      count(*) FILTER(WHERE t.status='enviada')::int confirmados, count(DISTINCT p.campanha_id)::int campanhas
      FROM campanha_participacoes p JOIN campanha_tentativas t ON t.participacao_id=p.id WHERE p.campanha_id=$1`, [campanhaId])).rows[0];
    assert.equal(totais.total, 2000); assert.equal(totais.unicos, 2000); assert.equal(totais.campanhas, 1);
    assert.equal(totais.confirmados, fase === 'escala' ? 1000 : 2000);
    assert.equal((await banco.query('SELECT id FROM campanha_lotes WHERE campanha_id=$1', [campanhaId])).rowCount, 1);
    assert.equal((await banco.query('SELECT destino FROM qa_aceites GROUP BY destino HAVING count(*) > 1')).rowCount, 0);
    if (fase !== 'escala') assert.equal((await banco.query('SELECT * FROM qa_aceites')).rowCount, 2000);
    const locks = (await banco.query('SELECT count(*)::int n FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND NOT granted')).rows[0].n;
    const deadlocks = Number((await banco.query('SELECT deadlocks FROM pg_stat_database WHERE datname=current_database()')).rows[0].deadlocks);
    assert.equal(locks, 0); assert.equal(deadlocks, 0);
    await new Promise(r => setTimeout(r, 50)); amostrar();
    assert.equal(banco.waitingCount, 0); assert.equal(banco.totalCount, banco.idleCount);
    const cpu = process.cpuUsage(cpuInicio), duracaoMs = Date.now() - comeco;
    console.log(JSON.stringify({ fase, totais, inicio, pico, final: process.memoryUsage(), amostras,
      duracaoMs, cpu, cpuPercentUmNucleo: (cpu.user + cpu.system) / (duracaoMs * 10),
      concorrencia, conexoes, fila, poolLimpo: true, locks, deadlocks,
      eventLoopP99Ms: delay.percentile(99) / 1e6, eventLoopMaxMs: delay.max / 1e6 }));
    if (fase === 'escala') process.exit(74); // Queda real de processo, 1000 confirmadas e 1000 pendentes.
  } finally { clearInterval(timer); delay.disable(); await banco.end(); }
}

async function principal() {
  assert.equal(process.env.QA_PG_HOST, '127.0.0.1', 'Exige QA_PG_HOST=127.0.0.1; não lê .env');
  assert.ok(process.env.QA_PG_PORT && process.env.QA_PG_USER, 'Informe porta e usuário do PostgreSQL temporário');
  const cfg = { host: '127.0.0.1', port: Number(process.env.QA_PG_PORT), user: process.env.QA_PG_USER,
    password: process.env.QA_PG_PASSWORD || '', database: 'postgres', ssl: false };
  const admin = new pg.Client(cfg);
  const nome = 'acorda_rj_campanhas_qa_auditoria_' + crypto.randomBytes(8).toString('hex');
  const url = new URL('postgresql://127.0.0.1');
  url.port = String(cfg.port); url.username = cfg.user; url.password = cfg.password; url.pathname = '/' + nome;
  const env = { ...process.env, DATABASE_URL: url.toString(), BANCO_HOST: cfg.host, BANCO_PORTA: String(cfg.port),
    BANCO_NOME: nome, BANCO_USUARIO: cfg.user, BANCO_SENHA: cfg.password, BANCO_SSL: 'false', BANCO_POOL_MAX: '5',
    NODE_ENV: 'test', JWT_SECRET: crypto.randomBytes(40).toString('hex'), JWT_TEMPO_EXPIRACAO: '1h',
    FRONTEND_URL: 'http://localhost:5173', BACKUP_ASSINATURA_CHAVE: crypto.randomBytes(32).toString('hex'),
    META_GRAPH_API_VERSION: 'v99.0', META_APP_ID: '123456789', META_APP_SECRET: 'fake',
    WHATSAPP_ACCESS_TOKEN: 'fake', WHATSAPP_PHONE_NUMBER_ID: '123456789', WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'fake', WHATSAPP_OPTOUT_BUTTON_ID: 'nao_quero_mais_receber',
    META_SINCRONIZACAO_AUTOMATICA: 'false' };
  const run = (arquivo, args = [], codigo = 0) => new Promise((resolve, reject) => {
    const child = cp.spawn(process.execPath, ['--require', path.join(__dirname, 'bloquearRedeExternaQa.js'), arquivo, ...args],
      { env, cwd: path.join(__dirname, '..'), windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === codigo ? resolve() : reject(new Error(path.basename(arquivo) + ' exit ' + code)));
  });
  let criado = false;
  try {
    await admin.connect();
    assert.ok(['127.0.0.1', '::1'].includes((await admin.query('SELECT host(inet_server_addr()) ip')).rows[0].ip));
    await admin.query('CREATE DATABASE "' + nome + '"'); criado = true;
    async function preparar() {
      const db = new pg.Client({ ...cfg, database: nome }); await db.connect();
      try {
        await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS recuperacao CASCADE');
        await db.query(fs.readFileSync(path.join(__dirname, '../database/criar_banco.sql'), 'utf8'));
        const hash = await require('bcrypt').hash('SenhaQA123!', 4);
        await db.query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES('QA Admin','admin@invalid.local',$1,'administrador')", [hash]);
        await db.query('CREATE TABLE qa_aceites(id BIGINT GENERATED ALWAYS AS IDENTITY, destino text NOT NULL)');
      } finally { await db.end(); }
    }
    await preparar(); await run(__filename, ['xlsx-carga']);
    if (process.argv[2] === '--somente-xlsx') return;
    await preparar(); await run(__filename, ['importacao']);
    await preparar(); await run(__filename, ['escala'], 74); await run(__filename, ['retomada']);
    for (const script of ['testarImportacoes.js', 'testarResilienciaMensageria.js', 'testarWebhookMensageria.js', 'testarCampanhas.js']) {
      await preparar(); await run(path.join(__dirname, script));
    }
    // Cenário já existente de queda após aceite externo, antes da confirmação local.
    await preparar();
    const db = new pg.Client({ ...cfg, database: nome }); await db.connect();
    try {
      await db.query("UPDATE configuracoes_sistema SET valor_inteiro=10000 WHERE chave='limite_mensagens_24h'");
      // A auditoria existente soma 2000 aceites da etapa de escala ao cenário de 8.
      await db.query("INSERT INTO qa_aceites(destino) SELECT 'preenchimento_'||i FROM generate_series(1,2000) i");
    } finally { await db.end(); }
    await run(path.join(__dirname, 'auditarProntidaoOperacional.js'), ['worker', 'queda'], 73);
    await run(path.join(__dirname, 'auditarProntidaoOperacional.js'), ['worker', 'retomada']);
    console.log('IMPORTACAO_E_CAMPANHA_INTEGRADAS_APROVADAS');
  } finally {
    if (criado) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [nome]);
      await admin.query('DROP DATABASE "' + nome + '"');
      console.log('BANCO_DESCARTAVEL_REMOVIDO ' + nome);
    }
    await admin.end();
  }
}

if (require.main === module) {
  const fase = process.argv[2];
  if (['xlsx-carga', 'importacao', 'escala', 'retomada'].includes(fase)) {
    const destino = new URL(process.env.DATABASE_URL || 'http://invalido');
    assert.equal(destino.hostname, '127.0.0.1', 'Worker exige banco isolado local');
    assert.match(destino.pathname, /^\/acorda_rj_campanhas_qa_auditoria_[a-f0-9]{16}$/);
    assert.equal(process.env.NODE_ENV, 'test');
  }
  (fase === 'xlsx-carga' ? xlsxCarga() : fase === 'importacao' ? importarTeste() : ['escala', 'retomada'].includes(fase) ? escala(fase) : principal())
    .catch(erro => { console.error(erro.stack); process.exitCode = 1; });
}
