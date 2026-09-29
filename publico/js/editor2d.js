// Editor 2D: desenha a planta num <canvas> e trata o mouse e o teclado.
//
// Tudo que aparece aqui sai da lista "planta.elementos" do modelo.js.
// Esta classe nao inventa dado nenhum: ela desenha o que existe e edita
// a mesma lista que o 3D e o banco usam.
//
// Conversao de coordenadas: o modelo guarda METROS, o canvas desenha PIXELS.
// A camera faz a ponte (posicao em metros + escala em pixels por metro).

import {
  TIPOS, ORDEM_DESENHO, ORDEM_SELECAO,
  criarParede, criarPiso, criarPorta, criarJanela, criarTexto, criarMovel,
  LARGURA_PORTA, LARGURA_JANELA,
  distancia, pontoMaisProximoDoSegmento, pontoDentroDoPoligono,
  retanguloDe, formatarMetros, formatarArea,
  ajustarContadorId,
} from "./modelo.js";

import { comodoNoPonto, todosOsComodos, centroDoPoligono } from "./geometria.js";
import { movelPorChave } from "./moveis.js";

export const FERRAMENTAS = {
  SELECIONAR: "selecionar",
  PAREDE: "parede",
  QUARTO: "quarto",     // arrasta um retangulo e sai com 4 paredes + piso
  PISO: "piso",         // clica dentro de paredes fechadas e detecta o comodo
  PORTA: "porta",
  JANELA: "janela",
  MOVEL: "movel",
  TEXTO: "texto",
  PINTAR: "pintar",
  APAGAR: "apagar",
};

const CORES = {
  fundo: "#f4f2ee",
  gradeFina: "rgba(90, 105, 125, 0.13)",
  gradeGrossa: "rgba(90, 105, 125, 0.28)",
  eixoX: "rgba(200, 60, 60, 0.55)",
  eixoY: "rgba(40, 150, 70, 0.55)",
  regua: "rgba(70, 85, 100, 0.75)",
  parede: "#2b2b2b",
  selecao: "#2f8fd6",
  apagar: "#e04545",
  previa: "#2f8fd6",
  cota: "#1d5d86",
  nomeComodo: "rgba(40, 55, 70, 0.75)",
};

// Passos de grade aceitos, em metros. O editor escolhe sozinho qual usar
// conforme o zoom, pra grade nunca virar sopa de linhas nem sumir.
//
// Cada passo vem com o seu "forte": de quanto em quanto a linha fica mais
// escura e ganha o numero na regua. O forte SEMPRE cai numa medida redonda
// (1 m, 5 m, 10 m...). Se fosse simplesmente "a cada 5 linhas", com passo de
// 25 cm a regua marcaria 1,25 / 2,50 / 3,75 - inutil para arquitetura.
const PASSOS = [
  { passo: 0.1, forte: 0.5 },
  { passo: 0.25, forte: 1 },
  { passo: 0.5, forte: 1 },
  { passo: 1, forte: 5 },
  { passo: 2, forte: 10 },
  { passo: 5, forte: 25 },
  { passo: 10, forte: 50 },
  { passo: 20, forte: 100 },
  { passo: 50, forte: 250 },
];

export class Editor2D {
  constructor(canvas, planta, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.planta = planta;
    this.callbacks = callbacks;

    // Camera: que ponto do mundo (em metros) esta no centro da tela,
    // e quantos pixels vale 1 metro.
    this.camera = { x: 4, y: 3, escala: 60 };

    this.ferramenta = FERRAMENTAS.SELECIONAR;
    this.snap = 0.25;               // metros
    this.mostrarGrade = true;
    this.mostrarCotas = true;
    this.corAtual = "#d6d2cb";
    this.textoAtual = "Texto";
    this.movelAtual = "cama_casal";

    this.selecionado = null;        // id do elemento
    this.emHover = null;            // id, usado pela borracha
    this.ponteiro = { x: 0, y: 0 }; // posicao do mouse em metros, ja com snap

    // Estado de desenho / arraste
    this.desenho = null;            // { inicio }
    this.arraste = null;            // { id, ultimo, alca }
    this.arrastandoCamera = null;
    this.shift = false;

    this.historico = [];
    this.refazer = [];

    this._ligarEventos();
    this._ajustarTamanho();
  }

  // -------------------------------------------------------------------------
  // COORDENADAS
  // -------------------------------------------------------------------------

  mundoParaTela(p) {
    const meio = this._meio();
    return {
      x: meio.x + (p.x - this.camera.x) * this.camera.escala,
      y: meio.y + (p.y - this.camera.y) * this.camera.escala,
    };
  }

  telaParaMundo(px, py) {
    const meio = this._meio();
    return {
      x: this.camera.x + (px - meio.x) / this.camera.escala,
      y: this.camera.y + (py - meio.y) / this.camera.escala,
    };
  }

  // clientWidth so funciona em elemento que esta na pagina. Na hora de
  // exportar PNG desenhamos num canvas fora da tela, e la vale o width.
  _tamanho() {
    return {
      largura: this.canvas.clientWidth || this.canvas.width,
      altura: this.canvas.clientHeight || this.canvas.height,
    };
  }

  _meio() {
    const { largura, altura } = this._tamanho();
    return { x: largura / 2, y: altura / 2 };
  }

  // Encaixe em duas etapas.
  //
  // 1) Ponta de parede: se o cursor esta perto do fim de uma parede que ja
  //    existe, gruda exatamente nela. Isso e o que permite fechar um comodo
  //    de verdade - a deteccao exige que as pontas se encontrem dentro de
  //    1 cm, e so a grade nao garante isso (com o encaixe em "Livre", nem
  //    chegava perto).
  // 2) Grade, como antes.
  //
  // A ponta ganha da grade de proposito: encostar numa parede existente e
  // quase sempre a intencao, e e o que a grade sozinha nao resolve.
  _encaixar(p) {
    const ponta = this._pontaDeParedePerto(p);

    if (ponta) {
      this._encaixeEmPonta = ponta;
      return { ...ponta };
    }

    this._encaixeEmPonta = null;

    if (!this.snap) return p;

    return {
      x: Math.round(p.x / this.snap) * this.snap,
      y: Math.round(p.y / this.snap) * this.snap,
    };
  }

  // A ponta de parede mais proxima dentro de um raio fixo NA TELA, para o
  // encaixe ter sempre a mesma "pegada" em qualquer zoom.
  _pontaDeParedePerto(p) {
    const raio = 11 / this.camera.escala;

    // Nao encaixar no proprio elemento que esta sendo arrastado: a parede
    // colapsaria em cima de si mesma.
    const idIgnorado = this.arraste?.id ?? null;

    let melhor = null;
    let menor = raio;

    for (const el of this.elementos) {
      if (el.tipo !== TIPOS.PAREDE || el.id === idIgnorado) continue;

      for (const ponta of [el.a, el.b]) {
        const d = distancia(p, ponta);
        if (d < menor) { menor = d; melhor = ponta; }
      }
    }

    // Tambem encaixa no ponto onde a parede atual comecou, pra fechar o
    // contorno exatamente onde se iniciou o desenho.
    if (this.desenho) {
      const d = distancia(p, this.desenho.inicio);
      if (d < menor) { menor = d; melhor = this.desenho.inicio; }
    }

    return melhor;
  }

  // Com Shift, prende a parede em 0/45/90 graus a partir do inicio.
  _encaixarAngulo(inicio, fim) {
    if (!this.shift) return fim;

    const dx = fim.x - inicio.x;
    const dy = fim.y - inicio.y;
    const comprimento = Math.hypot(dx, dy);
    if (comprimento === 0) return fim;

    const passo = Math.PI / 4;
    const angulo = Math.round(Math.atan2(dy, dx) / passo) * passo;

    return {
      x: inicio.x + Math.cos(angulo) * comprimento,
      y: inicio.y + Math.sin(angulo) * comprimento,
    };
  }

  // -------------------------------------------------------------------------
  // HISTORICO (desfazer / refazer)
  // -------------------------------------------------------------------------
  // Guardamos uma copia da planta inteira antes de cada mudanca. Para uma
  // planta de casa isso e barato e e MUITO mais simples do que guardar
  // "qual acao foi feita e como desfaze-la" uma por uma.

  // "instantaneo" permite guardar um estado capturado ANTES da acao, e nao o
  // de agora. Serve pro arraste: a copia e tirada quando o mouse desce, mas
  // so entra no historico se a pessoa realmente mover alguma coisa.
  registrarHistorico(instantaneo = null) {
    this.historico.push(instantaneo ?? JSON.stringify(this.planta.elementos));
    if (this.historico.length > 60) this.historico.shift();
    this.refazer.length = 0;
  }

  // Chamado no comeco de cada arraste de verdade. Se a pessoa so clicou pra
  // selecionar e nao arrastou nada, o historico nunca e tocado - senao cada
  // clique gastaria um Ctrl+Z, e desfazer pararia de parecer que funciona.
  _registrarArrasteUmaVez() {
    if (!this.arraste || this.arraste.registrado) return;

    this.registrarHistorico(this.arraste.instantaneo);
    this.arraste.registrado = true;
  }

  desfazer() {
    if (this.historico.length === 0) return;

    this.refazer.push(JSON.stringify(this.planta.elementos));
    this.planta.elementos = JSON.parse(this.historico.pop());
    ajustarContadorId(this.planta.elementos);

    this.selecionado = null;
    this._mudou();
  }

  refazerAcao() {
    if (this.refazer.length === 0) return;

    this.historico.push(JSON.stringify(this.planta.elementos));
    this.planta.elementos = JSON.parse(this.refazer.pop());
    ajustarContadorId(this.planta.elementos);

    this.selecionado = null;
    this._mudou();
  }

  _mudou() {
    this.callbacks.aoMudar?.();
    this.callbacks.aoSelecionar?.(this.elementoSelecionado());
    this.redesenhar();
  }

  // -------------------------------------------------------------------------
  // ACESSO AOS ELEMENTOS
  // -------------------------------------------------------------------------

  get elementos() { return this.planta.elementos; }

  elementoPorId(id) {
    return this.elementos.find((el) => el.id === id) ?? null;
  }

  elementoSelecionado() {
    return this.selecionado == null ? null : this.elementoPorId(this.selecionado);
  }

  adicionar(elemento) {
    this.registrarHistorico();
    this.elementos.push(elemento);
    this.selecionado = elemento.id;
    this._mudou();
    return elemento;
  }

  remover(id) {
    const indice = this.elementos.findIndex((el) => el.id === id);
    if (indice < 0) return;

    this.registrarHistorico();
    this.elementos.splice(indice, 1);

    if (this.selecionado === id) this.selecionado = null;
    if (this.emHover === id) this.emHover = null;

    this._mudou();
  }

  definirFerramenta(ferramenta) {
    this.ferramenta = ferramenta;
    this.desenho = null;
    this.arraste = null;
    this.emHover = null;
    this.callbacks.aoTrocarFerramenta?.(ferramenta);
    this.redesenhar();
  }

  // -------------------------------------------------------------------------
  // SELECAO / ACERTO
  // -------------------------------------------------------------------------

  // Tolerancia de clique: 8 pixels convertidos para metros. Assim a area
  // clicavel tem sempre o mesmo tamanho na tela, independente do zoom.
  _folga() { return 8 / this.camera.escala; }

  _elementoNoPonto(p, filtro = null) {
    for (const tipo of ORDEM_SELECAO) {
      // De tras pra frente: o ultimo desenhado esta por cima, entao ganha.
      for (let i = this.elementos.length - 1; i >= 0; i--) {
        const el = this.elementos[i];
        if (el.tipo !== tipo) continue;
        if (filtro && !filtro(el)) continue;
        if (this._contemPonto(el, p)) return el;
      }
    }
    return null;
  }

  _contemPonto(el, p) {
    const folga = this._folga();

    switch (el.tipo) {
      case TIPOS.PAREDE:
      case TIPOS.PORTA:
      case TIPOS.JANELA: {
        const espessura = (el.espessura ?? 0.12) / 2;
        return pontoMaisProximoDoSegmento(p, el.a, el.b).distancia <= espessura + folga;
      }

      // Clicar em qualquer lugar do comodo seleciona o marcador dele.
      // Se o marcador ficou orfao (as paredes em volta nao fecham mais),
      // ele vira um alvo pequeno em cima do proprio ponto - senao viraria
      // dado morto: invisivel, inclicavel e impossivel de apagar.
      case TIPOS.PISO: {
        const comodo = this._comodoDoMarcador(el);
        if (comodo) return pontoDentroDoPoligono(p, comodo.pontos);
        return distancia(p, el.a) <= 0.3 + folga;
      }

      case TIPOS.MOVEL:
        return this._pontoNoMovel(el, p);

      case TIPOS.TEXTO:
        return Math.abs(p.x - el.a.x) < 1.2 && Math.abs(p.y - el.a.y) < 0.3;

      default:
        return false;
    }
  }

  // Para saber se o clique caiu num movel girado, giramos o CLIQUE no sentido
  // contrario e comparamos com o retangulo sem rotacao. E o mesmo resultado
  // e bem mais simples do que girar o retangulo.
  _pontoNoMovel(el, p) {
    const angulo = (-el.rotacao * Math.PI) / 180;
    const dx = p.x - el.a.x;
    const dy = p.y - el.a.y;

    const lx = dx * Math.cos(angulo) - dy * Math.sin(angulo);
    const ly = dx * Math.sin(angulo) + dy * Math.cos(angulo);

    return Math.abs(lx) <= el.largura / 2 && Math.abs(ly) <= el.profundidade / 2;
  }

  // Todas as pontas de parede que estao coladas em "ponto", tirando a do
  // proprio elemento que esta sendo arrastado.
  _pontasNoMesmoPonto(excluir, ponto) {
    const tolerancia = 0.02;
    const presas = [];

    for (const el of this.elementos) {
      if (el.tipo !== TIPOS.PAREDE || el.id === excluir.id) continue;

      if (distancia(el.a, ponto) <= tolerancia) presas.push({ el, qual: "a" });
      if (distancia(el.b, ponto) <= tolerancia) presas.push({ el, qual: "b" });
    }

    return presas;
  }

  // Guarda onde cada porta/janela esta ao longo da sua parede, em fracao do
  // comprimento (0 a 1). Assim, quando a parede muda de tamanho, a abertura
  // e recolocada na mesma posicao relativa em vez de ficar boiando fora.
  _aberturasParaReencaixar(parede) {
    if (parede.tipo !== TIPOS.PAREDE) return [];

    const comprimento = distancia(parede.a, parede.b);
    if (comprimento < 0.01) return [];

    const lista = [];

    for (const el of this.elementos) {
      if (el.tipo !== TIPOS.PORTA && el.tipo !== TIPOS.JANELA) continue;

      const posA = pontoMaisProximoDoSegmento(el.a, parede.a, parede.b);
      const posB = pontoMaisProximoDoSegmento(el.b, parede.a, parede.b);
      if (posA.distancia > 0.2 || posB.distancia > 0.2) continue;

      lista.push({
        el,
        centro: (posA.t + posB.t) / 2,
        comprimento: distancia(el.a, el.b),
      });
    }

    return lista;
  }

  // Junta, por parede, as aberturas de todas as paredes que vao se mover
  // neste arraste: a que a pessoa pegou e as soldadas no mesmo canto.
  _aberturasDasParedesAfetadas(elemento, alca) {
    const paredes = [elemento];

    for (const presa of this._pontasNoMesmoPonto(elemento, elemento[alca])) {
      paredes.push(presa.el);
    }

    return paredes
      .filter((parede) => parede.tipo === TIPOS.PAREDE)
      .map((parede) => ({ parede, itens: this._aberturasParaReencaixar(parede) }))
      .filter((grupo) => grupo.itens.length > 0);
  }

  _reencaixarAberturas(parede, aberturas) {
    const comprimento = distancia(parede.a, parede.b);
    if (comprimento < 0.01) return;

    const dir = {
      x: (parede.b.x - parede.a.x) / comprimento,
      y: (parede.b.y - parede.a.y) / comprimento,
    };

    for (const item of aberturas) {
      const largura = Math.min(item.comprimento, comprimento);

      // Prende o inicio dentro da parede pra abertura nao escapar da ponta.
      const inicio = Math.max(
        0,
        Math.min(item.centro * comprimento - largura / 2, comprimento - largura),
      );

      item.el.a = {
        x: parede.a.x + dir.x * inicio,
        y: parede.a.y + dir.y * inicio,
      };
      item.el.b = {
        x: item.el.a.x + dir.x * largura,
        y: item.el.a.y + dir.y * largura,
      };
    }
  }

  _paredeMaisProxima(p) {
    let melhor = null;
    let menor = 0.6; // so aceita parede a ate 60 cm do clique

    for (const el of this.elementos) {
      if (el.tipo !== TIPOS.PAREDE) continue;

      const d = pontoMaisProximoDoSegmento(p, el.a, el.b).distancia;
      if (d <= menor) { menor = d; melhor = el; }
    }

    return melhor;
  }

  // Alcas de redimensionamento do elemento selecionado, em metros.
  _alcas(el) {
    if (!el) return [];

    if (el.tipo === TIPOS.PAREDE || el.tipo === TIPOS.JANELA) {
      return [{ nome: "a", ponto: el.a }, { nome: "b", ponto: el.b }];
    }

    // Piso, movel e texto nao tem alca: eles se movem inteiros, e o comodo
    // muda de forma mexendo nas PAREDES, que e o jeito certo de pensar.
    return [];
  }

  _alcaNoPonto(el, p) {
    const raio = 10 / this.camera.escala;
    for (const alca of this._alcas(el)) {
      if (distancia(p, alca.ponto) <= raio) return alca.nome;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // CRIACAO DE ELEMENTOS
  // -------------------------------------------------------------------------

  _criarQuarto(a, b) {
    const r = retanguloDe(a, b);
    if (r.largura < 0.3 || r.altura < 0.3) return;

    const cantos = [
      { x: r.x, y: r.y },
      { x: r.x + r.largura, y: r.y },
      { x: r.x + r.largura, y: r.y + r.altura },
      { x: r.x, y: r.y + r.altura },
    ];

    this.registrarHistorico();

    for (let i = 0; i < 4; i++) {
      this.elementos.push(criarParede(cantos[i], cantos[(i + 1) % 4]));
    }

    // O marcador vai no centro do retangulo. O formato do piso ninguem
    // guarda: ele sai das 4 paredes que acabamos de criar.
    const piso = criarPiso(
      { x: r.x + r.largura / 2, y: r.y + r.altura / 2 },
      this.corAtual,
    );

    this.elementos.push(piso);
    this.selecionado = piso.id;

    this._mudou();
  }

  _criarPisoDetectado(p) {
    const poligono = comodoNoPonto(this.elementos, p);

    if (!poligono) {
      this.callbacks.aoAvisar?.(
        "Nao achei um comodo fechado aqui. As paredes precisam se encontrar."
      );
      return;
    }

    // Se esse comodo ja tem marcador, seleciona o que existe em vez de
    // empilhar outro em cima.
    const existente = this.elementos.find(
      (el) => el.tipo === TIPOS.PISO && pontoDentroDoPoligono(el.a, poligono)
    );

    if (existente) {
      this.selecionado = existente.id;
      this.callbacks.aoSelecionar?.(existente);
      this.redesenhar();
      return;
    }

    this.adicionar(criarPiso(centroDoPoligono(poligono), this.corAtual));
  }

  // Encaixa uma porta ou janela EM CIMA de uma parede: projeta o clique na
  // parede, centraliza a abertura ali e prende dentro dos limites dela.
  _criarAbertura(tipo, ponto, comprimentoDesejado) {
    const parede = this._paredeMaisProxima(ponto);

    if (!parede) {
      this.callbacks.aoAvisar?.("Clique em cima de uma parede.");
      return;
    }

    const comprimentoParede = distancia(parede.a, parede.b);
    const comprimento = Math.min(comprimentoDesejado, comprimentoParede);

    const direcao = {
      x: (parede.b.x - parede.a.x) / comprimentoParede,
      y: (parede.b.y - parede.a.y) / comprimentoParede,
    };

    const { ponto: naParede } = pontoMaisProximoDoSegmento(ponto, parede.a, parede.b);
    const posicao = (naParede.x - parede.a.x) * direcao.x +
                    (naParede.y - parede.a.y) * direcao.y;

    const inicio = Math.max(
      0,
      Math.min(posicao - comprimento / 2, comprimentoParede - comprimento),
    );

    const a = {
      x: parede.a.x + direcao.x * inicio,
      y: parede.a.y + direcao.y * inicio,
    };
    const b = {
      x: a.x + direcao.x * comprimento,
      y: a.y + direcao.y * comprimento,
    };

    if (this._aberturaOcupada(a, b)) {
      this.callbacks.aoAvisar?.("Ja tem uma abertura nesse pedaco da parede.");
      return;
    }

    const novo = tipo === TIPOS.PORTA ? criarPorta(a, b) : criarJanela(a, b);
    novo.parede = parede.id; // guarda em qual parede ela mora, o 3D usa isso
    this.adicionar(novo);
  }

  _aberturaOcupada(a, b) {
    const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    for (const el of this.elementos) {
      if (el.tipo !== TIPOS.PORTA && el.tipo !== TIPOS.JANELA) continue;

      // Duas aberturas se atrapalham se o centro de uma cai dentro da outra.
      if (pontoMaisProximoDoSegmento(meio, el.a, el.b).distancia < 0.05) return true;

      const meioExistente = { x: (el.a.x + el.b.x) / 2, y: (el.a.y + el.b.y) / 2 };
      if (pontoMaisProximoDoSegmento(meioExistente, a, b).distancia < 0.05) return true;
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // EVENTOS
  // -------------------------------------------------------------------------

  _ligarEventos() {
    const cv = this.canvas;

    cv.addEventListener("mousedown", (e) => this._aoPressionar(e));
    cv.addEventListener("mousemove", (e) => this._aoMover(e));
    cv.addEventListener("mouseup", (e) => this._aoSoltar(e));
    cv.addEventListener("mouseleave", () => { this.emHover = null; this.redesenhar(); });
    cv.addEventListener("wheel", (e) => this._aoRolar(e), { passive: false });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("dblclick", (e) => this._aoDuploClique(e));

    window.addEventListener("keydown", (e) => this._aoTeclar(e));
    window.addEventListener("keyup", (e) => {
      if (e.key === "Shift") { this.shift = false; this.redesenhar(); }
    });

    window.addEventListener("resize", () => this._ajustarTamanho());
  }

  _pontoDoEvento(evento) {
    const area = this.canvas.getBoundingClientRect();
    return this.telaParaMundo(evento.clientX - area.left, evento.clientY - area.top);
  }

  _aoPressionar(evento) {
    const cru = this._pontoDoEvento(evento);
    const p = this._encaixar(cru);

    // Botao do meio, ou direito, arrasta a tela.
    if (evento.button === 1 || (evento.button === 2 && evento.shiftKey)) {
      this.arrastandoCamera = { x: evento.clientX, y: evento.clientY };
      return;
    }

    // Botao direito cancela o desenho em andamento / volta pra selecao.
    if (evento.button === 2) {
      if (this.desenho) { this.desenho = null; this.redesenhar(); }
      else this.definirFerramenta(FERRAMENTAS.SELECIONAR);
      return;
    }

    if (evento.button !== 0) return;

    switch (this.ferramenta) {
      case FERRAMENTAS.PAREDE:
      case FERRAMENTAS.QUARTO:
      case FERRAMENTAS.JANELA:
        this.desenho = { inicio: p };
        break;

      case FERRAMENTAS.PISO:
        this._criarPisoDetectado(cru);
        break;

      case FERRAMENTAS.PORTA:
        this._criarAbertura(TIPOS.PORTA, cru, LARGURA_PORTA);
        break;

      case FERRAMENTAS.MOVEL: {
        const definicao = movelPorChave(this.movelAtual);
        if (definicao) this.adicionar(criarMovel(p, definicao));
        break;
      }

      case FERRAMENTAS.TEXTO:
        this.adicionar(criarTexto(p, this.textoAtual));
        break;

      case FERRAMENTAS.PINTAR: {
        const alvo = this._elementoNoPonto(cru, (el) => el.tipo !== TIPOS.PAREDE);
        if (alvo) {
          this.registrarHistorico();
          alvo.cor = this.corAtual;
          this.selecionado = alvo.id;
          this._mudou();
        }
        break;
      }

      case FERRAMENTAS.APAGAR: {
        const alvo = this._elementoNoPonto(cru);
        if (alvo) this.remover(alvo.id);
        break;
      }

      default:
        this._iniciarSelecao(cru, p);
    }

    this.redesenhar();
  }

  _iniciarSelecao(cru, p) {
    // Antes de tudo: o clique pegou uma alca do que ja esta selecionado?
    const atual = this.elementoSelecionado();
    const alca = atual ? this._alcaNoPonto(atual, cru) : null;

    // A copia do estado e tirada aqui, mas so vira historico se o arraste
    // realmente mexer em alguma coisa (ver _registrarArrasteUmaVez).
    const instantaneo = JSON.stringify(this.planta.elementos);

    if (alca) {
      this.arraste = {
        id: atual.id, ultimo: p, alca, instantaneo, registrado: false,
        // Cantos soldados: as outras paredes que terminam neste mesmo ponto
        // vao junto. Sem isso, mexer numa parede abre o comodo e o piso
        // desaparece, porque o contorno deixa de fechar.
        soldadas: this._pontasNoMesmoPonto(atual, atual[alca]),
        // As portas e janelas de TODAS as paredes que vao se mexer, nao so
        // da arrastada: uma parede soldada tambem muda de forma, e a porta
        // dela precisa acompanhar.
        aberturas: this._aberturasDasParedesAfetadas(atual, alca),
      };
      return;
    }

    const alvo = this._elementoNoPonto(cru);
    this.selecionado = alvo?.id ?? null;

    if (alvo) {
      this.arraste = {
        id: alvo.id, ultimo: p, alca: null, instantaneo, registrado: false,
      };
    }

    this.callbacks.aoSelecionar?.(alvo);
  }

  _aoMover(evento) {
    if (this.arrastandoCamera) {
      const dx = evento.clientX - this.arrastandoCamera.x;
      const dy = evento.clientY - this.arrastandoCamera.y;

      this.camera.x -= dx / this.camera.escala;
      this.camera.y -= dy / this.camera.escala;

      this.arrastandoCamera = { x: evento.clientX, y: evento.clientY };
      this.redesenhar();
      return;
    }

    const cru = this._pontoDoEvento(evento);
    this.ponteiro = this._encaixar(cru);
    this.callbacks.aoMoverPonteiro?.(this.ponteiro);

    if (this.ferramenta === FERRAMENTAS.APAGAR) {
      const alvo = this._elementoNoPonto(cru);
      const novoHover = alvo?.id ?? null;

      if (novoHover !== this.emHover) {
        this.emHover = novoHover;
        this.redesenhar();
      }
      return;
    }

    if (this.arraste) { this._arrastarElemento(this.ponteiro); return; }

    if (this.desenho) this.redesenhar();
  }

  _arrastarElemento(p) {
    const el = this.elementoPorId(this.arraste.id);
    if (!el) return;

    // Arrastando uma alca: mexe naquela ponta e leva junto tudo que estava
    // grudado nela.
    if (this.arraste.alca) {
      // A alca so entra aqui quando o mouse ja se moveu, entao houve mudanca.
      this._registrarArrasteUmaVez();

      el[this.arraste.alca] = { ...p };

      for (const presa of this.arraste.soldadas) {
        presa.el[presa.qual] = { ...p };
      }

      for (const grupo of this.arraste.aberturas) {
        this._reencaixarAberturas(grupo.parede, grupo.itens);
      }

      this.callbacks.aoSelecionar?.(el);
      this.redesenhar();
      return;
    }

    // Arrastando o elemento inteiro: soma o deslocamento em tudo.
    const dx = p.x - this.arraste.ultimo.x;
    const dy = p.y - this.arraste.ultimo.y;
    if (dx === 0 && dy === 0) return;

    this._registrarArrasteUmaVez();
    this._mover(el, dx, dy);

    // Porta e janela andam junto com a parede que as segura.
    if (el.tipo === TIPOS.PAREDE) {
      for (const outro of this.elementos) {
        if (outro.parede === el.id) this._mover(outro, dx, dy);
      }
    }

    this.arraste.ultimo = p;
    this.callbacks.aoSelecionar?.(el);
    this.redesenhar();
  }

  _mover(el, dx, dy) {
    if (el.a) { el.a.x += dx; el.a.y += dy; }
    if (el.b) { el.b.x += dx; el.b.y += dy; }
  }

  _aoSoltar(evento) {
    if (this.arrastandoCamera) { this.arrastandoCamera = null; return; }

    if (this.arraste) {
      // So avisa que mudou se mudou mesmo. Um clique de selecao nao deve
      // deixar o projeto marcado como "nao salvo".
      const houveMudanca = this.arraste.registrado;
      this.arraste = null;

      if (houveMudanca) this.callbacks.aoMudar?.();
      return;
    }

    if (!this.desenho || evento.button !== 0) return;

    const inicio = this.desenho.inicio;
    let fim = this._encaixar(this._pontoDoEvento(evento));

    // Mouse quase parado: a pessoa clicou em vez de arrastar. Mantemos o
    // desenho aberto pra ela clicar de novo no destino (estilo CAD).
    if (distancia(inicio, fim) < 0.05) return;

    if (this.ferramenta === FERRAMENTAS.PAREDE) {
      fim = this._encaixarAngulo(inicio, fim);
      this.adicionar(criarParede(inicio, fim));

      // Encadeia: a proxima parede ja comeca onde esta terminou. Desenhar
      // um comodo inteiro vira um arrastao so, sem soltar e recomecar.
      this.desenho = { inicio: fim };
      return;
    }

    if (this.ferramenta === FERRAMENTAS.QUARTO) {
      this._criarQuarto(inicio, fim);
    } else if (this.ferramenta === FERRAMENTAS.JANELA) {
      const comprimento = Math.max(distancia(inicio, fim), LARGURA_JANELA);
      this._criarAbertura(TIPOS.JANELA, inicio, comprimento);
    }

    this.desenho = null;
    this.redesenhar();
  }

  _aoDuploClique(evento) {
    // Duplo clique com a ferramenta de selecao tambem detecta o comodo:
    // e o atalho que a versao em Godot tinha.
    if (this.ferramenta !== FERRAMENTAS.SELECIONAR) return;
    this._criarPisoDetectado(this._pontoDoEvento(evento));
  }

  _aoRolar(evento) {
    evento.preventDefault();

    const area = this.canvas.getBoundingClientRect();
    const px = evento.clientX - area.left;
    const py = evento.clientY - area.top;

    // Zoom ancorado no cursor: o ponto do mundo embaixo do mouse continua
    // embaixo do mouse depois do zoom. (Na versao em Godot o zoom era sempre
    // no centro da tela, o que obrigava a ficar reposicionando.)
    const antes = this.telaParaMundo(px, py);

    const fator = evento.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.camera.escala = Math.max(8, Math.min(400, this.camera.escala * fator));

    const depois = this.telaParaMundo(px, py);

    this.camera.x += antes.x - depois.x;
    this.camera.y += antes.y - depois.y;

    this.callbacks.aoMudarZoom?.(this.camera.escala);
    this.redesenhar();
  }

  _aoTeclar(evento) {
    const digitando = ["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName
    );
    if (digitando) return;

    // O ouvinte de teclado mora na janela, entao continuava ativo com o 3D
    // na tela. Isso era perigoso: no passeio, andar com W-A-S-D trocava a
    // ferramenta (D = porta) e, pior, Delete apagava o elemento selecionado
    // sem ninguem ver acontecer. Se a prancheta 2D nao esta visivel, o
    // teclado nao e nosso.
    if (this.canvas.offsetParent === null) return;

    if (evento.key === "Shift") { this.shift = true; this.redesenhar(); return; }

    const ctrl = evento.ctrlKey || evento.metaKey;

    if (ctrl && evento.key.toLowerCase() === "z") {
      evento.preventDefault();
      if (evento.shiftKey) this.refazerAcao(); else this.desfazer();
      return;
    }

    if (ctrl && evento.key.toLowerCase() === "y") {
      evento.preventDefault();
      this.refazerAcao();
      return;
    }

    if (evento.key === "Escape") {
      this.desenho = null;
      this.selecionado = null;
      this.callbacks.aoSelecionar?.(null);
      this.redesenhar();
      return;
    }

    if (evento.key === "Delete" || evento.key === "Backspace") {
      if (this.selecionado != null) {
        evento.preventDefault();
        this.remover(this.selecionado);
      }
      return;
    }

    // R gira o movel selecionado de 15 em 15 graus.
    if (evento.key.toLowerCase() === "r") {
      const el = this.elementoSelecionado();
      if (el?.tipo === TIPOS.MOVEL) {
        this.registrarHistorico();
        el.rotacao = (el.rotacao + (evento.shiftKey ? -15 : 15) + 360) % 360;
        this._mudou();
      }
      return;
    }

    const atalhos = {
      v: FERRAMENTAS.SELECIONAR, p: FERRAMENTAS.PAREDE, q: FERRAMENTAS.QUARTO,
      c: FERRAMENTAS.PISO, d: FERRAMENTAS.PORTA, j: FERRAMENTAS.JANELA,
      m: FERRAMENTAS.MOVEL, t: FERRAMENTAS.TEXTO, b: FERRAMENTAS.PINTAR,
      e: FERRAMENTAS.APAGAR,
    };

    const ferramenta = atalhos[evento.key.toLowerCase()];
    if (ferramenta) this.definirFerramenta(ferramenta);
  }

  // -------------------------------------------------------------------------
  // CAMERA
  // -------------------------------------------------------------------------

  _ajustarTamanho() {
    // Telas com muitos pixels (retina, notebook 4K) precisam de um canvas
    // maior que o tamanho em CSS, senao tudo sai borrado.
    const razao = window.devicePixelRatio || 1;

    // Aqui tem que ser clientWidth mesmo, sem o atalho do _tamanho(): ele
    // cai pra canvas.width quando o elemento esta escondido, e ai cada
    // chamada multiplicaria o canvas pela razao de novo, sem parar.
    const largura = this.canvas.clientWidth;
    const altura = this.canvas.clientHeight;

    this.canvas.width = Math.round(largura * razao);
    this.canvas.height = Math.round(altura * razao);
    this.ctx.setTransform(razao, 0, 0, razao, 0, 0);

    this.redesenhar();
  }

  enquadrarTudo() {
    const pontos = [];

    for (const el of this.elementos) {
      if (el.pontos) pontos.push(...el.pontos);
      if (el.a) pontos.push(el.a);
      if (el.b) pontos.push(el.b);
    }

    if (pontos.length === 0) {
      this.camera = { x: 4, y: 3, escala: 60 };
      this.redesenhar();
      return;
    }

    const xs = pontos.map((p) => p.x);
    const ys = pontos.map((p) => p.y);

    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    this.camera.x = (minX + maxX) / 2;
    this.camera.y = (minY + maxY) / 2;

    const margem = 1.2; // metros de folga em volta
    const { largura: telaL, altura: telaA } = this._tamanho();
    const escalaX = telaL / (maxX - minX + margem * 2);
    const escalaY = telaA / (maxY - minY + margem * 2);

    this.camera.escala = Math.max(8, Math.min(200, Math.min(escalaX, escalaY)));

    this.callbacks.aoMudarZoom?.(this.camera.escala);
    this.redesenhar();
  }

  // -------------------------------------------------------------------------
  // DESENHO
  // -------------------------------------------------------------------------

  redesenhar() {
    const ctx = this.ctx;
    const { largura, altura } = this._tamanho();

    ctx.fillStyle = CORES.fundo;
    ctx.fillRect(0, 0, largura, altura);

    if (this.mostrarGrade) this._desenharGrade();

    // Centro da planta na tela, calculado uma vez por quadro. As cotas usam
    // isso pra decidir de que lado da parede o numero fica.
    this._centroTela = this._calcularCentroTela();

    // Os comodos sao recalculados a partir das paredes a cada quadro, e o
    // resultado serve pro preenchimento, pros nomes e pra selecao. Assim o
    // piso nunca fica "atrasado" em relacao as paredes.
    this._comodos = todosOsComodos(this.elementos);
    this._pintarComodos();

    for (const tipo of ORDEM_DESENHO) {
      for (const el of this.elementos) {
        if (el.tipo === tipo) this._desenharElemento(el);
      }
    }

    this._desenharNomesDosComodos();

    // Na exportacao o desenho tem que sair limpo: nada de previa, alca de
    // selecao, marcador de encaixe ou tutorial.
    if (this.exportando) return;

    this._desenharPrevia();
    this._desenharSelecao();
    this._desenharMarcaDeEncaixe();

    if (this.elementos.length === 0) this._desenharPrimeirosPassos();
  }

  // Bolinha destacando que o proximo clique vai grudar numa ponta de parede
  // que ja existe. Sem esse aviso, o encaixe parece o desenho "escorregando"
  // sozinho; com ele, fica claro que foi de proposito.
  _desenharMarcaDeEncaixe() {
    if (!this._encaixeEmPonta) return;
    if (!this.desenho && !this.arraste) return;

    const ctx = this.ctx;
    const p = this.mundoParaTela(this._encaixeEmPonta);

    ctx.save();

    ctx.strokeStyle = "#e07b2a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#e07b2a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // EXPORTAR IMAGEM
  // -------------------------------------------------------------------------

  // Desenha a planta inteira num canvas fora da tela e devolve um PNG.
  // Nao usa o canvas visivel porque ele so mostra o pedaco enquadrado e tem
  // a resolucao da janela; aqui a planta sai completa e na escala pedida.
  exportarPNG(pixelsPorMetro = 100, margem = 0.6) {
    const pontos = [];
    for (const el of this.elementos) {
      if (el.a) pontos.push(el.a);
      if (el.b) pontos.push(el.b);
    }

    if (pontos.length === 0) return null;

    const xs = pontos.map((p) => p.x);
    const ys = pontos.map((p) => p.y);

    const minX = Math.min(...xs) - margem;
    const maxX = Math.max(...xs) + margem;
    const minY = Math.min(...ys) - margem;
    const maxY = Math.max(...ys) + margem;

    // Teto de tamanho pra uma planta enorme nao estourar a memoria do
    // navegador e devolver um canvas em branco.
    const LADO_MAXIMO = 4000;
    const escala = Math.min(
      pixelsPorMetro,
      LADO_MAXIMO / (maxX - minX),
      LADO_MAXIMO / (maxY - minY),
    );

    const fora = document.createElement("canvas");
    fora.width = Math.max(1, Math.round((maxX - minX) * escala));
    fora.height = Math.max(1, Math.round((maxY - minY) * escala));

    // Troca temporariamente para onde o editor desenha, reaproveitando todo
    // o codigo de desenho em vez de manter uma segunda versao dele.
    const canvasReal = this.canvas;
    const ctxReal = this.ctx;
    const cameraReal = this.camera;

    this.canvas = fora;
    this.ctx = fora.getContext("2d");
    this.camera = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      escala,
    };
    this.exportando = true;

    try {
      this.redesenhar();
      return fora.toDataURL("image/png");
    } finally {
      this.exportando = false;
      this.canvas = canvasReal;
      this.ctx = ctxReal;
      this.camera = cameraReal;
      this.redesenhar();
    }
  }

  // Projeto novo e uma grade em branco e dez botoes: ninguem adivinha por
  // onde comecar. Estas instrucoes ficam no proprio desenho e somem sozinhas
  // assim que o primeiro elemento existe.
  _desenharPrimeirosPassos() {
    const ctx = this.ctx;
    const meio = this._meio();

    const passos = [
      "1.  Clique em “Comodo pronto” e arraste um retangulo",
      "2.  Use “Porta” e “Janela” nas paredes",
      "3.  Clique em “Ver em 3D” e entre na casa",
    ];

    ctx.save();
    ctx.textAlign = "center";

    ctx.font = "600 17px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(45, 62, 80, 0.78)";
    ctx.fillText("Comece sua planta", meio.x, meio.y - 42);

    ctx.font = "13.5px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(60, 78, 96, 0.62)";

    let y = meio.y - 10;

    for (const passo of passos) {
      ctx.fillText(passo, meio.x, y);
      y += 24;
    }

    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(60, 78, 96, 0.42)";
    ctx.fillText(
      "Roda do mouse dá zoom · botão do meio arrasta a tela",
      meio.x, y + 12,
    );

    ctx.restore();
  }

  _passoDaGrade() {
    // Escolhe o menor passo da lista que ainda de pelo menos 14 px na tela.
    for (const nivel of PASSOS) {
      if (nivel.passo * this.camera.escala >= 14) return nivel;
    }
    return PASSOS[PASSOS.length - 1];
  }

  _desenharGrade() {
    const ctx = this.ctx;
    const { largura, altura } = this._tamanho();

    const { passo, forte } = this._passoDaGrade();

    const cantoA = this.telaParaMundo(0, 0);
    const cantoB = this.telaParaMundo(largura, altura);

    ctx.lineWidth = 1;
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textBaseline = "top";

    const quaseZero = (v) => Math.abs(v) < passo / 100;
    const ehForte = (v) => Math.abs(v % forte) < passo / 100 ||
                           Math.abs(Math.abs(v % forte) - forte) < passo / 100;

    // Linhas verticais
    for (let x = Math.floor(cantoA.x / passo) * passo; x <= cantoB.x; x += passo) {
      const tela = this.mundoParaTela({ x, y: 0 }).x;

      ctx.strokeStyle = quaseZero(x) ? CORES.eixoY
                      : ehForte(x) ? CORES.gradeGrossa : CORES.gradeFina;
      ctx.beginPath();
      ctx.moveTo(tela, 0);
      ctx.lineTo(tela, altura);
      ctx.stroke();

      if (ehForte(x) && !quaseZero(x)) {
        ctx.fillStyle = CORES.regua;
        ctx.fillText(`${(+x.toFixed(2)).toString().replace(".", ",")}`, tela + 3, 3);
      }
    }

    // Linhas horizontais
    for (let y = Math.floor(cantoA.y / passo) * passo; y <= cantoB.y; y += passo) {
      const tela = this.mundoParaTela({ x: 0, y }).y;

      ctx.strokeStyle = quaseZero(y) ? CORES.eixoX
                      : ehForte(y) ? CORES.gradeGrossa : CORES.gradeFina;
      ctx.beginPath();
      ctx.moveTo(0, tela);
      ctx.lineTo(largura, tela);
      ctx.stroke();

      if (ehForte(y) && !quaseZero(y)) {
        ctx.fillStyle = CORES.regua;
        ctx.fillText(`${(+y.toFixed(2)).toString().replace(".", ",")}`, 3, tela + 3);
      }
    }
  }

  // Acha o marcador de piso que mora dentro de um comodo detectado.
  _marcadorDoComodo(comodo) {
    return this.elementos.find(
      (el) => el.tipo === TIPOS.PISO && pontoDentroDoPoligono(el.a, comodo.pontos)
    ) ?? null;
  }

  // O comodo em que um marcador esta, ou null se ele ficou "orfao" (a pessoa
  // apagou as paredes em volta e o marcador sobrou solto).
  _comodoDoMarcador(marcador) {
    return this._comodos?.find((c) => pontoDentroDoPoligono(marcador.a, c.pontos)) ?? null;
  }

  _pintarComodos() {
    const ctx = this.ctx;

    for (const comodo of this._comodos) {
      const marcador = this._marcadorDoComodo(comodo);

      const tela = comodo.pontos.map((p) => this.mundoParaTela(p));

      ctx.fillStyle = marcador?.cor ?? "#e6e3dd";
      ctx.beginPath();
      ctx.moveTo(tela[0].x, tela[0].y);
      for (const p of tela.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  _desenharElemento(el) {
    const ctx = this.ctx;

    switch (el.tipo) {
      // O piso normalmente nao se desenha: ele e so um marcador de nome e
      // cor, e quem aparece na tela e o comodo detectado (_pintarComodos).
      // A excecao e o marcador orfao, que precisa aparecer pra pessoa
      // conseguir clicar nele e entender o que houve.
      case TIPOS.PISO:
        if (!this._comodoDoMarcador(el)) this._desenharPisoOrfao(el);
        break;

      case TIPOS.PAREDE:
        this._desenharParede(el);
        break;

      case TIPOS.PORTA:
        this._desenharPorta(el);
        break;

      case TIPOS.JANELA:
        this._desenharJanela(el);
        break;

      case TIPOS.MOVEL:
        this._desenharMovel(el);
        break;

      case TIPOS.TEXTO: {
        const p = this.mundoParaTela(el.a);
        ctx.fillStyle = el.cor;
        ctx.font = `${Math.max(10, el.tamanho * this.camera.escala)}px 'Segoe UI', sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(el.texto, p.x, p.y);
        break;
      }
    }
  }

  // Marcador de comodo que perdeu as paredes em volta. Fica visivel e com
  // cara de "tem algo errado aqui", em vez de sumir calado.
  _desenharPisoOrfao(el) {
    const ctx = this.ctx;
    const p = this.mundoParaTela(el.a);
    const raio = Math.max(7, 0.22 * this.camera.escala);

    ctx.save();

    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "rgba(190, 120, 40, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, raio, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = el.cor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(3, raio * 0.4), 0, Math.PI * 2);
    ctx.fill();

    if (this.camera.escala > 25) {
      ctx.font = "11px 'Segoe UI', sans-serif";
      ctx.fillStyle = "rgba(150, 95, 30, 0.9)";
      ctx.textAlign = "center";
      ctx.fillText("comodo sem paredes", p.x, p.y + raio + 13);
      ctx.textAlign = "start";
    }

    ctx.restore();
  }

  // Parede desenhada como retangulo cheio, com a espessura de verdade.
  // E assim que planta baixa de arquitetura e: dois tracos paralelos, nao
  // uma linha so.
  _desenharParede(el) {
    const ctx = this.ctx;
    const a = this.mundoParaTela(el.a);
    const b = this.mundoParaTela(el.b);

    ctx.strokeStyle = el.cor ?? CORES.parede;
    ctx.lineCap = "butt";
    ctx.lineWidth = Math.max(2, (el.espessura ?? 0.15) * this.camera.escala);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    if (this.mostrarCotas) this._desenharCota(el.a, el.b);
  }

  // Porta: "apaga" o pedaco da parede e desenha a folha + o arco de abertura.
  _desenharPorta(el) {
    const ctx = this.ctx;
    const a = this.mundoParaTela(el.a);
    const b = this.mundoParaTela(el.b);

    const espessura = Math.max(2, 0.15 * this.camera.escala);

    ctx.strokeStyle = CORES.fundo;
    ctx.lineCap = "butt";
    ctx.lineWidth = espessura + 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
    const angulo = Math.atan2(b.y - a.y, b.x - a.x);

    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(angulo);

    ctx.strokeStyle = el.cor;
    ctx.lineWidth = 2;

    ctx.beginPath();          // a folha da porta, aberta a 90 graus
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -comprimento);
    ctx.stroke();

    ctx.strokeStyle = "rgba(60,60,60,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();          // o arco do movimento
    ctx.arc(0, 0, comprimento, -Math.PI / 2, 0);
    ctx.stroke();

    ctx.restore();
  }

  _desenharJanela(el) {
    const ctx = this.ctx;
    const a = this.mundoParaTela(el.a);
    const b = this.mundoParaTela(el.b);

    const espessura = Math.max(2, 0.15 * this.camera.escala);

    ctx.lineCap = "butt";
    ctx.strokeStyle = CORES.fundo;
    ctx.lineWidth = espessura + 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = el.cor;
    ctx.lineWidth = Math.max(2, espessura * 0.45);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    if (this.mostrarCotas) this._desenharCota(el.a, el.b, 14);
  }

  _desenharMovel(el) {
    const ctx = this.ctx;
    const centro = this.mundoParaTela(el.a);

    const largura = el.largura * this.camera.escala;
    const profundidade = el.profundidade * this.camera.escala;

    ctx.save();
    ctx.translate(centro.x, centro.y);
    ctx.rotate((el.rotacao * Math.PI) / 180);

    ctx.fillStyle = el.cor;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-largura / 2, -profundidade / 2, largura, profundidade);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(25,30,38,0.65)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-largura / 2, -profundidade / 2, largura, profundidade);

    // Risquinho indicando a "frente" do movel, pra saber pra onde ele aponta.
    ctx.strokeStyle = "rgba(25,30,38,0.4)";
    ctx.beginPath();
    ctx.moveTo(-largura / 2, -profundidade / 2);
    ctx.lineTo(largura / 2, -profundidade / 2);
    ctx.stroke();

    const definicao = movelPorChave(el.modelo);
    if (definicao && largura > 42 && profundidade > 20) {
      ctx.rotate(-(el.rotacao * Math.PI) / 180); // texto sempre em pe
      ctx.fillStyle = "rgba(20,25,32,0.72)";
      ctx.font = "10px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(definicao.nome, 0, 0);
      ctx.textAlign = "start";
    }

    ctx.restore();
  }

  _calcularCentroTela() {
    let somaX = 0;
    let somaY = 0;
    let total = 0;

    for (const el of this.elementos) {
      const pontos = el.pontos ?? [el.a, el.b].filter(Boolean);
      for (const p of pontos) { somaX += p.x; somaY += p.y; total++; }
    }

    if (total === 0) return this._meio();
    return this.mundoParaTela({ x: somaX / total, y: somaY / total });
  }

  // Cota: a medidinha escrita ao lado da parede.
  _desenharCota(a, b, distanciaPx = 16) {
    const comprimento = distancia(a, b);
    if (comprimento < 0.2) return;

    const ta = this.mundoParaTela(a);
    const tb = this.mundoParaTela(b);

    const comprimentoTela = Math.hypot(tb.x - ta.x, tb.y - ta.y);
    if (comprimentoTela < 34) return; // nao cabe, nao escreve

    const ctx = this.ctx;
    let angulo = Math.atan2(tb.y - ta.y, tb.x - ta.x);

    // Nunca escrever de cabeca pra baixo.
    const invertido = angulo > Math.PI / 2 || angulo < -Math.PI / 2;
    if (invertido) angulo += Math.PI;

    const meioX = (ta.x + tb.x) / 2;
    const meioY = (ta.y + tb.y) / 2;

    // De que lado da parede escrever? Sempre do lado de FORA da planta.
    // Escrevendo sempre "pra cima" da parede, as cotas das paredes opostas
    // de um comodo se encontram no meio dele e viram um amontoado. Jogando
    // pra fora, elas se afastam uma da outra sozinhas.
    //
    // No sistema ja girado, "pra cima" (-y) aponta para (sin a, -cos a).
    const lado = { x: Math.sin(angulo), y: -Math.cos(angulo) };

    const centro = this._centroTela ?? this._meio();
    const daqui = Math.hypot(meioX - centro.x, meioY - centro.y);
    const ali = Math.hypot(
      meioX + lado.x * distanciaPx - centro.x,
      meioY + lado.y * distanciaPx - centro.y,
    );

    // Se "pra cima" aponta pra dentro da planta, escreve pro outro lado.
    if (ali < daqui) distanciaPx = -distanciaPx;

    ctx.save();
    ctx.translate(meioX, meioY);
    ctx.rotate(angulo);

    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const texto = formatarMetros(comprimento);
    const largura = ctx.measureText(texto).width;

    ctx.fillStyle = "rgba(244,242,238,0.9)";
    ctx.fillRect(-largura / 2 - 3, -distanciaPx - 7, largura + 6, 14);

    ctx.fillStyle = CORES.cota;
    ctx.fillText(texto, 0, -distanciaPx);

    ctx.textAlign = "start";
    ctx.restore();
  }

  // Escreve o nome e a metragem no meio de cada comodo fechado.
  _desenharNomesDosComodos() {
    if (!this.mostrarCotas) return;

    const ctx = this.ctx;

    for (const comodo of this._comodos) {
      const centro = centroDoPoligono(comodo.pontos);
      const tela = this.mundoParaTela(centro);

      const nome = this._marcadorDoComodo(comodo)?.nome?.trim();
      const area = formatarArea(comodo.area);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Uma placa clara atras do texto. Sem ela, o nome do comodo some em
      // cima de um movel escuro ou de um piso de cor forte.
      ctx.font = "600 13px 'Segoe UI', sans-serif";
      const larguraNome = nome ? ctx.measureText(nome).width : 0;
      ctx.font = "11px 'Segoe UI', sans-serif";
      const larguraArea = ctx.measureText(area).width;

      const largura = Math.max(larguraNome, larguraArea) + 12;
      const altura = nome ? 34 : 18;

      ctx.fillStyle = "rgba(244, 242, 238, 0.82)";
      ctx.fillRect(tela.x - largura / 2, tela.y - altura / 2, largura, altura);

      ctx.fillStyle = CORES.nomeComodo;

      if (nome) {
        ctx.font = "600 13px 'Segoe UI', sans-serif";
        ctx.fillText(nome, tela.x, tela.y - 8);
        ctx.font = "11px 'Segoe UI', sans-serif";
        ctx.fillText(area, tela.x, tela.y + 8);
      } else {
        ctx.font = "11px 'Segoe UI', sans-serif";
        ctx.fillText(area, tela.x, tela.y);
      }

      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }

  // O que esta sendo desenhado agora, antes de virar elemento de verdade.
  _desenharPrevia() {
    if (!this.desenho) return;

    const ctx = this.ctx;
    const inicio = this.desenho.inicio;
    let fim = this.ponteiro;

    if (this.ferramenta === FERRAMENTAS.PAREDE) fim = this._encaixarAngulo(inicio, fim);

    const ta = this.mundoParaTela(inicio);
    const tb = this.mundoParaTela(fim);

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = CORES.previa;
    ctx.lineWidth = 2;

    if (this.ferramenta === FERRAMENTAS.QUARTO) {
      ctx.fillStyle = "rgba(47,143,214,0.12)";
      ctx.fillRect(ta.x, ta.y, tb.x - ta.x, tb.y - ta.y);
      ctx.strokeRect(ta.x, ta.y, tb.x - ta.x, tb.y - ta.y);
    } else {
      ctx.beginPath();
      ctx.moveTo(ta.x, ta.y);
      ctx.lineTo(tb.x, tb.y);
      ctx.stroke();
    }

    ctx.restore();

    // Medida ao vivo enquanto desenha: quem esta projetando precisa saber
    // o tamanho ANTES de soltar o mouse, nao depois.
    const comprimento = distancia(inicio, fim);
    if (comprimento > 0.05) {
      const texto = this.ferramenta === FERRAMENTAS.QUARTO
        ? `${formatarMetros(Math.abs(fim.x - inicio.x))} x ${formatarMetros(Math.abs(fim.y - inicio.y))}`
        : formatarMetros(comprimento);

      ctx.font = "600 12px 'Segoe UI', sans-serif";
      const largura = ctx.measureText(texto).width;

      ctx.fillStyle = "rgba(20,30,40,0.88)";
      ctx.fillRect(tb.x + 12, tb.y - 24, largura + 12, 20);

      ctx.fillStyle = "#eaf4fb";
      ctx.fillText(texto, tb.x + 18, tb.y - 10);
    }
  }

  _desenharSelecao() {
    const ctx = this.ctx;

    // Contorno vermelho no que a borracha vai apagar.
    if (this.ferramenta === FERRAMENTAS.APAGAR && this.emHover != null) {
      const alvo = this.elementoPorId(this.emHover);
      if (alvo) this._contornar(alvo, CORES.apagar, 3);
    }

    const el = this.elementoSelecionado();
    if (!el) return;

    this._contornar(el, CORES.selecao, 2);

    // Alcas de redimensionar.
    for (const alca of this._alcas(el)) {
      const p = this.mundoParaTela(alca.ponto);

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = CORES.selecao;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  _contornar(el, cor, espessura) {
    const ctx = this.ctx;

    ctx.save();
    ctx.strokeStyle = cor;
    ctx.lineWidth = espessura;
    ctx.setLineDash([5, 4]);

    // Selecionar um piso contorna o COMODO inteiro em que o marcador esta.
    if (el.tipo === TIPOS.PISO) {
      const comodo = this._comodoDoMarcador(el);

      // Marcador orfao: contorna o pontinho dele, nao o comodo que nao existe.
      if (!comodo) {
        const p = this.mundoParaTela(el.a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(10, 0.3 * this.camera.escala), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
      }

      const tela = comodo.pontos.map((p) => this.mundoParaTela(p));
      ctx.beginPath();
      ctx.moveTo(tela[0].x, tela[0].y);
      for (const p of tela.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.stroke();
    } else if (el.tipo === TIPOS.MOVEL) {
      const centro = this.mundoParaTela(el.a);
      ctx.translate(centro.x, centro.y);
      ctx.rotate((el.rotacao * Math.PI) / 180);
      ctx.strokeRect(
        (-el.largura / 2) * this.camera.escala,
        (-el.profundidade / 2) * this.camera.escala,
        el.largura * this.camera.escala,
        el.profundidade * this.camera.escala,
      );
    } else if (el.tipo === TIPOS.TEXTO) {
      const p = this.mundoParaTela(el.a);
      ctx.strokeRect(p.x - 6, p.y - 12, 120, 24);
    } else if (el.a && el.b) {
      const a = this.mundoParaTela(el.a);
      const b = this.mundoParaTela(el.b);

      ctx.lineWidth = espessura + 3;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.restore();
  }
}
