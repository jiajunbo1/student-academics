// 批量导入 / 导出的公共件：CSV 解析与编码兜底放在前端，逐行校验交给后端（import.students / import.scores）。
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Download, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { errorText, errorMessage } from "../api";
import { EmptyState, Pill, type Tone } from "./app-ui";

export interface ImportRowError { field: string; code: string }
export interface ImportItem { line: number; label: string; ok: boolean; action: string; errors: ImportRowError[] }
export interface ImportResult {
  dryRun: boolean; total: number; created: number; updated: number; skipped: number; invalid: number; items: ImportItem[];
}

export const ACTION_LABEL: Record<string, string> = { create: "新增", update: "覆盖", skip: "跳过", invalid: "有误" };
const ACTION_TONE: Record<string, Tone> = {
  create: "success", update: "info", skip: "primary", invalid: "danger",
};

/** Excel 存的 CSV 常见是 GBK，也常见 UTF-8 BOM；先按 UTF-8 严格解码，失败再退到 GBK。 */
export function decodeTable(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const bom = bytes.length > 2 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bom ? bytes.subarray(3) : bytes);
  } catch {
    try {
      return new TextDecoder("gbk").decode(bytes).replace(/^/, "");
    } catch {
      return new TextDecoder().decode(bytes);
    }
  }
}

/** 支持双引号包裹（内含逗号/换行/转义引号）、\r\n 与 \n 混用 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") { quoted = true; continue; }
    if (ch === ",") { row.push(cell); cell = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const csvCell = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: (string | number | null | undefined)[][]): string =>
  rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

/** 带 BOM，Excel 双击打开不乱码 */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const url = URL.createObjectURL(new Blob(["\ufeff" + toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const isHeader = (row: string[], first: string) => row[0] === first;

/**
 * 通用导入弹窗：选文件/粘贴 → 后端逐行校验预览 → 确认写入（无效行自动跳过）。
 * 具体字段怎么从 CSV 里取由调用方给 `toRecords`，弹窗本身不认识业务字段。
 */
export function ImportDialog({ open, onClose, title, description, guidance, labels, header, toRecords, template, templateName, submit, onParsed, onDone }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  guidance: ReactNode;
  labels: Record<string, string>;
  header: string;
  /** headerCells 为 null 表示这份数据没有表头行（成绩导入必须有表头，名单导入可无） */
  toRecords: (headerCells: string[] | null, body: string[][]) => { records: Record<string, string>[]; error?: string };
  template: () => (string | number | null)[][];
  templateName: string;
  submit: (records: Record<string, string>[], dryRun: boolean) => Promise<ImportResult>;
  onParsed?: (records: Record<string, string>[]) => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState("");
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setRecords([]); setResult(null); setNote(""); setFileName(""); setPaste("");
    if (fileRef.current) fileRef.current.value = "";
  };
  const close = () => { if (!busy) { reset(); onClose(); } };

  const accept = async (text: string, label: string) => {
    const rows = parseCsv(text);
    if (!rows.length) { setNote("文件里没读到任何内容，请确认是 CSV（逗号分隔）格式。"); setRecords([]); setResult(null); return; }
    const headerCells = isHeader(rows[0], header) ? rows[0] : null;
    const body = headerCells ? rows.slice(1) : rows;
    const { records: next, error } = toRecords(headerCells, body);
    if (error || !next.length) {
      setNote(error ?? "没有解析出可导入的数据行。请检查表头是否为「" + header + "」。");
      setRecords([]); setResult(null); return;
    }
    setNote(""); setFileName(label); setRecords(next); onParsed?.(next);
    setBusy(true);
    try { setResult(await submit(next, true)); }
    catch (e) { setNote(errorMessage(e)); setResult(null); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    setBusy(true);
    try {
      const r = await submit(records, false);
      setResult(r);
      toast.success(`导入完成：新增 ${r.created} 条，覆盖 ${r.updated} 条` + (r.skipped ? `，跳过 ${r.skipped} 条` : ""));
      onDone();
      reset();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const shown = useMemo(() => (result ? result.items.filter((x) => !x.ok || x.action !== "skip") : []), [result]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">{guidance}</div>

          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.arrayBuffer().then((b) => accept(decodeTable(b), f.name)); }} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><FileUp /> 选择 CSV 文件</Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(templateName, template())}><Download /> 下载模板</Button>
            {fileName && <Pill tone="info">{fileName} · {records.length} 行</Pill>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="import-paste" className="text-xs text-muted-foreground">没有文件？直接从 Excel 复制后粘贴到这里（逗号或制表符分隔）</Label>
            <Textarea id="import-paste" rows={3} value={paste} placeholder={`${header}\n示例数据`}
              className="font-mono text-xs" onChange={(e) => setPaste(e.target.value)} />
            <Button variant="ghost" size="sm" disabled={!paste.trim() || busy}
              onClick={() => void accept(paste.replace(/\t/g, ","), "粘贴内容")}><Upload /> 解析粘贴内容</Button>
          </div>

          {note && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{note}</p>}

          {result && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Pill tone="info">共 {result.total} 行</Pill>
                <Pill tone="success">新增 {result.created}</Pill>
                <Pill tone="info">覆盖 {result.updated}</Pill>
                <Pill tone="primary">跳过 {result.skipped}</Pill>
                {result.invalid > 0 && <Pill tone="danger">有误 {result.invalid}</Pill>}
                <span className="text-xs text-muted-foreground">{result.dryRun ? "以下为校验结果，尚未写入" : "已写入"}</span>
              </div>
              {!shown.length ? (
                <EmptyState icon={Upload} title="全部行都会被跳过" description="这些行没有需要写入的变化（关键列留空或数据与现状一致）；确认无误后可直接关闭。" />
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border">
                  <Table className="data-table">
                    <TableHeader>
                      <TableRow><TableHead className="w-14">行号</TableHead><TableHead>内容</TableHead><TableHead className="w-20">结果</TableHead><TableHead>说明</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.slice(0, 200).map((it) => (
                        <TableRow key={it.line}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{it.line}</TableCell>
                          <TableCell className="font-medium">{it.label}</TableCell>
                          <TableCell><Pill tone={ACTION_TONE[it.action] ?? "primary"}>{ACTION_LABEL[it.action] ?? it.action}</Pill></TableCell>
                          <TableCell className={cn("text-xs", !it.ok && "text-destructive")}>
                            {it.errors.map((x) => `${labels[x.field] ?? x.field}：${errorText(x.code)}`).join("；")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {shown.length > 200 && <p className="p-3 text-xs text-muted-foreground">仅显示前 200 条问题行。</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>取消</Button>
          <Button onClick={() => void commit()} disabled={busy || !records.length || !result || (!result.created && !result.updated)}>
            {busy ? "处理中…" : result ? `确认导入 ${result.created + result.updated} 条` : "请先选择文件"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
