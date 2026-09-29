# ArchView

Editor de plantas baixas com visualização 3D e passeio em primeira pessoa.

Feito para a feira técnica. Migrado de uma versão anterior em Godot/GDScript.

---

## Como rodar

Precisa do [Node.js](https://nodejs.org) versão 22 ou mais nova.

```bash
npm install
```

```bash
npm start
```

Depois abra **http://localhost:3000** no navegador.

Na primeira vez, clique em "Criar uma" para fazer sua conta. Os dados ficam
no arquivo `dados/archview.db`, criado sozinho.

### Conferir se o principal continua funcionando

```bash
npm test
```

Testa a detecção automática de cômodos, que é a parte que quebra em
silêncio: um erro ali não dá mensagem, só faz o cômodo sumir. Rode depois
de qualquer mudança em `geometria.js` ou `modelo.js`.

### Para abrir de outro aparelho na mesma rede

O servidor já aceita conexões da rede. Descubra o IP da máquina
(`ipconfig` no Windows) e acesse `http://SEU_IP:3000` do celular ou de
outro computador, desde que estejam no mesmo Wi-Fi.

---

## Levar para outro computador (pendrive)

Para rodar num computador que não tem Node instalado (o da escola, por
exemplo:

```bash
npm run kit
```

Isso monta a pasta `ArchView-Feira` ao lado do projeto. Copie ela inteira
para o pendrive. Lá dentro, **ABRIR ARCHVIEW.bat** liga o programa e abre o
navegador sozinho, sem instalar nada e sem precisar de senha de
administrador: o `node.exe` vai junto no kit.

Rode `npm run kit` de novo sempre que mudar o código, senão o pendrive fica
com a versão antiga.

## O que dá para fazer

| Ferramenta | Atalho | O que faz |
|---|---|---|
| Selecionar | `V` | Move elementos. As bolinhas nas pontas redimensionam. |
| Parede | `P` | Arrasta para desenhar. Encadeia: a próxima começa onde a última terminou. `Shift` trava em 45°. |
| Cômodo pronto | `Q` | Arrasta um retângulo e sai com as 4 paredes e o piso. |
| Piso | `C` | Clica dentro de um espaço fechado; o programa descobre o formato. |
| Porta | `D` | Clica numa parede. Vira um vão de verdade no 3D. |
| Janela | `J` | Arrasta sobre a parede para definir a largura. |
| Móveis | `M` | 17 móveis com medidas reais. `R` gira 15°. |
| Texto | `T` | Anotações na planta. |
| Pintar | `B` | Cor de pisos e móveis. |
| Apagar | `E` | Mostra em vermelho o que vai sair. |

Outros atalhos: `Tab` alterna entre a planta e o 3D, `Ctrl+Z` desfaz,
`Ctrl+Shift+Z` refaz, `Delete` apaga o selecionado, `Esc` cancela.

No 3D: **Ver em 3D** mostra a maquete (arraste para girar, roda dá zoom) e
**Entrar e andar** coloca você dentro da casa com `W A S D`.

### Encaixe

A grade tem passo configurável na barra de baixo. Além dela, o desenho
**gruda nas pontas das paredes que já existem** quando o cursor chega perto.
É isso que permite fechar um cômodo mesmo com a grade em "Livre": a detecção
exige que as pontas se encontrem dentro de 1 cm, e só a grade não garante
isso em parede diagonal. Uma bolinha laranja avisa quando vai grudar.

### Levar o projeto para outra máquina

Os três botões ao lado de "Planta 2D":

- **imagem** baixa a planta como PNG, para imprimir ou mandar para alguém;
- **seta para baixo** baixa o projeto inteiro como arquivo `.archview.json`;
- **seta para cima** abre um arquivo desses.

Serve para trabalhar em casa e levar para o computador da apresentação, e
como backup. Importar passa pelo histórico: se abrir o arquivo errado,
`Ctrl+Z` devolve o que estava antes.

---

## Como o projeto está organizado

```
servidor/
  index.js      API e entrega dos arquivos
  banco.js      SQLite, senhas e sessões
publico/
  index.html    login e cadastro
  home.html     lista de projetos
  editor.html   o editor
  js/
    modelo.js     estrutura de dados compartilhada
    geometria.js  detecção automática de cômodos
    editor2d.js   desenho e interação no canvas
    vista3d.js    construção da cena 3D
    moveis.js     catálogo de móveis
    editor.js     junta tudo e salva
    api.js        conversa com o servidor
    home.js       tela inicial
    entrada.js    login
```

### A ideia central

Existe **uma única lista de elementos**. O editor 2D desenha ela, o 3D
levanta ela e o banco guarda ela. Nada é convertido de um formato para
outro, então as duas telas nunca discordam.

As coordenadas ficam em **metros**, não em pixels. O canvas converte para
pixels só na hora de desenhar. Por isso as medidas na tela são medidas reais
e o desenho fica igual em qualquer zoom.

**O piso não é desenhado, é descoberto.** O `geometria.js` monta um grafo com
as paredes e acha as regiões fechadas. Um cômodo é a menor região que contém
o ponto clicado. Por isso mover uma parede muda a área do cômodo sozinho.

---

## Requisitos

- Node.js 22+ (usa o SQLite embutido, `node:sqlite`)
- Um navegador com suporte a WebGL (qualquer um dos últimos anos)

Sem banco de dados para instalar e sem nada para compilar.
