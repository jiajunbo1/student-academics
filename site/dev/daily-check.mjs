// 一次性验证脚本：背诵登记表 + 作业完成记录（dev/ 不进发布包）
// 跑法：node dev/server.mjs 8779 &  然后  node dev/daily-check.mjs http://127.0.0.1:8779
const BASE = `${process.argv[2] || 'http://127.0.0.1:8779'}/functions/v1/app`;

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
// 断言链上任一步返回异常时，先吐出已跑过的判定，避免整轮结果丢失
process.on('uncaughtException', (e) => {
  console.log(results.join('\n'));
  console.log(`\n!! 脚本中断：${e.message}`);
  process.exit(1);
});

// 管理员改密后要重新取令牌，否则会话仍是 must_change 状态
async function loginAndUnlock(username, first, second) {
  let r = await call('auth.login', { body: { username, password: first } });
  if (r.json?.account?.mustChange) {
    await call('auth.change-password', { token: r.json.token, body: { currentPassword: first, newPassword: second } });
    r = await call('auth.login', { body: { username, password: second } });
  }
  return r.json?.token;
}

// 1. 管理员 + 演示数据（可重复跑）
let admin;
const again = await call('auth.login', { body: { username: 'daily_admin', password: 'Daily2026Admin' } });
if (again.json?.token) {
  admin = again.json.token;
  check('复用上一轮的测试管理员', true);
} else {
  const boot = await call('auth.bootstrap', { body: { username: 'daily_admin', password: 'Daily2026Admin', displayName: '日常登记管理员' } });
  check('测试管理员初始化', boot.json?.ok === true, String(boot.json?.error || ''));
  admin = boot.json.token;
}
const seeded = await call('demo.seed', { body: {}, token: admin });
check('演示数据导入', seeded.json?.ok === true || seeded.json?.error === 'already_seeded', String(seeded.json?.error || ''));

const rd = await call('refdata', { token: admin });
const cl = await call('classes.list', { token: admin });
const YU = rd.json.subjects.find((s) => s.name === '语文') || rd.json.subjects[0];
const MA = rd.json.subjects.find((s) => s.id !== YU.id);
const C1 = cl.json.classes[0];
const C2 = cl.json.classes[1];
check('取到语文与两个班级', !!(YU && C1 && C2), `语文=${!!YU} ${C1?.name}/${C2?.name}`);
const roster = (await call('students.list', { token: admin, qs: `&classId=${C1.id}` })).json.students;
check('首班有学生', roster.length > 0, `${roster.length} 人`);

// 2. 只教「语文 × 首班」的教师
const pre = await call('accounts.list', { token: admin });
for (const a of (pre.json.accounts || []).filter((x) => ['daily_yw', 'daily_yw2'].includes(x.username))) {
  await call('accounts.delete', { token: admin, body: { id: a.id } });
}
const created = await call('accounts.save', {
  token: admin,
  body: {
    username: 'daily_yw', displayName: '语文老师', role: 'TEACHER', password: 'Yw20260929',
    assignments: [{ subjectId: YU.id, classId: C1.id }],
  },
});
check('教师账号创建', created.json?.ok === true, String(created.json?.error || ''));
const T = await loginAndUnlock('daily_yw', 'Yw20260929', 'Yw88001234');
check('教师改密后可用', !!T, String(T ? 'ok' : 'no-token'));

// 3. 新建清单：多班越权 / 单班成功
const bad = await call('recitation.save', {
  token: T,
  body: { subjectId: YU.id, classIds: [C1.id, C2.id], title: '《岳阳楼记》', part: '第四段', assignDate: '2026-09-21' },
});
check('教师多班创建被拒', bad.status === 403 && bad.json?.error === 'out_of_scope', `${bad.status} ${bad.json?.error}`);

const okCreate = await call('recitation.save', {
  token: T,
  body: { subjectId: YU.id, classIds: [C1.id], title: '《岳阳楼记》', part: '第四段', assignDate: '2026-09-21', dueDate: '2026-09-28', note: '重点句默写' },
});
check('背诵清单创建', okCreate.json?.ok === true && (okCreate.json.ids || []).length === 1, JSON.stringify(okCreate.json?.error || okCreate.json?.ids?.length));
const listId = (okCreate.json.ids || [])[0];

const badDate = await call('recitation.save', { token: T, body: { subjectId: YU.id, classIds: [C1.id], title: '坏日期', assignDate: '2026/9/21' } });
check('非法布置日期被拒', badDate.status === 400 && badDate.json?.error === 'invalid_date', `${badDate.status} ${badDate.json?.error}`);

// 4. 清单列表与进度
const lists = await call('recitation.list', { token: T });
const lv = (lists.json.lists || []).find((x) => x.id === listId);
const studying = roster.filter((s) => s.status === '在读').length;
check('教师清单可见', !!lv && lv.className === C1.name && lv.part === '第四段', JSON.stringify(lv || lists.json?.error));
check('应交人数=本班在读', lv?.total === studying, `total=${lv?.total} 在读=${studying}`);
check('未登记时进度为 0', lv?.passCount === 0 && lv?.total > 0, `pass=${lv?.passCount}`);
const otherLists = await call('recitation.list', { token: T, qs: `&classId=${C2.id}` });
check('按越权班级过滤返回空', (otherLists.json.lists || []).length === 0, JSON.stringify(otherLists.json?.error || otherLists.json?.lists?.length));

// 5. 名单登记：改状态计次、同状态不计次、延背日期、撤销
const sheet = await call('recitation.sheet', { token: T, qs: `&listId=${listId}` });
check('名单行数=全班', (sheet.json.rows || []).length === roster.length, `${sheet.json.rows?.length} vs ${roster.length}`);
check('背诵口径下发', sheet.json.hasPart === true && sheet.json.hasAttempt === true && sheet.json.hasPlan === true
  && sheet.json.statuses.join(',') === '过关,待重背,延背,免背', JSON.stringify(sheet.json.statuses));
const first = sheet.json.rows[0];
const rest = sheet.json.rows.slice(1).map((r) => ({ studentId: r.studentId, status: '过关' }));
const saved = await call('recitation.check', { token: T, body: { listId, entries: [...rest, { studentId: first.studentId, status: '待重背', note: '第二段生疏' }] } });
check('整班登记写入', saved.json?.ok === true && saved.json.saved === roster.length, JSON.stringify(saved.json?.error || saved.json?.saved));

const read1 = await call('recitation.sheet', { token: T, qs: `&listId=${listId}` });
const recOf = (j, id) => (j.json.rows || []).find((x) => x.studentId === id)?.record;
const r1 = recOf(read1, first.studentId);
check('首生待重背第 1 次', r1?.status === '待重背' && r1?.attempt === 1, JSON.stringify(r1));
check('登记人显示名回填', !!r1?.recordedByName, String(r1?.recordedByName));
const pv = (await call('recitation.list', { token: T })).json.lists.find((x) => x.id === listId);
check('列表进度与状态计数', pv?.passCount === studying - 1 && pv?.counts?.待重背 === 1, JSON.stringify({ pass: pv?.passCount, counts: pv?.counts }));

await call('recitation.check', { token: T, body: { listId, entries: [{ studentId: first.studentId, status: '过关' }] } });
const r2 = recOf(await call('recitation.sheet', { token: T, qs: `&listId=${listId}` }), first.studentId);
check('改状态计第 2 次', r2?.attempt === 2, JSON.stringify(r2));
await call('recitation.check', { token: T, body: { listId, entries: [{ studentId: first.studentId, status: '过关' }] } });
const r3 = recOf(await call('recitation.sheet', { token: T, qs: `&listId=${listId}` }), first.studentId);
check('同状态重复登记不计次', r3?.attempt === 2, JSON.stringify(r3));

await call('recitation.check', { token: T, body: { listId, entries: [{ studentId: first.studentId, status: '延背', planDate: '2026-10-09' }] } });
const r4 = recOf(await call('recitation.sheet', { token: T, qs: `&listId=${listId}` }), first.studentId);
check('延背带应背日期', r4?.planDate === '2026-10-09' && r4?.attempt === 3, JSON.stringify(r4));

await call('recitation.check', { token: T, body: { listId, entries: [{ studentId: first.studentId, status: '' }] } });
const r5 = recOf(await call('recitation.sheet', { token: T, qs: `&listId=${listId}` }), first.studentId);
check('空状态撤销登记', r5 === null, JSON.stringify(r5));

// 5b. 总览打勾：请求只带状态，备注与应背日必须原样保留（否则点一下勾就丢数据）
await call('recitation.check', { token: T, body: { listId, entries: [{ studentId: first.studentId, status: '延背', note: '口头订正即可', planDate: '2026-10-12' }] } });
await call('recitation.check', { token: T, body: { listId, entries: [{ studentId: first.studentId, status: '过关' }] } });
const rTick = recOf(await call('recitation.sheet', { token: T, qs: `&listId=${listId}` }), first.studentId);
check('打勾改状态不抹备注与应背日', rTick?.status === '过关' && rTick?.note === '口头订正即可' && rTick?.planDate === '2026-10-12'
  && rTick?.attempt === 2, JSON.stringify(rTick));
await call('recitation.check', { token: T, body: { listId, entries: [{ studentId: first.studentId, status: '' }] } });
check('打勾再点一次即撤销', recOf(await call('recitation.sheet', { token: T, qs: `&listId=${listId}` }), first.studentId) === null);

const badStatus = await call('recitation.check', { token: T, body: { listId, entries: [{ studentId: first.studentId, status: '随便' }] } });
check('非法状态被拒', badStatus.status === 400 && badStatus.json?.error === 'invalid_choice', `${badStatus.status} ${badStatus.json?.error}`);
const alien = (await call('students.list', { token: admin, qs: `&classId=${C2.id}` })).json.students[0];
const badClass = await call('recitation.check', { token: T, body: { listId, entries: [{ studentId: alien.id, status: '过关' }] } });
check('跨班学生登记被拒', badClass.status === 403 && badClass.json?.error === 'out_of_class', `${badClass.status} ${badClass.json?.error}`);

// 6. 登记总览（一组 = 一个班）
const grid = await call('recitation.grid', { token: T, qs: `&classId=${C1.id}&days=7` });
const g1 = (grid.json.groups || [])[0];
check('单班总览只回一个班', (grid.json.groups || []).length === 1 && g1?.classId === C1.id, String(grid.json?.error || grid.json?.groups?.length));
check('总览含本次清单', (g1?.lists || []).some((x) => x.id === listId), JSON.stringify(g1?.lists?.length));
check('总览格子有状态', (g1?.rows || []).some((r) => r.cells[listId] === '过关'), `${g1?.rows?.length} 行`);
check('总览只含本班在读学生', (g1?.rows || []).length === studying, `${g1?.rows?.length} 行 / 在读 ${studying}`);
check('总览下发打勾口径', grid.json.pass === '过关' && (grid.json.statuses || []).join(',') === '过关,待重背,延背,免背', JSON.stringify({ pass: grid.json.pass, st: grid.json.statuses }));
const crossGrid = await call('recitation.grid', { token: T, qs: `&classId=${C2.id}` });
check('越权班级总览被拒', crossGrid.status === 403, String(crossGrid.json?.error));

// 6b. 不传班级 = 全部任教班合并，每班各取最近 days 份
const allT = await call('recitation.grid', { token: T });
check('教师合并不越权', (allT.json.groups || []).length === 1 && allT.json.groups[0]?.classId === C1.id, JSON.stringify({ n: allT.json?.groups?.length, err: allT.json?.error }));
// 管理员给第二个班也发一份，合并视图才有两节可分
const extra = await call('recitation.save', {
  token: admin, body: { subjectId: YU.id, classIds: [C2.id], title: '《岳阳楼记》', part: '第五段', assignDate: '2026-09-25' },
});
const extraId = (extra.json.ids || [])[0];
const allA = await call('recitation.grid', { token: admin, qs: '&days=1' });
const names = (allA.json.groups || []).map((g) => g.className);
check('管理员合并按班分节', names.length === 2 && names[0] === C1.name && names[1] === C2.name, names.join('/'));
check('每班各取 days 份不互相挤掉', (allA.json.groups || []).every((g) => g.lists.length === 1), (allA.json.groups || []).map((g) => g.lists.length).join(','));
const c1All = (await call('recitation.list', { token: admin, qs: `&classId=${C1.id}` })).json.lists || [];
const newest = c1All.map((x) => x.assignDate).sort().at(-1);
const mergedC1 = (allA.json.groups || []).find((g) => g.classId === C1.id);
check('截断后留最新一份', mergedC1?.lists[0]?.assignDate === newest, `${mergedC1?.lists[0]?.assignDate} vs ${newest}`);
const mergedC2 = (allA.json.groups || []).find((g) => g.classId === C2.id);
check('合并里各班列互不混用', (mergedC1?.rows || []).every((r) => !(extraId in (r.cells || {}))) && mergedC2?.lists[0]?.id === extraId, JSON.stringify({ c1: Object.keys(mergedC1?.rows?.[0]?.cells || {}), c2: mergedC2?.lists?.map((l) => l.id) }));
const withLists = new Set(((await call('recitation.list', { token: admin })).json.lists || []).map((l) => l.classId));
check('无清单的班不进合并', (allA.json.groups || []).length === withLists.size, `${(allA.json.groups || []).length} 组 vs ${withLists.size} 班`);
await call('recitation.save', { token: admin, body: { id: extraId, delete: true } });
const emptyGrid = await call('recitation.grid', { token: admin, qs: `&classId=${C2.id}` });
check('单班查空班仍回一组空列，供前端出空态', (emptyGrid.json.groups || []).length === 1
  && emptyGrid.json.groups[0]?.classId === C2.id && !emptyGrid.json.groups[0]?.lists.length,
  JSON.stringify({ n: emptyGrid.json?.groups?.length, l: emptyGrid.json?.groups?.[0]?.lists?.length }));

// 7. 作业：管理员多班创建、无 part/attempt、独立状态集
const hw = await call('homework.save', {
  token: admin, body: { subjectId: YU.id, classIds: [C1.id, C2.id], title: '第 3 课课后练习', assignDate: '2026-09-22' },
});
check('管理员一次发两个班', hw.json?.ok === true && (hw.json.ids || []).length === 2, JSON.stringify(hw.json?.error || hw.json?.ids?.length));
const hwId = (hw.json.ids || [])[0];
const hwSheet = await call('homework.sheet', { token: admin, qs: `&listId=${hwId}` });
check('作业不带分段/计次', hwSheet.json?.hasPart === false && hwSheet.json?.hasAttempt === false && hwSheet.json?.hasPlan === false, JSON.stringify(hwSheet.json?.statuses));
check('作业状态集独立', hwSheet.json?.statuses?.join(',') === '已交,未交,补交,优秀,需订正', String(hwSheet.json?.statuses));
const badHwStatus = await call('homework.check', { token: admin, body: { listId: hwId, entries: [{ studentId: hwSheet.json.rows[0].studentId, status: '过关' }] } });
check('背诵状态不适用于作业', badHwStatus.status === 400 && badHwStatus.json?.error === 'invalid_choice', String(badHwStatus.json?.error));
await call('homework.check', { token: admin, body: { listId: hwId, entries: [{ studentId: hwSheet.json.rows[0].studentId, status: '未交', note: '缺第 2 题' }] } });
const hwRepeat = await call('homework.check', { token: admin, body: { listId: hwId, entries: [{ studentId: hwSheet.json.rows[0].studentId, status: '补交' }] } });
const hwRow = recOf(await call('homework.sheet', { token: admin, qs: `&listId=${hwId}` }), hwSheet.json.rows[0].studentId);
check('作业改状态无计次字段', hwRepeat.json?.ok === true && hwRow?.attempt === 1 && hwRow?.status === '补交', JSON.stringify(hwRow));

// 8. 批量导入（dryRun 预检 → 落库）
const importRows = (hwSheet.json.rows || []).slice(0, 3).map((r) => ({ studentNo: r.studentNo, status: '已交', checkDate: '2026-09-23' }));
importRows.push({ studentNo: 'NOPE0001', status: '已交' });
importRows.push({ studentNo: hwSheet.json.rows[0].studentNo, status: '乱填' });
const dry = await call('homework.import', { token: admin, body: { listId: hwId, rows: importRows, dryRun: true } });
check('导入预检逐行判定', dry.json?.ok === true && dry.json.invalid === 2 && dry.json.total === importRows.length
  && dry.json.created + dry.json.updated === 3, JSON.stringify({ c: dry.json?.created, u: dry.json?.updated, i: dry.json?.invalid, t: dry.json?.total }));
const real = await call('homework.import', { token: admin, body: { listId: hwId, rows: importRows, dryRun: false } });
check('导入只写有效行', real.json?.ok === true && real.json.created + real.json.updated === 3, JSON.stringify({ c: real.json?.created, u: real.json?.updated, s: real.json?.skipped }));
const hwSheet2 = await call('homework.sheet', { token: admin, qs: `&listId=${hwId}` });
check('导入后名单已刷新', (hwSheet2.json.rows || []).filter((r) => r.record?.status === '已交').length >= 2
  && recOf(hwSheet2, hwSheet.json.rows[0].studentId)?.status === '已交', JSON.stringify((hwSheet2.json.rows || []).slice(0, 3).map((r) => r.record?.status)));
const badImport = await call('homework.import', { token: T, body: { listId: hw.json.ids[1], rows: importRows.slice(0, 1), dryRun: false } });
check('越权清单导入被拒', badImport.status === 403, String(badImport.json?.error));

// 8b. 长表批量导入：一行一个学生，五列相同自动并成一份清单，可只建清单不登记
const sNo = (i) => hwSheet.json.rows[i].studentNo;
const bulkRows = [
  { className: C1.name, subjectName: YU.name, title: '批量作业A', assignDate: '2026-09-24', note: '单元练习', studentNo: sNo(0), status: '已交', checkDate: '2026-09-25', recordNote: '第 2 题空' },
  { className: C1.name, subjectName: YU.name, title: '批量作业A', assignDate: '2026-09-24', studentNo: sNo(1), status: '未交' },
  { className: C1.name, subjectName: YU.name, title: '批量作业B', assignDate: '2026-09-25' },
  { className: C2.name, subjectName: YU.name, title: '批量作业A', assignDate: '2026-09-24', studentNo: alien.student_no, status: '已交' },
  { className: C1.name, subjectName: MA.name, title: '批量作业A', assignDate: '2026-09-24', studentNo: sNo(0), status: '已交' },
  { className: C1.name, subjectName: YU.name, title: '批量作业A', assignDate: '2026-09-24', studentNo: sNo(0), status: '优秀' },
  { className: C1.name, subjectName: YU.name, title: '坏日期', assignDate: '2026/9/24', studentNo: sNo(0), status: '已交' },
  { className: C1.name, subjectName: YU.name, title: '批量作业B', assignDate: '2026-09-25', studentNo: sNo(2), status: '随便' },
  { className: C1.name, subjectName: YU.name, title: '批量作业B', assignDate: '2026-09-25', studentNo: 'NOPE0002', status: '已交' },
];
const line = (j) => new Map((j.json.items || []).map((x) => [x.line, x]));
const bulkDry = await call('homework.import-lists', { token: T, body: { rows: bulkRows, dryRun: true } });
const bd = line(bulkDry);
check('批量导入预检分组计数', bulkDry.json?.ok === true && bulkDry.json.total === 9 && bulkDry.json.created === 3 && bulkDry.json.invalid === 6,
  JSON.stringify({ t: bulkDry.json?.total, c: bulkDry.json?.created, i: bulkDry.json?.invalid, e: bulkDry.json?.error }));
check('越权班/科逐行拒绝', bd.get(4)?.errors.some((x) => x.code === 'out_of_scope') && bd.get(5)?.errors.some((x) => x.code === 'out_of_scope'),
  JSON.stringify([bd.get(4)?.errors, bd.get(5)?.errors]));
check('同清单同学号重复被标记', bd.get(6)?.errors.some((x) => x.code === 'duplicate_row'), JSON.stringify(bd.get(6)));
check('坏日期/非法状态/陌生学号分别标记', bd.get(7)?.errors.some((x) => x.code === 'invalid_date')
  && bd.get(8)?.errors.some((x) => x.code === 'invalid_choice') && bd.get(9)?.errors.some((x) => x.code === 'student_not_found'),
  JSON.stringify([bd.get(7)?.errors, bd.get(8)?.errors, bd.get(9)?.errors]));
check('只建清单的行也算新增', bd.get(3)?.action === 'create' && bd.get(3).ok === true, JSON.stringify(bd.get(3)));

const bulkReal = await call('homework.import-lists', { token: T, body: { rows: bulkRows, dryRun: false } });
check('批量导入只写有效行', bulkReal.json?.ok === true && bulkReal.json.created === 3, JSON.stringify({ c: bulkReal.json?.created, u: bulkReal.json?.updated, i: bulkReal.json?.invalid }));
const bulkLists = (await call('homework.list', { token: T })).json.lists || [];
const listA = bulkLists.find((x) => x.title === '批量作业A' && x.classId === C1.id);
const listB = bulkLists.find((x) => x.title === '批量作业B' && x.classId === C1.id);
check('一份清单含两名学生登记', !!listA && listA.counts?.已交 === 1 && listA.counts?.未交 === 1 && listA.total >= 2, JSON.stringify(listA && listA.counts));
check('只建清单的表没有登记', !!listB && Object.keys(listB.counts).length === 0, JSON.stringify(listB && listB.counts));
check('越权行没有建表', !bulkLists.some((x) => x.classId === C2.id && x.title === '批量作业A'), JSON.stringify(bulkLists.map((x) => x.className)));

const reImport = await call('homework.import-lists', { token: T, body: {
  rows: [{ className: C1.name, subjectName: YU.name, title: '批量作业A', assignDate: '2026-09-24', studentNo: sNo(1), status: '补交' }], dryRun: false } });
check('再次导入并入同一份清单', reImport.json?.updated === 1 && reImport.json?.created === 0, JSON.stringify(reImport.json?.items?.[0]));
const sheetA = await call('homework.sheet', { token: T, qs: `&listId=${listA.id}` });
check('并入后登记已覆盖', sheetA.json?.rows?.find((x) => x.studentNo === sNo(1))?.record?.status === '补交', JSON.stringify(sheetA.json?.rows?.slice(0, 2).map((x) => x.record?.status)));
check('清单备注不被改写', sheetA.json?.list?.note === '单元练习', String(sheetA.json?.list?.note));

const bulkRec = await call('recitation.import-lists', { token: T, body: { rows: [
  { className: C1.name, subjectName: YU.name, title: '批量背诵A', part: '第一段', assignDate: '2026-09-24', studentNo: sNo(0), status: '过关' },
  { className: C1.name, subjectName: YU.name, title: '批量背诵A', part: '第二段', assignDate: '2026-09-24', studentNo: sNo(0), status: '过关' },
], dryRun: false } });
const recLists = (await call('recitation.list', { token: T })).json.lists || [];
const recA = recLists.find((x) => x.title === '批量背诵A' && x.part === '第一段');
check('段落不同即为两份清单', bulkRec.json?.created === 2 && !!recA && recLists.some((x) => x.title === '批量背诵A' && x.part === '第二段'), String(recLists.filter((x) => x.title === '批量背诵A').length));
await call('recitation.import-lists', { token: T, body: { rows: [
  { className: C1.name, subjectName: YU.name, title: '批量背诵A', part: '第一段', assignDate: '2026-09-24', studentNo: sNo(0), status: '待重背' },
], dryRun: false } });
const recRow = (await call('recitation.sheet', { token: T, qs: `&listId=${recA.id}` })).json.rows?.find((x) => x.studentNo === sNo(0));
check('重新导入不改背诵次数', recRow?.record?.status === '待重背' && recRow?.record?.attempt === 1, JSON.stringify(recRow?.record));
const stuBulk = (await call('students.list', { token: admin, qs: `&classId=${C1.id}` })).json.students[0];
const adminBulk = await call('homework.import-lists', { token: admin, body: { rows: [
  { className: C2.name, subjectName: YU.name, title: '批量作业A', assignDate: '2026-09-24', studentNo: stuBulk.student_no, status: '已交' },
], dryRun: false } });
check('管理员可导全校班级但学号须属该班', adminBulk.json?.invalid === 1 && adminBulk.json?.items?.[0]?.errors?.[0]?.code === 'student_not_found',
  JSON.stringify(adminBulk.json?.items?.[0]));

// 9. 学生端只看本人（取有背诵过关记录的那位；roster[0] 的记录在第一步已被撤销）
const stu = roster[1];
const seedAcc = await call('accounts.seed-students', { token: admin, body: { classId: C1.id, initialPassword: 'Stu20260929' } });
check('批量开通本班学生账号', seedAcc.json?.ok === true && (seedAcc.json.created || []).length > 0, JSON.stringify({ created: seedAcc.json?.created?.length, skipped: seedAcc.json?.skipped?.length }));
const ST = await loginAndUnlock(stu.student_no, 'Stu20260929', 'Stu88001234');
const portal = await call('portal.me', { token: ST });
const recs = portal.json?.recitations || [];
const hws = portal.json?.homeworks || [];
check('学生端返回两类记录', Array.isArray(recs) && Array.isArray(hws) && recs.length > 0 && hws.length > 0, `背诵 ${recs.length} / 作业 ${hws.length}`);
check('学生只看到本人的登记', recs.length === 1 && recs.every((x) => x.title === '《岳阳楼记》' && x.status === '过关' && x.subjectName === '语文')
  && hws.every((x) => (x.title.startsWith('第 3 课课后练习') || x.title === '批量作业A') && x.subjectName === '语文'),
  JSON.stringify(recs[0] || {}) + ' / ' + JSON.stringify(hws.map((x) => x.title)));
check('学生端不含他人姓名', !JSON.stringify(portal.json).includes(alien.name), String(alien.name));
const denied = await call('recitation.list', { token: ST });
check('学生不能进登记接口', denied.status === 403, `${denied.status} ${denied.json?.error}`);
const deniedSave = await call('recitation.save', { token: ST, body: { subjectId: YU.id, classIds: [C1.id], title: '越权' } });
check('学生不能新建清单', deniedSave.status === 403, String(deniedSave.json?.error));

// 10. 清单删除与归属
const delOther = await call('homework.save', { token: T, body: { id: hw.json.ids[1], delete: true } });
check('教师删别班清单被拒', delOther.status === 403, `${delOther.status} ${delOther.json?.error}`);
const delWrong = await call('recitation.save', { token: T, body: { id: hwId, delete: true } });
check('跨类 id 删除被拒', delWrong.status === 403 || delWrong.status === 404, `${delWrong.status} ${delWrong.json?.error}`);
const del = await call('recitation.save', { token: T, body: { id: listId, delete: true } });
check('创建人可删自己的清单', del.json?.ok === true, String(del.json?.error));
const afterDel = await call('recitation.list', { token: T });
check('清单已从列表消失', !(afterDel.json.lists || []).some((x) => x.id === listId), String(afterDel.json?.lists?.length));
const gridAfter = await call('recitation.grid', { token: T, qs: `&classId=${C1.id}&days=14` });
const afterG1 = (gridAfter.json.groups || [])[0];
check('删除后登记不再出现', !(afterG1?.lists || []).some((x) => x.id === listId), JSON.stringify(afterG1?.lists?.length));
check('单班查询始终只回本班一组', (gridAfter.json.groups || []).length === 1 && afterG1?.classId === C1.id, JSON.stringify({ n: gridAfter.json?.groups?.length, lists: afterG1?.lists?.length }));
const orphan = await call('recitation.sheet', { token: T, qs: `&listId=${listId}` });
check('删除后清单不可读', orphan.status === 404, String(orphan.json?.error));

// 11. 修改清单元信息
const edit = await call('homework.save', { token: admin, body: { id: hwId, subjectId: YU.id, classIds: [C1.id], title: '第 3 课课后练习（订正版）', assignDate: '2026-09-22' } });
const edited = (await call('homework.list', { token: admin })).json.lists.find((x) => x.id === hwId);
check('清单可改名', edit.json?.ok === true && edited?.title === '第 3 课课后练习（订正版）', JSON.stringify({ e: edit.json?.error, t: edited?.title }));
check('改名不丢既有登记', edited?.passCount >= 0 && edited?.counts?.已交 >= 2, JSON.stringify(edited?.counts));

// 12. 清理，便于对同一实例重复跑
const acc = await call('accounts.list', { token: admin });
for (const a of (acc.json.accounts || []).filter((x) => ['daily_yw', roster[0].student_no, stu.student_no].includes(x.username))) {
  await call('accounts.delete', { token: admin, body: { id: a.id } });
}
await call('homework.save', { token: admin, body: { id: hwId, delete: true } });
await call('homework.save', { token: admin, body: { id: hw.json.ids[1], delete: true } });
for (const l of ((await call('homework.list', { token: admin })).json.lists || []).filter((x) => x.title.startsWith('批量作业'))) {
  await call('homework.save', { token: admin, body: { id: l.id, delete: true } });
}
for (const l of ((await call('recitation.list', { token: admin })).json.lists || []).filter((x) => x.title.startsWith('批量背诵'))) {
  await call('recitation.save', { token: admin, body: { id: l.id, delete: true } });
}
check('测试数据已清理', true);

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
