// 本地联调服务器（Node，无 Deno 环境用）：伪造 x-qoder-user-context + 内存假 supabase client，
// 直接调用 functions/handler.mjs 的真实 handleApp。仅用于开发，不属于发布包。
// 启动: node dev/server.mjs 8000
import { createServer } from 'node:http';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { handleApp } = await import('../functions/handler.mjs');

// ---------- 假 supabase client（内存 JSON 存储） ----------
const store = new Map(); // table -> rows[]
const table = (name) => { if (!store.has(name)) store.set(name, []); return store.get(name); };
const clone = (r) => JSON.parse(JSON.stringify(r));
const pick = (row, cols) => {
  if (!cols || cols === '*') return clone(row);
  const out = {};
  for (const c of cols.split(',').map((s) => s.trim())) out[c] = row[c];
  return out;
};

class Builder {
  constructor(db, name) {
    this.db = db; this.name = name;
    this.op = null; this.cols = '*'; this.filters = []; this.orders = [];
    this.limitN = null; this.singleMode = null; this.wantCount = null; this.payload = null;
  }
  select(cols, opts) { this.op = this.op ?? 'select'; this.cols = cols || '*'; if (opts?.count) this.wantCount = opts.count; return this; }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(row) { this.op = 'update'; this.payload = row; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(col, val) { this.filters.push(([r]) => r[col] === val); return this; }
  in(col, vals) { this.filters.push(([r]) => vals.includes(r[col])); return this; }
  order(col, opts) { this.orders.push([col, opts?.ascending !== false]); return this; }
  limit(n) { this.limitN = n; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'one'; return this; }
  _run() {
    const rows = table(this.name);
    try {
      if (this.op === 'insert') {
        const inserted = this.payload.map((r) => ({ ...r }));
        rows.push(...inserted);
        return this._result(this.cols === '*' ? inserted.map(clone) : inserted.map((r) => pick(r, this.cols)));
      }
      if (this.op === 'update') {
        const kept = [];
        for (let i = 0; i < rows.length; i++) {
          if (this.filters.every((f) => f([rows[i]]))) {
            rows[i] = { ...rows[i], ...this.payload };
            kept.push(this.cols === '*' ? clone(rows[i]) : pick(rows[i], this.cols));
          }
        }
        return this._result(this.singleMode ? (kept[0] ?? null) : kept);
      }
      if (this.op === 'delete') {
        const removed = [];
        store.set(this.name, rows.filter((r) => {
          const hit = this.filters.every((f) => f([r]));
          if (hit) removed.push(clone(r));
          return !hit;
        }));
        return this._result(this.singleMode ? (removed[0] ?? null) : (this.cols === '*' ? removed : removed.map((r) => pick(r, this.cols))));
      }
      // select
      let out = this.op === 'count' ? rows.filter((r) => this.filters.every((f) => f([r])))
        : rows.filter((r) => this.filters.every((f) => f([r])));
      const total = out.length;
      for (const [col, asc] of this.orders.reverse()) {
        out = out.slice().sort((a, b) => {
          const x = a[col], y = b[col];
          if (x === y) return 0;
          if (x === null || x === undefined) return 1;
          if (y === null || y === undefined) return -1;
          return (String(x) < String(y) ? -1 : 1) * (asc ? 1 : -1);
        });
      }
      if (this.limitN !== null) out = out.slice(0, this.limitN);
      const data = out.map((r) => pick(r, this.cols));
      const result = this._result(data, total);
      if (this.singleMode === 'one' && data.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'fixture single' }, count: result.count };
      if (this.singleMode === 'maybe' && data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'fixture multiple' }, count: result.count };
      if (this.singleMode) result.data = data[0] ?? null;
      return result;
    } catch (e) {
      return { data: null, error: { message: String(e?.message || e) }, count: null };
    }
  }
  _result(data, exactCount) {
    if (this.singleMode && this.op !== 'select') {
      const first = Array.isArray(data) ? (data[0] ?? null) : null;
      if (this.singleMode === 'one' && !first) return { data: null, error: { message: 'fixture: no rows' }, count: null };
      return { data: first, error: null, count: null };
    }
    return { data: this.op === 'select' ? data : (this.cols ? data : undefined), error: null, count: this.wantCount ? exactCount ?? data.length : null };
  }
  then(res, rej) { return Promise.resolve().then(() => this._run()).then(res, rej); }
}

const supabase = { from: (name) => new Builder(supabase, name) };

// ---------- 伪造登录上下文 ----------
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const users = {
  admin: { user_id: 'dev-user-admin', name: '王老师', picture: '' },
  teacher: { user_id: 'dev-user-teacher', name: '李老师', picture: '' },
  anon: null,
};
function contextFor(role) {
  const u = users[role];
  if (!u) return null;
  return b64url(JSON.stringify({
    ...u, site_id: 'dev-site', host_id: 'dev-host',
    session_expires_at: Math.floor(Date.now() / 1000) + 86400,
  }));
}

const port = Number(process.argv[2] || 8000);
const server = createServer(async (req, res) => {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 300000) { res.writeHead(413); res.end(); return; } chunks.push(c); }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const headers = new Headers(req.headers);
  headers.delete('x-qoder-user-context');
  const role = url.searchParams.get('__devuser') || process.env.DEV_ROLE || 'admin';
  const ctx = contextFor(role);
  if (ctx) headers.set('x-qoder-user-context', ctx);
  const request = new Request(`http://127.0.0.1:8000/functions/v1/app?${url.searchParams.toString().replace(/__devuser=[^&]*&?/, '')}`, {
    method: req.method, headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  let response;
  try { response = await handleApp({ request, supabase }); }
  catch (e) { console.error('UNCAUGHT', e); res.writeHead(500); res.end('dbg'); return; }
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(port, '127.0.0.1', () => {
  console.log(`local fixture API ready: http://127.0.0.1:${port}/functions/v1/app (DEV_ROLE=admin|teacher, or ?__devuser=teacher to switch user)`);
});
