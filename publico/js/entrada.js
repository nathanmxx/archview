// Tela de login / criar conta.

import { api } from "./api.js";

const pegar = (id) => document.getElementById(id);

const formLogin = pegar("form-login");
const formRegistro = pegar("form-registro");
const avisoLogin = pegar("login-aviso");
const avisoRegistro = pegar("reg-aviso");
const textoAlternar = pegar("texto-alternar");
const linkAlternar = pegar("alternar");

// Se a pessoa ja tem sessao aberta, nem mostra o login.
api.eu().then(() => { location.href = "/home.html"; }).catch(() => {});

function mostrarErro(elemento, mensagem) {
  elemento.textContent = mensagem;
  elemento.classList.remove("ok");
}

// --- Alternar entre login e registro ---------------------------------------

linkAlternar.addEventListener("click", (evento) => {
  evento.preventDefault();

  const indoParaRegistro = formLogin.hidden === false;

  formLogin.hidden = indoParaRegistro;
  formRegistro.hidden = !indoParaRegistro;

  textoAlternar.textContent = indoParaRegistro ? "Ja tem conta?" : "Nao tem conta?";
  linkAlternar.textContent = indoParaRegistro ? "Entrar" : "Criar uma";

  avisoLogin.textContent = "";
  avisoRegistro.textContent = "";
});

// --- Mostrar senha ---------------------------------------------------------

pegar("login-ver").addEventListener("change", (e) => {
  pegar("login-senha").type = e.target.checked ? "text" : "password";
});

pegar("reg-ver").addEventListener("change", (e) => {
  const tipo = e.target.checked ? "text" : "password";
  pegar("reg-senha").type = tipo;
  pegar("reg-confirma").type = tipo;
});

// --- Entrar ----------------------------------------------------------------

formLogin.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  avisoLogin.textContent = "";

  try {
    await api.login(pegar("login-nome").value.trim(), pegar("login-senha").value);
    location.href = "/home.html";
  } catch (erro) {
    mostrarErro(avisoLogin, erro.message);
  }
});

// --- Criar conta -----------------------------------------------------------

formRegistro.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  avisoRegistro.textContent = "";

  const nome = pegar("reg-nome").value.trim();
  const senha = pegar("reg-senha").value;
  const confirma = pegar("reg-confirma").value;

  if (senha !== confirma) {
    mostrarErro(avisoRegistro, "As senhas nao coincidem");
    return;
  }

  try {
    await api.registrar(nome, senha);
    // Ja entra direto: pedir pra pessoa digitar tudo de novo e chato.
    await api.login(nome, senha);
    location.href = "/home.html";
  } catch (erro) {
    mostrarErro(avisoRegistro, erro.message);
  }
});
