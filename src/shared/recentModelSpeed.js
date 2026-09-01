'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverDbPaths } = require('./opencodeLimits');
const { resolveSessionFile } = require('./sessionFiles');

let sqlite = null;
try { sqlite = require('node:sqlite'); } catch (_) { sqlite = null; }

const SUPPORTED_CLIENTS = new Set(['zcode', 'opencode', 'codex']);
const DEFAULT_LIMIT_PER_MODEL = 10;
const MAX_DB_ROWS = 500;
const MAX_CODEX_FILES = 24;
const MAX_CODEX_TAIL_BYTES = 4 * 1024 * 1024;

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInt(value) {
  return Math.max(0, Math.round(num(value)));
}

function normalizeModel(value) {
  return String(value || '').trim().toLowerCase();
}

function timestampMs(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' || /^-?\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const raw = num(value);
    if (!(raw > 0)) return 0;
    // Local stores use either seconds or milliseconds. Values below 1e12 are
    // seconds for every contemporary timestamp these clients can produce.
    return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoTimestamp(value) {
  const ms = timestampMs(value);
  return ms > 0 ? new Date(ms).toISOString() : '';
}

function makeSample({ client, model, outputTokens, durationMs, completedAt, sessionId = '', sampleId = '', source = '' }) {
  const clientKey = String(client || '').trim().toLowerCase();
  const modelKey = normalizeModel(model);
  const output = positiveInt(outputTokens);
  const duration = positiveInt(durationMs);
  const completed = isoTimestamp(completedAt);
  if (!SUPPORTED_CLIENTS.has(clientKey) || !modelKey || output <= 0 || duration <= 0 || !completed) return null;
  return {
    outputTokens: output,
    durationMs: duration,
    completedAt: completed,
    ...(sessionId ? { sessionId: String(sessionId).slice(0, 256) } : {}),
    ...(sampleId ? { sampleId: String(sampleId).slice(0, 512) } : {}),
    ...(source ? { source: String(source).slice(0, 64) } : {}),
    client: clientKey,
    model: modelKey
  };
}

function sampleIdentity(sample) {
  return sample.sampleId || [
    sample.client,
    sample.model,
    sample.sessionId || '',
    sample.completedAt,
    sample.outputTokens,
    sample.durationMs
  ].join('|');
}

function finalizeSamples(samples, limitPerModel = DEFAULT_LIMIT_PER_MODEL) {
  const limit = Math.max(1, Math.min(50, positiveInt(limitPerModel) || DEFAULT_LIMIT_PER_MODEL));
  const nested = {};
  const seen = new Set();
  const sorted = (Array.isArray(samples) ? samples : [])
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  for (const sample of sorted) {
    const id = sampleIdentity(sample);
    if (seen.has(id)) continue;
    seen.add(id);
    const client = sample.client;
    const model = sample.model;
    if (!nested[client]) nested[client] = {};
    if (!nested[client][model]) nested[client][model] = [];
    if (nested[client][model].length >= limit) continue;
    const { client: _client, model: _model, ...stored } = sample;
    nested[client][model].push(stored);
  }
  return nested;
}

function openReadonly(dbPath, sqliteModule = sqlite) {
  if (!sqliteModule) return null;
  const db = new sqliteModule.DatabaseSync(dbPath, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 250');
  return db;
}

function sqliteColumns(db, table) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)));
  } catch (_) {
    return new Set();
  }
}

function sampleFromZcodeRow(row) {
  const duration = positiveInt(row.durationMs ?? row.duration_ms);
  const rawOutput = positiveInt(row.outputTokens ?? row.output_tokens);
  const reasoning = positiveInt(row.reasoningTokens ?? row.reasoning_tokens);
  // ZCode model_usage follows the OpenAI shape: output_tokens includes
  // reasoning_tokens. We want visible completion speed, so reasoning must not
  // inflate the numerator.
  const visibleOutput = Math.max(0, rawOutput - Math.min(rawOutput, reasoning));
  const completedMs = timestampMs(row.completedAt ?? row.completed_at)
    || (timestampMs(row.startedAt ?? row.started_at) + duration);
  return makeSample({
    client: 'zcode',
    model: row.modelId ?? row.model_id,
    outputTokens: visibleOutput,
    durationMs: duration,
    completedAt: completedMs,
    sessionId: row.sessionId ?? row.session_id,
    sampleId: `zcode:${row.id ?? ''}:${row.sessionId ?? row.session_id ?? ''}:${completedMs}`,
    source: 'model_usage'
  });
}

function collectZcodeSamples(options = {}) {
  const home = options.homeDir || os.homedir();
  const dbPath = options.zcodeDbPath || path.join(home, '.zcode', 'cli', 'db', 'db.sqlite');
  try { if (!fs.statSync(dbPath).isFile()) return []; } catch (_) { return []; }
  let db;
  try {
    db = openReadonly(dbPath, options.sqliteModule);
    if (!db) return [];
    const columns = sqliteColumns(db, 'model_usage');
    if (!columns.has('duration_ms') || !columns.has('output_tokens')) return [];
    const col = (name) => columns.has(name) ? name : 'NULL';
    const sql = `SELECT ${col('id')} AS id,
                        ${col('session_id')} AS sessionId,
                        ${col('model_id')} AS modelId,
                        ${col('started_at')} AS startedAt,
                        ${col('completed_at')} AS completedAt,
                        ${col('duration_ms')} AS durationMs,
                        ${col('output_tokens')} AS outputTokens,
                        ${col('reasoning_tokens')} AS reasoningTokens
                 FROM model_usage
                 WHERE COALESCE(${col('duration_ms')}, 0) > 0
                   AND COALESCE(${col('output_tokens')}, 0) > 0
                 ORDER BY COALESCE(${col('completed_at')}, ${col('started_at')}, 0) DESC
                 LIMIT ${MAX_DB_ROWS}`;
    return db.prepare(sql).all().map(sampleFromZcodeRow).filter(Boolean);
  } catch (_) {
    return [];
  } finally {
    if (db) { try { db.close(); } catch (_) {} }
  }
}

function sampleFromOpenCodePayload(payload, row = {}, source = 'message') {
  if (!payload || typeof payload !== 'object') return null;
  const role = String(payload.role || row.type || '').toLowerCase();
  if (role && role !== 'assistant') return null;
  const tokens = payload.tokens || {};
  const output = positiveInt(tokens.output);
  const created = timestampMs(payload.time?.created ?? row.timeCreated);
  const completed = timestampMs(payload.time?.completed);
  const duration = completed > created && created > 0 ? completed - created : 0;
  const model = payload.modelID || payload.modelId || payload.model?.id || '';
  return makeSample({
    client: 'opencode',
    model,
    outputTokens: output,
    durationMs: duration,
    completedAt: completed,
    sessionId: row.sessionId || payload.sessionID || payload.sessionId || '',
    sampleId: `opencode:${row.dbKey || ''}:${source}:${row.id || ''}:${completed}`,
    source
  });
}

function readOpenCodeTable(db, dbKey, table) {
  const columns = sqliteColumns(db, table);
  if (!columns.has('data')) return [];
  const id = columns.has('id') ? 'id' : 'rowid';
  const session = columns.has('session_id') ? 'session_id' : 'NULL';
  const storedCreated = columns.has('time_created') ? 'time_created' : 'NULL';
  const type = columns.has('type') ? 'type' : 'NULL';
  const typePredicate = table === 'session_message' && columns.has('type') ? "AND type = 'assistant'" : '';
  const sql = `SELECT ${id} AS id, ${session} AS sessionId, ${type} AS type,
                      ${storedCreated} AS timeCreated, data
               FROM ${table}
               WHERE json_valid(data) ${typePredicate}
               ORDER BY CAST(COALESCE(json_extract(data,'$.time.completed'),
                                      json_extract(data,'$.time.created'),
                                      ${storedCreated}, 0) AS REAL) DESC
               LIMIT ${MAX_DB_ROWS}`;
  const rows = db.prepare(sql).all();
  const out = [];
  for (const row of rows) {
    let payload;
    try { payload = JSON.parse(String(row.data || '')); } catch (_) { continue; }
    const sample = sampleFromOpenCodePayload(payload, { ...row, dbKey }, table);
    if (sample) out.push(sample);
  }
  return out;
}

function collectOpenCodeSamples(options = {}) {
  const home = options.homeDir || os.homedir();
  const baseEnv = { ...process.env, ...(options.env || {}) };
  baseEnv.HOME = baseEnv.HOME || home;
  baseEnv.USERPROFILE = baseEnv.USERPROFILE || home;
  if (!baseEnv.XDG_DATA_HOME) baseEnv.XDG_DATA_HOME = path.join(home, '.local', 'share');
  const dbPaths = options.opencodeDbPaths || discoverDbPaths(baseEnv);
  const out = [];
  for (const dbPath of dbPaths) {
    let db;
    try {
      db = openReadonly(dbPath, options.sqliteModule);
      if (!db) continue;
      const dbKey = path.basename(dbPath);
      const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => String(row.name)));
      if (tables.has('message')) out.push(...readOpenCodeTable(db, dbKey, 'message'));
      if (tables.has('session_message')) out.push(...readOpenCodeTable(db, dbKey, 'session_message'));
    } catch (_) {
      // A live WAL or schema migration can make one database briefly unreadable.
      // Speed is supplementary; skip it rather than breaking the usage tick.
    } finally {
      if (db) { try { db.close(); } catch (_) {} }
    }
  }
  return out;
}

function codexModelFromPayload(payload = {}) {
  return normalizeModel(
    payload.model
    || payload.model_name
    || payload.model_info?.slug
    || payload.info?.model
    || payload.info?.model_name
    || ''
  );
}

function parseCodexTranscriptSamples(text, sessionId = '') {
  const out = [];
  let currentModel = '';
  let callAnchorMs = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch (_) { continue; }
    const payload = obj.payload || {};
    const eventMs = timestampMs(obj.timestamp);
    const model = codexModelFromPayload(payload);
    if (model) currentModel = model;

    if (obj.type === 'turn_context') {
      if (eventMs > 0) callAnchorMs = eventMs;
      continue;
    }
    if (obj.type === 'event_msg' && payload.type === 'user_message') {
      if (eventMs > 0) callAnchorMs = eventMs;
      continue;
    }
    if (obj.type === 'event_msg' && payload.type === 'task_started') {
      const started = timestampMs(payload.started_at) || eventMs;
      if (started > 0) callAnchorMs = started;
      continue;
    }
    // Tool execution time is not model generation time. Anchor the next model
    // call after the tool result/end event so a 30 s shell command does not turn
    // a fast model into a 3 tok/s sample.
    if (
      (obj.type === 'response_item' && ['function_call_output', 'custom_tool_call_output', 'tool_result'].includes(payload.type))
      || (obj.type === 'event_msg' && ['mcp_tool_call_end', 'exec_command_end', 'apply_patch_end'].includes(payload.type))
    ) {
      if (eventMs > 0) callAnchorMs = eventMs;
      continue;
    }
    if (obj.type !== 'event_msg' || payload.type !== 'token_count') continue;
    const usage = payload.info?.last_token_usage;
    if (!usage || !(eventMs > 0) || !(callAnchorMs > 0) || eventMs <= callAnchorMs) continue;
    const rawOutput = positiveInt(usage.output_tokens);
    const reasoning = positiveInt(usage.reasoning_output_tokens);
    const visibleOutput = Math.max(0, rawOutput - Math.min(rawOutput, reasoning));
    const resolvedModel = codexModelFromPayload(payload.info || {}) || currentModel;
    const sample = makeSample({
      client: 'codex',
      model: resolvedModel,
      outputTokens: visibleOutput,
      durationMs: eventMs - callAnchorMs,
      completedAt: eventMs,
      sessionId,
      sampleId: `codex:${sessionId}:${eventMs}:${rawOutput}:${reasoning}`,
      source: 'token_count'
    });
    if (sample) out.push(sample);
    // A later call needs a new causal boundary (tool result / task start /
    // turn_context). Do not divide a bookkeeping token_count by the previous
    // call's completion timestamp and manufacture an implausible rate.
    callAnchorMs = 0;
  }
  return out;
}

function readFileTail(file, maxBytes = MAX_CODEX_TAIL_BYTES) {
  let fd;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size <= 0) return '';
    const size = Math.min(stat.size, maxBytes);
    const start = Math.max(0, stat.size - size);
    fd = fs.openSync(file, 'r');
    const buffer = Buffer.allocUnsafe(size);
    const read = fs.readSync(fd, buffer, 0, size, start);
    let text = buffer.subarray(0, read).toString('utf8');
    if (start > 0) {
      const newline = text.indexOf('\n');
      if (newline >= 0) text = text.slice(newline + 1);
    }
    return text;
  } catch (_) {
    return '';
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
  }
}

function recentCodexFiles(period, home) {
  const candidates = new Map();
  const sessions = Object.values(period?.sessions || {})
    .filter((session) => session?.client === 'codex')
    .sort((a, b) => timestampMs(b.lastUsedAt) - timestampMs(a.lastUsedAt))
    .slice(0, MAX_CODEX_FILES);

  function addFile(file, sessionId = '') {
    if (!file || candidates.has(file)) return;
    let mtime = 0;
    try { mtime = fs.statSync(file).mtimeMs; } catch (_) { return; }
    candidates.set(file, { file, sessionId, mtime });
  }

  for (const session of sessions) {
    addFile(resolveSessionFile('codex', session.sessionId, home), session.sessionId);
  }

  const days = new Set();
  const addDay = (ms) => {
    if (!(ms > 0)) return;
    for (const offset of [-86400000, 0, 86400000]) {
      const date = new Date(ms + offset);
      days.add([date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('/'));
    }
  };
  addDay(Date.now());
  for (const session of sessions.slice(0, 8)) addDay(timestampMs(session.lastUsedAt));
  for (const day of days) {
    const [year, month, date] = day.split('/');
    const dir = path.join(home, '.codex', 'sessions', year, month, date);
    let names;
    try { names = fs.readdirSync(dir); } catch (_) { continue; }
    for (const name of names) {
      if (name.endsWith('.jsonl')) addFile(path.join(dir, name), name.slice(0, -6));
    }
  }

  return [...candidates.values()].sort((a, b) => b.mtime - a.mtime).slice(0, MAX_CODEX_FILES);
}

function collectCodexSamples(options = {}) {
  const home = options.homeDir || os.homedir();
  const out = [];
  for (const entry of recentCodexFiles(options.period || {}, home)) {
    out.push(...parseCodexTranscriptSamples(readFileTail(entry.file), entry.sessionId));
  }
  return out;
}

function collectRecentModelSpeedSamples(options = {}) {
  const requested = new Set(
    String(options.clients || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const enabled = (client) => requested.size === 0 || requested.has(client);
  const samples = [];
  if (enabled('zcode')) samples.push(...collectZcodeSamples(options));
  if (enabled('opencode')) samples.push(...collectOpenCodeSamples(options));
  if (enabled('codex')) samples.push(...collectCodexSamples(options));
  return finalizeSamples(samples, options.limitPerModel);
}

module.exports = {
  collectRecentModelSpeedSamples,
  finalizeSamples,
  parseCodexTranscriptSamples,
  sampleFromOpenCodePayload,
  sampleFromZcodeRow
};
