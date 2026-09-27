import type { ReactNode } from "react";
import { MonitorSmartphone, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useTheme, type ThemeMode } from "../theme";

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const Icon = mode === "system" ? MonitorSmartphone : mode === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label="切换主题">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>外观</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  className,
  contentClassName,
  children,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("gap-0 border shadow-soft", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            {description ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <CardContent className={cn("p-5", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

const TONES = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  info: "bg-info/12 text-info",
  danger: "bg-destructive/10 text-destructive",
} as const;

export const TONE_CLASS = TONES;
export type Tone = keyof typeof TONES;

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
  onClick,
}: {
  icon: typeof Sun;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full rounded-xl text-left transition",
        onClick && "hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Card className="border shadow-soft transition group-hover:border-primary/40">
        <CardContent className="flex items-start gap-3 p-4">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", TONES[tone])}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-2xl font-semibold leading-tight tracking-tight">{value}</p>
            {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        </CardContent>
      </Card>
    </Wrapper>
  );
}

const PASS_RATIO = 0.6;
const EXCELLENT_RATIO = 0.85;

export function scoreTenthsTone(tenths: number, maxTenths = 1500): Tone {
  if (tenths >= maxTenths * EXCELLENT_RATIO) return "success";
  if (tenths >= maxTenths * PASS_RATIO) return "info";
  return "danger";
}

export function ScoreText({
  tenths,
  max = 1500,
  className,
}: {
  tenths: number | null | undefined;
  max?: number;
  className?: string;
}) {
  if (tenths === null || tenths === undefined) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  const tone = scoreTenthsTone(tenths, max);
  const text = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <span className={cn("font-semibold tabular-nums", text, className)}>
      {(tenths / 10).toFixed(1)}
      {tone === "danger" ? <span className="ml-1 text-[10px] font-normal">待提高</span> : null}
    </span>
  );
}

export function Pill({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export const ATTENDANCE_TONE: Record<string, Tone> = {
  出勤: "success",
  迟到: "warning",
  早退: "warning",
  请假: "info",
  缺勤: "danger",
};

export const STUDENT_STATUS_TONE: Record<string, Tone> = {
  在读: "success",
  休学: "warning",
  转班: "info",
  毕业: "primary",
};

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2.5 p-1" aria-busy="true" aria-label="加载中">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn("h-6", c === 0 ? "w-32" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Sun;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>{children}</div>
  );
}
