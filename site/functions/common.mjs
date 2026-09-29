// handler.mjs 与 daily.mjs 共用的响应封装、字段校验与批量导入辅助。
// 数据库为 app.* 受限 schema：uuid 主键、日期用 text(YYYY-MM-DD)、枚举用 text 由这里校验。

export const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export const ok = (data = {}) => json({ ok: true, ...data });
export const fail = (error, status = 400) => json({ ok: false, error }, status);

export class AppError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

// ---------- 校验工具 ----------
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const ID = (v) => (typeof v === 'string' && UUID_RE.test(v) ? v : (() => { throw new AppError('invalid_id'); })());
export const OPT_ID = (v) => (v === null || v === undefined || v === '' ? null : ID(v));
export const STR = (v, max, req = true) => {
  if (v === null || v === undefined) v = '';
  if (typeof v !== 'string') throw new AppError('invalid_text');
  v = v.trim();
  if (req && !v.length) throw new AppError('missing_field');
  if (new TextEncoder().encode(v).length > max) throw new AppError('text_too_long');
  return v;
};
export const OPT_STR = (v, max) => STR(v, max, false) || null;
export const DATE = (v, req = true) => {
  if (v === null || v === undefined || v === '') { if (req) throw new AppError('missing_date'); return null; }
  const s = STR(v, 10);
  if (!DATE_RE.test(s)) throw new AppError('invalid_date');
  return s;
};
export const ONE_OF = (v, list, req = true) => {
  const s = STR(v, 40, req);
  if (!s && !req) return null;
  if (!list.includes(s)) throw new AppError('invalid_choice');
  return s;
};
export const INT = (v, min, max) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError('invalid_number');
  return n;
};
export const ARR = (v, max) => { if (!Array.isArray(v) || v.length > max) throw new AppError('invalid_list'); return v; };

// ---------- 查询工具 ----------
export async function db(promise, code = 'db_error') {
  const { data, error } = await promise;
  if (error) throw new AppError(code, 503);
  return data;
}
export async function count(supabase, table, filter) {
  let q = supabase.from(table).select('id', { count: 'exact' }).limit(1);
  if (filter) q = q.eq(filter[0], filter[1]);
  const { error, count: c } = await q;
  if (error || !Number.isSafeInteger(c)) throw new AppError('count_unavailable', 503);
  return c;
}
export const nowIso = () => new Date().toISOString();

// 请求体：只接受 JSON 对象，大小由网关与 content-length 共同限制。
export async function readBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new AppError('invalid_body');
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 200000) throw new AppError('body_too_large');
  try {
    const b = await request.json();
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new AppError('invalid_body');
    return b;
  } catch (e) { if (e instanceof AppError) throw e; throw new AppError('invalid_body'); }
}

// ---------- 批量导入辅助 ----------
// CSV 解析在前端完成，服务端只做逐行校验；dryRun 默认 true，先给前端预览再确认落库。
export const IMPORT_MAX_ROWS = 500;
export const CELL = (v) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());
export const E = (field, code) => ({ field, code });
export const DRY = (b) => b.dryRun !== false;

export const importResult = (dryRun, items, extra = {}) => {
  const of = (a) => items.filter((x) => x.action === a).length;
  return ok({
    ...extra, dryRun, total: items.length,
    created: of('create'), updated: of('update'), skipped: of('skip'), invalid: of('invalid'),
    items,
  });
}
