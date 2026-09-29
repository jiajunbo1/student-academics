// 会话鉴权与教师任教范围：handler.mjs 与 daily.mjs 共用。
import { AppError, db } from './common.mjs';
import { readSession } from './accounts.mjs';

const TOKEN_HEADER = 'x-app-token';

export { TOKEN_HEADER };
export async function currentAccount(supabase, request) {
  const account = await readSession(supabase, request.headers.get(TOKEN_HEADER));
  if (!account) throw new AppError('login_required', 401);
  return account;
}

// 业务动作一律要求会话；管理员设置的初始口令未改掉前只允许改密/登出。
export async function principal(supabase, request) {
  const account = await currentAccount(supabase, request);
  if (account.must_change) throw new AppError('password_change_required', 403);
  return { account, scope: await loadScope(supabase, account) };
}
export const requireAdmin = (p) => { if (p.account.role !== 'ADMIN') throw new AppError('forbidden', 403); };
export const requireStaff = (p) => { if (p.account.role === 'STUDENT') throw new AppError('forbidden', 403); };

// ---------- 教师任教授权 ----------
// teaching_assignments 一行 = 「该教师在该班教该科目」；管理员为全量，学生不走这套范围。
export async function loadScope(supabase, account) {
  const scope = { all: account.role === 'ADMIN', subjectIds: new Set(), classIds: new Set(), pairs: new Set() };
  if (account.role !== 'TEACHER') return scope;
  const rows = await db(supabase.from('teaching_assignments').select('*').eq('account_id', account.id));
  for (const r of rows) {
    scope.subjectIds.add(r.subject_id);
    scope.classIds.add(r.class_id);
    scope.pairs.add(`${r.subject_id}|${r.class_id}`);
  }
  return scope;
}
export const teachesSubject = (scope, subjectId) => scope.all || scope.subjectIds.has(subjectId);
export const teachesClass = (scope, classId) => scope.all || scope.classIds.has(classId);
export const teachesPair = (scope, subjectId, classId) => scope.all || scope.pairs.has(`${subjectId}|${classId}`);
