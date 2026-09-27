import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Plus, Trash2, DatabaseZap, ShieldCheck, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, errorMessage } from "../api";
import { EmptyState, PageHeader, Panel } from "../components/app-ui";
import type { ClassRow, Me, UserRow } from "../types";

export default function SettingsPage({ isAdmin, me, onWhoamiChanged }: { isAdmin: boolean; me: Me | null; onWhoamiChanged: () => void }) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [newClass, setNewClass] = useState({ name: "", grade: "高一" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setClasses((await apiGet<{ classes: ClassRow[] }>("classes.list")).classes);
      if (isAdmin) setUsers((await apiGet<{ users: UserRow[] }>("users.list")).users);
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
    onWhoamiChanged();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="系统设置" description="维护班级、教师角色与初始化演示数据。" />

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
        title="教师账号"
        description="首个登录的用户自动成为管理员，之后登录的用户为教师；管理员可调整角色。"
        action={me ? <Badge variant="secondary" className="font-normal">{users.length} 位教师</Badge> : undefined}
        contentClassName="p-4"
      >
        {isAdmin ? (
          loading ? <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p> : (
            <div className="overflow-x-auto">
              <Table className="responsive-table">
                <TableHeader><TableRow><TableHead>姓名</TableHead><TableHead>角色</TableHead><TableHead>注册时间</TableHead><TableHead className="text-right">调整角色</TableHead></TableRow></TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell data-label="姓名">
                        <div className="flex items-center gap-2">
                          <Avatar className="size-7"><AvatarFallback className="text-[11px]">{(u.name || "?").slice(0, 1)}</AvatarFallback></Avatar>
                          <span className="font-medium">{u.name}</span>
                          {u.user_id === me?.userId ? <Badge variant="outline" className="font-normal">我</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell data-label="角色"><Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{u.role === "ADMIN" ? "管理员" : "教师"}</Badge></TableCell>
                      <TableCell data-label="注册时间" className="font-mono text-xs text-muted-foreground">{u.created_at?.slice(0, 10) ?? "—"}</TableCell>
                      <TableCell data-label="调整角色" className="text-right">
                        <NativeSelect value={u.role} onChange={(e) => void run("users.role", { userId: u.user_id, role: e.target.value }, "角色已更新")}
                          className="h-8 rounded-lg border bg-background px-2 text-sm">
                          <NativeSelectOption value="TEACHER">教师</NativeSelectOption>
                          <NativeSelectOption value="ADMIN">管理员</NativeSelectOption>
                        </NativeSelect>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : (
          <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3.5 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">仅管理员可查看教师账号列表并调整角色。当前登录身份：{me?.name ?? "教师"}。</p>
          </div>
        )}
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

      <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-muted-foreground">
        <GraduationCap className="size-3.5" /> 所有数据存放在本站专有数据库中，仅与本站账号体系配合使用。
      </p>
    </div>
  );
}
