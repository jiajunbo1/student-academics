import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Award, MessageSquareQuote, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost, errorMessage } from "../api";
import { EmptyState, EntityPicker, FilterSelect, PageHeader, Panel, Pill, Toolbar, type SelectOption } from "../components/app-ui";
import type { ActivityRow, ClassRow, DisciplineRow, ReviewRow, StudentRow } from "../types";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Quality() {
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [data, setData] = useState<{ disciplines: DisciplineRow[]; activities: ActivityRow[]; reviews: ReviewRow[] }>({ disciplines: [], activities: [], reviews: [] });
  const [loading, setLoading] = useState(true);

  const [dForm, setDForm] = useState({ studentId: "", type: "奖励", content: "", eventDate: today() });
  const [aForm, setAForm] = useState({ studentId: "", name: "", category: "社团", eventDate: today() });
  const [rForm, setRForm] = useState({ studentId: "", term: "2024-2025学年第二学期", content: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try { setClasses((await apiGet<{ classes: ClassRow[] }>("classes.list")).classes); }
      catch (e) { toast.error(errorMessage(e)); }
    })();
  }, []);
  useEffect(() => {
    void (async () => {
      try { setStudents((await apiGet<{ students: StudentRow[] }>("students.list", { classId })).students); }
      catch (e) { toast.error(errorMessage(e)); }
    })();
  }, [classId]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiGet("quality.list", { classId }) as typeof data); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  }, [classId]);
  useEffect(() => { void load(); }, [load]);

  const run = async (action: string, body: unknown, msg: string) => {
    setBusy(true);
    try { await apiPost(action, body); toast.success(msg); void load(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const studentOptions: SelectOption[] = students.map((s) => ({ value: s.id, label: `${s.name}（${s.student_no}）` }));
  const classOptions: SelectOption[] = classes.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div>
      <PageHeader title="素质发展" description="记录奖惩、活动参与与教师评语，形成学生的成长档案。" />

      <Toolbar>
        <FilterSelect value={classId} onChange={setClassId} options={classOptions} allLabel="全部班级" ariaLabel="按班级筛选" />
        <span className="text-sm text-muted-foreground">
          {data.disciplines.length} 条奖惩 · {data.activities.length} 条活动 · {data.reviews.length} 条评语
        </span>
      </Toolbar>

      <Tabs defaultValue="discipline">
        <TabsList>
          <TabsTrigger value="discipline">奖惩记录</TabsTrigger>
          <TabsTrigger value="activity">活动参与</TabsTrigger>
          <TabsTrigger value="review">教师评语</TabsTrigger>
        </TabsList>

        <TabsContent value="discipline" className="mt-4 space-y-4">
          <Panel title="新增奖惩">
            <div className="flex flex-wrap items-end gap-2">
              <div><Label className="mb-1 block text-xs text-muted-foreground">学生 *</Label>
                <EntityPicker value={dForm.studentId} onChange={(v) => setDForm({ ...dForm, studentId: v })} options={studentOptions} placeholder="搜索姓名或学号" className="w-full sm:w-52" /></div>
              <div><Label className="mb-1 block text-xs text-muted-foreground">类型</Label>
                <FilterSelect value={dForm.type} onChange={(v) => setDForm({ ...dForm, type: v })} options={[{ value: "奖励", label: "奖励" }, { value: "惩罚", label: "惩罚" }]} ariaLabel="奖惩类型" /></div>
              <div className="min-w-0 flex-1 basis-full sm:basis-48"><Label className="mb-1 block text-xs text-muted-foreground">内容 *</Label>
                <Input value={dForm.content} onChange={(e) => setDForm({ ...dForm, content: e.target.value })} placeholder="如：校级数学竞赛二等奖" /></div>
              <div className="basis-full sm:basis-auto"><Label className="mb-1 block text-xs text-muted-foreground">日期</Label>
                <Input type="date" value={dForm.eventDate} onChange={(e) => setDForm({ ...dForm, eventDate: e.target.value })} className="w-full sm:w-40" /></div>
              <Button disabled={busy} onClick={() => { if (!dForm.studentId || !dForm.content) { toast.error("请选择学生并填写内容"); return; } void run("discipline.save", dForm, "奖惩已记录"); setDForm({ ...dForm, content: "" }); }}>
                <Plus /> 添加
              </Button>
            </div>
          </Panel>
          {loading ? <p className="p-4 text-sm text-muted-foreground">加载中…</p> : !data.disciplines.length ? (
            <Panel><EmptyState icon={Award} title="暂无奖惩记录" description="用上方的表单添加第一条奖励或纪律记录。" /></Panel>
          ) : (
            <div className="grid gap-2.5 md:grid-cols-2">
              {data.disciplines.map((r) => (
                <Card key={r.id} className="border shadow-soft transition hover:border-primary/40">
                  <CardContent className="flex items-center gap-3 p-3.5">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${r.type === "奖励" ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive"}`}>
                      <Award className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.content}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.studentName} · {r.className} · <span className="font-mono">{r.event_date}</span></p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive" aria-label="删除" disabled={busy} onClick={() => void run("discipline.delete", { id: r.id }, "已删除")}><Trash2 className="size-4" /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-4">
          <Panel title="新增活动">
            <div className="flex flex-wrap items-end gap-2">
              <div><Label className="mb-1 block text-xs text-muted-foreground">学生 *</Label>
                <EntityPicker value={aForm.studentId} onChange={(v) => setAForm({ ...aForm, studentId: v })} options={studentOptions} placeholder="搜索姓名或学号" className="w-full sm:w-52" /></div>
              <div><Label className="mb-1 block text-xs text-muted-foreground">类别</Label>
                <FilterSelect value={aForm.category} onChange={(v) => setAForm({ ...aForm, category: v })} options={["社团", "志愿", "体育", "竞赛"].map((c) => ({ value: c, label: c }))} ariaLabel="活动类别" /></div>
              <div className="min-w-0 flex-1 basis-full sm:basis-48"><Label className="mb-1 block text-xs text-muted-foreground">活动名称 *</Label>
                <Input value={aForm.name} onChange={(e) => setAForm({ ...aForm, name: e.target.value })} placeholder="如：校园篮球联赛" /></div>
              <div className="basis-full sm:basis-auto"><Label className="mb-1 block text-xs text-muted-foreground">日期</Label>
                <Input type="date" value={aForm.eventDate} onChange={(e) => setAForm({ ...aForm, eventDate: e.target.value })} className="w-full sm:w-40" /></div>
              <Button disabled={busy} onClick={() => { if (!aForm.studentId || !aForm.name) { toast.error("请选择学生并填写活动名称"); return; } void run("activity.save", aForm, "活动已记录"); setAForm({ ...aForm, name: "" }); }}>
                <Plus /> 添加
              </Button>
            </div>
          </Panel>
          {loading ? <p className="p-4 text-sm text-muted-foreground">加载中…</p> : !data.activities.length ? (
            <Panel><EmptyState icon={Users} title="暂无活动记录" description="社团、志愿、体育、竞赛等参与情况都会汇总在这里。" /></Panel>
          ) : (
            <div className="grid gap-2.5 md:grid-cols-2">
              {data.activities.map((r) => (
                <Card key={r.id} className="border shadow-soft transition hover:border-primary/40">
                  <CardContent className="flex items-center gap-3 p-3.5">
                    <Pill>{r.category}</Pill>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.studentName} · {r.className} · <span className="font-mono">{r.event_date}</span></p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive" aria-label="删除" disabled={busy} onClick={() => void run("activity.delete", { id: r.id }, "已删除")}><Trash2 className="size-4" /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="review" className="mt-4 space-y-4">
          <Panel title="撰写评语" description="署名自动取当前登录教师">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <EntityPicker value={rForm.studentId} onChange={(v) => setRForm({ ...rForm, studentId: v })} options={studentOptions} placeholder="搜索姓名或学号" className="w-full sm:w-52" />
                <Input value={rForm.term} onChange={(e) => setRForm({ ...rForm, term: e.target.value })} placeholder="学期" className="h-9 w-full sm:w-52" />
              </div>
              <Textarea value={rForm.content} onChange={(e) => setRForm({ ...rForm, content: e.target.value })} placeholder="评语内容…" rows={3} />
              <Button disabled={busy} onClick={() => { if (!rForm.studentId || !rForm.content) { toast.error("请选择学生并填写评语"); return; } void run("review.save", rForm, "评语已保存"); setRForm({ ...rForm, content: "" }); }}>
                <Plus /> 保存评语
              </Button>
            </div>
          </Panel>
          {loading ? <p className="p-4 text-sm text-muted-foreground">加载中…</p> : !data.reviews.length ? (
            <Panel><EmptyState icon={MessageSquareQuote} title="暂无评语" description="为这学期写下的每一句评价，都会留在这里。" /></Panel>
          ) : (
            <div className="space-y-2.5">
              {data.reviews.map((r) => (
                <Card key={r.id} className="border shadow-soft">
                  <CardHeader className="flex-row items-center gap-2 py-3">
                    <CardTitle className="text-sm">{r.studentName}</CardTitle>
                    <span className="text-xs text-muted-foreground">{r.className} · {r.term} · {r.teacher_name}</span>
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive" aria-label="删除" disabled={busy} onClick={() => void run("review.delete", { id: r.id }, "已删除")}><Trash2 className="size-4" /></Button>
                  </CardHeader>
                  <CardContent className="pt-0 text-[13px] leading-relaxed text-muted-foreground">{r.content}</CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
