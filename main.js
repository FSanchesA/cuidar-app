
"use strict";

/*
 CUIDAR - MAIN.JS
 Versao 5.1 - Peso corporal
 Georges e Ilma | GitHub Pages + Cloudflare + Apps Script

 Preserva:
 - Dashboard comparativo sem senha
 - Lancamentos separados por idoso
 - Historico por data
 - Rascunhos por pessoa e dia
 - Atualizacao automatica em 60 segundos
 - Refeicoes principais com registro unico
 - Lanches ilimitados
 - Agua, medicacoes, sinais vitais e higiene
 - Consultas, exames e ocorrencias

 Acrescenta:
 - Peso corporal em quilogramas
 - Historico de pesagens na data selecionada
 - Indicador e secao de peso no Dashboard
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
  peso: "Peso corporal",
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
  careDates: [],
  dashboardDates: [],
  drafts: {},
  busy: false,
  careRequest: 0,
  dashRequest: 0,
  lastDay: ""
};

/* UTILITARIOS */

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
    parts.find(p => p.type === type).value;

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
  const node = $("toast");
  if (!node) return;

  node.textContent = message;
  node.classList.toggle("error", error);
  node.hidden = false;

  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    node.hidden = true;
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
  notify(error?.message || "Erro inesperado.", true);
}

async function api(action, payload = {}) {
  if (!CONFIG.API_URL) {
    throw Error("Integração com Google Sheets não configurada.");
  }

  const response = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify({ action, payload })
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw Error("O servidor retornou uma resposta inválida.");
  }

  if (!response.ok || !result.ok) {
    throw Error(
      result.error || "Não foi possível concluir a operação."
    );
  }

  return result;
}

/* RASCUNHOS */

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

  updateVitalFields(true);
}

function clearFormDraft(form) {
  if (!form) return;

  const store = drafts();

  form.querySelectorAll("input,textarea").forEach(field => {
    if (!field.id) return;
    delete store[field.id];
    field.value = "";
  });
}

function hasDraft() {
  return Object.entries(drafts()).some(([id, value]) => {
    const field = $(id);
    return Boolean(
      field &&
      $("screen-care").contains(field) &&
      field.matches("input,textarea") &&
      String(value).trim()
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

  for (const eventType of ["input", "change"]) {
    screen.addEventListener(eventType, event => {
      const field = event.target;
      if (field.closest("form") && field.id) {
        drafts()[field.id] = field.value;
      }
    });
  }
}

/* CONTROLE DE DATAS */

function availableDates(extra = []) {
  const current = today();
  const dates = new Set(extra);
  const [y, m, d] = current.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12));

  for (let i = 0; i < 60; i++) {
    const date = new Date(base);
    date.setUTCDate(base.getUTCDate() - i);
    dates.add(date.toISOString().slice(0, 10));
  }

  dates.add(current);

  return [...dates]
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .filter(d => d <= current)
    .sort()
    .reverse();
}

function fillDate(id, selected, extra = []) {
  const element = $(id);
  const dates = availableDates(extra);

  if (selected && !dates.includes(selected)) {
    dates.push(selected);
    dates.sort().reverse();
  }

  element.replaceChildren();

  dates.forEach(date => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = date === today()
      ? "Hoje - " + dateLabel(date)
      : dateLabel(date);
    element.appendChild(option);
  });

  element.value = selected;
}

function updateDates() {
  fillDate("care-date", state.careDate, state.careDates);
  fillDate("dash-date", state.dashDate, state.dashboardDates);

  $("care-tag").textContent =
    state.careDate === today() ? "Hoje" : "Histórico";
}

/* TEMA VISUAL */

function applyTheme() {
  const dashboard = state.screen === "dash";

  document.body.classList.toggle(
    "dashboard-mode", dashboard
  );

  document.body.classList.toggle(
    "ilma",
    !dashboard && state.patient === "ILMA"
  );

  document.body.classList.toggle(
    "georges",
    !dashboard && state.patient === "GEORGES"
  );

  $("patient-georges").classList.toggle(
    "active", state.patient === "GEORGES"
  );

  $("patient-ilma").classList.toggle(
    "active", state.patient === "ILMA"
  );

  $("care-title").textContent =
    "Cuidados de " + PATIENTS[state.patient];

  document.title = dashboard
    ? "Cuidar | Dashboard da Família"
    : "Cuidar | " + PATIENTS[state.patient];
}

/* NAVEGACAO */

function showScreen(screen) {
  state.screen = screen;

  $("screen-care").hidden = screen !== "care";
  $("screen-dash").hidden = screen !== "dash";

  $("nav-care").classList.toggle(
    "active", screen === "care"
  );
  $("nav-dash").classList.toggle(
    "active", screen === "dash"
  );

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

function openDashboard() {
  if (state.screen === "dash" || state.busy) return;

  captureDrafts();
  state.dashDate = state.careDate;

  showScreen("dash");
  renderDashboard();
  loadDashboard();
}

function closeDashboard() {
  state.dashRequest++;
  showScreen("care");
  loadCare();
}

/* COMPONENTES DE REGISTROS */

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

function weightRecords(records) {
  return records
    .filter(r =>
      r.category === "sinais_vitais" &&
      r.type === "peso"
    )
    .sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
}

function formatWeight(value) {
  return String(value ?? "").replace(".", ",") + " kg";
}

function recordHTML(record) {
  const name =
    TYPES[record.type] ||
    CATEGORIES[record.category] ||
    "Registro";

  const unit = record.type === "peso"
    ? "kg"
    : record.unit || "";

  return `
    <div class="record">
      <div class="record-content">
        <strong>${esc(name)}</strong>
        <p>${esc(record.value)} ${esc(unit)}</p>
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

/* ALIMENTACAO */

function renderMeals() {
  const records = filterRecords(
    "alimentacao",
    state.careData?.records || []
  );

  const mealCount = MAIN_MEALS.filter(type =>
    records.some(r => r.type === type)
  ).length;

  $("meal-counter").textContent = mealCount + " de 3";

  const fixedMeals = MAIN_MEALS.map(type => {
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

  $("meals-container").innerHTML = fixedMeals + snackHTML;
}

/* RENDERIZACAO DOS CUIDADOS */

function renderCare() {
  const records = state.careData?.records || [];
  const summary = state.careData?.summary || {};

  updateDates();
  renderMeals();

  $("water-total").textContent = summary.agua?.totalMl || 0;

  const ordinaryVitals = records.filter(r =>
    r.category === "sinais_vitais" && r.type !== "peso"
  );

  const weights = weightRecords(records);

  renderList("water-records",
    filterRecords("agua", records));

  renderList("medication-records",
    filterRecords("medicacao", records));

  renderList("vital-records", ordinaryVitals);
  renderList("weight-records", weights);

  renderList("hygiene-records",
    filterRecords("higiene", records));

  renderList("consultation-records",
    filterRecords("consulta", records));

  renderList("exam-records",
    filterRecords("exame", records));

  renderList("occurrence-records",
    filterRecords("ocorrencia", records));

  const currentWeight = weights[0];

  $("weight-current").textContent = currentWeight
    ? formatWeight(currentWeight.value)
    : "Sem registro";

  $("weight-current-date").textContent = currentWeight
    ? "Registrado em " + dateTime(currentWeight.createdAt)
    : "Nenhuma pesagem nesta data.";

  restoreDrafts();
}

/* CONSULTAR CUIDADOS */

async function loadCare(silent = false) {
  if (state.busy || !CONFIG.API_URL) return;

  if (silent && (hasDraft() || isTyping())) return;

  const patient = state.patient;
  const date = state.careDate;
  const requestId = ++state.careRequest;

  try {
    const data = await api("init", { patient, date });

    if (
      patient !== state.patient ||
      date !== state.careDate ||
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

async function refreshCare() {
  const patient = state.patient;
  const date = state.careDate;
  const requestId = ++state.careRequest;

  const data = await api("init", { patient, date });

  if (
    patient !== state.patient ||
    date !== state.careDate ||
    requestId !== state.careRequest
  ) return;

  state.careData = data;
  state.careDates = data.dates || [];
  renderCare();
}

/* SALVAR REGISTROS */

async function saveRecord(fields, form = null) {
  if (state.busy) return false;

  captureDrafts();
  setBusy(true);
  notify("Salvando registro...");

  let saved = false;

  try {
    await api("save", {
      ...fields,
      patient: state.patient,
      date: state.careDate
    });

    saved = true;

    if (form) clearFormDraft(form);

    try {
      await refreshCare();
      notify("Registro salvo com sucesso.");
    } catch {
      notify(
        "Registro salvo. Não foi possível atualizar a tela.",
        true
      );
    }

    return true;

  } catch (error) {
    if (!saved) handleError(error);
    return false;
  } finally {
    setBusy(false);
  }
}

/* EXCLUIR REGISTROS */

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

/* SINAIS VITAIS */

function updateVitalFields(preserve = false) {
  const type = $("vital-type").value;

  const options = {
    pressao: ["Pressão arterial (mmHg)", "Ex.: 120/80"],
    glicemia: ["Glicemia (mg/dL)", "Ex.: 105"],
    temperatura: ["Temperatura (°C)", "Ex.: 36,5"]
  };

  const input = $("vital-value");

  $("vital-label").textContent = options[type][0];
  input.placeholder = options[type][1];

  input.inputMode =
    type === "pressao" ? "text" : "decimal";

  if (!preserve) {
    input.value = "";
    delete drafts()["vital-value"];
  }
}

/* FORMULARIOS */

function bindForms() {
  $("meals-container").addEventListener("submit", async event => {
    const form = event.target.closest(".meal-form");
    if (!form) return;

    event.preventDefault();
    if (state.busy) return;

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

  $("water-value").addEventListener("input", event => {
    event.target.value = event.target.value
      .replace(/\D/g, "")
      .slice(0, 3);

    drafts()["water-value"] = event.target.value;
  });

  $("water-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;

    const value = $("water-value").value.trim();

    if (!/^\d{1,3}$/.test(value) || Number(value) < 1) {
      notify("Informe entre 1 e 999 mL.", true);
      return;
    }

    await saveRecord({
      category: "agua",
      type: "agua",
      value: Number(value)
    }, event.currentTarget);
  });

  $("medication-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;

    const value = $("medication-value").value.trim();

    if (!value) {
      notify("Informe a medicação administrada.", true);
      return;
    }

    await saveRecord({
      category: "medicacao",
      type: "medicacao",
      value
    }, event.currentTarget);
  });

  $("vital-type").addEventListener(
    "change", () => updateVitalFields()
  );

  $("vital-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;

    const type = $("vital-type").value;
    const value = $("vital-value").value.trim();

    if (
      type === "pressao" &&
      !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(value)
    ) {
      notify("Informe a pressão no formato 120/80.", true);
      return;
    }

    if (!value) {
      notify("Informe o resultado da aferição.", true);
      return;
    }

    await saveRecord({
      category: "sinais_vitais",
      type,
      value
    }, event.currentTarget);
  });

  /* NOVO: PESO CORPORAL */

  $("weight-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;

    const text = $("weight-value").value.trim();
    const normalized = text.replace(",", ".");
    const weight = Number(normalized);

    if (
      !/^\d{1,3}(?:[.,]\d{1,2})?$/.test(text) ||
      !Number.isFinite(weight) ||
      weight <= 0 ||
      weight > 500
    ) {
      notify("Informe um peso válido em kg. Ex.: 68,5.", true);
      return;
    }

    await saveRecord({
      category: "sinais_vitais",
      type: "peso",
      value: normalized
    }, event.currentTarget);
  });

  $("hygiene-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (state.busy) return;

    await saveRecord({
      category: "higiene",
      type: $("hygiene-type").value,
      value: "Realizado",
      notes: $("hygiene-note").value.trim()
    }, event.currentTarget);
  });

  const textForms = [
    ["consultation-form", "consultation-value", "consulta"],
    ["exam-form", "exam-value", "exame"],
    ["occurrence-form", "occurrence-value", "ocorrencia"]
  ];

  textForms.forEach(([formId, fieldId, category]) => {
    $(formId).addEventListener("submit", async event => {
      event.preventDefault();
      if (state.busy) return;

      const value = $(fieldId).value.trim();

      if (!value) {
        notify("Preencha a descrição.", true);
        return;
      }

      await saveRecord({
        category,
        type: category,
        value
      }, event.currentTarget);
    });
  });

  $("screen-care").addEventListener("click", event => {
    const button = event.target.closest("[data-delete]");
    if (button) deleteRecord(button.dataset.delete);
  });
}

/* DASHBOARD LIVRE */

async function loadDashboard(silent = false) {
  if (!CONFIG.API_URL) return;

  const date = state.dashDate;
  const requestId = ++state.dashRequest;

  if (!silent) $("dash-loading").hidden = false;

  try {
    const [georges, ilma] = await Promise.all([
      api("init", {
        patient: "GEORGES",
        date
      }),
      api("init", {
        patient: "ILMA",
        date
      })
    ]);

    if (
      date !== state.dashDate ||
      requestId !== state.dashRequest ||
      state.screen !== "dash"
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
    if (requestId === state.dashRequest) {
      $("dash-loading").hidden = true;
    }
  }
}

/* COMPONENTES DO DASHBOARD */

function compMetric(label, value, unit = "", percent = null) {
  const progress = percent === null
    ? ""
    : `
      <div class="comp-progress">
        <div style="width:${Math.max(0, Math.min(100, percent))}%"></div>
      </div>
    `;

  return `
    <div class="comp-metric">
      <div class="comp-label">${esc(label)}</div>
      <div class="comp-value">${esc(value)}</div>
      <div class="comp-unit">${esc(unit)}</div>
      ${progress}
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
    .map(record => {
      const title =
        TYPES[record.type] ||
        CATEGORIES[record.category] ||
        "Registro";

      const unit = record.type === "peso"
        ? "kg"
        : record.unit || "";

      return compRecord(
        title,
        String(record.value ?? "") +
          (unit ? " " + unit : ""),
        timeLabel(record.createdAt),
        record.notes || ""
      );
    })
    .join("");
}

/* DASHBOARD INDIVIDUAL DENTRO DAS DUAS COLUNAS */

function buildPatientDashboard(data) {
  const records = data.records || [];

  const meals = filterRecords("alimentacao", records);
  const water = filterRecords("agua", records);
  const medications = filterRecords("medicacao", records);

  const vitals = filterRecords(
    "sinais_vitais", records
  ).filter(record => record.type !== "peso");

  const weights = weightRecords(records);

  const hygiene = filterRecords("higiene", records);
  const occurrences = filterRecords("ocorrencia", records);

  const mealsCount = MAIN_MEALS.filter(type =>
    meals.some(record => record.type === type)
  ).length;

  const snacks = meals.filter(r => r.type === "lanche");

  const totalWater = water.reduce(
    (sum, record) =>
      sum + (Number(
        String(record.value ?? "").replace(",", ".")
      ) || 0),
    0
  );

  let html = "";

  /* INDICADORES */

  html += compMetric(
    "Água ingerida",
    totalWater + " mL",
    "Volume registrado"
  );

  html += compMetric(
    "Peso corporal",
    weights.length
      ? formatWeight(weights[0].value)
      : "Sem registro",
    weights.length
      ? "Última pesagem na data: " +
        dateTime(weights[0].createdAt)
      : "Sem pesagem na data selecionada"
  );

  html += compMetric(
    "Refeições principais",
    mealsCount + "/3",
    "Café, almoço e jantar",
    mealsCount / 3 * 100
  );

  html += compMetric(
    "Lanches",
    snacks.length,
    "Registros do dia"
  );

  html += compMetric(
    "Medicações",
    medications.length,
    "Administrações"
  );

  html += compMetric(
    "Sinais vitais",
    vitals.length,
    "Aferições"
  );

  html += compMetric(
    "Higiene e eliminações",
    hygiene.length,
    "Atividades"
  );

  html += compMetric(
    "Ocorrências",
    occurrences.length,
    "Observações"
  );

  html += compMetric(
    "Total do dia",
    records.length,
    "Lançamentos"
  );

  /* ALIMENTACAO */

  const mealsHTML = MAIN_MEALS.map(type => {
    const record = meals.find(r => r.type === type);

    return record
      ? compRecord(
          MEALS[type],
          record.value,
          timeLabel(record.createdAt)
        )
      : compRecord(MEALS[type], "Sem registro");
  }).join("");

  const snacksHTML = snacks.length
    ? snacks.map(record =>
        compRecord(
          "Lanche",
          record.value,
          timeLabel(record.createdAt)
        )
      ).join("")
    : compEmpty("Nenhum lanche registrado");

  html += compSection(
    "Alimentação",
    mealsHTML +
    `<div class="section-label">
      Lanches (${snacks.length})
    </div>` +
    snacksHTML
  );

  /* SINAIS VITAIS */

  const vitalHTML = [
    "pressao",
    "glicemia",
    "temperatura"
  ].map(type => {
    const record = vitals.find(r => r.type === type);

    return record
      ? compRecord(
          TYPES[type],
          String(record.value) +
            (record.unit ? " " + record.unit : ""),
          timeLabel(record.createdAt)
        )
      : compRecord(TYPES[type], "Sem registro");
  }).join("");

  html += compSection("Sinais vitais", vitalHTML);

  /* PESO CORPORAL */

  html += compSection(
    "Peso corporal",
    weights.length
      ? compList(weights)
      : compEmpty("Nenhuma pesagem nesta data")
  );

  /* HIGIENE */

  const hygieneHTML = [
    "banho",
    "higiene_bucal",
    "urina",
    "evacuacao"
  ].map(type => {
    const matches = hygiene.filter(r => r.type === type);
    const latest = matches[0];

    return compRecord(
      TYPES[type],
      matches.length + " registro(s)",
      latest
        ? "Último: " + timeLabel(latest.createdAt)
        : ""
    );
  }).join("");

  html += compSection(
    "Higiene e eliminações",
    hygieneHTML
  );

  /* MEDICACOES */

  html += compSection(
    "Medicações",
    compList(medications)
  );

  /* CONSULTAS E EXAMES */

  const healthEvents = records.filter(r =>
    r.category === "consulta" ||
    r.category === "exame"
  );

  html += compSection(
    "Consultas e exames",
    compList(healthEvents)
  );

  /* OCORRENCIAS */

  html += compSection(
    "Ocorrências",
    compList(occurrences)
  );

  /* LINHA DO TEMPO */

  const timeline = records
    .slice()
    .sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );

  const timelineHTML = timeline.length
    ? timeline.map(record => {
        const title =
          TYPES[record.type] ||
          CATEGORIES[record.category] ||
          "Registro";

        const unit = record.type === "peso"
          ? "kg"
          : record.unit || "";

        return `
          <div class="comp-timeline">
            <div class="small">
              ${esc(timeLabel(record.createdAt))}
            </div>
            <strong>${esc(title)}</strong>
            <p>
              ${esc(record.value)}
              ${esc(unit)}
            </p>
          </div>
        `;
      }).join("")
    : compEmpty();

  html += compSection(
    "Linha do tempo",
    timelineHTML
  );

  return html;
}

/* RENDERIZAR O DASHBOARD COMPARATIVO */

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

  const georgesRecords = georges.records || [];
  const ilmaRecords = ilma.records || [];

  $("summary-georges").textContent =
    georgesRecords.length + " lançamento(s)";

  $("summary-ilma").textContent =
    ilmaRecords.length + " lançamento(s)";

  $("dash-subtitle").textContent =
    "Georges e Ilma · " +
    dateLabel(state.dashDate) +
    " · Comparativo do dia.";

  $("dashboard-georges").innerHTML =
    buildPatientDashboard(georges);

  $("dashboard-ilma").innerHTML =
    buildPatientDashboard(ilma);
}

/* ALTERACAO DE DATAS */

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

/* VIRADA DO DIA */

function checkMidnight() {
  const current = today();

  if (current === state.lastDay) return;

  captureDrafts();

  const previousDay = state.lastDay;

  if (state.careDate === previousDay) {
    state.careDate = current;
    state.careData = null;
    state.careRequest++;
  }

  if (state.dashDate === previousDay) {
    state.dashDate = current;

    state.dashboard.GEORGES = null;
    state.dashboard.ILMA = null;
    state.dashRequest++;
  }

  state.lastDay = current;

  renderCare();

  if (state.screen === "dash") {
    renderDashboard();
  }
}

/* EVENTOS DE NAVEGACAO */

function bindNavigation() {
  $("patient-georges").addEventListener(
    "click",
    () => selectPatient("GEORGES")
  );

  $("patient-ilma").addEventListener(
    "click",
    () => selectPatient("ILMA")
  );

  $("nav-care").addEventListener("click", () => {
    if (state.screen === "dash") closeDashboard();
  });

  $("nav-dash").addEventListener(
    "click",
    openDashboard
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
    event => changeCareDate(event.target.value)
  );

  $("dash-date").addEventListener(
    "change",
    event => changeDashDate(event.target.value)
  );
}

/* ATUALIZACAO AUTOMATICA */

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
  setInterval(
    refreshVisibleScreen,
    CONFIG.REFRESH_MS
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        refreshVisibleScreen();
      }
    }
  );
}

/* INICIALIZACAO */

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

  $("connection-alert").hidden =
    Boolean(CONFIG.API_URL);

  await loadCare();

  startAutoRefresh();
}

document.addEventListener(
  "DOMContentLoaded",
  initialize
);
