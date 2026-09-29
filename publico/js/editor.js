// Cola tudo: carrega o projeto, monta a interface, liga os botoes,
// alterna entre 2D e 3D e salva sozinho.

import { api, exigirLogin } from "./api.js";
import { carregarPlanta, TIPOS, distancia, formatarMetros, formatarArea } from "./modelo.js";
import { Editor2D, FERRAMENTAS } from "./editor2d.js";
import { CATALOGO, CATEGORIAS, movelPorChave } from "./moveis.js";
import { todosOsComodos } from "./geometria.js";

const pegar = (id) => document.getElementById(id);

// Todos os icones sao SVG desenhado, nao caractere de fonte. Caractere
// depende da fonte que a maquina tem instalada e sai de tamanho e peso
// diferente em cada um; SVG sai igual em qualquer lugar e acompanha a cor
// do botao sozinho.
const svg = (conteudo) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round">${conteudo}</svg>`;

const FERRAMENTAS_UI = [
  {
    id: FERRAMENTAS.SELECIONAR, nome: "Selecionar", atalho: "V", grupo: 1,
    icone: svg(`<path d="M5 3l13.5 7.5-6 1.6L9.8 19z" fill="currentColor" stroke="none"/>`),
    dica: "Clique para selecionar, arraste para mover. As bolinhas redimensionam.",
  },
  {
    id: FERRAMENTAS.PAREDE, nome: "Parede", atalho: "P", grupo: 2,
    // Barra cheia e grossa: e assim que parede aparece numa planta baixa,
    // e nao se confunde com o retangulo vazado do "comodo pronto".
    icone: svg(`<rect x="2.5" y="9.5" width="19" height="5" rx="0.8" fill="currentColor" stroke="none"/>`),
    dica: "Arraste para desenhar. A proxima parede continua na ponta desta. <b>Shift</b> trava em 45°, <b>botao direito</b> encerra.",
  },
  {
    id: FERRAMENTAS.QUARTO, nome: "Comodo pronto", atalho: "Q", grupo: 2,
    icone: svg(`<rect x="3.5" y="5" width="17" height="14" rx="1"/>`),
    dica: "Arraste um retangulo: sai com as 4 paredes e o piso de uma vez.",
  },
  {
    id: FERRAMENTAS.PISO, nome: "Piso", atalho: "C", grupo: 2,
    icone: svg(`<rect x="3.5" y="5" width="17" height="14" rx="1"/><path d="M3.5 13l8-8M9 19l11.5-11.5M15.5 19l5-5"/>`),
    dica: "Clique dentro de um espaco cercado por paredes. O programa descobre o formato do comodo sozinho.",
  },
  {
    id: FERRAMENTAS.PORTA, nome: "Porta", atalho: "D", grupo: 3,
    icone: svg(`<path d="M4 20h16M8 20V5.5l7-2.2V20"/><circle cx="10" cy="13" r="0.9" fill="currentColor" stroke="none"/>`),
    dica: "Clique em cima de uma parede. A porta se encaixa nela sozinha.",
  },
  {
    id: FERRAMENTAS.JANELA, nome: "Janela", atalho: "J", grupo: 3,
    icone: svg(`<rect x="3" y="7.5" width="18" height="9" rx="1"/><path d="M12 7.5v9M3 12h18"/>`),
    dica: "Arraste sobre uma parede para definir a largura da janela.",
  },
  {
    id: FERRAMENTAS.MOVEL, nome: "Moveis", atalho: "M", grupo: 4,
    icone: svg(`<path d="M4 17v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5"/><rect x="2.5" y="13" width="19" height="5" rx="1.6"/><path d="M5 18v2M19 18v2"/>`),
    dica: "Escolha no painel da esquerda e clique na planta. <b>R</b> gira 15°.",
  },
  {
    id: FERRAMENTAS.TEXTO, nome: "Texto", atalho: "T", grupo: 4,
    icone: svg(`<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>`),
    dica: "Digite ao lado e clique onde quer colocar o texto.",
  },
  {
    id: FERRAMENTAS.PINTAR, nome: "Pintar", atalho: "B", grupo: 5,
    icone: svg(`<path d="M11 4l7.5 7.5-7 7L4 11z"/><path d="M6.5 6.5L9 4"/><path d="M20 15.5c1.2 1.7 1.8 2.7 1.8 3.5a1.8 1.8 0 1 1-3.6 0c0-.8.6-1.8 1.8-3.5z" fill="currentColor" stroke="none"/>`),
    dica: "Escolha a cor ao lado e clique num piso ou movel. Parede na planta fica preta por convencao de desenho tecnico.",
  },
  {
    id: FERRAMENTAS.APAGAR, nome: "Apagar", atalho: "E", grupo: 5,
    icone: svg(`<path d="M8.5 20H5l-2-2 10.5-10.5 5.5 5.5L12 20"/><path d="M21 20h-8.5"/>`),
    dica: "Passe o mouse para ver em vermelho o que vai sair, e clique.",
  },
];

// ---------------------------------------------------------------------------
// CARREGAR O PROJETO
// ---------------------------------------------------------------------------

await exigirLogin();

const idProjeto = Number(new URLSearchParams(location.search).get("projeto"));
if (!idProjeto) location.href = "/home.html";

let projeto;
try {
  projeto = await api.abrirProjeto(idProjeto);
} catch {
  location.href = "/home.html";
  throw new Error("projeto nao encontrado");
}

const planta = carregarPlanta(projeto.planta);
pegar("nome-projeto").value = projeto.nome;
document.title = `${projeto.nome} - ArchView`;

// ---------------------------------------------------------------------------
// SALVAMENTO AUTOMATICO
// ---------------------------------------------------------------------------
// Salvar a cada tracinho seria um pedido ao servidor por segundo. Em vez
// disso marcamos "tem coisa pra salvar" e mandamos tudo junto um instante
// depois que a pessoa para de mexer.

const estadoSalvo = pegar("estado-salvo");

let pendente = false;
let salvando = false;
let cronometro = null;

function marcarPendente() {
  pendente = true;
  estadoSalvo.textContent = "Nao salvo";
  estadoSalvo.className = "estado-salvo pendente";

  clearTimeout(cronometro);
  cronometro = setTimeout(salvar, 1200);
}

async function salvar() {
  if (!pendente || salvando) return;

  salvando = true;
  pendente = false;
  estadoSalvo.textContent = "Salvando...";
  estadoSalvo.className = "estado-salvo";

  try {
    await api.salvarPlanta(idProjeto, planta);
    estadoSalvo.textContent = "Salvo";
    estadoSalvo.className = "estado-salvo";
  } catch (erro) {
    pendente = true; // nao perdeu nada: tenta de novo na proxima mudanca
    estadoSalvo.textContent = "Erro ao salvar";
    estadoSalvo.className = "estado-salvo erro";
    console.error(erro);
  } finally {
    salvando = false;
  }
}

// Ultima chance de salvar se a pessoa fechar a aba no meio.
window.addEventListener("beforeunload", (evento) => {
  if (!pendente) return;
  navigator.sendBeacon?.(
    `/api/projetos/${idProjeto}`,
    new Blob([JSON.stringify({ planta })], { type: "application/json" }),
  );
  evento.preventDefault();
});

// ---------------------------------------------------------------------------
// AVISOS
// ---------------------------------------------------------------------------

const avisoFlutuante = pegar("aviso-flutuante");
let cronometroAviso = null;

function avisar(mensagem) {
  avisoFlutuante.textContent = mensagem;
  avisoFlutuante.classList.add("aparecendo");

  clearTimeout(cronometroAviso);
  cronometroAviso = setTimeout(() => {
    avisoFlutuante.classList.remove("aparecendo");
  }, 2600);
}

// ---------------------------------------------------------------------------
// EDITOR 2D
// ---------------------------------------------------------------------------

const editor = new Editor2D(pegar("tela2d"), planta, {
  aoMudar: () => { marcarPendente(); atualizarResumo(); },
  aoSelecionar: mostrarPropriedades,
  aoTrocarFerramenta: aoTrocarFerramenta,
  aoMoverPonteiro: (p) => {
    pegar("status-cursor").textContent =
      `${p.x.toFixed(2).replace(".", ",")} ; ${p.y.toFixed(2).replace(".", ",")} m`;
  },
  aoMudarZoom: (escala) => { pegar("status-zoom").textContent = Math.round(escala); },
  aoAvisar: avisar,
});

// Deixa o editor acessivel no console do navegador (F12). Util pra depurar:
// da pra inspecionar "archview.planta.elementos" e ver a lista crua.
window.archview = { editor, planta, projeto };

// ---------------------------------------------------------------------------
// BARRA DE FERRAMENTAS
// ---------------------------------------------------------------------------

const listaFerramentas = pegar("lista-ferramentas");
let grupoAnterior = null;

for (const item of FERRAMENTAS_UI) {
  if (grupoAnterior !== null && item.grupo !== grupoAnterior) {
    const divisoria = document.createElement("div");
    divisoria.className = "divisoria";
    listaFerramentas.append(divisoria);
  }
  grupoAnterior = item.grupo;

  const botao = document.createElement("button");
  botao.className = "ferramenta";
  botao.dataset.ferramenta = item.id;
  botao.title = `${item.nome}  (${item.atalho})`;
  botao.innerHTML = item.icone;

  botao.addEventListener("click", () => editor.definirFerramenta(item.id));
  listaFerramentas.append(botao);
}

// --- Controles que mudam conforme a ferramenta -----------------------------

const contexto = pegar("contexto-ferramenta");

function montarContexto(ferramenta) {
  contexto.replaceChildren();

  // Pintar precisa de uma cor escolhida ANTES do clique. Sem isso a
  // ferramenta existia mas pintava sempre da mesma cor fixa.
  if (ferramenta === FERRAMENTAS.PINTAR || ferramenta === FERRAMENTAS.QUARTO) {
    const etiqueta = document.createElement("label");
    etiqueta.textContent = ferramenta === FERRAMENTAS.PINTAR ? "Cor:" : "Cor do piso:";

    const cor = document.createElement("input");
    cor.type = "color";
    cor.value = editor.corAtual;
    cor.addEventListener("input", () => { editor.corAtual = cor.value; });

    contexto.append(etiqueta, cor);
  }

  // Idem para o texto: antes nao havia onde digitar o que seria inserido.
  if (ferramenta === FERRAMENTAS.TEXTO) {
    const etiqueta = document.createElement("label");
    etiqueta.textContent = "Texto:";

    const entrada = document.createElement("input");
    entrada.type = "text";
    entrada.value = editor.textoAtual;
    entrada.placeholder = "Digite aqui";
    entrada.addEventListener("input", () => {
      editor.textoAtual = entrada.value.trim() || "Texto";
    });

    contexto.append(etiqueta, entrada);
    entrada.focus();
    entrada.select();
  }
}

function aoTrocarFerramenta(ferramenta) {
  for (const botao of listaFerramentas.querySelectorAll(".ferramenta")) {
    botao.classList.toggle("ativa", botao.dataset.ferramenta === ferramenta);
  }

  const item = FERRAMENTAS_UI.find((f) => f.id === ferramenta);
  pegar("dica-ferramenta").innerHTML = item ? `<b>${item.nome}</b>: ${item.dica}` : "";

  montarContexto(ferramenta);

  pegar("painel-moveis").classList.toggle("oculto", ferramenta !== FERRAMENTAS.MOVEL);
  pegar("tela2d").classList.toggle("modo-selecao", ferramenta === FERRAMENTAS.SELECIONAR);
}

// --- Catalogo de moveis ----------------------------------------------------

const gradeMoveis = pegar("grade-moveis");

for (const categoria of CATEGORIAS) {
  const titulo = document.createElement("div");
  titulo.className = "titulo-secao";
  titulo.textContent = categoria;
  gradeMoveis.append(titulo);

  for (const movel of CATALOGO.filter((m) => m.categoria === categoria)) {
    const botao = document.createElement("button");
    botao.className = "item-movel";
    botao.dataset.movel = movel.chave;

    const nome = document.createElement("span");
    nome.textContent = movel.nome;

    const medida = document.createElement("small");
    medida.textContent = `${movel.largura} × ${movel.profundidade} m`;

    botao.append(nome, medida);
    botao.addEventListener("click", () => {
      editor.movelAtual = movel.chave;
      editor.definirFerramenta(FERRAMENTAS.MOVEL);
      atualizarMovelAtivo();
    });

    gradeMoveis.append(botao);
  }
}

function atualizarMovelAtivo() {
  for (const botao of gradeMoveis.querySelectorAll(".item-movel")) {
    botao.classList.toggle("ativo", botao.dataset.movel === editor.movelAtual);
  }
}

// ---------------------------------------------------------------------------
// PAINEL DE PROPRIEDADES
// ---------------------------------------------------------------------------
// So aparece quando ha algo selecionado, e flutua sobre o desenho em vez de
// roubar uma coluna fixa da tela.

const painelPropriedades = pegar("painel-propriedades");
const corpoPropriedades = pegar("propriedades");
const tituloPropriedades = pegar("titulo-propriedades");

function campo(rotulo, tipo, valor, aoMudar, extras = {}) {
  const bloco = document.createElement("div");
  bloco.className = "propriedade";

  const etiqueta = document.createElement("label");
  etiqueta.textContent = rotulo;

  const entrada = document.createElement("input");
  entrada.type = tipo;
  entrada.value = valor;
  Object.assign(entrada, extras);

  entrada.addEventListener("change", () => {
    editor.registrarHistorico();
    aoMudar(entrada.value);
    editor.redesenhar();
    marcarPendente();
    atualizarResumo();
  });

  bloco.append(etiqueta, entrada);
  return bloco;
}

function leitura(html) {
  const bloco = document.createElement("div");
  bloco.className = "leitura";
  bloco.innerHTML = html;
  return bloco;
}

const NOMES_TIPO = {
  [TIPOS.PAREDE]: "Parede",
  [TIPOS.PISO]: "Comodo", [TIPOS.PORTA]: "Porta",
  [TIPOS.JANELA]: "Janela", [TIPOS.TEXTO]: "Texto", [TIPOS.MOVEL]: "Movel",
};

function mostrarPropriedades(el) {
  if (!el) {
    painelPropriedades.classList.add("oculto");
    return;
  }

  painelPropriedades.classList.remove("oculto");
  tituloPropriedades.textContent = NOMES_TIPO[el.tipo] ?? el.tipo;
  corpoPropriedades.replaceChildren();

  if (el.tipo === TIPOS.PAREDE) {
    corpoPropriedades.append(
      leitura(`Comprimento: <b>${formatarMetros(distancia(el.a, el.b))}</b>`),
      campo("Altura (m)", "number", el.altura, (v) => {
        el.altura = Math.max(0.3, Number(v) || 2.7);
      }, { step: "0.1", min: "0.3" }),
      campo("Espessura (m)", "number", el.espessura, (v) => {
        el.espessura = Math.max(0.03, Number(v) || 0.15);
      }, { step: "0.01", min: "0.03" }),
      campo("Cor na planta (2D)", "color", el.cor ?? "#2b2b2b", (v) => { el.cor = v; }),
      campo("Cor da parede (3D)", "color", el.cor3d ?? "#ece8e2", (v) => { el.cor3d = v; }),
    );
  }

  if (el.tipo === TIPOS.PORTA || el.tipo === TIPOS.JANELA) {
    corpoPropriedades.append(
      leitura(`Largura: <b>${formatarMetros(distancia(el.a, el.b))}</b>`),
      campo("Altura (m)", "number", el.altura, (v) => {
        el.altura = Math.max(0.2, Number(v) || 2.1);
      }, { step: "0.05", min: "0.2" }),
    );

    if (el.tipo === TIPOS.JANELA) {
      corpoPropriedades.append(
        campo("Peitoril (m do chao)", "number", el.peitoril, (v) => {
          el.peitoril = Math.max(0, Number(v) || 1);
        }, { step: "0.05", min: "0" }),
      );
    }

    corpoPropriedades.append(campo("Cor", "color", el.cor, (v) => { el.cor = v; }));
  }

  if (el.tipo === TIPOS.PISO) {
    // A area vem do comodo detectado agora, nao de um poligono guardado.
    // Se as paredes mudarem, este numero muda junto sem ninguem fazer nada.
    const comodo = editor._comodoDoMarcador(el);

    corpoPropriedades.append(
      comodo
        ? leitura(`Area: <b>${formatarArea(comodo.area)}</b>`)
        : leitura("As paredes em volta nao fecham, entao este comodo nao tem " +
                  "forma. Feche o contorno e a area aparece."),
      campo("Nome do comodo", "text", el.nome ?? "", (v) => { el.nome = v; },
            { placeholder: "Sala, Quarto 1..." }),
      campo("Cor do piso", "color", el.cor, (v) => { el.cor = v; }),
    );
  }

  if (el.tipo === TIPOS.TEXTO) {
    corpoPropriedades.append(
      campo("Texto", "text", el.texto, (v) => { el.texto = v || "Texto"; }),
      campo("Tamanho (m)", "number", el.tamanho, (v) => {
        el.tamanho = Math.max(0.05, Number(v) || 0.3);
      }, { step: "0.05", min: "0.05" }),
      campo("Cor", "color", el.cor, (v) => { el.cor = v; }),
    );
  }

  if (el.tipo === TIPOS.MOVEL) {
    const definicao = movelPorChave(el.modelo);

    corpoPropriedades.append(
      leitura(`<b>${definicao?.nome ?? el.modelo}</b><br>` +
              `${el.largura} × ${el.profundidade} × ${el.altura} m`),
      campo("Rotacao (graus)", "number", el.rotacao, (v) => {
        el.rotacao = ((Number(v) || 0) % 360 + 360) % 360;
      }, { step: "15" }),
      leitura("<b>R</b> gira 15°, <b>Shift+R</b> gira ao contrario"),
    );
  }

  const apagar = document.createElement("button");
  apagar.className = "botao-perigo";
  apagar.style.width = "100%";
  apagar.style.marginTop = "6px";
  apagar.textContent = "Apagar elemento";
  apagar.addEventListener("click", () => editor.remover(el.id));

  corpoPropriedades.append(apagar);
}

// ---------------------------------------------------------------------------
// RESUMO NA BARRA DE BAIXO
// ---------------------------------------------------------------------------

function atualizarResumo() {
  const paredes = planta.elementos.filter((el) => el.tipo === TIPOS.PAREDE);
  const comodos = todosOsComodos(planta.elementos);
  const areaTotal = comodos.reduce((soma, c) => soma + c.area, 0);

  pegar("status-resumo").textContent = comodos.length
    ? `${paredes.length} paredes · ${comodos.length} comodos · ${formatarArea(areaTotal)}`
    : `${paredes.length} paredes`;
}

// ---------------------------------------------------------------------------
// BARRA DE BAIXO
// ---------------------------------------------------------------------------

pegar("sel-snap").addEventListener("change", (e) => {
  editor.snap = Number(e.target.value);
});

pegar("chk-grade").addEventListener("change", (e) => {
  editor.mostrarGrade = e.target.checked;
  editor.redesenhar();
});

pegar("chk-cotas").addEventListener("change", (e) => {
  editor.mostrarCotas = e.target.checked;
  editor.redesenhar();
});

// ---------------------------------------------------------------------------
// BARRA DE CIMA
// ---------------------------------------------------------------------------

pegar("btn-voltar").addEventListener("click", async () => {
  await salvar();
  location.href = "/home.html";
});

pegar("btn-desfazer").addEventListener("click", () => editor.desfazer());
pegar("btn-refazer").addEventListener("click", () => editor.refazerAcao());
pegar("btn-enquadrar").addEventListener("click", () => editor.enquadrarTudo());

pegar("nome-projeto").addEventListener("change", async (e) => {
  const nome = e.target.value.trim() || "Projeto sem nome";
  e.target.value = nome;

  try {
    await api.renomearProjeto(idProjeto, nome);
    document.title = `${nome} - ArchView`;
  } catch (erro) {
    avisar(erro.message);
  }
});

// ---------------------------------------------------------------------------
// EXPORTAR E IMPORTAR
// ---------------------------------------------------------------------------
// Existe por um motivo pratico: o grupo e grande e o servidor roda numa
// maquina so. Cada pessoa desenha no seu computador, baixa o arquivo e abre
// na maquina da apresentacao. De quebra, o arquivo serve de backup.

const NOME_FORMATO = "archview";

function baixar(nomeArquivo, url) {
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
}

// Tira do nome do projeto o que nao pode virar nome de arquivo.
function nomeSeguro(texto) {
  return (texto.trim() || "planta")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim().replace(/\s+/g, "-")
    .slice(0, 50) || "planta";
}

pegar("btn-png").addEventListener("click", () => {
  if (em3d) { avisar("Volte para a Planta 2D para baixar a imagem."); return; }

  const png = editor.exportarPNG();
  if (!png) { avisar("Desenhe alguma coisa antes de baixar a imagem."); return; }

  baixar(`${nomeSeguro(pegar("nome-projeto").value)}.png`, png);
});

pegar("btn-baixar").addEventListener("click", async () => {
  await salvar();

  const conteudo = JSON.stringify({
    formato: NOME_FORMATO,
    versao: 1,
    nome: pegar("nome-projeto").value.trim() || "Planta",
    exportadoEm: new Date().toISOString(),
    planta,
  }, null, 1);

  const url = URL.createObjectURL(new Blob([conteudo], { type: "application/json" }));
  baixar(`${nomeSeguro(pegar("nome-projeto").value)}.archview.json`, url);

  // Sem isso o navegador segura o arquivo na memoria ate fechar a aba.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

pegar("btn-abrir").addEventListener("click", () => pegar("entrada-arquivo").click());

pegar("entrada-arquivo").addEventListener("change", async (evento) => {
  const arquivo = evento.target.files?.[0];
  evento.target.value = ""; // permite reabrir o mesmo arquivo depois

  if (!arquivo) return;

  let bruto;
  try {
    bruto = JSON.parse(await arquivo.text());
  } catch {
    avisar("Esse arquivo nao e um projeto do ArchView.");
    return;
  }

  if (bruto?.formato !== NOME_FORMATO || !bruto?.planta) {
    avisar("Esse arquivo nao e um projeto do ArchView.");
    return;
  }

  const importada = carregarPlanta(bruto.planta);

  if (importada.elementos.length === 0) {
    avisar("O arquivo abriu, mas nao tinha nenhum elemento dentro.");
    return;
  }

  const quantos = planta.elementos.length;
  if (quantos > 0 &&
      !confirm(`Isso substitui os ${quantos} elementos deste projeto pelos ` +
               `${importada.elementos.length} do arquivo. Continuar?`)) {
    return;
  }

  // Passa pelo historico: se a pessoa se arrepender, Ctrl+Z devolve.
  editor.registrarHistorico();
  planta.elementos = importada.elementos;

  editor.selecionado = null;
  mostrarPropriedades(null);
  editor.enquadrarTudo();

  marcarPendente();
  atualizarResumo();
  avisar(`Projeto aberto: ${importada.elementos.length} elementos.`);
});

// ---------------------------------------------------------------------------
// ALTERNAR 2D / 3D
// ---------------------------------------------------------------------------

let vista3d = null;
let em3d = false;

const palco3d = pegar("palco3d");
const tela2d = pegar("tela2d");
const dicaPasseio = pegar("dica-passeio");
const botaoPasseio = pegar("btn-passeio");

async function entrar3d() {
  if (em3d) return;
  em3d = true;

  pegar("btn-2d").classList.remove("ativo");
  pegar("btn-3d").classList.add("ativo");

  tela2d.classList.add("oculto");
  palco3d.classList.remove("oculto");
  botaoPasseio.classList.remove("oculto");

  // Os paineis do 2D nao fazem sentido enquanto o 3D esta na tela.
  pegar("painel-moveis").classList.add("oculto");
  painelPropriedades.classList.add("oculto");

  // A biblioteca 3D so e carregada quando alguem realmente pede o 3D.
  // Quem so quer desenhar a planta nao paga o download dela.
  if (!vista3d) {
    const { Vista3D } = await import("./vista3d.js");
    vista3d = new Vista3D(palco3d);
    window.archview.vista3d = vista3d;

    vista3d.aoAvisar = avisar;
    vista3d.aoTrocarModo = (modo) => {
      dicaPasseio.classList.toggle("oculto", modo !== "passeio");
      botaoPasseio.textContent = modo === "passeio" ? "Sair do passeio" : "Entrar e andar";
    };
  }

  vista3d.redimensionar();
  vista3d.reconstruir(planta);
  vista3d.iniciar();
}

function entrar2d() {
  if (!em3d) return;
  em3d = false;

  pegar("btn-3d").classList.remove("ativo");
  pegar("btn-2d").classList.add("ativo");

  palco3d.classList.add("oculto");
  botaoPasseio.classList.add("oculto");
  dicaPasseio.classList.add("oculto");
  tela2d.classList.remove("oculto");

  vista3d?.definirModo("orbita");
  vista3d?.parar();

  aoTrocarFerramenta(editor.ferramenta);
  mostrarPropriedades(editor.elementoSelecionado());
  editor._ajustarTamanho();
}

pegar("btn-3d").addEventListener("click", entrar3d);
pegar("btn-2d").addEventListener("click", entrar2d);

botaoPasseio.addEventListener("click", () => {
  if (!vista3d) return;
  vista3d.definirModo(vista3d.modo === "passeio" ? "orbita" : "passeio");
});

// Tab alterna 2D e 3D. Numa demonstracao ao vivo, trocar de vista com uma
// tecla e bem melhor do que mirar o mouse num botao.
window.addEventListener("keydown", (evento) => {
  if (evento.key !== "Tab") return;

  // Enquanto se digita num campo, Tab continua sendo Tab (pular pro proximo).
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

  evento.preventDefault();
  if (em3d) entrar2d(); else entrar3d();
});

// ---------------------------------------------------------------------------
// INICIO
// ---------------------------------------------------------------------------

aoTrocarFerramenta(FERRAMENTAS.SELECIONAR);
atualizarMovelAtivo();
atualizarResumo();
mostrarPropriedades(null);

// Se o projeto ja tem coisa desenhada, comeca enquadrado nela.
if (planta.elementos.length > 0) editor.enquadrarTudo();
else editor.redesenhar();
