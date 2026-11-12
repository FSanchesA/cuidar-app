
"use strict";

/*
========================================================
 CUIDAR - ACOMPANHAMENTO DIARIO
 MAIN.JS - VERSAO 3.0

 Pacientes:
 - GEORGES: tema verde
 - ILMA: tema rosa

 Interface: GitHub Pages
 API: Cloudflare Worker
 Banco: Google Sheets / Apps Script

 Melhorias:
 - Preservacao de rascunhos por paciente e data
 - Atualizacao sem apagar textos digitados
 - Bloqueio contra envios duplicados
 - Feedback durante o salvamento
 - Historico individual
 - Atualizacao automatica a cada 60 segundos

 NAO INSERIR SENHAS OU BRIDGE_SECRET NESTE ARQUIVO.
========================================================
*/

const CONFIG = {
  API_URL:
    "https://cuidar-api.fabricio-cbq.workers.dev/api",

  TIMEZONE: "America/Sao_Paulo",

  REFRESH_MS: 60000
};

const $ = id => document.getElementById(id);

const PATIENTS = {
  GEORGES: "Georges",
  ILMA: "Ilma"
};

const MEALS = {
  cafe: "Café da manhã",
  almoco: "Almoço",
  jantar: "Jantar",
  lanche: "Lanche"
};

const MAIN_MEALS = [
  "cafe",
  "almoco",
  "jantar"
];

const TYPES = {
  ...MEALS,

  pressao: "Pressão arterial",
  glicemia: "Glicemia",
  temperatura: "Temperatura",

  banho: "Banho",
  higiene_bucal: "Higiene bucal",
  urina: "Urina",
  evacuacao: "Evacuação"
};

const CATEGORIES = {
  alimentacao: "Alimentação",
  agua: "Água",
  medicacao: "Medicação",
  sinais_vitais: "Sinais vitais",
  higiene: "Higiene e eliminações",
  consulta: "Consulta",
  exame: "Exame",
  ocorrencia: "Ocorrência"
};

/*
========================================================
 ESTADO DO APLICATIVO
========================================================
*/

const state = {
  patient: "GEORGES",

  screen: "care",

  careDate: "",
  dashDate: "",

  careData: null,
  dashData: null,

  familyToken: null,

  dates: [],

  busy: false,

  lastDay: "",

  requestCounter: 0,

  drafts: {},

  savingMessage: false
};

/*
========================================================
 1. FUNCOES UTILITARIAS
========================================================
*/

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function today() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CONFIG.TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = type =>
    parts.find(part => part.type === type).value;

  return (
    get("year") + "-" +
    get("month") + "-" +
    get("day")
  );
}

function dateLabel(value) {
  if (!value) return "";

  const parts = value.split("-");

  return (
    parts[2] + "/" +
    parts[1] + "/" +
    parts[0]
  );
}

function timeLabel(value) {
  if (!value) return "";

  return String(value).slice(11, 16);
}

function dateTime(value) {
  if (!value) return "";

  const date = String(value).slice(0, 10);

  return (
    dateLabel(date) +
    " às " +
    timeLabel(value)
  );
}

function fullDate(value) {
  if (!value) return "";

  const [year, month, day] =
    value.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day, 12)
  );

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function notify(message, error = false) {
  const element = $("toast");

  if (!element) return;

  element.textContent = message;
  element.classList.toggle("error", error);
  element.hidden = false;

  clearTimeout(notify.timer);

  notify.timer = setTimeout(() => {
    element.hidden = true;
  }, 3500);
}

function showSaving() {
  if (state.savingMessage) return;

  state.savingMessage = true;

  notify("Salvando registro...");
}

function hideSaving() {
  state.savingMessage = false;
}

function setBusy(value) {
  state.busy = value;

  document.querySelectorAll(
    "button"
  ).forEach(button => {
    if (
      button.closest("form") ||
      button.classList.contains("delete") ||
      button.closest(".patient-nav") ||
      button.closest(".datebar")
    ) {
      button.disabled = value;
    }
  });
}

function handleError(error) {
  const message =
    error?.message || "Erro inesperado.";

  notify(message, true);

  if (
    state.screen === "dash" &&
    /sess[aã]o expirada|insira sua senha/i.test(message)
  ) {
    leaveDashboard();
    openLogin();
  }
}

/*
========================================================
 2. COMUNICACAO COM CLOUDFLARE
========================================================
*/

async function api(action, payload = {}) {
  if (!CONFIG.API_URL) {
    throw new Error(
      "A integração com o Google Sheets não foi configurada."
    );
  }

  const response = await fetch(CONFIG.API_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    cache: "no-store",

    body: JSON.stringify({
      action,
      payload
    })
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(
      "O servidor retornou uma resposta inválida."
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      result.error ||
      "Não foi possível concluir a operação."
    );
  }

  return result;
}

/*
========================================================
 3. GERENCIAMENTO DE RASCUNHOS

 Cada paciente e cada data possuem rascunhos
 independentes.

 Os rascunhos ficam somente na memoria da pagina,
 nao sao gravados no GitHub nem no navegador.

 Isso evita que o texto desapareca durante
 atualizacoes automaticas e trocas de tela.
========================================================
*/

function draftKey(
  patient = state.patient,
  date = state.careDate
) {
  return patient + "|" + date;
}

function getDraftStore(
  patient = state.patient,
  date = state.careDate
) {
  const key = draftKey(patient, date);

  if (!state.drafts[key]) {
    state.drafts[key] = {};
  }

  return state.drafts[key];
}

function saveDraftField(id, value) {
  if (!id) return;

  const drafts = getDraftStore();

  drafts[id] = String(value ?? "");
}

function clearDraftField(id) {
  if (!id) return;

  const drafts = getDraftStore();

  delete drafts[id];
}

function captureDrafts() {
  const screen = $("screen-care");

  if (!screen) return;

  const drafts = getDraftStore();

  screen.querySelectorAll(
    "form input, form textarea, form select"
  ).forEach(field => {
    if (!field.id) return;

    drafts[field.id] = field.value;
  });
}

function restoreDrafts() {
  const screen = $("screen-care");

  if (!screen) return;

  const drafts = getDraftStore();

  Object.entries(drafts).forEach(([id, value]) => {
    const field = $(id);

    if (
      field &&
      screen.contains(field) &&
      field.matches("input, textarea, select")
    ) {
      field.value = value;
    }
  });
}

function clearDraftsForForm(form) {
  if (!form) return;

  form.querySelectorAll(
    "input, textarea"
  ).forEach(field => {
    if (!field.id) return;

    clearDraftField(field.id);
    field.value = "";
  });
}

function hasUnsavedDraft() {
  const drafts = getDraftStore();

  return Object.entries(drafts).some(
    ([id, value]) => {
      const field = $(id);

      if (
        !field ||
        !$("screen-care").contains(field)
      ) {
        return false;
      }

      if (field.tagName === "SELECT") {
        return false;
      }

      return String(value).trim() !== "";
    }
  );
}

function isEditingField() {
  const active = document.activeElement;

  if (!active) return false;

  return (
    $("screen-care").contains(active) &&
    active.matches("input, textarea")
  );
}

function shouldProtectDrafts() {
  return (
    hasUnsavedDraft() ||
    isEditingField()
  );
}

function bindDraftProtection() {
  const screen = $("screen-care");

  screen.addEventListener("input", event => {
    const field = event.target;

    if (
      field.matches("input, textarea, select") &&
      field.id
    ) {
      saveDraftField(field.id, field.value);
    }
  });

  screen.addEventListener("change", event => {
    const field = event.target;

    if (
      field.matches("input, textarea, select") &&
      field.id &&
      field.closest("form")
    ) {
      saveDraftField(field.id, field.value);
    }
  });
}

/*
========================================================
 4. CONTROLE DE DATAS
========================================================
*/

function availableDates() {
  const dates = new Set(state.dates);

  const current = today();

  const [year, month, day] =
    current.split("-").map(Number);

  const base = new Date(
    Date.UTC(year, month - 1, day, 12)
  );

  for (let i = 0; i < 60; i++) {
    const date = new Date(base);

    date.setUTCDate(
      base.getUTCDate() - i
    );

    dates.add(
      date.toISOString().slice(0, 10)
    );
  }

  dates.add(current);

  return [...dates]
    .filter(date =>
      /^\d{4}-\d{2}-\d{2}$/.test(date)
    )
    .filter(date => date <= current)
    .sort()
    .reverse();
}

function populateDate(id, selected) {
  const element = $(id);

  if (!element) return;

  const dates = availableDates();

  if (
    selected &&
    !dates.includes(selected)
  ) {
    dates.push(selected);
    dates.sort().reverse();
  }

  element.replaceChildren();

  dates.forEach(date => {
    const option =
      document.createElement("option");

    option.value = date;

    option.textContent =
      date === today()
        ? "Hoje - " + dateLabel(date)
        : dateLabel(date);

    element.appendChild(option);
  });

  element.value = selected;
}

function updateControls() {
  populateDate(
    "care-date",
    state.careDate
  );

  populateDate(
    "dash-date",
    state.dashDate
  );

  $("care-tag").textContent =
    state.careDate === today()
      ? "Hoje"
      : "Histórico";
}

/*
========================================================
 5. SELECAO DE GEORGES E ILMA
========================================================
*/

function applyPatient() {
  const isIlma =
    state.patient === "ILMA";

  document.body.classList.toggle(
    "ilma",
    isIlma
  );

  document.body.classList.toggle(
    "georges",
    !isIlma
  );

  $("patient-georges").classList.toggle(
    "active",
    state.patient === "GEORGES"
  );

  $("patient-ilma").classList.toggle(
    "active",
    isIlma
  );

  const name = PATIENTS[state.patient];

  $("care-title").textContent =
    "Cuidados de " + name;

  $("dash-title").textContent =
    "Dashboard de " + name;

  document.title =
    "Cuidar | " + name;
}

async function selectPatient(patient) {
  if (state.busy) return;

  if (state.patient === patient) return;

  captureDrafts();

  state.patient = patient;

  state.careData = null;
  state.dashData = null;

  state.dates = [];

  state.requestCounter++;

  applyPatient();

  renderCare();

  if (state.screen === "dash") {
    renderDashboard();
    await loadDashboard();
  } else {
    await loadCare();
  }
}

/*
========================================================
 6. EXIBICAO DOS REGISTROS
========================================================
*/

function empty(
  message = "Nenhum registro neste dia."
) {
  return (
    '<div class="empty">' +
    esc(message) +
    "</div>"
  );
}

function filterRecords(category, records) {
  return records
    .filter(record =>
      record.category === category
    )
    .sort((a, b) =>
      String(b.createdAt).localeCompare(
        String(a.createdAt)
      )
    );
}

function recordHTML(record) {
  const name =
    TYPES[record.type] ||
    CATEGORIES[record.category] ||
    "Registro";

  return `
    <div class="record">
      <div class="record-content">

        <strong>${esc(name)}</strong>

        <p>
          ${esc(record.value)}
          ${record.unit ? esc(record.unit) : ""}
        </p>

        ${
          record.notes
            ? `<p>${esc(record.notes)}</p>`
            : ""
        }

        <div class="small">
          Registrado em
          ${esc(dateTime(record.createdAt))}
        </div>

      </div>

      <button
        type="button"
        class="delete"
        data-delete="${esc(record.id)}"
        title="Excluir registro"
        aria-label="Excluir registro"
      >×</button>
    </div>
  `;
}

function renderList(targetId, records) {
  const target = $(targetId);

  if (!target) return;

  target.innerHTML =
    records.length
      ? records.map(recordHTML).join("")
      : empty();
}

/*
========================================================
 7. ALIMENTACAO

 Cafe da manha: 1 por dia
 Almoco: 1 por dia
 Jantar: 1 por dia
 Lanches: ilimitados

 Bloqueio definitivo e validado pelo Apps Script.
========================================================
*/

function renderMeals() {
  const records = filterRecords(
    "alimentacao",
    state.careData?.records || []
  );

  const mainCount =
    MAIN_MEALS.filter(type =>
      records.some(record =>
        record.type === type
      )
    ).length;

  $("meal-counter").textContent =
    mainCount + " de 3";

  const fixedHTML =
    MAIN_MEALS.map(type => {
      const record = records.find(
        item => item.type === type
      );

      if (record) {
        return `
          <div class="meal">

            <div class="meal-title">
              ${esc(MEALS[type])}
            </div>

            <div class="meal-done">

              <div class="done-title">
                ✓ Refeição registrada
              </div>

              <p>${esc(record.value)}</p>

              <div class="small">
                ${esc(dateTime(record.createdAt))}
              </div>

              <div class="actions">

                <button
                  type="button"
                  class="delete"
                  data-delete="${esc(record.id)}"
                  aria-label="Excluir ${esc(MEALS[type])}"
                  title="Excluir refeição"
                >×</button>

                <span class="small">
                  Exclua o registro anterior
                  para lançar novamente.
                </span>

              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="meal">

          <form
            class="meal-form"
            data-meal="${type}"
          >

            <div class="meal-title">
              ${esc(MEALS[type])}
            </div>

            <label for="meal-${type}">
              O que foi ingerido?
            </label>

            <textarea
              id="meal-${type}"
              name="value"
              maxlength="1000"
              required
              placeholder="Descreva os alimentos e bebidas"
            ></textarea>

            <div class="actions">
              <button
                type="submit"
                class="btn-primary"
              >
                Registrar ${esc(MEALS[type])}
              </button>
            </div>

          </form>
        </div>
      `;
    }).join("");

  const snacks = records.filter(
    record => record.type === "lanche"
  );

  const snacksHTML = `
    <div class="meal">

      <form
        class="meal-form"
        data-meal="lanche"
      >

        <div class="meal-title">
          Lanches
        </div>

        <label for="meal-lanche">
          O que foi ingerido?
        </label>

        <textarea
          id="meal-lanche"
          name="value"
          maxlength="1000"
          required
          placeholder="Ex.: Fruta, suco, biscoito..."
        ></textarea>

        <div class="actions">
          <button
            type="submit"
            class="btn-primary"
          >
            + Registrar lanche
          </button>
        </div>

        <p class="subtitle">
          É possível registrar vários lanches
          durante o dia.
        </p>

      </form>

      <div class="section-label">
        Lanches registrados (${snacks.length})
      </div>

      ${
        snacks.length
          ? snacks.map(recordHTML).join("")
          : empty("Nenhum lanche registrado.")
      }

    </div>
  `;

  $("meals-container").innerHTML =
    fixedHTML + snacksHTML;
}

/*
========================================================
 8. RENDERIZACAO DA TELA DE CUIDADOS

 Rascunhos sao restaurados apos reconstruir
 os campos dinamicos.
========================================================
*/

function renderCare() {
  const records =
    state.careData?.records || [];

  const summary =
    state.careData?.summary || {};

  updateControls();

  renderMeals();

  $("water-total").textContent =
    summary.agua?.totalMl || 0;

  const targets = [
    ["water-records", "agua"],
    ["medication-records", "medicacao"],
    ["vital-records", "sinais_vitais"],
    ["hygiene-records", "higiene"],
    ["consultation-records", "consulta"],
    ["exam-records", "exame"],
    ["occurrence-records", "ocorrencia"]
  ];

  targets.forEach(([id, category]) => {
    renderList(
      id,
      filterRecords(category, records)
    );
  });

  restoreDrafts();
}

/*
========================================================
 9. ATUALIZACAO DOS DADOS

 Evita apagar textos durante digitacao.
 Evita misturar respostas antigas com novo paciente.
========================================================
*/

async function loadCare(silent = false) {
  if (state.busy) return;

  if (!CONFIG.API_URL) return;

  if (
    silent &&
    shouldProtectDrafts()
  ) {
    return;
  }

  const patient = state.patient;
  const date = state.careDate;

  const requestId =
    ++state.requestCounter;

  try {
    const data = await api("init", {
      patient,
      date
    });

    if (
      state.patient !== patient ||
      state.careDate !== date ||
      requestId !== state.requestCounter
    ) {
      return;
    }

    // Nao recria o formulario durante digitacao.
    if (
      silent &&
      shouldProtectDrafts()
    ) {
      return;
    }

    state.careData = data;
    state.dates = data.dates || [];

    renderCare();

  } catch (error) {
    if (!silent) {
      handleError(error);
    }
  }
}

/*
========================================================
 10. SALVAR REGISTRO

 - Impede duplo clique
 - Mostra feedback durante gravacao
 - Atualiza apos confirmacao do servidor
 - Preserva rascunhos dos outros formularios
========================================================
*/

async function saveRecord(fields, form = null) {
  if (state.busy) return false;

  const patient = state.patient;
  const date = state.careDate;

  captureDrafts();

  setBusy(true);
  showSaving();

  try {
    await api("save", {
      ...fields,
      patient,
      date
    });

    // Apaga somente o formulario enviado.
    if (form) {
      clearDraftsForForm(form);
    }

    hideSaving();

    notify("Registro salvo com sucesso.");

    // Faz a leitura do novo estado dos registros.
    await refreshCare();

    return true;

  } catch (error) {
    hideSaving();

    handleError(error);

    return false;

  } finally {
    setBusy(false);
  }
}

/*
========================================================
 11. ATUALIZAR APOS SALVAR

 Uma unica atualizacao apos confirmacao.
 Mantem os demais rascunhos.
========================================================
*/

async function refreshCare() {
  const patient = state.patient;
  const date = state.careDate;

  const requestId =
    ++state.requestCounter;

  const data = await api("init", {
    patient,
    date
  });

  if (
    state.patient !== patient ||
    state.careDate !== date ||
    requestId !== state.requestCounter
  ) {
    return;
  }

  state.careData = data;
  state.dates = data.dates || [];

  renderCare();
}

/*
========================================================
 12. EXCLUSAO

 Confirmacao obrigatoria.
 Exclusao logica no Apps Script.
========================================================
*/

async function deleteRecord(id) {
  if (state.busy) return;

  const confirmed = window.confirm(
    "Tem certeza que deseja excluir este lançamento?"
  );

  if (!confirmed) return;

  captureDrafts();

  setBusy(true);

  try {
    await api("delete", {
      id,
      patient: state.patient
    });

    notify("Lançamento excluído.");

    await refreshCare();

  } catch (error) {
    handleError(error);
  } finally {
    setBusy(false);
  }
}

/*
========================================================
 13. SINAIS VITAIS
========================================================
*/

function updateVitalFields(
  preserveValue = false
) {
  const type = $("vital-type").value;

  const options = {
    pressao: [
      "Pressão arterial (mmHg)",
      "Ex.: 120/80"
    ],

    glicemia: [
      "Glicemia (mg/dL)",
      "Ex.: 105"
    ],

    temperatura: [
      "Temperatura (°C)",
      "Ex.: 36,5"
    ]
  };

  const input = $("vital-value");

  $("vital-label").textContent =
    options[type][0];

  input.placeholder =
    options[type][1];

  input.inputMode =
    type === "pressao"
      ? "text"
      : "decimal";

  if (!preserveValue) {
    input.value = "";
    clearDraftField("vital-value");
  }
}

/*
========================================================
 14. FORMULARIOS
========================================================
*/

function bindForms() {

  /*
  ------------------------------------------------------
  ALIMENTACAO
  ------------------------------------------------------
  */

  $("meals-container").addEventListener(
    "submit",
    async event => {
      const form =
        event.target.closest(".meal-form");

      if (!form) return;

      event.preventDefault();

      if (state.busy) return;

      const type = form.dataset.meal;

      const field = form.querySelector(
        'textarea[name="value"]'
      );

      const value = field.value.trim();

      if (!value) {
        notify(
          "Descreva os alimentos ingeridos.",
          true
        );
        return;
      }

      await saveRecord({
        category: "alimentacao",
        type,
        value
      }, form);
    }
  );

  /*
  ------------------------------------------------------
  AGUA
  ------------------------------------------------------
  */

  $("water-value").addEventListener(
    "input",
    event => {
      event.target.value =
        event.target.value
          .replace(/\D/g, "")
          .slice(0, 3);

      saveDraftField(
        "water-value",
        event.target.value
      );
    }
  );

  $("water-form").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      if (state.busy) return;

      const value =
        $("water-value").value.trim();

      if (
        !/^\d{1,3}$/.test(value) ||
        Number(value) < 1
      ) {
        notify(
          "Informe uma quantidade entre 1 e 999 mL.",
          true
        );
        return;
      }

      await saveRecord({
        category: "agua",
        type: "agua",
        value: Number(value)
      }, event.currentTarget);
    }
  );

  /*
  ------------------------------------------------------
  MEDICACAO
  ------------------------------------------------------
  */

  $("medication-form").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      if (state.busy) return;

      const value =
        $("medication-value").value.trim();

      if (!value) {
        notify(
          "Informe a medicação administrada.",
          true
        );
        return;
      }

      await saveRecord({
        category: "medicacao",
        type: "medicacao",
        value
      }, event.currentTarget);
    }
  );

  /*
  ------------------------------------------------------
  SINAIS VITAIS
  ------------------------------------------------------
  */

  $("vital-type").addEventListener(
    "change",
    () => updateVitalFields()
  );

  $("vital-form").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      if (state.busy) return;

      const type =
        $("vital-type").value;

      const value =
        $("vital-value").value.trim();

      if (
        type === "pressao" &&
        !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(value)
      ) {
        notify(
          "Informe a pressão no formato 120/80.",
          true
        );
        return;
      }

      await saveRecord({
        category: "sinais_vitais",
        type,
        value
      }, event.currentTarget);
    }
  );

  /*
  ------------------------------------------------------
  HIGIENE E ELIMINACOES
  ------------------------------------------------------
  */

  $("hygiene-form").addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      if (state.busy) return;

      await saveRecord({
        category: "higiene",
        type: $("hygiene-type").value,
        value: "Realizado",
        notes:
          $("hygiene-note").value.trim()
      }, event.currentTarget);
    }
  );

  /*
  ------------------------------------------------------
  CONSULTAS, EXAMES E OCORRENCIAS
  ------------------------------------------------------
  */

  const textForms = [
    [
      "consultation-form",
      "consultation-value",
      "consulta"
    ],

    [
      "exam-form",
      "exam-value",
      "exame"
    ],

    [
      "occurrence-form",
      "occurrence-value",
      "ocorrencia"
    ]
  ];

  textForms.forEach(
    ([formId, fieldId, category]) => {
      $(formId).addEventListener(
        "submit",
        async event => {
          event.preventDefault();

          if (state.busy) return;

          const value =
            $(fieldId).value.trim();

          if (!value) {
            notify(
              "Preencha a descrição.",
              true
            );
            return;
          }

          await saveRecord({
            category,
            type: category,
            value
          }, event.currentTarget);
        }
      );
    }
  );

  /*
  ------------------------------------------------------
  EXCLUIR QUALQUER REGISTRO
  ------------------------------------------------------
  */

  $("screen-care").addEventListener(
    "click",
    event => {
      const button =
        event.target.closest("[data-delete]");

      if (!button) return;

      deleteRecord(
        button.dataset.delete
      );
    }
  );
}

/*
========================================================
 15. AUTENTICACAO DO DASHBOARD
========================================================
*/

function openLogin() {
  $("login-modal").hidden = false;

  $("family-password").value = "";

  $("family-password").focus();
}

function closeLogin() {
  $("login-modal").hidden = true;

  $("family-password").value = "";
}

async function loginFamily() {
  if (state.busy) return;

  setBusy(true);

  try {
    const result = await api("login", {
      password:
        $("family-password").value
    });

    state.familyToken =
      result.token;

    state.dashDate =
      state.careDate;

    closeLogin();

    showScreen("dash");

    await loadDashboard();

  } catch (error) {
    handleError(error);
  } finally {
    setBusy(false);
  }
}

function leaveDashboard() {
  const token = state.familyToken;

  state.familyToken = null;
  state.dashData = null;

  showScreen("care");

  if (token) {
    api("logout", { token })
      .catch(() => {});
  }
}

/*
========================================================
 16. CONSULTAR DADOS DO DASHBOARD
========================================================
*/

async function loadDashboard(
  silent = false
) {
  if (!state.familyToken) {
    openLogin();
    return;
  }

  if (!CONFIG.API_URL) return;

  const patient = state.patient;
  const date = state.dashDate;
  const token = state.familyToken;

  try {
    const data = await api("list", {
      mode: "familia",
      patient,
      date,
      token
    });

    if (
      state.patient !== patient ||
      state.dashDate !== date ||
      state.familyToken !== token
    ) {
      return;
    }

    state.dashData = data;

    state.dates =
      data.dates || [];

    renderDashboard();

  } catch (error) {
    if (!silent) {
      handleError(error);
    }
  }
}

/*
========================================================
 17. COMPONENTES DO DASHBOARD
========================================================
*/

function dashboardItems(
  target,
  records
) {
  if (!records.length) {
    $(target).innerHTML = empty();
    return;
  }

  $(target).innerHTML =
    records.map(record => {
      const name =
        TYPES[record.type] ||
        CATEGORIES[record.category] ||
        "Registro";

      return `
        <div class="dash-item">

          <strong>
            ${esc(name)}
          </strong>

          <p>
            ${esc(record.value)}
            ${record.unit ? esc(record.unit) : ""}
          </p>

          ${
            record.notes
              ? `<p>${esc(record.notes)}</p>`
              : ""
          }

          <div class="small">
            ${esc(dateTime(record.createdAt))}
          </div>

        </div>
      `;
    }).join("");
}

/*
========================================================
 18. RENDERIZAR DASHBOARD
========================================================
*/

function renderDashboard() {
  const records =
    state.dashData?.records || [];

  const summary =
    state.dashData?.summary || {};

  updateControls();

  $("dash-day").textContent =
    fullDate(state.dashDate);

  $("dash-subtitle").textContent =
    records.length +
    " registros de " +
    PATIENTS[state.patient] +
    ".";

  const mainMeals =
    summary.refeicoesRegistradas || 0;

  $("metric-water").textContent =
    summary.agua?.totalMl || 0;

  $("metric-meals").textContent =
    mainMeals + "/3";

  $("metric-snacks").textContent =
    summary.lanches || 0;

  $("metric-meds").textContent =
    summary.medicacoes?.quantidade || 0;

  $("metric-events").textContent =
    summary.ocorrencias?.quantidade || 0;

  $("metric-total").textContent =
    records.length;

  $("meal-progress").style.width =
    (mainMeals / 3 * 100) + "%";

  renderDashboardMeals(records);

  renderDashboardVitals(records);

  renderDashboardHygiene(records);

  dashboardItems(
    "dash-medications",
    filterRecords(
      "medicacao",
      records
    )
  );

  dashboardItems(
    "dash-health",
    records.filter(record =>
      record.category === "consulta" ||
      record.category === "exame"
    )
  );

  dashboardItems(
    "dash-occurrences",
    filterRecords(
      "ocorrencia",
      records
    )
  );

  renderTimeline(records);
}

/*
========================================================
 19. DASHBOARD - ALIMENTACAO
========================================================
*/

function renderDashboardMeals(records) {
  const meals = records.filter(
    record =>
      record.category === "alimentacao"
  );

  let html =
    MAIN_MEALS.map(type => {
      const record = meals.find(
        item => item.type === type
      );

      return `
        <div class="dash-item">

          <strong>
            ${esc(MEALS[type])}
          </strong>

          <p>
            ${
              record
                ? esc(record.value)
                : "Sem registro neste dia"
            }
          </p>

          ${
            record
              ? `
                <div class="small">
                  ${esc(
                    timeLabel(record.createdAt)
                  )}
                </div>
              `
              : ""
          }

        </div>
      `;
    }).join("");

  const snacks = meals.filter(
    record =>
      record.type === "lanche"
  );

  html += `
    <div class="dash-item">

      <strong>
        Lanches (${snacks.length})
      </strong>

      ${
        snacks.length
          ? snacks.map(record => `
              <p>
                ${esc(timeLabel(record.createdAt))}
                —
                ${esc(record.value)}
              </p>
            `).join("")
          : "<p>Sem registros.</p>"
      }

    </div>
  `;

  $("dash-meals").innerHTML = html;
}

/*
========================================================
 20. DASHBOARD - SINAIS VITAIS
========================================================
*/

function renderDashboardVitals(records) {
  const vitals = filterRecords(
    "sinais_vitais",
    records
  );

  const types = [
    "pressao",
    "glicemia",
    "temperatura"
  ];

  $("dash-vitals").innerHTML =
    types.map(type => {
      const record = vitals.find(
        item => item.type === type
      );

      return `
        <div class="dash-item">

          <strong>
            ${esc(TYPES[type])}
          </strong>

          <p>
            ${
              record
                ? (
                  esc(record.value) +
                  " " +
                  esc(record.unit)
                )
                : "Sem aferição registrada"
            }
          </p>

          ${
            record
              ? `
                <div class="small">
                  ${esc(
                    timeLabel(record.createdAt)
                  )}
                </div>
              `
              : ""
          }

        </div>
      `;
    }).join("");
}

/*
========================================================
 21. DASHBOARD - HIGIENE
========================================================
*/

function renderDashboardHygiene(records) {
  const hygiene = filterRecords(
    "higiene",
    records
  );

  const types = [
    "banho",
    "higiene_bucal",
    "urina",
    "evacuacao"
  ];

  $("dash-hygiene").innerHTML =
    types.map(type => {
      const filtered = hygiene.filter(
        record =>
          record.type === type
      );

      return `
        <div class="dash-item">

          <strong>
            ${esc(TYPES[type])}
          </strong>

          <p>
            ${filtered.length}
            registro(s)
          </p>

          ${
            filtered.length
              ? `
                <div class="small">
                  Último:
                  ${esc(
                    timeLabel(
                      filtered[0].createdAt
                    )
                  )}
                </div>
              `
              : ""
          }

        </div>
      `;
    }).join("");
}

/*
========================================================
 22. LINHA DO TEMPO
========================================================
*/

function renderTimeline(records) {
  const sorted = [...records].sort(
    (a, b) =>
      String(b.createdAt).localeCompare(
        String(a.createdAt)
      )
  );

  $("dash-timeline").innerHTML =
    sorted.length
      ? sorted.map(record => {
          const name =
            TYPES[record.type] ||
            CATEGORIES[record.category] ||
            "Registro";

          return `
            <div class="timeline">

              <div class="small">
                ${esc(
                  timeLabel(record.createdAt)
                )}
              </div>

              <strong>
                ${esc(name)}
              </strong>

              <p>
                ${esc(record.value)}
                ${
                  record.unit
                    ? esc(record.unit)
                    : ""
                }
              </p>

            </div>
          `;
        }).join("")
      : empty();
}

/*
========================================================
 23. NAVEGACAO
========================================================
*/

function showScreen(screen) {
  state.screen = screen;

  $("screen-care").hidden =
    screen !== "care";

  $("screen-dash").hidden =
    screen !== "dash";

  $("nav-care").classList.toggle(
    "active",
    screen === "care"
  );

  $("nav-dash").classList.toggle(
    "active",
    screen === "dash"
  );

  window.scrollTo(0, 0);
}

function changeCareDate(date) {
  if (state.busy) return;

  captureDrafts();

  state.careDate = date;
  state.careData = null;

  state.requestCounter++;

  renderCare();

  loadCare();
}

function changeDashDate(date) {
  if (state.busy) return;

  state.dashDate = date;
  state.dashData = null;

  renderDashboard();

  loadDashboard();
}

/*
========================================================
 24. VIRADA DO DIA

 Apos 00h00:
 - inicia automaticamente o novo dia
 - dados anteriores permanecem no historico
 - novos lancamentos usam a data atual

 Rascunhos do dia anterior nao sao transferidos.
========================================================
*/

function checkMidnight() {
  const current = today();

  if (current === state.lastDay) {
    return;
  }

  captureDrafts();

  const previousDay =
    state.lastDay;

  if (
    state.careDate === previousDay
  ) {
    state.careDate = current;
    state.careData = null;

    state.requestCounter++;

    renderCare();
  }

  if (
    state.dashDate === previousDay
  ) {
    state.dashDate = current;
    state.dashData = null;
  }

  state.lastDay = current;

  if (state.screen === "dash") {
    renderDashboard();
    loadDashboard(true);
  } else {
    loadCare(true);
  }
}

/*
========================================================
 25. EVENTOS DE NAVEGACAO
========================================================
*/

function bindNavigation() {

  $("patient-georges").addEventListener(
    "click",
    () => selectPatient("GEORGES")
  );

  $("patient-ilma").addEventListener(
    "click",
    () => selectPatient("ILMA")
  );

  $("nav-care").addEventListener(
    "click",
    () => {
      if (state.screen === "dash") {
        leaveDashboard();
      } else {
        showScreen("care");
      }
    }
  );

  $("nav-dash").addEventListener(
    "click",
    () => {
      if (state.screen !== "dash") {
        openLogin();
      }
    }
  );

  $("dash-logout").addEventListener(
    "click",
    leaveDashboard
  );

  $("care-today").addEventListener(
    "click",
    () => changeCareDate(today())
  );

  $("dash-today").addEventListener(
    "click",
    () => changeDashDate(today())
  );

  $("care-date").addEventListener(
    "change",
    event => {
      changeCareDate(
        event.target.value
      );
    }
  );

  $("dash-date").addEventListener(
    "change",
    event => {
      changeDashDate(
        event.target.value
      );
    }
  );

  $("login-cancel").addEventListener(
    "click",
    closeLogin
  );

  $("login-form").addEventListener(
    "submit",
    event => {
      event.preventDefault();

      loginFamily();
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape" &&
        !$("login-modal").hidden
      ) {
        closeLogin();
      }
    }
  );

  $("login-modal").addEventListener(
    "click",
    event => {
      if (
        event.target ===
        $("login-modal")
      ) {
        closeLogin();
      }
    }
  );
}

/*
========================================================
 26. ATUALIZACAO AUTOMATICA

 Atualiza a cada 60 segundos.

 Nao atualiza formularios enquanto:
 - o usuario estiver digitando
 - existir algum rascunho pendente
 - houver operacao de gravacao
========================================================
*/

function startAutoRefresh() {
  setInterval(() => {
    if (
      document.hidden ||
      state.busy
    ) {
      return;
    }

    checkMidnight();

    if (state.screen === "dash") {
      loadDashboard(true);
    } else {
      if (!shouldProtectDrafts()) {
        loadCare(true);
      }
    }

  }, CONFIG.REFRESH_MS);
}

/*
========================================================
 27. RETORNO AO APLICATIVO

 Quando o usuario retorna ao Safari:
 - verifica se mudou o dia
 - atualiza sem apagar rascunhos
========================================================
*/

function bindVisibility() {
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        return;
      }

      checkMidnight();

      if (state.screen === "dash") {
        loadDashboard(true);
      } else {
        if (!shouldProtectDrafts()) {
          loadCare(true);
        }
      }
    }
  );
}

/*
========================================================
 28. INICIALIZACAO
========================================================
*/

async function initialize() {
  state.careDate = today();
  state.dashDate = today();
  state.lastDay = today();

  bindDraftProtection();

  bindForms();

  bindNavigation();

  updateVitalFields(true);

  applyPatient();

  showScreen("care");

  // Os formularios aparecem imediatamente.
  renderCare();

  $("connection-alert").hidden =
    Boolean(CONFIG.API_URL);

  // Consulta inicial.
  await loadCare();

  // Monitoramento automatico.
  startAutoRefresh();

  // Atualizacao ao retornar ao aplicativo.
  bindVisibility();
}

document.addEventListener(
  "DOMContentLoaded",
  initialize
);
