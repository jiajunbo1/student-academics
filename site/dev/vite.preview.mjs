// 仅本机调试用：另开一份前端预览，指向私有 fixture 后端（默认 8775），
// 这样验证新后端 action 时不必重启开发者正在用的 8000 实例。
// 跑法：node dev/server.mjs 8775 &  &&  npx vite --config dev/vite.preview.mjs --port 5288
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.PREVIEW_API || "http://127.0.0.1:8775";
const proxy = { "/functions/v1/app": api };

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } },
  server: { host: "127.0.0.1", proxy },
});
