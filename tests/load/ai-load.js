/**
 * Load test for the `ai` Edge Function (k6). Runs against the local stack with the mock model,
 * so it measures what Studexa itself adds under load: JWT check, admission (quotas, rate
 * limits, budget), database reads/writes, prompt assembly and SSE streaming.
 *
 *   k6 run tests/load/ai-load.js          (via tests/load/run.sh, which sets the env)
 *
 * Scenarios
 *   steady — ramps to 50 concurrent students, each asking every ~6 s (their per-minute limit
 *            is 12), for a mix of chat, page explanations and translations.
 *   burst  — 100 clients firing without pause: rate limiting must answer 429, never 5xx.
 */
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const SERVICE_KEY = __ENV.SUPABASE_SERVICE_ROLE_KEY;
const USERS = Number(__ENV.LOAD_USERS || 50);
const PASSWORD = 'LoadTest1password';

const firstByte = new Trend('ai_time_to_first_byte', true);
const fullAnswer = new Trend('ai_full_answer', true);
const completed = new Rate('ai_answer_completed');
const serverErrors = new Counter('ai_server_errors');
const rateLimited = new Counter('ai_rate_limited');
/** Anything other than 200/429, including status 0 (connection dropped or timed out). */
const unexpected = new Counter('ai_unexpected_status');

export const options = {
  scenarios: {
    steady: {
      executor: 'ramping-vus',
      exec: 'student',
      startVUs: 0,
      stages: [
        { duration: '20s', target: USERS },
        { duration: '60s', target: USERS },
        { duration: '10s', target: 0 },
      ],
    },
    burst: {
      executor: 'constant-vus',
      exec: 'burst',
      vus: 100,
      duration: '15s',
      startTime: '95s',
    },
  },
  thresholds: {
    // The mock answers in ~20 ms, so these budgets are Studexa's own overhead.
    'ai_rate_limited{scenario:steady}': ['count==0'],
    'ai_time_to_first_byte{scenario:steady}': ['p(95)<1500'],
    'ai_full_answer{scenario:steady}': ['p(95)<3000'],
    'ai_answer_completed{scenario:steady}': ['rate>0.99'],
    ai_server_errors: ['count==0'],
    'http_req_failed{scenario:steady}': ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const json = (body) => JSON.stringify(body);
const adminHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function signIn(email) {
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    json({ email, password: PASSWORD }),
    { headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' } },
  );
  return res.json('access_token');
}

function callFunction(name, token, body) {
  return http.post(`${SUPABASE_URL}/functions/v1/${name}`, json(body), {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

/** One verified Premium student with a small ready document and a conversation. */
function createStudent(i, runId) {
  const email = `load-${runId}-${i}@studexa-tests.dev`.toLowerCase();
  const created = http.post(
    `${SUPABASE_URL}/auth/v1/admin/users`,
    json({
      email,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { email_verified: true },
    }),
    { headers: adminHeaders },
  );
  const id = created.json('id');
  http.patch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${id}`,
    json({ tier: 'premium', status: 'active', current_period_end: '2099-01-01T00:00:00Z' }),
    { headers: adminHeaders },
  );
  const token = signIn(email);
  const text = `Chapter ${i}. Photosynthesis converts light into chemical energy.\n\nOsmosis moves water across membranes.`;
  const slot = callFunction('document-upload', token, {
    action: 'create',
    title: `Load ${i}`,
    mimeType: 'text/plain',
    sizeBytes: text.length,
  }).json();
  http.put(
    `${SUPABASE_URL}/storage/v1/object/upload/sign/documents/${slot.path}?token=${slot.token}`,
    text,
    { headers: { 'Content-Type': 'text/plain' } },
  );
  callFunction('document-upload', token, { action: 'complete', documentId: slot.documentId });
  const conversation = http
    .post(
      `${SUPABASE_URL}/rest/v1/conversations`,
      json({ user_id: id, document_id: slot.documentId }),
      {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
      },
    )
    .json('0.id');
  // Signed in once here: GoTrue limits sign-ins per IP (all virtual users share one), and the
  // one-hour token outlives the test.
  return { id, email, token, documentId: slot.documentId, conversationId: conversation };
}

function waitUntilReady(students) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const ids = students.map((s) => s.documentId).join(',');
    const ready = http
      .get(`${SUPABASE_URL}/rest/v1/documents?select=id&status=eq.ready&id=in.(${ids})`, {
        headers: adminHeaders,
      })
      .json();
    if (ready.length === students.length) return;
    sleep(1);
  }
}

/** Burst clients share a pool (they are meant to hit the rate limit). */
export function setup() {
  const runId = Date.now().toString(36);
  const students = [];
  for (let i = 0; i < USERS; i++) students.push(createStudent(`b${i}`, runId));
  waitUntilReady(students);
  return { students, runId };
}

/** Each steady virtual user is one student (VU ids are shared between scenarios). */
let mine = null;

const QUESTIONS = ['What is osmosis?', 'Explain photosynthesis simply.', 'Give me a key fact.'];

function ask(token, body, tag) {
  const res = http.post(`${SUPABASE_URL}/functions/v1/ai`, json(body), {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    tags: { kind: tag },
    timeout: '60s',
  });
  if (res.status >= 500 || res.status === 0) serverErrors.add(1);
  if (res.status === 429) rateLimited.add(1);
  if (res.status !== 200 && res.status !== 429) {
    unexpected.add(1, { status: String(res.status) });
    if (__ENV.LOAD_DEBUG)
      console.warn(`${tag} ${res.status} ${res.error || ''} ${String(res.body).slice(0, 200)}`);
  }
  if (res.status === 200 && !res.body.includes('"type":"done"') && __ENV.LOAD_DEBUG) {
    console.warn(`${tag} stream without done: ${String(res.body).slice(-300)}`);
  }
  if (res.status === 200) {
    firstByte.add(res.timings.waiting);
    fullAnswer.add(res.timings.duration);
  }
  const done = res.status === 200 && res.body.includes('"type":"done"');
  return { res, done };
}

export function student(data) {
  if (!mine) {
    mine = createStudent(`s${exec.vu.idInTest}`, data.runId);

    waitUntilReady([mine]);
  }
  const me = mine;
  const token = me.token;
  const roll = Math.random();
  let result;
  if (roll < 0.6) {
    const message = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    result = ask(
      token,
      { action: 'chat', conversationId: me.conversationId, message, language: 'en' },
      'chat',
    );
  } else if (roll < 0.85) {
    // regenerate: every call reaches the model (stored answers would be replayed for free).
    result = ask(
      token,
      { action: 'explain', documentId: me.documentId, page: 1, language: 'fr', regenerate: true },
      'explain',
    );
  } else {
    result = ask(
      token,
      { action: 'translate_text', text: 'La cellule est vivante.', from: 'fr', to: 'en' },
      'translate',
    );
  }
  completed.add(result.done);
  check(result.res, { 'answered (200 + done)': () => result.done });
  // ~8 questions a minute: a busy student, safely under the 12/minute limit.
  sleep(6 + Math.random() * 2);
}

export function burst(data) {
  const me = data.students[(__VU - 1) % data.students.length];
  const { res } = ask(
    me.token,
    { action: 'translate_text', text: 'Bonjour', from: 'fr', to: 'en' },
    'burst',
  );
  check(res, {
    'burst: answered or rate-limited, never 5xx': (r) => r.status === 200 || r.status === 429,
  });
}

export function teardown(data) {
  // Steady students are removed by their prefix (created inside virtual users).
  const steady = http
    .get(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: adminHeaders })
    .json('users')
    .filter((u) => u.email.startsWith(`load-${data.runId}-s`));
  for (const s of [...data.students, ...steady]) {
    http.del(`${SUPABASE_URL}/auth/v1/admin/users/${s.id}`, null, { headers: adminHeaders });
  }
}

export function handleSummary(data) {
  return {
    stdout: '',
    [`${__ENV.REPORT_DIR || 'tests/load/reports'}/ai-load.json`]: JSON.stringify(data, null, 2),
  };
}
