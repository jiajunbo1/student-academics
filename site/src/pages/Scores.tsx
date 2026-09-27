import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, errorMessage } from "../api";
import { EmptyState, PageHeader, Panel, Pill, ScoreText, TableSkeleton, Toolbar } from "../components/app-ui";
import type { ClassRow, Exam, SheetRow, StudentRow, Subject } from "../types";

export default function Scores({ isAdmin }: { isAdmin: boolean }) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [sheet, setSheet] = useState<{ rows: SheetRow[]; subjects: Subject[] } | null>(null);
  const [loading, setLoading] = useState(false);

  // 录入模式
  const [subjectId, setSubjectId] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [c, r] = await Promise.all([
          apiGet<{ classes: ClassRow[] }>("classes.list"),
          apiGet<{ subjects: Subject[]; exams: Exam[] }>("refdata"),
        ]);
        setClasses(c.classes); setSubjects(r.subjects); setExams(r.exams);
        if (r.exams[0]) setExamId(r.exams[0].id);
        if (r.subjects[0]) setSubjectId(r.subjects[0].id);
      } catch (e) { toast.error(errorMessage(e)); }
    })();
  }, []);

  const loadSheet = useCallback(async () => {
    if (!examId) return;
    setLoading(true);
    try { setSheet(await apiGet<{ rows: SheetRow[]; subjects: Subject[] }>("scores.sheet", { examId, classId })); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  }, [examId, classId]);
  useEffect(() => { void loadSheet(); }, [loadSheet]);

  useEffect(() => {
    if (!examId || !subjectId) { setStudents([]); return; }
    void (async () => {
      try {
        const s = await apiGet<{ students: StudentRow[] }>("students.list", { classId });
        setStudents(s.students);
        const existing = await apiGet<{ rows: { studentId: string; cells: Record<string, number | null> }[] }>("scores.sheet", { examId });
        const d: Record<string, string> = {};
        for (const st of s.students) {
          const v = existing.rows.find((r) => r.studentId === st.id)?.cells[subjectId];
          d[st.id] = v == null ? "" : String(v / 10);
        }
        setDraft(d);
      } catch (e) { toast.error(errorMessage(e)); }
    })();
  }, [examId, subjectId, classId]);

  const saveAll = async () => {
    setSaving(true);
    try {
      const entries = students.map((s) => ({ studentId: s.id, score: (draft[s.id] ?? "").trim() }));
      const r = await apiPost<{ saved: number }>("scores.save", { examId, subjectId, entries });
      toast.success(`已保存 ${r.saved} 条成绩`);
      void loadSheet();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  };

  const addExam = async () => {
    const name = prompt("考试名称（如：高一上学期第三次月考）"); if (!name) return;
    const date = prompt("考试日期 YYYY-MM-DD"); if (!date) return;
    const term = prompt("学期（如：2024-2025学年第二学期）"); if (!term) return;
    try {
      await apiPost("exams.save", { name, examDate: date, term });
      toast.success("考试已创建");
      const r = await apiGet<{ exams: Exam[] }>("refdata");
      setExams(r.exams);
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const exam = exams.find((e) => e.id === examId);
  const subject = subjects.find((s) => s.id === subjectId);
  const filledCount = useMemo(() => {
    if (!sheet) return 0;
    return sheet.rows.filter((r) => sheet.subjects.some((s) => r.cells[s.id] != null)).length;
  }, [sheet]);

  return (
    <div>
      <PageHeader title="成绩管理" description={exam ? `${exam.term} · ${exam.exam_date}${classId ? "" : " · 全校数据"}` : "选择考试后查看成绩单或录入分数"}>
        {isAdmin && <Button variant="outline" onClick={() => void addExam()}><Plus /> 新建考试</Button>}
      </PageHeader>

      <Toolbar>
        <NativeSelect value={examId} onChange={(e) => setExamId(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="选择考试">
          {exams.map((e) => <NativeSelectOption key={e.id} value={e.id}>{e.name}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect value={classId} onChange={(e) => setClassId(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="按班级筛选">
          <NativeSelectOption value="">全部班级</NativeSelectOption>
          {classes.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
        </NativeSelect>
        {sheet ? <Pill tone="info">已录 {filledCount} / {sheet.rows.length} 人</Pill> : null}
      </Toolbar>

      <Tabs defaultValue="sheet">
        <TabsList><TabsTrigger value="sheet">成绩单 / 排名</TabsTrigger><TabsTrigger value="entry">成绩录入</TabsTrigger></TabsList>
        <TabsContent value="sheet" className="mt-4">
          <Panel
            title="科目成绩单"
            description={exam ? `${exam.name} · 分数为原始分，满分 150` : undefined}
            action={sheet?.rows.length ? <Badge variant="secondary" className="font-normal">{sheet.rows.length} 人</Badge> : undefined}
            contentClassName="p-3 md:p-0"
          >
            {loading ? (
              <TableSkeleton rows={6} cols={5} />
            ) : !sheet || !sheet.rows.length ? (
              <EmptyState
                icon={ClipboardList}
                title="该考试下还没有成绩数据"
                description="切换到「成绩录入」选择科目并批量填入分数，保存后这里会自动出现排名。"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="responsive-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>名次</TableHead>
                      <TableHead>学生</TableHead>
                      <TableHead>班级</TableHead>
                      {sheet.subjects.map((s) => <TableHead key={s.id} className="text-right whitespace-nowrap">{s.name}</TableHead>)}
                      <TableHead className="text-right">总分</TableHead>
                      <TableHead className="text-right">平均</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheet.rows.map((r) => (
                      <TableRow key={r.studentId}>
                        <TableCell data-label="名次">
                          <Badge variant={r.classRank <= 3 ? "default" : "outline"} className={r.classRank <= 3 ? "gap-1 font-mono" : "font-mono"}>
                            {r.classRank <= 3 && <Trophy className="size-3" />}{r.classRank}
                          </Badge>
                        </TableCell>
                        <TableCell data-label="学生" className="whitespace-nowrap">
                          <span className="font-medium">{r.studentName}</span>
                          <span className="ml-1 font-mono text-xs text-muted-foreground">{r.studentNo}</span>
                        </TableCell>
                        <TableCell data-label="班级" className="text-muted-foreground">{r.className}</TableCell>
                        {sheet.subjects.map((s) => (
                          <TableCell key={s.id} data-label={s.name} className="text-right"><ScoreText tenths={r.cells[s.id]} /></TableCell>
                        ))}
                        <TableCell data-label="总分" className="text-right"><span className="font-semibold tabular-nums">{(r.total / 10).toFixed(1)}</span></TableCell>
                        <TableCell data-label="平均" className="text-right tabular-nums text-muted-foreground">{r.avg}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="entry" className="mt-4">
          <Card className="border shadow-soft">
            <CardContent className="flex flex-wrap items-center gap-2 p-3 md:p-4">
              <span className="text-sm text-muted-foreground">录入科目</span>
              <NativeSelect value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="选择录入科目">
                {subjects.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.name}</NativeSelectOption>)}
              </NativeSelect>
              <span className="text-xs text-muted-foreground">满分 150，支持 0.5 分粒度；清空并保存即删除该成绩</span>
              <Button size="sm" className="ml-auto w-full sm:w-auto" disabled={saving || !students.length} onClick={() => void saveAll()}>
                {saving ? "保存中…" : `保存 ${subject?.name ?? ""} 成绩`}
              </Button>
            </CardContent>
          </Card>
          <Panel className="mt-4" title={subject ? `${subject.name} · ${exam?.name ?? ""}` : "成绩录入"} contentClassName="p-3 md:p-0">
            {loading ? <TableSkeleton rows={6} cols={3} /> : !students.length ? (
              <EmptyState icon={ClipboardList} title="当前班级筛选下没有学生" description="请先在「学生档案」中录入或切换到正确班级。" />
            ) : (
              <div className="overflow-x-auto">
                <Table className="responsive-table">
                  <TableHeader><TableRow><TableHead>学号</TableHead><TableHead>姓名</TableHead><TableHead className="w-40">分数</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {students.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell data-label="学号" className="font-mono text-xs">{s.student_no}</TableCell>
                        <TableCell data-label="姓名" className="font-medium">{s.name}</TableCell>
                        <TableCell data-label="分数">
                          <Input inputMode="decimal" placeholder="—" className="w-full sm:w-28"
                            value={draft[s.id] ?? ""}
                            onChange={(e) => setDraft({ ...draft, [s.id]: e.target.value })} />
                        </TableCell>
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
