import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  GraduationCap, Plus, Trash2, DatabaseZap, ShieldCheck, Building2, KeyRound, UserRound,
  UserCog, Power, ListChecks, ChevronDown, Search, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, errorMessage } from "../api";
import { cn } from "@/lib/utils";
import {
  CardList, ClassDot, ConfirmButton, EmptyState, Field, FilterSelect, PageHeader, Panel, Pill, RowCard, SortHead,
  TableSkeleton, TotalCell, TotalRow, useMarkColors, useTableSort, type SelectOption,
} from "../components/app-ui";
import { ChangePasswordForm } from "../components/auth-screens";
import type { AccountRow, ClassRow, Me, Subject } from "../types";

const ROLE_LABEL: Record<string, string> = { ADMIN: "管理员", TEACHER: "教师", STUDENT: "学生" };
const ROLE_TONE: Record<string, "primary" | "info" | "success"> = { ADMIN: "primary", TEACHER: "info", STUDENT: "success" };

const GRADE_OPTIONS: SelectOption[] = ["高一", "高二", "高三"].map((g) => ({ value: g, label: g }));
const STAFF_ROLE_OPTIONS: SelectOption[] = [
  { value: "TEACHER", label: "教师" },
  { value: "ADMIN", label: "管理员" },
];
const ACCOUNT_ROLE_OPTIONS: SelectOption[] = [
  { value: "TEACHER", label: "教师" },
  { value: "ADMIN", label: "管理员" },
  { value: "STUDENT", label: "学生" },
];

const pairKey = (subjectId: string, classId: string) => `${subjectId}|${classId}`;
const toAssignments = (selected: Set<string>) =>
  [...selected].map((k) => { const i = k.indexOf("|"); return { subjectId: k.slice(0, i), classId: k.slice(i + 1) }; });

export default function SettingsPage({ isAdmin, me, onMeChanged }: {
  isAdmin: boolean; me: Me | null; onMeChanged: (next: Me) => void;
}) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [newClass, setNewClass] = useState({ name: "", grade: "高一" });
  const [staff, setStaff] = useState({ username: "", displayName: "", role: "TEACHER", password: "" });
  const [staffPairs, setStaffPairs] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [editPairs, setEditPairs] = useState<Set<string>>(new Set());
  const [seedForm, setSeedForm] = useState({ classId: "", initialPassword: "" });
  const [resetFor, setResetFor] = useState<AccountRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cl, rd] = await Promise.all([
        apiGet<{ classes: ClassRow[] }>("classes.list"),
        apiGet<{ subjects: Subject[] }>("refdata"),
      ]);
      setClasses(cl.classes);
      setSubjects(rd.subjects);
      if (isAdmin) setAccounts((await apiGet<{ accounts: AccountRow[] }>("accounts.list")).accounts);
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  }, [isAdmin]);
  useEffect(() => { void load(); }, [load]);

  const run = async (action: string, body: unknown, msg: string) => {
    setBusy(true);
    try { await apiPost(action, body); toast.success(msg); void load(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const seed = async () => {
    await run("demo.seed", {}, "演示数据导入完成");
  };

  const seedStudents = async () => {
    if (!seedForm.initialPassword) { toast.error("请先填写学生账号的初始密码"); return; }
    const r = await apiPost<{ created: string[]; skipped: string[]; invalid: string[]; truncated: boolean }>(
      "accounts.seed-students", { classId: seedForm.classId || undefined, initialPassword: seedForm.initialPassword });
    toast.success(`已开通 ${r.created.length} 个学生账号`, {
      description: `跳过已有账号 ${r.skipped.length} 个${r.invalid.length ? ` · 学号不可用作账号 ${r.invalid.length} 个` : ""}${r.truncated ? " · 单次上限 200，请分批开通" : ""}`,
    });
    setSeedForm({ ...seedForm, initialPassword: "" });
    void load();
  };

  const addStaff = () => {
    if (!staff.username || !staff.displayName || !staff.password) { toast.error("请填写账号、姓名与初始密码"); return; }
    if (staff.role === "TEACHER" && !staffPairs.size) { toast.error("教师账号请至少勾选一项任教科目与班级"); return; }
    void run("accounts.save", {
      ...staff,
      assignments: staff.role === "TEACHER" ? toAssignments(staffPairs) : [],
    }, staff.role === "ADMIN" ? "管理员账号已创建" : "教师账号已创建");
    setStaff({ ...staff, username: "", displayName: "", password: "" });
    setStaffPairs(new Set());
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await apiPost("accounts.save", {
        id: editing.id, username: editing.username, displayName: editing.displayName,
        role: editing.role, studentId: editing.studentId, assignments: toAssignments(editPairs),
      });
      toast.success(editPairs.size ? "任教范围已更新" : "已收回该教师的全部任教范围");
      setEditing(null);
      void load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const colorOf = useMarkColors(classes.map((c) => c.name));

  // 表头点击排序：班级与账号各一份状态，未点时保持后端原序；窄屏卡片跟表格用同一份顺序
  const { sorted: shownClasses, sort: classSort, toggle: toggleClassSort } = useTableSort(classes, {
    name: (c) => c.name,
    grade: (c) => c.grade,
    students: (c) => c.studentCount,
  });
  const { sorted: shownAccounts, sort: accSort, toggle: toggleAccSort } = useTableSort(accounts, {
    account: (a) => a.displayName || a.username,
    role: (a) => ROLE_LABEL[a.role] ?? a.role,
    student: (a) => a.studentName,
    // 前缀数字是为了按严重程度排：正常 → 锁定 → 待改密码 → 停用
    status: (a) => (a.status !== "active" ? "3 停用" : a.mustChange ? "2 待改密码" : a.lockedUntil ? "1 锁定" : "0 正常"),
    login: (a) => a.lastLoginAt ?? "",
  });

  return (
    <div className="page-in space-y-4">
      <PageHeader title="系统设置" eyebrow="后台维护" description="维护班级、登录账号与初始化演示数据。" />

      <Panel
        title="班级管理"
        description={isAdmin ? "创建或删除班级；班级下还有学生时不能删除。" : "仅管理员可以增删班级。"}
        action={<Badge variant="secondary" className="font-normal">{classes.length} 个班级</Badge>}
        contentClassName="space-y-3 p-3 md:p-4"
      >
        {isAdmin && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="班级名称" htmlFor="new-class-name" className="w-full sm:w-52">
              <Input id="new-class-name" placeholder="如 高一(4)班" value={newClass.name}
                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })} />
            </Field>
            <Field label="年级" className="w-full sm:w-36">
              <FilterSelect value={newClass.grade} onChange={(v) => setNewClass({ ...newClass, grade: v })} options={GRADE_OPTIONS} ariaLabel="年级" className="w-full" />
            </Field>
            <Button size="sm" className="max-md:w-full max-md:min-h-11" disabled={busy} onClick={() => { if (!newClass.name) { toast.error("请填写班级名"); return; } void run("classes.save", newClass, "班级已创建"); setNewClass({ ...newClass, name: "" }); }}>
              <Plus /> 新建班级
            </Button>
          </div>
        )}
        {loading ? <TableSkeleton rows={4} cols={3} /> : !classes.length ? (
          <EmptyState icon={Building2} title="还没有班级" description={isAdmin ? "先创建一个班级，学生档案才能归属到班。" : "请联系管理员创建班级。"} />
        ) : (
          <>
            <CardList className="md:hidden">
              {shownClasses.map((c) => (
                <RowCard
                  key={c.id}
                  title={c.name}
                  subtitle={c.grade}
                  right={<span className="text-sm"><span className="font-semibold tabular-nums">{c.studentCount}</span> 人</span>}
                  actions={isAdmin ? (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={busy}
                      onClick={() => void run("classes.delete", { id: c.id }, "班级已删除")}>
                      <Trash2 className="size-4" /> 删除班级
                    </Button>
                  ) : undefined}
                />
              ))}
            </CardList>
            <div className="hidden overflow-x-auto md:block">
              <Table className="data-table">
                <TableHeader>
                  <TableRow>
                    <SortHead label="班级" col="name" sort={classSort} onSort={toggleClassSort} />
                    <SortHead label="年级" col="grade" sort={classSort} onSort={toggleClassSort} />
                    <SortHead label="人数" col="students" sort={classSort} onSort={toggleClassSort} />
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shownClasses.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          <ClassDot color={colorOf(c.name)} />
                          {c.name}
                        </span>
                      </TableCell>
                      <TableCell>{c.grade}</TableCell>
                      <TableCell><span className="tabular-nums">{c.studentCount}</span> 人</TableCell>
                      <TableCell className="text-right">
                        {isAdmin && (
                          <Button size="icon-xs" variant="ghost" className="size-7 text-destructive" aria-label="删除班级" disabled={busy}
                            onClick={() => void run("classes.delete", { id: c.id }, "班级已删除")}><Trash2 className="size-4" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TotalRow>
                  <TotalCell note colSpan={4}>
                    共 {shownClasses.length} 个班级 · 在册 {shownClasses.reduce((n, c) => n + c.studentCount, 0)} 人
                  </TotalCell>
                </TotalRow>
              </Table>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="登录账号"
        description="教师账号开通时要勾选任教科目与班级，未勾选的科目他看不到也录不了；学生账号用「批量开通学生账号」按学号创建。初始密码首次登录必须修改。"
        action={<Badge variant="secondary" className="font-normal">{accounts.length} 个账号</Badge>}
        contentClassName="space-y-3 p-4"
      >
        {!isAdmin ? (
          <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3.5 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">仅管理员可管理账号。当前登录身份：{me?.displayName ?? "教师"}（{ROLE_LABEL[me?.role ?? "TEACHER"]}）。</p>
          </div>
        ) : (
          <>
            <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
              <Field label="账号" htmlFor="new-account">
                <Input id="new-account" placeholder="如 teacher_li" value={staff.username}
                  onChange={(e) => setStaff({ ...staff, username: e.target.value })} />
              </Field>
              <Field label="姓名" htmlFor="new-name">
                <Input id="new-name" placeholder="如 李老师" value={staff.displayName}
                  onChange={(e) => setStaff({ ...staff, displayName: e.target.value })} />
              </Field>
              <Field label="角色">
                <FilterSelect value={staff.role} onChange={(v) => setStaff({ ...staff, role: v })} options={STAFF_ROLE_OPTIONS} ariaLabel="新建账号角色" className="w-full" />
              </Field>
              <Field label="初始密码" htmlFor="new-pw">
                <Input id="new-pw" type="text" placeholder="8 位以上，含字母数字" value={staff.password}
                  onChange={(e) => setStaff({ ...staff, password: e.target.value })} />
              </Field>
              <Button size="sm" className="max-md:w-full max-md:min-h-11" disabled={busy} onClick={addStaff}><Plus /> 开通账号</Button>
            </div>

            {staff.role === "TEACHER" && (
              <div className="space-y-2.5 rounded-xl border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">任教科目与班级 · 下拉按科目分组勾选，支持搜索</Label>
                  <span className="text-xs text-muted-foreground">已选 <span className="tabular-nums">{staffPairs.size}</span> 项</span>
                </div>
                <AssignmentPicker subjects={subjects} classes={classes} selected={staffPairs} onChange={setStaffPairs} colorOf={colorOf} />
              </div>
            )}

            <div className="rounded-xl border bg-muted/40 p-3">
              <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Field label="开通范围">
                  <FilterSelect value={seedForm.classId} onChange={(v) => setSeedForm({ ...seedForm, classId: v })}
                    options={classes.map((c) => ({ value: c.id, label: c.name }))} allLabel="全部班级" ariaLabel="开通范围" className="w-full" />
                </Field>
                <Field label="学生初始密码" htmlFor="seed-pw">
                  <Input id="seed-pw" type="text" placeholder="如 Sx20260000" value={seedForm.initialPassword}
                    onChange={(e) => setSeedForm({ ...seedForm, initialPassword: e.target.value })} />
                </Field>
                <ConfirmButton variant="outline" confirmLabel="开始开通" tone="default" busy={busy}
                  className="max-md:w-full max-md:min-h-11"
                  title="批量开通学生账号"
                  description={`将为${seedForm.classId ? classes.find((c) => c.id === seedForm.classId)?.name ?? "所选班级" : "全部班级"}在读且尚未开通账号的学生创建账号：用户名为学号，初始密码统一，首次登录需修改。`}
                  onConfirm={() => void seedStudents()}>
                  <UserRound /> 批量开通学生账号
                </ConfirmButton>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                账号即学号，学生首次登录会被要求改成自己的密码。
              </p>
            </div>

            {loading ? <TableSkeleton rows={5} cols={4} /> : !accounts.length ? (
              <EmptyState icon={UserCog} title="还没有账号" description="至少保留当前管理员账号，教师与学生账号可在上方开通。" />
            ) : (
              <>
                <CardList className="md:hidden">
                  {shownAccounts.map((a) => (
                    <RowCard
                      key={a.id}
                      leading={
                        <Avatar className="size-9"><AvatarFallback className="text-xs">{(a.displayName || "?").slice(0, 1)}</AvatarFallback></Avatar>
                      }
                      title={
                        <span className="flex items-center gap-1.5">
                          {a.displayName}
                          {a.id === me?.id ? <Badge variant="outline" className="font-normal">我</Badge> : null}
                        </span>
                      }
                      subtitle={<span className="font-mono">{a.username}</span>}
                      right={
                        a.id === me?.id ? (
                          <Pill tone={ROLE_TONE[a.role]}>{ROLE_LABEL[a.role]}</Pill>
                        ) : (
                          <FilterSelect value={a.role} size="sm" ariaLabel={`${a.username} 的角色`} className="w-24"
                            options={ACCOUNT_ROLE_OPTIONS} disabled={busy}
                            onChange={(v) => void run("accounts.save", {
                              id: a.id, username: a.username, displayName: a.displayName, role: v, studentId: a.studentId,
                            }, "角色已更新")} />
                        )
                      }
                      meta={
                        <>
                          {a.status !== "active" ? <Pill tone="danger">已停用</Pill>
                            : a.mustChange ? <Pill tone="warning">待改初始密码</Pill>
                            : a.lockedUntil ? <Pill tone="danger">锁定至 {a.lockedUntil.slice(11, 16)}</Pill>
                            : <Pill tone="success">正常</Pill>}
                          <span>{a.studentName ? `${a.studentName} · ${a.className}（${a.studentNo}）` : "未关联学生"}</span>
                          <span className="tabular-nums">{a.lastLoginAt ? a.lastLoginAt.slice(0, 10) : "从未登录"}</span>
                        </>
                      }
                      children={a.role === "TEACHER" ? (
                        <div className="flex items-start gap-1.5 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                          {!a.assignments.length ? <Pill tone="warning">未分配任教范围</Pill> : (
                            <span className="min-w-0">
                              <span className="text-foreground">{a.subjectNames.join("、")}</span>
                              {" · "}
                              {a.classNames.map((n, i) => (
                                <span key={n} className="inline-flex items-center gap-1 align-middle">
                                  {i > 0 ? "、" : ""}<ClassDot color={colorOf(n)} />{n}
                                </span>
                              ))}
                            </span>
                          )}
                          <Button size="icon-xs" variant="ghost" className="ml-auto size-8 shrink-0 max-md:size-11" aria-label="调整任教范围" disabled={busy}
                            onClick={() => { setEditing(a); setEditPairs(new Set(a.assignments.map((x) => pairKey(x.subjectId, x.classId)))); }}>
                            <ListChecks className="size-4" />
                          </Button>
                        </div>
                      ) : undefined}
                      actions={
                        <>
                          <Button size="sm" variant="ghost" aria-label="重置密码" disabled={busy}
                            onClick={() => setResetFor(a)}><KeyRound className="size-4" /> 重置密码</Button>
                          <Button size="sm" variant="ghost" aria-label={a.status === "active" ? "停用账号" : "启用账号"} disabled={busy}
                            onClick={() => void run("accounts.status", { id: a.id, status: a.status === "active" ? "disabled" : "active" }, a.status === "active" ? "账号已停用" : "账号已启用")}>
                            <Power className="size-4" /> {a.status === "active" ? "停用" : "启用"}
                          </Button>
                          <ConfirmButton variant="ghost" size="sm" className="ml-auto text-destructive" ariaLabel="删除账号" busy={busy}
                            title="删除账号" confirmLabel="确认删除"
                            description={<>确定删除账号 {a.username}（{a.displayName}）？该账号的登录会话会一并失效，学生档案与成绩不受影响。</>}
                            onConfirm={() => void run("accounts.delete", { id: a.id }, "账号已删除")}>
                            <Trash2 className="size-4" /> 删除
                          </ConfirmButton>
                        </>
                      }
                    />
                  ))}
                </CardList>
                <div className="hidden overflow-x-auto md:block">
                  <Table className="data-table">
                  <TableHeader>
                    <TableRow>
                      <SortHead label="账号" col="account" sort={accSort} onSort={toggleAccSort} />
                      <SortHead label="角色" col="role" sort={accSort} onSort={toggleAccSort} />
                      <TableHead className="hidden lg:table-cell">任教范围</TableHead>
                      <SortHead label="关联学生" col="student" sort={accSort} onSort={toggleAccSort} />
                      <SortHead label="状态" col="status" sort={accSort} onSort={toggleAccSort} />
                      <SortHead label="最近登录" col="login" sort={accSort} onSort={toggleAccSort} title="点击按最近登录时间排序（升 → 降 → 还原）" />
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shownAccounts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="size-7"><AvatarFallback className="text-[11px]">{(a.displayName || "?").slice(0, 1)}</AvatarFallback></Avatar>
                            <div className="min-w-0 text-left">
                              <p className="truncate font-medium">{a.displayName}</p>
                              <p className="truncate font-mono text-[11px] text-muted-foreground">{a.username}</p>
                            </div>
                            {a.id === me?.id ? <Badge variant="outline" className="font-normal">我</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right md:text-left">
                          {a.id === me?.id ? (
                            <Pill tone={ROLE_TONE[a.role]}>{ROLE_LABEL[a.role]}</Pill>
                          ) : (
                            <FilterSelect value={a.role} size="sm" ariaLabel={`${a.username} 的角色`} className="w-28"
                              options={ACCOUNT_ROLE_OPTIONS} disabled={busy}
                              onChange={(v) => void run("accounts.save", {
                                id: a.id, username: a.username, displayName: a.displayName, role: v, studentId: a.studentId,
                              }, "角色已更新")} />
                          )}
                        </TableCell>
                        <TableCell className="hidden text-xs lg:table-cell">
                          {a.role !== "TEACHER" ? <span className="text-muted-foreground">—</span> : (
                            <div className="flex items-center gap-1.5">
                              {!a.assignments.length ? <Pill tone="warning">未分配</Pill> : (
                                <span className="min-w-0 text-muted-foreground">
                                  <span className="text-foreground">{a.subjectNames.join("、")}</span>
                                  {" · "}
                                  {a.classNames.map((n, i) => (
                                    <span key={n} className="inline-flex items-center gap-1 align-middle">
                                      {i > 0 ? "、" : ""}<ClassDot color={colorOf(n)} />{n}
                                    </span>
                                  ))}
                                </span>
                              )}
                              <Button size="icon-xs" variant="ghost" className="size-7 shrink-0" aria-label="调整任教范围" disabled={busy}
                                onClick={() => { setEditing(a); setEditPairs(new Set(a.assignments.map((x) => pairKey(x.subjectId, x.classId)))); }}>
                                <ListChecks className="size-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {a.studentName ? `${a.studentName} · ${a.className}（${a.studentNo}）` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right md:text-left">
                          {a.status !== "active" ? <Pill tone="danger">已停用</Pill>
                            : a.mustChange ? <Pill tone="warning">待改初始密码</Pill>
                            : a.lockedUntil ? <Pill tone="danger">锁定至 {a.lockedUntil.slice(11, 16)}</Pill>
                            : <Pill tone="success">正常</Pill>}
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                          {a.lastLoginAt ? a.lastLoginAt.slice(0, 10) : "从未登录"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" aria-label="重置密码" disabled={busy}
                              onClick={() => setResetFor(a)}><KeyRound className="size-4" /></Button>
                            <Button size="sm" variant="ghost" aria-label={a.status === "active" ? "停用账号" : "启用账号"} disabled={busy}
                              onClick={() => void run("accounts.status", { id: a.id, status: a.status === "active" ? "disabled" : "active" }, a.status === "active" ? "账号已停用" : "账号已启用")}>
                              <Power className="size-4" />
                            </Button>
                            <ConfirmButton variant="ghost" size="sm" className="text-destructive" ariaLabel="删除账号" busy={busy}
                              title="删除账号" confirmLabel="确认删除"
                              description={<>确定删除账号 {a.username}（{a.displayName}）？该账号的登录会话会一并失效，学生档案与成绩不受影响。</>}
                              onConfirm={() => void run("accounts.delete", { id: a.id }, "账号已删除")}>
                              <Trash2 className="size-4" />
                            </ConfirmButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TotalRow>
                    <TotalCell note colSpan={7}>
                      共 {shownAccounts.length} 个账号 · 管理员 {shownAccounts.filter((a) => a.role === "ADMIN").length} ·
                      教师 {shownAccounts.filter((a) => a.role === "TEACHER").length} ·
                      学生 {shownAccounts.filter((a) => a.role === "STUDENT").length} ·
                      已停用 {shownAccounts.filter((a) => a.status !== "active").length}
                    </TotalCell>
                  </TotalRow>
                </Table>
              </div>
              </>
            )}
          </>
        )}
      </Panel>

      <Panel title="我的密码" description="修改后其他设备上的登录会失效，本设备继续可用。" contentClassName="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm">{me ? `${me.displayName} · ${me.username}` : "当前账号"}</p>
            <p className="text-xs text-muted-foreground">口令使用 PBKDF2-SHA256 加盐存储，服务端不保存明文密码。</p>
          </div>
          <Dialog>
            <DialogTrigger asChild><Button variant="outline">修改密码</Button></DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>修改密码</DialogTitle>
                <DialogDescription>新密码需 8-64 位，同时包含字母和数字。</DialogDescription>
              </DialogHeader>
              <ChangePasswordForm username={me?.username ?? ""} onDone={(next) => { onMeChanged(next); toast.success("密码已更新"); }} />
            </DialogContent>
          </Dialog>
        </div>
      </Panel>

      {isAdmin && (
        <Panel title="演示数据" description="一键导入与本地演示版一致的样例数据，便于快速体验系统。" contentClassName="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><DatabaseZap className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">3 个班级 · 15 名学生 · 9 门科目 · 3 场考试成绩</p>
              <p className="text-xs text-muted-foreground">仅在系统完全为空时可导入，不会覆盖已有数据。</p>
            </div>
            <ConfirmButton variant="outline" confirmLabel="开始导入" tone="default" busy={busy}
              title="导入演示数据"
              description="将导入一套完整的演示数据（3 个班级、15 名学生及 3 场考试的成绩）。仅在系统完全为空时可用，不会覆盖已有数据。"
              onConfirm={() => void seed()}>
              导入演示数据
            </ConfirmButton>
          </div>
        </Panel>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>任教范围 · {editing?.displayName}</DialogTitle>
            <DialogDescription>
              勾选决定这位老师能看见和录入哪些科目在哪些班级的成绩；未勾选的科目不会出现在他的成绩页与看板。
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <>
              <AssignmentPicker subjects={subjects} classes={classes} selected={editPairs} onChange={setEditPairs} colorOf={colorOf} />
              <p className="text-xs text-muted-foreground">全部取消即为收回任教权限。</p>
            </>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button disabled={busy} onClick={() => void saveEdit()}>保存任教范围</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetFor} onOpenChange={(o) => { if (!o) setResetFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重置 {resetFor?.displayName} 的密码</DialogTitle>
            <DialogDescription>设置新的初始密码后，该账号需要重新登录并修改密码。</DialogDescription>
          </DialogHeader>
          {resetFor ? (
            <ResetPasswordForm username={resetFor.username} busy={busy}
              onSubmit={(password) => {
                void run("accounts.save", {
                  id: resetFor.id, username: resetFor.username, displayName: resetFor.displayName,
                  role: resetFor.role, studentId: resetFor.studentId, password,
                }, "密码已重置");
                setResetFor(null);
              }} />
          ) : null}
        </DialogContent>
      </Dialog>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-muted-foreground">
        <GraduationCap className="size-3.5" /> 所有数据存放在本站专有数据库中，仅与本站账号体系配合使用。
      </p>
    </div>
  );
}

function ResetPasswordForm({ username, busy, onSubmit }: {
  username: string; busy: boolean; onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  return (
    <form className="space-y-3.5" onSubmit={(e) => {
      e.preventDefault();
      if (!password) { setError("请填写新密码"); return; }
      if (password !== again) { setError("两次输入不一致"); return; }
      onSubmit(password);
    }}>
      <div className="space-y-1.5">
        <Label htmlFor="reset-pw" className="text-xs text-muted-foreground">新初始密码</Label>
        <Input id="reset-pw" type="text" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-pw-again" className="text-xs text-muted-foreground">再输一次</Label>
        <Input id="reset-pw-again" type="text" value={again} onChange={(e) => setAgain(e.target.value)} />
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <DialogFooter>
        <p className="mr-auto text-xs text-muted-foreground">账号 {username} 下次登录需修改该密码。</p>
        <Button type="submit" disabled={busy}>确认重置</Button>
      </DialogFooter>
    </form>
  );
}

/** 任教授权：按科目分组的可搜索多选下拉，收起后以可移除 chips 摘要 */
function AssignmentPicker({ subjects, classes, selected, onChange, colorOf }: {
  subjects: Subject[];
  classes: ClassRow[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  colorOf: (name: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const toggle = (k: string) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange(next);
  };
  const toggleGroup = (subjectId: string, rows: ClassRow[]) => {
    const keys = rows.map((c) => pairKey(subjectId, c.id));
    const full = keys.every((k) => selected.has(k));
    const next = new Set(selected);
    keys.forEach((k) => (full ? next.delete(k) : next.add(k)));
    onChange(next);
  };

  const term = query.trim().toLowerCase();
  const groups = subjects
    .map((s) => ({
      subject: s,
      rows: !term || s.name.toLowerCase().includes(term) ? classes : classes.filter((c) => c.name.toLowerCase().includes(term)),
    }))
    .filter((g) => g.rows.length > 0);

  const pairs = [...selected];
  const labelOf = (k: string) => {
    const i = k.indexOf("|");
    const s = subjectById.get(k.slice(0, i));
    const c = classById.get(k.slice(i + 1));
    return s && c ? `${s.name}·${c.name}` : null;
  };
  const summary = (() => {
    if (!pairs.length) return null;
    const first = labelOf(pairs[0]);
    if (!first) return `已选 ${pairs.length} 组`;
    return pairs.length === 1 ? first : `${first} 等 ${pairs.length} 项`;
  })();

  if (!subjects.length || !classes.length) {
    return (
      <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
        授权需要科目与班级都存在：科目随演示数据导入，班级请在上方「班级管理」创建。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className={cn("w-full max-w-md justify-between gap-2 font-normal", !summary && "text-muted-foreground")}>
            <span className="truncate text-left">{summary ?? "选择任教科目与班级"}</span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(26rem,92vw)] gap-0 p-0">
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute left-4.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="搜索科目或班级"
              className="h-8 border-0 pl-8 text-sm shadow-none focus-visible:ring-0"
              aria-label="搜索任教科目或班级"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5">
            {!groups.length ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">没有匹配的科目或班级</p>
            ) : groups.map(({ subject, rows }) => {
              const hit = rows.filter((c) => selected.has(pairKey(subject.id, c.id))).length;
              const full = hit === rows.length;
              return (
                <div key={subject.id} className="mb-1.5 last:mb-0">
                  <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1">
                    <span className="text-xs font-medium">{subject.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] tabular-nums text-muted-foreground">{hit}/{rows.length}</span>
                      <Button type="button" size="xs" variant="ghost" onClick={() => toggleGroup(subject.id, rows)}>
                        {full ? "取消本组" : "全选本组"}
                      </Button>
                    </div>
                  </div>
                  {rows.map((c) => {
                    const k = pairKey(subject.id, c.id);
                    const boxId = `assign-${k.replace("|", "-")}`;
                    return (
                      <label key={c.id} htmlFor={boxId}
                        className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition", selected.has(k) ? "bg-primary/8" : "hover:bg-muted/60")}>
                        <Checkbox id={boxId} checked={selected.has(k)} onCheckedChange={() => toggle(k)}
                          aria-label={`${subject.name} 在 ${c.name} 的任教权限`} />
                        <span className="flex items-center gap-1.5"><ClassDot color={colorOf(c.name)} />{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 border-t px-2.5 py-1.5 text-xs text-muted-foreground">
            <span>已选 <span className="tabular-nums text-foreground">{pairs.length}</span> 组</span>
            <Button type="button" size="xs" variant="ghost" onClick={() => onChange(new Set())} disabled={!pairs.length}>清空全部</Button>
          </div>
        </PopoverContent>
      </Popover>

      {!!pairs.length && (
        <div className="flex flex-wrap gap-1.5">
          {pairs.map((k) => {
            const label = labelOf(k);
            if (!label) return null;
            return (
              <span key={k} className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pl-2 pr-1 text-xs">
                {label}
                <button type="button" onClick={() => toggle(k)} aria-label={`移除 ${label}`}
                  className="grid size-4 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive">
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
