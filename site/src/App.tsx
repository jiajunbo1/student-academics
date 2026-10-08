import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard, Users, ClipboardList, Settings, BookOpenCheck, BookMarked,
  GraduationCap, LogOut, KeyRound, ShieldCheck, RefreshCw, AlertTriangle,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiPost, errorMessage, getAppToken, setAppToken, setUnauthorizedHandler, type ApiError } from "./api";
import type { Me } from "./types";
import { CardSkeleton, ThemeToggle } from "./components/app-ui";
import { ForcePasswordScreen, LoginScreen, ChangePasswordForm } from "./components/auth-screens";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import Scores from "./pages/Scores";
import Daily from "./pages/Daily";
import SettingsPage from "./pages/Settings";
import Portal from "./pages/Portal";

const NAV = [
  { key: "dashboard", label: "总览看板", short: "看板", icon: LayoutDashboard, roles: ["ADMIN", "TEACHER"] },
  { key: "students", label: "学生档案", short: "档案", icon: Users, roles: ["ADMIN", "TEACHER"] },
  { key: "scores", label: "成绩管理", short: "成绩", icon: ClipboardList, roles: ["ADMIN", "TEACHER"] },
  { key: "daily", label: "日常记录", short: "日常", icon: BookMarked, roles: ["ADMIN", "TEACHER"] },
  { key: "portal", label: "我的学业", short: "我的", icon: BookOpenCheck, roles: ["STUDENT"] },
  { key: "settings", label: "系统设置", short: "设置", icon: Settings, roles: ["ADMIN", "TEACHER"] },
] as const;

type Tab = (typeof NAV)[number]["key"];

const ROLE_LABEL: Record<Me["role"], string> = { ADMIN: "管理员", TEACHER: "教师", STUDENT: "学生" };

export default function App() {
  const [account, setAccount] = useState<Me | null>(null);
  const [authState, setAuthState] = useState<"checking" | "ready" | "login" | "error">("checking");
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [pwOpen, setPwOpen] = useState(false);

  const enter = useCallback((next: Me) => {
    setAccount(next);
    setTab(next.role === "STUDENT" ? "portal" : "dashboard");
    setAuthState("ready");
  }, []);

  const check = useCallback(async () => {
    setAuthState("checking");
    try {
      const status = await apiGet<{ needsBootstrap: boolean }>("auth.status").catch(() => ({ needsBootstrap: false }));
      setNeedsBootstrap(status.needsBootstrap);
      if (!getAppToken()) { setAuthState("login"); return; }
      const r = await apiGet<{ account: Me }>("auth.me");
      enter(r.account);
    } catch (e) {
      const code = (e as ApiError)?.code;
      if (code === "login_required" || code === "access_denied" || code === "invalid_response") setAuthState("login");
      else { setAuthState("error"); setAuthError(errorMessage(e)); }
    }
  }, [enter]);

  useEffect(() => {
    setUnauthorizedHandler(() => { setAccount(null); setAuthState("login"); });
    void check();
    return () => setUnauthorizedHandler(null);
  }, [check]);

  const logout = async () => {
    try { await apiPost("auth.logout", {}); } catch { /* 令牌可能已失效 */ }
    setAppToken("");
    setAccount(null);
    setAuthState("login");
  };

  if (authState === "checking") {
    return (
      <div className="min-h-dvh bg-background p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <Skeleton className="h-9 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (authState === "login") return <LoginScreen needsBootstrap={needsBootstrap} onLoggedIn={enter} />;

  if (authState === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-soft">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">暂时无法连接服务</h1>
          <p className="mt-2 text-sm text-muted-foreground">{authError}</p>
          <Button variant="outline" className="mt-6 gap-1.5" onClick={() => void check()}>
            <RefreshCw /> 重新检查
          </Button>
        </div>
      </div>
    );
  }

  if (account?.mustChange) return <ForcePasswordScreen account={account} onDone={enter} />;

  const role = account?.role ?? "TEACHER";
  const isAdmin = role === "ADMIN";
  const nav = NAV.filter((n) => (n.roles as readonly string[]).includes(role));
  const current = nav.find((n) => n.key === tab) ?? nav[0];

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="brand-band grid size-9 place-items-center rounded-xl text-white shadow-soft">
            <GraduationCap className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">学业管理系统</p>
            <p className="text-[11px] text-muted-foreground">{ROLE_LABEL[role]}工作台</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="主导航">
          {nav.map(({ key, label, icon: Icon }) => {
            const active = current?.key === key;
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
                {active ? <span className="brand-band absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full" /> : null}
                <Icon className="size-4" /> {label}
              </button>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-sidebar-border px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/12 text-xs text-primary">{(account?.displayName || "用").slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{account?.displayName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{account?.username}</p>
            </div>
            <ThemeToggle />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setPwOpen(true)}>
              <KeyRound className="size-3.5" /> 修改密码
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void logout()}>
              <LogOut className="size-3.5" /> 退出
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col md:pl-60">
        <header className="glass-chrome sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 md:px-6">
          <GraduationCap className="size-5 text-primary md:hidden" />
          <span className="brand-band hidden size-2 shrink-0 rounded-full md:block" aria-hidden="true" />
          <span className="text-sm font-semibold md:text-base">{current?.label}</span>
          <ThemeToggle className="md:hidden" />
          <Dialog open={pwOpen} onOpenChange={setPwOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="修改密码"><KeyRound className="size-4" /></Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>修改密码</DialogTitle>
                <DialogDescription>修改后其他设备需要重新登录。</DialogDescription>
              </DialogHeader>
              <ChangePasswordForm username={account?.username ?? ""} onDone={(a) => { setAccount(a); setPwOpen(false); }} />
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="sm" className="gap-1.5 md:hidden" onClick={() => void logout()}>
            <LogOut className="size-4" /> 退出
          </Button>
          <Badge variant="outline" className="ml-auto hidden gap-1 md:inline-flex">
            <ShieldCheck className="size-3" /> {ROLE_LABEL[role]}
          </Badge>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-8">
          {current?.key === "dashboard" && <Dashboard onChangeTab={setTab} isAdmin={isAdmin} />}
          {current?.key === "students" && <Students isAdmin={isAdmin} />}
          {current?.key === "scores" && <Scores isAdmin={isAdmin} />}
          {current?.key === "daily" && <Daily />}
          {current?.key === "portal" && <Portal />}
          {current?.key === "settings" && <SettingsPage isAdmin={isAdmin} me={account} onMeChanged={setAccount} />}
        </main>

        <nav
          className="glass-chrome fixed inset-x-0 bottom-0 z-40 flex border-t pb-[var(--safe-bottom)] md:hidden"
          aria-label="主导航"
        >
          {nav.map(({ key, short, icon: Icon }) => {
            const active = current?.key === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-13 flex-1 flex-col items-center justify-center gap-1 text-[11px] transition-all active:scale-95 ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {/* 当前项：玻璃胶囊托住图标，比一条色带更像系统底部栏 */}
                <span className={`grid size-8 place-items-center rounded-full transition-all ${
                  active ? "bg-primary/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" : ""
                }`}>
                  <Icon className={`size-5 ${active ? "stroke-[2.4]" : ""}`} />
                </span>
                {short}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
