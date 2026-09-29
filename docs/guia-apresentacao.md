# Guia de apresentação do ArchView

Para estudar antes da feira. Tem o roteiro da demonstração, a explicação de
como cada parte funciona e as perguntas que a banca costuma fazer.

---

## 1. Roteiro da demonstração (4 minutos)

Deixe o servidor rodando e a tela de login aberta **antes** de começar.

1. **Entre na conta.** Diga uma frase só: "a senha não fica guardada no
   banco, fica um código gerado a partir dela".
2. **Crie um projeto** e escolha *Cômodo pronto*. Arraste um retângulo.
   Aponte para a medida que aparece enquanto arrasta.
3. **Desenhe uma parede no meio** dividindo o espaço. Mostre que **as duas
   áreas aparecem sozinhas**, e ninguém digitou 7,5 m².
4. **Coloque uma porta** na parede do meio e uma **janela** na parede de fora.
5. **Arraste um canto da casa.** Mostre que a área muda na hora e que a porta
   acompanha a parede. É o momento mais forte da demonstração.
6. **Ponha dois ou três móveis.**
7. **Ver em 3D.** Gire a maquete.
8. **Entrar e andar.** Atravesse a porta. Mostre que não dá para atravessar
   a parede.

Se algo der errado, `Ctrl+Z` desfaz e você continua sem parar.

---

## 2. As três partes que valem explicar

### A descoberta automática de cômodos

É a parte mais difícil do projeto e a que responde "onde está a computação
aqui?".

O problema: o usuário desenha paredes soltas. Como o programa sabe que
quatro delas formam uma sala?

A solução tem três passos, em `publico/js/geometria.js`:

**Passo 1: quebrar as paredes nos encontros.** Se uma parede termina no
*meio* de outra (um encontro em T), o ponto de encontro não existe para
nenhuma das duas. Antes de tudo, cada parede é recortada em todos os pontos
onde outra encosta nela.

**Passo 2: montar um grafo.** Cada ponta de parede vira um nó, cada trecho
vira uma aresta. Pontas a menos de 1 cm de distância contam como o mesmo nó,
senão um errinho de 2 mm impediria a sala de fechar.

**Passo 3: caminhar sempre virando para o mesmo lado.** Saindo de um nó e
escolhendo sempre o vizinho de maior giro, você contorna exatamente uma
região fechada e volta ao ponto de partida. É como andar com a mão sempre
encostada na parede da direita.

O cômodo clicado é a **menor** região que contém o clique; a maior seria o
contorno da casa inteira.

> **Detalhe bonito:** a "área com sinal" (fórmula do cadarço) sai positiva
> para os cômodos internos e negativa para o contorno externo, porque a
> caminhada percorre um no sentido contrário do outro. Então dá para separar
> os dois só olhando o sinal, sem comparar tamanhos.

### As portas e janelas são buracos de verdade

No 3D a parede não é uma caixa só. Ela é **fatiada**: um pedaço antes do vão,
um pedaço depois, a verga em cima da porta e o peitoril embaixo da janela.

```
parede inteira:   [##########################]
com uma porta:    [######]        [##########]
                         [ verga ]
com uma janela:   [######][peitoril][########]
                         [  verga  ]
```

Por isso dá para **andar através da porta** e não através da janela. Não é
efeito visual: a geometria não está lá.

Está em `_construirParede`, no `publico/js/vista3d.js`.

### Uma fonte de dados só

O 2D e o 3D não são dois programas. É a mesma lista de elementos, lida de
dois jeitos. Uma parede é `{a, b, altura, espessura}`: no 2D vira um traço
grosso, no 3D vira uma caixa esticada.

As coordenadas ficam em **metros**, não em pixels. É o que faz as medidas na
tela serem medidas reais.

E o piso **não é guardado**: ele é recalculado a partir das paredes a cada
quadro. Foi uma decisão consciente: quando o piso era um polígono próprio,
mover uma parede deixava ele para trás.

---

## 3. Perguntas prováveis da banca

**"Por que vocês saíram do Godot?"**
Godot é feito para jogos. O que a gente precisava era de interface, banco de
dados e acesso pela rede. Além disso, na versão em Godot a senha do banco
ficava dentro do próprio programa, e qualquer pessoa com o executável tinha
acesso total ao banco. Na versão web só o servidor fala com o banco.

**"A senha está segura?"**
Não guardamos a senha. Guardamos o resultado do `scrypt` sobre ela, junto de
um "sal" aleatório. É uma função de mão única: dá para conferir se a senha
bate, mas não dá para voltar do código para a senha. O sal faz com que duas
pessoas com a mesma senha tenham códigos diferentes.

**"E se alguém trocar o número do projeto na URL?"**
Não abre. O id do usuário entra em toda consulta ao banco, então um projeto
que não é seu simplesmente não é encontrado.

**"Isso usa inteligência artificial?"**
Não. É geometria computacional: grafos e polígonos. A detecção de cômodos é
um algoritmo determinístico: mesma planta, mesmo resultado, sempre.

**"Quanto do código é de biblioteca pronta?"**
Só o desenho 3D (Three.js) e o servidor web (Express). O algoritmo de
detecção de cômodos, o editor 2D inteiro, o recorte das paredes e o catálogo
de móveis são nossos.

**"Funciona sem internet?"**
Sim. O Three.js é servido da pasta do projeto, não de um site externo.

**"Já existe programa que faz isso."**
Existe, e a gente estudou um. Fale disso antes de perguntarem; veja a
seção 5.

---

## 5. Sobre o openPlan3D

Existe um projeto open source com proposta muito parecida:
`github.com/laanlabs/openPlan3D`. **Cite ele você mesmo, antes que alguém
pergunte.** Se um avaliador conhecer ou pesquisar depois, é muito melhor que
tenha ouvido de você primeiro. Assumir vira prova de que vocês pesquisaram;
esconder vira suspeita.

Como falar: *"pesquisamos o que já existe. O mais próximo é o openPlan3D.
Estudamos ele e fizemos escolhas diferentes."*

**O que ele tem e nós não:** exportação em DXF para AutoCAD, escadas,
camadas, seleção múltipla com alinhamento, texturas, e um app de iPhone que
escaneia o cômodo com LiDAR. É um projeto grande, feito por gente com muito
mais tempo.

**A diferença de escolha, que vocês sabem defender:** o openPlan3D **não tem
contas nem servidor de propósito**: tudo fica no navegador de quem usa. O
ArchView tem login, banco de dados e projetos por usuário. São decisões
opostas e as duas são legítimas: ele priorizou privacidade e simplicidade,
nós priorizamos várias pessoas usando o mesmo sistema com o trabalho
guardado. Saber justificar a sua escolha vale mais do que ter mais recursos.

**O que aprendemos com ele e aplicamos:** o encaixe nas pontas de parede
(nós só tínhamos grade), a exportação do projeto como arquivo, e o `Tab`
para alternar 2D/3D.

---

## 6. Se der problema na hora

| Problema | O que fazer |
|---|---|
| A porta não entra na parede | Clique mais em cima da linha da parede. |
| "Não achei um cômodo fechado" | Falta parede, ou um canto não encostou. Aproxime as pontas. |
| O 3D abre escuro | Gire a câmera. A casa não tem teto, então de cima entra luz. |
| O passeio não pega o mouse | Clique uma vez dentro da imagem 3D. |
| Travou tudo | `F5`. O trabalho foi salvo sozinho. |
