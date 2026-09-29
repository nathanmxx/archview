// Monta o kit portátil do ArchView para levar num pendrive.
//
// Rodar com:  npm run kit
//
// O resultado é uma pasta pronta para copiar inteira para o pendrive. Ela
// roda em qualquer Windows sem instalar nada: o node.exe vai junto, e as
// bibliotecas (express e three) são JavaScript puro, sem nada compilado.
//
// Rode de novo sempre que mudar o código, senão o pendrive fica com a
// versão velha.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = join(RAIZ, "..", "ArchView-Feira");

// ---------------------------------------------------------------------------

function acharNodeExe() {
  // process.execPath é o node.exe que está rodando este script agora.
  // É a cópia mais confiável: é a mesma versão em que o projeto foi testado.
  if (existsSync(process.execPath)) return process.execPath;
  throw new Error("Nao encontrei o node.exe desta instalacao.");
}

function tamanhoLegivel(caminho) {
  const bytes = statSync(caminho).size;
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

// ---------------------------------------------------------------------------

console.log("\nMontando o kit portatil do ArchView\n");

if (!existsSync(join(RAIZ, "node_modules", "express"))) {
  console.error("As dependencias nao estao instaladas. Rode 'npm install' antes.\n");
  process.exit(1);
}

// Começa do zero para não deixar arquivo velho de uma montagem anterior.
rmSync(DESTINO, { recursive: true, force: true });

const programa = join(DESTINO, "programa");
mkdirSync(programa, { recursive: true });
mkdirSync(join(DESTINO, "backup", "plantas"), { recursive: true });

// --- o programa em si ---
for (const pasta of ["servidor", "publico", "node_modules"]) {
  cpSync(join(RAIZ, pasta), join(programa, pasta), { recursive: true });
}
cpSync(join(RAIZ, "package.json"), join(programa, "package.json"));

// --- o node.exe, que é o que dispensa instalar qualquer coisa ---
const nodeExe = acharNodeExe();
cpSync(nodeExe, join(programa, "node.exe"));

// --- o atalho de um clique ---
// Em .bat o acento depende da página de código do console, então o texto
// aqui vai sem acento de propósito, para não sair quebrado na tela preta.
writeFileSync(join(DESTINO, "ABRIR ARCHVIEW.bat"), [
  "@echo off",
  "title ArchView - NAO FECHE ESTA JANELA",
  'cd /d "%~dp0programa"',
  "",
  'if not exist "node.exe" (',
  "  echo.",
  "  echo   ERRO: o arquivo node.exe nao esta na pasta programa.",
  "  echo   Copie o pendrive inteiro, nao so este atalho.",
  "  echo.",
  "  pause",
  "  exit /b 1",
  ")",
  "",
  "echo.",
  "echo   ============================================",
  "echo     ArchView esta iniciando...",
  "echo.",
  "echo     NAO FECHE ESTA JANELA durante a feira.",
  "echo     O navegador abre sozinho em instantes.",
  "echo   ============================================",
  "echo.",
  "",
  'node.exe servidor\\index.js --abrir',
  "",
  "echo.",
  "echo   O ArchView foi encerrado.",
  "pause",
  "",
].join("\r\n"));

// --- instruções ---
writeFileSync(join(DESTINO, "LEIA-ME.txt"), [
  "ArchView - kit para a feira tecnica",
  "===================================",
  "",
  "COMO ABRIR",
  "",
  "  1. Copie esta pasta inteira para o computador (nao rode direto do",
  "     pendrive se puder evitar: fica mais rapido e mais seguro).",
  "  2. De dois cliques em  ABRIR ARCHVIEW.bat",
  "  3. Espere. O navegador abre sozinho em http://localhost:3000",
  "",
  "  NAO FECHE a janela preta enquanto estiver apresentando. Ela e o",
  "  programa. Fechar a janela desliga o site.",
  "",
  "  Para encerrar no fim: feche a janela preta, ou aperte Ctrl+C nela.",
  "",
  "",
  "NAO PRECISA INSTALAR NADA",
  "",
  "  O node.exe vai junto dentro da pasta programa. Nao precisa de",
  "  internet, nem de instalar Node, nem de senha de administrador.",
  "",
  "",
  "SE DER PROBLEMA",
  "",
  "  A janela preta fecha sozinha na hora",
  "    A pasta foi copiada pela metade. Copie tudo de novo.",
  "",
  "  Diz que a porta 3000 esta em uso",
  "    O programa ja esta aberto em outra janela. Feche a outra.",
  "",
  "  O navegador nao abre sozinho",
  "    Abra o navegador na mao e digite:  localhost:3000",
  "",
  "  Aparece aviso de que nao consegue gravar",
  "    E normal em pendrive protegido. O programa continua funcionando,",
  "    so salva os projetos numa pasta do usuario em vez do pendrive.",
  "",
  "  O antivirus ou a escola bloqueia o arquivo .bat",
  "    Plano B: abra a pasta programa, clique na barra de endereco,",
  "    digite  cmd  e aperte Enter. Na janela que abrir, digite:",
  "",
  "        node.exe servidor\\index.js --abrir",
  "",
  "",
  "BACKUP",
  "",
  "  A pasta backup/plantas guarda os projetos exportados em arquivo.",
  "  Para exportar: dentro do editor, botao da seta para baixo.",
  "  Para abrir de volta: botao da seta para cima.",
  "",
  "  Se o computador principal morrer, esta pasta inteira roda em",
  "  qualquer outro Windows do mesmo jeito.",
  "",
  "",
  "TESTE ANTES DO DIA",
  "",
  "  Leve o pendrive na escola antes da feira e abra o programa no",
  "  computador que voces vao usar. E o unico jeito de descobrir a tempo",
  "  se a maquina bloqueia alguma coisa.",
  "",
].join("\r\n"));

// ---------------------------------------------------------------------------

console.log(`  node.exe   ${tamanhoLegivel(join(programa, "node.exe"))}`);
console.log(`  destino    ${DESTINO}`);
console.log("\nPronto. Copie a pasta inteira para o pendrive.\n");
