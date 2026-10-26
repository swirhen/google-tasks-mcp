import process from "node:process";
import { openKv } from "@deno/kv";

export type Kv = Awaited<ReturnType<typeof openKv>>;

let kvPromise: Promise<Kv> | null = null;

// KV_PATH を指定すると SQLite ファイルに永続化する（未指定ならメモリ上で、再起動で消える）
export function getKv(): Promise<Kv> {
  if (!kvPromise) {
    kvPromise = openKv(process.env.KV_PATH || undefined);
  }
  return kvPromise;
}
