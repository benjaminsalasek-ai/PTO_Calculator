// Cookie key for storing PTO state.
const COOKIE_NAME = "ptoData";
// Milliseconds per day for date math.
const MS_PER_DAY = 1000 * 60 * 60 * 24;
// PTO allowance per year in days (salaried guideline).
const ACCRUAL_DAYS_PER_YEAR = 20;
// Standard PTO hours per day (not user-configurable here).
const HOURS_PER_DAY = 8;
// Console log prefix to filter messages.
const LOG_PREFIX = "[PTO]";

// Hard-coded PTO entries (8h each) that act like pre-entered days; editable in code.
const hard_coded_dates = [
  { date: "2025-10-27", hours: HOURS_PER_DAY },
  { date: "2025-12-10", hours: HOURS_PER_DAY },
  { date: "2025-12-22", hours: HOURS_PER_DAY },
  { date: "2025-12-23", hours: HOURS_PER_DAY },
  { date: "2025-12-26", hours: HOURS_PER_DAY },
];

// Shape of stored state. startDate stays fixed; entries is PTO usage.
const defaultState = {
  startDate: "2025-09-15",
  entries: [],
  suppressedDefaults: [],
};

// Cache of DOM element references.
const elements = {};

// Initialize after DOM is ready (handles both cached and loading cases).
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

function init() {
  cacheElements(); // wire up element refs
  assertElements(); // log if anything is missing
  console.log(LOG_PREFIX, "DOM ready, initializing");
  const state = ensureState(); // load/normalize/persist cookie
  populateFormDefaults(state); // seed inputs
  bindEvents(); // attach handlers
  updateUI(state); // paint initial balances/history
}

function cacheElements() {
  // Grab all the elements we interact with so we don't query repeatedly.
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
  // Verify we found everything; if not, log to aid debugging.
  Object.entries(elements).forEach(([key, el]) => {
    if (!el) {
      console.error(LOG_PREFIX, `Missing required element for ${key}. Check your HTML IDs.`);
    }
  });
}

function bindEvents() {
  // Add PTO entry: prevent form submit navigation, load state, push entry, persist, refresh UI.
  elements.ptoEntryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const state = ensureState();
    console.log(LOG_PREFIX, "Submitting PTO entry with state from cookie", state);
    const entryDate = elements.ptoDate.value || toDateInputValue(new Date());
    const hours = Number(elements.ptoHours.value) || HOURS_PER_DAY;
    const next = {
      ...state,
      entries: [...state.entries, { date: entryDate, hours }],
    };
    console.log(LOG_PREFIX, "Saving PTO entry", { entryDate, hours });
    saveState(next);
    const refreshed = ensureState();
    console.log(LOG_PREFIX, "State after save", refreshed);
    elements.ptoHours.value = HOURS_PER_DAY;
    updateUI(refreshed);
  });

  // Clear all PTO history entries.
  elements.resetEntries.addEventListener("click", () => {
    const state = ensureState();
    console.log(LOG_PREFIX, "Clearing PTO history", state.entries);
    const next = { ...state, entries: [] };
    saveState(next);
    const refreshed = ensureState();
    console.log(LOG_PREFIX, "State after clearing history", refreshed);
    updateUI(refreshed);
  });

  // Delete specific PTO entry via delegated click on Delete buttons.
  elements.history.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-index]");
    if (!button) return;
    const index = Number(button.dataset.deleteIndex);
    const state = ensureState();
    console.log(LOG_PREFIX, "Deleting PTO entry", { index, state });
    if (Number.isInteger(index) && index >= 0 && index < state.entries.length) {
      const entry = state.entries[index];
      const nextEntries = state.entries.filter((_, i) => i !== index);
      const suppressedDefaults = addSuppressedDefault(entry, state.suppressedDefaults || [], hard_coded_dates);
      saveState({ ...state, entries: nextEntries, suppressedDefaults });
      const refreshed = ensureState();
      console.log(LOG_PREFIX, "State after delete", refreshed);
      updateUI(refreshed);
    }
  });

  // Recompute balances when the check date input changes.
  elements.checkDate.addEventListener("change", () => {
    const state = ensureState();
    console.log(LOG_PREFIX, "Check date changed to", elements.checkDate.value, "state", state);
    updateUI(state);
  });
}

function populateFormDefaults(state) {
  // Seed the form inputs with defaults on load.
  console.log(LOG_PREFIX, "Populating form defaults with state", state);
  if (!elements.ptoHours || !elements.ptoDate || !elements.checkDate) {
    console.error(LOG_PREFIX, "Required inputs missing; skipping populate");
    return;
  }
  elements.ptoHours.value = HOURS_PER_DAY;
  const today = toDateInputValue(new Date());
  elements.ptoDate.value = today;
  elements.checkDate.value = today;
}

function updateUI(state) {
  // Central place to compute and paint balances + history.
  console.log(LOG_PREFIX, "Updating UI with state", state);
  const checkDate = elements.checkDate.value || toDateInputValue(new Date());
  const accruedHours = calculateAccruedHours(checkDate, state);
  const usedHours = calculateUsedHours(checkDate, state);
  const availableHours = Math.max(0, accruedHours - usedHours);
  const availableDays = availableHours / HOURS_PER_DAY;

  elements.accruedHours.textContent = accruedHours.toFixed(2);
  elements.usedHours.textContent = usedHours.toFixed(2);
  elements.availableHours.textContent = availableHours.toFixed(2);
  elements.availableDays.textContent = `${availableDays.toFixed(2)} days`;

  renderHistory(state);
}

function calculateAccruedHours(targetDateString, state) {
  // Convert annual PTO allowance into per-day accrual and multiply by elapsed days.
  console.log(LOG_PREFIX, "Calculating accrued hours for", targetDateString, "with state", state);
  const start = toStartOfDay(state.startDate);
  const target = toStartOfDay(targetDateString);
  if (!start || !target || target < start) return 0;
  const daysElapsed = (target - start) / MS_PER_DAY;
  const accrualPerDay = (ACCRUAL_DAYS_PER_YEAR * HOURS_PER_DAY) / 365;
  const accrued = daysElapsed * accrualPerDay;
  console.log(LOG_PREFIX, "Accrued calculation", { daysElapsed, accrualPerDay, accrued });
  return accrued;
}

function calculateUsedHours(targetDateString, state) {
  // Sum PTO hours from entries that occur on/before the target date.
  console.log(LOG_PREFIX, "Calculating used hours for", targetDateString, "with state", state);
  const target = toStartOfDay(targetDateString);
  if (!target) return 0;
  return state.entries
    .filter((entry) => toStartOfDay(entry.date) <= target)
    .reduce((total, entry) => total + Number(entry.hours || 0), 0);
}

function renderHistory(state) {
  // Show all entries sorted by date with delete controls.
  console.log(LOG_PREFIX, "Rendering history", state.entries);
  const sorted = state.entries
    .map((entry, index) => ({ ...entry, __index: index }))
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // newest first
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
        ${(Number(entry.hours) / HOURS_PER_DAY).toFixed(2)} days
        <button data-delete-index="${entry.__index}" class="small-button">Delete</button>
      </div>
    `;
    elements.history.appendChild(li);
  });
}

function mergeDefaultEntries(existingEntries, defaults, suppressed) {
  // Add default code-defined entries if they are missing (unique by date+hours) and not suppressed.
  const suppressedSet = new Set((suppressed || []).map(entryKey));
  const seen = new Set(existingEntries.map(entryKey));
  const merged = [...existingEntries];
  defaults.forEach((entry) => {
    const key = entryKey(entry);
    if (!seen.has(key) && !suppressedSet.has(key)) {
      merged.push(entry);
      seen.add(key);
    }
  });
  return merged;
}

function addSuppressedDefault(entry, suppressed, defaults) {
  // Track deleted default entries so they are not re-inserted on the next load.
  const key = entryKey(entry);
  const defaultKeys = new Set(defaults.map(entryKey));
  if (!defaultKeys.has(key)) return suppressed; // only suppress if it was a code default
  if (suppressed.map(entryKey).includes(key)) return suppressed;
  return [...suppressed, { date: entry.date, hours: entry.hours }];
}

function entryKey(entry) {
  return `${entry.date}|${entry.hours}`;
}

function ensureState() {
  // Guarantee we always have a valid state object and write it back to the cookie.
  const state = loadState();
  // Strip any legacy hoursPerDay if present in existing cookies.
  const normalized = {
    startDate: state.startDate || defaultState.startDate,
    entries: state.entries || [],
    suppressedDefaults: state.suppressedDefaults || [],
  };
  const merged = mergeDefaultEntries(normalized.entries, hard_coded_dates, normalized.suppressedDefaults);
  const next = { ...normalized, entries: merged };
  saveState(next);
  return next;
}

function loadState() {
  // Pull state JSON from cookie; default if missing or invalid.
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
      suppressedDefaults: Array.isArray(parsed.suppressedDefaults) ? parsed.suppressedDefaults : [],
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
  // Persist state JSON into a cookie that lasts ~1 year.
  const expires = new Date(Date.now() + MS_PER_DAY * 365).toUTCString();
  const value = encodeURIComponent(JSON.stringify(state));
  console.log(LOG_PREFIX, "Persisting state to cookie", state);
  document.cookie = `${COOKIE_NAME}=${value}; expires=${expires}; path=/; SameSite=Lax; Secure`;
  console.log(LOG_PREFIX, "document.cookie after save", document.cookie);
}

function getCookie(name) {
  // Simple cookie reader by name (no decoding).
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
  // Format Date object as yyyy-mm-dd for date inputs.
  return date.toISOString().slice(0, 10);
}

function toStartOfDay(value) {
  // Normalize date strings to midnight to allow consistent comparisons.
  if (!value) return null;
  const normalized = new Date(`${value}T00:00:00`);
  if (Number.isNaN(normalized.getTime())) return null;
  console.log(LOG_PREFIX, "Normalized date", value, "->", normalized);
  return normalized;
}
