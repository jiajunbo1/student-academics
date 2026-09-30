import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCheck, ChevronDown, FileUp, Inbox, ListChecks, Loader2, Pencil, Plus, Check, Table2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, errorMessage } from "../api";
import { ImportDialog, type ImportResult } from "../components/import-export";
import {
  CardList, ClassDot, ClassMark, ConfirmDialog, DateField, EmptyState, FilterSelect, PageHeader, Panel, Pill,
  RowCard, StatPills, TableSkeleton, Toolbar, TONE_CLASS, dailyStatusTone, useMarkColors, type SelectOption,
} from "../components/app-ui";
import type { ClassRow, DailyGrid, DailyKind, DailyListRow, DailySheet, Subject } from "../types";

/** 两类登记共用同一套界面，只差文案与后端下发的字段开关 */
const META: Record<DailyKind, {
  nav: string; listNoun: string; titleField: string; titleHint: string;
  checkNoun: string; doneLabel: string; emptyTitle: string; emptyHint: string;
}> = {
  recitation: {
    nav: "背诵登记", listNoun: "背诵清单", titleField: "篇目", titleHint: "如《岳阳楼记》",
    checkNoun: "检查日期", doneLabel: "已过关",
    emptyTitle: "还没有背诵清单",
    emptyHint: "先定一篇要背的课文，再按学生逐个登记过关情况",
  },
  homework: {
    nav: "作业记录", listNoun: "作业清单", titleField: "作业内容", titleHint: "如 第 3 课课后练习",
    checkNoun: "批改日期", doneLabel: "已交",
    emptyTitle: "还没有作业清单",
    emptyHint: "记录一次作业的完成情况，可导入课代表统计好的结果。",
  },
};

/** 视为「已结清」的状态：进度条、待完成人数与总览里的「待补」都按这个口径 */
export const SETTLED: Record<DailyKind, string[]> = {
  recitation: ["过关", "免背"],
  homework: ["已交", "优秀"],
};
const today = () => new Date().toISOString().slice(0, 10);

export default function Daily() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [c, r] = await Promise.all([
          apiGet<{ classes: ClassRow[] }>("classes.list"),
          apiGet<{ subjects: Subject[] }>("refdata"),
        ]);
        setClasses(c.classes); setSubjects(r.subjects);
      } catch (e) { toast.error(errorMessage(e)); }
    })();
  }, []);

  return (
    <div>
      <PageHeader title="日常记录" description="背诵逐人过关、作业逐人完成；一份清单可同发多个班，登记随时改。" />
      {!classes.length || !subjects.length ? (
        <Panel className="mt-4">
          <EmptyState icon={Inbox} title="还没有可用的班级或科目"
            description="请先在「系统设置」创建班级，并为教师账号开通任教科目与班级。" />
        </Panel>
      ) : (
        <Tabs defaultValue="recitation" className="mt-4">
          <TabsList>
            <TabsTrigger value="recitation">{META.recitation.nav}</TabsTrigger>
            <TabsTrigger value="homework">{META.homework.nav}</TabsTrigger>
          </TabsList>
          <TabsContent value="recitation" className="mt-4">
            <DailyKindView kind="recitation" classes={classes} subjects={subjects} />
          </TabsContent>
          <TabsContent value="homework" className="mt-4">
            <DailyKindView kind="homework" classes={classes} subjects={subjects} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function DailyKindView({ kind, classes, subjects }: { kind: DailyKind; classes: ClassRow[]; subjects: Subject[] }) {
  const meta = META[kind];
  const [classId, setClassId] = useState("");
  const [lists, setLists] = useState<DailyListRow[] | null>(null);
  const [sheetId, setSheetId] = useState("");
  const [editing, setEditing] = useState<DailyListRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<DailyListRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gridRev, setGridRev] = useState(0);

  const load = useCallback(async () => {
    try { setLists((await apiGet<{ lists: DailyListRow[] }>(`${kind}.list`, { classId })).lists); }
    catch (e) { toast.error(errorMessage(e)); }
  }, [kind, classId]);
  useEffect(() => { void load(); }, [load]);

  /** 任何写入后同时刷新清单表和登记总览 */
  const refresh = useCallback(async () => {
    await load();
    setGridRev((n) => n + 1);
  }, [load]);

  const classOptions = useMemo<SelectOption[]>(() => classes.map((c) => ({ value: c.id, label: c.name })), [classes]);
  const classNames = useMemo(() => (lists ?? []).map((l) => l.className), [lists]);
  const colorOf = useMarkColors(classNames);
  const settledOf = (l: DailyListRow) => SETTLED[kind].reduce((n, s) => n + (l.counts[s] ?? 0), 0);
  const stat = useMemo(() => {
    const ls = lists ?? [];
    return {
      open: ls.length,
      pending: ls.reduce((n, l) => n + Math.max(l.total - settledOf(l), 0), 0),
      done: ls.reduce((n, l) => n + l.passCount, 0),
    };
  }, [lists, kind]);

  // 「全部任教班级」时总览默认取第一份清单的班；清单增删后保持原来那个班，不要跳走
  const lastGridClass = useRef("");
  const gridClassId = useMemo(() => {
    if (classId) { lastGridClass.current = classId; return classId; }
    const ls = lists ?? [];
    const kept = ls.some((l) => l.classId === lastGridClass.current) ? lastGridClass.current : (ls[0]?.classId ?? "");
    lastGridClass.current = kept;
    return kept;
  }, [classId, lists]);

  const remove = async () => {
    if (!deleting) return;    setBusy(true);
    try {
      await apiPost(`${kind}.save`, { id: deleting.id, delete: true });
      toast.success(`${meta.listNoun}已删除`);
      setDeleting(null);
      void refresh();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="page-in space-y-4">
      <Toolbar>
        <FilterSelect value={classId} onChange={setClassId} options={classOptions} allLabel="全部任教班级" ariaLabel="按班级筛选" blockOnMobile />
        <Button variant="outline" className="ml-auto w-full sm:w-auto" onClick={() => setImporting(true)}><FileUp /> 导入清单</Button>
        <Button className="w-full sm:w-auto" onClick={() => setCreating(true)}><Plus /> 新建{meta.listNoun}</Button>
      </Toolbar>
      <StatPills className="mb-4">
        <Pill tone="info">进行中 {stat.open} 份</Pill>
        <Pill tone={stat.pending ? "warning" : "success"}>待完成 {stat.pending} 人次</Pill>
        <Pill tone="success">{meta.doneLabel} {stat.done} 人次</Pill>
      </StatPills>

      <Panel title={meta.listNoun} description="点一行进入名单登记，进度按本班在读人数计" contentClassName="p-3 md:p-0">
        {!lists ? (
          <TableSkeleton rows={4} cols={5} />
        ) : !lists.length ? (
          <EmptyState icon={ListChecks} title={meta.emptyTitle} description={meta.emptyHint}
            action={<Button onClick={() => setCreating(true)}><Plus /> 新建{meta.listNoun}</Button>} />
        ) : (
          <>
            {/* 窄屏：一份清单一张卡，进度和状态摊开，不用左右滑 */}
            <CardList className="md:hidden">
              {lists.map((l) => (
                <ListCard key={l.id} l={l} colorOf={colorOf} settled={settledOf(l)}
                  onOpen={() => setSheetId(l.id)} onEdit={() => setEditing(l)} onDelete={() => setDeleting(l)} />
              ))}
            </CardList>
            <div className="hidden overflow-x-auto md:block">
              <Table className="data-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{meta.titleField}</TableHead>
                    <TableHead>班级</TableHead>
                    <TableHead>科目</TableHead>
                    <TableHead>布置 / 截止</TableHead>
                    <TableHead className="w-44">登记进度</TableHead>
                    <TableHead className="sticky right-0 z-10 bg-card w-28 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lists.map((l) => (
                    <TableRow key={l.id} className="cursor-pointer" onClick={() => setSheetId(l.id)}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <ClassMark name={l.title} color={colorOf(l.className)} />
                          <span className="min-w-0">
                            <span className="block font-medium">{l.title}</span>
                            {l.part ? <span className="block truncate text-xs text-muted-foreground">{l.part}</span> : null}
                            {l.note ? <span className="block truncate text-[11px] text-muted-foreground">{l.note}</span> : null}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5"><ClassDot color={colorOf(l.className)} />{l.className}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.subjectName}</TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        <span className="block">{l.assignDate}</span>
                        {l.dueDate ? <span className="block text-warning">截止 {l.dueDate}</span> : null}
                      </TableCell>
                      <TableCell>
                        <ProgressBar done={settledOf(l)} total={l.total} />
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(l.counts).map(([status, n]) => (
                            <Pill key={status} tone={dailyStatusTone(status)}>{status} {n}</Pill>
                          ))}
                          {!Object.keys(l.counts).length ? <span className="text-xs text-muted-foreground">尚未登记</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="sticky right-0 z-10 bg-card text-right whitespace-nowrap">
                        <Button size="xs" variant="ghost" title="进入名单登记" aria-label={`${l.title}：进入名单登记`}
                          onClick={(e) => { e.stopPropagation(); setSheetId(l.id); }}>
                          <CheckCheck />
                        </Button>
                        <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={!l.canDelete} aria-label="修改清单"
                          onClick={(e) => { e.stopPropagation(); setEditing(l); }}><Pencil /></Button>
                        <Button size="xs" variant="ghost" className="text-destructive" disabled={!l.canDelete} aria-label="删除清单"
                          onClick={(e) => { e.stopPropagation(); setDeleting(l); }}><Trash2 /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Panel>

      <GridPanel kind={kind} classId={gridClassId} rev={gridRev} onChanged={() => void refresh()} />

      <ListFormDialog kind={kind} open={creating || !!editing} initial={editing} subjects={subjects} classes={classes}
        onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => void refresh()} />
      <TasksImportDialog kind={kind} open={importing} classes={classes} subjects={subjects} classId={classId}
        onClose={() => setImporting(false)} onDone={() => { setImporting(false); void refresh(); }} />
      <SheetDialog kind={kind} listId={sheetId} onClose={() => setSheetId("")} onChanged={() => void refresh()} />

      <ConfirmDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}
        title={`删除${meta.listNoun}`} busy={busy} confirmLabel="确认删除"
        description={`「${deleting?.title ?? ""}」（${deleting?.className ?? ""}）及其全部登记记录会被删除，且无法恢复。`}
        onConfirm={() => void remove()} />
    </div>
  );
}

function ProgressBar({ done, total, wide }: { done: number; total: number; wide?: boolean }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-1.5 overflow-hidden rounded-full bg-muted", wide ? "min-w-0 flex-1" : "w-24 shrink-0")}>
        <span className={cn("block h-full rounded-full transition-all", pct >= 100 ? "bg-success" : "brand-band")}
          style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{done} / {total}</span>
    </div>
  );
}

/** 窄屏清单卡片：主标题=篇目，副信息=班级/科目/日期，进度与状态占满一行 */
function ListCard({ l, colorOf, settled, onOpen, onEdit, onDelete }: {
  l: DailyListRow; colorOf: (key: string) => string; settled: number;
  onOpen: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <RowCard
      onClick={onOpen}
      leading={<ClassMark name={l.title} color={colorOf(l.className)} large />}
      title={l.title}
      subtitle={[l.part, l.note].filter(Boolean).join(" · ")}
      right={<Pill tone={settled >= l.total ? "success" : "info"}>{settled}/{l.total}</Pill>}
      meta={
        <>
          <span className="flex items-center gap-1"><ClassDot color={colorOf(l.className)} />{l.className}</span>
          <span aria-hidden="true">·</span>
          <span>{l.subjectName}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{l.assignDate}</span>
          {l.dueDate ? <Pill tone="warning">截止 {l.dueDate}</Pill> : null}
        </>
      }
      actions={
        <>
          <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={!l.canDelete} aria-label="修改清单"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil /> 修改</Button>
          <Button size="sm" variant="ghost" className="text-destructive" disabled={!l.canDelete} aria-label="删除清单"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 /> 删除</Button>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); onOpen(); }}><CheckCheck /> 去登记</Button>
        </>
      }
    >
      <ProgressBar done={settled} total={l.total} wide />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(l.counts).map(([status, n]) => (
          <Pill key={status} tone={dailyStatusTone(status)}>{status} {n}</Pill>
        ))}
        {!Object.keys(l.counts).length ? <span className="text-xs text-muted-foreground">尚未登记</span> : null}
      </div>
    </RowCard>
  );
}

/** 登记总览：行=学生，列=最近的若干份清单，格子=可直接打勾的勾选框 */
function GridPanel({ kind, classId, rev, onChanged }: { kind: DailyKind; classId: string; rev: number; onChanged: () => void }) {
  const meta = META[kind];
  const [days, setDays] = useState("7");
  const [data, setData] = useState<DailyGrid | null>(null);
  const [error, setError] = useState("");
  const [writing, setWriting] = useState<Record<string, boolean>>({});
  const scopeRef = useRef("");

  useEffect(() => {
    if (!classId) { setData(null); setError(""); return; }
    let alive = true;
    // 换班时清空重排，同一班级内的刷新保留旧格子，避免每次登记都闪一次骨架
    const scope = `${kind}|${classId}`;
    if (scope !== scopeRef.current) { scopeRef.current = scope; setData(null); }
    setError("");
    void (async () => {
      try {
        const d = await apiGet<DailyGrid>(`${kind}.grid`, { classId, days });
        if (alive) setData(d);
      } catch (e) { if (alive) setError(errorMessage(e)); }
    })();
    return () => { alive = false; };
  }, [kind, classId, days, rev]);

  const pass = data?.pass ?? "";
  const settled = useMemo(() => new Set(SETTLED[kind]), [kind]);

  /** 打勾即写即存：请求只带状态，备注与应背日由后端沿用原值；失败回滚这一格 */
  const write = async (listId: string, studentId: string, next: string) => {
    const key = `${listId}|${studentId}`;
    const prev = data?.rows.find((r) => r.studentId === studentId)?.cells[listId] ?? null;
    const patch = (v: string | null) => setData((d) => d && {
      ...d, rows: d.rows.map((r) => r.studentId === studentId ? { ...r, cells: { ...r.cells, [listId]: v } } : r),
    });
    setWriting((w) => ({ ...w, [key]: true }));
    patch(next || null);
    try {
      await apiPost<{ saved: number }>(`${kind}.check`, { listId, entries: [{ studentId, status: next }] });
      onChanged();
    } catch (e) {
      patch(prev);
      toast.error(errorMessage(e));
    } finally {
      setWriting((w) => { const n = { ...w }; delete n[key]; return n; });
    }
  };

  return (
    <Panel title="登记总览"
      description={data
        ? `${data.className} · 最近 ${data.lists.length} 份${meta.listNoun} · 点格子即记为${pass}`
        : classId ? "正在读取…" : "先在上方选择班级"}
      action={
        <FilterSelect size="sm" value={days} onChange={setDays} ariaLabel="显示份数"
          options={[
            { value: "5", label: "最近 5 份" },
            { value: "7", label: "最近 7 份" },
            { value: "14", label: "最近 14 份" },
          ]} />
      }
      contentClassName="p-3 md:p-0">
      {!classId ? (
        <EmptyState icon={Table2} title="选择班级后查看总览" description="总览按班级展开，一格一次登记，容易看出反复欠账的学生。" />
      ) : error ? (
        <EmptyState icon={Inbox} title="读取失败" description={error} />
      ) : !data ? (
        <TableSkeleton rows={5} cols={6} />
      ) : !data.lists.length ? (
        <EmptyState icon={Table2} title={`该班级还没有${meta.listNoun}`} description={meta.emptyHint} />
      ) : (
        <div className="space-y-2.5">
          {/* 窄屏整表横向滑动，学生列冻结在左侧 */}
          <div className="scroll-x -mx-3 px-3 md:mx-0 md:px-0">
            <Table className="data-table max-md:min-w-max">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 bg-card">学生</TableHead>
                  {data.lists.map((l) => {
                    const done = data.rows.filter((r) => settled.has(r.cells[l.id] ?? "")).length;
                    return (
                      <TableHead key={l.id} className="min-w-28 whitespace-normal">
                        <span className="block max-w-32 truncate" title={l.part ? `${l.title} · ${l.part}` : l.title}>{l.title}</span>
                        <span className="block text-[11px] font-normal tabular-nums text-muted-foreground">
                          {l.assignDate} · {done}/{data.rows.length}
                        </span>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => {
                  const todo = data.lists.filter((l) => !settled.has(r.cells[l.id] ?? "")).length;
                  return (
                    <TableRow key={r.studentId}>
                      <TableCell className="sticky left-0 z-10 bg-card whitespace-nowrap">
                        <span className="font-medium">{r.name}</span>
                        <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.studentNo}</span>
                        {todo ? <span className="ml-1.5 text-xs text-warning">待补 {todo}</span>
                          : <Pill tone="success"><span className="ml-1">全部结清</span></Pill>}
                      </TableCell>
                      {data.lists.map((l) => (
                        <TableCell key={l.id} className="py-1.5">
                          <GridTick
                            statuses={data.statuses} pass={pass}
                            value={r.cells[l.id] ?? ""}
                            busy={!!writing[`${l.id}|${r.studentId}`]}
                            who={r.name}
                            what={l.part ? `${l.title} · ${l.part}` : l.title}
                            onSet={(s) => void write(l.id, r.studentId, s)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            点格子＝{pass}，再点一次撤销；需要其他状态点格子右侧的小箭头，检查日期按今天记。
            {kind === "recitation"
              ? "状态变化时背诵次数自动 +1；备注与延背应背日、批量填充仍在清单的名单登记里改。"
              : "同一学生重复登记会覆盖上次结果；备注与批量填充仍在清单的名单登记里改。"}
          </p>
        </div>
      )}
    </Panel>
  );
}

/** 总览格子：圆形勾选框 + 就地状态角标菜单，写入即保存 */
function GridTick({ statuses, pass, value, busy, who, what, onSet }: {
  statuses: string[]; pass: string; value: string; busy: boolean;
  who: string; what: string;
  onSet: (status: string) => void;
}) {
  const isPass = value === pass;
  // 其他状态显示成一小片状态色文字，既保留可读性，也让「打勾」只有一种含义
  const other = !!value && !isPass;
  const mainLabel = busy ? "登记中"
    : isPass ? `${who}：已${pass}，点击撤销`
      : value ? `${who}：当前${value}，点击标为${pass}`
        : `${who}：标为${pass}`;
  return (
    <span className="flex items-center gap-0.5">
      <button type="button" aria-label={mainLabel} title={mainLabel} disabled={busy}
        aria-pressed={isPass}
        onClick={() => onSet(isPass ? "" : pass)}
        className={cn("flex shrink-0 items-center justify-center rounded-full border transition",
          other ? "h-10 px-2.5 text-xs font-semibold leading-none md:h-5 md:px-1.5 md:text-[10px]" : "size-10 md:size-6",
          busy ? "animate-pulse border-primary/40 bg-primary/10 text-primary"
            : isPass ? "border-success bg-success text-success-foreground shadow-soft"
              : other ? cn("border-transparent", TONE_CLASS[dailyStatusTone(value)])
                : "border-dashed border-muted-foreground/45 text-transparent hover:border-success hover:bg-success/10 hover:text-success/60")}>
        {busy ? <Loader2 className="size-3.5 animate-spin" />
          : isPass ? <Check className="size-3.5" strokeWidth={3} />
            : other ? value
              : <Check className="size-3.5" strokeWidth={3} />}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`${who} · ${what}：选择其他状态`}
            className={cn("grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground/70",
              "transition hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:ring-2 focus-visible:ring-ring md:size-5")}>
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {statuses.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => onSet(s)}
              className={cn("gap-2", value === s && "bg-muted/60 font-medium")}>
              <span className={cn("grid size-4 place-items-center rounded-full", TONE_CLASS[dailyStatusTone(s)])}>
                {value === s ? <Check className="size-2.5" strokeWidth={3} /> : ""}
              </span>
              {s}
            </DropdownMenuItem>
          ))}
          {value ? (
            <DropdownMenuSeparator />
          ) : null}
          {value ? (
            <DropdownMenuItem onSelect={() => onSet("")}>撤销该生登记</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

const emptyForm = (subjects: Subject[], classes: ClassRow[]) => ({
  title: "", part: "", subjectId: subjects[0]?.id ?? "", classIds: classes[0] ? [classes[0].id] : [],
  assignDate: today(), dueDate: "", note: "",
});

/** 新建 / 修改清单：新建可一次发多个班，修改只动元信息 */
function ListFormDialog({ kind, open, initial, subjects, classes, onClose, onSaved }: {
  kind: DailyKind; open: boolean; initial: DailyListRow | null;
  subjects: Subject[]; classes: ClassRow[];
  onClose: () => void; onSaved: () => void;
}) {
  const meta = META[kind];
  const [form, setForm] = useState(emptyForm(subjects, classes));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initial
      ? {
        title: initial.title, part: initial.part, subjectId: initial.subjectId, classIds: [initial.classId],
        assignDate: initial.assignDate, dueDate: initial.dueDate, note: initial.note,
      }
      : emptyForm(subjects, classes));
  }, [open, initial, kind, subjects, classes]);

  const classChoices = initial ? classes.filter((c) => c.id === initial.classId) : classes;
  const toggleClass = (id: string) => {
    const next = form.classIds.includes(id) ? form.classIds.filter((x) => x !== id) : [...form.classIds, id];
    setForm({ ...form, classIds: next });
  };

  const submit = async () => {
    if (!form.title.trim()) { toast.error(`请填写${meta.titleField}`); return; }
    if (!form.subjectId) { toast.error("请选择科目"); return; }
    if (!form.classIds.length) { toast.error("请至少选择一个班级"); return; }
    setBusy(true);
    try {
      await apiPost(`${kind}.save`, {
        id: initial?.id, subjectId: form.subjectId, classIds: form.classIds,
        title: form.title.trim(), part: kind === "recitation" ? form.part.trim() : "",
        assignDate: form.assignDate, dueDate: form.dueDate, note: form.note.trim(),
      });
      toast.success(initial ? "清单已更新"
        : `${meta.listNoun}已创建${form.classIds.length > 1 ? `（${form.classIds.length} 个班）` : ""}`);
      onSaved();
      onClose();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? `修改${meta.listNoun}` : `新建${meta.listNoun}`}</DialogTitle>
          <DialogDescription>
            {initial ? "只改这份清单的元信息，已有登记保持不变。" : "同一份内容可一次发到多个班级，每班各生成一份清单。"}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="daily-title" className="text-xs text-muted-foreground">{meta.titleField}</Label>
            <Input id="daily-title" maxLength={100} placeholder={meta.titleHint}
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          {kind === "recitation" ? (
            <div className="space-y-1.5">
              <Label htmlFor="daily-part" className="text-xs text-muted-foreground">段落范围（可空）</Label>
              <Input id="daily-part" maxLength={60} placeholder="如 第 2-4 段"
                value={form.part} onChange={(e) => setForm({ ...form, part: e.target.value })} />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">科目</Label>
              <FilterSelect value={form.subjectId} onChange={(v) => setForm({ ...form, subjectId: v })}
                ariaLabel="选择科目" className="w-full" options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">布置日期</Label>
              <DateField value={form.assignDate} ariaLabel="布置日期" className="w-full"
                onChange={(v) => setForm({ ...form, assignDate: v })} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">截止日期（可空）</Label>
              <DateField value={form.dueDate} ariaLabel="截止日期" placeholder="不设定" className="w-full"
                onChange={(v) => setForm({ ...form, dueDate: v })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="daily-note" className="text-xs text-muted-foreground">备注（可空）</Label>
              <Input id="daily-note" maxLength={200} placeholder="如 重点句默写"
                value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{initial ? "所属班级" : "发送班级"}</Label>
            {initial ? (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">{classChoices[0]?.name ?? initial.className}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {classChoices.map((c) => (
                  <Button key={c.id} type="button" size="sm" variant={form.classIds.includes(c.id) ? "default" : "outline"}
                    onClick={() => toggleClass(c.id)}>{c.name}</Button>
                ))}
                {!classChoices.length ? (
                  <p className="text-xs text-muted-foreground">没有可发送的班级：教师只显示自己任教的班级。</p>
                ) : null}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>取消</Button>
            <Button type="submit" disabled={busy}>{initial ? "保存修改" : "创建"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Entry = { status: string; note: string };

/** 名单登记：逐人点状态（再点同状态即撤销），支持批量填充与 CSV 导入 */
function SheetDialog({ kind, listId, onClose, onChanged }: {
  kind: DailyKind; listId: string; onClose: () => void; onChanged: () => void;
}) {
  const meta = META[kind];
  const [data, setData] = useState<DailySheet | null>(null);
  const [draft, setDraft] = useState<Record<string, Entry>>({});
  const [fill, setFill] = useState("");
  const [checkDate, setCheckDate] = useState(today());
  const [planDate, setPlanDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!listId) return;
    setData(null); setDraft({}); setError(""); setFill(""); setCheckDate(today()); setPlanDate("");
    try { setData(await apiGet<DailySheet>(`${kind}.sheet`, { listId })); }
    catch (e) { setError(errorMessage(e)); }
  }, [kind, listId]);
  useEffect(() => { void load(); }, [load]);

  const colorOf = useMarkColors([data?.list.className ?? ""]);
  const view = (r: DailySheet["rows"][number]) => draft[r.studentId] ?? { status: r.record?.status ?? "", note: r.record?.note ?? "" };
  const dirty = useMemo(() => {
    if (!data) return [];
    return data.rows
      .filter((r) => {
        const d = draft[r.studentId];
        return !!d && (d.status !== (r.record?.status ?? "") || d.note !== (r.record?.note ?? ""));
      })
      .map((r) => ({ studentId: r.studentId, status: draft[r.studentId].status, note: draft[r.studentId].note }));
  }, [data, draft]);

  const setStatus = (r: DailySheet["rows"][number], next: string) => {
    const cur = view(r);
    setDraft({ ...draft, [r.studentId]: { status: cur.status === next ? "" : next, note: cur.note } });
  };
  const setNote = (r: DailySheet["rows"][number], note: string) => {
    setDraft({ ...draft, [r.studentId]: { ...view(r), note } });
  };
  const fillRest = (status: string) => {
    if (!data || !status) return;
    const next = { ...draft };
    let n = 0;
    for (const r of data.rows) {
      if (r.status !== "在读") continue;
      if ((next[r.studentId]?.status ?? r.record?.status ?? "") !== "") continue;
      next[r.studentId] = { status, note: next[r.studentId]?.note ?? r.record?.note ?? "" };
      n += 1;
    }
    setDraft(next); setFill("");
    toast.success(n ? `未登记的 ${n} 人已填为「${status}」，保存后生效` : "没有未登记的学生");
  };

  const save = async () => {
    if (!dirty.length) { onClose(); return; }
    setBusy(true);
    try {
      const r = await apiPost<{ saved: number }>(`${kind}.check`, {
        listId,
        entries: dirty.map((d) => ({
          ...d, checkDate,
          ...(kind === "recitation" && planDate ? { planDate } : {}),
        })),
      });
      toast.success(`已保存 ${r.saved} 条登记`);
      onChanged();
      await load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const template = (): (string | number | null)[][] => [
    ["学号", "状态", "检查日期", ...(kind === "recitation" ? ["计划日期"] : []), "备注"],
    ...(data?.rows ?? []).slice(0, 5).map((r) => [
      r.studentNo, r.record?.status ?? data?.pass ?? "", r.record?.checkDate || checkDate,
      ...(kind === "recitation" ? [r.record?.planDate ?? ""] : []), r.record?.note ?? "",
    ]),
  ];

  return (
    <Dialog open={!!listId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{data?.list.title || meta.nav}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.list.className} · ${data.list.subjectName} · 应交 ${data.list.total} 人${data.list.part ? ` · ${data.list.part}` : ""}`
              : "正在读取名单…"}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <EmptyState icon={Inbox} title="读取失败" description={error}
            action={<Button variant="outline" onClick={() => void load()}>重试</Button>} />
        ) : !data ? (
          <TableSkeleton rows={6} cols={4} />
        ) : (
          <div className="space-y-3">
            {/* 窄屏两列排布（说明在左、控件在右），PC 端仍是一行内联 */}
            <div className="grid grid-cols-2 items-center gap-2 rounded-xl border bg-muted/30 p-2.5 md:flex md:flex-wrap">
              <span className="text-xs text-muted-foreground">{meta.checkNoun}</span>
              <DateField value={checkDate} ariaLabel={meta.checkNoun} className="w-full min-w-0 md:w-36" onChange={setCheckDate} />
              {kind === "recitation" ? (
                <>
                  <span className="text-xs text-muted-foreground">延背应背日</span>
                  <DateField value={planDate} ariaLabel="延背应背日期" placeholder="不设定" className="w-full min-w-0 md:w-36" onChange={setPlanDate} />
                </>
              ) : null}
              <span className="mx-1 hidden h-5 w-px bg-border md:block" aria-hidden="true" />
              <FilterSelect size="sm" value={fill} onChange={fillRest} ariaLabel="批量填充未登记" allLabel="批量填充未登记"
                className="w-full min-w-0 md:w-auto md:min-w-32"
                options={data.statuses.map((s) => ({ value: s, label: `填为「${s}」` }))} />
              <Button size="sm" variant="outline" className="w-full md:ml-auto md:w-auto" onClick={() => setImporting(true)}>
                <FileUp /> 批量导入
              </Button>
            </div>

            {/* 窄屏一人一卡：状态按钮加大到好点，备注和登记人一并在卡里 */}
            <div className="space-y-2.5 md:hidden">
              {data.rows.map((r) => {
                const cur = view(r);
                const changed = dirty.some((d) => d.studentId === r.studentId);
                const off = r.status !== "在读";
                return (
                  <div key={r.studentId}
                    className={cn("card-lift rounded-xl border p-3",
                      changed ? "border-primary/50 bg-primary/5" : "border-border bg-card shadow-soft")}>
                    <div className="flex items-center gap-2.5">
                      <ClassMark name={r.name} color={colorOf(data.list.className)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {r.studentNo}{off ? ` · ${r.status}` : ""}
                        </p>
                      </div>
                      {data.hasAttempt && cur.status
                        ? <Pill tone="neutral">第 {r.record?.attempt ?? 1} 次</Pill>
                        : null}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5 [&>button]:min-h-10">
                      {data.statuses.map((s) => (
                        <Button key={s} type="button" size="sm" variant={cur.status === s ? "default" : "outline"}
                          disabled={off} aria-label={`${r.name}：${s}`}
                          onClick={() => setStatus(r, s)}>{s}</Button>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Input maxLength={200} className="h-10 min-w-0 flex-1" placeholder="备注（可空）" disabled={off}
                        value={cur.note} onChange={(e) => setNote(r, e.target.value)} />
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {r.record ? `${r.record.recordedByName || "—"} · ${r.record.checkDate}` : "未登记"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-y-auto rounded-lg border md:block md:max-h-[52vh]">
              <Table className="data-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-card">学生</TableHead>
                    <TableHead className="min-w-56">状态</TableHead>
                    {data.hasAttempt ? <TableHead className="w-16 text-right">次数</TableHead> : null}
                    <TableHead>备注</TableHead>
                    <TableHead className="w-32">登记人</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => {
                    const cur = view(r);
                    const changed = dirty.some((d) => d.studentId === r.studentId);
                    const off = r.status !== "在读";
                    return (
                      <TableRow key={r.studentId} className={cn(changed && "bg-primary/5")}>
                        <TableCell className="sticky left-0 z-10 bg-card whitespace-nowrap">
                          <span className="flex items-center gap-2">
                            <ClassMark name={r.name} color={colorOf(data.list.className)} />
                            <span>
                              <span className="block font-medium">{r.name}</span>
                              <span className="block font-mono text-[11px] text-muted-foreground">
                                {r.studentNo}{off ? ` · ${r.status}` : ""}
                              </span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap gap-1">
                            {data.statuses.map((s) => (
                              <Button key={s} type="button" size="xs" variant={cur.status === s ? "default" : "outline"}
                                disabled={off} aria-label={`${r.name}：${s}`}
                                onClick={() => setStatus(r, s)}>{s}</Button>
                            ))}
                          </span>
                        </TableCell>
                        {data.hasAttempt ? (
                          <TableCell className="text-right tabular-nums">
                            {cur.status ? `第 ${r.record?.attempt ?? 1} 次` : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <Input maxLength={200} className="h-8 min-w-32" placeholder="可空" disabled={off}
                            value={cur.note} onChange={(e) => setNote(r, e.target.value)} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.record
                            ? `${r.record.recordedByName || "—"} · ${r.record.checkDate}${r.record.planDate ? ` · 约 ${r.record.planDate}` : ""}`
                            : "未登记"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              再点一次当前状态即撤销该生登记；{kind === "recitation" ? "状态变化时背诵次数自动 +1，同状态重复点不计次。" : "同一学生重复登记会覆盖上一次的结果。"}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{dirty.length ? "放弃修改" : "关闭"}</Button>
          <Button onClick={() => void save()} disabled={busy || !dirty.length}>
            {busy ? "保存中…" : dirty.length ? `保存 ${dirty.length} 条变更` : "无变更"}
          </Button>
        </DialogFooter>

        {data && (
          <ImportDialog
            open={importing}
            onClose={() => setImporting(false)}
            onDone={() => { setImporting(false); void load(); onChanged(); }}
            title={`导入${meta.nav}`}
            description={`写入「${data.list.title}」的登记结果，一次最多 500 行；只有校验通过的行会写入。`}
            header="学号"
            labels={IMPORT_LABELS}
            templateName={`${meta.nav}导入模板.csv`}
            template={template}
            toRecords={(headerCells, body) => dailyRecordsOf(kind, headerCells, body)}
            guidance={
              <div className="space-y-2">
                <p>表头需含 <b>学号, 状态</b>{kind === "recitation" ? "，可选 检查日期, 计划日期, 备注" : "，可选 检查日期, 备注"}；状态取值：{data.statuses.join(" / ")}。</p>
                <p>日期为 YYYY-MM-DD；学号必须属于这份清单所在的班级，越权行会标注原因并跳过。</p>
                <p>已登记过的学生会被<b>覆盖</b>，导入按第一次登记计次。</p>
              </div>
            }
            submit={(rows, dryRun) => apiPost<ImportResult>(`${kind}.import`, { listId, rows, dryRun })}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const IMPORT_LABELS: Record<string, string> = {
  studentNo: "学号", status: "状态", checkDate: "检查日期", planDate: "计划日期", note: "备注",
};

/** 导入只认列名：学号, 状态[, 检查日期][, 计划日期][, 备注]；状态是否合法交给后端逐行判定 */
function dailyRecordsOf(kind: DailyKind, headerCells: string[] | null, body: string[][]) {
  if (!headerCells) return { records: [], error: "文件必须带表头行，至少包含「学号, 状态」两列。" };
  const noAt = headerCells.indexOf("学号");
  const stAt = headerCells.findIndex((h) => h === "状态" || h === "完成情况");
  if (noAt < 0 || stAt < 0) return { records: [], error: "表头里需要「学号」和「状态」两列，可点「下载模板」对照。" };
  const dateAt = headerCells.indexOf("检查日期");
  const planAt = kind === "recitation" ? headerCells.indexOf("计划日期") : -1;
  const noteAt = headerCells.indexOf("备注");
  const records = body
    .map((cells) => ({
      studentNo: (cells[noAt] ?? "").trim(),
      status: (cells[stAt] ?? "").trim(),
      checkDate: dateAt >= 0 ? (cells[dateAt] ?? "").trim() : "",
      planDate: planAt >= 0 ? (cells[planAt] ?? "").trim() : "",
      note: noteAt >= 0 ? (cells[noteAt] ?? "").trim() : "",
    }))
    .filter((r) => r.studentNo || r.status);
  if (!records.length) return { records: [], error: "没有解析出数据行：每行至少要有学号和状态。" };
  return { records };
}

/** 长表批量导入的列名别名：只认列名，列顺序不限 */
const TASK_HEADS: Record<string, string[]> = {
  className: ["班级"],
  subjectName: ["科目"],
  assignDate: ["布置日期"],
  dueDate: ["截止日期"],
  note: ["清单备注", "备注"],
  studentNo: ["学号"],
  status: ["状态", "完成情况"],
  checkDate: ["检查日期", "过关日期", "批改日期"],
  planDate: ["计划日期", "应背日期"],
  recordNote: ["登记备注", "批改备注"],
};
const TASK_TITLE_HEADS: Record<DailyKind, string[]> = {
  recitation: ["篇目", "标题", "作业内容"],
  homework: ["作业内容", "标题", "篇目"],
};
const TASK_IMPORT_LABELS: Record<string, string> = {
  className: "班级", subjectName: "科目", title: "标题", part: "段落", assignDate: "布置日期",
  dueDate: "截止日期", note: "清单备注", studentNo: "学号", status: "状态",
  checkDate: "检查日期", planDate: "计划日期", recordNote: "登记备注",
};
/** 与后端 KINDS 的状态集保持一致，仅用于模板示例与说明文案 */
const TASK_STATUSES: Record<DailyKind, string[]> = {
  recitation: ["过关", "待重背", "延背", "免背"],
  homework: ["已交", "未交", "补交", "优秀", "需订正"],
};

function taskRecordsOf(kind: DailyKind, headerCells: string[] | null, body: string[][]) {
  if (!headerCells) return { records: [], error: `这份文件必须带表头行，至少要有「班级, 科目, ${TASK_TITLE_HEADS[kind][0]}」三列。` };
  const at = (names: string[]) => headerCells.findIndex((h) => names.includes(h));
  const idx: Record<string, number> = {
    className: at(TASK_HEADS.className),
    subjectName: at(TASK_HEADS.subjectName),
    title: at(TASK_TITLE_HEADS[kind]),
    part: kind === "recitation" ? at(["段落", "段落范围", "范围"]) : -1,
    assignDate: at(TASK_HEADS.assignDate),
    dueDate: at(TASK_HEADS.dueDate),
    note: at(TASK_HEADS.note),
    studentNo: at(TASK_HEADS.studentNo),
    status: at(TASK_HEADS.status),
    checkDate: at(TASK_HEADS.checkDate),
    planDate: kind === "recitation" ? at(TASK_HEADS.planDate) : -1,
    recordNote: at(TASK_HEADS.recordNote),
  };
  const lack = ["className", "subjectName", "title"].filter((k) => idx[k] < 0).map((k) => TASK_IMPORT_LABELS[k]);
  if (lack.length) return { records: [], error: `表头缺少必填列：${lack.join("、")}。可先点「下载模板」照着填。` };
  if (idx.status >= 0 && idx.studentNo < 0) {
    return { records: [], error: "表头里有「状态」却没有「学号」：登记要成对填；只建清单请把这两列一起删掉。" };
  }
  const pick = (cells: string[], key: string) => (idx[key] >= 0 ? (cells[idx[key]] ?? "").trim() : "");
  const records = body
    .map((cells) => ({
      className: pick(cells, "className"), subjectName: pick(cells, "subjectName"), title: pick(cells, "title"),
      part: pick(cells, "part"), assignDate: pick(cells, "assignDate"), dueDate: pick(cells, "dueDate"),
      note: pick(cells, "note"), studentNo: pick(cells, "studentNo"), status: pick(cells, "status"),
      checkDate: pick(cells, "checkDate"), planDate: pick(cells, "planDate"), recordNote: pick(cells, "recordNote"),
    }))
    .filter((r) => Object.values(r).some((v) => v));
  if (!records.length) return { records: [], error: "没有解析出数据行：每行至少要有班级、科目和标题。" };
  return { records };
}

/** 清单批量导入：一行一个学生，「班级+科目+标题+段落+布置日期」相同的行自动并成同一份清单 */
function TasksImportDialog({ kind, open, classes, subjects, classId, onClose, onDone }: {
  kind: DailyKind; open: boolean; classes: ClassRow[]; subjects: Subject[]; classId: string;
  onClose: () => void; onDone: () => void;
}) {
  const meta = META[kind];
  const labels = { ...TASK_IMPORT_LABELS, title: meta.titleField };
  const cls = (classId ? classes.find((c) => c.id === classId) : undefined)?.name
    ?? classes[0]?.name ?? "高一(1)班";
  const cls2 = classes.find((c) => c.name !== cls)?.name ?? cls;
  const subj = subjects[0]?.name ?? "语文";
  const [pass, pending] = TASK_STATUSES[kind];
  const example = kind === "recitation" ? "《岳阳楼记》" : "第 3 课课后练习";
  const example2 = kind === "recitation" ? "《劝学》" : "第 4 课课后练习";
  const cols = [
    "班级", "科目", meta.titleField, ...(kind === "recitation" ? ["段落"] : []),
    "布置日期", "截止日期", "清单备注", "学号", "状态", "检查日期",
    ...(kind === "recitation" ? ["计划日期"] : []), "登记备注",
  ];
  const row = (o: { c: string; t: string; p?: string; no?: string; st?: string; rn?: string }): (string | number | null)[] => [
    o.c, subj, o.t, ...(kind === "recitation" ? [o.p ?? ""] : []), today(), "", "",
    o.no ?? "", o.st ?? "", today(), ...(kind === "recitation" ? [""] : []), o.rn ?? "",
  ];

  return (
    <ImportDialog
      open={open}
      onClose={onClose}
      onDone={onDone}
      title={`导入${meta.listNoun}`}
      description={`一行 = 一个学生的一次任务；「班级+科目+${labels.title}+${kind === "recitation" ? "段落+" : ""}布置日期」相同的行会自动并成一份清单，不用先建表。一次最多 500 行。`}
      header="班级"
      labels={labels}
      templateName={`${meta.listNoun}导入模板.csv`}
      template={() => [
        cols,
        row({ c: cls, t: example, p: "第四段", no: "20240101", st: pass, rn: "第一段熟练" }),
        row({ c: cls, t: example, p: "第四段", no: "20240102", st: pending, rn: "约定周五补背" }),
        row({ c: cls2, t: example2 }),
      ]}
      toRecords={(headerCells, body) => taskRecordsOf(kind, headerCells, body)}
      guidance={
        <div className="space-y-2">
          <p>同一份清单有多个学生就写多行，<b>班级、科目、{labels.title}</b>{kind === "recitation" ? <b>、段落</b> : null}、布置日期<b>五列写得完全一样</b>即可合并；只要有一列不同就是另一份清单。</p>
          <p><b>学号、状态留空</b>则这行只建清单不登记；状态取值：{TASK_STATUSES[kind].join(" / ")}。学号要和该班「学生档案」里的学号一致，别班学号会被标为未找到。</p>
          <p>日期一律 YYYY-MM-DD，布置日期与{meta.checkNoun}留空都按今天；<b>清单备注</b>写进{meta.listNoun}本身，<b>登记备注</b>写进该生的登记。</p>
          <p>五列能匹配到已有{meta.listNoun}时不会重复创建，登记直接并入（{meta.listNoun}的截止日期与备注不会被改写）；该生已登记则覆盖状态，{kind === "recitation" ? "背诵次数保持不变" : "批改结果按最新一次"}。</p>
          <p>科目×班级必须在你的任教范围内（管理员为全校），越权行会逐行标注原因并跳过，不影响其他行写入。</p>
        </div>
      }
      submit={(rows, dryRun) => apiPost<ImportResult>(`${kind}.import-lists`, { rows, dryRun })}
    />
  );
}
