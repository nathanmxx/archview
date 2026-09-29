// Deteccao automatica de comodos a partir das paredes.
//
// Esta e a parte mais esperta do projeto, e veio da versao em Godot
// (funcao _encontrar_poligono_fechado). A ideia:
//
//   1. Cada parede vira uma ARESTA de um grafo, e cada ponta vira um NO.
//      Paredes que terminam no mesmo lugar compartilham o mesmo no.
//
//   2. Para achar as regioes fechadas (as "faces" do grafo), caminhamos pelas
//      arestas sempre virando o maximo possivel para o mesmo lado. Andando
//      sempre "colado na parede da direita", fatalmente voltamos ao ponto de
//      partida tendo contornado exatamente uma regiao.
//
//   3. O comodo clicado e a MENOR regiao que contem o clique. Menor porque o
//      contorno externo da casa inteira tambem e uma regiao valida, e nao e
//      isso que a pessoa quer selecionar.
//
// O mesmo poligono que vira piso no 2D vira o chao do comodo no 3D.

import { TIPOS, areaDoPoligono, pontoDentroDoPoligono } from "./modelo.js";

// Pontas de parede mais proximas que isso (em metros) contam como o mesmo no.
// Sem essa tolerancia, duas paredes que "parecem" encostadas mas estao a
// 0,0001 m de distancia nunca fechariam um comodo.
const TOLERANCIA = 0.01;

// ---------------------------------------------------------------------------
// PASSO 0: PREPARAR AS PAREDES
// ---------------------------------------------------------------------------
// Antes de montar o grafo precisamos quebrar as paredes nos pontos onde elas
// se encontram no MEIO, e nao na ponta. Sem isso, dividir um comodo ao meio
// com uma parede nao cria dois comodos: a parede do meio fica "solta", porque
// a ponta dela cai no meio de outra parede e nunca vira um no compartilhado.
//
//      +--------+          +---+----+
//      |        |          |   |    |    <- so depois de quebrar a parede de
//      |   |    |   ==>    |   |    |       baixo e a de cima no ponto do T
//      +--------+          +---+----+       e que existem dois comodos

// Onde dois segmentos se cruzam, ou null se forem paralelos / nao se cruzarem.
function intersecaoDeSegmentos(p1, p2, p3, p4) {
  const denominador =
    (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);

  if (Math.abs(denominador) < 1e-12) return null; // paralelos

  const t =
    ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / denominador;
  const u =
    ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / denominador;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null; // cruzam fora dos segmentos

  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

function prepararSegmentos(elementos) {
  const brutos = [];

  for (const el of elementos) {
    if (el.tipo !== TIPOS.PAREDE) continue;
    if (Math.hypot(el.b.x - el.a.x, el.b.y - el.a.y) <= TOLERANCIA) continue;
    brutos.push({ a: { ...el.a }, b: { ...el.b } });
  }

  // Todo ponto que pode quebrar uma parede: as pontas de todas elas...
  const pontosDeQuebra = [];
  for (const s of brutos) pontosDeQuebra.push(s.a, s.b);

  // ...e os cruzamentos em X, quando duas paredes se atravessam.
  for (let i = 0; i < brutos.length; i++) {
    for (let j = i + 1; j < brutos.length; j++) {
      const cruzamento = intersecaoDeSegmentos(
        brutos[i].a, brutos[i].b, brutos[j].a, brutos[j].b,
      );
      if (cruzamento) pontosDeQuebra.push(cruzamento);
    }
  }

  // Agora cada parede e recortada em todos os pontos que caem em cima dela.
  const segmentos = [];

  for (const s of brutos) {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const comprimentoQuadrado = dx * dx + dy * dy;

    const cortes = [0, 1];

    for (const p of pontosDeQuebra) {
      // t = posicao do ponto ao longo da parede (0 = ponta a, 1 = ponta b).
      const t = ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / comprimentoQuadrado;
      if (t <= 0 || t >= 1) continue;

      // So corta se o ponto realmente estiver EM CIMA da parede.
      const emCima = { x: s.a.x + t * dx, y: s.a.y + t * dy };
      if (Math.hypot(p.x - emCima.x, p.y - emCima.y) > TOLERANCIA) continue;

      cortes.push(t);
    }

    cortes.sort((x, y) => x - y);

    for (let i = 0; i < cortes.length - 1; i++) {
      const t1 = cortes[i];
      const t2 = cortes[i + 1];
      if (t2 - t1 < 1e-9) continue; // corte repetido

      segmentos.push({
        a: { x: s.a.x + t1 * dx, y: s.a.y + t1 * dy },
        b: { x: s.a.x + t2 * dx, y: s.a.y + t2 * dy },
      });
    }
  }

  return segmentos;
}

// ---------------------------------------------------------------------------
// PASSO 1: MONTAR O GRAFO
// ---------------------------------------------------------------------------

function montarGrafo(elementos) {
  const grafo = new Map();

  // Baldes espaciais: em vez de comparar um ponto novo com todos os nos ja
  // existentes, so olhamos os baldes vizinhos. Fica rapido mesmo com muita
  // parede, e mais confiavel do que arredondar a coordenada (dois pontos
  // colados podem cair em lados opostos do arredondamento).
  const baldes = new Map();
  const balde = (p) =>
    `${Math.floor(p.x / TOLERANCIA)}:${Math.floor(p.y / TOLERANCIA)}`;

  let proximaChave = 0;

  const garantirNo = (p) => {
    const cx = Math.floor(p.x / TOLERANCIA);
    const cy = Math.floor(p.y / TOLERANCIA);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const chave of baldes.get(`${cx + dx}:${cy + dy}`) ?? []) {
          const no = grafo.get(chave);
          if (Math.hypot(no.ponto.x - p.x, no.ponto.y - p.y) <= TOLERANCIA) {
            return chave;
          }
        }
      }
    }

    const chave = `n${proximaChave++}`;
    grafo.set(chave, { ponto: { ...p }, vizinhos: [] });

    const nomeBalde = balde(p);
    if (!baldes.has(nomeBalde)) baldes.set(nomeBalde, []);
    baldes.get(nomeBalde).push(chave);

    return chave;
  };

  for (const s of prepararSegmentos(elementos)) {
    const chaveA = garantirNo(s.a);
    const chaveB = garantirNo(s.b);
    if (chaveA === chaveB) continue;

    const noA = grafo.get(chaveA);
    const noB = grafo.get(chaveB);

    if (!noA.vizinhos.includes(chaveB)) noA.vizinhos.push(chaveB);
    if (!noB.vizinhos.includes(chaveA)) noB.vizinhos.push(chaveA);
  }

  return grafo;
}

// Estando no no "atual" e tendo vindo de "anterior", qual vizinho seguir?
// Resposta: o que exige o maior giro no sentido anti-horario a partir do
// caminho de volta. E isso que faz a caminhada contornar sempre a mesma face.
function proximoNoDaFace(grafo, anterior, atual) {
  const noAtual = grafo.get(atual);
  const noAnterior = grafo.get(anterior);

  const anguloDeVolta = Math.atan2(
    noAnterior.ponto.y - noAtual.ponto.y,
    noAnterior.ponto.x - noAtual.ponto.x,
  );

  let escolhido = null;
  let maiorGiro = -1;

  for (const vizinho of noAtual.vizinhos) {
    const noVizinho = grafo.get(vizinho);

    const angulo = Math.atan2(
      noVizinho.ponto.y - noAtual.ponto.y,
      noVizinho.ponto.x - noAtual.ponto.x,
    );

    // Normaliza o giro para o intervalo [0, 2pi).
    let giro = (angulo - anguloDeVolta) % (Math.PI * 2);
    if (giro < 0) giro += Math.PI * 2;

    if (giro > maiorGiro) {
      maiorGiro = giro;
      escolhido = vizinho;
    }
  }

  return escolhido;
}

function percorrerFace(grafo, origem, destino, direcoesVisitadas) {
  const pontos = [];
  const direcoesLocais = new Set();

  let anterior = origem;
  let atual = destino;

  // O limite existe so por seguranca: uma planta maluca nao pode travar a aba.
  for (let protecao = 0; protecao < 2000; protecao++) {
    const estado = `${anterior}|${atual}`;
    if (direcoesLocais.has(estado)) return null;
    direcoesLocais.add(estado);

    pontos.push({ ...grafo.get(anterior).ponto });

    const proximo = proximoNoDaFace(grafo, anterior, atual);
    if (!proximo) return null;

    // Fechou o ciclo: voltamos ao par (origem -> destino) que iniciou tudo.
    if (atual === origem && proximo === destino) {
      for (const direcao of direcoesLocais) direcoesVisitadas.add(direcao);
      return pontos;
    }

    anterior = atual;
    atual = proximo;
  }

  return null;
}

// Devolve todas as regioes fechadas formadas pelas paredes.
export function extrairFaces(elementos) {
  const grafo = montarGrafo(elementos);
  const direcoesVisitadas = new Set();
  const faces = [];

  for (const [origem, no] of grafo) {
    for (const destino of no.vizinhos) {
      if (direcoesVisitadas.has(`${origem}|${destino}`)) continue;

      const face = percorrerFace(grafo, origem, destino, direcoesVisitadas);
      if (face && face.length >= 3) faces.push(face);
    }
  }

  return faces;
}

// A menor regiao fechada que contem o ponto clicado.
export function comodoNoPonto(elementos, ponto) {
  let melhor = null;
  let menorArea = Infinity;

  for (const face of extrairFaces(elementos)) {
    if (face.length < 3) continue;
    if (!pontoDentroDoPoligono(ponto, face)) continue;

    // Area positiva = comodo de verdade. Negativa = contorno externo da casa,
    // que tambem "contem" o clique mas nao e o que a pessoa quer selecionar.
    const area = areaDoPoligono(face);

    // Areas minusculas sao lixo numerico, nao comodos.
    if (area > 0.05 && area < menorArea) {
      menorArea = area;
      melhor = face;
    }
  }

  return melhor;
}

// Todas as regioes fechadas, ja sem o contorno externo da casa.
// Serve para o 3D saber onde por chao e para mostrar a metragem de cada comodo.
export function todosOsComodos(elementos) {
  // Truque: a area "com sinal" (formula do cadarco) sai POSITIVA para os
  // comodos de dentro e NEGATIVA para o contorno externo da casa, porque a
  // caminhada percorre um no sentido contrario do outro. Entao para descartar
  // o contorno externo basta olhar o sinal - nada de chutar por tamanho.
  return extrairFaces(elementos)
    .filter((f) => f.length >= 3)
    .map((f) => ({ pontos: f, area: areaDoPoligono(f) }))
    .filter((f) => f.area > 0.05);
}

// Centro aproximado de um poligono: serve para escrever o nome e a metragem
// do comodo no meio dele.
export function centroDoPoligono(pontos) {
  let x = 0;
  let y = 0;

  for (const p of pontos) {
    x += p.x;
    y += p.y;
  }

  return { x: x / pontos.length, y: y / pontos.length };
}
