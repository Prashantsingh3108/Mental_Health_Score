/**
 * Mental Health Score Prediction — frontend logic
 * ------------------------------------------------
 * Collects the form, POSTs it to the FastAPI /predict endpoint,
 * and renders the response in the wellbeing dial.
 *
 * DEPLOYMENT NOTE:
 * Update API_BASE_URL below to match wherever your FastAPI app is running.
 * The API's own docs page (…/docs) is just the Swagger UI — the form
 * posts straight to the /predict route itself.
 */
const API_BASE_URL = 'http://127.0.0.1:2200';
const PREDICT_ENDPOINT = `${API_BASE_URL}/predict`;

// The model's score range. Adjust MAX_SCORE if your model was trained
// on a different scale (e.g. 0–100) — everything else derives from it.
const MAX_SCORE = 10;

// ---- DOM references ---------------------------------------------------
const form = document.getElementById('predict-form');
const submitBtn = document.getElementById('predict-btn');
const formError = document.getElementById('form-error');

const dialEmpty = document.getElementById('dial-empty');
const dialResult = document.getElementById('dial-result');
const dialArc = document.getElementById('dial-arc');
const dialScore = document.getElementById('dial-score');
const dialMax = document.getElementById('dial-max');
const dialLabel = document.getElementById('dial-label');
const dialCaption = document.getElementById('dial-caption');

dialMax.textContent = MAX_SCORE;

// Circle geometry for the dial arc (r = 52, matches the SVG markup).
const DIAL_RADIUS = 52;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
dialArc.style.strokeDasharray = `${DIAL_CIRCUMFERENCE}`;
dialArc.style.strokeDashoffset = `${DIAL_CIRCUMFERENCE}`;

// Numeric fields, so we can coerce values before sending them.
const NUMERIC_FIELDS = new Set([
  'age',
  'avg_daily_usage_hours',
  'daily_unlocks',
  'study_hours',
  'physical_activity_hours',
  'sleep_hours_per_night',
]);

// ---- Form submit -------------------------------------------------------
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();

  const { payload, isValid } = collectFormData();
  if (!isValid) {
    formError.textContent = 'Please fill in every field before predicting.';
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(PREDICT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await safeReadErrorDetail(response);
      throw new Error(detail || `Request failed (status ${response.status})`);
    }

    const data = await response.json();
    renderScore(data.predicted_mental_health_score);
  } catch (err) {
    // Network failure (e.g. API not running / CORS) vs. a server error
    // both land here — show a message the user can actually act on.
    formError.textContent = err.message.includes('Failed to fetch')
      ? `Couldn't reach the API at ${API_BASE_URL}. Make sure the FastAPI server is running.`
      : err.message;
  } finally {
    setLoading(false);
  }
});

// ---- Helpers -------------------------------------------------------------

/** Reads every field, coercing numbers, and flags empty ones inline. */
function collectFormData() {
  const formData = new FormData(form);
  const payload = {};
  let isValid = true;

  for (const [name, rawValue] of formData.entries()) {
    const value = rawValue.trim();
    const fieldWrapper = form.querySelector(`#${name}`)?.closest('.field');

    if (value === '') {
      isValid = false;
      markInvalid(fieldWrapper, name, 'Required');
      continue;
    }

    payload[name] = NUMERIC_FIELDS.has(name) ? Number(value) : value;
  }

  return { payload, isValid };
}

function markInvalid(fieldWrapper, name, message) {
  if (!fieldWrapper) return;
  fieldWrapper.classList.add('field--invalid');
  const errorEl = form.querySelector(`[data-error-for="${name}"]`);
  if (errorEl) errorEl.textContent = message;
}

function clearErrors() {
  formError.textContent = '';
  form.querySelectorAll('.field--invalid').forEach((el) => el.classList.remove('field--invalid'));
  form.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('is-loading', isLoading);
  submitBtn.querySelector('.btn-label').textContent = isLoading ? 'Predicting…' : 'Predict my score';
}

/** Tries to pull FastAPI's structured validation error into plain text. */
async function safeReadErrorDetail(response) {
  try {
    const body = await response.json();
    if (Array.isArray(body.detail)) {
      return body.detail.map((d) => `${d.loc?.at(-1)}: ${d.msg}`).join(' · ');
    }
    return body.detail;
  } catch {
    return null;
  }
}

/** Animates the dial and swaps the empty state for the result state. */
function renderScore(score) {
  const clamped = Math.max(0, Math.min(MAX_SCORE, score));
  const ratio = clamped / MAX_SCORE;

  dialEmpty.hidden = true;
  dialResult.hidden = false;

  dialScore.textContent = score.toFixed(1).replace(/\.0$/, '');

  const { color, label, caption } = interpretScore(ratio);
  dialResult.style.setProperty('--dial-color', color);
  dialLabel.textContent = label;
  dialCaption.textContent = caption;

  // Force reflow so the transition re-triggers on repeated predictions.
  dialArc.style.transition = 'none';
  dialArc.style.strokeDashoffset = `${DIAL_CIRCUMFERENCE}`;
  // eslint-disable-next-line no-unused-expressions
  dialArc.getBoundingClientRect();
  dialArc.style.transition = '';

  const offset = DIAL_CIRCUMFERENCE * (1 - ratio);
  requestAnimationFrame(() => {
    dialArc.style.strokeDashoffset = `${offset}`;
  });

  dialResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Maps a 0–1 ratio to a color + short qualitative read of the score. */
function interpretScore(ratio) {
  if (ratio >= 0.7) {
    return {
      color: 'var(--sage)',
      label: 'Balanced',
      caption: 'Habits and rest look well aligned right now.',
    };
  }
  if (ratio >= 0.4) {
    return {
      color: 'var(--amber)',
      label: 'Worth watching',
      caption: 'A few habits may be worth adjusting.',
    };
  }
  return {
    color: 'var(--clay)',
    label: 'At risk',
    caption: 'Consider easing up on screen time and prioritising rest.',
  };
}
