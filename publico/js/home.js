// Tela inicial: lista os projetos do usuario e cuida da conta.

import { api, exigirLogin } from "./api.js";

const pegar = (id) => document.getElementById(id);

const grade = pegar("grade");
const botaoNovo = pegar("btn-novo");

let usuario = null;

// --- Saudacao --------------------------------------------------------------

function saudacaoPorHorario() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 19) return "Boa tarde";
  return "Boa noite";
}

// --- Modais ----------------------------------------------------------------

function abrirModal(id) { pegar(id).hidden = false; }
function fecharModal(id) { pegar(id).hidden = true; }

// Fechar clicando no fundo escuro ou no botao Cancelar.
for (const fundo of document.querySelectorAll(".fundo-modal")) {
  fundo.addEventListener("click", (evento) => {
    if (evento.target === fundo || evento.target.hasAttribute("data-fechar")) {
      fundo.hidden = true;
    }
  });
}

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") {
    for (const fundo of document.querySelectorAll(".fundo-modal")) fundo.hidden = true;
  }
});

// --- Lista de projetos -----------------------------------------------------

function formatarData(texto) {
  // O SQLite devolve "2026-09-19 14:32:10" em UTC.
  const data = new Date(texto.replace(" ", "T") + "Z");
  if (Number.isNaN(data.getTime())) return "";

  return data.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function montarCartao(projeto) {
  const cartao = document.createElement("div");
  cartao.className = "projeto";

  const nome = document.createElement("div");
  nome.className = "projeto-nome";
  nome.textContent = projeto.nome; // textContent, nao innerHTML: nome de
  cartao.append(nome);             // projeto e texto do usuario, nunca HTML.

  const data = document.createElement("div");
  data.className = "projeto-data";
  data.textContent = `Editado ${formatarData(projeto.atualizado_em)}`;
  cartao.append(data);

  const acoes = document.createElement("div");
  acoes.className = "projeto-acoes";

  const abrir = document.createElement("button");
  abrir.textContent = "Abrir";
  abrir.addEventListener("click", () => {
    location.href = `/editor.html?projeto=${projeto.id}`;
  });

  const apagar = document.createElement("button");
  apagar.textContent = "Apagar";
  apagar.className = "botao-perigo";
  apagar.addEventListener("click", async () => {
    if (!confirm(`Apagar "${projeto.nome}"? Isso nao tem volta.`)) return;
    await api.apagarProjeto(projeto.id);
    carregarProjetos();
  });

  acoes.append(abrir, apagar);
  cartao.append(acoes);

  return cartao;
}

async function carregarProjetos() {
  const { projetos } = await api.listarProjetos();

  // Limpa tudo menos o botao de novo projeto, que fica sempre por ultimo.
  grade.replaceChildren(...projetos.map(montarCartao), botaoNovo);

  pegar("contagem").textContent = projetos.length === 0
    ? "Voce ainda nao tem projetos. Crie o primeiro ali embaixo."
    : `${projetos.length} projeto${projetos.length > 1 ? "s" : ""}`;
}

// --- Acoes do topo ---------------------------------------------------------

pegar("btn-sair").addEventListener("click", async () => {
  await api.sair();
  location.href = "/";
});

pegar("btn-conta").addEventListener("click", () => {
  pegar("conta-aviso").textContent = "";
  pegar("form-conta").reset();
  atualizarRotuloConta();
  abrirModal("modal-conta");
});

// --- Novo projeto ----------------------------------------------------------

botaoNovo.addEventListener("click", () => {
  pegar("novo-aviso").textContent = "";
  pegar("form-novo").reset();
  abrirModal("modal-novo");
  pegar("novo-nome").focus();
});

pegar("form-novo").addEventListener("submit", async (evento) => {
  evento.preventDefault();

  try {
    const { id } = await api.criarProjeto(pegar("novo-nome").value.trim());
    location.href = `/editor.html?projeto=${id}`;
  } catch (erro) {
    pegar("novo-aviso").textContent = erro.message;
  }
});

// --- Conta -----------------------------------------------------------------

function atualizarRotuloConta() {
  const mudandoSenha = pegar("conta-o-que").value === "senha";

  pegar("rotulo-novo").textContent = mudandoSenha ? "Nova senha" : "Novo nome";
  pegar("conta-novo").type = mudandoSenha ? "password" : "text";
}

pegar("conta-o-que").addEventListener("change", atualizarRotuloConta);

pegar("form-conta").addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const aviso = pegar("conta-aviso");
  const novo = pegar("conta-novo").value;
  const senha = pegar("conta-senha").value;

  try {
    if (pegar("conta-o-que").value === "nome") {
      const resposta = await api.mudarNome(novo.trim(), senha);
      usuario = resposta.usuario;
      pegar("saudacao").textContent = `${saudacaoPorHorario()}, ${usuario.nome}`;
    } else {
      await api.mudarSenha(novo, senha);
    }

    aviso.textContent = "Alterado com sucesso";
    aviso.classList.add("ok");
    pegar("form-conta").reset();
    atualizarRotuloConta();
  } catch (erro) {
    aviso.textContent = erro.message;
    aviso.classList.remove("ok");
  }
});

// --- Inicio ----------------------------------------------------------------

usuario = await exigirLogin();
pegar("saudacao").textContent = `${saudacaoPorHorario()}, ${usuario.nome}`;
await carregarProjetos();
