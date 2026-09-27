import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard, Users, ClipboardList, CalendarCheck, Sprout, Settings,
  GraduationCap, LogIn, ShieldCheck, RefreshCw,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, errorMessage, type ApiError } from "./api";
import type { Me } from "./types";
import { ThemeToggle } from "./components/app-ui";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import Scores from "./pages/Scores";
import Attendance from "./pages/Attendance";
import Quality from "./pages/Quality";
import SettingsPage from "./pages/Settings";

const NAV = [
  { key: "dashboard", label: "总览看板", short: "看板", icon: LayoutDashboard },
  { key: "students", label: "学生档案", short: "档案", icon: Users },
  { key: "scores", label: "成绩管理", short: "成绩", icon: ClipboardList },
  { key: "attendance", label: "出勤管理", short: "出勤", icon: CalendarCheck },
  { key: "quality", label: "素质发展", short: "素质", icon: Sprout },
  { key: "settings", label: "系统设置", short: "设置", icon: Settings },
] as const;

type Tab = (typeof NAV)[number]["key"];

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [authState, setAuthState] = useState<"checking" | "ready" | "login_required" | "error">("checking");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");

  const check = useCallback(async () => {
    setAuthState("checking");
    try {
      const r = await apiGet<{ user: Me }>("whoami");
      setMe(r.user);
      setAuthState("ready");
    } catch (e) {
      const code = (e as ApiError)?.code;
      if (code === "login_required" || code === "access_denied") setAuthState("login_required");
      else { setAuthState("error"); setAuthError(errorMessage(e)); }
    }
  }, []);
  useEffect(() => { void check(); }, [check]);

  if (authState === "checking") {
    return (
      <div className="min-h-dvh bg-background p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <Skeleton className="h-9 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (authState !== "ready") {
    const login = authState === "login_required";
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-6">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 45% at 12% 6%, color-mix(in oklab, var(--primary) 20%, transparent) 0%, transparent 62%), radial-gradient(50% 40% at 90% 94%, color-mix(in oklab, var(--chart-2) 18%, transparent) 0%, transparent 62%)",
          }}
        />
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="relative w-full max-w-md rounded-2xl border bg-card/90 p-8 text-center shadow-soft backdrop-blur">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
            <GraduationCap className="size-7" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">高中学生学业管理系统</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {login
              ? "这里管理学生档案、成绩、出勤与素质发展记录，需要先用 Qoder 账号登录。首个登录的教师会自动成为管理员。"
              : authError}
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            {login ? (
              <a href="/__qoder_auth/start" className="w-full sm:w-auto">
                <Button size="lg" className="w-full gap-2">
                  <LogIn /> 使用 Qoder 账号登录
                </Button>
              </a>
            ) : null}
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void check()}>
              <RefreshCw /> 已登录？重新检查
            </Button>
          </div>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> 数据仅对已登录的教师可见
          </p>
        </div>
      </div>
    );
  }

  const isAdmin = me?.role === "ADMIN";
  const current = NAV.find((n) => n.key === tab)!;
  const initials = (me?.name || "师").slice(0, 1);

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
            <GraduationCap className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">学业管理系统</p>
            <p className="text-[11px] text-muted-foreground">高中教师工作台</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="主导航">
          {NAV.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={active ? "page" : undefined}
                className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                {active ? <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" /> : null}
                <Icon className="size-4" /> {label}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-2.5 border-t border-sidebar-border px-4 py-3.5">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/12 text-xs text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me?.name}</p>
            <p className="text-[11px] text-muted-foreground">{isAdmin ? "管理员" : "教师"}</p>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col md:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <GraduationCap className="size-5 text-primary md:hidden" />
          <span className="text-sm font-semibold md:text-base">{current.label}</span>
          <ThemeToggle className="md:hidden" />
          <Badge variant="outline" className="ml-auto hidden gap-1 md:inline-flex">
            <ShieldCheck className="size-3" /> {isAdmin ? "管理员" : "教师"}
          </Badge>
          <span className="ml-auto text-xs text-muted-foreground md:hidden">{me?.name}</span>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-8">
          {tab === "dashboard" && <Dashboard onChangeTab={setTab} />}
          {tab === "students" && <Students isAdmin={isAdmin} />}
          {tab === "scores" && <Scores isAdmin={isAdmin} />}
          {tab === "attendance" && <Attendance />}
          {tab === "quality" && <Quality />}
          {tab === "settings" && <SettingsPage isAdmin={isAdmin} me={me} onWhoamiChanged={check} />}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          aria-label="主导航"
        >
          {NAV.map(({ key, short, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className={`size-5 ${active ? "stroke-[2.4]" : ""}`} />
                {short}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
