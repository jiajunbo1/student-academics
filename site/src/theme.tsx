import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

/** 玻璃质感：磨砂（默认）或液态，写到 html[data-glass] 由 globals.css 分支 */
export type GlassMode = "frosted" | "liquid";

const STORAGE_KEY = "school-theme-mode";
const GLASS_KEY = "school-glass-mode";

const readMode = (): ThemeMode => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
};

const readGlass = (): GlassMode => (localStorage.getItem(GLASS_KEY) === "liquid" ? "liquid" : "frosted");

const systemIsDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

const ThemeContext = createContext<{
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  glass: GlassMode;
  setGlass: (glass: GlassMode) => void;
}>({ mode: "system", resolved: "light", setGlass: () => {}, glass: "frosted", setMode: () => {} });

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [glass, setGlassState] = useState<GlassMode>(readGlass);
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

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const setGlass = useCallback((next: GlassMode) => setGlassState(next), []);
  const value = useMemo(
    () => ({ mode, resolved, setMode, glass, setGlass }),
    [mode, resolved, setMode, glass, setGlass],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
