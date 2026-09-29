import { useCallback, useEffect, useState } from "react";
import { BookMarked, ClipboardList, Inbox, NotebookPen, TrendingUp, Trophy } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, errorMessage, fmtScore } from "../api";
import type { DailyKind, PortalDailyItem, PortalData, PortalRecord } from "../types";
import {
  EmptyState, PageHeader, Panel, Pill, ScoreText, StatCard, STUDENT_STATUS_TONE,
  TableSkeleton, useThemeColors,
} from "../components/app-ui";
import { SETTLED, toneOf } from "./Daily";

/** 折线图取色同样从 token 来，保证与看板一致 */
const CHART_VARS = ["--chart-1", "--warning", "--muted-foreground", "--border"];

const rankLabel = (r: PortalRecord) => (r.rank ? `第 ${r.rank} 名 / ${r.classSize} 人` : "未参加本次考试");

export default function Portal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const C = useThemeColors(CHART_VARS);
  const palette = { mine: C["--chart-1"], avg: C["--warning"], axis: C["--muted-foreground"], grid: C["--border"] };

  const load = useCallback(async () => {
    setError("");
    try { setData(await apiGet<PortalData>("portal.me")); }
    catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) {
    return (
      <div>
        <PageHeader title="我的学业" />
        <EmptyState icon={Inbox} title="读取失败" description={error}
          action={<Button variant="outline" onClick={() => void load()}>重试</Button>} />
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <PageHeader title="我的学业" description="正在读取本人成绩与记录…" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl border bg-card" />)}
        </div>
        <Panel className="mt-4"><TableSkeleton rows={5} cols={3} /></Panel>
      </div>
    );
  }

  const { student, records } = data;
  const latest = records.length ? records[records.length - 1] : null;
  const first = records.length ? records[0] : null;
  const delta = latest && first && latest !== first ? +(latest.total / 10 - first.total / 10).toFixed(1) : null;

  const tooltipStyle = {
    background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10,
    fontSize: 12, color: "var(--popover-foreground)",
  } as const;

  return (
    <div className="space-y-4">
      <PageHeader
        title="我的学业"
        eyebrow={student.className || "未分班"}
        description={`${student.name} · 学号 ${student.studentNo}`}
      >
        <Pill tone={STUDENT_STATUS_TONE[student.status] ?? "info"}>{student.status}</Pill>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard icon={ClipboardList} label="考试次数" value={records.length} hint={latest ? `最近：${latest.examName}` : "尚无考试成绩"} />
        <StatCard icon={Trophy} label="最近总分" value={latest ? fmtScore(latest.total) : "—"} tone="warning"
          hint={latest ? rankLabel(latest) : "等待成绩录入"} />
        <StatCard icon={TrendingUp} label="总分变化" value={delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
          tone={delta === null ? "info" : delta >= 0 ? "success" : "danger"}
          hint={delta === null ? "至少两次考试后显示" : `对比 ${first?.examName ?? ""}`} />
      </div>

      <Panel title="成绩趋势" description={latest ? `最近一次：${latest.examName} · ${latest.examDate}` : undefined}
        contentClassName="h-72">
        {records.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={records.map((r) => ({ name: r.examName, mine: +(r.total / 10).toFixed(1), avg: r.classAvg }))}
              margin={{ top: 6, right: 10, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: palette.axis }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 12, fill: palette.axis }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, key) => [`${v} 分`, key === "mine" ? "我的总分" : "班级平均"]} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "mine" ? "我的总分" : "班级平均")} />
              <Line type="monotone" dataKey="mine" stroke={palette.mine} strokeWidth={2.4} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="avg" stroke={palette.avg} strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyState icon={ClipboardList} title="还没有成绩" description="老师录入成绩后，这里会显示你与班级平均分的走势。" />}
      </Panel>

      {latest ? (
        <Panel title="最近一次各科成绩" description={`${latest.examName} · ${latest.examDate}`} contentClassName="p-3 md:p-0">
          <Table className="responsive-table data-table">
            <TableHeader>
              <TableRow>
                <TableHead>科目</TableHead>
                <TableHead className="text-right">分数</TableHead>
                <TableHead className="text-right">与及格线（90）差距</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.subjects.filter((s) => latest.cells[s.id] !== undefined && latest.cells[s.id] !== null).map((s) => {
                const mine = latest.cells[s.id] as number;
                const gap = +(mine / 10 - 90).toFixed(1);
                return (
                  <TableRow key={s.id}>
                    <TableCell data-label="科目">{s.name}</TableCell>
                    <TableCell data-label="分数" className="text-right"><ScoreText tenths={mine} heat /></TableCell>
                    <TableCell data-label="与及格线差距" className="text-right">
                      <Pill tone={gap >= 0 ? "success" : "danger"}>{gap >= 0 ? `+${gap}` : gap}</Pill>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell data-label="科目"><span className="font-medium">合计 / 平均</span></TableCell>
                <TableCell data-label="分数" className="text-right">
                  <span className="font-medium">{fmtScore(latest.total)}</span>
                  <span className="ml-1 text-xs text-muted-foreground">（{latest.count} 科）</span>
                </TableCell>
                <TableCell data-label="与及格线差距" className="text-right">
                  <Pill tone={latest.total / 10 >= latest.classAvg ? "success" : "warning"}>
                    总分 {fmtScore(latest.total)} · 班级 {latest.classAvg}
                  </Pill>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <DailyPanel
          kind="recitation"
          icon={BookMarked} title="背诵登记" description="最近 30 篇，按布置日期倒序"
          items={data.recitations} emptyText="老师还没有登记你的背诵结果。"
        />
        <DailyPanel
          kind="homework"
          icon={NotebookPen} title="作业完成情况" description="最近 30 次，按布置日期倒序"
          items={data.homeworks} emptyText="老师还没有登记你的作业完成情况。"
        />
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        学生账号只能查看本人的档案摘要与成绩，无法修改任何数据。如有疑问请联系班主任。
      </p>
    </div>
  );
}

function DailyPanel({ kind, icon: Icon, title, description, items, emptyText }: {
  kind: DailyKind; icon: typeof Inbox; title: string; description: string; items: PortalDailyItem[]; emptyText: string;
}) {
  const settled = new Set(SETTLED[kind]);
  const pending = items.filter((i) => !settled.has(i.status)).length;
  return (
    <Panel
      title={title}
      description={items.length ? description : "老师登记后这里会显示本人的结果"}
      action={items.length
        ? <Pill tone={pending ? "warning" : "success"}>{pending ? `待完成 ${pending} 项` : "全部完成"}</Pill>
        : undefined}
      contentClassName="p-3 md:p-0"
    >
      {!items.length ? (
        <EmptyState icon={Icon} title={`暂无${title}记录`} description={emptyText} />
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <Table className="responsive-table data-table">
            <TableHeader>
              <TableRow>
                <TableHead>内容</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="w-24 text-right">日期</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={`${i.title}-${i.assignDate}-${i.checkDate}`}>
                  <TableCell data-label="内容">
                    <span className="block font-medium">{i.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[i.subjectName, i.part, i.note].filter(Boolean).join(" · ")}
                    </span>
                  </TableCell>
                  <TableCell data-label="状态">
                    <Pill tone={toneOf(i.status)}>{i.status}</Pill>
                    {i.attempt > 1 ? <span className="ml-1 text-[11px] text-muted-foreground">第 {i.attempt} 次</span> : null}
                  </TableCell>
                  <TableCell data-label="日期" className="text-right text-xs tabular-nums text-muted-foreground">
                    {i.checkDate || i.assignDate}
                    {i.planDate ? <span className="block text-warning">约 {i.planDate}</span> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
