# AI開発エージェント向け運用ルール

## プロジェクト概要

- Google Tasks を MCP 対応クライアントから使えるようにする、リモート MCP サーバー。OAuth の認可サーバーも兼ねていて、Google の OAuth を中継する。[akutishevsky/google-tasks-mcp](https://github.com/akutishevsky/google-tasks-mcp) の fork で、`selfhost` ブランチ（既定のブランチ）で運用している。
- 使い方・設定・導入手順は `README.md` を参照。README は任意のサーバーで構築する前提で書いている（URL は `https://example.com/google_tasks_mcp/`、配置先は `/opt/google-tasks-mcp` などの例）。うちの環境に固有の値は README に書かず、この AGENTS.md の「うちの環境」に書く。
- upstream の Deno Deploy 向けのファイル（`SETUP.md`・`deno.json`・`deno.lock`・`.env.example`）は削除した。`CLAUDE.md` は、この AGENTS.md を見るように案内するだけのもの。Deno のものとして残っているのは、KV の保存に使う `@deno/kv`（npm 版。Node から SQLite を使う）だけ。

## 構成

```
クライアント → リバースプロキシ → src/serve.ts（@hono/node-server）→ src/server/app.ts（Hono）
  ├── セキュリティヘッダー、CORS
  ├── OAuth：/register・/authorize・/callback・/token → src/auth/oauth.ts
  ├── メタデータ：/.well-known/oauth-protected-resource[/mcp]・/.well-known/oauth-authorization-server
  ├── MCP：/mcp（GET・POST）→ Bearer 認証（middleware.ts）→ mcp-endpoints.ts
  │     └── POST ごとに McpServer を作り、ツールを登録して 1 回だけ応答する（状態を持たない）
  │           └── src/tools/*.ts → src/google/api.ts → Google Tasks API
  └── 静的ページ：/・/privacy-policy・/favicon.ico・/health
```

- `src/auth/oauth.ts`：Google の OAuth を中継する認可サーバー。`/authorize` で Google に飛ばし、`/callback` で Google の認可コードを預かって自前の認可コードを返す。`/token` で Google のトークンを受け取り、自前のアクセストークン（UUID）と refresh_token を発行する。
- `src/auth/token-store.ts`：アクセストークン → 暗号化した Google のトークン（`["tokens", ...]`、30 日）と、refresh_token（`["refresh_tokens", ...]`、180 日）。
- `src/google/api.ts`：Google Tasks の REST API の薄いラッパー。どの呼び出しも `makeGoogleRequest()` を通る。Google のアクセストークンの期限が 60 秒を切っていたら更新し、KV の期限も延ばす。
- `src/tools/`：14 個のツール。`server.registerTool()` に Zod のスキーマを渡して登録し、結果は `addReadableTimestamps()` を通して JSON で返す。
- `src/transport/mcp-transport.ts`：MCP の `Transport` を SSE で実装したもの。
- `src/utils/encryption.ts`：AES-256-GCM（鍵は `ENCRYPTION_SECRET` から PBKDF2 で作る）。`src/utils/logger.ts`：トークンなどを伏せるロガー（`LOG_LEVEL`）。
- 規約：TypeScript の import は拡張子 `.ts` で書く（`rewriteRelativeImportExtensions` で `.js` にコンパイルされる）。`process`・`Buffer` は `node:` から明示的に import する。

## upstream から変えたところ

- `src/serve.ts`：Node 用の起動口（`npm start`）。`src/index.ts` の `export default { fetch }` を `@hono/node-server` で動かす。
- `src/utils/kv.ts`：KV を 1 つだけ開き、3 か所（トークン・OAuth のセッション・回数制限）で共有する。`KV_PATH` で SQLite に永続化する。
- `src/config.ts`：`getPublicBaseUrl`（`PUBLIC_BASE_URL`）と `isAllowedRedirectUri`（`ALLOWED_REDIRECT_URIS` とループバック）。
- `src/server/app.ts`：Protected Resource Metadata。メタデータは `PUBLIC_BASE_URL` で組み立てる。GA の CSP の許可は削除した。
- `src/server/middleware.ts`：401 に `WWW-Authenticate: Bearer resource_metadata=...` を付ける。
- `src/auth/oauth.ts`：`/register` と `/authorize` で redirect_uri を検証し、弾いた URI はクエリを除いてログに出す。refresh_token の発行と `grant_type=refresh_token`（ローテーション）を処理する。
- `src/auth/token-store.ts`：refresh_token の保存（`["refresh_tokens", <token>]`、180 日）。
- `public/privacy-policy.html`：upstream の作者の Google Analytics のタグを削除した。
- `google-tasks-mcp.service` / `google-tasks-mcp.env.example`：systemd の定義と設定ファイルの雛形。README では service を「例」として扱っている（下の「うちの環境」の値がそのまま入っている）。

upstream を取り込むときは、上のファイルがぶつかりやすい。取り込んだら README の「このフォークについて」とこの節も見直す。

## 注意

- `GOOGLE_CLIENT_SECRET`・`ENCRYPTION_SECRET` の値と、KV の中身（トークン）は表示・コミットしない。手元の `google-tasks-mcp.env` は Git 管理外。
- `ENCRYPTION_SECRET` を変えると、保存済みの接続はすべて復号できなくなる。
- redirect_uri の許可は完全一致だけにする。前方一致やワイルドカードにすると、他人が作ったコネクタ（同じサービスの別 ID）に認可コードを渡せてしまう。許可リストに足すのは、ログに出た URI がユーザーの使うサービスのものだと確かめてから。
- ログに秘密情報を出さない。redirect_uri をログに出すときは、`describeRedirectUri` でクエリを落とす。
- 公開しているページ（`public/`）に、外部のトラッキング（アクセス解析など）を入れない。

## うちの環境

- サーバー：`prod-checker`（SSH の Host 名）。配置先は `/home/swirhen/google-tasks-mcp`（README の `/opt/google-tasks-mcp` に当たる）。動かすユーザーは `swirhen`。Node は `/usr/local/bin/node`（v22）。
- 公開 URL：`https://swirhen.tv/google_tasks_mcp/`（MCP は `https://swirhen.tv/google_tasks_mcp/mcp`）。待ち受けは `127.0.0.1:8005`。
- リバースプロキシ：Apache。設定は dotfile リポジトリの `apache2/sites-available/000-default.conf` にある。本番の `/etc/apache2/sites-available/000-default.conf` はそこへのシンボリックリンク。`/google_tasks_mcp/` と、ドメイン直下の `/.well-known/oauth-authorization-server/google_tasks_mcp`・`/.well-known/oauth-protected-resource/google_tasks_mcp` を中継している。dotfile を `git pull` してから `sudo apachectl configtest && sudo systemctl reload apache2` で反映する。
- systemd：`google-tasks-mcp.service`。リポジトリの定義ファイルをそのまま `/etc/systemd/system/` にコピーしている。`ALLOWED_REDIRECT_URIS` もこのファイルにあり、許可リストを変えるときはここを直してコミットする。
- 設定ファイル：`/etc/default/google-tasks-mcp`（root・600）に `GOOGLE_CLIENT_ID`・`GOOGLE_CLIENT_SECRET`・`ENCRYPTION_SECRET`・`LOG_LEVEL` がある。`ENCRYPTION_SECRET` はサーバー上で生成したもので、手元にはない。手元の `google-tasks-mcp.env`（Git 管理外）には Google の 2 つだけが入っていて、`ENCRYPTION_SECRET` は空。**手元のファイルで本番のファイルを丸ごと上書きしない**（`ENCRYPTION_SECRET` が消える）。
- KV：`/home/swirhen/.local/share/google-tasks-mcp/kv.sqlite3`。
- Google Cloud：OAuth クライアントは「ウェブアプリケーション」で、承認済みのリダイレクト URI は `https://swirhen.tv/google_tasks_mcp/callback`。公開ステータスは「本番環境」で、審査は受けていない（ログイン時に未確認の警告が出る）。
- 許可しているクライアント：claude.ai（`https://claude.ai/api/mcp/auth_callback`）、Meta AI（`https://agent.meta.ai/api/hatch/oauth/callback`）、ChatGPT（`https://chatgpt.com/connector/oauth/cAQbDyE5Jz4V`）。

### 更新のリリース

```bash
cd /home/swirhen/google-tasks-mcp && git pull --ff-only && npm ci && npm run build && sudo systemctl restart google-tasks-mcp
```

systemd の定義を変えたときは、`sudo cp google-tasks-mcp.service /etc/systemd/system/ && sudo systemctl daemon-reload` もやり直す。

## 検証

- 変更後は `npm run build` を実行する（テストの仕組みはない）。
- OAuth の流れを変えたら、Google のトークン API（`https://oauth2.googleapis.com/token`）の `fetch` を差し替えたスクリプトで、ローカルで `/register` → `/authorize` → `/callback` → `/token`（authorization_code と refresh_token）→ `/mcp` を通して確かめる。本物の Google は呼ばない。
- 本番に出したら、README の手順 5 の確認用 URL（`/.well-known/` の 2 つと、`/mcp` の 401）を外から確かめる。
