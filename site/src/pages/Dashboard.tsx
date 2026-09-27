import { useCallback, useEffect, useState } from "react";
import {
  Users, Layers, UserRound, ScrollText, TrendingUp, Sparkles, Award, CalendarX,
  Inbox, Trophy,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiGet, errorMessage, fmtScore } from "../api";
import type { DashboardData } from "../types";
import { EmptyState, PageHeader, Panel, Pill, StatCard, ATTENDANCE_TONE, TableSkeleton } from "../components/app-ui";
import { useTheme } from "../theme";

type Tab = "dashboard" | "students" | "scores" | "attendance" | "quality" | "settings";

const PALETTE = {
  light: { bars: "#1663c7", pie: ["#0a7d5a", "#b25e09", "#0a6fa8", "#7a5cff", "#d92d20"], axis: "#667085", grid: "#e2e6ef" },
  dark: { bars: "#6aa6ff", pie: ["#4ad2a5", "#f5b544", "#5cb8f0", "#a68bff", "#ff6b6b"], axis: "#98a3b8", grid: "#ffffff26" },
};

export default function Dashboard({ onChangeTab }: { onChangeTab: (t: Tab) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const { resolved } = useTheme();
  const palette = PALETTE[resolved === "dark" ? "dark" : "light"];

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await apiGet<DashboardData>("dashboard");
      setData(r);
    } catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) {
    return (
      <div>
        <PageHeader title="总览看板" />
        <EmptyState icon={Inbox} title="看板加载失败" description={error} action={<Button variant="outline" onClick={() => void load()}>重试</Button>} />
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <PageHeader title="总览看板" description="正在读取统计数据…" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl border bg-card" />)}
        </div>
        <Panel className="mt-4"><TableSkeleton rows={5} cols={3} /></Panel>
      </div>
    );
  }

  if (data.counts.students === 0) {
    return (
      <div>
        <PageHeader title="总览看板" description="全校学生、成绩与出勤的整体情况" />
        <EmptyState
          icon={Inbox}
          title="还没有任何数据"
          description="管理员可以在「系统设置」一键导入演示数据先体验，或到「学生档案」逐个录入学生。"
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onChangeTab("students")}>录入学生档案</Button>
              <Button onClick={() => onChangeTab("settings")}>前往系统设置</Button>
            </div>
          }
        />
      </div>
    );
  }

  const attTotal = data.attStats.reduce((sum, s) => sum + s.value, 0);
  const present = data.attStats.find((s) => s.name === "出勤")?.value ?? 0;
  const attendRate = attTotal ? Math.round((present / attTotal) * 100) : 0;
  const passCount = data.subjectAvgs.filter((s) => s.avg >= 90).length;
  const passRate = data.subjectAvgs.length ? Math.round((passCount / data.subjectAvgs.length) * 100) : 0;
  const best = data.subjectAvgs.reduce<(typeof data.subjectAvgs)[number] | null>(
    (acc, s) => (!acc || s.avg > acc.avg ? s : acc), null);
  const tooltipStyle = {
    background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10,
    fontSize: 12, color: "var(--popover-foreground)",
  } as const;

  return (
    <div className="space-y-4">
      <PageHeader title="总览看板" description="全校学生、成绩与出勤的整体情况">
        {data.lastExam ? (
          <Pill tone="primary">{data.lastExam.name} · {data.lastExam.exam_date}</Pill>
        ) : null}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="学生总数" value={data.counts.students} hint={`${data.counts.classes} 个班级`} onClick={() => onChangeTab("students")} />
        <StatCard icon={Layers} label="班级数" value={data.counts.classes} tone="info" hint="按年级编排" onClick={() => onChangeTab("settings")} />
        <StatCard icon={UserRound} label="教师账号" value={data.counts.teachers} tone="success" hint="含管理员" onClick={() => onChangeTab("settings")} />
        <StatCard icon={ScrollText} label="考试数" value={data.counts.exams} tone="warning" hint={data.lastExam ? `最近：${data.lastExam.name}` : "尚未录入成绩"} onClick={() => onChangeTab("scores")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="各科平均分"
          description={best ? `最高：${best.name} ${fmtScore(Math.round(best.avg * 10))}` : undefined}
          className="lg:col-span-3"
          contentClassName="h-72"
          action={<Pill tone={passRate >= 60 ? "success" : "warning"}>及格科目 {passRate}%</Pill>}
        >
          {data.subjectAvgs.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.subjectAvgs} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: palette.axis }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 150]} tick={{ fontSize: 12, fill: palette.axis }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.35 }} contentStyle={tooltipStyle} formatter={(v) => [`${v} 分`, "平均分"]} />
                <Bar dataKey="avg" fill={palette.bars} radius={[6, 6, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={Trophy} title="尚无成绩数据" description="录入一次考试的成绩后，这里会显示各科平均分对比。" />}
        </Panel>

        <Panel
          title="出勤分布"
          description={attTotal ? `共 ${attTotal} 条记录` : undefined}
          className="lg:col-span-2"
          contentClassName="h-72"
          action={<Pill tone={attendRate >= 95 ? "success" : attendRate >= 85 ? "warning" : "danger"}>出勤率 {attendRate}%</Pill>}
        >
          {data.attStats.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.attStats} dataKey="value" nameKey="name" innerRadius={54} outerRadius={84} paddingAngle={2} strokeWidth={0}>
                  {data.attStats.map((_, i) => <Cell key={i} fill={palette.pie[i % palette.pie.length]} />)}
                </Pie>
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "var(--foreground)" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 条`, ""]} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={CalendarX} title="尚无出勤记录" description="在「出勤管理」里签到后即可查看分布。" />}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="最近奖惩" contentClassName="space-y-2.5">
          {data.recentDiscipline.length ? data.recentDiscipline.map((d) => (
            <div key={d.id} className="flex items-start gap-3 rounded-xl border bg-card px-3.5 py-3">
              <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${d.type === "奖励" ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive"}`}>
                <Award className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{d.content}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{d.studentName} · {d.event_date}</p>
              </div>
              <Pill tone={d.type === "奖励" ? "success" : "danger"}>{d.type}</Pill>
            </div>
          )) : <p className="text-sm text-muted-foreground">暂无奖惩记录。</p>}
        </Panel>

        <Panel title="最近活动" contentClassName="space-y-2.5">
          {data.recentActivity.length ? data.recentActivity.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-xl border bg-card px-3.5 py-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-info/12 text-info">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{a.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.studentName} · {a.event_date}</p>
              </div>
              <Pill tone={ATTENDANCE_TONE[a.category] ? "info" : "primary"}>{a.category}</Pill>
            </div>
          )) : <p className="text-sm text-muted-foreground">暂无活动记录。</p>}
        </Panel>
      </div>

      <Panel title="关键指标" description="按当前数据即时汇总">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">科目及格率（平均分 ≥ 90）</span>
              <span className="font-semibold">{passRate}%</span>
            </div>
            <Progress value={passRate} className="mt-2" />
          </div>
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">整体出勤率</span>
              <span className="font-semibold">{attendRate}%</span>
            </div>
            <Progress value={attendRate} className="mt-2" />
          </div>
        </div>
      </Panel>
    </div>
  );
}
