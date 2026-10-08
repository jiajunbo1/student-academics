import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarIcon, MonitorSmartphone, Moon, Sun, TriangleAlert } from "lucide-react";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableFooter, TableHead, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { useTheme, type GlassMode, type ThemeMode } from "../theme";

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

/** 手机端底部栏 / 抽屉 / 页头的玻璃质感，两种都能随时切，不留死 */
export const GLASS_OPTIONS: { value: GlassMode; label: string; hint: string }[] = [
  { value: "frosted", label: "磨砂玻璃", hint: "均匀虚化" },
  { value: "liquid", label: "液态玻璃", hint: "边缘折射" },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, setMode, glass, setGlass } = useTheme();
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
        <DropdownMenuSeparator />
        <DropdownMenuLabel>玻璃质感</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={glass} onValueChange={(v) => setGlass(v as GlassMode)}>
          {GLASS_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className="flex-1">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.hint}</span>
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
  eyebrow,
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-head mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="brand-eyebrow">{eyebrow}</p> : null}
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** 班级/科目色标用的 CSS 变量名 */
export const MARK_COLOR_VARS = ["--class-1", "--class-2", "--class-3", "--class-4", "--class-5"];

/** 班级/科目色标：色环、色点用 var()，SVG 图表要用解析后的真色 */
export const MARK_COLORS = MARK_COLOR_VARS.map((v) => `var(${v})`);

/**
 * 按名称排序后顺序取色：班级数在色板容量内时保证不撞色，
 * 且任何页面只要拿到同一份班级名单，取到的颜色都一致。
 */
export function useMarkColors(keys: string[]): (key: string) => string {
  const signature = keys.join("|");
  const order = useMemo(
    () => [...new Set(signature ? signature.split("|") : [])].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    [signature],
  );
  return useCallback(
    (key: string) => {
      const i = order.indexOf(key);
      return MARK_COLORS[(i < 0 ? 0 : i) % MARK_COLORS.length];
    },
    [order],
  );
}

/** 同 useMarkColors 的确定性取色，但返回可直接写进 SVG 的真色 */
export function useMarkColorValues(keys: string[]): (key: string) => string {
  const colorOf = useMarkColors(keys);
  const C = useThemeColors(MARK_COLOR_VARS);
  return useCallback(
    (key: string) => C[colorOf(key).slice(4, -1)] || C["--class-1"] || "transparent",
    [C, colorOf],
  );
}

/** 班级色点：与 ClassMark 同色，用于班级名前的标识 */
export function ClassDot({ color, className }: { color: string; className?: string }) {
  return <i aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

/** 班级色标头像：同班同色，列表、抽屉与花名册共用 */
export function ClassMark({ name, color, large }: { name: string; color: string; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${large ? "size-10 text-sm" : "size-6 text-[11px]"}`}
      style={{ color, background: `color-mix(in oklab, ${color} 14%, transparent)` }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** SVG 的 fill 属性不认 var()，图表取色要先从 CSS 变量解析出真实颜色 */
export function useThemeColors(names: string[]): Record<string, string> {
  const { resolved } = useTheme();
  const key = names.join("|");
  const [colors, setColors] = useState<Record<string, string>>({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const name of key.split("|")) {
      next[name] = cs.getPropertyValue(name).trim() || "transparent";
    }
    setColors(next);
  }, [resolved, key]);
  return colors;
}

/**
 * 趋势图纵轴兜底：只有一次考试（或分数几乎相同）时，recharts 的 auto 会把刻度
 * 挤成 516/519/522 这种没有信息量的窄带，这里至少撑开 ±5 并取整到 5 或 10。
 */
export function trendDomain(values: (number | null | undefined)[], ceil?: number): [number, number] {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!xs.length) return [0, ceil ?? 100];
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const pad = Math.max((hi - lo) * 0.2, 5);
  const step = pad >= 10 ? 10 : 5;
  let min = Math.max(0, Math.floor((lo - pad) / step) * step);
  let max = Math.ceil((hi + pad) / step) * step;
  if (ceil != null && max > ceil) max = ceil;
  // 轴高至少两个刻度；被满分截断时改为向下补足，不越过 ceil
  if (max - min < step * 2) {
    max = Math.min(ceil ?? Infinity, Math.max(max, min + step * 2));
    min = Math.max(0, max - step * 2);
  }
  return [min, max];
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
    <Card className={cn("gap-0 border py-0 shadow-soft", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5 max-md:px-4 max-md:py-3">
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

/**
 * 窄屏语义卡片：替代表格的 data-label 机械折叠，主标题 / 副信息 / 状态 / 操作各有其位。
 * 宽屏仍用表格，两者由页面按断点二选一渲染。
 */
export function RowCard({
  leading,
  title,
  subtitle,
  right,
  meta,
  children,
  actions,
  className,
  onClick,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      data-slot="row-card"
      onClick={onClick}
      className={cn(
        "card-lift rounded-xl border bg-card p-3.5 shadow-soft",
        onClick && "cursor-pointer select-none",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        {leading}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-snug">{title}</p>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0 pl-1 text-right">{right}</div> : null}
      </div>
      {meta ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{meta}</div>
      ) : null}
      {children ? <div className="mt-2.5">{children}</div> : null}
      {actions ? (
        <div className="mt-3 flex items-center justify-end gap-1 border-t pt-2.5 [&>button]:min-h-11 [&>button]:min-w-11">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** 窄屏卡片列表容器：与表格同一份数据，另一种排布 */
export function CardList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-2.5", className)}>{children}</div>;
}

const TONES = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  info: "bg-info/12 text-info",
  danger: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;

export const TONE_CLASS = TONES;
export type Tone = keyof typeof TONES;

/** 语义色对应的 CSS 变量名，供图表按状态取色（配合 useThemeColors） */
export const TONE_VAR: Record<Tone, string> = {
  primary: "--primary",
  success: "--success",
  warning: "--warning",
  info: "--info",
  danger: "--destructive",
  neutral: "--muted-foreground",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
  size = "lg",
  onClick,
  className,
}: {
  icon: typeof Sun;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  /** lg=看板 KPI 卡；md=页头下方那排紧凑统计，同一套版式只换字号 */
  size?: "md" | "lg";
  onClick?: () => void;
  className?: string;
}) {
  const Wrapper = onClick ? "button" : "div";
  const md = size === "md";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full rounded-xl text-left transition",
        onClick && "card-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Card className="h-full gap-0 border py-0 shadow-soft transition-colors hover:border-brand/45">
        <CardContent className={cn("flex items-start gap-3", md ? "p-3 md:p-4" : "p-4")}>
          <span className={cn(
            "grid shrink-0 place-items-center rounded-[calc(var(--radius)-2px)]",
            TONES[tone],
            md ? "size-8" : "size-9",
          )}>
            <Icon className={md ? "size-4" : "size-4.5"} />
          </span>
          <div className="min-w-0">
            <p className={cn("truncate font-medium text-muted-foreground", md ? "text-[11px] md:text-xs" : "text-xs")}>{label}</p>
            <p className={cn("mt-0.5 font-semibold leading-tight tracking-tight", md ? "text-lg md:text-xl" : "text-2xl")}>{value}</p>
            {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        </CardContent>
      </Card>
    </Wrapper>
  );
}

/**
 * 全站统一的进度条：清单完成度、登记总览表头、看板关键指标都读这一份。
 * 三种排布 —— 默认「条 + n / N」；wide=条撑满剩余宽度；传 label 则换成「上：标题左 / 数值右，下：通长条」。
 * 口径：满档转绿，未满用品牌渐变；分母为 0 时画空条，不显示 100%。
 */
export function StatBar({
  value,
  max,
  label,
  text,
  thin,
  wide,
  hideCount,
  className,
}: {
  value: number;
  max: number;
  label?: ReactNode;
  /** 数值文案，默认「value / max」；stacked 模式默认百分比 */
  text?: ReactNode;
  thin?: boolean;
  wide?: boolean;
  hideCount?: boolean;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bar = (
    <span className={cn(
      "block overflow-hidden rounded-full bg-muted",
      label ? "h-2 w-full" : thin ? "h-1" : "h-1.5",
      !label && (wide ? "min-w-0 flex-1" : "w-24 shrink-0"),
      className,
    )}>
      <span className={cn("block h-full rounded-full transition-all",
        pct >= 100 && pct > 0 ? "bg-success" : "brand-band")}
        style={{ width: `${pct}%` }} />
    </span>
  );

  if (label) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-muted-foreground">{label}</span>
          <span className="shrink-0 font-semibold tabular-nums">{text ?? `${pct}%`}</span>
        </div>
        <div className="mt-2">{bar}</div>
      </div>
    );
  }

  if (hideCount) return bar;

  return (
    <span className="flex items-center gap-2">
      {bar}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{text ?? `${value} / ${max}`}</span>
    </span>
  );
}

const PASS_RATIO = 0.6;
const EXCELLENT_RATIO = 0.85;

export function scoreTenthsTone(tenths: number, maxTenths = 1500): Tone {
  if (tenths >= maxTenths * EXCELLENT_RATIO) return "success";
  if (tenths >= maxTenths * PASS_RATIO) return "info";
  return "danger";
}

/** 分数热力底色：优秀偏绿、及格偏蓝、待提高偏红，扫一眼就能定位偏弱科目 */
const HEAT_CLASS: Record<Tone, string> = {
  success: "bg-success/14",
  info: "bg-info/12",
  warning: "bg-warning/14",
  primary: "bg-primary/12",
  danger: "bg-destructive/14",
  neutral: "bg-muted",
};

export function ScoreText({
  tenths,
  max = 1500,
  heat,
  className,
}: {
  tenths: number | null | undefined;
  max?: number;
  heat?: boolean;
  className?: string;
}) {
  if (tenths === null || tenths === undefined) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  const tone = scoreTenthsTone(tenths, max);
  const text = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        text,
        heat && cn("inline-flex min-w-14 justify-end rounded-[calc(var(--radius)-4px)] px-1.5 py-0.5", HEAT_CLASS[tone]),
        className,
      )}
    >
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

export const STUDENT_STATUS_TONE: Record<string, Tone> = {
  在读: "success",
  休学: "warning",
  转班: "info",
  毕业: "primary",
};

/**
 * 日常登记（背诵 / 作业）状态的统一语义色：清单、总览、学生端都读这一份。
 * 口径：完成=绿、要跟进=黄、没做=红、不参与统计=灰。
 */
export const DAILY_STATUS_TONE: Record<string, Tone> = {
  过关: "success",
  已交: "success",
  优秀: "success",
  待重背: "warning",
  补交: "warning",
  需订正: "warning",
  未交: "danger",
  延背: "neutral",
  免背: "neutral",
};

export const dailyStatusTone = (status: string): Tone => DAILY_STATUS_TONE[status] ?? "info";

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

/** KPI 卡骨架：与 StatCard 同尺寸，加载时不塌陷、不跳版 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-24 items-start gap-3 rounded-xl border bg-card p-4 shadow-soft", className)}
      aria-busy="true" aria-label="加载中">
      <Skeleton className="size-9 shrink-0 rounded-[calc(var(--radius)-2px)]" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-12" />
      </div>
    </div>
  );
}

/** 图表骨架：按图表实际高度占位，代替「加载中…」纯文字 */
export function ChartSkeleton({ className = "h-56" }: { className?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="加载中">
      <Skeleton className="h-4 w-28" />
      <Skeleton className={cn("w-full rounded-xl", className)} />
    </div>
  );
}

/** ── 数据表格：排序与合计行的统一口径 ── */

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;
type SortValue = string | number | null | undefined;

const isBlankSort = (v: SortValue) => v === null || v === undefined || v === "";

/**
 * 表头点击排序：三态循环（升 → 降 → 回到后端下发的原序），空值在两个方向都垫底。
 * 比较函数按列名放在 ref 里，所以调用方每次渲染传新对象也不会触发重排（重排只跟 source/sort 走）。
 */
export function useTableSort<T>(source: T[], valueOf: Record<string, (row: T) => SortValue>) {
  const pickRef = useRef(valueOf);
  pickRef.current = valueOf;
  const [sort, setSort] = useState<SortState>(null);

  const toggle = useCallback((key: string) => {
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }, []);

  const sorted = useMemo(() => {
    if (!sort) return source;
    const pick = pickRef.current[sort.key];
    if (!pick) return source;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...source].sort((a, b) => {
      const va = pick(a);
      const vb = pick(b);
      if (isBlankSort(va) || isBlankSort(vb)) return isBlankSort(va) && isBlankSort(vb) ? 0 : isBlankSort(va) ? 1 : -1;
      if (typeof va === "number" && typeof vb === "number") return sign * (va - vb);
      return sign * String(va).localeCompare(String(vb), "zh-Hans-CN", { numeric: true });
    });
  }, [source, sort]);

  return { sorted, sort, toggle };
}

/** 可排序表头：未排序时给一颗淡的双箭头，划过加深，让「这一列能点」看得出来 */
export function SortHead({
  label,
  col,
  sort,
  onSort,
  className,
  title,
}: {
  label: ReactNode;
  col: string;
  sort: SortState;
  onSort: (col: string) => void;
  className?: string;
  title?: string;
}) {
  const active = sort?.key === col;
  const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    // aria-sort 归 columnheader（th）所有，读屏才会念出「已按此列升序」；写在 button 上是无效的
    <TableHead className={cn("whitespace-nowrap", className)}
      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(col)}
        title={title ?? "点击排序（升 → 降 → 还原）"}
        className="group inline-flex items-center gap-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className={cn(active && "text-foreground")}>{label}</span>
        <Icon className={cn("size-3 shrink-0 transition-opacity",
          active ? "text-primary opacity-100" : "opacity-40 group-hover:opacity-75")} />
      </button>
    </TableHead>
  );
}

/** 合计区底色：单行合计直接用 TotalRow，多行汇总（成绩表三档口径）自己套 TableFooter 时读这一个值 */
export const TOTAL_FOOT_CLASS = "bg-muted/30";

/** 合计行：tfoot 在 tbody 之外，因此不参与斑马纹，天然与数据行分层 */

export function TotalRow({ children }: { children: ReactNode }) {
  return (
    <TableFooter className={TOTAL_FOOT_CLASS}>
      <TableRow>{children}</TableRow>
    </TableFooter>
  );
}

/** 合计行的一格：note=口径说明（灰、小），默认是数字（等宽） */
export function TotalCell({
  children, note, className, ...rest
}: Omit<ComponentProps<typeof TableCell>, "children"> & { children?: ReactNode; note?: boolean }) {
  return (
    <TableCell className={cn(note ? "text-xs font-medium text-muted-foreground" : "tabular-nums", className)} {...rest}>
      {children}
    </TableCell>
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

/**
 * 页内错误条：失败只在原地说明，不吞掉已渲染的内容。
 * 整页读不出来时仍用 EmptyState + 重试按钮，别用它替代表格本体。
 */
export function ErrorBanner({
  text,
  onRetry,
  className,
}: {
  text: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn(
      "mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive",
      className,
    )}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">{text}</span>
      {onRetry ? (
        <Button size="xs" variant="ghost" className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  );
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-slot="page-toolbar" className={cn("mb-3 flex flex-wrap items-center gap-2 md:mb-4", className)}>{children}</div>
  );
}

/** 统计胶囊行：窄屏横向滑动并贴边出血，PC 端仍按宽度自动换行 */
export function StatPills({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "scroll-x -mx-3 flex gap-2 px-3 pb-1 [&>*]:shrink-0 md:mx-0 md:flex-wrap md:overflow-x-visible md:px-0 md:pb-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type SelectOption = { value: string; label: string };

/** Radix Select 的选项值不能为空串，用哨兵承载"全部"这类空值。 */
const ALL_SENTINEL = "\u0000__all";

export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  ariaLabel,
  className,
  disabled,
  size = "default",
  blockOnMobile,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  allLabel?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  /** 窄屏占满一行，手指好点；PC 端仍按内容宽度 */
  blockOnMobile?: boolean;
}) {
  const items = allLabel ? [{ value: ALL_SENTINEL, label: allLabel }, ...options] : options;
  return (
    <Select
      value={allLabel && value === "" ? ALL_SENTINEL : value}
      onValueChange={(v) => onChange(v === ALL_SENTINEL ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger
        size={size}
        aria-label={ariaLabel}
        className={cn("w-auto min-w-32", blockOnMobile && "max-md:h-11 max-md:w-full max-md:min-w-0", className)}
      >
        <SelectValue placeholder={allLabel ?? "请选择"} />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {items.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function EntityPicker({
  value,
  onChange,
  options,
  placeholder,
  className,
  emptyText = "没有匹配项",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const selected = options.find((option) => option.value === value) ?? null;
  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(next) => onChange(next?.value ?? "")}
      isItemEqualToValue={(a, b) => a?.value === b?.value}
      itemToStringLabel={(item) => item?.label ?? ""}
      disabled={disabled}
    >
      <ComboboxInput placeholder={placeholder} className={className} showClear={!disabled} />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: SelectOption) => (
            <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseIso = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return isoOf(date) === s ? date : undefined;
};

/** 中文日历弹层选日期，值仍是后端要求的 YYYY-MM-DD 文本 */
export function DateField({
  value,
  onChange,
  ariaLabel,
  placeholder = "选择日期",
  className,
  disabled,
  blockOnMobile,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  blockOnMobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const thisYear = new Date().getFullYear();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label={ariaLabel} disabled={disabled}
          className={cn("w-40 justify-between px-3 font-normal tabular-nums",
            blockOnMobile && "max-md:h-11 max-md:w-full",
            !value && "text-muted-foreground", className)}>
          <span className="truncate">{value || placeholder}</span>
          <CalendarIcon className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          locale={zhCN}
          captionLayout="dropdown"
          startMonth={new Date(thisYear - 6, 0, 1)}
          endMonth={new Date(thisYear + 3, 11, 31)}
          weekStartsOn={1}
          defaultMonth={selected}
          onSelect={(day) => {
            if (!day) return;
            onChange(isoOf(day));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** 危险/批量操作的应用内确认框，替代 window.confirm */
export function ConfirmButton({
  title,
  description,
  confirmLabel = "确认",
  tone = "destructive",
  onConfirm,
  busy,
  disabled,
  ariaLabel,
  variant = "outline",
  size = "sm",
  className,
  children,
}: {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: "destructive" | "default";
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
  children: ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={variant} size={size} className={className} disabled={disabled || busy} aria-label={ariaLabel}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <ConfirmDialogBody title={title} description={description} confirmLabel={confirmLabel} tone={tone} busy={busy} onConfirm={onConfirm} />
    </AlertDialog>
  );
}

/** 受控确认框：触发器需要自己处理点击（如行内按钮要阻止冒泡）时用它 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确认",
  tone = "destructive",
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: "destructive" | "default";
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <ConfirmDialogBody title={title} description={description} confirmLabel={confirmLabel} tone={tone} busy={busy} onConfirm={onConfirm} />
    </AlertDialog>
  );
}

function ConfirmDialogBody({ title, description, confirmLabel, tone, busy, onConfirm }: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone: "destructive" | "default";
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction variant={tone} disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
