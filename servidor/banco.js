// Camada de acesso ao banco de dados.
//
// Usa o SQLite embutido do Node (node:sqlite), entao nao precisa instalar
// nem configurar servidor de banco nenhum: os dados ficam no arquivo
// "dados/archview.db", criado sozinho na primeira execucao.

import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PASTA_RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// Onde guardar o banco.
//
// O normal e a pasta "dados" ao lado do programa, porque assim os projetos
// viajam junto com ele (importante rodando de pendrive). Mas pendrive e
// computador de escola as vezes sao somente leitura, e nesse caso criar o
// arquivo falha e o programa nem abre. Entao: tenta ali, e se nao der,
// cai para uma pasta do proprio usuario, que sempre aceita escrita.
function escolherPastaDoBanco() {
  const preferida = join(PASTA_RAIZ, "dados");

  try {
    mkdirSync(preferida, { recursive: true });

    // mkdir pode passar e a escrita falhar mesmo assim (pasta protegida,
    // midia somente leitura). So um arquivo de teste prova que da pra gravar.
    const teste = join(preferida, ".escrita-ok");
    writeFileSync(teste, "ok");
    rmSync(teste);

    return preferida;
  } catch {
    const reserva = join(
      process.env.LOCALAPPDATA ?? tmpdir(),
      "ArchView",
    );

    mkdirSync(reserva, { recursive: true });

    console.log(
      `\n  Aviso: nao consegui gravar em "${preferida}".` +
      `\n  Os projetos serao salvos em "${reserva}".\n`,
    );

    return reserva;
  }
}

const CAMINHO_BANCO = join(escolherPastaDoBanco(), "archview.db");

const bd = new DatabaseSync(CAMINHO_BANCO);

// WAL deixa leitura e escrita simultaneas mais rapidas; foreign_keys
// garante que apagar um usuario apague os projetos dele junto.
bd.exec("PRAGMA journal_mode = WAL");
bd.exec("PRAGMA foreign_keys = ON");

bd.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    senha_hash    TEXT    NOT NULL,
    criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projetos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nome          TEXT    NOT NULL,
    planta        TEXT    NOT NULL DEFAULT '{"elementos":[]}',
    criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_projetos_usuario ON projetos(id_usuario);

  CREATE TABLE IF NOT EXISTS sessoes (
    token         TEXT    PRIMARY KEY,
    id_usuario    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criada_em     TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ---------------------------------------------------------------------------
// SENHAS
// ---------------------------------------------------------------------------
// Nunca guardamos a senha em si. Guardamos o resultado do scrypt, que e uma
// funcao de mao unica: da senha da pra chegar no hash, mas do hash nao da
// pra voltar pra senha. O "sal" (bytes aleatorios) faz com que duas pessoas
// com a mesma senha tenham hashes diferentes.

function gerarHashSenha(senha) {
  const sal = randomBytes(16);
  const derivada = scryptSync(senha, sal, 64);
  return `${sal.toString("hex")}:${derivada.toString("hex")}`;
}

function conferirSenha(senha, hashGuardado) {
  const [salHex, derivadaHex] = String(hashGuardado).split(":");
  if (!salHex || !derivadaHex) return false;

  const esperada = Buffer.from(derivadaHex, "hex");
  const calculada = scryptSync(senha, Buffer.from(salHex, "hex"), esperada.length);

  // timingSafeEqual compara sempre no mesmo tempo, sem "desistir" no primeiro
  // byte diferente. Isso evita que de pra descobrir a senha medindo o relogio.
  return timingSafeEqual(esperada, calculada);
}

// ---------------------------------------------------------------------------
// USUARIOS
// ---------------------------------------------------------------------------

export function criarUsuario(nome, senha) {
  const hash = gerarHashSenha(senha);
  const resultado = bd
    .prepare("INSERT INTO usuarios (nome, senha_hash) VALUES (?, ?)")
    .run(nome, hash);

  return { id: Number(resultado.lastInsertRowid), nome };
}

export function buscarUsuarioPorNome(nome) {
  return bd.prepare("SELECT * FROM usuarios WHERE nome = ?").get(nome);
}

export function buscarUsuarioPorId(id) {
  return bd.prepare("SELECT id, nome FROM usuarios WHERE id = ?").get(id);
}

export function autenticar(nome, senha) {
  const usuario = buscarUsuarioPorNome(nome);
  if (!usuario) return null;
  if (!conferirSenha(senha, usuario.senha_hash)) return null;
  return { id: usuario.id, nome: usuario.nome };
}

export function renomearUsuario(id, novoNome) {
  bd.prepare("UPDATE usuarios SET nome = ? WHERE id = ?").run(novoNome, id);
}

export function trocarSenha(id, novaSenha) {
  bd.prepare("UPDATE usuarios SET senha_hash = ? WHERE id = ?")
    .run(gerarHashSenha(novaSenha), id);
}

// ---------------------------------------------------------------------------
// SESSOES
// ---------------------------------------------------------------------------

export function abrirSessao(idUsuario) {
  const token = randomBytes(32).toString("hex");
  bd.prepare("INSERT INTO sessoes (token, id_usuario) VALUES (?, ?)")
    .run(token, idUsuario);
  return token;
}

export function usuarioDaSessao(token) {
  if (!token) return null;
  const linha = bd
    .prepare(`SELECT u.id, u.nome
                FROM sessoes s
                JOIN usuarios u ON u.id = s.id_usuario
               WHERE s.token = ?`)
    .get(token);
  return linha ?? null;
}

export function fecharSessao(token) {
  bd.prepare("DELETE FROM sessoes WHERE token = ?").run(token);
}

// ---------------------------------------------------------------------------
// PROJETOS
// ---------------------------------------------------------------------------

export function listarProjetos(idUsuario) {
  return bd
    .prepare(`SELECT id, nome, criado_em, atualizado_em
                FROM projetos
               WHERE id_usuario = ?
               ORDER BY atualizado_em DESC`)
    .all(idUsuario);
}

export function criarProjeto(idUsuario, nome) {
  const resultado = bd
    .prepare("INSERT INTO projetos (id_usuario, nome) VALUES (?, ?)")
    .run(idUsuario, nome);
  return Number(resultado.lastInsertRowid);
}

export function buscarProjeto(idUsuario, idProjeto) {
  // O id do usuario entra no WHERE de proposito: assim ninguem consegue
  // abrir o projeto de outra pessoa so trocando o numero na URL.
  return bd
    .prepare("SELECT * FROM projetos WHERE id = ? AND id_usuario = ?")
    .get(idProjeto, idUsuario);
}

export function salvarPlanta(idUsuario, idProjeto, planta) {
  const resultado = bd
    .prepare(`UPDATE projetos
                 SET planta = ?, atualizado_em = datetime('now')
               WHERE id = ? AND id_usuario = ?`)
    .run(JSON.stringify(planta), idProjeto, idUsuario);

  return resultado.changes > 0;
}

export function renomearProjeto(idUsuario, idProjeto, nome) {
  const resultado = bd
    .prepare(`UPDATE projetos
                 SET nome = ?, atualizado_em = datetime('now')
               WHERE id = ? AND id_usuario = ?`)
    .run(nome, idProjeto, idUsuario);

  return resultado.changes > 0;
}

export function apagarProjeto(idUsuario, idProjeto) {
  const resultado = bd
    .prepare("DELETE FROM projetos WHERE id = ? AND id_usuario = ?")
    .run(idProjeto, idUsuario);

  return resultado.changes > 0;
}
