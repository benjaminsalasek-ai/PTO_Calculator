const COOKIE_NAME = "ptoData";
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const ACCRUAL_DAYS_PER_YEAR = 20;
const LOG_PREFIX = "[PTO]";

const defaultState = {
  startDate: "2024-09-15",
  hoursPerDay: 8,
  entries: [],
};

const elements = {};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

function init() {
  cacheElements();
  assertElements();
  console.log(LOG_PREFIX, "DOM ready, initializing");
  const state = ensureState();
  populateFormDefaults(state);
  bindEvents();
  updateUI(state);
}

function cacheElements() {
  elements.ptoDate = document.getElementById("ptoDate");
  elements.ptoHours = document.getElementById("ptoHours");
  elements.ptoEntryForm = document.getElementById("pto-entry-form");
  elements.resetEntries = document.getElementById("resetEntries");
  elements.checkDate = document.getElementById("checkDate");
  elements.accruedHours = document.getElementById("accruedHours");
  elements.usedHours = document.getElementById("usedHours");
  elements.availableHours = document.getElementById("availableHours");
  elements.availableDays = document.getElementById("availableDays");
  elements.history = document.getElementById("history");
}

function assertElements() {
  Object.entries(elements).forEach(([key, el]) => {
    if (!el) {
      console.error(LOG_PREFIX, `Missing required element for ${key}. Check your HTML IDs.`);
    }
  });
}

function bindEvents() {
  elements.ptoEntryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const state = ensureState();
    console.log(LOG_PREFIX, "Submitting PTO entry with state from cookie", state);
    const entryDate = elements.ptoDate.value || toDateInputValue(new Date());
    const hours = Number(elements.ptoHours.value) || state.hoursPerDay;
    const next = {
      ...state,
      entries: [...state.entries, { date: entryDate, hours }],
    };
    console.log(LOG_PREFIX, "Saving PTO entry", { entryDate, hours });
    saveState(next);
    const refreshed = ensureState();
    console.log(LOG_PREFIX, "State after save", refreshed);
    elements.ptoHours.value = state.hoursPerDay;
    updateUI(refreshed);
  });

  elements.resetEntries.addEventListener("click", () => {
    const state = ensureState();
    console.log(LOG_PREFIX, "Clearing PTO history", state.entries);
    const next = { ...state, entries: [] };
    saveState(next);
    const refreshed = ensureState();
    console.log(LOG_PREFIX, "State after clearing history", refreshed);
    updateUI(refreshed);
  });

  elements.history.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-index]");
    if (!button) return;
    const index = Number(button.dataset.deleteIndex);
    const state = ensureState();
    console.log(LOG_PREFIX, "Deleting PTO entry", { index, state });
    if (Number.isInteger(index) && index >= 0 && index < state.entries.length) {
      const nextEntries = state.entries.filter((_, i) => i !== index);
      saveState({ ...state, entries: nextEntries });
      const refreshed = ensureState();
      console.log(LOG_PREFIX, "State after delete", refreshed);
      updateUI(refreshed);
    }
  });

  elements.checkDate.addEventListener("change", () => {
    const state = ensureState();
    console.log(LOG_PREFIX, "Check date changed to", elements.checkDate.value, "state", state);
    updateUI(state);
  });
}

function populateFormDefaults(state) {
  console.log(LOG_PREFIX, "Populating form defaults with state", state);
  if (!elements.ptoHours || !elements.ptoDate || !elements.checkDate) {
    console.error(LOG_PREFIX, "Required inputs missing; skipping populate");
    return;
  }
  elements.ptoHours.value = state.hoursPerDay;
  const today = toDateInputValue(new Date());
  elements.ptoDate.value = today;
  elements.checkDate.value = state.startDate || today;
}

function updateUI(state) {
  console.log(LOG_PREFIX, "Updating UI with state", state);
  const checkDate = elements.checkDate.value || toDateInputValue(new Date());
  const accruedHours = calculateAccruedHours(checkDate, state);
  const usedHours = calculateUsedHours(checkDate, state);
  const availableHours = Math.max(0, accruedHours - usedHours);
  const availableDays = availableHours / state.hoursPerDay;

  elements.accruedHours.textContent = accruedHours.toFixed(2);
  elements.usedHours.textContent = usedHours.toFixed(2);
  elements.availableHours.textContent = availableHours.toFixed(2);
  elements.availableDays.textContent = `${availableDays.toFixed(2)} days`;

  renderHistory(state);
}

function calculateAccruedHours(targetDateString, state) {
  console.log(LOG_PREFIX, "Calculating accrued hours for", targetDateString, "with state", state);
  const start = toStartOfDay(state.startDate);
  const target = toStartOfDay(targetDateString);
  if (!start || !target || target < start) return 0;
  const daysElapsed = (target - start) / MS_PER_DAY;
  const accrualPerDay = (ACCRUAL_DAYS_PER_YEAR * state.hoursPerDay) / 365;
  const accrued = daysElapsed * accrualPerDay;
  console.log(LOG_PREFIX, "Accrued calculation", { daysElapsed, accrualPerDay, accrued });
  return accrued;
}

function calculateUsedHours(targetDateString, state) {
  console.log(LOG_PREFIX, "Calculating used hours for", targetDateString, "with state", state);
  const target = toStartOfDay(targetDateString);
  if (!target) return 0;
  return state.entries
    .filter((entry) => toStartOfDay(entry.date) <= target)
    .reduce((total, entry) => total + Number(entry.hours || 0), 0);
}

function renderHistory(state) {
  console.log(LOG_PREFIX, "Rendering history", state.entries);
  const sorted = state.entries
    .map((entry, index) => ({ ...entry, __index: index }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  elements.history.innerHTML = "";
  if (!sorted.length) {
    elements.history.innerHTML = "<li>No PTO recorded yet.</li>";
    return;
  }

  sorted.forEach((entry) => {
    const li = document.createElement("li");
    const date = new Date(`${entry.date}T00:00:00`);
    li.innerHTML = `
      <div>
        <div>${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
        <div class="meta">${Number(entry.hours).toFixed(2)} hours</div>
      </div>
      <div class="meta">
        ${(Number(entry.hours) / state.hoursPerDay).toFixed(2)} days
        <button data-delete-index="${entry.__index}" class="small-button">Delete</button>
      </div>
    `;
    elements.history.appendChild(li);
  });
}

function ensureState() {
  const state = loadState();
  saveState(state);
  return state;
}

function loadState() {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) {
    console.log(LOG_PREFIX, "No cookie found, seeding default state", defaultState);
    return { ...defaultState };
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    const state = {
      ...defaultState,
      ...parsed,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
    console.log(LOG_PREFIX, "Loaded state from cookie", state);
    return state;
  } catch (error) {
    console.log(LOG_PREFIX, "Failed to parse cookie; resetting to default", error, defaultState);
    saveState(defaultState);
    return { ...defaultState };
  }
}

function saveState(state) {
  const expires = new Date(Date.now() + MS_PER_DAY * 365).toUTCString();
  const value = encodeURIComponent(JSON.stringify(state));
  console.log(LOG_PREFIX, "Persisting state to cookie", state);
  document.cookie = `${COOKIE_NAME}=${value}; expires=${expires}; path=/; SameSite=Lax; Secure`;
  console.log(LOG_PREFIX, "document.cookie after save", document.cookie);
}

function getCookie(name) {
  const prefix = `${name}=`;
  const rawCookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  console.log(LOG_PREFIX, "Read cookie", rawCookie);
  return rawCookie;
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function toStartOfDay(value) {
  if (!value) return null;
  const normalized = new Date(`${value}T00:00:00`);
  if (Number.isNaN(normalized.getTime())) return null;
  console.log(LOG_PREFIX, "Normalized date", value, "->", normalized);
  return normalized;
}
