// 阶段③回归：GET scores.trend（科目历年成绩走势）的读侧与权限语义。
// 跑法（一次性本机内存 fixture，进程退出即清空）：
//   node dev/server.mjs 8775 &
//   node dev/trend-check.mjs http://127.0.0.1:8775
const BASE = process.argv[2] || 'http://127.0.0.1:8775';
// 仅本机内存 fixture 使用的临时口令，不会写入任何持久化文件；三个 dev/*-check.mjs 共用同一管理员
const ADMIN_USER = 'dev_admin';
const ADMIN_PW = process.env.DEV_ADMIN_PW || 'Dev2026Check1';
const TEACHER_PW = 'Trd2026TeachX';
const TEACHER_PW2 = 'TrdT2026TeachX';

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
  return r.json().catch(() => null);
}
const okData = (j, action) => { if (!j?.ok) throw new Error(`${action} 失败：${JSON.stringify(j)}`); return j; };

console.log(`fixture: ${BASE}`);
let admin = '';

await step('准备管理员与演示数据', async () => {
  let r = await call('auth.login', null, { username: ADMIN_USER, password: ADMIN_PW });
  if (!r?.token) {
    okData(await call('auth.bootstrap', null, { username: ADMIN_USER, password: ADMIN_PW, displayName: '验证管理员' }), 'auth.bootstrap');
    r = await call('auth.login', null, { username: ADMIN_USER, password: ADMIN_PW });
  }
  if (!r?.token) throw new Error(`拿不到 ${ADMIN_USER} 的会话：${JSON.stringify(r)}`);
  admin = r.token;
  if (!(await call('students.list', null, undefined, admin))?.students?.length) {
    const s = await call('demo.seed', null, {}, admin);
    if (s?.code !== 'already_seeded') okData(s, 'demo.seed');
  }
  console.log('  ok   系统已初始化');
});

const students = okData(await call('students.list', null, undefined, admin), 'students.list').students;
const classes = okData(await call('classes.list', null, undefined, admin), 'classes.list').classes;
const ref = okData(await call('refdata', null, undefined, admin), 'refdata');
const subject = (name) => ref.subjects.find((s) => s.name === name);
const klass = (name) => classes.find((c) => c.name === name);
const examsAsc = [...ref.exams].sort((a, b) => a.exam_date.localeCompare(b.exam_date));
console.log(`数据：${students.length} 名学生 / ${classes.length} 个班级 / ${examsAsc.length} 场考试`);

await step('scores.trend 全校视角', async () => {
  const yuwen = subject('语文');
  const t = okData(await call('scores.trend', { subjectId: yuwen.id }, undefined, admin), 'scores.trend');
  check('回显科目', t.subject?.id === yuwen.id);
  check('考试按日期升序', t.exams.map((e) => e.id).join() === examsAsc.map((e) => e.id).join(), t.exams.map((e) => e.name).join(','));
  check('含全部 3 个班级', t.classes.length === 3, String(t.classes.length));
  check('每班每考都有均分槽位', t.classes.every((c) => t.exams.every((e) => e.id in (t.classAvg[c.id] ?? {}))));
  const c1 = klass('高一(1)班');
  check('高一(1)班至少两场有数值', t.exams.filter((e) => typeof t.classAvg[c1.id][e.id] === 'number').length >= 2);
  check('无数据的场次为 null 槽位', t.exams.every((e) => { const v = t.classAvg[c1.id][e.id]; return v === null || typeof v === 'number'; }));
  check('学生按班级归属', t.students.every((s) => classes.some((c) => c.id === s.classId)));
  check('分数为十分之一整数', t.students.every((s) => Object.values(s.scores).every((v) => v === null || Number.isInteger(v))));
  const sample = t.students.find((s) => Object.values(s.scores).some((v) => v !== null));
  check('分值落在 0-1500', Object.values(sample.scores).every((v) => v === null || (v >= 0 && v <= 1500)), JSON.stringify(sample.scores));
  check('均分与手算一致', (() => {
    const exam = t.exams.find((e) => typeof t.classAvg[c1.id][e.id] === 'number');
    const vals = t.students.filter((s) => s.classId === c1.id).map((s) => s.scores[exam.id]).filter((v) => v != null);
    if (!vals.length) return false;
    const avg = +(vals.reduce((a, b) => a + b, 0) / vals.length / 10).toFixed(1);
    return avg === t.classAvg[c1.id][exam.id];
  })());
});

await step('scores.trend 班级收窄', async () => {
  const yuwen = subject('语文');
  const c3 = klass('高二(3)班');
  const t = okData(await call('scores.trend', { subjectId: yuwen.id, classId: c3.id }, undefined, admin), 'scores.trend?classId');
  check('只返回所选班级', t.classes.length === 1 && t.classes[0].id === c3.id);
  check('学生只来自该班', t.students.every((s) => s.classId === c3.id), t.students.map((s) => s.className).join(','));
  check('该班均分序列可画线', t.exams.some((e) => typeof t.classAvg[c3.id][e.id] === 'number'));
  const c2 = klass('高一(2)班');
  const empty = okData(await call('scores.trend', { subjectId: yuwen.id, classId: c2.id }, undefined, admin), 'scores.trend 无数据班级');
  check('该班无成绩时返回空走势', empty.exams.length === 0 && empty.students.length === 0, JSON.stringify(empty.exams));
});

await step('scores.trend 入参校验', async () => {
  const bad = await call('scores.trend', { subjectId: 'not-a-uuid' }, undefined, admin);
  check('非法 subjectId 被拒', bad?.error === 'invalid_id', JSON.stringify(bad));
  const missing = await call('scores.trend', {}, undefined, admin);
  check('缺 subjectId 被拒', missing?.error === 'invalid_id', JSON.stringify(missing));
  const ghost = await call('scores.trend', { subjectId: '00000000-0000-4000-8000-000000000000' }, undefined, admin);
  check('不存在科目返回 404', ghost?.error === 'not_found', JSON.stringify(ghost));
  const empty = okData(await call('scores.trend', { subjectId: subject('地理').id }, undefined, admin), 'scores.trend 空科目');
  check('无成绩科目返回空走势', empty.exams.length === 0 && empty.students.length === 0, JSON.stringify(empty.exams));
});

await step('教师看得到任教班级内的全部科目走势', async () => {
  const yuwen = subject('语文'); const shuxue = subject('数学');
  const c1 = klass('高一(1)班'); const c3 = klass('高二(3)班');
  const stale = okData(await call('accounts.list', null, undefined, admin), 'accounts.list').accounts.find((a) => a.username === 'trend_teacher');
  if (stale) okData(await call('accounts.delete', null, { id: stale.id }, admin), '清理同名账号');
  const created = okData(await call('accounts.save', null, {
    username: 'trend_teacher', displayName: '走势老师', role: 'TEACHER', password: TEACHER_PW,
    assignments: [{ subjectId: yuwen.id, classId: c1.id }],
  }, admin), 'accounts.save');
  let tok = okData(await call('auth.login', null, { username: 'trend_teacher', password: TEACHER_PW }), '教师首次登录').token;
  okData(await call('auth.change-password', null, { currentPassword: TEACHER_PW, newPassword: TEACHER_PW2 }, tok), '改初始密码');
  tok = okData(await call('auth.login', null, { username: 'trend_teacher', password: TEACHER_PW2 }), '教师再次登录').token;

  const t = okData(await call('scores.trend', { subjectId: yuwen.id }, undefined, tok), '教师 scores.trend');
  check('只含任教班级', t.classes.length === 1 && t.classes[0].id === c1.id, t.classes.map((c) => c.name).join(','));
  check('学生只来自任教班', t.students.every((s) => s.classId === c1.id));
  check('均分序列可画线', t.exams.some((e) => typeof t.classAvg[c1.id][e.id] === 'number'));
  const cross = await call('scores.trend', { subjectId: yuwen.id, classId: c3.id }, undefined, tok);
  check('请求他班被拒 403', cross?.error === 'forbidden', JSON.stringify(cross));
  const other = okData(await call('scores.trend', { subjectId: shuxue.id }, undefined, tok), '教师看别科走势');
  check('别科走势只含任教班', other.classes.length === 1 && other.classes[0].id === c1.id, other.classes.map((c) => c.name).join(','));
  check('别科学生只来自任教班', other.students.every((s) => s.classId === c1.id));
  check('别科均分序列可画线', other.exams.some((e) => typeof other.classAvg[c1.id][e.id] === 'number'));
  const anon = await call('scores.trend', { subjectId: yuwen.id });
  check('未登录被拒', anon?.error === 'login_required', JSON.stringify(anon));

  okData(await call('accounts.delete', null, { id: created.account?.id ?? created.id }, admin), 'accounts.delete');
  console.log('  ok   临时教师账号已清理');
});

console.log(`\n通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) { console.log(fails.map((f) => ` - ${f}`).join('\n')); process.exit(1); }
