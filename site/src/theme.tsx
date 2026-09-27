import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "school-theme-mode";

const readMode = (): ThemeMode => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
};

const systemIsDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

const ThemeContext = createContext<{
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}>({ mode: "system", resolved: "light", setMode: () => {} });

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
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

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
