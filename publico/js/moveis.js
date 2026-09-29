// Catalogo de moveis.
//
// Cada movel e DADO, nao codigo. Um movel novo e um objeto novo nesta lista,
// e ele aparece sozinho no painel do 2D e na cena 3D. Ninguem precisa mexer
// no editor nem no renderizador pra adicionar uma cadeira.
//
// Medidas em metros, proximas das reais (uma cama de casal e 1,38 x 1,88).
//
// "pecas" descreve o movel em 3D como um monte de caixas. O sistema de
// coordenadas de cada peca:
//   x -> ao longo da LARGURA   (0 = centro)
//   y -> ao longo da PROFUNDIDADE (0 = centro)
//   z -> ALTURA a partir do chao (0 = chao)
// e cada peca tem tamanho (l, p, a) e posicao do seu centro em x/y, com z
// medindo a base. Assim uma mesa e um tampo alto + quatro pes.

function caixa(x, y, z, l, p, a, cor) {
  return { x, y, z, l, p, a, cor };
}

// Gera os 4 pes de uma mesa/cadeira, recuados das bordas.
function pes(largura, profundidade, altura, espessura, cor) {
  const dx = largura / 2 - espessura / 2 - 0.03;
  const dy = profundidade / 2 - espessura / 2 - 0.03;

  return [
    caixa(-dx, -dy, 0, espessura, espessura, altura, cor),
    caixa(dx, -dy, 0, espessura, espessura, altura, cor),
    caixa(-dx, dy, 0, espessura, espessura, altura, cor),
    caixa(dx, dy, 0, espessura, espessura, altura, cor),
  ];
}

const MADEIRA = "#8b6b4a";
const MADEIRA_ESCURA = "#5e4630";
const TECIDO = "#5b6b84";
const BRANCO = "#e4e6e8";
const METAL = "#b9bfc6";
const VIDRO = "#7fb7cf";

export const CATALOGO = [
  // --- Quarto --------------------------------------------------------------
  {
    chave: "cama_casal", nome: "Cama de casal", categoria: "Quarto",
    largura: 1.38, profundidade: 1.88, altura: 0.5, cor: "#6d7f9c",
    pecas: [
      caixa(0, 0, 0.2, 1.38, 1.88, 0.15, TECIDO),          // colchao
      caixa(0, 0, 0, 1.38, 1.88, 0.2, MADEIRA_ESCURA),      // base
      caixa(0, -0.94, 0.35, 1.38, 0.06, 0.45, MADEIRA),     // cabeceira
      caixa(-0.4, -0.7, 0.35, 0.5, 0.35, 0.08, BRANCO),     // travesseiros
      caixa(0.4, -0.7, 0.35, 0.5, 0.35, 0.08, BRANCO),
    ],
  },
  {
    chave: "cama_solteiro", nome: "Cama de solteiro", categoria: "Quarto",
    largura: 0.88, profundidade: 1.88, altura: 0.5, cor: "#6d7f9c",
    pecas: [
      caixa(0, 0, 0.2, 0.88, 1.88, 0.15, TECIDO),
      caixa(0, 0, 0, 0.88, 1.88, 0.2, MADEIRA_ESCURA),
      caixa(0, -0.94, 0.35, 0.88, 0.06, 0.45, MADEIRA),
      caixa(0, -0.7, 0.35, 0.5, 0.35, 0.08, BRANCO),
    ],
  },
  {
    chave: "guarda_roupa", nome: "Guarda-roupa", categoria: "Quarto",
    largura: 1.8, profundidade: 0.6, altura: 2.2, cor: "#7a6047",
    pecas: [
      caixa(0, 0, 0, 1.8, 0.6, 2.2, MADEIRA),
      caixa(-0.01, -0.31, 0.1, 0.03, 0.02, 2.0, METAL),     // fresta das portas
    ],
  },
  {
    chave: "criado_mudo", nome: "Criado-mudo", categoria: "Quarto",
    largura: 0.45, profundidade: 0.4, altura: 0.55, cor: "#7a6047",
    pecas: [caixa(0, 0, 0, 0.45, 0.4, 0.55, MADEIRA)],
  },

  // --- Sala ----------------------------------------------------------------
  {
    chave: "sofa", nome: "Sofa 3 lugares", categoria: "Sala",
    largura: 2.1, profundidade: 0.9, altura: 0.85, cor: "#5b6b84",
    pecas: [
      caixa(0, 0.1, 0, 2.1, 0.7, 0.42, TECIDO),             // assento
      caixa(0, -0.33, 0, 2.1, 0.24, 0.85, TECIDO),          // encosto
      caixa(-1.0, 0, 0.42, 0.14, 0.9, 0.24, TECIDO),        // bracos
      caixa(1.0, 0, 0.42, 0.14, 0.9, 0.24, TECIDO),
    ],
  },
  {
    chave: "poltrona", nome: "Poltrona", categoria: "Sala",
    largura: 0.85, profundidade: 0.85, altura: 0.85, cor: "#5b6b84",
    pecas: [
      caixa(0, 0.1, 0, 0.85, 0.65, 0.42, TECIDO),
      caixa(0, -0.3, 0, 0.85, 0.24, 0.85, TECIDO),
    ],
  },
  {
    chave: "mesa_centro", nome: "Mesa de centro", categoria: "Sala",
    largura: 1.0, profundidade: 0.55, altura: 0.42, cor: "#8b6b4a",
    pecas: [
      caixa(0, 0, 0.36, 1.0, 0.55, 0.06, MADEIRA),
      ...pes(1.0, 0.55, 0.36, 0.06, MADEIRA_ESCURA),
    ],
  },
  {
    chave: "rack_tv", nome: "Rack com TV", categoria: "Sala",
    largura: 1.6, profundidade: 0.4, altura: 1.2, cor: "#4a4a4f",
    pecas: [
      caixa(0, 0, 0, 1.6, 0.4, 0.45, MADEIRA_ESCURA),       // rack
      caixa(0, 0, 0.52, 1.2, 0.05, 0.68, "#23262b"),        // tela
      caixa(0, 0, 0.45, 0.3, 0.2, 0.07, "#33373d"),         // pe da TV
    ],
  },

  // --- Cozinha e jantar ----------------------------------------------------
  {
    chave: "mesa_jantar", nome: "Mesa de jantar", categoria: "Cozinha",
    largura: 1.6, profundidade: 0.9, altura: 0.76, cor: "#8b6b4a",
    pecas: [
      caixa(0, 0, 0.7, 1.6, 0.9, 0.06, MADEIRA),
      ...pes(1.6, 0.9, 0.7, 0.08, MADEIRA_ESCURA),
    ],
  },
  {
    chave: "cadeira", nome: "Cadeira", categoria: "Cozinha",
    largura: 0.45, profundidade: 0.45, altura: 0.9, cor: "#8b6b4a",
    pecas: [
      caixa(0, 0, 0.42, 0.45, 0.45, 0.05, MADEIRA),
      caixa(0, -0.2, 0.47, 0.45, 0.05, 0.43, MADEIRA),
      ...pes(0.45, 0.45, 0.42, 0.04, MADEIRA_ESCURA),
    ],
  },
  {
    chave: "geladeira", nome: "Geladeira", categoria: "Cozinha",
    largura: 0.7, profundidade: 0.7, altura: 1.8, cor: "#c8ccd0",
    pecas: [
      caixa(0, 0, 0, 0.7, 0.7, 1.8, "#c8ccd0"),
      caixa(0.3, -0.36, 0.6, 0.04, 0.03, 0.5, METAL),       // puxador
    ],
  },
  {
    chave: "fogao", nome: "Fogao", categoria: "Cozinha",
    largura: 0.76, profundidade: 0.6, altura: 0.9, cor: "#3a3d42",
    pecas: [
      caixa(0, 0, 0, 0.76, 0.6, 0.88, "#3a3d42"),
      caixa(0, 0, 0.88, 0.76, 0.6, 0.03, "#1d1f22"),        // mesa do fogao
    ],
  },
  {
    chave: "bancada", nome: "Bancada / pia", categoria: "Cozinha",
    largura: 1.5, profundidade: 0.6, altura: 0.9, cor: "#9aa1a8",
    pecas: [
      caixa(0, 0, 0, 1.5, 0.6, 0.85, BRANCO),
      caixa(0, 0, 0.85, 1.5, 0.6, 0.05, "#9aa1a8"),
      caixa(0.45, 0, 0.9, 0.4, 0.35, 0.02, METAL),          // cuba
    ],
  },

  // --- Banheiro ------------------------------------------------------------
  {
    chave: "vaso", nome: "Vaso sanitario", categoria: "Banheiro",
    largura: 0.38, profundidade: 0.68, altura: 0.78, cor: "#e4e6e8",
    pecas: [
      caixa(0, 0.08, 0, 0.38, 0.5, 0.4, BRANCO),
      caixa(0, -0.28, 0, 0.36, 0.18, 0.78, BRANCO),         // caixa acoplada
    ],
  },
  {
    chave: "pia_banheiro", nome: "Pia de banheiro", categoria: "Banheiro",
    largura: 0.6, profundidade: 0.45, altura: 0.85, cor: "#e4e6e8",
    pecas: [
      caixa(0, 0, 0.75, 0.6, 0.45, 0.12, BRANCO),
      caixa(0, -0.15, 0.87, 0.04, 0.04, 0.16, METAL),       // torneira
    ],
  },
  {
    chave: "box", nome: "Box do chuveiro", categoria: "Banheiro",
    largura: 0.9, profundidade: 0.9, altura: 1.9, cor: "#7fb7cf",
    pecas: [
      caixa(0, 0, 0, 0.9, 0.9, 0.06, "#c9ced3"),            // base
      caixa(0, 0.45, 0.06, 0.9, 0.03, 1.84, VIDRO),         // vidros
      caixa(0.45, 0, 0.06, 0.03, 0.9, 1.84, VIDRO),
      caixa(-0.3, -0.3, 1.8, 0.2, 0.2, 0.05, METAL),        // chuveiro
    ],
  },

  // --- Geral ---------------------------------------------------------------
  {
    chave: "escrivaninha", nome: "Escrivaninha", categoria: "Geral",
    largura: 1.2, profundidade: 0.6, altura: 0.76, cor: "#8b6b4a",
    pecas: [
      caixa(0, 0, 0.7, 1.2, 0.6, 0.06, MADEIRA),
      ...pes(1.2, 0.6, 0.7, 0.06, MADEIRA_ESCURA),
    ],
  },
  {
    chave: "estante", nome: "Estante", categoria: "Geral",
    largura: 0.9, profundidade: 0.35, altura: 1.8, cor: "#7a6047",
    pecas: [
      caixa(-0.43, 0, 0, 0.04, 0.35, 1.8, MADEIRA),         // laterais
      caixa(0.43, 0, 0, 0.04, 0.35, 1.8, MADEIRA),
      caixa(0, 0, 0, 0.9, 0.35, 0.04, MADEIRA),             // prateleiras
      caixa(0, 0, 0.45, 0.9, 0.35, 0.04, MADEIRA),
      caixa(0, 0, 0.9, 0.9, 0.35, 0.04, MADEIRA),
      caixa(0, 0, 1.35, 0.9, 0.35, 0.04, MADEIRA),
      caixa(0, 0, 1.76, 0.9, 0.35, 0.04, MADEIRA),
    ],
  },
];

export const CATEGORIAS = [...new Set(CATALOGO.map((m) => m.categoria))];

const PORCHAVE = new Map(CATALOGO.map((m) => [m.chave, m]));

export function movelPorChave(chave) {
  return PORCHAVE.get(chave) ?? null;
}
