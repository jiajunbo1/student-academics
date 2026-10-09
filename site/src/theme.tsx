import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

/** 玻璃质感：磨砂（默认）或液态，写到 html[data-glass] 由 globals.css 分支 */
export type GlassMode = "frosted" | "liquid";

const STORAGE_KEY = "school-theme-mode";
const GLASS_KEY = "school-glass-mode";
const GLASS_T_KEY = "school-glass-transparency";
/** 旧刻度存的是「厚度 α」，和新刻度（透明度 = 100 − α）数值上会互相误读，读到就作废一次 */
const GLASS_LEGACY_KEY = "school-glass-alpha";

/** 滑块给用户的 0–100 透明度，CSS 只吃 α：两个刻度互为补数，换算只在这一处发生 */
const clampT = (t: number) => Math.min(100, Math.max(0, Math.round(t)));
const toAlpha = (t: number) => 100 - clampT(t);

/**
 * 默认透明度必须和 globals.css 里 --glass-frost-a / --glass-liq-a 的补数对上：
 * 磨砂 α 92（透 8）、液态 α 58（透 42），深色液态单独 α 64（透 36，近黑底上玻璃太薄会吃不出那层冷色）。
 */
const GLASS_T_DEFAULT: Record<GlassMode, number> = { frosted: 8, liquid: 42 };
const GLASS_T_LIQUID_DARK = 36;
const ALPHA_VAR: Record<GlassMode, string> = { frosted: "--glass-frost-a", liquid: "--glass-liq-a" };

const readMode = (): ThemeMode => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
};

const readGlass = (): GlassMode => (localStorage.getItem(GLASS_KEY) === "liquid" ? "liquid" : "frosted");

const readTransparency = (): Partial<Record<GlassMode, number>> => {
  try {
    const legacy = localStorage.getItem(GLASS_LEGACY_KEY);
    if (legacy != null) localStorage.removeItem(GLASS_LEGACY_KEY);
    const saved = JSON.parse(localStorage.getItem(GLASS_T_KEY) ?? "{}") as Record<string, unknown>;
    const out: Partial<Record<GlassMode, number>> = {};
    for (const mode of ["frosted", "liquid"] as const) {
      const v = saved[mode];
      if (typeof v === "number" && v >= 0 && v <= 100) out[mode] = clampT(v);
    }
    return out;
  } catch {
    return {};
  }
};

const systemIsDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

const ThemeContext = createContext<{
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  glass: GlassMode;
  setGlass: (glass: GlassMode) => void;
  /** 当前档的透明度（0–100，越大越透）；滑块直接读它 */
  transparency: number;
  setGlassTransparency: (t: number) => void;
}>({
  mode: "system",
  resolved: "light",
  setGlass: () => {},
  glass: "frosted",
  setMode: () => {},
  transparency: GLASS_T_DEFAULT.frosted,
  setGlassTransparency: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [glass, setGlassState] = useState<GlassMode>(readGlass);
  const [transparency, setTransparencyState] = useState<Partial<Record<GlassMode, number>>>(readTransparency);
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    mode === "system" ? (systemIsDark() ? "dark" : "light") : mode,
  );

  useEffect(() => {
    const apply = () => {
      const next = mode === "system" ? (systemIsDark() ? "dark" : "light") : mode;
      document.documentElement.classList.toggle("dark", next === "dark");
      setResolved(next);
    };
    apply();
    localStorage.setItem(STORAGE_KEY, mode);
    if (mode !== "system") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [mode]);

  useEffect(() => {
    document.documentElement.dataset.glass = glass;
    localStorage.setItem(GLASS_KEY, glass);
  }, [glass]);

  // 没调过的档不写内联值：默认值留在 CSS 里（深色液态还能按深浅色各给一档）
  useEffect(() => {
    const root = document.documentElement;
    for (const m of Object.keys(ALPHA_VAR) as GlassMode[]) {
      const v = transparency[m];
      if (v == null) root.style.removeProperty(ALPHA_VAR[m]);
      else root.style.setProperty(ALPHA_VAR[m], `${toAlpha(v)}%`);
    }
    localStorage.setItem(GLASS_T_KEY, JSON.stringify(transparency));
  }, [transparency]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const setGlass = useCallback((next: GlassMode) => setGlassState(next), []);
  const setGlassTransparency = useCallback(
    (next: number) => setTransparencyState((t) => ({ ...t, [glass]: clampT(next) })),
    [glass],
  );
  const transparencyNow =
    transparency[glass] ?? (glass === "liquid" && resolved === "dark" ? GLASS_T_LIQUID_DARK : GLASS_T_DEFAULT[glass]);
  const value = useMemo(
    () => ({ mode, resolved, setMode, glass, setGlass, transparency: transparencyNow, setGlassTransparency }),
    [mode, resolved, setMode, glass, setGlass, transparencyNow, setGlassTransparency],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
