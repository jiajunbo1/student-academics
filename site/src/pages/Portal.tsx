import { useCallback, useEffect, useState } from "react";
import {
  Award, BookOpenCheck, CalendarCheck, ClipboardList, Inbox, Sprout, TrendingUp, Trophy, UserRound,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, errorMessage, fmtScore } from "../api";
import type { PortalData, PortalRecord } from "../types";
import {
  ATTENDANCE_TONE, EmptyState, PageHeader, Panel, Pill, ScoreText, StatCard, STUDENT_STATUS_TONE,
  TableSkeleton, TONE_CLASS,
} from "../components/app-ui";
import { useTheme } from "../theme";

const PALETTE = {
  light: { mine: "#1663c7", avg: "#b25e09", axis: "#667085", grid: "#e2e6ef" },
  dark: { mine: "#6aa6ff", avg: "#f5b544", axis: "#98a3b8", grid: "#ffffff26" },
};

const rankLabel = (r: PortalRecord) => (r.rank ? `第 ${r.rank} 名 / ${r.classSize} 人` : "未参加本次考试");

export default function Portal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const { resolved } = useTheme();
  const palette = PALETTE[resolved === "dark" ? "dark" : "light"];

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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl border bg-card" />)}
        </div>
        <Panel className="mt-4"><TableSkeleton rows={5} cols={3} /></Panel>
      </div>
    );
  }

  const { student, records } = data;
  const latest = records.length ? records[records.length - 1] : null;
  const first = records.length ? records[0] : null;
  const delta = latest && first && latest !== first ? +(latest.total / 10 - first.total / 10).toFixed(1) : null;
  const attended = data.attSummary.find((a) => a.name === "出勤")?.value ?? 0;
  const attTotal = data.attSummary.reduce((s, a) => s + a.value, 0);

  const tooltipStyle = {
    background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10,
    fontSize: 12, color: "var(--popover-foreground)",
  } as const;

  return (
    <div className="space-y-4">
      <PageHeader
        title="我的学业"
        description={`${student.name} · 学号 ${student.studentNo} · ${student.className || "未分班"}`}
      >
        <Pill tone={STUDENT_STATUS_TONE[student.status] ?? "info"}>{student.status}</Pill>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={ClipboardList} label="考试次数" value={records.length} hint={latest ? `最近：${latest.examName}` : "尚无考试成绩"} />
        <StatCard icon={Trophy} label="最近总分" value={latest ? fmtScore(latest.total) : "—"} tone="warning"
          hint={latest ? rankLabel(latest) : "等待成绩录入"} />
        <StatCard icon={TrendingUp} label="总分变化" value={delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
          tone={delta === null ? "info" : delta >= 0 ? "success" : "danger"}
          hint={delta === null ? "至少两次考试后显示" : `对比 ${first?.examName ?? ""}`} />
        <StatCard icon={CalendarCheck} label="出勤记录" value={attTotal} tone="info"
          hint={attTotal ? `出勤 ${attended} 次` : "暂无签到"} />
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
          <Table className="responsive-table">
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
                    <TableCell data-label="分数" className="text-right"><ScoreText tenths={mine} /></TableCell>
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
                  <Pill tone={latest.avg >= latest.classAvg ? "success" : "warning"}>
                    均分 {latest.avg} · 班级 {latest.classAvg}
                  </Pill>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="出勤记录" description={attTotal ? `共 ${attTotal} 条` : undefined} contentClassName="space-y-2.5">
          {data.attSummary.length ? (
            <div className="flex flex-wrap gap-2">
              {data.attSummary.map((a) => (
                <span key={a.name} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${TONE_CLASS[ATTENDANCE_TONE[a.name] ?? "info"]}`}>
                  {a.name} {a.value} 次
                </span>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">暂无出勤记录。</p>}
          {data.attendances.length ? (
            <ul className="divide-y">
              {data.attendances.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="text-muted-foreground">{a.att_date}</span>
                  <Pill tone={ATTENDANCE_TONE[a.status] ?? "info"}>{a.status}</Pill>
                  {a.remark ? <span className="truncate text-xs text-muted-foreground">{a.remark}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel title="素质发展" description="奖惩、活动与教师评语" contentClassName="space-y-3">
          {data.discSummary.length ? (
            <div className="flex flex-wrap gap-2">
              {data.discSummary.map((d) => (
                <Badge key={d.name} variant={d.name === "奖励" ? "default" : "outline"} className="gap-1">
                  <Award className="size-3" /> {d.name} {d.value} 次
                </Badge>
              ))}
            </div>
          ) : null}
          {data.disciplines.length ? (
            <ul className="space-y-2">
              {data.disciplines.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-start gap-2.5 rounded-xl border bg-card px-3 py-2.5">
                  <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${d.type === "奖励" ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive"}`}>
                    <Award className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{d.content}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{d.event_date}</p>
                  </div>
                  <Pill tone={d.type === "奖励" ? "success" : "danger"}>{d.type}</Pill>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">暂无奖惩记录。</p>}
          {data.activities.length ? (
            <ul className="space-y-2">
              {data.activities.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-start gap-2.5 rounded-xl border bg-card px-3 py-2.5">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-info/12 text-info">
                    <Sprout className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{a.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.category} · {a.event_date}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">暂无活动记录。</p>}
        </Panel>
      </div>

      <Panel title="教师评语" description={data.reviews.length ? `${data.reviews.length} 条` : undefined} contentClassName="space-y-2.5">
        {data.reviews.length ? data.reviews.map((r) => (
          <div key={r.id} className="rounded-xl border bg-card px-3.5 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserRound className="size-3.5" /> {r.teacher_name || "教师"} · {r.term} · {r.created_at.slice(0, 10)}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{r.content}</p>
          </div>
        )) : <EmptyState icon={BookOpenCheck} title="还没有评语" description="班主任写的学期评语会显示在这里。" />}
      </Panel>

      <p className="px-1 text-xs text-muted-foreground">
        学生账号只能查看本人的档案摘要、成绩、出勤与素质记录，无法修改任何数据。如有疑问请联系班主任。
      </p>
    </div>
  );
}
