// Gera a planta de demonstração usada na feira.
//
// Rodar com:  npm run exemplo
//
// Produz um apartamento de 80 m² já mobiliado, MENOS um quarto, que fica
// vazio de propósito: é nele que vocês desenham ao vivo durante a
// apresentação. Assim o avaliador vê algo pronto nos primeiros segundos e
// mesmo assim assiste o sistema sendo usado de verdade.
//
// É um script e não um JSON escrito à mão porque ele usa os construtores
// reais do projeto (modelo.js e moveis.js). Se o formato dos elementos
// mudar, basta rodar de novo em vez de corrigir 50 objetos na unha.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  criarParede, criarPiso, criarPorta, criarJanela, criarTexto, criarMovel,
  plantaVazia,
} from "../publico/js/modelo.js";

import { movelPorChave } from "../publico/js/moveis.js";
import { todosOsComodos } from "../publico/js/geometria.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(RAIZ, "exemplos", "apartamento-demonstracao.archview.json");

const planta = plantaVazia();
const adicionar = (el) => { planta.elementos.push(el); return el; };

// ---------------------------------------------------------------------------
// PAREDES
// ---------------------------------------------------------------------------
// Apartamento de 10 x 8 m dividido assim:
//
//   +---------------------+-----------------+
//   |                     |                 |
//   |       SALA          |     COZINHA     |
//   |                     |                 |
//   +--------+------------+-----------------+   <- parede em y = 4,5
//   |        |            |                 |
//   | QUARTO | QUARTO 2   |    BANHEIRO     |
//   |   1    | (vazio)    |                 |
//   +--------+------------+-----------------+
//          x=4         x=7

const P = (x, y) => ({ x, y });

// contorno externo
const externas = [
  adicionar(criarParede(P(0, 0), P(10, 0))),   // 0 topo
  adicionar(criarParede(P(10, 0), P(10, 8))),  // 1 direita
  adicionar(criarParede(P(10, 8), P(0, 8))),   // 2 baixo
  adicionar(criarParede(P(0, 8), P(0, 0))),    // 3 esquerda
];

// divisórias internas
const corredor = adicionar(criarParede(P(0, 4.5), P(10, 4.5)));
const salaCozinha = adicionar(criarParede(P(5.5, 0), P(5.5, 4.5)));
const q1q2 = adicionar(criarParede(P(4, 4.5), P(4, 8)));
const q2banheiro = adicionar(criarParede(P(7, 4.5), P(7, 8)));

// ---------------------------------------------------------------------------
// PORTAS E JANELAS
// ---------------------------------------------------------------------------
// Cada abertura mora numa parede: guardamos o id dela para que, se alguém
// arrastar a parede no editor, a porta acompanhe.

function abertura(criar, parede, de, ate) {
  const el = adicionar(criar(de, ate));
  el.parede = parede.id;
  return el;
}

// portas (0,80 m)
abertura(criarPorta, externas[3], P(0, 1.6), P(0, 2.5));      // entrada
abertura(criarPorta, salaCozinha, P(5.5, 3.1), P(5.5, 3.9));  // sala -> cozinha
abertura(criarPorta, corredor, P(1.6, 4.5), P(2.4, 4.5));     // sala -> quarto 1
abertura(criarPorta, corredor, P(4.6, 4.5), P(5.4, 4.5));     // sala -> quarto 2
abertura(criarPorta, corredor, P(8.1, 4.5), P(8.9, 4.5));     // cozinha -> banheiro

// janelas
abertura(criarJanela, externas[0], P(1.2, 0), P(2.8, 0));     // sala
abertura(criarJanela, externas[0], P(7.0, 0), P(8.4, 0));     // cozinha
abertura(criarJanela, externas[2], P(2.6, 8), P(1.2, 8));     // quarto 1
abertura(criarJanela, externas[2], P(6.4, 8), P(5.0, 8));     // quarto 2
const basculante = abertura(criarJanela, externas[1], P(10, 5.4), P(10, 6.4));
basculante.peitoril = 1.6; // banheiro: janela alta

// ---------------------------------------------------------------------------
// CÔMODOS (nome e cor)
// ---------------------------------------------------------------------------

const comodos = [
  ["Sala",      P(2.5, 2.2), "#d9d4c9"],
  ["Cozinha",   P(7.7, 2.2), "#cfd7d9"],
  ["Quarto 1",  P(2.0, 6.2), "#dacfbd"],
  ["Quarto 2",  P(5.5, 6.2), "#e7e3da"],  // o que fica vazio
  ["Banheiro",  P(8.5, 6.2), "#c7d3db"],
];

for (const [nome, ponto, cor] of comodos) {
  const piso = adicionar(criarPiso(ponto, cor));
  piso.nome = nome;
}

// ---------------------------------------------------------------------------
// MÓVEIS
// ---------------------------------------------------------------------------
// rotacao 0 = frente virada para cima (-y). 180 vira para baixo,
// 90 para a direita, 270 para a esquerda.

function movel(chave, ponto, rotacao = 0) {
  const definicao = movelPorChave(chave);
  if (!definicao) throw new Error(`Movel desconhecido: ${chave}`);

  const el = adicionar(criarMovel(ponto, definicao));
  el.rotacao = rotacao;
  return el;
}

// Sala
movel("sofa",        P(2.5, 0.62), 180);
movel("mesa_centro", P(2.5, 2.30), 0);
movel("rack_tv",     P(2.5, 4.20), 0);
movel("poltrona",    P(4.70, 2.30), 270);

// Cozinha
movel("bancada",     P(6.55, 0.42), 180);
movel("fogao",       P(7.75, 0.42), 180);
movel("geladeira",   P(8.80, 0.47), 180);
movel("mesa_jantar", P(7.70, 2.90), 0);
movel("cadeira",     P(7.10, 2.05), 180);
movel("cadeira",     P(8.30, 2.05), 180);
movel("cadeira",     P(7.10, 3.75), 0);
movel("cadeira",     P(8.30, 3.75), 0);

// Quarto 1
movel("cama_casal",   P(1.30, 5.60), 0);
movel("criado_mudo",  P(2.35, 4.85), 0);
movel("guarda_roupa", P(1.50, 7.62), 0);

// Quarto 2 fica VAZIO de propósito. É o espaço da apresentação ao vivo.
const aviso = adicionar(criarTexto(P(4.35, 6.3), "Espaço livre"));
aviso.tamanho = 0.26;
aviso.cor = "#8a7a52";

// Banheiro
movel("box",          P(9.40, 5.05), 0);
movel("vaso",         P(7.40, 7.30), 270);
movel("pia_banheiro", P(8.80, 7.68), 0);

// ---------------------------------------------------------------------------
// CONFERÊNCIA E GRAVAÇÃO
// ---------------------------------------------------------------------------

const encontrados = todosOsComodos(planta.elementos);

console.log("\nPlanta de demonstracao\n");
for (const c of encontrados.sort((a, b) => b.area - a.area)) {
  console.log(`  ${c.area.toFixed(2).padStart(6)} m2`);
}

const total = encontrados.reduce((s, c) => s + c.area, 0);
console.log(`  ${"-".repeat(9)}`);
console.log(`  ${total.toFixed(2).padStart(6)} m2 em ${encontrados.length} comodos`);

if (encontrados.length !== comodos.length) {
  console.error(
    `\nERRO: esperava ${comodos.length} comodos fechados, achei ${encontrados.length}.` +
    `\nAlguma parede nao esta fechando o contorno.\n`,
  );
  process.exit(1);
}

mkdirSync(dirname(SAIDA), { recursive: true });

writeFileSync(SAIDA, JSON.stringify({
  formato: "archview",
  versao: 1,
  nome: "Apartamento 80 m² — demonstração",
  exportadoEm: new Date().toISOString(),
  planta,
}, null, 1));

const conta = {};
for (const el of planta.elementos) conta[el.tipo] = (conta[el.tipo] ?? 0) + 1;

console.log(`\n  ${JSON.stringify(conta)}`);
console.log(`\n  gravado em ${SAIDA}\n`);
