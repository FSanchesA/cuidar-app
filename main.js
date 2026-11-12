
"use strict";

/*
 CUIDAR - MAIN.JS
 Versao 4.0 - Dashboard comparativo
 GitHub Pages + Cloudflare Worker + Google Apps Script

 LANCAMENTOS:
  - GEORGES e ILMA independentes
  - Rascunhos preservados durante a sessao
  - Refeicoes fixas bloqueadas apos registro
  - Lanches ilimitados

 DASHBOARD:
  - Senha unica
  - Duas colunas simultaneas
  - Uma data para ambos os idosos
  - Dados consultados separadamente

 Nenhuma senha ou chave privada neste arquivo.
*/

const CONFIG = {
  API_URL: "https://cuidar-api.fabricio-cbq.workers.dev/api",
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

const MAIN_MEALS = ["cafe", "almoco", "jantar"];

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

const state = {
  patient: "GEORGES",
  screen: "care",
  careDate: "",
  dashDate: "",
  careData: null,
  dashboard: {
    GEORGES: null,
    ILMA: null
  },
  familyToken: null,
  careDates: [],
  dashboardDates: [],
  drafts: {},
  busy: false,
  careRequest: 0,
  dashRequest: 0,
  lastDay: "",
  loadingDash: false
};

/* ==================================================
   UTILITARIOS
================================================== */

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

  const get = key =>
    parts.find(p => p.type === key).value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateLabel(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function timeLabel(value) {
  return value ? String(value).slice(11, 16) : "";
}

function dateTime(value) {
  if (!value) return "";
  return dateLabel(String(value).slice(0, 10)) +
    " às " + timeLabel(value);
}

function fullDate(value) {
  if (!value) return "";

  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));

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
  element.textContent = message;
  element.classList.toggle("error", error);
  element.hidden = false;

  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    element.hidden = true;
  }, 3500);
}

function setBusy(value) {
  state.busy = value;

  document.querySelectorAll("button").forEach(button => {
    if (
      button.closest("form") ||
      button.closest(".patient-nav") ||
      button.closest(".datebar") ||
      button.classList.contains("delete")
    ) {
      button.disabled = value;
    }
  });
}

function handleError(error) {
  const message = error?.message || "Erro inesperado.";
  notify(message, true);

  if (
    state.screen === "dash" &&
    /sess[aã]o expirada|insira sua senha/i.test(message)
  ) {
    leaveDashboard();
    openLogin();
  }
}

async function api(action, payload = {}) {
  if (!CONFIG.API_URL) {
    throw Error("A integração ainda não foi configurada.");
  }

  const response = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action, payload })
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw Error("Resposta inválida do servidor.");
  }

  if (!response.ok || !result.ok) {
    throw Error(
      result.error || "Não foi possível concluir a operação."
    );
  }

  return result;
}

function empty(message = "Nenhum registro neste dia.") {
  return `<div class="empty">${esc(message)}</div>`;
}

function filterRecords(category, records) {
  return records
    .filter(r => r.category === category)
    .sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
}

/* ==================================================
   RASCUNHOS SEPARADOS POR IDOSO E DATA
================================================== */

function draftKey() {
  return state.patient + "|" + state.careDate;
}

function drafts() {
  const key = draftKey();
  if (!state.drafts[key]) state.drafts[key] = {};
  return state.drafts[key];
}

function captureDrafts() {
  const store = drafts();

  $("screen-care").querySelectorAll(
    "form input, form textarea, form select"
  ).forEach(field => {
    if (field.id) store[field.id] = field.value;
  });
}

function restoreDrafts() {
  const store = drafts();

  Object.entries(store).forEach(([id, value]) => {
    const field = $(id);

    if (
      field &&
      $("screen-care").contains(field) &&
      field.matches("input,textarea,select")
    ) {
      field.value = value;
    }
  });
}

function clearFormDraft(form) {
  if (!form) return;

  const store = drafts();

  form.querySelectorAll("input,textarea").forEach(field => {
    if (field.id) {
      delete store[field.id];
      field.value = "";
    }
  });
}

function hasDraft() {
  const store = drafts();

  return Object.entries(store).some(([id, value]) => {
    const field = $(id);

    return (
      field &&
      $("screen-care").contains(field) &&
      field.matches("input,textarea") &&
      String(value).trim() !== ""
    );
  });
}

function isTyping() {
  const active = document.activeElement;

  return Boolean(
    active &&
    $("screen-care").contains(active) &&
    active.matches("input,textarea")
  );
}

function bindDrafts() {
  const screen = $("screen-care");

  screen.addEventListener("input", event => {
    const field = event.target;

    if (field.closest("form") && field.id) {
      drafts()[field.id] = field.value;
    }
  });

  screen.addEventListener("change", event => {
    const field = event.target;

    if (field.closest("form") && field.id) {
      drafts()[field.id] = field.value;
    }
  });
}

/* ==================================================
   DATAS
================================================== */

function availableDates(extra = []) {
  const current = today();
  const dates = new Set(extra);

  const [y, m, d] = current.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12));

  for (let i = 0; i < 60; i++) {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() - i);
    dates.add(day.toISOString().slice(0, 10));
  }

  dates.add(current);

  return [...dates]
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .filter(d => d <= current)
    .sort()
    .reverse();
}

function fillDate(id, selected, dates) {
  const select = $(id);
  const all = availableDates(dates);

  if (selected && !all.includes(selected)) {
    all.push(selected);
    all.sort().reverse();
  }

  select.replaceChildren();

  all.forEach(date => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = date === today()
      ? "Hoje - " + dateLabel(date)
      : dateLabel(date);
    select.appendChild(option);
  });

  select.value = selected;
}

function updateDates() {
  fillDate("care-date", state.careDate, state.careDates);
  fillDate("dash-date", state.dashDate, state.dashboardDates);

  $("care-tag").textContent =
    state.careDate === today() ? "Hoje" : "Histórico";
}

/* ==================================================
   TEMA E NAVEGACAO DOS IDOSOS
================================================== */

function applyTheme() {
  document.body.classList.toggle(
    "dashboard-mode",
    state.screen === "dash"
  );

  document.body.classList.toggle(
    "ilma",
    state.screen === "care" && state.patient === "ILMA"
  );

  document.body.classList.toggle(
    "georges",
    state.screen === "care" && state.patient === "GEORGES"
  );

  $("patient-georges").classList.toggle(
    "active", state.patient === "GEORGES"
  );

  $("patient-ilma").classList.toggle(
    "active", state.patient === "ILMA"
  );

  $("care-title").textContent =
    "Cuidados de " + PATIENTS[state.patient];

  document.title = state.screen === "dash"
    ? "Cuidar | Dashboard da Família"
    : "Cuidar | " + PATIENTS[state.patient];
}

function showScreen(screen) {
  state.screen = screen;

  $("screen-care").hidden = screen !== "care";
  $("screen-dash").hidden = screen !== "dash";

  $("nav-care").classList.toggle("active", screen === "care");
  $("nav-dash").classList.toggle("active", screen === "dash");

  applyTheme();
  window.scrollTo(0, 0);
}

async function selectPatient(patient) {
  if (state.busy || state.patient === patient) return;

  captureDrafts();

  state.patient = patient;
  state.careData = null;
  state.careDates = [];
  state.careRequest++;

  applyTheme();
  renderCare();
  await loadCare();
}

/* ==================================================
   EXIBICAO DOS LANCAMENTOS
================================================== */

function recordHTML(record) {
  const name =
    TYPES[record.type] ||
    CATEGORIES[record.category] ||
    "Registro";

  return `
    <div class="record">
      <div class="record-content">
        <strong>${esc(name)}</strong>
        <p>${esc(record.value)} ${esc(record.unit || "")}</p>
        ${record.notes ? `<p>${esc(record.notes)}</p>` : ""}
        <div class="small">
          Registrado em ${esc(dateTime(record.createdAt))}
        </div>
      </div>
      <button type="button" class="delete"
        data-delete="${esc(record.id)}"
        aria-label="Excluir registro"
        title="Excluir registro">×</button>
    </div>
  `;
}

function renderList(id, records) {
  $(id).innerHTML = records.length
    ? records.map(recordHTML).join("")
    : empty();
}

function renderMeals() {
  const records = filterRecords(
    "alimentacao",
    state.careData?.records || []
  );

  const count = MAIN_MEALS.filter(type =>
    records.some(r => r.type === type)
  ).length;

  $("meal-counter").textContent = count + " de 3";

  const fixed = MAIN_MEALS.map(type => {
    const record = records.find(r => r.type === type);

    if (record) {
      return `
        <div class="meal">
          <div class="meal-title">${esc(MEALS[type])}</div>
          <div class="meal-done">
            <div class="done-title">✓ Refeição registrada</div>
            <p>${esc(record.value)}</p>
            <div class="small">
              ${esc(dateTime(record.createdAt))}
            </div>
            <div class="actions">
              <button type="button" class="delete"
                data-delete="${esc(record.id)}"
                aria-label="Excluir ${esc(MEALS[type])}">×</button>
              <span class="small">
                Exclua o registro anterior para lançar novamente.
              </span>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="meal">
        <form class="meal-form" data-meal="${type}">
          <div class="meal-title">${esc(MEALS[type])}</div>
          <label for="meal-${type}">O que foi ingerido?</label>
          <textarea id="meal-${type}" name="value"
            maxlength="1000" required
            placeholder="Descreva os alimentos e bebidas"></textarea>
          <div class="actions">
            <button type="submit" class="btn-primary">
              Registrar ${esc(MEALS[type])}
            </button>
          </div>
        </form>
      </div>
    `;
  }).join("");

  const snacks = records.filter(r => r.type === "lanche");

  const snackHTML = `
    <div class="meal">
      <form class="meal-form" data-meal="lanche">
        <div class="meal-title">Lanches</div>
        <label for="meal-lanche">O que foi ingerido?</label>
        <textarea id="meal-lanche" name="value"
          maxlength="1000" required
          placeholder="Ex.: Fruta, suco, biscoito..."></textarea>
        <div class="actions">
          <button type="submit" class="btn-primary">
            + Registrar lanche
          </button>
        </div>
        <p class="subtitle">
          É possível registrar vários lanches durante o dia.
        </p>
      </form>
      <div class="section-label">
        Lanches registrados (${snacks.length})
      </div>
      ${snacks.length
        ? snacks.map(recordHTML).join("")
        : empty("Nenhum lanche registrado.")}
    </div>
  `;

  $("meals-container").innerHTML = fixed + snackHTML;
}

function renderCare() {
  const records = state.careData?.records || [];
  const summary = state.careData?.summary || {};

  updateDates();
  renderMeals();

  $("water-total").textContent = summary.agua?.totalMl || 0;

  const sections = [
    ["water-records", "agua"],
    ["medication-records", "medicacao"],
    ["vital-records", "sinais_vitais"],
    ["hygiene-records", "higiene"],
    ["consultation-records", "consulta"],
    ["exam-records", "exame"],
    ["occurrence-records", "ocorrencia"]
  ];

  sections.forEach(([id, category]) => {
    renderList(id, filterRecords(category, records));
  });

  restoreDrafts();
}

/* ==================================================
   CARREGAR CUIDADOS SEM APAGAR TEXTOS
================================================== */

async function loadCare(silent = false) {
  if (state.busy || !CONFIG.API_URL) return;
  if (silent && (hasDraft() || isTyping())) return;

  const patient = state.patient;
  const date = state.careDate;
  const requestId = ++state.careRequest;

  try {
    const data = await api("init", { patient, date });

    if (
      state.patient !== patient ||
      state.careDate !== date ||
      requestId !== state.careRequest
    ) return;

    if (isTyping()) return;
    if (silent && hasDraft()) return;

    captureDrafts();
    state.careData = data;
    state.careDates = data.dates || [];
    renderCare();

  } catch (error) {
    if (!silent) handleError(error);
  }
}

/* ==================================================
   SALVAMENTO E EXCLUSAO
================================================== */

async function refreshCare() {
  const patient = state.patient;
  const date = state.careDate;
  const requestId = ++state.careRequest;

  const data = await api("init", { patient, date });

  if (
    state.patient !== patient ||
    state.careDate !== date ||
    requestId !== state.careRequest
  ) return;

  state.careData = data;
  state.careDates = data.dates || [];
  renderCare();
}

async function saveRecord(fields, form = null) {
  if (state.busy) return false;

  captureDrafts();
  setBusy(true);
  notify("Salvando registro...");

  try {
    await api("save", {
      ...fields,
      patient: state.patient,
      date: state.careDate
    });

    if (form) clearFormDraft(form);

    await refreshCare();
    notify("Registro salvo com sucesso.");
    return true;

  } catch (error) {
    handleError(error);
    return false;
  } finally {
    setBusy(false);
  }
}

async function deleteRecord(id) {
  if (state.busy) return;

  if (!window.confirm(
    "Tem certeza que deseja excluir este lançamento?"
  )) return;

  captureDrafts();
  setBusy(true);

  try {
    await api("delete", {
      id,
      patient: state.patient
    });

    await refreshCare();
    notify("Lançamento excluído.");

  } catch (error) {
    handleError(error);
  } finally {
    setBusy(false);
  }
}

/* ==================================================
   CAMPOS DE SINAIS VITAIS
================================================== */

function updateVitalFields(preserve = false) {
  const type = $("vital-type").value;

  const options = {
    pressao: ["Pressão arterial (mmHg)", "Ex.: 120/80"],
    glicemia: ["Glicemia (mg/dL)", "Ex.: 105"],
    temperatura: ["Temperatura (°C)", "Ex.: 36,5"]
  };

  $("vital-label").textContent = options[type][0];
  $("vital-value").placeholder = options[type][1];
  $("vital-value").inputMode =
    type === "pressao" ? "text" : "decimal";

  if (!preserve) {
    $("vital-value").value = "";
    delete drafts()["vital-value"];
  }
}

/* ==================================================
   EVENTOS DOS FORMULARIOS
================================================== */

function bindForms() {
  $("meals-container").addEventListener("submit", async e => {
    const form = e.target.closest(".meal-form");
    if (!form) return;

    e.preventDefault();

    const type = form.dataset.meal;
    const value = form.querySelector(
      'textarea[name="value"]'
    ).value.trim();

    if (!value) {
      notify("Descreva os alimentos ingeridos.", true);
      return;
    }

    await saveRecord({
      category: "alimentacao",
      type,
      value
    }, form);
  });

  $("water-value").addEventListener("input", e => {
    e.target.value = e.target.value
      .replace(/\D/g, "")
      .slice(0, 3);

    drafts()["water-value"] = e.target.value;
  });

  $("water-form").addEventListener("submit", async e => {
    e.preventDefault();

    const value = $("water-value").value.trim();

    if (!/^\d{1,3}$/.test(value) || Number(value) < 1) {
      notify("Informe uma quantidade entre 1 e 999 mL.", true);
      return;
    }

    await saveRecord({
      category: "agua",
      type: "agua",
      value: Number(value)
    }, e.currentTarget);
  });

  $("medication-form").addEventListener("submit", async e => {
    e.preventDefault();

    await saveRecord({
      category: "medicacao",
      type: "medicacao",
      value: $("medication-value").value.trim()
    }, e.currentTarget);
  });

  $("vital-type").addEventListener(
    "change", () => updateVitalFields()
  );

  $("vital-form").addEventListener("submit", async e => {
    e.preventDefault();

    const type = $("vital-type").value;
    const value = $("vital-value").value.trim();

    if (
      type === "pressao" &&
      !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(value)
    ) {
      notify("Informe a pressão no formato 120/80.", true);
      return;
    }

    await saveRecord({
      category: "sinais_vitais",
      type,
      value
    }, e.currentTarget);
  });

  $("hygiene-form").addEventListener("submit", async e => {
    e.preventDefault();

    await saveRecord({
      category: "higiene",
      type: $("hygiene-type").value,
      value: "Realizado",
      notes: $("hygiene-note").value.trim()
    }, e.currentTarget);
  });

  const textForms = [
    ["consultation-form", "consultation-value", "consulta"],
    ["exam-form", "exam-value", "exame"],
    ["occurrence-form", "occurrence-value", "ocorrencia"]
  ];

  textForms.forEach(([formId, inputId, category]) => {
    $(formId).addEventListener("submit", async e => {
      e.preventDefault();

      const value = $(inputId).value.trim();
      if (!value) return;

      await saveRecord({
        category,
        type: category,
        value
      }, e.currentTarget);
    });
  });

  $("screen-care").addEventListener("click", e => {
    const button = e.target.closest("[data-delete]");

    if (button) deleteRecord(button.dataset.delete);
  });
}

/* ==================================================
   SENHA UNICA DO DASHBOARD
================================================== */

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
      password: $("family-password").value
    });

    state.familyToken = result.token;
    state.dashDate = state.careDate;

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
  state.dashboard.GEORGES = null;
  state.dashboard.ILMA = null;
  state.dashRequest++;

  showScreen("care");

  if (token) {
    api("logout", { token }).catch(() => {});
  }
}

/* ==================================================
   CONSULTAR GEORGES E ILMA SIMULTANEAMENTE
================================================== */

async function loadDashboard(silent = false) {
  if (!state.familyToken) {
    openLogin();
    return;
  }

  if (!CONFIG.API_URL) return;
  if (state.loadingDash) return;

  const date = state.dashDate;
  const token = state.familyToken;
  const requestId = ++state.dashRequest;

  state.loadingDash = true;
  if (!silent) $("dash-loading").hidden = false;

  try {
    const [georges, ilma] = await Promise.all([
      api("list", {
        mode: "familia",
        patient: "GEORGES",
        date,
        token
      }),
      api("list", {
        mode: "familia",
        patient: "ILMA",
        date,
        token
      })
    ]);

    if (
      date !== state.dashDate ||
      token !== state.familyToken ||
      requestId !== state.dashRequest
    ) return;

    state.dashboard.GEORGES = georges;
    state.dashboard.ILMA = ilma;

    state.dashboardDates = [
      ...new Set([
        ...(georges.dates || []),
        ...(ilma.dates || [])
      ])
    ];

    renderDashboard();

  } catch (error) {
    if (!silent) {
      $("summary-georges").textContent = "Falha na atualização";
      $("summary-ilma").textContent = "Falha na atualização";
      handleError(error);
    }
  } finally {
    state.loadingDash = false;
    $("dash-loading").hidden = true;
  }
}

/* ==================================================
   COMPONENTES DO DASHBOARD COMPARATIVO
================================================== */

function compMetric(label, value, unit = "", percent = null) {
  return `
    <div class="comp-metric">
      <div class="comp-label">${esc(label)}</div>
      <div class="comp-value">${esc(value)}</div>
      <div class="comp-unit">${esc(unit)}</div>
      ${percent === null ? "" : `
        <div class="comp-progress">
          <div style="width:${Math.max(0,Math.min(100,percent))}%"></div>
        </div>
      `}
    </div>
  `;
}

function compSection(title, content) {
  return `
    <section class="comp-section">
      <h3>${esc(title)}</h3>
      ${content}
    </section>
  `;
}

function compRecord(title, value, time = "", notes = "") {
  return `
    <div class="comp-record">
      <strong>${esc(title)}</strong>
      <p>${esc(value)}</p>
      ${notes ? `<p>${esc(notes)}</p>` : ""}
      ${time ? `<div class="small">${esc(time)}</div>` : ""}
    </div>
  `;
}

function compEmpty(message = "Sem registro neste dia") {
  return `<div class="comp-empty">${esc(message)}</div>`;
}

function compList(records) {
  if (!records.length) return compEmpty();

  return records
    .slice()
    .sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    )
    .map(r => compRecord(
      TYPES[r.type] || CATEGORIES[r.category] || "Registro",
      r.value + (r.unit ? " " + r.unit : ""),
      timeLabel(r.createdAt),
      r.notes || ""
    ))
    .join("");
}

/* ==================================================
   PAINEL INDIVIDUAL DENTRO DA COMPARACAO
================================================== */

function buildPatientDashboard(data) {
  const records = data.records || [];
  const summary = data.summary || {};

  const meals = filterRecords("alimentacao", records);
  const water = filterRecords("agua", records);
  const medications = filterRecords("medicacao", records);
  const vitals = filterRecords("sinais_vitais", records);
  const hygiene = filterRecords("higiene", records);
  const occurrences = filterRecords("ocorrencia", records);

  const mealsCount = MAIN_MEALS.filter(type =>
    meals.some(r => r.type === type)
  ).length;

  const snacks = meals.filter(r => r.type === "lanche");

  const totalWater = water.reduce(
    (sum, r) => sum + Number(r.value || 0),
    0
  );

  let html = "";

  html += compMetric("Água ingerida", totalWater + " mL", "Volume registrado");
  html += compMetric(
    "Refeições principais",
    mealsCount + "/3",
    "Café, almoço e jantar",
    mealsCount / 3 * 100
  );
  html += compMetric("Lanches", snacks.length, "Registros do dia");
  html += compMetric("Medicações", medications.length, "Administrações registradas");
  html += compMetric("Sinais vitais", vitals.length, "Aferições registradas");
  html += compMetric("Higiene e eliminações", hygiene.length, "Atividades registradas");
  html += compMetric("Ocorrências", occurrences.length, "Observações registradas");
  html += compMetric("Total do dia", records.length, "Lançamentos");

  const mealsHTML = MAIN_MEALS.map(type => {
    const r = meals.find(item => item.type === type);

    return r
      ? compRecord(MEALS[type], r.value, timeLabel(r.createdAt))
      : compRecord(MEALS[type], "Sem registro");
  }).join("");

  const snacksHTML = snacks.length
    ? snacks.map(r =>
        compRecord("Lanche", r.value, timeLabel(r.createdAt))
      ).join("")
    : compEmpty("Nenhum lanche registrado");

  html += compSection("Alimentação",
    mealsHTML +
    `<div class="section-label">Lanches (${snacks.length})</div>` +
    snacksHTML
  );

  const vitalHTML = ["pressao","glicemia","temperatura"]
    .map(type => {
      const r = vitals.find(item => item.type === type);

      return r
        ? compRecord(
            TYPES[type],
            r.value + " " + (r.unit || ""),
            timeLabel(r.createdAt)
          )
        : compRecord(TYPES[type], "Sem registro");
    })
    .join("");

  html += compSection("Sinais vitais", vitalHTML);

  const hygieneHTML = [
    "banho","higiene_bucal","urina","evacuacao"
  ].map(type => {
    const matches = hygiene.filter(r => r.type === type);
    const latest = matches[0];

    return compRecord(
      TYPES[type],
      matches.length + " registro(s)",
      latest ? "Último: " + timeLabel(latest.createdAt) : ""
    );
  }).join("");

  html += compSection("Higiene e eliminações", hygieneHTML);
  html += compSection("Medicações", compList(medications));

  const healthEvents = records.filter(r =>
    r.category === "consulta" || r.category === "exame"
  );

  html += compSection("Consultas e exames", compList(healthEvents));
  html += compSection("Ocorrências", compList(occurrences));

  const timeline = records.slice().sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  const timelineHTML = timeline.length
    ? timeline.map(r => `
        <div class="comp-timeline">
          <div class="small">${esc(timeLabel(r.createdAt))}</div>
          <strong>${esc(TYPES[r.type] || CATEGORIES[r.category] || "Registro")}</strong>
          <p>${esc(r.value)} ${esc(r.unit || "")}</p>
        </div>
      `).join("")
    : compEmpty();

  html += compSection("Linha do tempo", timelineHTML);

  return html;
}

/* ==================================================
   RENDERIZAR AS DUAS COLUNAS
================================================== */

function renderDashboard() {
  updateDates();

  $("dash-day").textContent = fullDate(state.dashDate);

  const georges = state.dashboard.GEORGES;
  const ilma = state.dashboard.ILMA;

  if (!georges || !ilma) {
    $("summary-georges").textContent = "Carregando registros...";
    $("summary-ilma").textContent = "Carregando registros...";
    $("dashboard-georges").innerHTML = "";
    $("dashboard-ilma").innerHTML = "";
    $("dash-subtitle").textContent =
      "Consultando os cuidados registrados.";
    return;
  }

  $("summary-georges").textContent =
    `${georges.records.length} lançamento(s)`;

  $("summary-ilma").textContent =
    `${ilma.records.length} lançamento(s)`;

  $("dash-subtitle").textContent =
    "Georges e Ilma · " + dateLabel(state.dashDate) +
    " · Atualização independente por idoso.";

  $("dashboard-georges").innerHTML =
    buildPatientDashboard(georges);

  $("dashboard-ilma").innerHTML =
    buildPatientDashboard(ilma);
}

/* ==================================================
   ALTERACAO DE DATA
================================================== */

function changeCareDate(date) {
  if (state.busy) return;

  captureDrafts();

  state.careDate = date;
  state.careData = null;
  state.careRequest++;

  renderCare();
  loadCare();
}

function changeDashDate(date) {
  if (state.busy) return;

  state.dashDate = date;
  state.dashboard.GEORGES = null;
  state.dashboard.ILMA = null;
  state.dashRequest++;

  renderDashboard();
  loadDashboard();
}

/* ==================================================
   VIRADA DO DIA
================================================== */

function checkMidnight() {
  const current = today();
  if (current === state.lastDay) return;

  captureDrafts();

  const previousDay = state.lastDay;

  if (state.careDate === previousDay) {
    state.careDate = current;
    state.careData = null;
    state.careRequest++;
    renderCare();
  }

  if (state.dashDate === previousDay) {
    state.dashDate = current;
    state.dashboard.GEORGES = null;
    state.dashboard.ILMA = null;
    state.dashRequest++;
  }

  state.lastDay = current;

  if (state.screen === "dash") {
    renderDashboard();
    loadDashboard(true);
  } else {
    loadCare(true);
  }
}

/* ==================================================
   NAVEGACAO
================================================== */

function bindNavigation() {
  $("patient-georges").addEventListener("click", () =>
    selectPatient("GEORGES")
  );

  $("patient-ilma").addEventListener("click", () =>
    selectPatient("ILMA")
  );

  $("nav-care").addEventListener("click", () => {
    if (state.screen === "dash") {
      leaveDashboard();
    } else {
      showScreen("care");
    }
  });

  $("nav-dash").addEventListener("click", () => {
    if (state.screen !== "dash") openLogin();
  });

  $("dash-logout").addEventListener("click", leaveDashboard);

  $("care-today").addEventListener("click", () =>
    changeCareDate(today())
  );

  $("dash-today").addEventListener("click", () =>
    changeDashDate(today())
  );

  $("care-date").addEventListener("change", e =>
    changeCareDate(e.target.value)
  );

  $("dash-date").addEventListener("change", e =>
    changeDashDate(e.target.value)
  );

  $("login-cancel").addEventListener("click", closeLogin);

  $("login-form").addEventListener("submit", e => {
    e.preventDefault();
    loginFamily();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("login-modal").hidden) {
      closeLogin();
    }
  });

  $("login-modal").addEventListener("click", e => {
    if (e.target === $("login-modal")) closeLogin();
  });
}

/* ==================================================
   ATUALIZACAO AUTOMATICA
================================================== */

function refreshVisibleScreen() {
  if (document.hidden || state.busy) return;

  checkMidnight();

  if (state.screen === "dash") {
    loadDashboard(true);
  } else if (!hasDraft() && !isTyping()) {
    loadCare(true);
  }
}

function startAutoRefresh() {
  setInterval(refreshVisibleScreen, CONFIG.REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshVisibleScreen();
  });
}

/* ==================================================
   INICIALIZACAO
================================================== */

async function initialize() {
  state.careDate = today();
  state.dashDate = today();
  state.lastDay = today();

  bindDrafts();
  bindForms();
  bindNavigation();

  updateVitalFields(true);

  showScreen("care");
  renderCare();

  $("connection-alert").hidden = Boolean(CONFIG.API_URL);

  await loadCare();

  startAutoRefresh();
}

document.addEventListener("DOMContentLoaded", initialize);
