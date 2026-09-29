import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { CalendarIcon, MonitorSmartphone, Moon, Sun } from "lucide-react";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

/** 语义色对应的 CSS 变量名，供图表按状态取色（配合 useThemeColors） */
export const TONE_VAR: Record<Tone, string> = {
  primary: "--primary",
  success: "--success",
  warning: "--warning",
  info: "--info",
  danger: "--destructive",
};

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
      <Card className="h-full border shadow-soft transition-colors hover:border-brand/45">
        <CardContent className="flex items-start gap-3 p-4">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-[calc(var(--radius)-2px)]", TONES[tone])}>
            <Icon className="size-4.5" />
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

/** 分数热力底色：优秀偏绿、及格偏蓝、待提高偏红，扫一眼就能定位偏弱科目 */
const HEAT_CLASS: Record<Tone, string> = {
  success: "bg-success/14",
  info: "bg-info/12",
  warning: "bg-warning/14",
  primary: "bg-primary/12",
  danger: "bg-destructive/14",
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
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  allLabel?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "default";
}) {
  const items = allLabel ? [{ value: ALL_SENTINEL, label: allLabel }, ...options] : options;
  return (
    <Select
      value={allLabel && value === "" ? ALL_SENTINEL : value}
      onValueChange={(v) => onChange(v === ALL_SENTINEL ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger size={size} aria-label={ariaLabel} className={cn("w-auto min-w-32", className)}>
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
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const thisYear = new Date().getFullYear();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label={ariaLabel} disabled={disabled}
          className={cn("w-40 justify-between px-3 font-normal tabular-nums", !value && "text-muted-foreground", className)}>
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
