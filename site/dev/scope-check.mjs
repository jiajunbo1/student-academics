// 一次性验证脚本：科目 × 班级任教授权（dev/ 不进发布包）
// 跑法：node dev/server.mjs <port> &  然后  node dev/scope-check.mjs http://127.0.0.1:<port>
const BASE = `${process.argv[2] || 'http://127.0.0.1:8775'}/functions/v1/app`;

const call = async (action, { body, token, qs = '' } = {}) => {
  const r = await fetch(`${BASE}?action=${encodeURIComponent(action)}${qs}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { 'X-App-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const results = [];
const check = (name, pass, extra = '') => results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? `  [${extra}]` : ''}`);

// 1. 初始化测试管理员 + 灌演示数据（可重复跑：已存在就复用）
let admin;
const again = await call('auth.login', { body: { username: 'dev_admin', password: 'Dev2026Check1' } });
if (again.json?.token) {
  admin = again.json.token;
  check('复用上一轮的测试管理员', true);
} else {
  const boot = await call('auth.bootstrap', { body: { username: 'dev_admin', password: 'Dev2026Check1', displayName: '授权测试管理员' } });
  check('测试管理员初始化', boot.json?.ok === true, JSON.stringify(boot.json?.account?.role || boot.json?.error));
  admin = boot.json.token;
}
const seeded = await call('demo.seed', { body: {}, token: admin });
check('演示数据导入', seeded.json?.ok === true || seeded.json?.error === 'already_seeded', JSON.stringify(seeded.json?.error || ''));

const rd = await call('refdata', { token: admin });
const cl = await call('classes.list', { token: admin });
const subj = (n) => rd.json.subjects.find((s) => s.name === n);
const cls = (n) => cl.json.classes.find((c) => c.name === n);
const CHinese = subj('语文'); const MATH = subj('数学');
const C1 = cls('高一(1)班'); const C3 = cls('高二(3)班');
check('取到科目与班级', !!(CHinese && MATH && C1 && C3), `语文=${!!CHinese} 数学=${!!MATH} 高一1=${!!C1} 高二3=${!!C3}`);

// 演示数据里并非每个班都考满了最近一场考试：按班级挑一场它有成绩的考试
const examFor = async (classId) => {
  for (const e of rd.json.exams) {
    const s = await call('scores.sheet', { token: admin, qs: `&examId=${e.id}&classId=${classId}` });
    if (s.json?.rows?.length) return { examId: e.id, sheet: s.json };
  }
  throw new Error(`no scores for class ${classId}`);
};
const pick = await examFor(C1.id);
const examId = pick.examId;
const ownStudent = pick.sheet.rows[0];
const others = await call('students.list', { token: admin, qs: `&classId=${C3.id}` });
const otherStudent = others.json.students[0];
check('管理员可见 5 个科目列', pick.sheet.subjects.length === 5, pick.sheet.subjects.map((s) => s.name).join(','));
check('测试考试与跨班学生就绪', !!ownStudent && !!otherStudent,
  `${ownStudent?.studentName || ''} vs ${otherStudent?.name || ''} exam=${examId.slice(0, 8)}`);

// 2. 开通只教「语文 × 高一(1)班」的教师（重跑时先清理同名账号）
const pre = await call('accounts.list', { token: admin });
for (const a of (pre.json.accounts || []).filter((x) => ['yw_teacher', 'yw_two', 'bad_admin'].includes(x.username))) {
  await call('accounts.delete', { token: admin, body: { id: a.id } });
}
const created = await call('accounts.save', {
  token: admin,
  body: {
    username: 'yw_teacher', displayName: '语文老师', role: 'TEACHER', password: 'Yw20260929',
    assignments: [{ subjectId: CHinese.id, classId: C1.id }],
  },
});
check('教师账号创建', created.json?.ok === true, JSON.stringify(created.json?.error || ''));
const login1 = await call('auth.login', { body: { username: 'yw_teacher', password: 'Yw20260929' } });
check('首次登录要求改密', login1.json?.account?.mustChange === true, String(login1.json?.account?.mustChange));
const tToken = login1.json.token;
await call('auth.change-password', { token: tToken, body: { currentPassword: 'Yw20260929', newPassword: 'Yw88001234' } });
const login2 = await call('auth.login', { body: { username: 'yw_teacher', password: 'Yw88001234' } });
const T = login2.json.token;
check('改密后可正常登录', login2.json?.account?.mustChange === false, String(login2.json?.error || ''));

// 3. 读侧：班级在范围内就看全科，科目授权只限制写入
const tRd = await call('refdata', { token: T });
check('教师能看全部科目名', tRd.json?.subjects?.length === rd.json.subjects.length,
  (tRd.json?.subjects || []).map((s) => s.name).join(','));
check('教师可录科目只有语文', tRd.json?.mySubjectIds?.length === 1 && tRd.json.mySubjectIds[0] === CHinese.id,
  JSON.stringify(tRd.json?.mySubjectIds));
const tCl = await call('classes.list', { token: T });
check('教师只看到高一(1)班', tCl.json?.classes?.length === 1 && tCl.json.classes[0].name === '高一(1)班',
  (tCl.json?.classes || []).map((c) => c.name).join(','));
const tSt = await call('students.list', { token: T });
check('学生列表只含本班', (tSt.json?.students || []).every((s) => s.className === '高一(1)班')
  && tSt.json.students.length === C1.studentCount, `${tSt.json?.students?.length} 人`);
const tSheet = await call('scores.sheet', { token: T, qs: `&examId=${examId}` });
check('成绩单出本班全部科目列', tSheet.json?.subjects?.length === 5,
  (tSheet.json?.subjects || []).map((s) => s.name).join(','));
check('成绩单行只属本班', (tSheet.json?.rows || []).every((r) => r.className === '高一(1)班'), `${tSheet.json?.rows?.length} 行`);
check('总分按全部科目计', (() => {
  const r = tSheet.json.rows.find((x) => x.studentId === ownStudent.studentId);
  const cells = tSheet.json.subjects.map((s) => r.cells[s.id]).filter((v) => v != null);
  return r.total === cells.reduce((a, b) => a + b, 0) && r.count === cells.length;
})(), JSON.stringify(tSheet.json.rows?.[0] ?? {}).slice(0, 120));
const tCross = await call('scores.sheet', { token: T, qs: `&examId=${examId}&classId=${C3.id}` });
check('跨班取成绩单被拒', tCross.status === 403, `${tCross.status} ${tCross.json?.error}`);
const tGetOther = await call('students.get', { token: T, qs: `&id=${otherStudent.id}` });
check('查看别班学生档案被拒', tGetOther.status === 403, `${tGetOther.status} ${tGetOther.json?.error}`);
const tGetOwn = await call('students.get', { token: T, qs: `&id=${ownStudent.studentId}` });
check('本班学生档案含全科成绩', (tGetOwn.json?.scores || []).length > 1
  && new Set(tGetOwn.json.scores.map((s) => s.subject_id)).size > 1, `${tGetOwn.json?.scores?.length} 条`);
const tDash = await call('dashboard', { token: T });
check('看板出本班全部科目平均分', (tDash.json?.subjectAvgs || []).length > 1
  && tDash.json.subjectAvgs.some((s) => s.name === '语文'),
  (tDash.json?.subjectAvgs || []).map((s) => `${s.name}:${s.avg}`).join(','));
check('看板人数按范围收敛', tDash.json?.counts?.students === C1.studentCount && tDash.json?.counts?.classes === 1,
  JSON.stringify(tDash.json?.counts));
check('教师端不下发账号数量', tDash.json?.counts?.teachers === undefined, JSON.stringify(tDash.json?.counts));
const aDash = await call('dashboard', { token: admin });
check('管理员端仍有账号数量', typeof aDash.json?.counts?.teachers === 'number', JSON.stringify(aDash.json?.counts));

// 4. 写侧过滤
const badSubject = await call('scores.save', { token: T, body: { examId, subjectId: MATH.id, entries: [{ studentId: ownStudent.studentId, score: 99 }] } });
check('录别科目被拒', badSubject.status === 403 && badSubject.json?.error === 'out_of_scope', `${badSubject.status} ${badSubject.json?.error}`);
const badClass = await call('scores.save', { token: T, body: { examId, subjectId: CHinese.id, entries: [{ studentId: otherStudent.id, score: 99 }] } });
check('录别班学生被拒', badClass.status === 403 && badClass.json?.error === 'out_of_scope', `${badClass.status} ${badClass.json?.error}`);
const mixed = await call('scores.save', { token: T, body: { examId, subjectId: CHinese.id, entries: [
  { studentId: ownStudent.studentId, score: 100 }, { studentId: otherStudent.id, score: 100 }] } });
check('一批里越权即整批拒绝', mixed.status === 403, `${mixed.status} ${mixed.json?.error}`);
const good = await call('scores.save', { token: T, body: { examId, subjectId: CHinese.id, entries: [{ studentId: ownStudent.studentId, score: 123.5 }] } });
check('授权内录入成功', good.json?.ok === true && good.json?.saved === 1, JSON.stringify(good.json));
const verify = await call('scores.sheet', { token: admin, qs: `&examId=${examId}&classId=${C1.id}` });
const wrote = verify.json.rows.find((r) => r.studentId === ownStudent.studentId).cells[CHinese.id];
check('落库为十分之一分', wrote === 1235, String(wrote));

// 5. 授权变更语义
const accountList = await call('accounts.list', { token: admin });
const teacher = accountList.json.accounts.find((a) => a.username === 'yw_teacher');
check('账号列表带回任教范围', teacher?.assignments?.length === 1
  && teacher.assignments[0].subjectName === '语文' && teacher.assignments[0].className === '高一(1)班',
  JSON.stringify(teacher?.subjectNames) + '/' + JSON.stringify(teacher?.classNames));
await call('accounts.save', { token: admin, body: { id: teacher.id, username: teacher.username, displayName: '语文老师改', role: 'TEACHER' } });
const afterResetPw = await call('accounts.list', { token: admin });
const t2 = afterResetPw.json.accounts.find((a) => a.username === 'yw_teacher');
check('不带 assignments 字段时保留原授权', t2?.assignments?.length === 1, `${t2?.assignments?.length} 条`);
await call('accounts.save', { token: admin, body: { id: t2.id, username: t2.username, displayName: '语文老师', role: 'TEACHER', assignments: [] } });
const afterClear = await call('dashboard', { token: T });
check('收回全部任教后教师看不到成绩', afterClear.json?.subjectAvgs?.length === 0 && afterClear.json?.counts?.students === 0,
  JSON.stringify(afterClear.json?.counts));

// 6. 非教师角色不允许带授权
const adminWithAssign = await call('accounts.save', {
  token: admin,
  body: { username: 'bad_admin', displayName: '错配', role: 'ADMIN', password: 'Adm20260929', assignments: [{ subjectId: CHinese.id, classId: C1.id }] },
});
check('管理员账号拒绝任教字段', adminWithAssign.status === 400 && adminWithAssign.json?.error === 'assignments_not_allowed',
  `${adminWithAssign.status} ${adminWithAssign.json?.error}`);
const badUuid = await call('accounts.save', {
  token: admin,
  body: { username: 'yw_two', displayName: '乙', role: 'TEACHER', password: 'Yw20260930', assignments: [{ subjectId: 'not-a-uuid', classId: C1.id }] },
});
check('非法 uuid 被拒', badUuid.json?.error === 'invalid_id', String(badUuid.json?.error));

// 9. 清理本轮创建的教师账号，便于对同一实例重复跑
const cleanup = await call('accounts.delete', { token: admin, body: { id: teacher.id } });
check('临时教师账号已清理', cleanup.json?.ok === true, String(cleanup.json?.error));

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
