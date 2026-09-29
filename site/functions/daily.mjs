// 背诵登记与作业完成记录：两张清单表 + 两张登记表，共用一套读写逻辑。
// 清单 = 老师布置的一次任务（属某个「学科×班级」对，沿用 teaching_assignments 授权）；
// 登记 = 清单内单个学生的状态，重复登记计次（第 N 次）。
import {
  AppError, ARR, CELL, DATE, DRY, E, ID, IMPORT_MAX_ROWS, OPT_ID, OPT_STR, STR,
  db, nowIso, ok, fail, importResult, readBody,
} from './common.mjs';
import { principal, requireStaff, teachesClass, teachesPair } from './scope.mjs';

export const KINDS = {
  recitation: {
    listTable: 'recitations', recordTable: 'recitation_records', listKey: 'recitation_id',
    statuses: ['过关', '待重背', '延背', '免背'], pass: '过关',
    hasPart: true, hasAttempt: true, hasPlan: true,
  },
  homework: {
    listTable: 'homeworks', recordTable: 'homework_records', listKey: 'homework_id',
    statuses: ['已交', '未交', '补交', '优秀', '需订正'], pass: '已交',
    hasPart: false, hasAttempt: false, hasPlan: false,
  },
};

const kindOf = (raw) => {
  const kind = KINDS[raw];
  if (!kind) throw new AppError('invalid_kind');
  return { key: raw, ...kind };
};

const today = () => nowIso().slice(0, 10);

// 清单行 → 前端视图模型
export const listView = (r, className, subjectName, counts, account) => {
  const total = counts?.total ?? 0;
  return {
    id: r.id, classId: r.class_id, className: className || '',
    subjectId: r.subject_id, subjectName: subjectName || '',
    title: r.title, part: r.part || '', assignDate: r.assign_date, dueDate: r.due_date || '',
    note: r.note || '', total,
    counts: counts?.counts ?? {}, passCount: counts?.counts?.[counts.passKey] ?? 0,
    canDelete: account.role === 'ADMIN' || r.created_by === account.id,
  };
};

async function loadTask(kind, supabase, id) {
  const row = await db(supabase.from(kind.listTable).select('*').eq('id', id).maybeSingle());
  if (!row) throw new AppError('not_found', 404);
  return row;
}


/** 一次取回某类全部登记，按清单分组出各状态人数 */
function groupCounts(records, listKey) {
  const byList = new Map();
  for (const r of records) {
    const m = byList.get(r[listKey]) || {};
    m[r.status] = (m[r.status] || 0) + 1;
    byList.set(r[listKey], m);
  }
  return byList;
}

// ---------- GET：清单列表 ----------
async function actDailyList(kindRaw, supabase, request, params) {
  const p = await principal(supabase, request); requireStaff(p);
  const kind = kindOf(kindRaw);
  const classId = params.get('classId') ? ID(params.get('classId')) : null;
  const [tasks, classes, subjects, students, records] = await Promise.all([
    db(supabase.from(kind.listTable).select('*')),
    db(supabase.from('classes').select('id,name')),
    db(supabase.from('subjects').select('id,name').order('sort')),
    db(supabase.from('students').select('id,class_id,status')),
    db(supabase.from(kind.recordTable).select('status,' + kind.listKey + ',student_id')),
  ]);
  const cn = new Map(classes.map((c) => [c.id, c.name]));
  const sn = new Map(subjects.map((s) => [s.id, s.name]));
  const roster = new Map();
  for (const s of students) if (s.status === '在读') roster.set(s.class_id, (roster.get(s.class_id) || 0) + 1);
  const byList = groupCounts(records, kind.listKey);
  const mine = tasks.filter((t) => teachesPair(p.scope, t.subject_id, t.class_id) && (!classId || t.class_id === classId))
    .sort((a, b) => String(b.assign_date).localeCompare(String(a.assign_date)));
  const out = mine.map((t) => listView(t, cn.get(t.class_id), sn.get(t.subject_id),
    { counts: byList.get(t.id) || {}, total: roster.get(t.class_id) || 0, passKey: kind.pass }, p.account));
  return ok({ kind: kindRaw, lists: out });
}

// ---------- GET：名单登记 ----------
async function actDailySheet(kindRaw, supabase, request, params) {
  const p = await principal(supabase, request); requireStaff(p);
  const kind = kindOf(kindRaw);
  const task = await loadTask(kind, supabase, ID(params.get('listId')));
  if (!teachesPair(p.scope, task.subject_id, task.class_id)) return fail('out_of_scope', 403);
  const [students, records, classes, subjects, accounts] = await Promise.all([
    db(supabase.from('students').select('*').eq('class_id', task.class_id).order('student_no')),
    db(supabase.from(kind.recordTable).select('*').eq(kind.listKey, task.id)),
    db(supabase.from('classes').select('id,name')),
    db(supabase.from('subjects').select('id,name')),
    db(supabase.from('accounts').select('id,display_name')),
  ]);
  const byStudent = new Map(records.map((r) => [r.student_id, r]));
  const counts = {};
  for (const r of records) counts[r.status] = (counts[r.status] || 0) + 1;
  const rows = students.map((s) => {
    const r = byStudent.get(s.id);
    return {
      studentId: s.id, studentNo: s.student_no, name: s.name, status: s.status,
      record: r ? {
        status: r.status, attempt: r.attempt ?? 1, checkDate: r.check_date || '',
        planDate: r.plan_date || '', note: r.note || '',
        recordedByName: (accounts.find((a) => a.id === r.recorded_by) || {}).display_name || '',
      } : null,
    };
  });
  return ok({
    kind: kindRaw,
    list: listView(task, (classes.find((c) => c.id === task.class_id) || {}).name,
      (subjects.find((s) => s.id === task.subject_id) || {}).name,
      { counts, total: rows.filter((r) => r.status === '在读').length, passKey: kind.pass },
      p.account),
    rows,
    statuses: kind.statuses, pass: kind.pass,
    hasPart: kind.hasPart, hasAttempt: kind.hasAttempt, hasPlan: kind.hasPlan,
  });
}

// ---------- GET：周总览（行=学生，列=最近若干清单） ----------
async function actDailyGrid(kindRaw, supabase, request, params) {
  const p = await principal(supabase, request); requireStaff(p);
  const kind = kindOf(kindRaw);
  const classId = ID(params.get('classId'));
  if (!teachesClass(p.scope, classId)) return fail('forbidden', 403);
  const days = Math.min(Math.max(Number(params.get('days') || 7) || 7, 1), 14);
  const [tasks, students, classes] = await Promise.all([
    db(supabase.from(kind.listTable).select('*').eq('class_id', classId)),
    db(supabase.from('students').select('id,name,student_no,class_id,status').eq('class_id', classId).order('student_no')),
    db(supabase.from('classes').select('id,name')),
  ]);
  const mine = tasks.filter((t) => teachesPair(p.scope, t.subject_id, classId))
    .sort((a, b) => String(b.assign_date).localeCompare(String(a.assign_date)))
    .slice(0, days);
  const ids = mine.map((t) => t.id);
  const rows = students.filter((s) => s.status === '在读');
  const checks = ids.length ? await db(supabase.from(kind.recordTable).select('*').in(kind.listKey, ids)) : [];
  const cell = new Map(checks.map((r) => [`${r[kind.listKey]}|${r.student_id}`, r.status]));
  return ok({
    kind: kindRaw,
    className: (classes.find((c) => c.id === classId) || {}).name || '',
    lists: mine.map((t) => ({ id: t.id, title: t.title, part: t.part || '', assignDate: t.assign_date })),
    rows: rows.map((s) => ({
      studentId: s.id, studentNo: s.student_no, name: s.name,
      cells: Object.fromEntries(mine.map((t) => [t.id, cell.get(`${t.id}|${s.id}`) ?? null])),
    })),
    statuses: kind.statuses, pass: kind.pass,
  });
}



// ---------- POST：新建 / 修改 / 删除清单 ----------
async function actDailySave(kindRaw, supabase, request) {
  const p = await principal(supabase, request); requireStaff(p);
  const kind = kindOf(kindRaw);
  const b = await readBody(request);
  const id = OPT_ID(b.id);

  if (id && b.delete === true) {
    const task = await loadTask(kind, supabase, id);
    if (!(p.account.role === 'ADMIN' || task.created_by === p.account.id)) return fail('forbidden', 403);
    await db(supabase.from(kind.recordTable).delete().eq(kind.listKey, id));
    await db(supabase.from(kind.listTable).delete().eq('id', id));
    return ok();
  }

  const subjectId = ID(b.subjectId);
  const fields = {
    title: STR(b.title, 100),
    assign_date: DATE(b.assignDate || today()),
    due_date: DATE(b.dueDate, false),
    note: OPT_STR(b.note, 200),
  };
  // part 只属于背诵表，作业表没有这一列
  if (kind.hasPart) fields.part = OPT_STR(b.part, 60);

  if (id) {
    const task = await loadTask(kind, supabase, id);
    if (!teachesPair(p.scope, task.subject_id, task.class_id)) return fail('out_of_scope', 403);
    if (!(p.account.role === 'ADMIN' || task.created_by === p.account.id)) return fail('forbidden', 403);
    await db(supabase.from(kind.listTable).update(fields).eq('id', id));
    return ok({ id });
  }

  const classIds = [...new Set(ARR(b.classIds, 30).map((c) => ID(c)))];
  if (!classIds.length) throw new AppError('missing_field');
  for (const cid of classIds) if (!teachesPair(p.scope, subjectId, cid)) return fail('out_of_scope', 403);
  const created = [];
  for (const cid of classIds) {
    const newId = crypto.randomUUID();
    await db(supabase.from(kind.listTable).insert({
      ...fields, id: newId, class_id: cid, subject_id: subjectId,
      created_by: p.account.id, created_at: nowIso(),
    }));
    created.push(newId);
  }
  return ok({ ids: created });
}

// ---------- POST：登记状态 ----------
// entries: [{ studentId, status, checkDate?, planDate?, note? }]；status 为空表示撤销登记。
// 重复登记时状态变化自动计一次（第 N 次背诵 / 第 N 次批改）。
async function actDailyCheck(kindRaw, supabase, request) {
  const p = await principal(supabase, request); requireStaff(p);
  const kind = kindOf(kindRaw);
  const b = await readBody(request);
  const task = await loadTask(kind, supabase, ID(b.listId));
  if (!teachesPair(p.scope, task.subject_id, task.class_id)) return fail('out_of_scope', 403);
  const entries = ARR(b.entries, 200);
  const students = await db(supabase.from('students').select('id,class_id').in('id', entries.map((e) => ID(e.studentId))));
  const inClass = new Map(students.map((s) => [s.id, s.class_id]));
  for (const e of entries) {
    if (inClass.get(ID(e.studentId)) !== task.class_id) return fail('out_of_class', 403);
  }
  let saved = 0;
  for (const e of entries) {
    const studentId = ID(e.studentId);
    const status = OPT_STR(e.status, 40);
    if (status && !kind.statuses.includes(status)) throw new AppError('invalid_choice');
    const old = await db(supabase.from(kind.recordTable).select('*')
      .eq(kind.listKey, task.id).eq('student_id', studentId).limit(1));
    const prev = old?.[0] ?? null;
    if (!status) {
      if (prev) await db(supabase.from(kind.recordTable).delete().eq('id', prev.id));
      saved += 1;
      continue;
    }
    const row = {
      status,
      check_date: DATE(e.checkDate || today()),
      note: OPT_STR(e.note, 200),
      recorded_by: p.account.id,
      updated_at: nowIso(),
    };
    if (kind.hasPlan) row.plan_date = DATE(e.planDate, false);
    if (kind.hasAttempt) {
      row.attempt = !prev ? 1 : (prev.status === status ? (prev.attempt ?? 1) : (prev.attempt ?? 1) + 1);
    }
    if (prev) await db(supabase.from(kind.recordTable).update(row).eq('id', prev.id));
    else await db(supabase.from(kind.recordTable).insert({
      ...row, id: crypto.randomUUID(), [kind.listKey]: task.id, student_id: studentId, created_at: nowIso(),
    }));
    saved += 1;
  }
  return ok({ saved });
}

// ---------- POST：批量导入登记表 ----------
// 一行 = 一个学生的一次登记：{ studentNo, status, checkDate?, planDate?, note? }
async function actDailyImport(kindRaw, supabase, request) {
  const p = await principal(supabase, request); requireStaff(p);
  const kind = kindOf(kindRaw);
  const b = await readBody(request);
  const dryRun = DRY(b);
  const task = await loadTask(kind, supabase, ID(b.listId));
  if (!teachesPair(p.scope, task.subject_id, task.class_id)) return fail('out_of_scope', 403);
  const raw = ARR(b.rows, IMPORT_MAX_ROWS);
  if (!raw.length) throw new AppError('missing_field');
  const [students, existing] = await Promise.all([
    db(supabase.from('students').select('id,student_no,name,class_id').eq('class_id', task.class_id).order('student_no')),
    db(supabase.from(kind.recordTable).select('id,student_id').eq(kind.listKey, task.id)),
  ]);
  const byNo = new Map(students.map((s) => [s.student_no, s]));
  const hits = new Map(existing.map((r) => [r.student_id, r.id]));
  const items = [];
  for (const [i, r] of raw.entries()) {
    const no = CELL(r.studentNo), status = CELL(r.status);
    const checkDate = CELL(r.checkDate), planDate = CELL(r.planDate), note = CELL(r.note);
    const errors = [];
    const st = byNo.get(no);
    if (!no) errors.push(E('studentNo', 'missing_field'));
    else if (!st) errors.push(E('studentNo', 'student_not_found'));
    if (!status) errors.push(E('status', 'missing_field'));
    else if (!kind.statuses.includes(status)) errors.push(E('status', 'invalid_choice'));
    if (checkDate && !/^\d{4}-\d{2}-\d{2}$/.test(checkDate)) errors.push(E('checkDate', 'invalid_date'));
    if (planDate && !/^\d{4}-\d{2}-\d{2}$/.test(planDate)) errors.push(E('planDate', 'invalid_date'));
    if (note.length > 200) errors.push(E('note', 'text_too_long'));
    const action = errors.length ? 'invalid' : hits.has(st.id) ? 'update' : 'create';
    if (!errors.length && !dryRun) {
      const row = {
        status, check_date: checkDate || today(), note: note || null,
        recorded_by: p.account.id, updated_at: nowIso(),
      };
      if (kind.hasPlan) row.plan_date = planDate || null;
      if (kind.hasAttempt) row.attempt = 1;
      const hit = hits.get(st.id);
      if (hit) await db(supabase.from(kind.recordTable).update(row).eq('id', hit));
      else await db(supabase.from(kind.recordTable).insert({
        ...row, id: crypto.randomUUID(), [kind.listKey]: task.id, student_id: st.id, created_at: nowIso(),
      }));
    }
    items.push({ line: i + 1, label: `${no || '—'} ${st?.name ?? ''} · ${status || '—'}`, ok: !errors.length, action, errors });
  }
  return importResult(dryRun, items, { listId: task.id, title: task.title });
}

// ---------- 学生端：本人的背诵与作业 ----------
export async function portalDaily(supabase, studentId, classId) {
  const subjects = await db(supabase.from('subjects').select('id,name'));
  const sn = new Map(subjects.map((s) => [s.id, s.name]));
  const out = {};
  for (const [key, kind] of Object.entries(KINDS)) {
    const [tasks, records] = await Promise.all([
      db(supabase.from(kind.listTable).select('*').eq('class_id', classId)),
      db(supabase.from(kind.recordTable).select('*').eq('student_id', studentId)),
    ]);
    const byTask = new Map(tasks.map((t) => [t.id, t]));
    out[key] = records
      .filter((r) => byTask.has(r[kind.listKey]))
      .map((r) => {
        const t = byTask.get(r[kind.listKey]);
        return {
          title: t.title, part: t.part || '', status: r.status, attempt: r.attempt ?? 1,
          assignDate: t.assign_date, dueDate: t.due_date || '', checkDate: r.check_date || '',
          planDate: r.plan_date || '', note: r.note || '', subjectName: sn.get(t.subject_id) || '',
        };
      })
      .sort((a, b) => String(b.assignDate).localeCompare(String(a.assignDate)))
      .slice(0, 30);
  }
  return { recitations: out.recitation, homeworks: out.homework };
}

// handler.mjs 的路由是 Map，这里给出 [action, fn] 数组以便直接展开进条目列表。
export const dailyRoutes = {
  GETS: [
    ['recitation.list', (s, r, p) => actDailyList('recitation', s, r, p)],
    ['recitation.sheet', (s, r, p) => actDailySheet('recitation', s, r, p)],
    ['recitation.grid', (s, r, p) => actDailyGrid('recitation', s, r, p)],
    ['homework.list', (s, r, p) => actDailyList('homework', s, r, p)],
    ['homework.sheet', (s, r, p) => actDailySheet('homework', s, r, p)],
    ['homework.grid', (s, r, p) => actDailyGrid('homework', s, r, p)],
  ],
  POSTS: [
    ['recitation.save', (s, r) => actDailySave('recitation', s, r)],
    ['recitation.check', (s, r) => actDailyCheck('recitation', s, r)],
    ['recitation.import', (s, r) => actDailyImport('recitation', s, r)],
    ['homework.save', (s, r) => actDailySave('homework', s, r)],
    ['homework.check', (s, r) => actDailyCheck('homework', s, r)],
    ['homework.import', (s, r) => actDailyImport('homework', s, r)],
  ],
};
