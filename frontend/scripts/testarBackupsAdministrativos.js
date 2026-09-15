import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const diretorio = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(diretorio, '..');
const pagina = fs.readFileSync(path.join(raiz, 'src', 'pages', 'BackupsAdministrativos.jsx'), 'utf8');
const servico = fs.readFileSync(path.join(raiz, 'src', 'services', 'backupService.js'), 'utf8');
let total = 0;

function verificar(condicao, mensagem) {
  total += 1;
  assert.ok(condicao, mensagem);
}

verificar(pagina.includes('Gerar novo backup'), 'A aba não apresenta a ação de gerar backup.');
verificar(pagina.includes("gerarBackup()"), 'A geração não usa o serviço dedicado.');
verificar(pagina.includes("baixarBackup(id)"), 'O download não usa o serviço dedicado.');
verificar(pagina.includes('backup.disponivelParaDownload'), 'A ação de download não respeita a disponibilidade temporária.');
verificar(pagina.includes("falhou: 'Erro'"), 'O estado de erro não possui linguagem amigável.');
verificar(pagina.includes("processando: 'Processando'"), 'O estado de processamento não é exibido.');
verificar(pagina.includes('<th>Responsável</th>'), 'O histórico não identifica o responsável.');
verificar(pagina.includes('<th>Tamanho</th>'), 'O histórico não mostra o tamanho.');
verificar(servico.includes("method: 'POST'"), 'A geração não usa POST.');
verificar(servico.includes("method: 'GET'"), 'O download não usa GET.');
verificar(servico.includes("Authorization: 'Bearer ' + obterToken()"), 'O download não envia autenticação.');
verificar(servico.includes("'/download'"), 'O frontend não usa a rota protegida de download.');

console.log('Backups administrativos no frontend: ' + total + ' verificações aprovadas.');
