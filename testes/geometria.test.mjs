// Testes da detecção automática de cômodos.
//
// Rodar com:  npm test
//
// Esta é a parte mais difícil do projeto e a que mais quebra em silêncio:
// um erro aqui não dá mensagem de erro, só faz o cômodo "sumir". Por isso
// ela tem teste e o resto não.

import {
  criarParede, areaDoPoligono,
} from "../publico/js/modelo.js";

import {
  comodoNoPonto, todosOsComodos, centroDoPoligono,
} from "../publico/js/geometria.js";

const P = (x, y) => ({ x, y });

// Liga uma sequência de pontos com paredes: paredes(A, B, C) faz A-B e B-C.
function paredes(...pontos) {
  const lista = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    lista.push(criarParede(pontos[i], pontos[i + 1]));
  }
  return lista;
}

const area = (poligono) => Math.abs(areaDoPoligono(poligono));

let passaram = 0;
let falharam = 0;

function conferir(nome, condicao, detalhe = "") {
  if (condicao) {
    passaram++;
    console.log(`  ok    ${nome}`);
  } else {
    falharam++;
    console.log(`  FALHA ${nome}${detalhe ? `  -> ${detalhe}` : ""}`);
  }
}

const perto = (a, b, tolerancia = 0.01) => Math.abs(a - b) <= tolerancia;

// ---------------------------------------------------------------------------

console.log("\nDeteccao de comodos\n");

{
  const els = paredes(P(0, 0), P(4, 0), P(4, 3), P(0, 3), P(0, 0));
  const c = comodoNoPonto(els, P(2, 1.5));

  conferir("sala 4x3 tem 4 cantos", c?.length === 4, `${c?.length}`);
  conferir("sala 4x3 tem 12 m2", perto(area(c), 12), `${area(c)}`);
  conferir("clique fora da sala nao acha nada", comodoNoPonto(els, P(10, 10)) === null);
}

{
  // Uma parede no MEIO das outras (encontro em T). Se as paredes nao forem
  // quebradas no ponto do T, o programa enxerga um comodo so de 24 m2.
  const els = [
    ...paredes(P(0, 0), P(6, 0), P(6, 4), P(0, 4), P(0, 0)),
    criarParede(P(3, 0), P(3, 4)),
  ];

  conferir("encontro em T: comodo da esquerda", perto(area(comodoNoPonto(els, P(1.5, 2))), 12));
  conferir("encontro em T: comodo da direita", perto(area(comodoNoPonto(els, P(4.5, 2))), 12));

  const todos = todosOsComodos(els).map((c) => c.area);
  conferir("encontro em T: sao dois comodos, nao um", todos.length === 2, `${todos.length}`);
  conferir("encontro em T: o contorno externo e descartado",
           todos.every((a) => perto(a, 12)), todos.join(", "));
}

{
  const els = paredes(P(0, 0), P(6, 0), P(6, 2), P(3, 2), P(3, 5), P(0, 5), P(0, 0));
  conferir("planta em L tem 21 m2", perto(area(comodoNoPonto(els, P(1, 1))), 21));
}

{
  const els = [criarParede(P(0, 0), P(4, 0)), criarParede(P(0, 2), P(4, 2))];
  conferir("paredes soltas nao formam comodo", comodoNoPonto(els, P(2, 1)) === null);
}

{
  // O canto nao fecha exatamente: sobra 5 mm. Tem que fechar mesmo assim,
  // senao desenhar a mao seria impossivel.
  const els = paredes(P(0, 0), P(4, 0), P(4, 3), P(0, 3));
  els.push(criarParede(P(0, 3), P(0.005, 0.002)));

  const c = comodoNoPonto(els, P(2, 1.5));
  conferir("canto torto por 5 mm ainda fecha", c !== null && perto(area(c), 12, 0.1));
}

{
  const els = paredes(P(0, 0), P(4, 0), P(4, 3), P(0, 3), P(0, 0));
  const centro = centroDoPoligono(comodoNoPonto(els, P(2, 1.5)));
  conferir("centro da sala 4x3 e (2, 1.5)", perto(centro.x, 2) && perto(centro.y, 1.5),
           `${centro.x}, ${centro.y}`);
}

{
  // Nao pode engasgar com planta grande: a deteccao roda a cada movimento
  // do mouse enquanto se desenha.
  const els = [];
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      els.push(criarParede(P(i * 3, j * 3), P(i * 3 + 3, j * 3)));
      els.push(criarParede(P(i * 3, j * 3), P(i * 3, j * 3 + 3)));
    }
  }

  const inicio = performance.now();
  const encontrados = todosOsComodos(els);
  const duracao = performance.now() - inicio;

  conferir("grade 12x12 acha 121 comodos", encontrados.length === 121, `${encontrados.length}`);
  conferir("grade 12x12 em menos de 100 ms", duracao < 100, `${duracao.toFixed(1)} ms`);
}

// ---------------------------------------------------------------------------

console.log(`\n${passaram} passaram, ${falharam} falharam\n`);
process.exit(falharam > 0 ? 1 : 0);
