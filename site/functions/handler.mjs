// 学业管理系统业务 handler：action 路由 + Qoder 身份 + 角色控制。
// 数据库为 app.* 受限 schema：uuid 主键、日期用 text(YYYY-MM-DD)、分数用 integer(十分之一分)。
import { requireUser, UserContextError } from './auth.mjs';
import { buildDemoData } from './demo-data.mjs';

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const ok = (data = {}) => json({ ok: true, ...data });
const fail = (error, status = 400) => json({ ok: false, error }, status);

class AppError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

// ---------- 校验工具 ----------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ID = (v) => (typeof v === 'string' && UUID_RE.test(v) ? v : (() => { throw new AppError('invalid_id'); })());
const OPT_ID = (v) => (v === null || v === undefined || v === '' ? null : ID(v));
const STR = (v, max, req = true) => {
  if (v === null || v === undefined) v = '';
  if (typeof v !== 'string') throw new AppError('invalid_text');
  v = v.trim();
  if (req && !v.length) throw new AppError('missing_field');
  if (new TextEncoder().encode(v).length > max) throw new AppError('text_too_long');
  return v;
};
const OPT_STR = (v, max) => STR(v, max, false) || null;
const DATE = (v, req = true) => {
  if (v === null || v === undefined || v === '') { if (req) throw new AppError('missing_date'); return null; }
  const s = STR(v, 10);
  if (!DATE_RE.test(s)) throw new AppError('invalid_date');
  return s;
};
const ONE_OF = (v, list, req = true) => {
  const s = STR(v, 40, req);
  if (!s && !req) return null;
  if (!list.includes(s)) throw new AppError('invalid_choice');
  return s;
};
// 分数：输入 0-150 一位小数，存储为十分之一整数
const SCORE_T = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 150) throw new AppError('invalid_score');
  return Math.round(n * 10);
};
const TENTHS = (v) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1500 ? v : (() => { throw new AppError('invalid_score'); })());
const INT = (v, min, max) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError('invalid_number');
  return n;
};
const ARR = (v, max) => { if (!Array.isArray(v) || v.length > max) throw new AppError('invalid_list'); return v; };

const GENDERS = ['男', '女'];
const STUDENT_STATUS = ['在读', '休学', '转班', '毕业'];
const ATT_STATUS = ['出勤', '迟到', '早退', '请假', '缺勤'];
const DISC_TYPES = ['奖励', '惩罚'];
const ACT_CATS = ['社团', '志愿', '体育', '竞赛'];
const ROLES = ['ADMIN', 'TEACHER'];

// ---------- 查询工具 ----------
async function db(promise, code = 'db_error') {
  const { data, error } = await promise;
  if (error) throw new AppError(code, 503);
  return data;
}
async function count(supabase, table, filter) {
  let q = supabase.from(table).select('id', { count: 'exact' }).limit(1);
  if (filter) q = q.eq(filter[0], filter[1]);
  const { error, count: c } = await q;
  if (error || !Number.isSafeInteger(c)) throw new AppError('count_unavailable', 503);
  return c;
}
const nowIso = () => new Date().toISOString();

async function loadMap(supabase, table, key = 'id') {
  const rows = await db(supabase.from(table).select('*'));
  const map = new Map();
  for (const r of rows) map.set(r[key], r);
  return map;
}

// ---------- 身份与角色 ----------
async function principal(supabase, request) {
  const user = requireUser(request);
  let row = await db(supabase.from('school_users').select('id,user_id,name,role')
    .eq('user_id', user.user_id).limit(1).maybeSingle());
  if (!row) {
    const existing = await db(supabase.from('school_users').select('id').limit(1));
    const role = existing && existing.length ? 'TEACHER' : 'ADMIN'; // 首个用户为管理员
    row = await db(supabase.from('school_users').insert({
      id: crypto.randomUUID(), user_id: user.user_id, name: user.name || user.user_id,
      role, created_at: nowIso(),
    }).select('id,user_id,name,role').single());
  }
  return { qoder: user, record: row };
}
const requireAdmin = (p) => { if (p.record.role !== 'ADMIN') throw new AppError('forbidden', 403); };

// ---------- GET 动作 ----------
async function actWhoami(supabase, request) {
  const p = await principal(supabase, request);
  return ok({ user: { userId: p.record.user_id, name: p.record.name, role: p.record.role } });
}

async function actDashboard(supabase, request) {
  await principal(supabase, request);
  const [students, classes, teachers, exams] = await Promise.all([
    count(supabase, 'students'), count(supabase, 'classes'),
    count(supabase, 'school_users'), count(supabase, 'exams'),
  ]);
  let lastExam = null, subjectAvgs = [], scoreRows = [];
  const examList = await db(supabase.from('exams').select('id,name,exam_date').order('exam_date', { ascending: false }));
  for (const e of examList) {
    const rows = await db(supabase.from('scores').select('subject_id,score').eq('exam_id', e.id));
    if (rows.length) { lastExam = e; scoreRows = rows; break; }
  }
  if (lastExam) {
    const subjects = await db(supabase.from('subjects').select('id,name').order('sort'));
    const agg = new Map();
    for (const r of scoreRows) {
      const a = agg.get(r.subject_id) || { sum: 0, n: 0 };
      a.sum += r.score; a.n += 1; agg.set(r.subject_id, a);
    }
    subjectAvgs = subjects.filter(s => agg.has(s.id))
      .map(s => ({ name: s.name, avg: +(agg.get(s.id).sum / agg.get(s.id).n / 10).toFixed(1) }));
  }
  const att = await db(supabase.from('attendance').select('status'));
  const attMap = new Map();
  for (const a of att) attMap.set(a.status, (attMap.get(a.status) || 0) + 1);
  const attStats = ATT_STATUS.filter(s => attMap.has(s)).map(name => ({ name, value: attMap.get(name) }));
  const [disc, act, studentRows] = await Promise.all([
    db(supabase.from('disciplines').select('*').order('event_date', { ascending: false }).limit(5)),
    db(supabase.from('activities').select('*').order('event_date', { ascending: false }).limit(5)),
    db(supabase.from('students').select('id,name')),
  ]);
  const nameOf = new Map(studentRows.map(s => [s.id, s.name]));
  return ok({
    counts: { students, classes, teachers, exams },
    lastExam, subjectAvgs, attStats,
    recentDiscipline: disc.map(d => ({ ...d, studentName: nameOf.get(d.student_id) || '' })),
    recentActivity: act.map(a => ({ ...a, studentName: nameOf.get(a.student_id) || '' })),
  });
}

async function actClassesList(supabase, request) {
  await principal(supabase, request);
  const [classes, students, users] = await Promise.all([
    db(supabase.from('classes').select('*').order('grade').order('name')),
    db(supabase.from('students').select('id,class_id')),
    db(supabase.from('school_users').select('user_id,name')),
  ]);
  const cnt = new Map();
  for (const s of students) cnt.set(s.class_id, (cnt.get(s.class_id) || 0) + 1);
  const nameOf = new Map(users.map(u => [u.user_id, u.name]));
  return ok({ classes: classes.map(c => ({
    ...c, studentCount: cnt.get(c.id) || 0, headTeacherName: c.head_user_id ? (nameOf.get(c.head_user_id) || '') : '',
  }) ) });
}

async function actStudentsList(supabase, request, params) {
  await principal(supabase, request);
  const kw = params.get('kw') || '';
  const classId = params.get('classId') || '';
  const status = params.get('status') || '';
  let rows = await db(supabase.from('students').select('*').order('student_no'));
  if (classId) { ID(classId); rows = rows.filter(r => r.class_id === classId); }
  if (status) { ONE_OF(status, STUDENT_STATUS); rows = rows.filter(r => r.status === status); }
  if (kw) rows = rows.filter(r => r.name.includes(kw) || r.student_no.includes(kw));
  const classes = await db(supabase.from('classes').select('id,name'));
  const cn = new Map(classes.map(c => [c.id, c.name]));
  return ok({ students: rows.map(r => ({ ...r, className: cn.get(r.class_id) || '' })) });
}

async function actStudentsGet(supabase, request, params) {
  await principal(supabase, request);
  const id = ID(params.get('id'));
  const student = await db(supabase.from('students').select('*').eq('id', id).maybeSingle());
  if (!student) return fail('not_found', 404);
  const [scores, att, disc, act, reviews, classes] = await Promise.all([
    db(supabase.from('scores').select('*').eq('student_id', id).order('created_at')),
    db(supabase.from('attendance').select('*').eq('student_id', id).order('att_date', { ascending: false })),
    db(supabase.from('disciplines').select('*').eq('student_id', id).order('event_date', { ascending: false })),
    db(supabase.from('activities').select('*').eq('student_id', id).order('event_date', { ascending: false })),
    db(supabase.from('reviews').select('*').eq('student_id', id).order('created_at', { ascending: false })),
    db(supabase.from('classes').select('id,name')),
  ]);
  return ok({
    student: { ...student, className: (classes.find(c => c.id === student.class_id) || {}).name || '' },
    scores, attendances: att, disciplines: disc, activities: act, reviews,
  });
}

async function actRefData(supabase, request) {
  await principal(supabase, request);
  const [subjects, exams] = await Promise.all([
    db(supabase.from('subjects').select('*').order('sort')),
    db(supabase.from('exams').select('*').order('exam_date', { ascending: false })),
  ]);
  return ok({ subjects, exams });
}

async function actScoreSheet(supabase, request, params) {
  await principal(supabase, request);
  const examId = ID(params.get('examId'));
  const classId = params.get('classId') ? ID(params.get('classId')) : null;
  const [subjects, students, scores, classes] = await Promise.all([
    db(supabase.from('subjects').select('id,name').order('sort')),
    db(supabase.from('students').select('*').order('student_no')),
    db(supabase.from('scores').select('*').eq('exam_id', examId)),
    db(supabase.from('classes').select('id,name')),
  ]);
  const scoreKey = new Map(scores.map(s => [`${s.student_id}|${s.subject_id}`, s.score]));
  const present = subjects.filter(sub => scores.some(s => s.subject_id === sub.id));
  const cn = new Map(classes.map(c => [c.id, c.name]));
  const rows = [];
  for (const st of students) {
    if (classId && st.class_id !== classId) continue;
    if (!present.some(sub => scoreKey.has(`${st.id}|${sub.id}`))) continue;
    const cells = {};
    let total = 0; let n = 0;
    for (const sub of present) {
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

async function actAttendanceList(supabase, request, params) {
  await principal(supabase, request);
  const date = params.get('date') ? DATE(params.get('date')) : null;
  const classId = params.get('classId') ? ID(params.get('classId')) : null;
  const [att, students, classes] = await Promise.all([
    db(supabase.from('attendance').select('*').order('att_date', { ascending: false })),
    db(supabase.from('students').select('id,name,student_no,class_id')),
    db(supabase.from('classes').select('id,name')),
  ]);
  const sm = new Map(students.map(s => [s.id, s]));
  const cn = new Map(classes.map(c => [c.id, c.name]));
  let rows = att;
  if (date) rows = rows.filter(r => r.att_date === date);
  if (classId) rows = rows.filter(r => (sm.get(r.student_id) || {}).class_id === classId);
  rows.sort((a, b) => b.att_date.localeCompare(a.att_date) || (sm.get(a.student_id) || {}).student_no?.localeCompare((sm.get(b.student_id) || {}).student_no || ''));
  return ok({ records: rows.map(r => {
    const s = sm.get(r.student_id) || {};
    return { ...r, studentName: s.name || '', className: cn.get(s.class_id) || '' };
  }) });
}

async function actQualityList(supabase, request, params) {
  await principal(supabase, request);
  const classId = params.get('classId') ? ID(params.get('classId')) : null;
  const [disc, act, reviews, students, classes] = await Promise.all([
    db(supabase.from('disciplines').select('*').order('event_date', { ascending: false })),
    db(supabase.from('activities').select('*').order('event_date', { ascending: false })),
    db(supabase.from('reviews').select('*').order('created_at', { ascending: false })),
    db(supabase.from('students').select('id,name,class_id')),
    db(supabase.from('classes').select('id,name')),
  ]);
  const sm = new Map(students.map(s => [s.id, s]));
  const cn = new Map(classes.map(c => [c.id, c.name]));
  const keep = (r) => !classId || sm.get(r.student_id)?.class_id === classId;
  const withNames = (r) => ({ ...r, studentName: (sm.get(r.student_id) || {}).name || '', className: cn.get(sm.get(r.student_id)?.class_id) || '' });
  return ok({
    disciplines: disc.filter(keep).map(withNames),
    activities: act.filter(keep).map(withNames),
    reviews: reviews.filter(keep).map(withNames),
  });
}

async function actUsersList(supabase, request) {
  const p = await principal(supabase, request);
  requireAdmin(p);
  const users = await db(supabase.from('school_users').select('id,user_id,name,role,created_at').order('created_at'));
  return ok({ users });
}

// ---------- POST 动作 ----------
async function readBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new AppError('invalid_body');
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 200000) throw new AppError('body_too_large');
  try { const b = await request.json(); if (!b || typeof b !== 'object' || Array.isArray(b)) throw new AppError('invalid_body'); return b; }
  catch (e) { if (e instanceof AppError) throw e; throw new AppError('invalid_body'); }
}

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
  await principal(supabase, request); // 教师可录入
  const b = await readBody(request);
  const examId = ID(b.examId); const subjectId = ID(b.subjectId);
  const entries = ARR(b.entries, 100).map(e => ({ studentId: ID(e.studentId), tenths: e.score === null || e.score === undefined || e.score === '' ? null : TENTHS(SCORE_T(e.score)) }));
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

async function actAttendanceSave(supabase, request) {
  await principal(supabase, request);
  const b = await readBody(request);
  const date = DATE(b.date);
  const entries = ARR(b.entries, 100).map(e => ({
    studentId: ID(e.studentId),
    status: e.status ? ONE_OF(e.status, ATT_STATUS) : null,
    remark: OPT_STR(e.remark, 200),
  }));
  for (const e of entries) {
    const old = await db(supabase.from('attendance').select('id')
      .eq('student_id', e.studentId).eq('att_date', date).limit(1));
    if (!e.status) {
      if (old && old.length) await db(supabase.from('attendance').delete().eq('id', old[0].id));
      continue;
    }
    if (old && old.length) await db(supabase.from('attendance').update({ status: e.status, remark: e.remark }).eq('id', old[0].id));
    else await db(supabase.from('attendance').insert({
      id: crypto.randomUUID(), student_id: e.studentId, att_date: date,
      status: e.status, remark: e.remark, created_at: nowIso(),
    }));
  }
  return ok({ saved: entries.length });
}

async function actDisciplineSave(supabase, request) {
  await principal(supabase, request);
  const b = await readBody(request);
  await db(supabase.from('disciplines').insert({
    id: crypto.randomUUID(), student_id: ID(b.studentId), type: ONE_OF(b.type, DISC_TYPES),
    content: STR(b.content, 200), event_date: DATE(b.eventDate), created_at: nowIso(),
  }));
  return ok();
}

async function actActivitySave(supabase, request) {
  await principal(supabase, request);
  const b = await readBody(request);
  await db(supabase.from('activities').insert({
    id: crypto.randomUUID(), student_id: ID(b.studentId), name: STR(b.name, 100),
    category: ONE_OF(b.category, ACT_CATS), event_date: DATE(b.eventDate), created_at: nowIso(),
  }));
  return ok();
}

async function actReviewSave(supabase, request) {
  const p = await principal(supabase, request);
  const b = await readBody(request);
  await db(supabase.from('reviews').insert({
    id: crypto.randomUUID(), student_id: ID(b.studentId), user_id: p.record.user_id,
    teacher_name: p.record.name, term: STR(b.term, 30), content: STR(b.content, 500),
    created_at: nowIso(),
  }));
  return ok();
}

async function actSimpleDelete(supabase, request, table) {
  await principal(supabase, request);
  const b = await readBody(request);
  await db(supabase.from(table).delete().eq('id', ID(b.id)));
  return ok();
}

async function actUserRole(supabase, request) {
  const p = await principal(supabase, request); requireAdmin(p);
  const b = await readBody(request);
  await db(supabase.from('school_users').update({ role: ONE_OF(b.role, ROLES) }).eq('user_id', STR(b.userId, 128)));
  return ok();
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

// ---------- 路由 ----------
const GETS = new Set(['whoami', 'dashboard', 'classes.list', 'students.list', 'students.get',
  'refdata', 'scores.sheet', 'attendance.list', 'quality.list', 'users.list']);
const POSTS = new Map([
  ['classes.save', actClassesSave], ['classes.delete', actClassesDelete],
  ['students.save', actStudentsSave], ['students.delete', actStudentsDelete],
  ['exams.save', actExamsSave], ['scores.save', actScoresSave], ['attendance.save', actAttendanceSave],
  ['discipline.save', actDisciplineSave], ['discipline.delete', (s, r) => actSimpleDelete(s, r, 'disciplines')],
  ['activity.save', actActivitySave], ['activity.delete', (s, r) => actSimpleDelete(s, r, 'activities')],
  ['review.save', actReviewSave], ['review.delete', (s, r) => actSimpleDelete(s, r, 'reviews')],
  ['users.role', actUserRole], ['demo.seed', actDemoSeed],
]);

export async function handleApp({ request, supabase }) {
  const params = new URL(request.url).searchParams;
  const action = params.get('action') || '';
  try {
    if (request.method === 'GET') {
      if (!GETS.has(action)) return fail('not_found', 404);
      switch (action) {
        case 'whoami': return await actWhoami(supabase, request);
        case 'dashboard': return await actDashboard(supabase, request);
        case 'classes.list': return await actClassesList(supabase, request);
        case 'students.list': return await actStudentsList(supabase, request, params);
        case 'students.get': return await actStudentsGet(supabase, request, params);
        case 'refdata': return await actRefData(supabase, request);
        case 'scores.sheet': return await actScoreSheet(supabase, request, params);
        case 'attendance.list': return await actAttendanceList(supabase, request, params);
        case 'quality.list': return await actQualityList(supabase, request, params);
        case 'users.list': return await actUsersList(supabase, request);
      }
    }
    if (request.method === 'POST') {
      const fn = POSTS.get(action);
      if (!fn) return fail('not_found', 404);
      return await fn(supabase, request);
    }
    return fail('method_not_allowed', 405);
  } catch (e) {
    if (e instanceof UserContextError) return fail(e.code, e.status);
    if (e instanceof AppError) return fail(e.code, e.status);
    return fail('server_error', 503);
  }
}
