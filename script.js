const COOKIE_NAME = "ptoData";
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const ACCRUAL_DAYS_PER_YEAR = 20;

const defaultState = {
  startDate: "2024-09-15",
  hoursPerDay: 8,
  entries: [],
};

const elements = {};

init();

function init() {
  cacheElements();
  const state = loadState();
  populateFormDefaults(state);
  bindEvents();
  updateUI(state);
}

function cacheElements() {
  elements.startDate = document.getElementById("startDate");
  elements.hoursPerDay = document.getElementById("hoursPerDay");
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

function bindEvents() {
  elements.ptoEntryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const state = loadState();
    const entryDate = elements.ptoDate.value || toDateInputValue(new Date());
    const hours = Number(elements.ptoHours.value) || state.hoursPerDay;
    const next = {
      ...state,
      entries: [...state.entries, { date: entryDate, hours }],
    };
    saveState(next);
    elements.ptoHours.value = state.hoursPerDay;
    updateUI(next);
  });

  elements.resetEntries.addEventListener("click", () => {
    const state = loadState();
    const next = { ...state, entries: [] };
    saveState(next);
    updateUI(next);
  });

  elements.startDate.addEventListener("change", () => {
    const state = loadState();
    const next = { ...state, startDate: elements.startDate.value };
    saveState(next);
    updateUI(next);
  });

  elements.hoursPerDay.addEventListener("change", () => {
    const state = loadState();
    const hoursPerDay = Math.max(1, Number(elements.hoursPerDay.value) || state.hoursPerDay);
    elements.hoursPerDay.value = hoursPerDay;
    const next = { ...state, hoursPerDay };
    saveState(next);
    updateUI(next);
  });

  elements.checkDate.addEventListener("change", () => {
    const state = loadState();
    updateUI(state);
  });
}

function populateFormDefaults(state) {
  elements.startDate.value = state.startDate;
  elements.hoursPerDay.value = state.hoursPerDay;
  elements.ptoHours.value = state.hoursPerDay;
  const today = toDateInputValue(new Date());
  elements.ptoDate.value = today;
  elements.checkDate.value = today;
}

function updateUI(state) {
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
  const start = toStartOfDay(state.startDate);
  const target = toStartOfDay(targetDateString);
  if (!start || !target || target < start) return 0;
  const daysElapsedInclusive = Math.floor((target - start) / MS_PER_DAY) + 1;
  const accrualPerDay = (ACCRUAL_DAYS_PER_YEAR * state.hoursPerDay) / 365;
  return daysElapsedInclusive * accrualPerDay;
}

function calculateUsedHours(targetDateString, state) {
  const target = toStartOfDay(targetDateString);
  if (!target) return 0;
  return state.entries
    .filter((entry) => toStartOfDay(entry.date) <= target)
    .reduce((total, entry) => total + Number(entry.hours || 0), 0);
}

function renderHistory(state) {
  const sorted = [...state.entries].sort((a, b) => new Date(a.date) - new Date(b.date));
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
      <div class="meta">${(Number(entry.hours) / state.hoursPerDay).toFixed(2)} days</div>
    `;
    elements.history.appendChild(li);
  });
}

function loadState() {
  try {
    const raw = getCookie(COOKIE_NAME);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(decodeURIComponent(raw));
    return {
      ...defaultState,
      ...parsed,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState(state) {
  const expires = new Date(Date.now() + MS_PER_DAY * 365).toUTCString();
  const value = encodeURIComponent(JSON.stringify(state));
  document.cookie = `${COOKIE_NAME}=${value}; expires=${expires}; path=/`;
}

function getCookie(name) {
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function toStartOfDay(value) {
  if (!value) return null;
  const normalized = new Date(`${value}T00:00:00`);
  if (Number.isNaN(normalized.getTime())) return null;
  return normalized;
}
