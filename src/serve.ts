// Node 用の起動口（Deno Deploy ではなく自前のサーバーで動かすとき）
import process from "node:process";
import { serve } from "@hono/node-server";
import app from "./index.ts";

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "127.0.0.1";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`google-tasks-mcp listening on http://${hostname}:${info.port}`);
});
