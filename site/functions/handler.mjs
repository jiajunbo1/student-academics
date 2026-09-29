// 学业管理系统业务 handler：action 路由 + 自建账号会话鉴权 + 角色控制（ADMIN/TEACHER/STUDENT）。
// 数据库为 app.* 受限 schema：uuid 主键、日期用 text(YYYY-MM-DD)、分数用 integer(十分之一分)。
// 共用校验与响应封装在 common.mjs，背诵/作业登记见 daily.mjs。
import { UserContextError } from './auth.mjs';
import {
  AppError, ARR, CELL, DATE, DATE_RE, DRY, E, ID, IMPORT_MAX_ROWS, INT, ONE_OF, OPT_ID, OPT_STR, STR,
  count, db, fail, nowIso, ok, importResult, readBody,
} from './common.mjs';
import {
  AuthError, ACCOUNT_ROLES, ACCOUNT_STATUS, authenticate, bootstrapAdmin, checkPasswordFormat,
  createAccount, dropAccountSessions, dropSession, findAccountById, findAccountByUsername, hasAccounts,
  isValidUsername, normalizeUsername, publicAccount, setPassword, verifyPassword,
} from './accounts.mjs';
import { currentAccount, principal, requireAdmin, requireStaff, teachesClass, teachesPair, teachesSubject, TOKEN_HEADER } from './scope.mjs';
import { buildDemoData } from './demo-data.mjs';
import { dailyRoutes, portalDaily } from './daily.mjs';

// 分数：输入 0-150 一位小数，存储为十分之一整数
const SCORE_T = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 150) throw new AppError('invalid_score');
  return Math.round(n * 10);
};
const TENTHS = (v) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1500 ? v : (() => { throw new AppError('invalid_score'); })());

const GENDERS = ['男', '女'];
const STUDENT_STATUS = ['在读', '休学', '转班', '毕业'];

// 授权条目校验：去重后的 {subjectId, classId} 列表；非教师角色必须为空。
function normalizeAssignments(raw, role) {
  const list = raw === null || raw === undefined ? [] : ARR(raw, 200);
  if (list.length && role !== 'TEACHER') throw new AppError('assignments_not_allowed');
  const out = new Set();
  for (const a of list) {
    if (!a || typeof a !== 'object') throw new AppError('invalid_assignment');
    const subjectId = ID(a.subjectId); const classId = ID(a.classId);
    out.add(`${subjectId}|${classId}`);
  }
  return [...out].map((k) => { const i = k.indexOf('|'); return { subjectId: k.slice(0, i), classId: k.slice(i + 1) }; });
}

async function replaceAssignments(supabase, accountId, rows) {
  await db(supabase.from('teaching_assignments').delete().eq('account_id', accountId));
  for (const r of rows) {
    await db(supabase.from('teaching_assignments').insert({
      id: crypto.randomUUID(), account_id: accountId, subject_id: r.subjectId, class_id: r.classId, created_at: nowIso(),
    }));
  }
}

// ---------- 认证动作 ----------
async function actAuthStatus(supabase) {
  return ok({ needsBootstrap: !(await hasAccounts(supabase)) });
}

async function actAuthLogin(supabase, request) {
  const b = await readBody(request);
  const result = await authenticate(supabase, b.username, b.password);
  if (result.code) return fail(result.code, result.code === 'account_locked' ? 429 : 401);
  return ok({ token: result.token, expiresAt: result.expiresAt, account: publicAccount(result.account) });
}

async function actAuthBootstrap(supabase, request) {
  const b = await readBody(request);
  const r = await bootstrapAdmin(supabase, request, {
    username: STR(b.username, 32), password: STR(b.password, 64), displayName: STR(b.displayName, 50, false),
  });
  return ok({ token: r.token, expiresAt: r.expiresAt, account: publicAccount(r.account) });
}

async function actAuthMe(supabase, request) {
  return ok({ account: publicAccount(await currentAccount(supabase, request)) });
}

async function actAuthLogout(supabase, request) {
  await dropSession(supabase, request.headers.get(TOKEN_HEADER));
  return ok();
}

async function actAuthChangePassword(supabase, request) {
  const account = await currentAccount(supabase, request);
  const b = await readBody(request);
  const current = STR(b.currentPassword, 72);
  const next = STR(b.newPassword, 64);
  if (current === next) throw new AppError('same_password');
  const weak = checkPasswordFormat(next, account.username);
  if (weak) throw new AppError(weak);
  if (!(await verifyPassword(current, account.pwd_salt, account.pwd_hash))) return fail('wrong_password', 401);
  await setPassword(supabase, account.id, next, account.username, false);
  await dropAccountSessions(supabase, account.id, request.headers.get(TOKEN_HEADER));
  return ok({ account: { ...publicAccount(account), mustChange: false, lockedUntil: null } });
}

// ---------- 账号管理动作（仅管理员） ----------
async function actAccountsList(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const [rows, students, classes, assignRows, subjects] = await Promise.all([
    db(supabase.from('accounts').select('*').order('created_at')),
    db(supabase.from('students').select('id,name,student_no,class_id')),
    db(supabase.from('classes').select('id,name')),
    db(supabase.from('teaching_assignments').select('*')),
    db(supabase.from('subjects').select('id,name').order('sort')),
  ]);
  const sm = new Map(students.map(s => [s.id, s]));
  const cn = new Map(classes.map(c => [c.id, c.name]));
  const sn = new Map(subjects.map(s => [s.id, s.name]));
  const byAccount = new Map();
  for (const a of assignRows) {
    const list = byAccount.get(a.account_id) || [];
    list.push({
      subjectId: a.subject_id, classId: a.class_id,
      subjectName: sn.get(a.subject_id) || '', className: cn.get(a.class_id) || '',
    });
    byAccount.set(a.account_id, list);
  }
  return ok({ accounts: rows.map(a => {
    const st = a.student_id ? sm.get(a.student_id) : null;
    const assign = byAccount.get(a.id) || [];
    return {
      ...publicAccount(a),
      studentName: st ? st.name : '', studentNo: st ? st.student_no : '',
      className: st ? (cn.get(st.class_id) || '') : '',
      assignments: assign,
      subjectNames: [...new Set(assign.map(x => x.subjectName))].filter(Boolean),
      classNames: [...new Set(assign.map(x => x.className))].filter(Boolean),
    };
  }) });
}

async function actAccountsSave(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  const id = OPT_ID(b.id);
  const role = ONE_OF(b.role, ACCOUNT_ROLES);
  const displayName = STR(b.displayName, 50);
  const username = normalizeUsername(STR(b.username, 32));
  const studentId = OPT_ID(b.studentId);
  if (!isValidUsername(username)) throw new AppError('invalid_username');
  if (role === 'STUDENT' && !studentId) throw new AppError('student_required');
  if (role !== 'STUDENT' && studentId) throw new AppError('student_not_allowed');
  const password = typeof b.password === 'string' ? b.password : '';
  // 只有显式提交 assignments 才改写授权；改角色、重置密码等动作不带该字段时保持原样。
  const wantsAssign = Array.isArray(b.assignments);
  const assignments = wantsAssign ? normalizeAssignments(b.assignments, role) : [];
  if (id) {
    const target = await findAccountById(supabase, id);
    if (!target) return fail('not_found', 404);
    if (target.id === p.account.id && role !== 'ADMIN') throw new AppError('cannot_demote_self', 409);
    const dup = await findAccountByUsername(supabase, username);
    if (dup && dup.id !== id) return fail('username_taken', 409);
    await db(supabase.from('accounts').update({ username, display_name: displayName, role, student_id: studentId }).eq('id', id));
    if (role !== 'TEACHER') await replaceAssignments(supabase, id, []);
    else if (wantsAssign) await replaceAssignments(supabase, id, assignments);
    if (password) {
      await setPassword(supabase, id, password, username, true);
      await dropAccountSessions(supabase, id);
    }
  } else {
    if (!password) throw new AppError('missing_field');
    const created = await createAccount(supabase, { username, displayName, role, password, studentId });
    if (assignments.length) await replaceAssignments(supabase, created.id, assignments);
    return ok({ id: created.id });
  }
  return ok({ id });
}

async function actAccountsStatus(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  const id = ID(b.id);
  const status = ONE_OF(b.status, ACCOUNT_STATUS);
  if (id === p.account.id) return fail('cannot_disable_self', 409);
  const target = await findAccountById(supabase, id);
  if (!target) return fail('not_found', 404);
  await db(supabase.from('accounts').update({ status }).eq('id', id));
  if (status !== 'active') await dropAccountSessions(supabase, id);
  return ok();
}

async function actAccountsDelete(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  const id = ID(b.id);
  if (id === p.account.id) return fail('cannot_delete_self', 409);
  const target = await findAccountById(supabase, id);
  if (!target) return fail('not_found', 404);
  await dropAccountSessions(supabase, id);
  await db(supabase.from('accounts').delete().eq('id', id));
  await replaceAssignments(supabase, id, []);
  return ok();
}

// 批量开通学生账号：用户名=学号，共用初始口令，首次登录强制改密。
async function actAccountsSeedStudents(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  const initial = STR(b.initialPassword, 64);
  const classId = OPT_ID(b.classId);
  const [students, accounts] = await Promise.all([
    db(supabase.from('students').select('*').order('student_no')),
    db(supabase.from('accounts').select('id,username,student_id')),
  ]);
  const linked = new Set(accounts.map(a => a.student_id));
  const taken = new Set(accounts.map(a => a.username));
  const created = []; const skipped = []; const invalid = [];
  let truncated = false;
  for (const st of students) {
    if (st.status !== '在读') continue;
    if (classId && st.class_id !== classId) continue;
    if (linked.has(st.id)) { skipped.push(st.student_no); continue; }
    const username = normalizeUsername(st.student_no);
    if (!isValidUsername(username) || taken.has(username)) { invalid.push(st.student_no); continue; }
    if (created.length >= 200) { truncated = true; break; }
    try {
      await createAccount(supabase, { username, displayName: st.name, role: 'STUDENT', password: initial, studentId: st.id });
      created.push(username); taken.add(username); linked.add(st.id);
    } catch (e) {
      if (e instanceof AuthError && e.code === 'username_taken') { invalid.push(st.student_no); continue; }
      throw e;
    }
  }
  return ok({ created, skipped, invalid, truncated });
}

// ---------- GET 动作 ----------
async function actDashboard(supabase, request) {
  const p = await principal(supabase, request); requireStaff(p);
  const scope = p.scope;
  const [studentRows, classRows, adminCount, teacherCount, exams] = await Promise.all([
    db(supabase.from('students').select('id,name,class_id')),
    db(supabase.from('classes').select('id')),
    count(supabase, 'accounts', ['role', 'ADMIN']), count(supabase, 'accounts', ['role', 'TEACHER']),
    count(supabase, 'exams'),
  ]);
  const students = scope.all ? studentRows : studentRows.filter(s => teachesClass(scope, s.class_id));
  const classList = scope.all ? classRows : classRows.filter(c => teachesClass(scope, c.id));
  const teachers = adminCount + teacherCount;
  const studentClass = new Map(studentRows.map(s => [s.id, s.class_id]));
  let lastExam = null, subjectAvgs = [], scoreRows = [];
  const examList = await db(supabase.from('exams').select('id,name,exam_date').order('exam_date', { ascending: false }));
  for (const e of examList) {
    const rows = await db(supabase.from('scores').select('subject_id,student_id,score').eq('exam_id', e.id));
    const mine = rows.filter(r => {
      const cid = studentClass.get(r.student_id);
      return cid !== undefined && teachesClass(scope, cid);
    });
    if (mine.length) { lastExam = e; scoreRows = mine; break; }
  }
  if (lastExam) {
    const subjects = await db(supabase.from('subjects').select('id,name').order('sort'));
    const agg = new Map();
    for (const r of scoreRows) {
      if (!teachesSubject(scope, r.subject_id)) continue;
      const a = agg.get(r.subject_id) || { sum: 0, n: 0 };
      a.sum += r.score; a.n += 1; agg.set(r.subject_id, a);
    }
    subjectAvgs = subjects.filter(s => agg.has(s.id))
      .map(s => ({ name: s.name, avg: +(agg.get(s.id).sum / agg.get(s.id).n / 10).toFixed(1) }));
  }
  return ok({
    counts: { students: students.length, classes: classList.length, teachers, exams },
    lastExam, subjectAvgs,
  });
}

async function actClassesList(supabase, request) {
  const p = await principal(supabase, request); requireStaff(p);
  const [classes, students, staff] = await Promise.all([
    db(supabase.from('classes').select('*').order('grade').order('name')),
    db(supabase.from('students').select('id,class_id')),
    db(supabase.from('accounts').select('id,display_name').order('created_at')),
  ]);
  const cnt = new Map();
  for (const s of students) cnt.set(s.class_id, (cnt.get(s.class_id) || 0) + 1);
  const nameOf = new Map(staff.map(u => [u.id, u.display_name]));
  return ok({ classes: classes.filter(c => teachesClass(p.scope, c.id)).map(c => ({
    ...c, studentCount: cnt.get(c.id) || 0, headTeacherName: c.head_user_id ? (nameOf.get(c.head_user_id) || '') : '',
  }) ) });
}

async function actStudentsList(supabase, request, params) {
  const p = await principal(supabase, request); requireStaff(p);
  const kw = params.get('kw') || '';
  const classId = params.get('classId') || '';
  const status = params.get('status') || '';
  let rows = await db(supabase.from('students').select('*').order('student_no'));
  rows = rows.filter(r => teachesClass(p.scope, r.class_id));
  if (classId) { ID(classId); rows = rows.filter(r => r.class_id === classId); }
  if (status) { ONE_OF(status, STUDENT_STATUS); rows = rows.filter(r => r.status === status); }
  if (kw) rows = rows.filter(r => r.name.includes(kw) || r.student_no.includes(kw));
  const classes = await db(supabase.from('classes').select('id,name'));
  const cn = new Map(classes.map(c => [c.id, c.name]));
  return ok({ students: rows.map(r => ({ ...r, className: cn.get(r.class_id) || '' })) });
}

async function actStudentsGet(supabase, request, params) {
  const p = await principal(supabase, request); requireStaff(p);
  const id = ID(params.get('id'));
  const student = await db(supabase.from('students').select('*').eq('id', id).maybeSingle());
  if (!student) return fail('not_found', 404);
  if (!teachesClass(p.scope, student.class_id)) return fail('forbidden', 403);
  const [scores, classes] = await Promise.all([
    db(supabase.from('scores').select('*').eq('student_id', id).order('created_at')),
    db(supabase.from('classes').select('id,name')),
  ]);
  return ok({
    student: { ...student, className: (classes.find(c => c.id === student.class_id) || {}).name || '' },
    scores: scores.filter(s => teachesPair(p.scope, s.subject_id, student.class_id)),
  });
}

// 学生门户：只读本人数据 + 每次考试的总分/班级均分/班内排名序列。
// 刻意不返回住址、电话、监护人等 PII，只回学生本人可见的范围。
async function actPortalMe(supabase, request) {
  const p = await principal(supabase, request);
  const studentId = p.account.student_id;
  if (p.account.role !== 'STUDENT' || !studentId) return fail('not_a_student', 403);
  const [student, subjects, exams, classes] = await Promise.all([
    db(supabase.from('students').select('*').eq('id', studentId).maybeSingle()),
    db(supabase.from('subjects').select('id,name').order('sort')),
    db(supabase.from('exams').select('id,name,exam_date,term').order('exam_date')),
    db(supabase.from('classes').select('id,name')),
  ]);
  if (!student) return fail('not_found', 404);
  const [allScores, classmates] = await Promise.all([
    db(supabase.from('scores').select('*')),
    db(supabase.from('students').select('id').eq('class_id', student.class_id)),
  ]);
  const totals = new Map(); // studentId|examId -> { total, n }
  for (const s of allScores) {
    const k = `${s.student_id}|${s.exam_id}`;
    const a = totals.get(k) || { total: 0, n: 0 };
    a.total += s.score; a.n += 1; totals.set(k, a);
  }
  const mine = new Map();
  for (const s of allScores) if (s.student_id === studentId) {
    const bySubject = mine.get(s.exam_id) || {};
    bySubject[s.subject_id] = s.score; mine.set(s.exam_id, bySubject);
  }
  const records = [];
  for (const e of exams) {
    const peers = classmates.map(c => totals.get(`${c.id}|${e.id}`)).filter(Boolean);
    const self = totals.get(`${studentId}|${e.id}`);
    if (!self && !peers.length) continue;
    const peerTotals = peers.map(r => r.total).sort((a, b) => b - a);
    const classAvg = peers.length ? Math.round(peerTotals.reduce((a, b) => a + b, 0) / peers.length) : 0;
    records.push({
      examId: e.id, examName: e.name, examDate: e.exam_date, term: e.term,
      cells: mine.get(e.id) || {}, total: self ? self.total : 0, count: self ? self.n : 0,
      avg: self && self.n ? +(self.total / self.n / 10).toFixed(1) : 0,
      classAvg: +(classAvg / 10).toFixed(1),
      rank: self ? peerTotals.filter(t => t > self.total).length + 1 : null,
      classSize: peers.length,
    });
  }
  return ok({
    student: {
      name: student.name, studentNo: student.student_no, gender: student.gender,
      enrollYear: student.enroll_year, status: student.status,
      className: (classes.find(c => c.id === student.class_id) || {}).name || '',
    },
    subjects, records, ...(await portalDaily(supabase, studentId, student.class_id)),
  });
}

async function actRefData(supabase, request) {
  const p = await principal(supabase, request); requireStaff(p);
  const [subjects, exams] = await Promise.all([
    db(supabase.from('subjects').select('*').order('sort')),
    db(supabase.from('exams').select('*').order('exam_date', { ascending: false })),
  ]);
  return ok({ subjects: subjects.filter(s => teachesSubject(p.scope, s.id)), exams });
}

async function actScoreSheet(supabase, request, params) {
  const p = await principal(supabase, request); requireStaff(p);
  const examId = ID(params.get('examId'));
  const classId = params.get('classId') ? ID(params.get('classId')) : null;
  if (classId && !teachesClass(p.scope, classId)) return fail('forbidden', 403);
  const [subjects, students, scores, classes] = await Promise.all([
    db(supabase.from('subjects').select('id,name').order('sort')),
    db(supabase.from('students').select('*').order('student_no')),
    db(supabase.from('scores').select('*').eq('exam_id', examId)),
    db(supabase.from('classes').select('id,name')),
  ]);
  const scoreKey = new Map(scores.map(s => [`${s.student_id}|${s.subject_id}`, s.score]));
  const cn = new Map(classes.map(c => [c.id, c.name]));
  // 教师只出自己有任教科目的列；已选班级时按「科目×班级」精确收窄。
  const present = subjects.filter(sub => scores.some(s => s.subject_id === sub.id)
    && (p.scope.all || (classId ? teachesPair(p.scope, sub.id, classId) : teachesSubject(p.scope, sub.id))));
  const rows = [];
  for (const st of students) {
    if (!teachesClass(p.scope, st.class_id)) continue;
    if (classId && st.class_id !== classId) continue;
    const cols = present.filter(sub => teachesPair(p.scope, sub.id, st.class_id));
    if (!cols.some(sub => scoreKey.has(`${st.id}|${sub.id}`))) continue;
    const cells = {};
    let total = 0; let n = 0;
    for (const sub of cols) {
      const v = scoreKey.get(`${st.id}|${sub.id}`);
      cells[sub.id] = v === undefined ? null : v;
      if (v !== undefined) { total += v; n += 1; }
    }
    rows.push({
      studentId: st.id, studentNo: st.student_no, studentName: st.name,
      className: cn.get(st.class_id) || '', cells, total, count: n,
      avg: n ? +(total / n / 10).toFixed(1) : 0,
    });
  }
  const byClass = new Map();
  for (const r of rows) { if (!byClass.has(r.className)) byClass.set(r.className, []); byClass.get(r.className).push(r); }
  for (const list of byClass.values()) {
    list.sort((a, b) => b.total - a.total);
    let rank = 0; let prev = null;
    list.forEach((r, i) => { if (prev === null || r.total < prev) { rank = i + 1; prev = r.total; } r.classRank = rank; });
  }
  rows.sort((a, b) => a.className.localeCompare(b.className) || a.classRank - b.classRank);
  return ok({ rows, subjects: present });
}

// 某一科目的历年走势：按考试 × 班级给出平均分，并附带每个学生的历次得分。
// 只统计请求者任教范围内的班级，科目不在范围内直接拒绝。
async function actSubjectTrend(supabase, request, params) {
  const p = await principal(supabase, request); requireStaff(p);
  const subjectId = ID(params.get('subjectId'));
  const classId = params.get('classId') ? ID(params.get('classId')) : null;
  if (!teachesSubject(p.scope, subjectId)) return fail('out_of_scope', 403);
  if (classId && !teachesClass(p.scope, classId)) return fail('forbidden', 403);
  const [subject, exams, classes, students, scores] = await Promise.all([
    db(supabase.from('subjects').select('id,name').eq('id', subjectId).maybeSingle()),
    db(supabase.from('exams').select('id,name,exam_date').order('exam_date')),
    db(supabase.from('classes').select('id,name').order('grade').order('name')),
    db(supabase.from('students').select('id,name,student_no,class_id').order('student_no')),
    db(supabase.from('scores').select('student_id,exam_id,score').eq('subject_id', subjectId)),
  ]);
  if (!subject) return fail('not_found', 404);
  const scopeClasses = classes.filter(c => teachesClass(p.scope, c.id) && (!classId || c.id === classId));
  const inScope = new Map(scopeClasses.map(c => [c.id, c]));
  const pool = students.filter(s => inScope.has(s.class_id));
  const byStudent = new Map(pool.map(s => [s.id, s]));
  const agg = new Map(); // classId|examId -> { sum, n }
  const studentScores = new Map(); // studentId -> { examId: tenths }
  for (const r of scores) {
    const st = byStudent.get(r.student_id);
    if (!st || !teachesPair(p.scope, subjectId, st.class_id)) continue;
    const m = studentScores.get(r.student_id) || {};
    m[r.exam_id] = r.score; studentScores.set(r.student_id, m);
    const key = `${st.class_id}|${r.exam_id}`;
    const a = agg.get(key) || { sum: 0, n: 0 };
    a.sum += r.score; a.n += 1; agg.set(key, a);
  }
  const hasData = exams.some(e => [...agg.keys()].some(k => k.endsWith(`|${e.id}`)));
  const trendExams = hasData ? exams : [];
  const avgOf = (cid, eid) => { const a = agg.get(`${cid}|${eid}`); return a ? +(a.sum / a.n / 10).toFixed(1) : null; };
  return ok({
    subject,
    exams: trendExams.map(e => ({ id: e.id, name: e.name, examDate: e.exam_date })),
    classes: scopeClasses.map(c => ({ id: c.id, name: c.name })),
    classAvg: Object.fromEntries(scopeClasses.map(c => [c.id, Object.fromEntries(trendExams.map(e => [e.id, avgOf(c.id, e.id)]))])),
    students: pool.filter(s => studentScores.has(s.id)).map(s => ({
      id: s.id, name: s.name, studentNo: s.student_no, classId: s.class_id,
      className: inScope.get(s.class_id).name,
      scores: Object.fromEntries(trendExams.map(e => [e.id, studentScores.get(s.id)[e.id] ?? null])),
    })),
  });
}

// ---------- POST 动作 ----------
async function actClassesSave(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  const id = OPT_ID(b.id);
  const row = {
    name: STR(b.name, 50), grade: ONE_OF(b.grade, ['高一', '高二', '高三']),
    head_user_id: OPT_STR(b.headUserId, 128),
  };
  if (id) await db(supabase.from('classes').update(row).eq('id', id));
  else await db(supabase.from('classes').insert({ ...row, id: crypto.randomUUID(), created_at: nowIso() }));
  return ok({ id: id || null });
}

async function actClassesDelete(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  const id = ID(b.id);
  const n = await count(supabase, 'students', ['class_id', id]);
  if (n > 0) return fail('class_not_empty', 409);
  await db(supabase.from('classes').delete().eq('id', id));
  return ok();
}

async function actStudentsSave(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  const id = OPT_ID(b.id);
  const row = {
    student_no: STR(b.studentNo, 30), name: STR(b.name, 50),
    gender: ONE_OF(b.gender, GENDERS), birth_date: DATE(b.birthDate, false),
    class_id: ID(b.classId), enroll_year: INT(b.enrollYear, 1990, 2100),
    address: OPT_STR(b.address, 200), phone: OPT_STR(b.phone, 20),
    guardian_name: OPT_STR(b.guardianName, 50), guardian_phone: OPT_STR(b.guardianPhone, 20),
    status: ONE_OF(b.status || '在读', STUDENT_STATUS),
  };
  if (id) await db(supabase.from('students').update(row).eq('id', id));
  else await db(supabase.from('students').insert({ ...row, id: crypto.randomUUID(), created_at: nowIso() }));
  return ok({ id: id || null });
}

async function actStudentsDelete(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  const id = ID(b.id);
  for (const t of ['scores', 'attendance', 'disciplines', 'activities', 'reviews'])
    await db(supabase.from(t).delete().eq('student_id', id));
  await db(supabase.from('students').delete().eq('id', id));
  return ok();
}

async function actExamsSave(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  await db(supabase.from('exams').insert({
    id: crypto.randomUUID(), name: STR(b.name, 50), exam_date: DATE(b.examDate),
    term: STR(b.term, 30), created_at: nowIso(),
  }));
  return ok();
}

async function actScoresSave(supabase, request) {
  const p = await principal(supabase, request); requireStaff(p); // 教师可录入自己任教科目
  const b = await readBody(request);
  const examId = ID(b.examId); const subjectId = ID(b.subjectId);
  const entries = ARR(b.entries, 100).map(e => ({ studentId: ID(e.studentId), tenths: e.score === null || e.score === undefined || e.score === '' ? null : TENTHS(SCORE_T(e.score)) }));
  if (!p.scope.all) {
    const students = await db(supabase.from('students').select('id,class_id'));
    const cm = new Map(students.map(s => [s.id, s.class_id]));
    for (const e of entries) {
      const classId = cm.get(e.studentId);
      if (!classId || !teachesPair(p.scope, subjectId, classId)) return fail('out_of_scope', 403);
    }
  }
  for (const e of entries) {
    const old = await db(supabase.from('scores').select('id')
      .eq('student_id', e.studentId).eq('subject_id', subjectId).eq('exam_id', examId).limit(1));
    if (e.tenths === null) {
      if (old && old.length) await db(supabase.from('scores').delete().eq('id', old[0].id));
      continue;
    }
    if (old && old.length) await db(supabase.from('scores').update({ score: e.tenths }).eq('id', old[0].id));
    else await db(supabase.from('scores').insert({
      id: crypto.randomUUID(), student_id: e.studentId, subject_id: subjectId,
      exam_id: examId, score: e.tenths, created_at: nowIso(),
    }));
  }
  return ok({ saved: entries.length });
}

async function actDemoSeed(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const n = await count(supabase, 'students');
  if (n > 0) return fail('already_seeded', 409);
  const data = buildDemoData(() => crypto.randomUUID(), nowIso);
  for (const [table, rows] of Object.entries(data))
    await db(supabase.from(table).insert(rows), `seed_${table}`);
  return ok({ seeded: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])) });
}

// ---------- 批量导入 ----------
// CSV 解析在前端完成，这里只做服务端逐行校验；dryRun 默认 true，先给前端预览再确认落库。
// 每行返回 { line, label, ok, action, errors:[{field,code}] }，无效行不影响其他行写入。
const keep = (v, old) => (v === '' ? old : v);

async function actImportStudents(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  const dryRun = DRY(b);
  const updateExisting = b.updateExisting === true;
  const raw = ARR(b.rows, IMPORT_MAX_ROWS);
  if (!raw.length) throw new AppError('missing_field');
  const [classes, students] = await Promise.all([
    db(supabase.from('classes').select('id,name')),
    db(supabase.from('students').select('id,student_no,name,gender,birth_date,class_id,enroll_year,address,phone,guardian_name,guardian_phone,status')),
  ]);
  const classByName = new Map(classes.map((c) => [c.name, c]));
  const known = new Map(students.map((s) => [s.student_no, s]));
  const items = [];
  const seen = new Set();
  for (const [i, r] of raw.entries()) {
    const no = CELL(r.studentNo), name = CELL(r.name);
    const gender = CELL(r.gender), status = CELL(r.status) || '在读';
    const birth = CELL(r.birthDate), enroll = CELL(r.enrollYear);
    const className = CELL(r.className);
    const errors = [];
    if (!no) errors.push(E('studentNo', 'missing_field'));
    else if (no.length > 30) errors.push(E('studentNo', 'text_too_long'));
    else if (seen.has(no)) errors.push(E('studentNo', 'duplicate_row'));
    if (!name) errors.push(E('name', 'missing_field'));
    else if (name.length > 50) errors.push(E('name', 'text_too_long'));
    if (!GENDERS.includes(gender)) errors.push(E('gender', 'invalid_choice'));
    if (birth && !DATE_RE.test(birth)) errors.push(E('birthDate', 'invalid_date'));
    if (!STUDENT_STATUS.includes(status)) errors.push(E('status', 'invalid_choice'));
    if (enroll && !/^\d{4}$/.test(enroll)) errors.push(E('enrollYear', 'invalid_number'));
    const cls = classByName.get(className);
    if (!className) errors.push(E('className', 'missing_field'));
    else if (!cls) errors.push(E('className', 'class_not_found'));
    if (no) seen.add(no);
    const old = known.get(no);
    const action = errors.length ? 'invalid' : !old ? 'create' : updateExisting ? 'update' : 'skip';
    if (action === 'update' || action === 'create') {
      const row = {
        student_no: no, name, gender, birth_date: birth || null,
        class_id: cls.id, enroll_year: enroll ? Number(enroll) : null,
        address: CELL(r.address), phone: CELL(r.phone),
        guardian_name: CELL(r.guardianName), guardian_phone: CELL(r.guardianPhone), status,
      };
      if (old) Object.assign(row, {
        birth_date: birth || old.birth_date, address: keep(CELL(r.address), old.address),
        phone: keep(CELL(r.phone), old.phone), guardian_name: keep(CELL(r.guardianName), old.guardian_name),
        guardian_phone: keep(CELL(r.guardianPhone), old.guardian_phone),
        enroll_year: enroll ? Number(enroll) : old.enroll_year,
      });
      if (!dryRun) {
        if (old) await db(supabase.from('students').update(row).eq('id', old.id));
        else await db(supabase.from('students').insert({ ...row, id: crypto.randomUUID(), created_at: nowIso() }));
      }
      known.set(no, { ...(old || {}), ...row });
    }
    items.push({ line: i + 1, label: `${no || '—'} ${name}`.trim(), ok: !errors.length, action, errors });
  }
  return importResult(dryRun, items);
}

async function actImportScores(supabase, request) {
  const p = await principal(supabase, request); requireStaff(p);
  const b = await readBody(request);
  const dryRun = DRY(b);
  const examId = ID(b.examId);
  const raw = ARR(b.rows, IMPORT_MAX_ROWS);
  if (!raw.length) throw new AppError('missing_field');
  const [exam, subjects, students, scored] = await Promise.all([
    db(supabase.from('exams').select('id,name').eq('id', examId).maybeSingle()),
    db(supabase.from('subjects').select('id,name')),
    db(supabase.from('students').select('id,student_no,name,class_id')),
    db(supabase.from('scores').select('id,student_id,subject_id').eq('exam_id', examId)),
  ]);
  if (!exam) return fail('not_found', 404);
  const pool = p.scope.all ? students : students.filter((s) => teachesClass(p.scope, s.class_id));
  const byNo = new Map(pool.map((s) => [s.student_no, s]));
  const bySubject = new Map(subjects.map((s) => [s.name, s]));
  const hits = new Map(scored.map((r) => [`${r.student_id}|${r.subject_id}`, r.id]));
  const items = [];
  for (const [i, r] of raw.entries()) {
    const no = CELL(r.studentNo), subjectName = CELL(r.subjectName), text = CELL(r.score);
    const errors = [];
    const st = byNo.get(no);
    const subj = bySubject.get(subjectName);
    if (!no) errors.push(E('studentNo', 'missing_field'));
    else if (!st) errors.push(E('studentNo', 'student_not_found'));
    if (!subjectName) errors.push(E('subjectName', 'missing_field'));
    else if (!subj) errors.push(E('subjectName', 'subject_not_found'));
    if (st && subj && !teachesPair(p.scope, subj.id, st.class_id)) errors.push(E('subjectName', 'out_of_scope'));
    let tenths = null;
    if (text !== '') {
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0 || n > 150) errors.push(E('score', 'invalid_score'));
      else tenths = Math.round(n * 10);
    }
    const writable = !errors.length && tenths !== null;
    const action = errors.length ? 'invalid' : tenths === null ? 'skip' : hits.has(`${st.id}|${subj.id}`) ? 'update' : 'create';
    if (writable && !dryRun) {
      const hit = hits.get(`${st.id}|${subj.id}`);
      if (hit) await db(supabase.from('scores').update({ score: tenths }).eq('id', hit));
      else {
        const added = await db(supabase.from('scores').insert({
          id: crypto.randomUUID(), student_id: st.id, subject_id: subj.id,
          exam_id: examId, score: tenths, created_at: nowIso(),
        }).select('id'));
        if (added?.[0]?.id) hits.set(`${st.id}|${subj.id}`, added[0].id);
      }
    }
    items.push({ line: i + 1, label: `${no || '—'} ${st?.name ?? ''} · ${subjectName || '—'}`.trim(), ok: !errors.length, action, errors });
  }
  return importResult(dryRun, items, { examId, examName: exam.name });
}

// ---------- 路由 ----------
const GETS = new Map([
  ['auth.status', (s, r, p) => actAuthStatus(s)],
  ['auth.me', actAuthMe],
  ['dashboard', actDashboard],
  ['classes.list', actClassesList],
  ['students.list', actStudentsList],
  ['students.get', actStudentsGet],
  ['refdata', actRefData],
  ['scores.sheet', actScoreSheet],
  ['scores.trend', actSubjectTrend],
  ['portal.me', actPortalMe],
  ['accounts.list', actAccountsList],
  ...dailyRoutes.GETS,
]);
const POSTS = new Map([
  ['auth.login', actAuthLogin], ['auth.bootstrap', actAuthBootstrap],
  ['auth.logout', actAuthLogout], ['auth.change-password', actAuthChangePassword],
  ['accounts.save', actAccountsSave], ['accounts.status', actAccountsStatus],
  ['accounts.delete', actAccountsDelete], ['accounts.seed-students', actAccountsSeedStudents],
  ['classes.save', actClassesSave], ['classes.delete', actClassesDelete],
  ['students.save', actStudentsSave], ['students.delete', actStudentsDelete],
  ['exams.save', actExamsSave], ['scores.save', actScoresSave],
  ['import.students', actImportStudents], ['import.scores', actImportScores],
  ['demo.seed', actDemoSeed],
  ...dailyRoutes.POSTS,
]);

export async function handleApp({ request, supabase }) {
  const params = new URL(request.url).searchParams;
  const action = params.get('action') || '';
  const table = request.method === 'GET' ? GETS : request.method === 'POST' ? POSTS : null;
  if (!table) return fail('method_not_allowed', 405);
  const fn = table.get(action);
  if (!fn) return fail('not_found', 404);
  try {
    return await fn(supabase, request, params);
  } catch (e) {
    if (e instanceof UserContextError) return fail(e.code, e.status);
    if (e instanceof AppError || e instanceof AuthError) return fail(e.code, e.status);
    return fail('server_error', 503);
  }
}
