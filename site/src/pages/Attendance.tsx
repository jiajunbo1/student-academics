import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, errorMessage } from "../api";
import {
  ATTENDANCE_TONE, EmptyState, FilterSelect, PageHeader, Panel, Pill, type SelectOption, TableSkeleton, TONE_CLASS, Toolbar,
} from "../components/app-ui";
import type { AttendanceRow, ClassRow, StudentRow } from "../types";

const ATT_STATUS = ["出勤", "迟到", "早退", "请假", "缺勤"];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function Attendance() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today());
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [remark, setRemark] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try { setClasses((await apiGet<{ classes: ClassRow[] }>("classes.list")).classes); }
      catch (e) { toast.error(errorMessage(e)); }
    })();
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      setRecords((await apiGet<{ records: AttendanceRow[] }>("attendance.list", { date: filterDate, classId })).records);
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  }, [filterDate, classId]);
  useEffect(() => { void loadRecords(); }, [loadRecords]);

  useEffect(() => {
    setStudentsLoading(true);
    void (async () => {
      try {
        const s = (await apiGet<{ students: StudentRow[] }>("students.list", { classId })).students;
        setStudents(s);
        const day = (await apiGet<{ records: AttendanceRow[] }>("attendance.list", { date })).records;
        const st: Record<string, string> = {}, rm: Record<string, string> = {};
        for (const x of s) {
          const rec = day.find((r) => r.student_id === x.id);
          st[x.id] = rec?.status ?? "";
          rm[x.id] = rec?.remark ?? "";
        }
        setDraft(st); setRemark(rm);
      } catch (e) { toast.error(errorMessage(e)); }
      finally { setStudentsLoading(false); }
    })();
  }, [classId, date]);

  const save = async () => {
    setSaving(true);
    try {
      const entries = students.map((s) => ({ studentId: s.id, status: draft[s.id] || null, remark: remark[s.id] || "" }));
      const r = await apiPost<{ saved: number }>("attendance.save", { date, entries });
      toast.success(`已保存 ${date} 的签到（${r.saved} 人）`);
      void loadRecords();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  };

  const counts = ATT_STATUS.map((name) => ({ name, n: students.filter((s) => draft[s.id] === name).length }));
  const marked = useMemo(() => students.filter((s) => draft[s.id]).length, [students, draft]);
  const classOptions = useMemo<SelectOption[]>(() => classes.map((c) => ({ value: c.id, label: c.name })), [classes]);

  return (
    <div>
      <PageHeader
        title="出勤管理"
        description="按班级逐日签到，状态与备注随时可改；历史记录支持按日期回溯。" />

      <Tabs defaultValue="checkin">
        <TabsList><TabsTrigger value="checkin">每日签到</TabsTrigger><TabsTrigger value="history">历史记录</TabsTrigger></TabsList>
        <TabsContent value="checkin" className="mt-4 space-y-4">
          <Card className="border shadow-soft">
            <CardContent className="flex flex-wrap items-center gap-2 p-3 md:p-4">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" aria-label="签到日期" />
              <FilterSelect value={classId} onChange={setClassId} options={classOptions} allLabel="全部班级" ariaLabel="按班级筛选" />
              <div className="flex flex-wrap gap-1.5">
                {counts.map((c) => (
                  <Pill key={c.name} tone={ATTENDANCE_TONE[c.name] ?? "info"}>
                    <span className={c.n ? "" : "opacity-50"}>{c.name} {c.n}</span>
                  </Pill>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">已标记 {marked} / {students.length}</span>
                <Button size="sm" disabled={saving || !students.length} onClick={() => void save()}>
                  {saving ? "保存中…" : `保存签到`}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Panel title={`${date} 签到表`} contentClassName="p-3 md:p-0">
            {studentsLoading ? <TableSkeleton rows={6} cols={4} /> : !students.length ? (
              <EmptyState icon={CalendarCheck} title="该范围下没有学生" description="请先在「学生档案」中添加学生，或切换到其他班级。" />
            ) : (
              <div className="overflow-x-auto">
                <Table className="responsive-table">
                  <TableHeader><TableRow><TableHead>学号</TableHead><TableHead>姓名</TableHead><TableHead>状态</TableHead><TableHead className="w-1/3">备注</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {students.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell data-label="学号" className="font-mono text-xs">{s.student_no}</TableCell>
                        <TableCell data-label="姓名" className="font-medium">{s.name}</TableCell>
                        <TableCell data-label="状态">
                          <div className="flex flex-wrap justify-start gap-1 md:justify-start">
                            {ATT_STATUS.map((x) => {
                              const active = draft[s.id] === x;
                              return (
                                <button key={x} onClick={() => setDraft({ ...draft, [s.id]: active ? "" : x })}
                                  className={`rounded-full px-2 py-0.5 text-xs transition-colors ${active ? TONE_CLASS[ATTENDANCE_TONE[x] ?? "info"] + " font-medium ring-1 ring-current/30" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                                  {x}
                                </button>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell data-label="备注"><Input placeholder="可选" value={remark[s.id] ?? ""} onChange={(e) => setRemark({ ...remark, [s.id]: e.target.value })} className="h-8 sm:w-full md:w-56" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <Toolbar>
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-40" aria-label="按日期筛选" />
            {filterDate && <Button size="sm" variant="ghost" onClick={() => setFilterDate("")}>清除日期</Button>}
            <FilterSelect value={classId} onChange={setClassId} options={classOptions} allLabel="全部班级" ariaLabel="按班级筛选" />
            <span className="ml-auto text-sm text-muted-foreground">{records.length} 条记录</span>
          </Toolbar>
          <Panel title="历史出勤" description="最多显示最近 200 条" contentClassName="p-3 md:p-0">
            {loading ? <TableSkeleton rows={8} cols={5} /> : !records.length ? (
              <EmptyState icon={CalendarCheck} title="暂无出勤记录" description="在「每日签到」中标记状态并保存后即可在这里回溯。" />
            ) : (
              <div className="overflow-x-auto">
                <Table className="responsive-table">
                  <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>学生</TableHead><TableHead>班级</TableHead><TableHead>状态</TableHead><TableHead>备注</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {records.slice(0, 200).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell data-label="日期" className="font-mono text-xs">{r.att_date}</TableCell>
                        <TableCell data-label="学生" className="font-medium">{r.studentName}</TableCell>
                        <TableCell data-label="班级" className="text-muted-foreground">{r.className}</TableCell>
                        <TableCell data-label="状态"><Pill tone={ATTENDANCE_TONE[r.status] ?? "info"}>{r.status}</Pill></TableCell>
                        <TableCell data-label="备注" className="text-muted-foreground">{r.remark || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
