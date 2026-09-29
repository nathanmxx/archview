// Modelo de dados da planta.
//
// Este arquivo e o coracao do projeto: tanto o editor 2D quanto a vista 3D
// quanto o banco de dados usam EXATAMENTE esta mesma estrutura. Nada e
// convertido de um formato pro outro. Desenhar em 2D e ver em 3D sao duas
// leituras da mesma lista de elementos.
//
// DECISAO IMPORTANTE: todas as coordenadas ficam guardadas em METROS, nunca
// em pixels. O canvas 2D converte metros -> pixels na hora de desenhar, e o
// 3D usa os metros direto. Isso faz as medidas na tela serem medidas reais,
// e o desenho fica igual em qualquer zoom ou tamanho de janela.

export const ALTURA_PAREDE = 2.7;      // metros, pe-direito padrao
export const ESPESSURA_PAREDE = 0.15;  // metros
export const ALTURA_PORTA = 2.1;
export const LARGURA_PORTA = 0.8;
export const ALTURA_JANELA = 1.2;
export const LARGURA_JANELA = 1.2;
export const PEITORIL_JANELA = 1.0;    // altura do chao ate a base da janela

export const TIPOS = {
  PAREDE: "parede",
  PISO: "piso",           // marcador de comodo: guarda nome e cor, nao formato
  PORTA: "porta",
  JANELA: "janela",
  TEXTO: "texto",
  MOVEL: "movel",
};

// Ordem de desenho no 2D: o que vem depois fica por cima.
export const ORDEM_DESENHO = [
  TIPOS.PISO, TIPOS.PAREDE,
  TIPOS.JANELA, TIPOS.PORTA, TIPOS.MOVEL, TIPOS.TEXTO,
];

// Ordem de selecao: o inverso. Clicar num texto em cima de um piso
// seleciona o texto, nao o piso.
export const ORDEM_SELECAO = [...ORDEM_DESENHO].reverse();

let proximoId = 1;

export function novoId() {
  return proximoId++;
}

// Quando carregamos um projeto salvo, o contador precisa continuar de onde
// parou, senao dois elementos acabam com o mesmo id.
export function ajustarContadorId(elementos) {
  for (const el of elementos) {
    if (typeof el.id === "number" && el.id >= proximoId) proximoId = el.id + 1;
  }
}

// ---------------------------------------------------------------------------
// CONSTRUTORES
// ---------------------------------------------------------------------------

export function criarParede(a, b, cor = "#2b2b2b") {
  return {
    id: novoId(), tipo: TIPOS.PAREDE,
    a: { ...a }, b: { ...b },
    altura: ALTURA_PAREDE, espessura: ESPESSURA_PAREDE, cor,
  };
}

// O piso NAO guarda formato. Ele e so um marcador largado dentro de um
// comodo, carregando o nome e a cor daquele ambiente. Quem sabe o formato
// e a geometria.js, olhando as paredes.
//
// Por que assim: se o piso fosse um poligono proprio, ele sairia de sincronia
// na primeira vez que alguem mexesse numa parede - o comodo mudaria de forma
// e o piso ficaria para tras. Guardar a mesma verdade em dois lugares sempre
// termina com os dois discordando.
export function criarPiso(ponto, cor = "#d6d2cb") {
  return {
    id: novoId(), tipo: TIPOS.PISO,
    a: { ...ponto }, cor, nome: "",
  };
}

export function criarPorta(a, b, cor = "#b5651d") {
  return {
    id: novoId(), tipo: TIPOS.PORTA,
    a: { ...a }, b: { ...b }, altura: ALTURA_PORTA, cor,
  };
}

export function criarJanela(a, b, cor = "#4fb0d8") {
  return {
    id: novoId(), tipo: TIPOS.JANELA,
    a: { ...a }, b: { ...b },
    altura: ALTURA_JANELA, peitoril: PEITORIL_JANELA, cor,
  };
}

export function criarTexto(a, texto, cor = "#1a1a1a") {
  return {
    id: novoId(), tipo: TIPOS.TEXTO,
    a: { ...a }, texto, cor, tamanho: 0.3,
  };
}

export function criarMovel(a, definicao) {
  return {
    id: novoId(), tipo: TIPOS.MOVEL,
    modelo: definicao.chave,
    a: { ...a },
    rotacao: 0,                       // em graus, no plano do chao
    largura: definicao.largura,
    profundidade: definicao.profundidade,
    altura: definicao.altura,
    cor: definicao.cor,
  };
}

// ---------------------------------------------------------------------------
// A PLANTA
// ---------------------------------------------------------------------------

export function plantaVazia() {
  return { versao: 1, elementos: [] };
}

// Le uma planta vinda do banco, descartando o que estiver fora do formato.
// Nunca confie cegamente em dado que veio de fora: um JSON estragado nao
// pode derrubar o editor inteiro.
export function carregarPlanta(bruto) {
  const planta = plantaVazia();
  if (!bruto || !Array.isArray(bruto.elementos)) return planta;

  const tiposValidos = new Set(Object.values(TIPOS));

  for (const bruta of bruto.elementos) {
    if (!bruta) continue;

    // Converter ANTES de validar: tipos que sairam do modelo ainda precisam
    // virar alguma coisa, em vez de sumirem calados.
    const el = converterFormatoAntigo(bruta);
    if (!tiposValidos.has(el.tipo)) continue;

    planta.elementos.push(el);
  }

  ajustarContadorId(planta.elementos);
  return planta;
}

// Projetos salvos antes da mudanca guardavam o piso como um poligono
// ("pontos"), e existia um tipo "comodo" que era um piso retangular. Os dois
// viram o marcador novo em vez de serem descartados: quem salvou uma planta
// semana passada nao pode abrir e encontrar ela vazia.
function converterFormatoAntigo(el) {
  const virarMarcador = (centro) => ({
    id: el.id, tipo: TIPOS.PISO,
    a: centro,
    cor: el.cor ?? "#d6d2cb",
    nome: el.nome ?? "",
  });

  if (el.tipo === TIPOS.PISO && Array.isArray(el.pontos)) {
    let somaX = 0;
    let somaY = 0;
    for (const p of el.pontos) { somaX += p.x; somaY += p.y; }

    const total = el.pontos.length || 1;
    return virarMarcador({ x: somaX / total, y: somaY / total });
  }

  if (el.tipo === "comodo" && el.a && el.b) {
    return virarMarcador({ x: (el.a.x + el.b.x) / 2, y: (el.a.y + el.b.y) / 2 });
  }

  return el;
}

// ---------------------------------------------------------------------------
// GEOMETRIA BASICA
// ---------------------------------------------------------------------------

export const distancia = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);

export function comprimentoDe(el) {
  return el.a && el.b ? distancia(el.a, el.b) : 0;
}

// Devolve o ponto do segmento a-b mais proximo de p, junto com a distancia.
// Usado o tempo todo: para clicar numa parede, para encaixar uma porta nela,
// para saber se o mouse esta em cima de algo.
export function pontoMaisProximoDoSegmento(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comprimentoQuadrado = dx * dx + dy * dy;

  if (comprimentoQuadrado === 0) {
    return { ponto: { ...a }, distancia: distancia(p, a), t: 0 };
  }

  // t = onde a projecao de p cai ao longo do segmento (0 = ponta a, 1 = ponta b).
  // O clamp prende o resultado dentro do segmento em vez da reta infinita.
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / comprimentoQuadrado;
  t = Math.max(0, Math.min(1, t));

  const ponto = { x: a.x + t * dx, y: a.y + t * dy };
  return { ponto, distancia: distancia(p, ponto), t };
}

export function pontoDentroDoPoligono(p, pontos) {
  // Algoritmo do raio: dispara uma linha pra direita e conta quantas arestas
  // ela cruza. Impar = dentro, par = fora.
  let dentro = false;

  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const pi = pontos[i];
    const pj = pontos[j];

    const cruza = pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x;

    if (cruza) dentro = !dentro;
  }

  return dentro;
}

export function areaDoPoligono(pontos) {
  // Formula do cadarco (shoelace).
  let area = 0;

  for (let i = 0; i < pontos.length; i++) {
    const atual = pontos[i];
    const proximo = pontos[(i + 1) % pontos.length];
    area += atual.x * proximo.y - proximo.x * atual.y;
  }

  return area / 2;
}

export function retanguloDe(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    largura: Math.abs(b.x - a.x),
    altura: Math.abs(b.y - a.y),
  };
}

// ---------------------------------------------------------------------------
// MEDIDAS PARA MOSTRAR NA TELA
// ---------------------------------------------------------------------------

export function formatarMetros(valor) {
  if (Math.abs(valor) < 1) return `${Math.round(valor * 100)} cm`;
  return `${valor.toFixed(2).replace(/\.?0+$/, "")} m`;
}

export function formatarArea(valor) {
  return `${valor.toFixed(2).replace(/\.?0+$/, "")} m²`;
}
