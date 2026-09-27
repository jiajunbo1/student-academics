import { useState, type ReactNode } from "react";
import { GraduationCap, KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, errorMessage, setAppToken } from "../api";
import type { Me } from "../types";
import { ThemeToggle } from "./app-ui";

function Field({ id, label, type, value, onChange, autoComplete, hint }: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; autoComplete?: string; hint?: string;
}) {
  return (
    <div className="space-y-1.5 text-left">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** 首登/重置后的强制改密表单，也可在设置页自助使用。 */
export function ChangePasswordForm({ username, onDone, onCancel }: {
  username: string; onDone: (account: Me) => void; onCancel?: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!current || !next) { setError("请填写当前密码和新密码。"); return; }
    if (next !== again) { setError("两次输入的新密码不一致。"); return; }
    setBusy(true); setError("");
    try {
      const r = await apiPost<{ account: Me }>("auth.change-password", { currentPassword: current, newPassword: next });
      onDone(r.account);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Field id="pw-current" label="当前密码" type="password" value={current}
        onChange={setCurrent} autoComplete="current-password" />
      <Field id="pw-next" label="新密码" type="password" value={next} onChange={setNext}
        autoComplete="new-password" hint="8-64 位，需同时包含字母和数字，不能包含账号名。" />
      <Field id="pw-again" label="确认新密码" type="password" value={again} onChange={setAgain}
        autoComplete="new-password" />
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1 gap-2" disabled={busy}>
          <KeyRound /> {busy ? "提交中…" : "确认修改"}
        </Button>
        {onCancel ? <Button type="button" variant="ghost" onClick={onCancel}>稍后再说</Button> : null}
      </div>
      <p className="text-xs text-muted-foreground">修改后其他设备上的登录会失效，账号 {username} 继续使用新密码。</p>
    </form>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 12% 6%, color-mix(in oklab, var(--primary) 20%, transparent) 0%, transparent 62%), radial-gradient(50% 40% at 90% 94%, color-mix(in oklab, var(--chart-2) 18%, transparent) 0%, transparent 62%)",
        }}
      />
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="relative w-full max-w-md rounded-2xl border bg-card/90 p-8 shadow-soft backdrop-blur">
        <div className="text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
            <GraduationCap className="size-7" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

/** 账号密码登录；站点尚未初始化时切换为管理员初始化表单。 */
export function LoginScreen({ needsBootstrap, onLoggedIn }: {
  needsBootstrap: boolean; onLoggedIn: (account: Me) => void;
}) {
  const [mode, setMode] = useState<"login" | "bootstrap">(needsBootstrap ? "bootstrap" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!username || !password) { setError("请填写账号和密码。"); return; }
    setBusy(true); setError("");
    try {
      const action = mode === "bootstrap" ? "auth.bootstrap" : "auth.login";
      const r = await apiPost<{ token: string; account: Me }>(action,
        mode === "bootstrap" ? { username, password, displayName } : { username, password });
      setAppToken(r.token);
      onLoggedIn(r.account);
    } catch (e) {
      setError(errorMessage(e));
      setMode(mode === "bootstrap" ? "bootstrap" : "login");
    } finally { setBusy(false); }
  };

  return (
    <Shell
      title="高中学生学业管理系统"
      subtitle={mode === "bootstrap"
        ? "系统还没有任何账号。请设置第一位管理员，之后由管理员开通教师与学生账号。"
        : "这里管理学生档案、成绩、出勤与素质发展记录。账号由管理员开通，无需注册。"}
    >
      <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {mode === "bootstrap" ? (
          <Field id="boot-name" label="显示姓名" type="text" value={displayName} onChange={setDisplayName}
            hint="例如：王老师" />
        ) : null}
        <Field id="login-user" label={mode === "bootstrap" ? "管理账号" : "账号"} type="text"
          value={username} onChange={setUsername} autoComplete="username"
          hint={mode === "bootstrap" ? "2-32 位字母、数字或 . _ -" : "学生账号即学号，教师账号由管理员分配。"} />
        <Field id="login-pw" label="密码" type="password" value={password} onChange={setPassword}
          autoComplete={mode === "bootstrap" ? "new-password" : "current-password"}
          hint={mode === "bootstrap" ? "至少 8 位，包含字母和数字。" : undefined} />
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full gap-2" disabled={busy}>
          <LogIn /> {busy ? "登录中…" : mode === "bootstrap" ? "创建管理员并进入" : "登录"}
        </Button>
        {needsBootstrap && mode === "login" ? (
          <Button type="button" variant="link" className="w-full" onClick={() => setMode("bootstrap")}>
            系统尚未初始化，创建第一位管理员
          </Button>
        ) : null}
      </form>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" /> 不同角色登录后看到的范围不同
      </p>
    </Shell>
  );
}

/** 管理员设置的初始密码未修改前的拦截页。 */
export function ForcePasswordScreen({ account, onDone }: { account: Me; onDone: (account: Me) => void }) {
  return (
    <Shell
      title="请先修改初始密码"
      subtitle={`你好，${account.displayName}。当前使用的是管理员分配的初始密码，修改后才能进入系统。`}
    >
      <ChangePasswordForm username={account.username} onDone={onDone} />
    </Shell>
  );
}
