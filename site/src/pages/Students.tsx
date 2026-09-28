import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Plus, Search, Trash2, Pencil, Users, UserX, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, errorMessage } from "../api";
import {
  EmptyState, FilterSelect, PageHeader, Panel, Pill, ScoreText, STUDENT_STATUS_TONE, TableSkeleton, Toolbar,
  type SelectOption,
} from "../components/app-ui";
import type { StudentRow, ClassRow, ScoreRow, AttendanceRow, DisciplineRow, ActivityRow, ReviewRow, Subject, Exam } from "../types";

const STATUSES = ["在读", "休学", "转班", "毕业"];
const STATUS_OPTIONS: SelectOption[] = STATUSES.map((s) => ({ value: s, label: s }));

interface FormState {
  id?: string; studentNo: string; name: string; gender: string; birthDate: string;
  classId: string; enrollYear: string; address: string; phone: string;
  guardianName: string; guardianPhone: string; status: string;
}
const emptyForm = (classId: string): FormState => ({
  studentNo: "", name: "", gender: "男", birthDate: "", classId, enrollYear: "",
  address: "", phone: "", guardianName: "", guardianPhone: "", status: "在读",
});

export default function Students({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [kw, setKw] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<{
    student: StudentRow; scores: ScoreRow[]; attendances: AttendanceRow[];
    disciplines: DisciplineRow[]; activities: ActivityRow[]; reviews: ReviewRow[];
  } | null>(null);
  const [refData, setRefData] = useState<{ subjects: Subject[]; exams: Exam[] }>({ subjects: [], exams: [] });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [s, c] = await Promise.all([
        apiGet<{ students: StudentRow[] }>("students.list", { kw, classId, status }),
        apiGet<{ classes: ClassRow[] }>("classes.list"),
      ]);
      setRows(s.students); setClasses(c.classes);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [kw, classId, status]);
  useEffect(() => { void load(); }, [load]);

  const className = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
  const stats = useMemo(() => {
    const by = (s: string) => rows.filter((r) => r.status === s).length;
    return { total: rows.length, active: by("在读"), off: by("休学") + by("转班"), grad: by("毕业") };
  }, [rows]);

  const openEdit = (row?: StudentRow) => {
    setEditing(row ? {
      id: row.id, studentNo: row.student_no, name: row.name, gender: row.gender,
      birthDate: row.birth_date ?? "", classId: row.class_id,
      enrollYear: row.enroll_year != null ? String(row.enroll_year) : "",
      address: row.address ?? "", phone: row.phone ?? "",
      guardianName: row.guardian_name ?? "", guardianPhone: row.guardian_phone ?? "", status: row.status,
    } : emptyForm(classId || classes[0]?.id || ""));
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.classId) { toast.error("请先在「系统设置」中创建班级"); return; }
    setSaving(true);
    try {
      await apiPost("students.save", {
        id: editing.id, studentNo: editing.studentNo, name: editing.name,
        gender: editing.gender, birthDate: editing.birthDate || null,
        classId: editing.classId, enrollYear: editing.enrollYear || null,
        address: editing.address, phone: editing.phone,
        guardianName: editing.guardianName, guardianPhone: editing.guardianPhone,
        status: editing.status,
      });
      toast.success(editing.id ? "学生信息已更新" : "学生已添加");
      setEditing(null); void load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  };

  const remove = async (row: StudentRow) => {
    if (!confirm(`确定删除学生「${row.name}」及其全部成绩、出勤、奖惩、活动、评语记录？`)) return;
    try {
      await apiPost("students.delete", { id: row.id });
      toast.success("已删除"); void load();
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const openDetail = async (row: StudentRow) => {
    try {
      const [d, r] = await Promise.all([
        apiGet<NonNullable<typeof detail>>("students.get", { id: row.id }),
        apiGet<{ subjects: Subject[]; exams: Exam[] }>("refdata"),
      ]);
      setDetail(d); setRefData(r);
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const subjectName = useMemo(() => new Map(refData.subjects.map((s) => [s.id, s.name])), [refData]);
  const examName = useMemo(() => new Map(refData.exams.map((e) => [e.id, e.name])), [refData]);
  const classOptions = useMemo<SelectOption[]>(() => classes.map((c) => ({ value: c.id, label: c.name })), [classes]);

  return (
    <div>
      <PageHeader title="学生档案" description={`共 ${stats.total} 名学生 · 在读 ${stats.active} 人 · 点击任意一行查看完整档案`}>
        {isAdmin && (
          <Button onClick={() => openEdit()}><Plus /> 添加学生</Button>
        )}
      </PageHeader>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <MiniStat icon={Users} label="筛选结果" value={stats.total} tone="bg-primary/10 text-primary" />
        <MiniStat icon={CalendarClock} label="休学 / 转班" value={stats.off} tone="bg-warning/14 text-warning" />
        <MiniStat icon={UserX} label="已毕业" value={stats.grad} tone="bg-info/12 text-info" />
      </div>

      <Toolbar>
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="姓名或学号" value={kw} onChange={(e) => setKw(e.target.value)} className="w-full pl-8 sm:w-52" />
        </div>
        <FilterSelect value={classId} onChange={setClassId} options={classOptions} allLabel="全部班级" ariaLabel="按班级筛选" />
        <FilterSelect value={status} onChange={setStatus} options={STATUS_OPTIONS} allLabel="全部状态" ariaLabel="按状态筛选" />
        {(kw || classId || status) && (
          <Button variant="ghost" size="sm" onClick={() => { setKw(""); setClassId(""); setStatus(""); }}>清除筛选</Button>
        )}
      </Toolbar>

      {error && <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <Panel title="学生名单" description={`${stats.total} 条记录`} contentClassName="p-3 md:p-0">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="没有符合条件的学生"
            description={kw || classId || status ? "试试调整或清除上方的筛选条件。" : "先添加学生档案，之后才能录入成绩与出勤。"}
            action={isAdmin && !kw && !classId && !status ? (
              <Button onClick={() => openEdit()}><Plus /> 添加学生</Button>
            ) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="responsive-table">
              <TableHeader>
                <TableRow>
                  <TableHead>学号</TableHead><TableHead>姓名</TableHead><TableHead className="hidden md:table-cell">性别</TableHead>
                  <TableHead>班级</TableHead>
                  <TableHead>家长 / 联系电话</TableHead>
                  <TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => void openDetail(r)}>
                    <TableCell data-label="学号" className="font-mono text-xs">{r.student_no}</TableCell>
                    <TableCell data-label="姓名" className="font-medium">{r.name}</TableCell>
                    <TableCell data-label="性别" className="hidden md:table-cell text-muted-foreground">{r.gender}</TableCell>
                    <TableCell data-label="班级">{className.get(r.class_id) ?? ""}</TableCell>
                    <TableCell data-label="家长" className="text-muted-foreground">
                      {r.guardian_name ?? "—"}{r.guardian_phone ? ` (${r.guardian_phone})` : ""}
                    </TableCell>
                    <TableCell data-label="状态"><Pill tone={STUDENT_STATUS_TONE[r.status] ?? "info"}>{r.status}</Pill></TableCell>
                    <TableCell data-label="操作" className="text-right whitespace-nowrap">
                      {isAdmin && (
                        <>
                          <Button size="sm" variant="ghost" aria-label="编辑" onClick={(e) => { e.stopPropagation(); openEdit(r); }}><Pencil className="size-4" /></Button>
                          <Button size="sm" variant="ghost" aria-label="删除" className="text-destructive" onClick={(e) => { e.stopPropagation(); void remove(r); }}><Trash2 className="size-4" /></Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "编辑学生" : "添加学生"}</DialogTitle>
            <DialogDescription>标有 * 的字段为必填项，学号在校内应唯一。</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="学号 *"><Input value={editing.studentNo} onChange={(e) => setEditing({ ...editing, studentNo: e.target.value })} /></Field>
              <Field label="姓名 *"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="性别">
                <FilterSelect value={editing.gender} onChange={(v) => setEditing({ ...editing, gender: v })} options={[{ value: "男", label: "男" }, { value: "女", label: "女" }]} ariaLabel="性别" className="w-full min-w-0" />
              </Field>
              <Field label="出生日期"><Input type="date" value={editing.birthDate} onChange={(e) => setEditing({ ...editing, birthDate: e.target.value })} /></Field>
              <Field label="班级 *">
                <FilterSelect value={editing.classId} onChange={(v) => setEditing({ ...editing, classId: v })} options={classOptions} ariaLabel="所属班级" className="w-full min-w-0" />
              </Field>
              <Field label="入学年份"><Input inputMode="numeric" placeholder="如 2024" value={editing.enrollYear} onChange={(e) => setEditing({ ...editing, enrollYear: e.target.value })} /></Field>
              <Field label="状态">
                <FilterSelect value={editing.status} onChange={(v) => setEditing({ ...editing, status: v })} options={STATUS_OPTIONS} ariaLabel="学籍状态" className="w-full min-w-0" />
              </Field>
              <Field label="联系电话"><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="家长姓名"><Input value={editing.guardianName} onChange={(e) => setEditing({ ...editing, guardianName: e.target.value })} /></Field>
              <Field label="家长电话"><Input value={editing.guardianPhone} onChange={(e) => setEditing({ ...editing, guardianPhone: e.target.value })} /></Field>
              <div className="sm:col-span-2"><Field label="家庭住址"><Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent side="right" className="w-[94vw] overflow-y-auto p-0 sm:max-w-xl">
          {detail && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle>{detail.student.name} <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">{detail.student.student_no}</span></SheetTitle>
                <SheetDescription>
                  {detail.student.className} · {detail.student.gender} · {detail.student.status}
                  {detail.student.guardian_name ? ` · 家长：${detail.student.guardian_name}${detail.student.guardian_phone ? ` ${detail.student.guardian_phone}` : ""}` : ""}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 p-4">
                <DetailSection title="成绩记录" count={detail.scores.length}>
                  {detail.scores.slice(0, 8).map((s) => (
                    <Row key={s.id}>
                      <span className="min-w-0 truncate">{examName.get(s.exam_id) ?? "考试"} · {subjectName.get(s.subject_id) ?? "科目"}</span>
                      <ScoreText tenths={s.score} className="ml-auto shrink-0" />
                    </Row>
                  ))}
                  {!detail.scores.length && <Muted>暂无成绩</Muted>}
                </DetailSection>
                <DetailSection title="出勤记录" count={detail.attendances.length}>
                  {detail.attendances.slice(0, 6).map((a) => (
                    <Row key={a.id}>
                      <span className="font-mono text-xs text-muted-foreground">{a.att_date}</span>
                      <Badge variant="outline" className="ml-auto font-normal">{a.status}</Badge>
                      {a.remark ? <span className="truncate text-xs">{a.remark}</span> : null}
                    </Row>
                  ))}
                  {!detail.attendances.length && <Muted>暂无出勤记录</Muted>}
                </DetailSection>
                <DetailSection title="奖惩" count={detail.disciplines.length}>
                  {detail.disciplines.map((d) => <Row key={d.id}><Pill tone={d.type === "奖励" ? "success" : "danger"}>{d.type}</Pill><span className="min-w-0 flex-1 truncate">{d.content}</span><span className="font-mono text-xs text-muted-foreground">{d.event_date}</span></Row>)}
                  {!detail.disciplines.length && <Muted>暂无奖惩</Muted>}
                </DetailSection>
                <DetailSection title="活动" count={detail.activities.length}>
                  {detail.activities.map((a) => <Row key={a.id}><Pill>{a.category}</Pill><span className="min-w-0 flex-1 truncate">{a.name}</span><span className="font-mono text-xs text-muted-foreground">{a.event_date}</span></Row>)}
                  {!detail.activities.length && <Muted>暂无活动</Muted>}
                </DetailSection>
                <DetailSection title="评语" count={detail.reviews.length}>
                  {detail.reviews.map((rv) => (
                    <div key={rv.id} className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs font-medium text-muted-foreground">{rv.term} · {rv.teacher_name ?? "教师"}</p>
                      <p className="mt-1 leading-relaxed">{rv.content}</p>
                    </div>
                  ))}
                  {!detail.reviews.length && <Muted>暂无评语</Muted>}
                </DetailSection>
                <p className="pb-2 text-center text-xs text-muted-foreground">成绩展示 {Math.min(detail.scores.length, 8)} / {detail.scores.length} 条，完整记录见「成绩管理」</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const MiniStat = ({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone: string }) => (
  <Card className="border shadow-soft">
    <CardContent className="flex items-center gap-2.5 p-3 md:p-4">
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-muted-foreground md:text-xs">{label}</p>
        <p className="text-lg font-semibold leading-tight md:text-xl">{value}</p>
      </div>
    </CardContent>
  </Card>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>{children}</div>
);
const DetailSection = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => (
  <Card className="border shadow-soft">
    <CardHeader className="py-3">
      <CardTitle className="flex items-center gap-2 text-sm">
        {title}<Badge variant="secondary" className="font-normal">{count}</Badge>
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-2 py-0 pb-3">{children}</CardContent>
  </Card>
);
const Row = ({ children }: { children: React.ReactNode }) => <div className="flex items-center gap-2 text-[13px]">{children}</div>;
const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>;
