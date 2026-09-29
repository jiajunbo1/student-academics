import { useCallback, useEffect, useState } from "react";
import { Users, Layers, UserRound, ScrollText, Trophy, Inbox } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiGet, errorMessage, fmtScore } from "../api";
import type { DashboardData } from "../types";
import { EmptyState, PageHeader, Panel, Pill, StatCard, TableSkeleton, useThemeColors } from "../components/app-ui";

type Tab = "dashboard" | "students" | "scores" | "settings";

/** 图表配色全部从 globals.css 的 token 取，主题切换自动跟随 */
const CHART_VARS = ["--chart-1", "--muted-foreground", "--border"];

export default function Dashboard({ onChangeTab, isAdmin }: { onChangeTab: (t: Tab) => void; isAdmin: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const C = useThemeColors(CHART_VARS);

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
        <PageHeader title="总览看板" description={isAdmin ? "全校学生与成绩的整体情况" : "你任教的科目与班级内的学生与成绩"} />
        <EmptyState
          icon={Inbox}
          title="还没有任何数据"
          description={isAdmin
            ? "管理员可以在「系统设置」一键导入演示数据先体验，或到「学生档案」逐个录入学生。"
            : "你的任教范围里还没有学生，请联系管理员在「系统设置」勾选任教科目与班级。"}
          action={
            isAdmin ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onChangeTab("students")}>录入学生档案</Button>
                <Button onClick={() => onChangeTab("settings")}>前往系统设置</Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => onChangeTab("scores")}>前往成绩管理</Button>
            )
          }
        />
      </div>
    );
  }

  const passCount = data.subjectAvgs.filter((s) => s.avg >= 90).length;
  const passRate = data.subjectAvgs.length ? Math.round((passCount / data.subjectAvgs.length) * 100) : 0;
  const overallAvg = data.subjectAvgs.length
    ? Math.round(data.subjectAvgs.reduce((sum, s) => sum + s.avg, 0) / data.subjectAvgs.length * 10)
    : 0;
  const best = data.subjectAvgs.reduce<(typeof data.subjectAvgs)[number] | null>(
    (acc, s) => (!acc || s.avg > acc.avg ? s : acc), null);
  const tooltipStyle = {
    background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10,
    fontSize: 12, color: "var(--popover-foreground)",
  } as const;

  return (
    <div className="space-y-4">
      <PageHeader title="总览看板" eyebrow={isAdmin ? "全校概览" : "任教范围概览"} description={isAdmin ? "全校学生与成绩的整体情况" : "你任教的科目与班级内的学生与成绩"}>
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

      <Panel
        title="各科平均分"
        description={best ? `最高：${best.name} ${fmtScore(Math.round(best.avg * 10))}` : undefined}
        action={<Pill tone={passRate >= 60 ? "success" : "warning"}>及格科目 {passRate}%</Pill>}
        contentClassName="h-80"
      >
        {data.subjectAvgs.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.subjectAvgs} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C["--border"]} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: C["--muted-foreground"] }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 150]} tick={{ fontSize: 12, fill: C["--muted-foreground"] }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.35 }} contentStyle={tooltipStyle} formatter={(v) => [`${v} 分`, "平均分"]} />
              <Bar dataKey="avg" fill={C["--chart-1"]} radius={[5, 5, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        ) : <EmptyState icon={Trophy} title="尚无成绩数据" description="录入一次考试的成绩后，这里会显示各科平均分对比。" />}
      </Panel>

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
              <span className="text-muted-foreground">最近一次考试平均分</span>
              <span className="font-semibold">{fmtScore(overallAvg)} / 150</span>
            </div>
            <Progress value={overallAvg / 15} className="mt-2" />
          </div>
        </div>
      </Panel>
    </div>
  );
}
