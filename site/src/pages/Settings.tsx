import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  GraduationCap, Plus, Trash2, DatabaseZap, ShieldCheck, Building2, KeyRound, UserRound,
  UserCog, Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, errorMessage } from "../api";
import { EmptyState, PageHeader, Panel, Pill } from "../components/app-ui";
import { ChangePasswordForm } from "../components/auth-screens";
import type { AccountRow, ClassRow, Me } from "../types";

const ROLE_LABEL: Record<string, string> = { ADMIN: "管理员", TEACHER: "教师", STUDENT: "学生" };
const ROLE_TONE: Record<string, "primary" | "info" | "success"> = { ADMIN: "primary", TEACHER: "info", STUDENT: "success" };

export default function SettingsPage({ isAdmin, me, onMeChanged }: {
  isAdmin: boolean; me: Me | null; onMeChanged: (next: Me) => void;
}) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [newClass, setNewClass] = useState({ name: "", grade: "高一" });
  const [staff, setStaff] = useState({ username: "", displayName: "", role: "TEACHER", password: "" });
  const [seedForm, setSeedForm] = useState({ classId: "", initialPassword: "" });
  const [resetFor, setResetFor] = useState<AccountRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setClasses((await apiGet<{ classes: ClassRow[] }>("classes.list")).classes);
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
    if (!confirm("将导入一套完整的演示数据（3 个班级、15 名学生及成绩/出勤/奖惩/活动/评语）。仅在系统为空时可用。继续？")) return;
    await run("demo.seed", {}, "演示数据导入完成");
  };

  const seedStudents = async () => {
    if (!seedForm.initialPassword) { toast.error("请先填写学生账号的初始密码"); return; }
    if (!confirm(`将为在读且尚未开通账号的学生批量创建账号（用户名为学号，初始密码统一，首次登录需修改）。继续？`)) return;
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
    void run("accounts.save", staff, staff.role === "ADMIN" ? "管理员账号已创建" : "教师账号已创建");
    setStaff({ ...staff, username: "", displayName: "", password: "" });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="系统设置" description="维护班级、登录账号与初始化演示数据。" />

      <Panel
        title="班级管理"
        description={isAdmin ? "创建或删除班级；班级下还有学生时不能删除。" : "仅管理员可以增删班级。"}
        action={<Badge variant="secondary" className="font-normal">{classes.length} 个班级</Badge>}
        contentClassName="space-y-3 p-4"
      >
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Input placeholder="班级名，如 高一(4)班" value={newClass.name} onChange={(e) => setNewClass({ ...newClass, name: e.target.value })} className="h-9 w-full sm:w-52" />
            <NativeSelect value={newClass.grade} onChange={(e) => setNewClass({ ...newClass, grade: e.target.value })} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="年级">
              {["高一", "高二", "高三"].map((g) => <NativeSelectOption key={g} value={g}>{g}</NativeSelectOption>)}
            </NativeSelect>
            <Button size="sm" disabled={busy} onClick={() => { if (!newClass.name) { toast.error("请填写班级名"); return; } void run("classes.save", newClass, "班级已创建"); setNewClass({ ...newClass, name: "" }); }}>
              <Plus /> 新建班级
            </Button>
          </div>
        )}
        {loading ? <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p> : !classes.length ? (
          <EmptyState icon={Building2} title="还没有班级" description={isAdmin ? "先创建一个班级，学生档案才能归属到班。" : "请联系管理员创建班级。"} />
        ) : (
          <div className="overflow-x-auto">
            <Table className="responsive-table">
              <TableHeader><TableRow><TableHead>班级</TableHead><TableHead>年级</TableHead><TableHead>人数</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {classes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell data-label="班级" className="font-medium">{c.name}</TableCell>
                    <TableCell data-label="年级">{c.grade}</TableCell>
                    <TableCell data-label="人数"><span className="tabular-nums">{c.studentCount}</span> 人</TableCell>
                    <TableCell data-label="操作" className="text-right">
                      {isAdmin && (
                        <Button size="sm" variant="ghost" className="text-destructive" aria-label="删除班级" disabled={busy}
                          onClick={() => void run("classes.delete", { id: c.id }, "班级已删除")}><Trash2 className="size-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Panel
        title="登录账号"
        description="教师与管理员由管理员在此开通；学生账号用「批量开通学生账号」按学号创建。初始密码首次登录必须修改。"
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
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="new-account" className="text-xs text-muted-foreground">账号</Label>
                <Input id="new-account" placeholder="如 teacher_li" value={staff.username} className="h-9 w-40"
                  onChange={(e) => setStaff({ ...staff, username: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-name" className="text-xs text-muted-foreground">姓名</Label>
                <Input id="new-name" placeholder="如 李老师" value={staff.displayName} className="h-9 w-32"
                  onChange={(e) => setStaff({ ...staff, displayName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">角色</Label>
                <NativeSelect value={staff.role} className="h-9 rounded-lg border bg-background px-2 text-sm"
                  onChange={(e) => setStaff({ ...staff, role: e.target.value })}>
                  <NativeSelectOption value="TEACHER">教师</NativeSelectOption>
                  <NativeSelectOption value="ADMIN">管理员</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-pw" className="text-xs text-muted-foreground">初始密码</Label>
                <Input id="new-pw" type="text" placeholder="8 位以上，含字母数字" value={staff.password} className="h-9 w-44"
                  onChange={(e) => setStaff({ ...staff, password: e.target.value })} />
              </div>
              <Button size="sm" disabled={busy} onClick={addStaff}><Plus /> 开通账号</Button>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/40 p-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">范围</Label>
                <NativeSelect value={seedForm.classId} className="h-9 rounded-lg border bg-background px-2 text-sm"
                  onChange={(e) => setSeedForm({ ...seedForm, classId: e.target.value })}>
                  <NativeSelectOption value="">全部班级</NativeSelectOption>
                  {classes.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="seed-pw" className="text-xs text-muted-foreground">学生初始密码</Label>
                <Input id="seed-pw" type="text" placeholder="如 Sx20260000" value={seedForm.initialPassword} className="h-9 w-44"
                  onChange={(e) => setSeedForm({ ...seedForm, initialPassword: e.target.value })} />
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void seedStudents()}>
                <UserRound /> 批量开通学生账号
              </Button>
              <p className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1">
                账号即学号，学生首次登录会被要求改成自己的密码。
              </p>
            </div>

            {loading ? <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p> : !accounts.length ? (
              <EmptyState icon={UserCog} title="还没有账号" description="至少保留当前管理员账号，教师与学生账号可在上方开通。" />
            ) : (
              <div className="overflow-x-auto">
                <Table className="responsive-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>账号</TableHead><TableHead>角色</TableHead><TableHead>关联学生</TableHead>
                      <TableHead>状态</TableHead><TableHead className="hidden md:table-cell">最近登录</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell data-label="账号">
                          <div className="flex items-center gap-2">
                            <Avatar className="size-7"><AvatarFallback className="text-[11px]">{(a.displayName || "?").slice(0, 1)}</AvatarFallback></Avatar>
                            <div className="min-w-0 text-left">
                              <p className="truncate font-medium">{a.displayName}</p>
                              <p className="truncate font-mono text-[11px] text-muted-foreground">{a.username}</p>
                            </div>
                            {a.id === me?.id ? <Badge variant="outline" className="font-normal">我</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell data-label="角色" className="text-right md:text-left">
                          {a.id === me?.id ? (
                            <Pill tone={ROLE_TONE[a.role]}>{ROLE_LABEL[a.role]}</Pill>
                          ) : (
                            <NativeSelect value={a.role} className="h-8 rounded-lg border bg-background px-2 text-sm" aria-label={`${a.username} 的角色`}
                              onChange={(e) => void run("accounts.save", {
                                id: a.id, username: a.username, displayName: a.displayName, role: e.target.value, studentId: a.studentId,
                              }, "角色已更新")}>
                              <NativeSelectOption value="TEACHER">教师</NativeSelectOption>
                              <NativeSelectOption value="ADMIN">管理员</NativeSelectOption>
                              <NativeSelectOption value="STUDENT">学生</NativeSelectOption>
                            </NativeSelect>
                          )}
                        </TableCell>
                        <TableCell data-label="关联学生" className="text-xs">
                          {a.studentName ? `${a.studentName} · ${a.className}（${a.studentNo}）` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell data-label="状态" className="text-right md:text-left">
                          {a.status !== "active" ? <Pill tone="danger">已停用</Pill>
                            : a.mustChange ? <Pill tone="warning">待改初始密码</Pill>
                            : a.lockedUntil ? <Pill tone="danger">锁定至 {a.lockedUntil.slice(11, 16)}</Pill>
                            : <Pill tone="success">正常</Pill>}
                        </TableCell>
                        <TableCell data-label="最近登录" className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                          {a.lastLoginAt ? a.lastLoginAt.slice(0, 10) : "从未登录"}
                        </TableCell>
                        <TableCell data-label="操作" className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" aria-label="重置密码" disabled={busy}
                              onClick={() => setResetFor(a)}><KeyRound className="size-4" /></Button>
                            <Button size="sm" variant="ghost" aria-label={a.status === "active" ? "停用账号" : "启用账号"} disabled={busy}
                              onClick={() => void run("accounts.status", { id: a.id, status: a.status === "active" ? "disabled" : "active" }, a.status === "active" ? "账号已停用" : "账号已启用")}>
                              <Power className="size-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" aria-label="删除账号" disabled={busy}
                              onClick={() => { if (confirm(`确定删除账号 ${a.username}？该账号的登录会话会一并失效。`)) void run("accounts.delete", { id: a.id }, "账号已删除"); }}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
              <p className="text-sm">3 个班级 · 15 名学生 · 成绩/出勤/奖惩/活动/评语</p>
              <p className="text-xs text-muted-foreground">仅在系统完全为空时可导入，不会覆盖已有数据。</p>
            </div>
            <Button variant="outline" disabled={busy} onClick={() => void seed()}>导入演示数据</Button>
          </div>
        </Panel>
      )}

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
