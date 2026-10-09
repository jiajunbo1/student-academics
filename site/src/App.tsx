import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, ClipboardList, Settings, BookOpenCheck, BookMarked,
  ChevronRight, GraduationCap, LogOut, KeyRound, RefreshCw, AlertTriangle,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiPost, errorMessage, getAppToken, setAppToken, setUnauthorizedHandler, type ApiError } from "./api";
import type { Me } from "./types";
import { CardSkeleton, Pill, ThemeToggle } from "./components/app-ui";
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
const ROLE_TONE: Record<Me["role"], "primary" | "info" | "success"> = { ADMIN: "primary", TEACHER: "info", STUDENT: "success" };

const fmtWhen = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/**
 * 个人小档案：手机端顶栏原来只有三个图标按钮，看不到"我是谁"；
 * 桌面侧栏底部那一坨（头像 + 两个按钮）也并进同一个弹层，两处共用一份。
 */
function AccountMenu({
  account, onPassword, onLogout, side = "bottom", children,
}: {
  account: Me;
  onPassword: () => void;
  onLogout: () => void;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const go = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align="end" className="w-72 gap-0 p-0">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar className="size-10">
            <AvatarFallback className="bg-primary/12 text-sm text-primary">{(account.displayName || "用").slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{account.displayName}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{account.username}</p>
          </div>
          <Pill tone={ROLE_TONE[account.role]}>{ROLE_LABEL[account.role]}</Pill>
        </div>
        <dl className="space-y-1 border-t px-4 py-2.5 text-[11px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">最近登录</dt>
            <dd className="tabular-nums">{fmtWhen(account.lastLoginAt)}</dd>
          </div>
          {account.mustChange ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">密码</dt>
              <dd className="text-warning">需修改后才能使用</dd>
            </div>
          ) : null}
          {account.lockedUntil ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">状态</dt>
              <dd className="text-destructive">锁定至 {fmtWhen(account.lockedUntil)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="flex gap-2 border-t p-3 [&>button]:flex-1">
          <Button size="sm" variant="outline" className="gap-1.5 max-md:min-h-11" onClick={go(onPassword)}>
            <KeyRound className="size-3.5" /> 修改密码
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 max-md:min-h-11" onClick={go(onLogout)}>
            <LogOut className="size-3.5" /> 退出
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
      <div className="min-h-dvh p-4 md:p-6">
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
      <div className="flex min-h-dvh items-center justify-center p-6">
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
  if (!account) return null;

  const role = account.role;
  const isAdmin = role === "ADMIN";
  const nav = NAV.filter((n) => (n.roles as readonly string[]).includes(role));
  const current = nav.find((n) => n.key === tab) ?? nav[0];

  return (
    // 柔光层现在挂在 body::before（视口锚定，见 globals.css）；这里再写 bg-background 会把它整块盖掉
    <div className="min-h-dvh">
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
        <div className="flex items-center gap-1 border-t border-sidebar-border p-3">
          <AccountMenu account={account} side="right" onPassword={() => setPwOpen(true)} onLogout={() => void logout()}>
            <Button variant="ghost" className="min-w-0 flex-1 justify-start gap-2.5 px-2 py-2">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-primary/12 text-xs text-primary">{(account.displayName || "用").slice(0, 1)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">{account.displayName}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {ROLE_LABEL[role]} · {account.username}
                </span>
              </span>
            </Button>
          </AccountMenu>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col md:pl-60">
        <header className="glass-chrome sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 md:h-11 md:px-6">
          <GraduationCap className="size-5 text-primary md:hidden" />
          {/* 手机端：顶栏就是页面标题；桌面：降为定位线，页面里那个 h1 才是唯一标题 */}
          <span className="truncate text-sm font-semibold md:hidden">{current?.label}</span>
          <span className="hidden items-center gap-1.5 text-xs md:flex">
            <span className="text-muted-foreground">学业管理</span>
            <ChevronRight className="size-3 text-muted-foreground/60" aria-hidden="true" />
            <span className="font-medium">{current?.label}</span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle className="md:hidden" />
            <AccountMenu account={account} onPassword={() => setPwOpen(true)} onLogout={() => void logout()}>
              <Button variant="ghost" size="icon" className="size-11 max-md:min-h-11 md:hidden" aria-label="个人小档案">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/12 text-xs text-primary">{(account.displayName || "用").slice(0, 1)}</AvatarFallback>
                </Avatar>
              </Button>
            </AccountMenu>
          </div>
        </header>

        <Dialog open={pwOpen} onOpenChange={setPwOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>修改密码</DialogTitle>
              <DialogDescription>修改后其他设备需要重新登录。</DialogDescription>
            </DialogHeader>
            <ChangePasswordForm username={account.username} onDone={(a) => { setAccount(a); setPwOpen(false); }} />
          </DialogContent>
        </Dialog>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-8">
          {current?.key === "dashboard" && <Dashboard onChangeTab={setTab} isAdmin={isAdmin} />}
          {current?.key === "students" && <Students isAdmin={isAdmin} />}
          {current?.key === "scores" && <Scores isAdmin={isAdmin} />}
          {current?.key === "daily" && <Daily />}
          {current?.key === "portal" && <Portal />}
          {current?.key === "settings" && <SettingsPage isAdmin={isAdmin} me={account} onMeChanged={setAccount} />}
        </main>

        <nav className="glass-chrome fixed inset-x-0 bottom-0 z-40 flex border-t pb-[var(--safe-bottom)] md:hidden" aria-label="页面导航">
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
