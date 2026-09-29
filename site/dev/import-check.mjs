// 阶段④回归：import.students / import.scores 的逐行校验与落库，顺带确认阶段②下线的 action 已 404。
// 跑法（本机内存 fixture，进程退出即清空）：
//   node dev/server.mjs 8775 &
//   node dev/import-check.mjs http://127.0.0.1:8775
const BASE = process.argv[2] || 'http://127.0.0.1:8775';
// 仅本机内存 fixture 使用的临时口令，不会写入任何持久化文件；三个 dev/*-check.mjs 共用同一管理员
const ADMIN_USER = 'dev_admin';
const ADMIN_PW = process.env.DEV_ADMIN_PW || 'Dev2026Check1';
const TEACHER_PW = 'Imp2026Teach1';
const TEACHER_PW2 = 'Imp2026Teach2';

let pass = 0;
const fails = [];
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name} ${extra}`); }
};
const step = async (name, fn) => {
  try { await fn(); } catch (e) { fails.push(name); console.log(`  FAIL ${name} -> ${e.message}`); }
};

async function call(action, params, body, token) {
  const qs = new URLSearchParams({ action });
  for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v);
  const headers = { accept: 'application/json' };
  if (token) headers['X-App-Token'] = token;
  const init = body === undefined
    ? { headers }
    : { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(`${BASE}/functions/v1/app?${qs}`, init);
  return { status: r.status, json: await r.json().catch(() => null) };
}
const api = async (action, params, body, token) => {
  const j = (await call(action, params, body, token)).json;
  if (!j?.ok) throw new Error(`${action} 失败：${JSON.stringify(j)}`);
  return j;
};
const errOf = (r) => r.json?.error ?? r.json?.code;
const rowsByLine = (j) => new Map(j.items.map((x) => [x.line, x]));

console.log(`fixture: ${BASE}`);
let admin = '';
let classes = [];
let ref = null;

await step('准备管理员与演示数据', async () => {
  let r = await call('auth.login', null, { username: ADMIN_USER, password: ADMIN_PW });
  if (!r.json?.token) {
    await api('auth.bootstrap', null, { username: ADMIN_USER, password: ADMIN_PW, displayName: '导入测试管理员' });
    r = await call('auth.login', null, { username: ADMIN_USER, password: ADMIN_PW });
  }
  if (!r.json?.token) throw new Error(`拿不到 ${ADMIN_USER} 的会话：${JSON.stringify(r.json)}`);
  admin = r.json.token;
  const st = await api('students.list', null, undefined, admin);
  if (!st.students.length) await api('demo.seed', null, {}, admin);
  classes = (await api('classes.list', null, undefined, admin)).classes;
  ref = await api('refdata', null, undefined, admin);
  console.log(`  ok   ${classes.length} 个班级 / ${ref.subjects.length} 门科目 / ${st.students.length || 15} 名学生`);
});

const cls = (n) => classes.find((c) => c.name === n);
const subj = (n) => ref.subjects.find((s) => s.name === n);
const studentsOf = async () => (await api('students.list', null, undefined, admin)).students;
const C1 = cls('高一(1)班');

// ---------- 名单导入 ----------
const roster = (rows, extra) => api('import.students', null, { rows, dryRun: true, ...extra }, admin);

await step('import.students 校验预览', async () => {
  const before = (await studentsOf()).length;
  const r = await roster([
    { studentNo: 'T9001', name: '测试甲', gender: '男', className: C1.name, enrollYear: '2024', birthDate: '2008-01-02' },
    { studentNo: 'T9002', name: '', gender: '女', className: C1.name },
    { studentNo: 'T9003', name: '测试丙', gender: '未知', className: C1.name },
    { studentNo: 'T9004', name: '测试丁', gender: '女', className: '高一(9)班' },
    { studentNo: 'T9005', name: '测试戊', gender: '女', className: C1.name, birthDate: '2008/01/02' },
    { studentNo: 'T9001', name: '测试甲重复', gender: '男', className: C1.name },
    { studentNo: (await studentsOf())[0].student_no, name: '已存在', gender: '男', className: C1.name },
  ]);
  const by = rowsByLine(r);
  check('dryRun 汇总计数', r.dryRun === true && r.total === 7 && r.created === 1 && r.invalid === 5 && r.skipped === 1,
    `created=${r.created} invalid=${r.invalid} skipped=${r.skipped}`);
  check('缺姓名被标记', by.get(2)?.action === 'invalid' && by.get(2).errors.some((e) => e.field === 'name' && e.code === 'missing_field'));
  check('性别非法被标记', by.get(3)?.errors.some((e) => e.field === 'gender' && e.code === 'invalid_choice'));
  check('班级不存在被标记', by.get(4)?.errors.some((e) => e.field === 'className' && e.code === 'class_not_found'));
  check('日期格式被标记', by.get(5)?.errors.some((e) => e.field === 'birthDate' && e.code === 'invalid_date'));
  check('文件内重复学号被标记', by.get(6)?.errors.some((e) => e.field === 'studentNo' && e.code === 'duplicate_row'));
  check('已存在学号默认跳过', by.get(7)?.action === 'skip');
  check('预览不落库', (await studentsOf()).length === before);
});

await step('import.students 落库与覆盖', async () => {
  const row = { studentNo: 'T9001', name: '测试甲', gender: '男', className: C1.name, enrollYear: '2024', birthDate: '2008-01-02', status: '在读' };
  const r = await api('import.students', null, { rows: [row], dryRun: false }, admin);
  check('确认导入写入 1 条', r.dryRun === false && r.created === 1, JSON.stringify({ c: r.created, i: r.invalid }));
  const list = await studentsOf();
  const saved = list.find((s) => s.student_no === 'T9001');
  check('落库字段正确', saved?.name === '测试甲' && saved?.class_id === C1.id && saved?.enroll_year === 2024 && saved?.birth_date === '2008-01-02',
    JSON.stringify(saved && { n: saved.name, c: saved.class_id, y: saved.enroll_year, b: saved.birth_date }));
  const preview = await roster([{ ...row, name: '测试甲改', phone: '13800000000' }], { updateExisting: true });
  check('勾选覆盖后变为 update', rowsByLine(preview).get(1)?.action === 'update');
  const upd = await api('import.students', null, { rows: [{ ...row, name: '测试甲改', phone: '13800000000' }], dryRun: false, updateExisting: true }, admin);
  check('覆盖写入 1 条', upd.updated === 1 && upd.created === 0);
  const after = (await studentsOf()).find((s) => s.student_no === 'T9001');
  check('覆盖只改提交过的列', after?.name === '测试甲改' && after?.phone === '13800000000' && after?.birth_date === '2008-01-02');
  check('名单未重复', (await studentsOf()).filter((s) => s.student_no === 'T9001').length === 1);
});

await step('import.students 入参限制', async () => {
  const tooMany = await call('import.students', null, { rows: Array.from({ length: 501 }, (_, i) => ({ studentNo: `X${i}` })) }, admin);
  check('超过 500 行被拒', errOf(tooMany) === 'invalid_list', JSON.stringify(tooMany.json));
  const empty = await call('import.students', null, { rows: [] }, admin);
  check('空列表被拒', errOf(empty) === 'missing_field', JSON.stringify(empty.json));
  const anon = await call('import.students', null, { rows: [] });
  check('未登录被拒', errOf(anon) === 'login_required');
});

// ---------- 成绩导入 ----------
const sheetOf = async (examId, classId) => api('scores.sheet', { examId, classId }, undefined, admin);

await step('import.scores 校验预览', async () => {
  const exam = ref.exams[0];
  const stu = (await studentsOf()).find((s) => s.class_id === C1.id);
  const yuwen = subj('语文');
  const before = await sheetOf(exam.id, C1.id);
  const had = before.rows.find((r) => r.studentId === stu.id)?.cells[yuwen.id] != null;
  const r = await api('import.scores', null, {
    examId: exam.id, dryRun: true,
    rows: [
      { studentNo: stu.student_no, subjectName: '语文', score: '112.5' },
      { studentNo: 'T0000', subjectName: '语文', score: '99' },
      { studentNo: stu.student_no, subjectName: '体育', score: '99' },
      { studentNo: stu.student_no, subjectName: '语文', score: '200' },
      { studentNo: stu.student_no, subjectName: '语文', score: '' },
    ],
  }, admin);
  const by = rowsByLine(r);
  check('汇总计数正确', r.total === 5 && r.invalid === 3 && r.skipped === 1 && r.created + r.updated === 1,
    `invalid=${r.invalid} skip=${r.skipped} write=${r.created + r.updated}`);
  check('落库动作按现状判定', by.get(1)?.action === (had ? 'update' : 'create'));
  check('学号不存在被标记', by.get(2)?.errors.some((e) => e.code === 'student_not_found'));
  check('科目不存在被标记', by.get(3)?.errors.some((e) => e.code === 'subject_not_found'));
  check('越界分数被标记', by.get(4)?.errors.some((e) => e.field === 'score' && e.code === 'invalid_score'));
  check('留空分数视为不改动', by.get(5)?.action === 'skip');
  const again = await sheetOf(exam.id, C1.id);
  check('预览不落库', JSON.stringify(again.rows) === JSON.stringify(before.rows));
  const badExam = await call('import.scores', null, { examId: '00000000-0000-4000-8000-000000000000', rows: [{ studentNo: 'T9001', subjectName: '语文', score: '1' }] }, admin);
  check('考试不存在返回 404', errOf(badExam) === 'not_found');
});

await step('import.scores 落库', async () => {
  const exam = ref.exams[1];
  const stu = (await studentsOf()).find((s) => s.class_id === C1.id);
  const r = await api('import.scores', null, {
    examId: exam.id, dryRun: false,
    rows: [
      { studentNo: stu.student_no, subjectName: '语文', score: '112.5' },
      { studentNo: stu.student_no, subjectName: '数学', score: 98 },
      { studentNo: 'T0000', subjectName: '语文', score: '99' },
    ],
  }, admin);
  check('写入 2 条并跳过无效行', r.created + r.updated === 2 && r.invalid === 1, JSON.stringify({ c: r.created, u: r.updated, i: r.invalid }));
  const row = (await sheetOf(exam.id, C1.id)).rows.find((x) => x.studentId === stu.id);
  check('分数以十分之一分落库', row?.cells[subj('语文').id] === 1125 && row?.cells[subj('数学').id] === 980,
    JSON.stringify(row?.cells));
  const twice = await api('import.scores', null, { examId: exam.id, dryRun: true, rows: [{ studentNo: stu.student_no, subjectName: '语文', score: '113' }] }, admin);
  check('重复导入判为覆盖', rowsByLine(twice).get(1)?.action === 'update');
});

// ---------- 教师范围 ----------
let teacherToken = '';
await step('教师导入受任教范围约束', async () => {
  const stale = (await api('accounts.list', null, undefined, admin)).accounts.find((a) => a.username === 'imp_teacher');
  if (stale) await api('accounts.delete', null, { id: stale.id }, admin);
  const created = await api('accounts.save', null, {
    username: 'imp_teacher', displayName: '导入老师', role: 'TEACHER', password: TEACHER_PW,
    assignments: [{ subjectId: subj('语文').id, classId: C1.id }],
  }, admin);
  let login = await call('auth.login', null, { username: 'imp_teacher', password: TEACHER_PW });
  const firstTok = login.json?.token;
  if (!firstTok) throw new Error(`教师登录失败：${JSON.stringify(login.json)}`);
  // 初始口令未改前，业务 action 一律 403；改密后重新登录
  await api('auth.change-password', null, { currentPassword: TEACHER_PW, newPassword: TEACHER_PW2 }, firstTok);
  teacherToken = (await api('auth.login', null, { username: 'imp_teacher', password: TEACHER_PW2 })).token;
  check('初始口令改密后可用', !!teacherToken);
  const exam = ref.exams[0];
  const inClass = (await api('students.list', null, undefined, teacherToken)).students;
  const other = (await studentsOf()).find((s) => s.class_id !== C1.id);
  const r = await api('import.scores', null, {
    examId: exam.id, dryRun: true,
    rows: [
      { studentNo: inClass[0].student_no, subjectName: '语文', score: '100' },
      { studentNo: inClass[0].student_no, subjectName: '数学', score: '100' },
      { studentNo: other.student_no, subjectName: '语文', score: '100' },
    ],
  }, teacherToken);
  const by = rowsByLine(r);
  check('本班本科可写入', by.get(1)?.ok === true && by.get(1).action !== 'invalid');
  check('他科逐行拒绝且不影响其他行', by.get(2)?.errors.some((e) => e.code === 'out_of_scope') && r.invalid === 2 && r.created + r.updated === 1,
    JSON.stringify(r.items.map((x) => x.action)));
  check('别班学生按未找到处理', by.get(3)?.errors.some((e) => e.code === 'student_not_found'));
  const write = await api('import.scores', null, { examId: exam.id, dryRun: false, rows: [{ studentNo: inClass[0].student_no, subjectName: '语文', score: '101' }] }, teacherToken);
  check('教师确能落库', write.created + write.updated === 1);
  const roster = await call('import.students', null, { rows: [{ studentNo: 'T9100', name: '甲', gender: '男', className: C1.name }], dryRun: true }, teacherToken);
  check('教师不能导名单', errOf(roster) === 'forbidden', JSON.stringify(roster.json));
  await api('accounts.delete', null, { id: created.id }, admin);
  console.log('  ok   临时教师账号已清理');
});

// ---------- 阶段②下线确认 ----------
await step('出勤/素质相关 action 已下线', async () => {
  const examId = ref.exams[0].id;
  const stu = (await studentsOf())[0];
  for (const [action, body] of [
    ['attendance.list', null], ['quality.list', null],
    ['discipline.list', null], ['activity.list', null], ['review.list', null],
  ]) {
    const r = await call(action, { examId, studentId: stu.id }, undefined, admin);
    check(`${action} 返回 404`, r.status === 404 && errOf(r) === 'not_found', `${r.status}/${JSON.stringify(r.json)}`);
  }
  for (const action of ['attendance.save', 'discipline.save', 'activity.save', 'review.save']) {
    const r = await call(action, null, { studentId: stu.id }, admin);
    check(`${action} 返回 404`, r.status === 404 && errOf(r) === 'not_found', `${r.status}/${JSON.stringify(r.json)}`);
  }
  const dash = await api('dashboard', null, undefined, admin);
  check('dashboard 载荷已裁剪', !('attStats' in dash) && !('recentDiscipline' in dash) && 'subjectAvgs' in dash, Object.keys(dash).join(','));
  const acc = await api('accounts.save', null, { username: 'imp_student', displayName: '导入测试生', role: 'STUDENT', password: TEACHER_PW, studentId: stu.id }, admin);
  const firstStu = (await api('auth.login', null, { username: 'imp_student', password: TEACHER_PW })).token;
  await api('auth.change-password', null, { currentPassword: TEACHER_PW, newPassword: TEACHER_PW2 }, firstStu);
  const tok = (await api('auth.login', null, { username: 'imp_student', password: TEACHER_PW2 })).token;
  const portalKeys = Object.keys(await api('portal.me', null, undefined, tok)).filter((k) => k !== 'ok');
  check('portal.me 只返回学生/科目/记录', JSON.stringify(portalKeys.sort()) === '["records","student","subjects"]', portalKeys.join(','));
  const guard = await call('import.scores', null, { examId, rows: [{ studentNo: stu.student_no, subjectName: '语文', score: '1' }] }, tok);
  check('学生账号不能导入', errOf(guard) === 'forbidden', JSON.stringify(guard.json));
  await api('accounts.delete', null, { id: acc.id }, admin);
  const del = await call('students.delete', null, { id: (await studentsOf()).find((s) => s.student_no === 'T9001')?.id }, admin);
  check('临时学生已清理', errOf(del) === undefined || errOf(del) === 'invalid_id');
  const leftover = (await api('accounts.list', null, undefined, admin)).accounts.map((a) => a.username);
  check('无遗留临时账号', leftover.join(',') === ADMIN_USER, leftover.join(','));
});

console.log(`\n通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
