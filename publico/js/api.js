// Conversa com o servidor.
//
// Todo pedido passa por aqui, entao erro de rede e tratado em um lugar so
// em vez de espalhado por cada tela.

async function pedir(caminho, opcoes = {}) {
  let resposta;

  try {
    resposta = await fetch(caminho, {
      headers: { "Content-Type": "application/json" },
      ...opcoes,
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    });
  } catch {
    throw new Error("Nao consegui falar com o servidor. Ele esta ligado?");
  }

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    throw new Error(dados.erro ?? `Erro ${resposta.status}`);
  }

  return dados;
}

export const api = {
  registrar: (nome, senha) =>
    pedir("/api/registrar", { method: "POST", corpo: { nome, senha } }),

  login: (nome, senha) =>
    pedir("/api/login", { method: "POST", corpo: { nome, senha } }),

  sair: () => pedir("/api/sair", { method: "POST" }),

  eu: () => pedir("/api/eu"),

  mudarNome: (nome, senha) =>
    pedir("/api/conta/nome", { method: "POST", corpo: { nome, senha } }),

  mudarSenha: (nova, senha) =>
    pedir("/api/conta/senha", { method: "POST", corpo: { nova, senha } }),

  listarProjetos: () => pedir("/api/projetos"),

  criarProjeto: (nome) =>
    pedir("/api/projetos", { method: "POST", corpo: { nome } }),

  abrirProjeto: (id) => pedir(`/api/projetos/${id}`),

  salvarPlanta: (id, planta) =>
    pedir(`/api/projetos/${id}`, { method: "PUT", corpo: { planta } }),

  renomearProjeto: (id, nome) =>
    pedir(`/api/projetos/${id}`, { method: "PATCH", corpo: { nome } }),

  apagarProjeto: (id) => pedir(`/api/projetos/${id}`, { method: "DELETE" }),
};

// Usada nas paginas que exigem login: se ninguem estiver logado, volta
// pra tela de entrada em vez de mostrar a pagina quebrada.
export async function exigirLogin() {
  try {
    const { usuario } = await api.eu();
    return usuario;
  } catch {
    location.href = "/";
    throw new Error("sem sessao");
  }
}
