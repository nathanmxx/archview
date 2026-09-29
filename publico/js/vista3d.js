// Vista 3D.
//
// Le a MESMA lista de elementos do editor 2D e levanta a maquete:
//   - cada parede vira uma caixa esticada (extrusao);
//   - porta e janela viram BURACOS de verdade na parede, nao adesivos;
//   - cada comodo fechado detectado pela geometria.js vira o chao;
//   - cada movel vira o conjunto de caixas descrito no catalogo.
//
// Sistema de coordenadas: a planta 2D usa (x, y). Aqui o x continua sendo x,
// o y da planta vira o z do mundo, e o y do mundo passa a ser a ALTURA.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

import { TIPOS, ALTURA_PAREDE, pontoMaisProximoDoSegmento } from "./modelo.js";
import { todosOsComodos } from "./geometria.js";
import { movelPorChave } from "./moveis.js";

const ALTURA_OLHO = 1.65;      // altura dos olhos de quem esta andando
const VELOCIDADE = 3.2;        // metros por segundo
const RAIO_PESSOA = 0.28;      // "gordura" da pessoa, pra nao atravessar parede

export class Vista3D {
  constructor(container) {
    this.container = container;

    this.renderizador = new THREE.WebGLRenderer({ antialias: true });
    this.renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderizador.shadowMap.enabled = true;
    this.renderizador.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(this.renderizador.domElement);

    this.cena = new THREE.Scene();
    this.cena.background = new THREE.Color(0x9fc4dd);
    this.cena.fog = new THREE.Fog(0x9fc4dd, 40, 120);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 500);
    this.camera.position.set(9, 9, 9);

    this._montarLuzes();
    this._montarChaoInfinito();

    // Tudo que vem da planta fica dentro deste grupo. Pra reconstruir a cena
    // basta esvaziar ele, sem mexer em luz, chao nem camera.
    this.grupoPlanta = new THREE.Group();
    this.cena.add(this.grupoPlanta);

    this.orbita = new OrbitControls(this.camera, this.renderizador.domElement);
    this.orbita.enableDamping = true;
    this.orbita.dampingFactor = 0.08;
    this.orbita.maxPolarAngle = Math.PI / 2.05; // nao deixa ir por baixo do chao
    this.orbita.target.set(4, 0, 3);

    this.passeio = new PointerLockControls(this.camera, this.renderizador.domElement);
    this.cena.add(this.passeio.object);

    this.modo = "orbita";
    this.teclas = new Set();
    this.paredesColisao = [];
    this.vaos = [];
    this.comodos = [];
    this.relogio = new THREE.Clock();
    this.rodando = false;

    this._ligarEventos();
    this.redimensionar();
  }

  // -------------------------------------------------------------------------
  // CENARIO FIXO
  // -------------------------------------------------------------------------

  _montarLuzes() {
    // Luz de ceu: clareia por cima com cor de ceu e por baixo com cor de chao.
    // Sozinha ela ja evita aquele visual de "objeto flutuando no escuro".
    this.cena.add(new THREE.HemisphereLight(0xdfefff, 0x6b6257, 1.05));

    const sol = new THREE.DirectionalLight(0xffffff, 1.5);
    sol.position.set(14, 22, 10);
    sol.castShadow = true;

    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.camera.near = 1;
    sol.shadow.camera.far = 80;

    // A camera da sombra precisa cobrir a casa toda, senao a sombra
    // some nas bordas.
    for (const [lado, valor] of [["left", -30], ["right", 30], ["top", 30], ["bottom", -30]]) {
      sol.shadow.camera[lado] = valor;
    }
    sol.shadow.bias = -0.0008;

    this.cena.add(sol);
  }

  _montarChaoInfinito() {
    const chao = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshLambertMaterial({ color: 0x7d9a6d }),
    );

    chao.rotation.x = -Math.PI / 2;
    chao.position.y = -0.02;
    chao.receiveShadow = true;

    this.cena.add(chao);
  }

  // -------------------------------------------------------------------------
  // CONSTRUCAO A PARTIR DA PLANTA
  // -------------------------------------------------------------------------

  reconstruir(planta) {
    // Limpar de verdade: descartar geometria e material tambem, senao a
    // memoria da placa de video so cresce a cada "ver em 3D".
    this.grupoPlanta.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    this.grupoPlanta.clear();

    const elementos = planta.elementos;

    this.paredesColisao = elementos.filter((el) => el.tipo === TIPOS.PAREDE);
    this.vaos = elementos.filter((el) => el.tipo === TIPOS.PORTA);

    // Detectar os comodos e uma conta que roda sobre todas as paredes.
    // Fazemos uma vez so e reaproveitamos no chao e no ponto de entrada.
    this.comodos = todosOsComodos(elementos);

    this._construirPisos(elementos);

    for (const parede of this.paredesColisao) {
      this._construirParede(parede, elementos);
    }

    for (const el of elementos) {
      if (el.tipo === TIPOS.MOVEL) this._construirMovel(el);
    }

    this._centralizarOrbita(elementos);
  }

  _construirPisos(elementos) {
    const material = (cor) => new THREE.MeshLambertMaterial({
      color: new THREE.Color(cor),
      side: THREE.DoubleSide,
    });

    // 1) Os comodos detectados automaticamente pelas paredes.
    for (const comodo of this.comodos) {
      const forma = new THREE.Shape();
      forma.moveTo(comodo.pontos[0].x, comodo.pontos[0].y);
      for (const p of comodo.pontos.slice(1)) forma.lineTo(p.x, p.y);
      forma.closePath();

      // O marcador de piso que estiver dentro deste comodo da a cor dele.
      const marcador = elementos.find(
        (el) => el.tipo === TIPOS.PISO && this._pontoNoPoligono(el.a, comodo.pontos)
      );

      const malha = new THREE.Mesh(
        new THREE.ShapeGeometry(forma),
        material(marcador?.cor ?? "#d6d2cb"),
      );

      malha.rotation.x = Math.PI / 2; // deita a forma no chao
      malha.position.y = 0.005;
      malha.receiveShadow = true;

      this.grupoPlanta.add(malha);
    }

    // Nao existe um segundo tipo de piso: todo chao vem da deteccao acima.
    // Se um comodo nao aparece aqui, e porque as paredes dele nao fecham -
    // e isso e informacao util, nao um defeito a ser escondido.
  }

  _pontoNoPoligono(p, pontos) {
    let dentro = false;
    for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
      const pi = pontos[i];
      const pj = pontos[j];
      if (pi.y > p.y !== pj.y > p.y &&
          p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) {
        dentro = !dentro;
      }
    }
    return dentro;
  }

  // A parte mais legal: a parede nao e uma caixa so. Ela e FATIADA nos vaos.
  //
  //   parede inteira:   [##########################]
  //   com uma porta:    [######]        [##########]   <- dois pedacos
  //                            [ verga ]                  + a verga em cima
  //   com uma janela:   [######][ peitoril ][#######]
  //                            [   verga   ]
  _construirParede(parede, elementos) {
    const comprimento = Math.hypot(parede.b.x - parede.a.x, parede.b.y - parede.a.y);
    if (comprimento < 0.01) return;

    const altura = parede.altura ?? ALTURA_PAREDE;
    const espessura = parede.espessura ?? 0.15;
    // Atencao: "parede.cor" e a cor do TRACO na planta 2D, que por convencao
    // de desenho tecnico e preto. Ninguem pinta parede de preto. A cor real
    // da parede e um campo separado, "cor3d", com branco-gelo por padrao.
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(parede.cor3d ?? "#ece8e2"),
    });

    // Onde cada abertura comeca e termina, medido ao longo da parede.
    const aberturas = [];

    for (const el of elementos) {
      if (el.tipo !== TIPOS.PORTA && el.tipo !== TIPOS.JANELA) continue;

      const posA = pontoMaisProximoDoSegmento(el.a, parede.a, parede.b);
      const posB = pontoMaisProximoDoSegmento(el.b, parede.a, parede.b);

      // A abertura so pertence a esta parede se estiver colada nela.
      if (posA.distancia > 0.2 || posB.distancia > 0.2) continue;

      const inicio = Math.min(posA.t, posB.t) * comprimento;
      const fim = Math.max(posA.t, posB.t) * comprimento;
      if (fim - inicio < 0.05) continue;

      const base = el.tipo === TIPOS.JANELA ? (el.peitoril ?? 1.0) : 0;
      const topo = Math.min(base + (el.altura ?? 2.1), altura);

      aberturas.push({ inicio, fim, base, topo });
    }

    aberturas.sort((x, y) => x.inicio - y.inicio);

    const pedacos = [];
    let cursor = 0;

    for (const abertura of aberturas) {
      const inicio = Math.max(cursor, abertura.inicio);
      const fim = Math.min(comprimento, abertura.fim);
      if (fim <= inicio) continue;

      // Pedaco cheio antes da abertura.
      if (inicio > cursor + 0.001) {
        pedacos.push({ de: cursor, ate: inicio, base: 0, topo: altura });
      }

      // Peitoril (embaixo da janela).
      if (abertura.base > 0.001) {
        pedacos.push({ de: inicio, ate: fim, base: 0, topo: abertura.base });
      }

      // Verga (o pedaco de parede acima da porta ou janela).
      if (abertura.topo < altura - 0.001) {
        pedacos.push({ de: inicio, ate: fim, base: abertura.topo, topo: altura });
      }

      cursor = Math.max(cursor, fim);
    }

    if (cursor < comprimento - 0.001) {
      pedacos.push({ de: cursor, ate: comprimento, base: 0, topo: altura });
    }

    // Direcao da parede no plano do chao.
    const dx = (parede.b.x - parede.a.x) / comprimento;
    const dy = (parede.b.y - parede.a.y) / comprimento;
    const giro = -Math.atan2(dy, dx);

    for (const pedaco of pedacos) {
      const larguraPedaco = pedaco.ate - pedaco.de;
      const alturaPedaco = pedaco.topo - pedaco.base;
      if (larguraPedaco < 0.005 || alturaPedaco < 0.005) continue;

      const meio = (pedaco.de + pedaco.ate) / 2;

      const malha = new THREE.Mesh(
        new THREE.BoxGeometry(larguraPedaco, alturaPedaco, espessura),
        material,
      );

      malha.position.set(
        parede.a.x + dx * meio,
        pedaco.base + alturaPedaco / 2,
        parede.a.y + dy * meio,
      );
      malha.rotation.y = giro;

      malha.castShadow = true;
      malha.receiveShadow = true;

      this.grupoPlanta.add(malha);
    }

    // O vidro da janela, so pra dar o brilho. Nao bloqueia passagem.
    for (const el of elementos) {
      if (el.tipo !== TIPOS.JANELA) continue;

      const posA = pontoMaisProximoDoSegmento(el.a, parede.a, parede.b);
      const posB = pontoMaisProximoDoSegmento(el.b, parede.a, parede.b);
      if (posA.distancia > 0.2 || posB.distancia > 0.2) continue;

      const larguraVidro = Math.abs(posB.t - posA.t) * comprimento;
      const meio = ((posA.t + posB.t) / 2) * comprimento;
      const base = el.peitoril ?? 1.0;

      const vidro = new THREE.Mesh(
        new THREE.BoxGeometry(larguraVidro, el.altura ?? 1.2, 0.02),
        new THREE.MeshLambertMaterial({
          color: 0xbfe4f5, transparent: true, opacity: 0.35,
        }),
      );

      vidro.position.set(
        parede.a.x + dx * meio,
        base + (el.altura ?? 1.2) / 2,
        parede.a.y + dy * meio,
      );
      vidro.rotation.y = giro;

      this.grupoPlanta.add(vidro);
    }
  }

  _construirMovel(el) {
    const definicao = movelPorChave(el.modelo);
    if (!definicao) return;

    // O grupo carrega a posicao e a rotacao; as pecas so precisam saber
    // onde ficam DENTRO do movel. Mexer no movel inteiro fica de graca.
    const grupo = new THREE.Group();
    grupo.position.set(el.a.x, 0, el.a.y);
    grupo.rotation.y = (-el.rotacao * Math.PI) / 180;

    for (const peca of definicao.pecas) {
      const malha = new THREE.Mesh(
        new THREE.BoxGeometry(peca.l, peca.a, peca.p),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(peca.cor) }),
      );

      malha.position.set(peca.x, peca.z + peca.a / 2, peca.y);
      malha.castShadow = true;
      malha.receiveShadow = true;

      grupo.add(malha);
    }

    this.grupoPlanta.add(grupo);
  }

  _centralizarOrbita(elementos) {
    const pontos = [];

    for (const el of elementos) {
      if (el.pontos) pontos.push(...el.pontos);
      if (el.a) pontos.push(el.a);
      if (el.b) pontos.push(el.b);
    }

    if (pontos.length === 0) return;

    const xs = pontos.map((p) => p.x);
    const ys = pontos.map((p) => p.y);

    const centroX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centroZ = (Math.min(...ys) + Math.max(...ys)) / 2;
    const tamanho = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      4,
    );

    this.orbita.target.set(centroX, 1, centroZ);

    if (this.modo === "orbita") {
      this.camera.position.set(
        centroX + tamanho * 0.9,
        tamanho * 0.85,
        centroZ + tamanho * 0.9,
      );
    }

    this.orbita.update();
  }

  // -------------------------------------------------------------------------
  // MODOS DE CAMERA
  // -------------------------------------------------------------------------

  definirModo(modo) {
    this.modo = modo;

    if (modo === "passeio") {
      this.orbita.enabled = false;

      // O botao diz "entrar e andar", entao a pessoa tem que nascer DENTRO
      // da casa. Usar o alvo da orbita jogava ela do lado de fora encarando
      // a parede.
      const entrada = this._pontoDeEntrada();
      this.camera.position.set(entrada.x, ALTURA_OLHO, entrada.z);
      this.camera.lookAt(entrada.olharX, ALTURA_OLHO, entrada.olharZ);

      this.passeio.lock();
    } else {
      this.passeio.unlock();
      this.orbita.enabled = true;
      this.orbita.update();
    }

    this.aoTrocarModo?.(modo);
  }

  // Escolhe onde a pessoa nasce ao entrar no passeio: o centro do MAIOR
  // comodo fechado, olhando para o centro da casa. Se a planta nao tiver
  // nenhum comodo fechado ainda, cai no alvo da orbita mesmo.
  _pontoDeEntrada() {
    const alvo = this.orbita.target;
    const padrao = {
      x: alvo.x, z: alvo.z + 3,
      olharX: alvo.x, olharZ: alvo.z,
    };

    if (this.comodos.length === 0) return padrao;

    const maior = this.comodos.reduce((a, b) => (b.area > a.area ? b : a));

    let somaX = 0;
    let somaZ = 0;
    for (const p of maior.pontos) { somaX += p.x; somaZ += p.y; }

    const centro = {
      x: somaX / maior.pontos.length,
      z: somaZ / maior.pontos.length,
    };

    // Olhar para o centro da casa. Se a pessoa nasceu EM CIMA desse centro,
    // "olhar pra ele" nao define direcao nenhuma e a camera trava apontando
    // pra qualquer lado - entao nesse caso olhamos para um lado fixo.
    const longe = Math.hypot(alvo.x - centro.x, alvo.z - centro.z) > 0.5;

    return {
      x: centro.x,
      z: centro.z,
      olharX: longe ? alvo.x : centro.x + 1,
      olharZ: longe ? alvo.z : centro.z,
    };
  }

  // Colisao: a pessoa nao pode atravessar parede, MAS pode passar pela porta.
  // Testamos a posicao nova contra cada parede; se estiver perto demais,
  // so liberamos se o ponto estiver dentro do vao de alguma porta.
  _posicaoLivre(x, z) {
    const ponto = { x, y: z };

    for (const parede of this.paredesColisao) {
      const espessura = (parede.espessura ?? 0.15) / 2;
      const { distancia } = pontoMaisProximoDoSegmento(ponto, parede.a, parede.b);

      if (distancia > espessura + RAIO_PESSOA) continue;

      let passandoPelaPorta = false;

      for (const vao of this.vaos) {
        // A porta tem que estar nesta parede e o ponto dentro do vao dela.
        const naPorta = pontoMaisProximoDoSegmento(ponto, vao.a, vao.b);
        if (naPorta.distancia <= espessura + RAIO_PESSOA &&
            naPorta.t > 0.02 && naPorta.t < 0.98) {
          passandoPelaPorta = true;
          break;
        }
      }

      if (!passandoPelaPorta) return false;
    }

    return true;
  }

  _andar(delta) {
    if (!this.passeio.isLocked) return;

    const frente = Number(this.teclas.has("KeyW")) - Number(this.teclas.has("KeyS"));
    const lado = Number(this.teclas.has("KeyD")) - Number(this.teclas.has("KeyA"));
    if (frente === 0 && lado === 0) return;

    const correndo = this.teclas.has("ShiftLeft") || this.teclas.has("ShiftRight");
    const passo = VELOCIDADE * (correndo ? 2 : 1) * delta;

    // Direcao pra onde a camera aponta, achatada no chao (sem subir/descer).
    const olhar = new THREE.Vector3();
    this.camera.getWorldDirection(olhar);
    olhar.y = 0;
    olhar.normalize();

    const direita = new THREE.Vector3().crossVectors(olhar, new THREE.Vector3(0, 1, 0));

    const dx = (olhar.x * frente + direita.x * lado) * passo;
    const dz = (olhar.z * frente + direita.z * lado) * passo;

    // Testar um eixo de cada vez faz a pessoa DESLIZAR na parede em vez de
    // travar. Sem isso, encostar de lado numa parede trava o movimento todo.
    const pos = this.camera.position;

    if (this._posicaoLivre(pos.x + dx, pos.z)) pos.x += dx;
    if (this._posicaoLivre(pos.x, pos.z + dz)) pos.z += dz;

    pos.y = ALTURA_OLHO;
  }

  // -------------------------------------------------------------------------
  // EVENTOS E LOOP
  // -------------------------------------------------------------------------

  _ligarEventos() {
    this._aoTeclar = (e) => {
      if (this.modo !== "passeio") return;
      this.teclas.add(e.code);
    };
    this._aoSoltarTecla = (e) => this.teclas.delete(e.code);

    window.addEventListener("keydown", this._aoTeclar);
    window.addEventListener("keyup", this._aoSoltarTecla);

    // Sair do passeio (tecla Esc solta o mouse) volta pra orbita sozinho.
    this.passeio.addEventListener("unlock", () => {
      if (this.modo === "passeio") {
        this.teclas.clear();
        this.definirModo("orbita");
      }
    });

    // O navegador pode recusar a captura do mouse (acontece se a pessoa
    // acabou de sair do passeio com Esc, porque ele impoe uma pausa). Sem
    // tratar isso, o botao ficava escrito "Sair do passeio" e nada andava.
    this._aoFalharCaptura = () => {
      if (this.modo !== "passeio") return;
      this.teclas.clear();
      this.definirModo("orbita");
      this.aoAvisar?.("O navegador nao liberou o mouse agora. Clique de novo em um instante.");
    };

    document.addEventListener("pointerlockerror", this._aoFalharCaptura);

    this._aoRedimensionar = () => this.redimensionar();
    window.addEventListener("resize", this._aoRedimensionar);
  }

  redimensionar() {
    const largura = this.container.clientWidth;
    const altura = this.container.clientHeight;
    if (largura === 0 || altura === 0) return;

    this.camera.aspect = largura / altura;
    this.camera.updateProjectionMatrix();
    this.renderizador.setSize(largura, altura);
  }

  iniciar() {
    if (this.rodando) return;
    this.rodando = true;
    this.relogio.getDelta(); // zera o cronometro

    const quadro = () => {
      if (!this.rodando) return;

      const delta = Math.min(this.relogio.getDelta(), 0.1);

      if (this.modo === "passeio") this._andar(delta);
      else this.orbita.update();

      this.renderizador.render(this.cena, this.camera);
      this.quadroId = requestAnimationFrame(quadro);
    };

    quadro();
  }

  parar() {
    this.rodando = false;
    if (this.quadroId) cancelAnimationFrame(this.quadroId);
  }

  descartar() {
    this.parar();
    window.removeEventListener("keydown", this._aoTeclar);
    window.removeEventListener("keyup", this._aoSoltarTecla);
    window.removeEventListener("resize", this._aoRedimensionar);
    document.removeEventListener("pointerlockerror", this._aoFalharCaptura);
    this.renderizador.dispose();
  }
}
