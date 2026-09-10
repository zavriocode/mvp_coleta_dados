import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolverImagemPrevia,
  substituirVariaveisPrevia,
  valorExemploPrevia
} from '../src/utils/previaModeloMensagem.js';

const diretorio = path.dirname(fileURLToPath(import.meta.url));
const pagina = fs.readFileSync(
  path.join(diretorio, '..', 'src', 'pages', 'CampanhasAdministrativas.jsx'),
  'utf8'
);
const detalhesContato = fs.readFileSync(
  path.join(diretorio, '..', 'src', 'pages', 'DetalhesContato.jsx'),
  'utf8'
);
const ajuda = fs.readFileSync(
  path.join(diretorio, '..', 'src', 'pages', 'AjudaAdministrativa.jsx'),
  'utf8'
);
const estilos = fs.readFileSync(
  path.join(diretorio, '..', 'src', 'styles', 'administrativo.css'),
  'utf8'
);
const configuracaoVercel = fs.readFileSync(
  path.join(diretorio, '..', 'vercel.json'),
  'utf8'
);

assert.equal(substituirVariaveisPrevia('Mensagem simples', []), 'Mensagem simples');
assert.equal(substituirVariaveisPrevia('Olá, {{1}}!', [{ origem: 'nome_contato' }]), 'Olá, João!');
assert.equal(
  substituirVariaveisPrevia('{{1}} precisa de atenção em {{2}}.', [
    { origem: 'bairro' }, { origem: 'problema' }
  ]),
  'Copacabana precisa de atenção em Saneamento básico.'
);
assert.equal(substituirVariaveisPrevia('Olá, {{1}}!', []), 'Olá, {{1}}!');
assert.equal(
  substituirVariaveisPrevia('Olá, {{nome}}!', [{ origem: 'nome_contato' }]),
  'Olá, João!'
);
assert.equal(valorExemploPrevia({ origem: 'fixo', valor: 'Encontro comunitário' }), 'Encontro comunitário');
assert.equal(valorExemploPrevia({ origem: 'fixo', valor: '' }), null);
assert.deepEqual(resolverImagemPrevia({ cabecalhoTipo: 'texto' }, ''), { estado: 'sem_cabecalho', endereco: '' });
assert.deepEqual(resolverImagemPrevia({ cabecalhoTipo: 'imagem', imagemModo: 'dispositivo' }, ''), { estado: 'vazia', endereco: '' });
assert.deepEqual(resolverImagemPrevia({ cabecalhoTipo: 'imagem', imagemModo: 'dispositivo' }, 'blob:imagem-local'), { estado: 'carregar', endereco: 'blob:imagem-local' });
assert.deepEqual(resolverImagemPrevia({ cabecalhoTipo: 'imagem', imagemModo: 'dispositivo', imagemEnvio: 'media-id' }, ''), { estado: 'configurada', endereco: '' });
assert.deepEqual(resolverImagemPrevia({ cabecalhoTipo: 'imagem', imagemModo: 'internet', imagemEnvio: '' }, ''), { estado: 'vazia', endereco: '' });
assert.deepEqual(resolverImagemPrevia({ cabecalhoTipo: 'imagem', imagemModo: 'internet', imagemEnvio: 'arquivo.jpg' }, ''), { estado: 'invalida', endereco: '' });
assert.deepEqual(resolverImagemPrevia({ cabecalhoTipo: 'imagem', imagemModo: 'internet', imagemEnvio: 'http://exemplo.com/imagem.jpg' }, ''), { estado: 'invalida', endereco: '' });
assert.deepEqual(resolverImagemPrevia({ cabecalhoTipo: 'imagem', imagemModo: 'internet', imagemEnvio: 'https://exemplo.com/imagem.jpg' }, ''), { estado: 'carregar', endereco: 'https://exemplo.com/imagem.jpg' });
assert.match(pagina, /Seu texto aparecerá aqui\./);
assert.match(pagina, /URL\.createObjectURL/);
assert.match(pagina, /URL\.revokeObjectURL/);
assert.match(pagina, /imagemModo==='internet'/);
assert.match(pagina, /Não foi possível carregar esta imagem/);
assert.match(pagina, /cabecalhoTipo==='texto'/);
assert.match(pagina, /template\.rodape/);
assert.match(pagina, /\+ Adicionar botão/);
assert.match(pagina, /Não receber mais contatos/);
assert.match(pagina, /moverBotao/);
assert.match(pagina, /removerBotao/);
assert.match(pagina, /template\.botoes\.map/);
assert.match(pagina, /é a primeira informação/);
assert.match(pagina, /é a segunda/);
assert.match(pagina, /inserirInformacaoPersonalizada/);
assert.match(pagina, /Adicionar ao texto/);
assert.match(pagina, /Principal necessidade/);
assert.match(ajuda, /Adicionar ao texto/);
assert.match(ajuda, /Rascunho/);
assert.match(ajuda, /Em análise/);
assert.match(ajuda, /A Meta é sempre a fonte do status/);
assert.match(pagina, /Mostrar campanhas arquivadas/);
assert.match(pagina, /Excluir campanha/);
assert.match(pagina, /Tem certeza que deseja excluir este modelo\?/);
assert.match(pagina, /item\.pode_excluir&&<button[^>]*>[\s\S]*Excluir rascunho/);
assert.match(pagina, /excluirTemplate\(item\.id\)/);
assert.match(pagina, /Prévia ilustrativa/);
assert.match(pagina, /Sincronizado diretamente da conta oficial da Meta/);
assert.match(pagina, /Imagem para envio/);
assert.match(pagina, /Configurar imagem/);
assert.match(pagina, /imagemLocal\.arquivo===arquivoImagem/);
assert.match(pagina, /Imagem configurada para envio/);
assert.match(pagina, /removerImagemEnvio/);
assert.match(pagina, /Remover imagem configurada/);
assert.match(pagina, /Não foi possível salvar as informações de envio/);
assert.match(pagina, /parameter_format/);
assert.match(pagina, /Escolha uma informação/);
assert.match(pagina, /Status da mensagem/);
assert.match(pagina, /Confirmação pendente — não reenviar/);
assert.match(pagina, /A\u00e7\u00e3o do contato/);
assert.match(detalhesContato, /N\u00e3o deseja mais receber contatos/);
assert.match(configuracaoVercel, /img-src 'self' data: blob: https:/);
assert.match(estilos, /\.editor-template-campanha[\s\S]*grid-template-columns/);
assert.match(estilos, /@media \(max-width: 1100px\)[\s\S]*\.editor-template-campanha[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
assert.match(estilos, /@media \(max-width: 760px\)[\s\S]*\.previa-modelo-mensagem/);
assert.match(estilos, /\.gerenciar-templates-campanha \.editor-template-campanha[\s\S]*1\.7fr[\s\S]*0\.95fr/);
assert.match(estilos, /\.grade-template-mensagem \.construtor-botoes-modelo[\s\S]*grid-column: 1 \/ -1/);
assert.match(estilos, /\.grade-template-mensagem \.disponibilidade-template[\s\S]*grid-column: 1 \/ -1/);
assert.match(estilos, /@media \(max-width: 760px\)[\s\S]*\.gerenciar-templates-campanha \.grade-template-mensagem[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);

console.log('Prévia visual de modelos e guia: 64 verificações aprovadas.');
