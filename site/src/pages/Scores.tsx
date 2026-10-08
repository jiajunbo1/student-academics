import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Download, FileUp, LineChart as LineChartIcon, Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, errorMessage, fmtScore } from "../api";
import { downloadCsv, ImportDialog, type ImportResult } from "../components/import-export";
import {
  CardList, ChartSkeleton, ClassDot, ClassMark, DateField, EmptyState, FilterSelect, PageHeader, Panel, Pill, RowCard, ScoreText,
  SortHead, TableSkeleton, Toolbar, TotalCell, TOTAL_FOOT_CLASS, trendDomain, useMarkColors, useMarkColorValues, useTableSort, useThemeColors, type SelectOption,
} from "../components/app-ui";
import type { ClassRow, Exam, RefData, SheetRow, StudentRow, Subject, SubjectTrend } from "../types";

export default function Scores({ isAdmin }: { isAdmin: boolean }) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  /** 看与改分开：mine 只含本人任教的科目（录入/模板/导入用），sheet.subjects 是可见的全部科目列 */
  const [mine, setMine] = useState<Subject[]>([]);
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
  const [trendFor, setTrendFor] = useState<Subject | null>(null);
  const [importing, setImporting] = useState(false);
  const [examDialog, setExamDialog] = useState(false);
  const [examForm, setExamForm] = useState({ name: "", examDate: "", term: "" });
  const [examSaving, setExamSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [c, r] = await Promise.all([
          apiGet<{ classes: ClassRow[] }>("classes.list"),
          apiGet<RefData>("refdata"),
        ]);
        const writable = r.subjects.filter((s) => r.mySubjectIds.includes(s.id));
        setClasses(c.classes); setMine(writable); setExams(r.exams);
        if (r.exams[0]) setExamId(r.exams[0].id);
        if (writable[0]) setSubjectId(writable[0].id);
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
    const name = examForm.name.trim();
    const term = examForm.term.trim();
    if (!name) { toast.error("请填写考试名称"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examForm.examDate)) { toast.error("请选择考试日期"); return; }
    if (!term) { toast.error("请填写学期"); return; }
    setExamSaving(true);
    try {
      await apiPost("exams.save", { name, examDate: examForm.examDate, term });
      toast.success("考试已创建");
      setExamDialog(false);
      setExamForm({ name: "", examDate: "", term: "" });
      const r = await apiGet<{ exams: Exam[] }>("refdata");
      setExams(r.exams);
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setExamSaving(false); }
  };

  const exam = exams.find((e) => e.id === examId);
  const subject = mine.find((s) => s.id === subjectId);
  const examOptions = useMemo<SelectOption[]>(() => exams.map((e) => ({ value: e.id, label: e.name })), [exams]);
  const classOptions = useMemo<SelectOption[]>(() => classes.map((c) => ({ value: c.id, label: c.name })), [classes]);
  const subjectOptions = useMemo<SelectOption[]>(() => mine.map((s) => ({ value: s.id, label: s.name })), [mine]);
  /** 总表里非本人任教的列：能看不能改，用置灰 + 提示区分 */
  const canEdit = useMemo(() => new Set(mine.map((s) => s.id)), [mine]);
  const colorOf = useMarkColors(classes.map((c) => c.name));
  const filledCount = useMemo(() => {
    if (!sheet) return 0;
    return sheet.rows.filter((r) => sheet.subjects.some((s) => r.cells[s.id] != null)).length;
  }, [sheet]);
  const scopeName = classOptions.find((o) => o.value === classId)?.label ?? (isAdmin ? "全校" : "任教班级");

  // 表头点击排序：科目列点开是走势弹窗、不当排序用，只给名次/学生/班级/总分/平均五列开；窄屏卡片跟同一份顺序
  const { sorted: sheetRows, sort, toggle } = useTableSort(sheet?.rows ?? [], {
    rank: (r) => r.classRank,
    name: (r) => r.studentName,
    className: (r) => r.className,
    total: (r) => r.total,
    avg: (r) => r.avg,
  });

  /**
   * 合计行三档口径：班级平均 / 及格（满分 150 及格线 90 分 = 900 个十分之一分）/ 最高 · 最低。
   * 每一列只统计该列有分的人，所以「平均」行下面标的是一科的分母，不是整场人数。
   */
  const summary = useMemo(() => {
    if (!sheet) return null;
    const cols = sheet.subjects.map((s) => {
      const vals = sheet.rows.map((r) => r.cells[s.id]).filter((v): v is number => v != null);
      const sum = vals.reduce((a, b) => a + b, 0);
      return {
        avg: vals.length ? fmtScore(Math.round(sum / vals.length)) : "—",
        pass: vals.length ? `${vals.filter((v) => v >= 900).length}/${vals.length}` : "—",
        range: vals.length ? `${fmtScore(Math.max(...vals))} / ${fmtScore(Math.min(...vals))}` : "—",
      };
    });
    const scored = sheet.rows.filter((r) => r.count > 0);
    const totals = scored.map((r) => r.total);
    const sumTotal = totals.reduce((a, b) => a + b, 0);
    return {
      cols,
      scoredCount: scored.length,
      totalAvg: totals.length ? fmtScore(Math.round(sumTotal / totals.length)) : "—",
      avgOfAvg: scored.length ? (scored.reduce((a, r) => a + r.avg, 0) / scored.length).toFixed(1) : "—",
    };
  }, [sheet]);

  /** 导入模板：行 = 当前筛选下的全部学生，列 = 我能录入的科目，空格表示该科不改 */
  const templateCsv = useMemo<(string | number | null)[][]>(() => {
    const cells = new Map((sheet?.rows ?? []).map((r) => [r.studentId, r.cells]));
    return [
      ["学号", "姓名", "班级", ...mine.map((s) => s.name)],
      ...students.map((st) => [
        st.student_no, st.name, st.className ?? "",
        ...mine.map((s) => { const v = cells.get(st.id)?.[s.id]; return v == null ? "" : v / 10; }),
      ]),
    ];
  }, [sheet, students, mine]);

  /** 导出成绩表：按总表原样出全部可见科目，附总分/平均/班内名次；不是自己任教的科目只读 */
  const viewCsv = useMemo<(string | number | null)[][]>(() => {
    const cols = sheet?.subjects ?? [];
    return [
      ["学号", "姓名", "班级", ...cols.map((s) => s.name), "总分", "平均", "班内名次"],
      ...(sheet?.rows ?? []).map((r) => [
        r.studentNo, r.studentName, r.className,
        ...cols.map((s) => { const v = r.cells[s.id]; return v == null ? "" : v / 10; }),
        r.total / 10, r.avg, r.classRank,
      ]),
    ];
  }, [sheet]);
  const exportScoreCsv = () => {
    if (!sheet?.rows.length) { toast.error("这场考试还没有成绩记录，先录入或导入"); return; }
    downloadCsv(`成绩表_${exam?.name ?? ""}_${scopeName}.csv`, viewCsv);
  };

  return (
    <div className="page-in">
      <PageHeader
        title="成绩管理"
        eyebrow={classId ? (classOptions.find((c) => c.value === classId)?.label ?? "班级") : isAdmin ? "全校" : "任教范围"}
        description={exam ? `${exam.term} · ${exam.exam_date}${classId ? "" : isAdmin ? " · 全校数据" : " · 任教班级全科可看"}` : "选择考试后查看成绩单或录入分数"}
      >
        {isAdmin && <Button variant="outline" onClick={() => setExamDialog(true)}><Plus /> 新建考试</Button>}
        <Button variant="outline" onClick={exportScoreCsv} disabled={!exam}><Download /> 导出成绩表</Button>
        <Button variant="outline" onClick={() => setImporting(true)} disabled={!exam} title={exam ? undefined : "先在页面上方选择考试"}><FileUp /> 批量导入</Button>
      </PageHeader>

      <Toolbar>
        <FilterSelect blockOnMobile value={examId} onChange={setExamId} options={examOptions} ariaLabel="选择考试" />
        <FilterSelect blockOnMobile value={classId} onChange={setClassId} options={classOptions} allLabel={isAdmin ? "全部班级" : "任教班级"} ariaLabel="按班级筛选" />
        {sheet ? <Pill tone="info">已录 {filledCount} / {sheet.rows.length} 人</Pill> : null}
      </Toolbar>

      <Tabs defaultValue="sheet">
        <TabsList><TabsTrigger value="sheet">成绩单 / 排名</TabsTrigger><TabsTrigger value="entry">成绩录入</TabsTrigger></TabsList>
        <TabsContent value="sheet" className="mt-4">
          <Panel
            title="科目成绩单"
            description={exam ? `${exam.name} · 分数为原始分，满分 150；点击科目名可看历年走势${isAdmin ? "" : "，总分含全班全部科目"}` : undefined}
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
              <>
                <CardList className="md:hidden">
                  {sheetRows.map((r) => (
                    <RowCard
                      key={r.studentId}
                      leading={<ClassMark name={r.studentName} color={colorOf(r.className)} large />}
                      title={r.studentName}
                      subtitle={`${r.studentNo} · ${r.className}`}
                      right={
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={r.classRank <= 3 ? "default" : "outline"} className={r.classRank <= 3 ? "gap-1 font-mono" : "font-mono"}>
                            {r.classRank <= 3 && <Trophy className="size-3" />}{r.classRank}
                          </Badge>
                          <span className="text-sm font-semibold tabular-nums">
                            {(r.total / 10).toFixed(1)}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">均 {r.avg}</span>
                          </span>
                        </div>
                      }
                    >
                      <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1">
                        {sheet.subjects.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            title={canEdit.has(s.id) ? `查看 ${s.name} 历年成绩走势` : `${s.name} 由其他老师任教：可看不可录入`}
                            onClick={() => setTrendFor(s)}
                            className="flex min-h-8 shrink-0 items-center gap-1 rounded-lg bg-muted/60 px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {s.name}
                            <ScoreText tenths={r.cells[s.id]} heat className="text-xs" />
                          </button>
                        ))}
                      </div>
                    </RowCard>
                  ))}
                </CardList>
                <div className="hidden overflow-x-auto md:block">
                  <Table className="data-table">
                    <TableHeader>
                      <TableRow>
                        <SortHead label="名次" col="rank" sort={sort} onSort={toggle} />
                        <SortHead label="学生" col="name" sort={sort} onSort={toggle} />
                        <SortHead label="班级" col="className" sort={sort} onSort={toggle} />
                        {sheet.subjects.map((s) => (
                          <TableHead key={s.id} className="text-right whitespace-nowrap">
                            <button
                              type="button"
                              className={cn("inline-flex items-center gap-1 rounded-sm font-medium transition-colors hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                canEdit.has(s.id) ? "text-foreground" : "text-muted-foreground")}
                              title={canEdit.has(s.id) ? `查看 ${s.name} 历年成绩走势` : `${s.name} 由其他老师任教：可以看分数和走势，不能录入`}
                              onClick={() => setTrendFor(s)}
                            >
                              {s.name}
                              <LineChartIcon className="size-3.5 text-muted-foreground" />
                            </button>
                          </TableHead>
                        ))}
                        <SortHead label="总分" col="total" sort={sort} onSort={toggle} className="text-right" />
                        <SortHead label="平均" col="avg" sort={sort} onSort={toggle} className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sheetRows.map((r) => (
                        <TableRow key={r.studentId}>
                          <TableCell>
                            <Badge variant={r.classRank <= 3 ? "default" : "outline"} className={r.classRank <= 3 ? "gap-1 font-mono" : "font-mono"}>
                              {r.classRank <= 3 && <Trophy className="size-3" />}{r.classRank}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className="flex items-center gap-2">
                              <ClassMark name={r.studentName} color={colorOf(r.className)} />
                              <span className="font-medium">{r.studentName}</span>
                              <span className="font-mono text-xs text-muted-foreground">{r.studentNo}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <ClassDot color={colorOf(r.className)} />
                              {r.className}
                            </span>
                          </TableCell>
                          {sheet.subjects.map((s) => (
                            <TableCell key={s.id} className="text-right"><ScoreText tenths={r.cells[s.id]} heat /></TableCell>
                          ))}
                          <TableCell className="text-right"><span className="font-semibold tabular-nums">{(r.total / 10).toFixed(1)}</span></TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{r.avg}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    {summary && (
                      <TableFooter className={TOTAL_FOOT_CLASS}>
                        <TableRow>
                          <TotalCell note colSpan={3}>班级平均 · 已录 {summary.scoredCount} 人</TotalCell>
                          {summary.cols.map((c, i) => (
                            <TotalCell key={sheet.subjects[i].id} className="text-right">{c.avg}</TotalCell>
                          ))}
                          <TotalCell className="text-right font-semibold">{summary.totalAvg}</TotalCell>
                          <TotalCell className="text-right">{summary.avgOfAvg}</TotalCell>
                        </TableRow>
                        <TableRow>
                          <TotalCell note colSpan={3}>及格（≥ 90 分）</TotalCell>
                          {summary.cols.map((c, i) => (
                            <TotalCell key={sheet.subjects[i].id} note className="text-right">{c.pass}</TotalCell>
                          ))}
                          <TotalCell note className="text-right">—</TotalCell>
                          <TotalCell note className="text-right">—</TotalCell>
                        </TableRow>
                        <TableRow>
                          <TotalCell note colSpan={3}>最高 · 最低</TotalCell>
                          {summary.cols.map((c, i) => (
                            <TotalCell key={sheet.subjects[i].id} className="text-right">{c.range}</TotalCell>
                          ))}
                          <TotalCell note className="text-right">—</TotalCell>
                          <TotalCell note className="text-right">—</TotalCell>
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </div>
              </>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="entry" className="mt-4">
          <Card className="gap-0 border py-0 shadow-soft">
            <CardContent className="flex flex-col gap-2.5 p-3 md:flex-row md:flex-wrap md:items-center md:p-4">
              <span className="text-sm text-muted-foreground">录入科目</span>
              <FilterSelect value={subjectId} onChange={setSubjectId} options={subjectOptions} ariaLabel="选择录入科目" className="md:w-40" />
              <span className="text-xs text-muted-foreground">满分 150，支持 0.5 分粒度；清空并保存即删除该成绩</span>
              <Button className="min-h-11 w-full md:ml-auto md:w-auto" size="sm" disabled={saving || !students.length} onClick={() => void saveAll()}>
                {saving ? "保存中…" : `保存 ${subject?.name ?? ""} 成绩`}
              </Button>
            </CardContent>
          </Card>
          <Panel
            className="mt-4"
            title={subject ? `${subject.name} · ${exam?.name ?? ""}` : "成绩录入"}
            description={`已填 ${students.filter((s) => (draft[s.id] ?? "").trim() !== "").length} / ${students.length} 人`}
            contentClassName="p-3 md:p-0"
          >
            {loading ? <TableSkeleton rows={6} cols={3} /> : !students.length ? (
              <EmptyState icon={ClipboardList} title="当前班级筛选下没有学生" description="请先在「学生档案」中录入或切换到正确班级。" />
            ) : (
              <>
                <CardList className="md:hidden">
                  {students.map((s) => {
                    const filled = (draft[s.id] ?? "").trim() !== "";
                    return (
                      <RowCard
                        key={s.id}
                        leading={<ClassMark name={s.name} color={colorOf(s.className ?? "")} />}
                        title={s.name}
                        subtitle={s.student_no}
                        right={
                          <Input inputMode="decimal" placeholder="—" aria-label={`${s.name} 分数`}
                            className={cn("w-24 max-md:h-11", !filled && "bg-warning/8")}
                            value={draft[s.id] ?? ""}
                            onChange={(e) => setDraft({ ...draft, [s.id]: e.target.value })} />
                        }
                      />
                    );
                  })}
                </CardList>
                <div className="hidden overflow-x-auto md:block">
                  <Table className="data-table">
                    <TableHeader><TableRow><TableHead>学号</TableHead><TableHead>姓名</TableHead><TableHead className="w-40">分数</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {students.map((s) => {
                        const filled = (draft[s.id] ?? "").trim() !== "";
                        return (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.student_no}</TableCell>
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              <ClassMark name={s.name} color={colorOf(s.className ?? "")} />
                              {s.name}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Input inputMode="decimal" placeholder="—" className={cn("w-full sm:w-28", !filled && "bg-warning/8")}
                              value={draft[s.id] ?? ""}
                              onChange={(e) => setDraft({ ...draft, [s.id]: e.target.value })} />
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <SubjectTrendDialog subject={trendFor} classId={classId} onClose={() => setTrendFor(null)} />

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onDone={() => { setImporting(false); void loadSheet(); }}
        title="批量导入成绩"
        description={`写入到当前选中的考试「${exam?.name ?? "未选择"}」。一次最多 500 条；只有校验通过的行会写入。`}
        header="学号"
        labels={SCORE_LABELS}
        templateName={`成绩导入模板_${exam?.name ?? ""}.csv`}
        template={() => templateCsv}
        toRecords={scoreRecordsOf(mine.map((s) => s.name))}
        guidance={
          <div className="space-y-2">
            <p>支持两种表头，其余列忽略：<b>学号, 科目, 分数</b>（长表，一行一个分数），或「下载模板」的宽表 <b>学号, 姓名, 班级, 语文, 数学…</b>（自动按列拆成多条）。</p>
            <p>分数为 0-150，最多一位小数；<b>留空表示该科不改动</b>，要作废某条成绩请到「成绩录入」清空后保存。</p>
            <p>切换目标考试请在页面上方选好考试后再打开本窗口。<b>成绩都能看，但只有你任教的科目能写</b>：模板只列可录入的科目，导入别班或别科的行会标注越权原因并跳过。</p>
          </div>
        }
        submit={(rows, dryRun) => apiPost<ImportResult>("import.scores", { examId, rows, dryRun })}
      />

      <Dialog open={examDialog} onOpenChange={(o) => { setExamDialog(o); if (!o) setExamForm({ name: "", examDate: "", term: "" }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建考试</DialogTitle>
            <DialogDescription>创建后即可在上方选择这场考试进行录入、导入与导出。</DialogDescription>
          </DialogHeader>
          <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); void addExam(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="exam-name" className="text-xs text-muted-foreground">考试名称</Label>
              <Input id="exam-name" maxLength={50} placeholder="如 高一上学期第三次月考" value={examForm.name}
                onChange={(e) => setExamForm({ ...examForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">考试日期</Label>
              <DateField value={examForm.examDate} ariaLabel="考试日期" placeholder="选择考试日期"
                onChange={(v) => setExamForm({ ...examForm, examDate: v })} className="w-full" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exam-term" className="text-xs text-muted-foreground">学期</Label>
              <Input id="exam-term" maxLength={30} placeholder="如 2024-2025学年第二学期" value={examForm.term}
                onChange={(e) => setExamForm({ ...examForm, term: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExamDialog(false)}>取消</Button>
              <Button type="submit" disabled={examSaving}>创建考试</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SCORE_LABELS: Record<string, string> = { studentNo: "学号", subjectName: "科目", score: "分数" };

/** 兼容长表（学号,科目,分数）与导出的宽表（学号,姓名,班级,各科目列） */
function scoreRecordsOf(subjectNames: string[]) {
  const known = new Set(subjectNames);
  return (header: string[] | null, body: string[][]): { records: Record<string, string>[]; error?: string } => {
    if (!header) return { records: [], error: "成绩文件必须带表头行。可点「下载模板」拿到当前筛选下的成绩表，改完再导入。" };
    const noAt = header.indexOf("学号");
    if (noAt < 0) return { records: [], error: "表头里没有找到「学号」列，请用「下载模板」导出的表头。" };
    const subjAt = header.findIndex((h) => h === "科目" || h === "学科");
    const scoreAt = header.findIndex((h) => h === "分数" || h === "成绩");
    if (subjAt >= 0 && scoreAt >= 0) {
      return {
        records: body
          .map((c) => ({ studentNo: c[noAt] ?? "", subjectName: c[subjAt] ?? "", score: c[scoreAt] ?? "" }))
          .filter((r) => r.studentNo.trim() || r.subjectName.trim()),
      };
    }
    const cols = header.map((h, i) => [h, i] as const).filter(([h]) => known.has(h));
    if (!cols.length) return { records: [], error: `表头里既没有「科目/分数」两列，也没有可识别的科目列（${subjectNames.join("、")}）。` };
    const records: Record<string, string>[] = [];
    for (const cells of body) {
      const no = (cells[noAt] ?? "").trim();
      if (!no) continue;
      for (const [h, i] of cols) {
        const v = (cells[i] ?? "").trim();
        if (v !== "") records.push({ studentNo: no, subjectName: h, score: v });
      }
    }
    return { records };
  };
}

/** 走势弹窗的导出：班级均分与学生各占一行，列为一场考试一次 */
function trendCsv(t: SubjectTrend): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [["类型", "班级", "学号", "姓名", ...t.exams.map((e) => `${e.name}（${e.examDate}）`)]];
  for (const c of t.classes) {
    rows.push(["班级均分", c.name, "", "", ...t.exams.map((e) => t.classAvg[c.id]?.[e.id] ?? "")]);
  }
  for (const s of t.students) {
    rows.push(["学生", s.className, s.studentNo, s.name, ...t.exams.map((e) => (s.scores[e.id] == null ? "" : s.scores[e.id]! / 10))]);
  }
  return rows;
}

const TREND_COLORS = ["--chart-1", "--warning", "--muted-foreground", "--border"];

/** 科目历年成绩弹窗：班级视图看各班平均分的涨跌，个人视图看单个学生与本班均分的对比 */
function SubjectTrendDialog({ subject, classId, onClose }: {
  subject: Subject | null; classId: string; onClose: () => void;
}) {
  const [data, setData] = useState<SubjectTrend | null>(null);
  const [error, setError] = useState("");
  const [studentId, setStudentId] = useState("");
  const C = useThemeColors(TREND_COLORS);
  const colorOfClass = useMarkColorValues((data?.classes ?? []).map((c) => c.name));

  useEffect(() => {
    if (!subject) return;
    let alive = true;
    setData(null); setError(""); setStudentId("");
    void (async () => {
      try {
        const d = await apiGet<SubjectTrend>("scores.trend", { subjectId: subject.id, classId });
        if (!alive) return;
        setData(d); setStudentId(d.students[0]?.id ?? "");
      } catch (e) { if (alive) setError(errorMessage(e)); }
    })();
    return () => { alive = false; };
  }, [subject, classId]);

  const student = data?.students.find((s) => s.id === studentId) ?? null;
  const firstLastDelta = (vals: (number | null)[]) => {
    const xs = vals.filter((v): v is number => v !== null);
    return xs.length >= 2 ? +(xs[xs.length - 1] - xs[0]).toFixed(1) : null;
  };
  const classRows = (data?.exams ?? []).map((e) => {
    const row: Record<string, string | number | null> = { name: e.name };
    for (const c of data?.classes ?? []) row[c.name] = data?.classAvg[c.id]?.[e.id] ?? null;
    return row;
  });
  const mineRows = !student || !data ? [] : data.exams.map((e) => ({
    name: e.name,
    我的成绩: student.scores[e.id] == null ? null : +(student.scores[e.id]! / 10).toFixed(1),
    班级平均: data.classAvg[student.classId]?.[e.id] ?? null,
  }));
  /** 学科满分 150：纵轴按实际分数撑开，只有一次考试时也不会挤成窄带 */
  const classDomain = trendDomain(
    (data?.classes ?? []).flatMap((c) => (data?.exams ?? []).map((e) => data?.classAvg[c.id]?.[e.id] ?? null)),
    150,
  );
  const mineDomain = trendDomain(
    mineRows.flatMap((r) => [r.我的成绩, r.班级平均]),
    150,
  );
  const studentDelta = !student || !data
    ? null
    : firstLastDelta(data.exams.map((e) => (student.scores[e.id] == null ? null : +(student.scores[e.id]! / 10).toFixed(1))));
  const tooltipStyle = {
    background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10,
    fontSize: 12, color: "var(--popover-foreground)",
  } as const;
  const axis = { fontSize: 11, fill: C["--muted-foreground"] };

  return (
    <Dialog open={!!subject} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{subject?.name ?? "科目"} · 历年成绩走势</DialogTitle>
          <DialogDescription>
            按考试日期从早到晚排列，纵轴按分数区间留白，便于看清每一次的升降；无成绩的场次不连线。
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <EmptyState icon={ClipboardList} title="读取失败" description={error} />
        ) : !data ? (
          <ChartSkeleton className="h-72" />
        ) : !data.exams.length ? (
          <EmptyState icon={ClipboardList} title="该科目还没有成绩" description="在「成绩录入」里为这个科目填入至少一次考试的成绩后再来看走势。" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-end">
              <Button size="sm" variant="outline" onClick={() => downloadCsv(`学科历年成绩_${data.subject.name}.csv`, trendCsv(data))}>
                <Download /> 导出 CSV
              </Button>
            </div>
            <Tabs defaultValue="class">
            <TabsList>
              <TabsTrigger value="class">班级对比</TabsTrigger>
              <TabsTrigger value="student">个人走势</TabsTrigger>
            </TabsList>

            <TabsContent value="class" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="info">{data.classes.length} 个班级</Pill>
                {data.classes.map((c) => {
                  const d = firstLastDelta(data.exams.map((e) => data.classAvg[c.id]?.[e.id] ?? null));
                  return (
                    <span key={c.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ClassDot color={colorOfClass(c.name)} />
                      {c.name}
                      {d !== null ? <span className={cn("font-medium", d >= 0 ? "text-success" : "text-destructive")}>{d > 0 ? `+${d}` : d}</span> : "· 仅一次"}
                    </span>
                  );
                })}
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={classRows} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C["--border"]} />
                    <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} domain={classDomain} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 分`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {data.classes.map((c) => (
                      <Line key={c.id} type="monotone" dataKey={c.name} stroke={colorOfClass(c.name)}
                        strokeWidth={2.4} dot={{ r: 3 }} connectNulls={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="student" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect value={studentId} onChange={setStudentId} size="sm" ariaLabel="选择学生"
                  className="w-56"
                  options={data.students.map((s) => ({ value: s.id, label: `${s.name} · ${s.className}` }))} />
                {student ? (studentDelta === null ? <Pill tone="info">仅一次考试</Pill>
                  : <Pill tone={studentDelta >= 0 ? "success" : "danger"}>首末对比 {studentDelta > 0 ? `+${studentDelta}` : studentDelta} 分</Pill>)
                  : <Pill tone="warning">该科目下暂无你的学生记录</Pill>}
              </div>
              {student ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mineRows} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C["--border"]} />
                      <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} />
                      <YAxis tick={axis} tickLine={false} axisLine={false} domain={mineDomain} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 分`, ""]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="我的成绩" stroke={C["--chart-1"]} strokeWidth={2.4} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="班级平均" stroke={C["--warning"]} strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState icon={ClipboardList} title="没有可展示的学生" description="该科目在你当前范围内还没有录入过成绩。" />
              )}
            </TabsContent>
          </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
