// 自建账号体系：PBKDF2-SHA256 口令哈希 + 不透明令牌会话。
// 库里只存口令哈希和令牌摘要，不存明文口令；令牌走自定义请求头（平台会剥离 cookie）。
import { requireUser } from './auth.mjs';

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));
const isoAt = (ms) => new Date(ms).toISOString();
const randomHex = (bytes) => { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return hex(a); };

const PBKDF2_ITERATIONS = 150000;
const KEY_BITS = 256;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RENEW_AFTER_MS = 5 * 60 * 1000;
const MAX_FAILED = 8;
const LOCK_MS = 15 * 60 * 1000;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;

export const ACCOUNT_ROLES = ['ADMIN', 'TEACHER', 'STUDENT'];
export const ACCOUNT_STATUS = ['active', 'disabled'];

export class AuthError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'AuthError'; this.code = code; this.status = status; }
}
const dbDown = () => new AuthError('db_error', 503);

async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function derive(password, saltHex, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unhex(saltHex), hash: 'SHA-256', iterations }, base, KEY_BITS));
}

export async function hashPassword(password) {
  const salt = randomHex(SALT_BYTES);
  const derived = await derive(password, salt, PBKDF2_ITERATIONS);
  return { salt, hash: `pbkdf2$${PBKDF2_ITERATIONS}$${derived}` };
}

function constantEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, saltHex, stored) {
  const m = /^pbkdf2\$(\d{4,7})\$([0-9a-f]{64})$/.exec(stored || '');
  const salt = unhex(saltHex || '');
  if (!m || salt.length !== SALT_BYTES) {
    await derive(password || '', randomHex(SALT_BYTES), PBKDF2_ITERATIONS); // 保持与成功分支同量级耗时
    return false;
  }
  return constantEqual(await derive(password, saltHex, Number(m[1])), m[2]);
}

export const normalizeUsername = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
export const isValidUsername = (v) => USERNAME_RE.test(v || '');

export function checkPasswordFormat(password, username = '') {
  if (typeof password !== 'string' || password.length < 8 || password.length > 64) return 'weak_password';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'weak_password';
  if (username && password.toLowerCase().includes(username)) return 'password_equals_account';
  return null;
}

export function publicAccount(a) {
  return {
    id: a.id, username: a.username, displayName: a.display_name, role: a.role,
    studentId: a.student_id || null, status: a.status, mustChange: !!a.must_change,
    lockedUntil: a.locked_until || null, lastLoginAt: a.last_login_at || null, createdAt: a.created_at || null,
  };
}

// ---------- 账号读写 ----------
async function findAccount(supabase, column, value) {
  const { data, error } = await supabase.from('accounts').select('*').eq(column, value).limit(1);
  if (error) throw dbDown();
  return (data && data[0]) || null;
}

export async function hasAccounts(supabase) {
  const { data, error } = await supabase.from('accounts').select('id').limit(1);
  if (error) throw dbDown();
  return !!(data && data.length);
}

export async function createAccount(supabase, { username, displayName, role, password, studentId = null }) {
  if (!USERNAME_RE.test(username)) throw new AuthError('invalid_username');
  if (ACCOUNT_ROLES.indexOf(role) < 0) throw new AuthError('invalid_role');
  const weak = checkPasswordFormat(password, username);
  if (weak) throw new AuthError(weak);
  if (await findAccount(supabase, 'username', username)) throw new AuthError('username_taken', 409);
  const { salt, hash } = await hashPassword(password);
  const row = {
    id: crypto.randomUUID(), username, display_name: displayName, role, student_id: studentId,
    pwd_salt: salt, pwd_hash: hash, must_change: true, status: 'active',
    fail_count: 0, locked_until: null, created_at: isoAt(Date.now()), last_login_at: null,
  };
  const { error } = await supabase.from('accounts').insert(row);
  if (error) throw dbDown();
  return row;
}

export async function setPassword(supabase, accountId, password, username = '', mustChange = false) {
  const weak = checkPasswordFormat(password, username);
  if (weak) throw new AuthError(weak);
  const { salt, hash } = await hashPassword(password);
  const { error } = await supabase.from('accounts').update({
    pwd_salt: salt, pwd_hash: hash, must_change: mustChange, fail_count: 0, locked_until: null,
  }).eq('id', accountId);
  if (error) throw dbDown();
}

export async function findAccountByUsername(supabase, username) {
  return findAccount(supabase, 'username', username);
}

export async function findAccountById(supabase, id) {
  return findAccount(supabase, 'id', id);
}

// ---------- 会话 ----------
export async function issueSession(supabase, accountId) {
  const token = randomHex(TOKEN_BYTES);
  const now = Date.now();
  const expiresAt = isoAt(now + SESSION_TTL_MS);
  const { error } = await supabase.from('sessions').insert({
    id: crypto.randomUUID(), token_hash: await sha256Hex(token), account_id: accountId,
    expires_at: expiresAt, created_at: isoAt(now), last_seen_at: isoAt(now),
  });
  if (error) throw dbDown();
  return { token, expiresAt };
}

export async function dropSession(supabase, rawToken) {
  const token = (rawToken || '').trim();
  if (!/^[0-9a-f]{64}$/.test(token)) return;
  const { error } = await supabase.from('sessions').delete().eq('token_hash', await sha256Hex(token));
  if (error) throw dbDown();
}

export async function dropAccountSessions(supabase, accountId, exceptToken = '') {
  const { data, error } = await supabase.from('sessions').select('id,token_hash').eq('account_id', accountId);
  if (error) throw dbDown();
  const keep = exceptToken ? await sha256Hex(exceptToken.trim()) : null;
  for (const s of (data || [])) {
    if (keep && s.token_hash === keep) continue;
    const { error: e2 } = await supabase.from('sessions').delete().eq('id', s.id);
    if (e2) throw dbDown();
  }
}

/** 校验令牌并滑动续期，返回账号行；无效则返回 null。 */
export async function readSession(supabase, rawToken) {
  const token = (rawToken || '').trim();
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data: sessions, error } = await supabase.from('sessions')
    .select('*').eq('token_hash', await sha256Hex(token)).limit(1);
  if (error) throw dbDown();
  const session = sessions && sessions[0];
  if (!session) return null;
  const nowMs = Date.now();
  if (String(session.expires_at) <= isoAt(nowMs)) {
    await dropSession(supabase, token);
    return null;
  }
  const account = await findAccount(supabase, 'id', session.account_id);
  if (!account || account.status !== 'active') return null;
  if (nowMs - Date.parse(String(session.last_seen_at)) > RENEW_AFTER_MS) {
    const { error: e2 } = await supabase.from('sessions')
      .update({ last_seen_at: isoAt(nowMs), expires_at: isoAt(nowMs + SESSION_TTL_MS) }).eq('id', session.id);
    if (e2) throw dbDown();
  }
  return account;
}

// ---------- 登录 ----------
export async function authenticate(supabase, rawUsername, rawPassword) {
  const username = normalizeUsername(rawUsername);
  const password = typeof rawPassword === 'string' && rawPassword.length <= 72 ? rawPassword : '';
  if (!username || !password) return { code: 'invalid_credentials' };
  const account = await findAccount(supabase, 'username', username);
  if (!account) {
    await derive(password, randomHex(SALT_BYTES), PBKDF2_ITERATIONS); // 未知账号也等时，避免枚举
    return { code: 'invalid_credentials' };
  }
  if (account.status !== 'active') return { code: 'account_disabled' };
  const nowMs = Date.now();
  if (account.locked_until && String(account.locked_until) > isoAt(nowMs)) {
    return { code: 'account_locked', lockedUntil: account.locked_until };
  }
  if (!(await verifyPassword(password, account.pwd_salt, account.pwd_hash))) {
    const fails = Number(account.fail_count) + 1 || 1;
    const lock = fails >= MAX_FAILED;
    const patch = lock ? { fail_count: 0, locked_until: isoAt(nowMs + LOCK_MS) } : { fail_count: fails };
    const { error } = await supabase.from('accounts').update(patch).eq('id', account.id);
    if (error) throw dbDown();
    if (lock) await dropAccountSessions(supabase, account.id);
    return { code: lock ? 'account_locked' : 'invalid_credentials', lockedUntil: lock ? patch.locked_until : null };
  }
  const { error } = await supabase.from('accounts')
    .update({ fail_count: 0, locked_until: null, last_login_at: isoAt(nowMs) }).eq('id', account.id);
  if (error) throw dbDown();
  const { token, expiresAt } = await issueSession(supabase, account.id);
  return { account, token, expiresAt };
}

/** 一次性初始化：仅当账号表为空且网关注入了 Qoder 身份（站点尚未公开）时可用。 */
export async function bootstrapAdmin(supabase, request, { username, password, displayName }) {
  if (await hasAccounts(supabase)) throw new AuthError('already_initialized', 409);
  requireUser(request);
  const account = await createAccount(supabase, {
    username: normalizeUsername(username), displayName: displayName || '管理员',
    role: 'ADMIN', password,
  });
  const { error } = await supabase.from('accounts').update({ must_change: false }).eq('id', account.id);
  if (error) throw dbDown();
  account.must_change = false;
  const { token, expiresAt } = await issueSession(supabase, account.id);
  return { account, token, expiresAt };
}
