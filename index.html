
"use strict";

/*
 CUIDAR - MAIN.JS
 Georges e Ilma | Frontend GitHub Pages

 ATENCAO:
 Preencher API_URL somente apos configurar o Worker.
 Nao inserir senhas nem BRIDGE_SECRET aqui.
*/

const CONFIG = {
  API_URL: "",
  TIMEZONE: "America/Sao_Paulo",
  REFRESH_MS: 30000
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
  dashData: null,
  familyToken: null,
  dates: [],
  busy: false,
  lastDay: ""
};

/* ===== UTILITARIOS ===== */

function esc(v) {
  return String(v ?? "")
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

  const part = key =>
    parts.find(p => p.type === key).value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateLabel(value) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
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
  const node = $("toast");
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
      button.classList.contains("delete") ||
      button.closest(".patient-nav")
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
    throw Error(
      "A conexão com o Google Sheets ainda não foi configurada."
    );
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

function availableDates() {
  const dates = new Set(state.dates);
  const current = today();

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
    .sort().reverse();
}

function populateDate(id, selected) {
  const el = $(id);
  const dates = availableDates();

  if (selected && !dates.includes(selected)) {
    dates.push(selected);
    dates.sort().reverse();
  }

  el.replaceChildren();

  dates.forEach(date => {
    const opt = document.createElement("option");
    opt.value = date;
    opt.textContent = date === today()
      ? `Hoje - ${dateLabel(date)}`
      : dateLabel(date);
    el.appendChild(opt);
  });

  el.value = selected;
}

function updateControls() {
  populateDate("care-date", state.careDate);
  populateDate("dash-date", state.dashDate);

  $("care-tag").textContent =
    state.careDate === today() ? "Hoje" : "Histórico";
}

/* ===== SELECAO DE IDOSO ===== */

function applyPatient() {
  document.body.classList.toggle(
    "ilma", state.patient === "ILMA"
  );
  document.body.classList.toggle(
    "georges", state.patient === "GEORGES"
  );

  $("patient-georges").classList.toggle(
    "active", state.patient === "GEORGES"
  );
  $("patient-ilma").classList.toggle(
    "active", state.patient === "ILMA"
  );

  const name = PATIENTS[state.patient];

  $("care-title").textContent = `Cuidados de ${name}`;
  $("dash-title").textContent = `Dashboard de ${name}`;
  document.title = `Cuidar | ${name}`;
}

async function selectPatient(patient) {
  if (state.busy || state.patient === patient) return;

  state.patient = patient;
  state.careData = null;
  state.dashData = null;
  state.dates = [];

  applyPatient();
  updateControls();

  // Mostra imediatamente formularios sem registros.
  renderCare();

  if (state.screen === "dash") {
    renderDashboard();
    await loadDashboard();
  } else {
    await loadCare();
  }
}

/* ===== EXIBICAO DOS REGISTROS ===== */

function recordHTML(record) {
  const name = TYPES[record.type] ||
    CATEGORIES[record.category] || "Registro";

  return `
    <div class="record">
      <div class="record-content">
        <strong>${esc(name)}</strong>
        <p>${esc(record.value)}
          ${record.unit ? esc(record.unit) : ""}
        </p>
        ${record.notes ? `<p>${esc(record.notes)}</p>` : ""}
        <div class="small">
          Registrado em ${esc(dateTime(record.createdAt))}
        </div>
      </div>
      <button type="button" class="delete"
        data-delete="${esc(record.id)}"
        title="Excluir registro"
        aria-label="Excluir registro">×</button>
    </div>
  `;
}

function renderList(targetId, records) {
  $(targetId).innerHTML = records.length
    ? records.map(recordHTML).join("")
    : empty();
}

/* ===== ALIMENTACAO ===== */

function renderMeals() {
  const records = filterRecords(
    "alimentacao", state.careData?.records || []
  );

  const mainMeals = ["cafe", "almoco", "jantar"];

  const mainCount = mainMeals.filter(type =>
    records.some(r => r.type === type)
  ).length;

  $("meal-counter").textContent = `${mainCount} de 3`;

  const fixedHTML = mainMeals.map(type => {
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
                aria-label="Excluir ${esc(MEALS[type])}"
                title="Excluir para lançar novamente">×</button>
              <span class="small">
                Para lançar novamente, exclua o registro anterior.
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
          <label for="meal-${type}">
            O que foi ingerido?
          </label>
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

  const snacksHTML = `
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

  $("meals-container").innerHTML = fixedHTML + snacksHTML;
}

/* ===== TELA DE LANCAMENTOS ===== */

function renderCare() {
  const records = state.careData?.records || [];
  const summary = state.careData?.summary || {};

  updateControls();
  renderMeals();

  $("water-total").textContent = summary.agua?.totalMl || 0;

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
    renderList(id, filterRecords(category, records));
  });
}

async function loadCare(silent = false) {
  if (state.busy) return;
  if (!CONFIG.API_URL) return;

  const patient = state.patient;
  const date = state.careDate;

  try {
    const data = await api("init", {
      patient,
      date
    });

    if (
      state.patient !== patient ||
      state.careDate !== date
    ) return;

    state.careData = data;
    state.dates = data.dates || [];
    renderCare();
  } catch (error) {
    if (!silent) handleError(error);
  }
}

/* ===== SALVAR E EXCLUIR ===== */

async function saveRecord(fields) {
  if (state.busy) return false;

  const patient = state.patient;
  const date = state.careDate;

  setBusy(true);

  try {
    await api("save", {
      ...fields,
      patient,
      date
    });

    notify("Registro salvo com sucesso.");
    await refreshCare();
    return true;
  } catch (error) {
    handleError(error);
    return false;
  } finally {
    setBusy(false);
  }
}

async function refreshCare() {
  const data = await api("init", {
    patient: state.patient,
    date: state.careDate
  });

  state.careData = data;
  state.dates = data.dates || [];
  renderCare();
}

async function deleteRecord(id) {
  if (state.busy) return;

  const yes = window.confirm(
    "Tem certeza que deseja excluir este lançamento?"
  );

  if (!yes) return;

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

function updateVitalFields() {
  const type = $("vital-type").value;

  const options = {
    pressao: ["Pressão arterial (mmHg)", "Ex.: 120/80"],
    glicemia: ["Glicemia (mg/dL)", "Ex.: 105"],
    temperatura: ["Temperatura (°C)", "Ex.: 36,5"]
  };

  $("vital-label").textContent = options[type][0];
  $("vital-value").placeholder = options[type][1];
  $("vital-value").value = "";
  $("vital-value").inputMode =
    type === "pressao" ? "text" : "decimal";
}

function bindForms() {
  $("meals-container").addEventListener("submit", async e => {
    const form = e.target.closest(".meal-form");
    if (!form) return;

    e.preventDefault();

    const type = form.dataset.meal;
    const value = form.elements.value.value.trim();

    await saveRecord({
      category: "alimentacao",
      type,
      value
    });
  });

  $("water-value").addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 3);
  });

  $("water-form").addEventListener("submit", async e => {
    e.preventDefault();

    const value = $("water-value").value;

    if (!/^\d{1,3}$/.test(value) || Number(value) === 0) {
      notify("Informe uma quantidade entre 1 e 999 mL.", true);
      return;
    }

    const ok = await saveRecord({
      category: "agua",
      type: "agua",
      value
    });

    if (ok) e.target.reset();
  });

  $("medication-form").addEventListener("submit", async e => {
    e.preventDefault();

    const ok = await saveRecord({
      category: "medicacao",
      type: "medicacao",
      value: $("medication-value").value.trim()
    });

    if (ok) e.target.reset();
  });

  $("vital-type").addEventListener("change", updateVitalFields);

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

    const ok = await saveRecord({
      category: "sinais_vitais",
      type,
      value
    });

    if (ok) updateVitalFields();
  });

  $("hygiene-form").addEventListener("submit", async e => {
    e.preventDefault();

    const ok = await saveRecord({
      category: "higiene",
      type: $("hygiene-type").value,
      value: "Realizado",
      notes: $("hygiene-note").value.trim()
    });

    if (ok) e.target.reset();
  });

  const forms = [
    ["consultation-form", "consultation-value", "consulta"],
    ["exam-form", "exam-value", "exame"],
    ["occurrence-form", "occurrence-value", "ocorrencia"]
  ];

  forms.forEach(([formId, fieldId, category]) => {
    $(formId).addEventListener("submit", async e => {
      e.preventDefault();

      const ok = await saveRecord({
        category,
        type: category,
        value: $(fieldId).value.trim()
      });

      if (ok) e.target.reset();
    });
  });

  $("screen-care").addEventListener("click", e => {
    const button = e.target.closest("[data-delete]");
    if (button) deleteRecord(button.dataset.delete);
  });
}

/* ===== DASHBOARD E SENHA ===== */

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
  state.dashData = null;

  showScreen("care");

  if (token) {
    api("logout", { token }).catch(() => {});
  }
}

async function loadDashboard(silent = false) {
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
    ) return;

    state.dashData = data;
    state.dates = data.dates || [];
    renderDashboard();
  } catch (error) {
    if (!silent) handleError(error);
  }
}

function dashboardItems(target, records) {
  if (!records.length) {
    $(target).innerHTML = empty();
    return;
  }

  $(target).innerHTML = records.map(r => `
    <div class="dash-item">
      <strong>
        ${esc(TYPES[r.type] || CATEGORIES[r.category])}
      </strong>
      <p>${esc(r.value)}
        ${r.unit ? esc(r.unit) : ""}
      </p>
      ${r.notes ? `<p>${esc(r.notes)}</p>` : ""}
      <div class="small">${esc(dateTime(r.createdAt))}</div>
    </div>
  `).join("");
}

function renderDashboard() {
  const records = state.dashData?.records || [];
  const summary = state.dashData?.summary || {};

  updateControls();

  $("dash-day").textContent = fullDate(state.dashDate);
  $("dash-subtitle").textContent =
    `${records.length} registros de ${PATIENTS[state.patient]}.`;

  const principais = summary.refeicoesRegistradas || 0;
  const lanches = summary.lanches || 0;

  $("metric-water").textContent = summary.agua?.totalMl || 0;
  $("metric-meals").textContent = `${principais}/3`;
  $("metric-snacks").textContent = lanches;
  $("metric-meds").textContent =
    summary.medicacoes?.quantidade || 0;
  $("metric-events").textContent =
    summary.ocorrencias?.quantidade || 0;
  $("metric-total").textContent = records.length;
  $("meal-progress").style.width =
    `${principais / 3 * 100}%`;

  renderDashboardMeals(records);
  renderDashboardVitals(records);
  renderDashboardHygiene(records);

  dashboardItems(
    "dash-medications",
    filterRecords("medicacao", records)
  );

  dashboardItems(
    "dash-health",
    records.filter(r =>
      r.category === "consulta" || r.category === "exame"
    )
  );

  dashboardItems(
    "dash-occurrences",
    filterRecords("ocorrencia", records)
  );

  renderTimeline(records);
}

function renderDashboardMeals(records) {
  const meals = records.filter(r =>
    r.category === "alimentacao"
  );

  let html = ["cafe", "almoco", "jantar"].map(type => {
    const record = meals.find(r => r.type === type);

    return `
      <div class="dash-item">
        <strong>${esc(MEALS[type])}</strong>
        <p>${record ?
          esc(record.value) :
          "Sem registro neste dia"}</p>
        ${record ? `
          <div class="small">
            ${esc(timeLabel(record.createdAt))}
          </div>` : ""}
      </div>
    `;
  }).join("");

  const snacks = meals.filter(r => r.type === "lanche");

  html += `
    <div class="dash-item">
      <strong>Lanches (${snacks.length})</strong>
      ${snacks.length ? snacks.map(r => `
        <p>${esc(timeLabel(r.createdAt))} —
          ${esc(r.value)}</p>
      `).join("") : `<p>Sem registros.</p>`}
    </div>
  `;

  $("dash-meals").innerHTML = html;
}

function renderDashboardVitals(records) {
  const vitals = filterRecords("sinais_vitais", records);

  $("dash-vitals").innerHTML =
    ["pressao", "glicemia", "temperatura"].map(type => {
      const record = vitals.find(r => r.type === type);

      return `
        <div class="dash-item">
          <strong>${esc(TYPES[type])}</strong>
          <p>${record ?
            `${esc(record.value)} ${esc(record.unit)}` :
            "Sem aferição registrada"}</p>
          ${record ? `
            <div class="small">
              ${esc(timeLabel(record.createdAt))}
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
}

function renderDashboardHygiene(records) {
  const hygiene = filterRecords("higiene", records);

  $("dash-hygiene").innerHTML =
    ["banho", "higiene_bucal", "urina", "evacuacao"]
      .map(type => {
        const filtered = hygiene.filter(r => r.type === type);

        return `
          <div class="dash-item">
            <strong>${esc(TYPES[type])}</strong>
            <p>${filtered.length} registro(s)</p>
            ${filtered.length ? `
              <div class="small">
                Último: ${esc(timeLabel(filtered[0].createdAt))}
              </div>
            ` : ""}
          </div>
        `;
      }).join("");
}

function renderTimeline(records) {
  const sorted = [...records].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  $("dash-timeline").innerHTML = sorted.length
    ? sorted.map(r => `
      <div class="timeline">
        <div class="small">${esc(timeLabel(r.createdAt))}</div>
        <strong>
          ${esc(TYPES[r.type] || CATEGORIES[r.category])}
        </strong>
        <p>${esc(r.value)}
          ${r.unit ? esc(r.unit) : ""}
        </p>
      </div>
    `).join("")
    : empty();
}

/* ===== NAVEGACAO ===== */

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

  window.scrollTo(0, 0);
}

function changeCareDate(date) {
  if (state.busy) return;
  state.careDate = date;
  state.careData = null;
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

function checkMidnight() {
  const current = today();

  if (current === state.lastDay) return;

  const previousDay = state.lastDay;

  if (state.careDate === previousDay) {
    state.careDate = current;
    state.careData = null;
    renderCare();
  }

  if (state.dashDate === previousDay) {
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

/* ===== INICIALIZACAO ===== */

async function initialize() {
  state.careDate = today();
  state.dashDate = today();
  state.lastDay = today();

  bindForms();
  bindNavigation();
  updateVitalFields();
  applyPatient();
  showScreen("care");

  // Campos de alimentacao aparecem mesmo sem API.
  renderCare();

  $("connection-alert").hidden = Boolean(CONFIG.API_URL);

  await loadCare();

  setInterval(() => {
    if (document.hidden || state.busy) return;

    checkMidnight();

    if (state.screen === "dash") {
      loadDashboard(true);
    } else {
      loadCare(true);
    }
  }, CONFIG.REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;

    checkMidnight();

    if (state.screen === "dash") {
      loadDashboard(true);
    } else {
      loadCare(true);
    }
  });
}

document.addEventListener("DOMContentLoaded", initialize);
