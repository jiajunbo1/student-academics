import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Users, Layers, UserRound, ScrollText, Trophy, Inbox } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiGet, errorMessage, fmtScore } from "../api";
import type { DashboardData } from "../types";
import { CardSkeleton, ChartLegend, EmptyState, PageHeader, Panel, PASS_SCORE, PassLine, Pill, scoreTone, SCORE_MAX, StatBar, StatCard, TableSkeleton, useThemeColors } from "../components/app-ui";

type Tab = "dashboard" | "students" | "scores" | "settings";

/** 图表配色全部从 globals.css 的 token 取，主题切换自动跟随 */
const CHART_VARS = ["--chart-1", "--destructive", "--muted-foreground", "--border"];

export default function Dashboard({ onChangeTab, isAdmin }: { onChangeTab: (t: Tab) => void; isAdmin: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const C = useThemeColors(CHART_VARS);
  const mobile = useIsMobile();

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await apiGet<DashboardData>("dashboard");
      setData(r);
    } catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // 四种状态共用同一份页头：过去各写一遍，加载态少 eyebrow，切状态时标题会跳。
  const header = (actions?: ReactNode) => (
    <PageHeader
      title="总览看板"
      eyebrow={isAdmin ? "全校概览" : "任教范围概览"}
      description={isAdmin ? "全校学生与成绩的整体情况" : "你任教班级内的学生与全部科目成绩"}
    >
      {actions}
    </PageHeader>
  );

  if (error) {
    return (
      <div>
        {header()}
        <EmptyState icon={Inbox} title="看板加载失败" description={error} action={<Button variant="outline" onClick={() => void load()}>重试</Button>} />
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        {header()}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <Panel className="mt-4"><TableSkeleton rows={5} cols={3} /></Panel>
      </div>
    );
  }

  if (data.counts.students === 0) {
    return (
      <div>
        {header()}
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

  const passCount = data.subjectAvgs.filter((s) => s.avg >= PASS_SCORE).length;
  const passRate = data.subjectAvgs.length ? Math.round((passCount / data.subjectAvgs.length) * 100) : 0;
  const overallAvg = data.subjectAvgs.length
    ? Math.round(data.subjectAvgs.reduce((sum, s) => sum + s.avg, 0) / data.subjectAvgs.length * 10)
    : 0;
  /** StatBar 要的是"分"，而 overallAvg 按库里的十分之一分存 */
  const overallAvgScore = +(overallAvg / 10).toFixed(1);
  const best = data.subjectAvgs.reduce<(typeof data.subjectAvgs)[number] | null>(
    (acc, s) => (!acc || s.avg > acc.avg ? s : acc), null);
  const tooltipStyle = {
    background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10,
    fontSize: 12, color: "var(--popover-foreground)",
  } as const;

  return (
    <div className="page-in space-y-4">
      {header(
        data.lastExam ? (
          <Pill tone="primary">{data.lastExam.name} · {data.lastExam.exam_date}</Pill>
        ) : null
      )}

      <div className={isAdmin ? "grid grid-cols-2 gap-3 lg:grid-cols-4" : "grid grid-cols-2 gap-3 lg:grid-cols-3"}>
        <StatCard icon={Users} label="学生总数" value={data.counts.students} hint={`${data.counts.classes} 个班级`} onClick={() => onChangeTab("students")} />
        <StatCard icon={Layers} label={isAdmin ? "班级数" : "任教班级"} value={data.counts.classes} tone="info"
          hint={isAdmin ? "按年级编排" : "按科目授权"} onClick={() => onChangeTab("settings")} />
        {isAdmin && <StatCard icon={UserRound} label="教师账号" value={data.counts.teachers} tone="success" hint="含管理员" onClick={() => onChangeTab("settings")} />}
        <StatCard className={isAdmin ? undefined : "col-span-2 lg:col-span-1"} icon={ScrollText} label="考试数"
          value={data.counts.exams} tone="warning" hint={data.lastExam ? `最近：${data.lastExam.name}` : "尚未录入成绩"} onClick={() => onChangeTab("scores")} />
      </div>

      <Panel
        title="各科平均分"
        description={best ? `最高：${best.name} ${fmtScore(Math.round(best.avg * 10))}` : undefined}
        action={<Pill tone={passRate >= 60 ? "success" : "warning"}>及格科目 {passCount} / {data.subjectAvgs.length} 科</Pill>}
      >
        {data.subjectAvgs.length ? (
          /* 窄屏用横向条形列表：柱状图的科目名在 390px 宽里会挤成一团，而且隐藏的 ResponsiveContainer 会以 0×0 挂载 */
          <div className="space-y-3">
            {mobile ? (
              <div className="space-y-2.5">
                {data.subjectAvgs.map((s) => (
                  <div key={s.name} className="flex items-center gap-2.5">
                    <span className="w-14 shrink-0 truncate text-xs text-muted-foreground">{s.name}</span>
                    <StatBar value={s.avg} max={SCORE_MAX} threshold={PASS_SCORE} wide hideCount />
                    <span className={cn("w-11 shrink-0 text-right text-xs font-semibold tabular-nums",
                      scoreTone(s.avg) === "danger" && "text-destructive")}>
                      {s.avg.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.subjectAvgs} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C["--border"]} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: C["--muted-foreground"] }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, SCORE_MAX]} tick={{ fontSize: 12, fill: C["--muted-foreground"] }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.35 }} contentStyle={tooltipStyle} formatter={(v) => [`${v} 分`, "平均分"]} />
                    <PassLine />
                    <Bar dataKey="avg" fill={C["--chart-1"]} radius={[5, 5, 0, 0]} maxBarSize={38} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <ChartLegend
              items={[
                { label: "平均分", color: C["--chart-1"], shape: "square" },
                { label: `及格线 ${PASS_SCORE} 分`, color: C["--destructive"], shape: mobile ? "tick" : "dash" },
              ]}
            />
          </div>
        ) : <EmptyState icon={Trophy} title="尚无成绩数据" description="录入一次考试的成绩后，这里会显示各科平均分对比。" />}
      </Panel>

      <Panel title="关键指标" description="按当前数据即时汇总；细竖线是及格线，达线转绿">
        <div className="grid gap-5 sm:grid-cols-2">
          <StatBar label={`达及格线的科目占比（平均分 ≥ ${PASS_SCORE}）`} value={passRate} max={100} />
          <StatBar label="最近一次考试平均分" value={overallAvgScore} max={SCORE_MAX} threshold={PASS_SCORE}
            text={`${fmtScore(overallAvg)} / ${SCORE_MAX}`} />
        </div>
      </Panel>
    </div>
  );
}
