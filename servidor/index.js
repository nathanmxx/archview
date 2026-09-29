// Servidor do ArchView.
//
// Responsabilidades:
//   - entregar os arquivos da pasta "publico" para o navegador;
//   - expor a API /api/... que fala com o banco.
//
// O navegador NUNCA fala com o banco direto. Ele pede pro servidor, e o
// servidor decide o que pode. Era exatamente isso que faltava na versao
// anterior, onde a senha do banco ficava dentro do proprio programa.

import express from "express";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as banco from "./banco.js";

const PASTA_RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORTA = process.env.PORT ?? 3000;

const app = express();
app.use(express.json({ limit: "5mb" }));

// ---------------------------------------------------------------------------
// SESSAO
// ---------------------------------------------------------------------------

const NOME_COOKIE = "archview_sessao";

function lerCookie(req, nome) {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return null;

  for (const parte of cabecalho.split(";")) {
    const [chave, ...resto] = parte.trim().split("=");
    if (chave === nome) return decodeURIComponent(resto.join("="));
  }
  return null;
}

// Middleware: identifica quem esta fazendo o pedido e guarda em req.usuario.
app.use((req, _res, next) => {
  req.usuario = banco.usuarioDaSessao(lerCookie(req, NOME_COOKIE));
  next();
});

// Middleware: barra a rota se ninguem estiver logado.
function exigirLogin(req, res, next) {
  if (!req.usuario) return res.status(401).json({ erro: "Precisa estar logado" });
  next();
}

// ---------------------------------------------------------------------------
// VALIDACAO
// ---------------------------------------------------------------------------

function validarCredenciais(nome, senha) {
  if (typeof nome !== "string" || typeof senha !== "string") {
    return "Dados invalidos";
  }
  if (nome.trim().length < 3) return "O nome precisa ter pelo menos 3 letras";
  if (nome.trim().length > 20) return "O nome pode ter no maximo 20 letras";
  if (senha.length < 4) return "A senha precisa ter pelo menos 4 caracteres";
  return null;
}

// ---------------------------------------------------------------------------
// ROTAS DE CONTA
// ---------------------------------------------------------------------------

app.post("/api/registrar", (req, res) => {
  const nome = String(req.body?.nome ?? "").trim();
  const senha = String(req.body?.senha ?? "");

  const problema = validarCredenciais(nome, senha);
  if (problema) return res.status(400).json({ erro: problema });

  // Aqui estava o bug da versao antiga: ela checava nome E senha juntos,
  // entao dois usuarios podiam ter o mesmo nome com senhas diferentes.
  // Agora quem garante isso e o proprio banco (coluna UNIQUE).
  if (banco.buscarUsuarioPorNome(nome)) {
    return res.status(409).json({ erro: "Esse nome de usuario ja existe" });
  }

  const usuario = banco.criarUsuario(nome, senha);
  res.status(201).json({ ok: true, usuario });
});

app.post("/api/login", (req, res) => {
  const nome = String(req.body?.nome ?? "").trim();
  const senha = String(req.body?.senha ?? "");

  const usuario = banco.autenticar(nome, senha);
  if (!usuario) {
    // Mensagem generica de proposito: dizer "esse usuario nao existe"
    // entrega pra quem tenta invadir quais nomes sao validos.
    return res.status(401).json({ erro: "Usuario ou senha incorretos" });
  }

  const token = banco.abrirSessao(usuario.id);
  res.cookie(NOME_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
  res.json({ ok: true, usuario });
});

app.post("/api/sair", (req, res) => {
  banco.fecharSessao(lerCookie(req, NOME_COOKIE));
  res.clearCookie(NOME_COOKIE);
  res.json({ ok: true });
});

app.get("/api/eu", (req, res) => {
  if (!req.usuario) return res.status(401).json({ erro: "Ninguem logado" });
  res.json({ usuario: req.usuario });
});

app.post("/api/conta/nome", exigirLogin, (req, res) => {
  const novoNome = String(req.body?.nome ?? "").trim();
  const senha = String(req.body?.senha ?? "");

  if (!banco.autenticar(req.usuario.nome, senha)) {
    return res.status(401).json({ erro: "Senha incorreta" });
  }
  if (novoNome.length < 3 || novoNome.length > 20) {
    return res.status(400).json({ erro: "O nome precisa ter de 3 a 20 letras" });
  }

  const existente = banco.buscarUsuarioPorNome(novoNome);
  if (existente && existente.id !== req.usuario.id) {
    return res.status(409).json({ erro: "Esse nome ja esta em uso" });
  }

  banco.renomearUsuario(req.usuario.id, novoNome);
  res.json({ ok: true, usuario: { id: req.usuario.id, nome: novoNome } });
});

app.post("/api/conta/senha", exigirLogin, (req, res) => {
  const novaSenha = String(req.body?.nova ?? "");
  const senhaAtual = String(req.body?.senha ?? "");

  if (!banco.autenticar(req.usuario.nome, senhaAtual)) {
    return res.status(401).json({ erro: "Senha atual incorreta" });
  }
  if (novaSenha.length < 4) {
    return res.status(400).json({ erro: "A nova senha precisa ter 4+ caracteres" });
  }

  banco.trocarSenha(req.usuario.id, novaSenha);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ROTAS DE PROJETO
// ---------------------------------------------------------------------------

app.get("/api/projetos", exigirLogin, (req, res) => {
  res.json({ projetos: banco.listarProjetos(req.usuario.id) });
});

app.post("/api/projetos", exigirLogin, (req, res) => {
  const nome = String(req.body?.nome ?? "").trim() || "Projeto sem nome";
  const id = banco.criarProjeto(req.usuario.id, nome);
  res.status(201).json({ ok: true, id });
});

app.get("/api/projetos/:id", exigirLogin, (req, res) => {
  const projeto = banco.buscarProjeto(req.usuario.id, Number(req.params.id));
  if (!projeto) return res.status(404).json({ erro: "Projeto nao encontrado" });

  let planta;
  try {
    planta = JSON.parse(projeto.planta);
  } catch {
    planta = { elementos: [] };
  }

  res.json({ id: projeto.id, nome: projeto.nome, planta });
});

function salvarPlanta(req, res) {
  const planta = req.body?.planta;
  if (!planta || !Array.isArray(planta.elementos)) {
    return res.status(400).json({ erro: "Planta invalida" });
  }

  const ok = banco.salvarPlanta(req.usuario.id, Number(req.params.id), planta);
  if (!ok) return res.status(404).json({ erro: "Projeto nao encontrado" });

  res.json({ ok: true });
}

app.put("/api/projetos/:id", exigirLogin, salvarPlanta);

// A mesma coisa, mas por POST. Existe por causa do salvamento de emergencia
// quando a pessoa fecha a aba: ele usa navigator.sendBeacon, que SEMPRE
// manda POST e nao aceita PUT. Sem esta rota o beacon batia em 404 e o
// trabalho dos ultimos segundos se perdia calado.
app.post("/api/projetos/:id", exigirLogin, salvarPlanta);

app.patch("/api/projetos/:id", exigirLogin, (req, res) => {
  const nome = String(req.body?.nome ?? "").trim();
  if (!nome) return res.status(400).json({ erro: "Nome vazio" });

  const ok = banco.renomearProjeto(req.usuario.id, Number(req.params.id), nome);
  if (!ok) return res.status(404).json({ erro: "Projeto nao encontrado" });

  res.json({ ok: true });
});

app.delete("/api/projetos/:id", exigirLogin, (req, res) => {
  const ok = banco.apagarProjeto(req.usuario.id, Number(req.params.id));
  if (!ok) return res.status(404).json({ erro: "Projeto nao encontrado" });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ARQUIVOS DO SITE
// ---------------------------------------------------------------------------

// A biblioteca Three.js vem da pasta node_modules, servida localmente.
// Assim o 3D funciona mesmo sem internet no dia da feira.
app.use("/vendor/three", express.static(join(PASTA_RAIZ, "node_modules", "three")));
app.use(express.static(join(PASTA_RAIZ, "publico")));

// Abre o navegador na pagina do sistema. Quem chama e o proprio servidor,
// depois de estar no ar: e o unico momento em que temos certeza de que a
// pagina vai carregar. Um "espere 3 segundos" no atalho as vezes nao basta,
// ainda mais rodando de pendrive, que e mais lento.
function abrirNavegador(url) {
  try {
    const comando = process.platform === "win32" ? "cmd" : "open";
    const argumentos = process.platform === "win32" ? ["/c", "start", "", url] : [url];

    spawn(comando, argumentos, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // Se nao abrir sozinho, nao e motivo pra derrubar o servidor: a pessoa
    // ainda pode digitar o endereco na mao.
    console.log("  (nao consegui abrir o navegador sozinho)");
  }
}

app.listen(PORTA, () => {
  const url = `http://localhost:${PORTA}`;
  console.log(`\n  ArchView rodando em  ${url}\n`);

  if (process.argv.includes("--abrir")) abrirNavegador(url);
});
