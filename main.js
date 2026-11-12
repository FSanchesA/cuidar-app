
"use strict";

/*
 CUIDAR - ACOMPANHAMENTO DIARIO
 Frontend GitHub Pages

 Substituir API_URL apos configurar o Cloudflare.
 NUNCA inserir senhas ou BRIDGE_SECRET aqui.
*/

const CONFIG = {
  API_URL: "",
  TIMEZONE: "America/Sao_Paulo",
  REFRESH_MS: 30000
};

const state = {
  screen: "care",
  careDate: "",
  dashboardDate: "",
  careData: null,
  dashboardData: null,
  familyToken: null,
  busy: false,
  editingMeal: null,
  knownDates: []
};

const MEALS = {
  cafe: "Café da manhã",
  almoco: "Almoço",
  jantar: "Jantar"
};

const TYPES = {
  cafe: "Café da manhã",
  almoco: "Almoço",
  jantar: "Jantar",
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

const $ = id => document.getElementById(id);

function escapeHTML(value) {
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

function dateLabel(date) {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function dateWithWeekday(date) {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));

  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(utc);
}

function timeLabel(timestamp) {
  if (!timestamp) return "";
  const text = String(timestamp);
  return text.slice(11, 16);
}

function displayTimestamp(timestamp) {
  if (!timestamp) return "";
  const text = String(timestamp);
  return dateLabel(text.slice(0, 10)) +
    " às " + timeLabel(text);
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

  document.querySelectorAll(
    'form button[type="submit"]'
  ).forEach(button => {
    button.disabled = value;
  });
}

async function api(action, payload = {}) {
  if (!CONFIG.API_URL) {
    throw new Error(
      "A integração com Cloudflare ainda não foi configurada."
    );
  }

  const response = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, payload }),
    cache: "no-store"
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "A conexão retornou uma resposta inválida."
    );
  }

  if (!response.ok || !data.ok) {
    throw new Error(
      data.error || "Não foi possível concluir a operação."
    );
  }

  return data;
}

function handleError(error) {
  const message = error?.message || "Erro inesperado.";
  notify(message, true);

  if (
    state.screen === "dashboard" &&
    /sess[aã]o expirada|insira sua senha/i.test(message)
  ) {
    leaveDashboard();
    openLogin();
  }
}

function uniqueDates(serverDates = []) {
  const dates = new Set(serverDates);
  const current = today();

  // Permite registrar retroativamente nos ultimos 60 dias,
  // inclusive em dias sem registros anteriores.
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

function fillDates(selectId, selected) {
  const select = $(selectId);
  const dates = uniqueDates(state.knownDates);

  if (!dates.includes(selected)) {
    dates.push(selected);
    dates.sort().reverse();
  }

  select.replaceChildren();

  for (const date of dates) {
    const option = document.createElement("option");
    option.value = date;
    option.textContent =
      date === today() ? "Hoje - " + dateLabel(date) :
      dateLabel(date);

    select.appendChild(option);
  }

  select.value = selected;
}

function updateDateControls() {
  fillDates("care-date", state.careDate);
  fillDates("dashboard-date", state.dashboardDate);

  $("care-status").textContent =
    state.careDate === today() ? "Hoje" : "Histórico";
}

function emptyHTML(message = "Nenhum registro neste dia.") {
  return `<div class="empty">${escapeHTML(message)}</div>`;
}

function recordsBy(category, data = state.careData) {
  return (data?.records || [])
    .filter(record => record.category === category)
    .sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
}

function renderRecords(targetId, records, deletable = true) {
  const target = $(targetId);

  if (!records.length) {
    target.innerHTML = emptyHTML();
    return;
  }

  target.innerHTML = records.map(record => {
    const label = TYPES[record.type] ||
      CATEGORIES[record.category] || "Registro";

    const unit = record.unit ?
      " " + escapeHTML(record.unit) : "";

    return `
      <div class="record">
        <div class="record-main">
          <strong>${escapeHTML(label)}</strong>
          <p>${escapeHTML(record.value)}${unit}</p>
          ${record.notes ?
            `<p>${escapeHTML(record.notes)}</p>` : ""}
          <div class="record-time">
            Registrado em ${escapeHTML(
              displayTimestamp(record.createdAt)
            )}
          </div>
        </div>
        ${deletable ? `
          <button type="button" class="btn-delete"
            data-delete="${escapeHTML(record.id)}"
            aria-label="Excluir registro"
            title="Excluir registro">×</button>` : ""}
      </div>
    `;
  }).join("");
}

/* =====================================================
   LANCAMENTOS
===================================================== */

async function loadCare(silent = false) {
  if (state.busy) return;

  if (!silent) $("care-loading").hidden = false;

  try {
    const requestedDate = state.careDate;
    const data = await api("init", {
      date: requestedDate
    });

    if (state.careDate !== requestedDate) return;

    state.careData = data;
    state.knownDates = data.dates || [];
    renderCare();

  } catch (error) {
    if (!silent) handleError(error);
  } finally {
    $("care-loading").hidden = true;
  }
}

function renderCare() {
  updateDateControls();
  renderMeals();

  const summary = state.careData?.summary || {};
  $("water-total").textContent =
    summary.agua?.totalMl || 0;

  renderRecords("water-records", recordsBy("agua"));
  renderRecords("medication-records", recordsBy("medicacao"));
  renderRecords("vital-records", recordsBy("sinais_vitais"));
  renderRecords("hygiene-records", recordsBy("higiene"));
  renderRecords("consultation-records", recordsBy("consulta"));
  renderRecords("exam-records", recordsBy("exame"));
  renderRecords("occurrence-records", recordsBy("ocorrencia"));
}

function renderMeals() {
  const records = recordsBy("alimentacao");
  const container = $("meals-container");

  $("meal-counter").textContent = `${records.length} de 3`;

  container.innerHTML = Object.entries(MEALS)
    .map(([type, label]) => {
      const existing = records.find(r => r.type === type);
      const editing = state.editingMeal === type;

      if (existing && !editing) {
        return `
          <div class="section-title">${escapeHTML(label)}</div>
          <div class="meal-status">
            <strong>✓ Refeição registrada</strong>
            <p>${escapeHTML(existing.value)}</p>
            <div class="record-time">
              ${escapeHTML(
                displayTimestamp(existing.createdAt)
              )}
            </div>
            <div class="form-actions">
              <button type="button" class="btn-secondary"
                data-edit-meal="${type}">Editar</button>
            </div>
          </div>
        `;
      }

      return `
        <form class="meal-form" data-meal="${type}">
          <div class="section-title">${escapeHTML(label)}</div>
          <label for="meal-${type}">
            O que foi ingerido?
          </label>
          <textarea id="meal-${type}" name="mealValue"
            maxlength="1000"
            placeholder="Descreva os alimentos e bebidas"
            required>${escapeHTML(existing?.value || "")}</textarea>
          <div class="form-actions">
            <button type="submit" class="btn-primary">
              ${existing ? "Salvar alteração" : "Registrar refeição"}
            </button>
            ${editing ? `
              <button type="button" class="btn-cancel"
                data-cancel-meal="1">Cancelar</button>
            ` : ""}
          </div>
        </form>
      `;
    }).join("");
}

async function saveRecord(payload, form = null) {
  if (state.busy) return false;

  setBusy(true);

  try {
    await api("save", {
      ...payload,
      date: state.careDate
    });

    state.editingMeal = null;

    if (form) form.reset();

    notify("Registro salvo com sucesso.");
    await loadAfterSave();
    return true;

  } catch (error) {
    handleError(error);
    return false;
  } finally {
    setBusy(false);
  }
}

async function loadAfterSave() {
  // Atualiza imediatamente, sem depender do temporizador.
  const data = await api("init", {
    date: state.careDate
  });

  state.careData = data;
  state.knownDates = data.dates || [];
  renderCare();
}

async function deleteRecord(id) {
  if (state.busy) return;

  const confirmed = window.confirm(
    "Tem certeza que deseja excluir este lançamento?"
  );

  if (!confirmed) return;

  setBusy(true);

  try {
    await api("delete", { id });
    notify("Lançamento excluído.");
    await loadAfterSave();

  } catch (error) {
    handleError(error);
  } finally {
    setBusy(false);
  }
}

function bindCareForms() {
  $("meals-container").addEventListener("submit", async event => {
    const form = event.target.closest(".meal-form");
    if (!form) return;

    event.preventDefault();

    const type = form.dataset.meal;
    const value = form.elements.mealValue.value.trim();

    const existing = recordsBy("alimentacao")
      .find(r => r.type === type);

    await saveRecord({
      id: existing?.id || "",
      category: "alimentacao",
      type,
      value
    });
  });

  $("meals-container").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-meal]");
    const cancel = event.target.closest("[data-cancel-meal]");

    if (edit) {
      state.editingMeal = edit.dataset.editMeal;
      renderMeals();
    }

    if (cancel) {
      state.editingMeal = null;
      renderMeals();
    }
  });

  $("water-value").addEventListener("input", event => {
    event.target.value = event.target.value
      .replace(/\D/g, "")
      .slice(0, 3);
  });

  $("water-form").addEventListener("submit", async event => {
    event.preventDefault();

    const value = $("water-value").value;

    if (!/^[0-9]{1,3}$/.test(value) || Number(value) < 1) {
      notify("Informe de 1 a 999 mL.", true);
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

    await saveRecord({
      category: "medicacao",
      type: "medicacao",
      value: $("medication-value").value.trim()
    }, event.currentTarget);
  });

  $("vital-type").addEventListener("change", updateVitalInput);

  $("vitals-form").addEventListener("submit", async event => {
    event.preventDefault();

    const type = $("vital-type").value;
    const value = $("vital-value").value.trim();

    if (type === "pressao" && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(value)) {
      notify("Use o formato 120/80.", true);
      return;
    }

    await saveRecord({
      category: "sinais_vitais",
      type,
      value
    }, event.currentTarget);

    updateVitalInput();
  });

  $("hygiene-form").addEventListener("submit", async event => {
    event.preventDefault();

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

  textForms.forEach(([formId, inputId, category]) => {
    $(formId).addEventListener("submit", async event => {
      event.preventDefault();

      await saveRecord({
        category,
        type: category,
        value: $(inputId).value.trim()
      }, event.currentTarget);
    });
  });

  $("screen-care").addEventListener("click", event => {
    const button = event.target.closest("[data-delete]");
    if (button) deleteRecord(button.dataset.delete);
  });
}

function updateVitalInput() {
  const type = $("vital-type").value;
  const input = $("vital-value");
  const label = $("vital-label");

  const options = {
    pressao: ["Pressão arterial (mmHg)", "Ex.: 120/80"],
    glicemia: ["Glicemia (mg/dL)", "Ex.: 105"],
    temperatura: ["Temperatura (°C)", "Ex.: 36,5"]
  };

  label.textContent = options[type][0];
  input.placeholder = options[type][1];
  input.value = "";
  input.inputMode = type === "pressao" ? "text" : "decimal";
}

/* =====================================================
   DASHBOARD E AUTENTICACAO
===================================================== */

function openLogin() {
  $("login-modal").hidden = false;
  $("family-password").value = "";
  $("family-password").focus();
}

function closeLogin() {
  $("login-modal").hidden = true;
  $("family-password").value = "";
}

async function loginFamily(password) {
  if (state.busy) return;

  setBusy(true);

  try {
    const result = await api("login", {
      password
    });

    state.familyToken = result.token;
    state.dashboardDate = state.careDate || today();

    closeLogin();
    showScreen("dashboard");
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
  state.dashboardData = null;

  $("dashboard-content").hidden = true;
  showScreen("care");

  if (token) {
    // Logout em segundo plano, sem bloquear a navegacao.
    api("logout", { token }).catch(() => {});
  }
}

async function loadDashboard(silent = false) {
  if (!state.familyToken) {
    openLogin();
    return;
  }

  if (!silent) $("dashboard-loading").hidden = false;

  try {
    const requestedDate = state.dashboardDate;
    const token = state.familyToken;

    const data = await api("list", {
      date: requestedDate,
      mode: "familia",
      token
    });

    if (
      state.dashboardDate !== requestedDate ||
      state.familyToken !== token
    ) return;

    state.dashboardData = data;
    state.knownDates = data.dates || [];
    renderDashboard();
    $("dashboard-content").hidden = false;

  } catch (error) {
    handleError(error);
  } finally {
    $("dashboard-loading").hidden = true;
  }
}

function renderDashboard() {
  const data = state.dashboardData;
  if (!data) return;

  const summary = data.summary || {};
  const records = data.records || [];

  updateDateControls();

  $("dashboard-day-title").textContent =
    dateWithWeekday(state.dashboardDate);

  $("dashboard-subtitle").textContent =
    `${records.length} lançamento(s) registrado(s) neste dia.`;

  const water = summary.agua?.totalMl || 0;
  const meals = summary.refeicoesRegistradas || 0;
  const meds = summary.medicacoes?.quantidade || 0;
  const occurrences = summary.ocorrencias?.quantidade || 0;

  $("metric-water").textContent = water;
  $("metric-meals").textContent = `${meals}/3`;
  $("metric-medications").textContent = meds;
  $("metric-occurrences").textContent = occurrences;
  $("meals-progress").style.width = `${meals / 3 * 100}%`;

  renderDashboardMeals(records);
  renderDashboardVitals(records);
  renderDashboardHygiene(records);
  renderDashboardList("dash-medications", records,
    ["medicacao"]);
  renderDashboardList("dash-health-events", records,
    ["consulta", "exame"]);
  renderDashboardList("dash-occurrences", records,
    ["ocorrencia"]);
  renderTimeline(records);
}

function renderDashboardMeals(records) {
  const html = Object.entries(MEALS).map(([type, label]) => {
    const record = records.find(r =>
      r.category === "alimentacao" &&
      r.type === type
    );

    return `
      <div class="dash-item">
        <strong>${escapeHTML(label)}</strong>
        <p>${record ?
          escapeHTML(record.value) :
          "Sem registro neste dia"}</p>
        ${record ? `
          <div class="record-time">
            ${escapeHTML(timeLabel(record.createdAt))}
          </div>` : ""}
      </div>
    `;
  }).join("");

  $("dash-meals").innerHTML = html;
}

function renderDashboardVitals(records) {
  const items = ["pressao", "glicemia", "temperatura"];

  $("dash-vitals").innerHTML = items.map(type => {
    const matches = records
      .filter(r =>
        r.category === "sinais_vitais" &&
        r.type === type
      )
      .sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt))
      );

    const record = matches[0];

    return `
      <div class="dash-item">
        <strong>${escapeHTML(TYPES[type])}</strong>
        <p>${record ?
          `${escapeHTML(record.value)} ${escapeHTML(record.unit)}` :
          "Sem aferição registrada"}</p>
        ${record ? `
          <div class="record-time">
            ${escapeHTML(
              displayTimestamp(record.createdAt)
            )}
          </div>` : ""}
      </div>
    `;
  }).join("");
}

function renderDashboardHygiene(records) {
  const types = ["banho", "higiene_bucal", "urina", "evacuacao"];

  $("dash-hygiene").innerHTML = types.map(type => {
    const matches = records.filter(r =>
      r.category === "higiene" &&
      r.type === type
    );

    const count = matches.length;
    const last = matches[count - 1];

    return `
      <div class="dash-item">
        <strong>${escapeHTML(TYPES[type])}</strong>
        <p>${count} registro(s)</p>
        ${last ? `
          <div class="record-time">
            Último registro: ${escapeHTML(
              timeLabel(last.createdAt)
            )}
          </div>` : ""}
      </div>
    `;
  }).join("");
}

function renderDashboardList(target, records, categories) {
  const matches = records
    .filter(r => categories.includes(r.category))
    .sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );

  if (!matches.length) {
    $(target).innerHTML = emptyHTML();
    return;
  }

  $(target).innerHTML = matches.map(r => `
    <div class="dash-item">
      <strong>
        ${escapeHTML(CATEGORIES[r.category])}
        · ${escapeHTML(timeLabel(r.createdAt))}
      </strong>
      <p>${escapeHTML(r.value)}</p>
      ${r.notes ? `
        <p>${escapeHTML(r.notes)}</p>
      ` : ""}
    </div>
  `).join("");
}

function renderTimeline(records) {
  const sorted = [...records].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  if (!sorted.length) {
    $("dash-timeline").innerHTML = emptyHTML();
    return;
  }

  $("dash-timeline").innerHTML = sorted.map(r => {
    const label = TYPES[r.type] ||
      CATEGORIES[r.category] || "Registro";

    return `
      <div class="timeline-item">
        <div class="record-time">
          ${escapeHTML(timeLabel(r.createdAt))}
        </div>
        <strong>${escapeHTML(label)}</strong>
        <p>${escapeHTML(r.value)}
          ${r.unit ? escapeHTML(r.unit) : ""}
        </p>
      </div>
    `;
  }).join("");
}

/* =====================================================
   NAVEGACAO E ATUALIZACAO
===================================================== */

function showScreen(name) {
  state.screen = name;

  $("screen-care").hidden = name !== "care";
  $("screen-dashboard").hidden = name !== "dashboard";

  $("nav-care").classList.toggle("active", name === "care");
  $("nav-dashboard").classList.toggle(
    "active", name === "dashboard"
  );

  window.scrollTo(0, 0);
}

function changeCareDate(date) {
  state.careDate = date;
  state.editingMeal = null;
  state.careData = null;
  loadCare();
}

function changeDashboardDate(date) {
  state.dashboardDate = date;
  state.dashboardData = null;
  loadDashboard();
}

function bindNavigation() {
  $("nav-care").addEventListener("click", () => {
    if (state.screen === "dashboard") {
      leaveDashboard();
    } else {
      showScreen("care");
    }
  });

  $("nav-dashboard").addEventListener("click", () => {
    if (state.screen === "dashboard") return;
    openLogin();
  });

  $("dashboard-lock").addEventListener("click", leaveDashboard);

  $("care-today").addEventListener("click", () => {
    changeCareDate(today());
  });

  $("dashboard-today").addEventListener("click", () => {
    changeDashboardDate(today());
  });

  $("care-date").addEventListener("change", event => {
    changeCareDate(event.target.value);
  });

  $("dashboard-date").addEventListener("change", event => {
    changeDashboardDate(event.target.value);
  });

  $("login-cancel").addEventListener("click", closeLogin);

  $("login-form").addEventListener("submit", event => {
    event.preventDefault();
    loginFamily($("family-password").value);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !$("login-modal").hidden) {
      closeLogin();
    }
  });
}

function handleMidnight() {
  const current = today();

  // Ao virar o dia, volta automaticamente ao dia atual
  // caso a pessoa estivesse visualizando o dia anterior.
  if (state.careDate !== current) {
    const wasYesterday =
      state.careDate === lastCheckedDay;

    if (wasYesterday && state.screen === "care") {
      changeCareDate(current);
    }
  }

  if (
    state.dashboardDate === lastCheckedDay &&
    state.screen === "dashboard"
  ) {
    changeDashboardDate(current);
  }

  lastCheckedDay = current;
}

let lastCheckedDay = "";

async function initialize() {
  state.careDate = today();
  state.dashboardDate = today();
  lastCheckedDay = today();

  showScreen("care");
  updateVitalInput();
  bindCareForms();
  bindNavigation();

  updateDateControls();

  await loadCare();

  setInterval(() => {
    if (document.hidden || state.busy) return;

    handleMidnight();

    if (state.screen === "care") {
      loadCare(true);
    } else if (state.screen === "dashboard") {
      loadDashboard(true);
    }
  }, CONFIG.REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;

    handleMidnight();

    if (state.screen === "care") {
      loadCare(true);
    } else if (state.familyToken) {
      loadDashboard(true);
    }
  });
}

document.addEventListener("DOMContentLoaded", initialize);
