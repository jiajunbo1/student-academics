// 本机私有 fixture 的演示数据种子（dev/ 不进发布包，凭据仅存在于内存假库）
// 跑法：node dev/server.mjs 8775 && node dev/ui-seed.mjs http://127.0.0.1:8775
const BASE = `${process.argv[2] || 'http://127.0.0.1:8775'}/functions/v1/app`;
const ADMIN_USER = 'dev_admin';
const ADMIN_PW = 'Dev2026Check1';
const TEACHER_USER = 'dev_yw';
const TEACHER_PW = 'Dev2026Check1';

const call = async (action, { body, token, qs = '' } = {}) => {
  const r = await fetch(`${BASE}?action=${encodeURIComponent(action)}${qs}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { 'X-App-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json().catch(() => null);
};

let admin = (await call('auth.login', { body: { username: ADMIN_USER, password: ADMIN_PW } }))?.token;
if (!admin) {
  const boot = await call('auth.bootstrap', { body: { username: ADMIN_USER, password: ADMIN_PW, displayName: '本地演示管理员' } });
  admin = boot?.token;
  if (!admin) throw new Error(`bootstrap 失败：${JSON.stringify(boot)}`);
}
await call('demo.seed', { body: {}, token: admin });
console.log('管理员就绪');

const [rd, cl, accounts] = await Promise.all([
  call('refdata', { token: admin }),
  call('classes.list', { token: admin }),
  call('accounts.list', { token: admin }),
]);
const yu = rd.subjects.find((s) => s.name === '语文') || rd.subjects[0];
const classes = cl.classes.slice(0, 2);

for (const a of accounts.accounts.filter((x) => x.username === TEACHER_USER)) {
  await call('accounts.delete', { token: admin, body: { id: a.id } });
}
await call('accounts.save', {
  token: admin,
  body: {
    username: TEACHER_USER, displayName: '语文老师（本地）', role: 'TEACHER', password: TEACHER_PW,
    assignments: classes.map((c) => ({ subjectId: yu.id, classId: c.id })),
  },
});
let teacher = (await call('auth.login', { body: { username: TEACHER_USER, password: TEACHER_PW } }));
if (teacher?.account?.mustChange) {
  await call('auth.change-password', { token: teacher.token, body: { currentPassword: TEACHER_PW, newPassword: `${TEACHER_PW}x` } });
  teacher = await call('auth.login', { body: { username: TEACHER_USER, password: `${TEACHER_PW}x` } });
}
console.log(`教师就绪：${yu.name} × ${classes.map((c) => c.name).join('、')}`);

const today = new Date();
const day = (offset) => {
  const d = new Date(today);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const TEXTS = [
  { title: '《岳阳楼记》', part: '第 3-4 段', note: '重点句默写' },
  { title: '《劝学》', part: '全文', note: '' },
  { title: '《赤壁赋》', part: '第 1-2 段', note: '课上抽查' },
];
const HOMEWORKS = [
  { title: '第 3 课课后练习', note: '选择题 + 简答' },
  { title: '作文：我的家乡', note: '800 字' },
];

for (const [i, t] of TEXTS.entries()) {
  const r = await call('recitation.save', {
    token: teacher.token,
    body: { subjectId: yu.id, classIds: classes.map((c) => c.id), title: t.title, part: t.part, assignDate: day(-i * 2), dueDate: day(-i * 2 + 3), note: t.note },
  });
  console.log(`背诵清单 ${t.title}: ${JSON.stringify(r)}`);
}
for (const [i, h] of HOMEWORKS.entries()) {
  const r = await call('homework.save', {
    token: teacher.token,
    body: { subjectId: yu.id, classIds: [classes[0].id], title: h.title, assignDate: day(-i * 3), dueDate: day(-i * 3 + 2), note: h.note },
  });
  console.log(`作业清单 ${h.title}: ${JSON.stringify(r)}`);
}

const lists = (await call('recitation.list', { token: teacher.token })).lists;
const statuses = ['过关', '待重背', '延背', '免背'];
for (const [idx, l] of lists.entries()) {
  const sheet = await call('recitation.sheet', { token: teacher.token, qs: `&listId=${l.id}` });
  const entries = sheet.rows.slice(0, Math.max(sheet.rows.length - 2, 1)).map((r, i) => ({
    studentId: r.studentId,
    status: statuses[(i + idx) % statuses.length],
    checkDate: day(-idx),
    planDate: statuses[(i + idx) % statuses.length] === '延背' ? day(2) : '',
    note: i === 0 ? '流利' : '',
  }));
  const saved = await call('recitation.check', { token: teacher.token, body: { listId: l.id, entries } });
  console.log(`登记 ${l.title}(${l.className}): ${JSON.stringify(saved)}`);
}

const hwLists = (await call('homework.list', { token: teacher.token })).lists;
const hwStatuses = ['已交', '未交', '补交', '优秀', '需订正'];
for (const [idx, l] of hwLists.entries()) {
  const sheet = await call('homework.sheet', { token: teacher.token, qs: `&listId=${l.id}` });
  const saved = await call('homework.check', {
    token: teacher.token,
    body: {
      listId: l.id,
      entries: sheet.rows.map((r, i) => ({ studentId: r.studentId, status: hwStatuses[(i + idx) % hwStatuses.length], checkDate: day(-idx), note: '' })),
    },
  });
  console.log(`作业登记 ${l.title}: ${JSON.stringify(saved)}`);
}

// 学生账号：让 Portal 页能看到本人背诵/作业
const roster = (await call('students.list', { token: admin, qs: `&classId=${classes[0].id}` })).students;
const seeded = await call('accounts.seed-students', { token: admin, body: { classId: classes[0].id, initialPassword: 'Dev2026Stu1' } });
console.log(`学生账号：${JSON.stringify(seeded).slice(0, 160)}`);
console.log(`示例学生：${roster.slice(0, 3).map((s) => `${s.name}/${s.student_no}`).join('、')}`);
console.log('完成');
