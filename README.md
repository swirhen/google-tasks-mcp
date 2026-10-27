# Google Tasks MCP サーバー

Google Tasks を Claude などの MCP 対応クライアントから使えるようにする、リモート MCP サーバーです。タスク、タスクリスト、ToDo を会話で管理できます。

クライアントには、サーバーの URL（例：`https://example.com/google_tasks_mcp/mcp`）を教えるだけです。認証は OAuth で行います。接続するときに Google アカウントでログインして許可すると、その人の Google Tasks を扱えるようになります。

**⚠️ 免責事項**：このサーバーは**現状のまま**提供するもので、保証は一切ありません。セキュリティとプライバシーには十分配慮していますが、稼働率・データの完全性・セキュリティについて何も保証しません。自己責任で使ってください。

## このフォークについて

このリポジトリは [akutishevsky/google-tasks-mcp](https://github.com/akutishevsky/google-tasks-mcp) の fork です。この fork は、**任意の Linux サーバーで Node と systemd を使って動かし、リバースプロキシ（Apache・nginx など）で公開する**ための変更を `selfhost` ブランチ（既定のブランチ）に入れています。upstream にあった Deno Deploy 向けのファイル（手順書・`deno.json` など）は削除しました。

- **Node で起動できる**：`npm start`（`build/serve.js`）で、`HOST` と `PORT` で指定したアドレスで待ち受けます。
- **KV を永続化する**：`KV_PATH` を指定すると、Deno KV を SQLite ファイルに保存します。再起動しても接続が消えません。
- **サブパス配下に置ける**：`PUBLIC_BASE_URL` で外から見た URL を指定します。OAuth のメタデータはその URL を返します。
- **MCP の認可の仕様に合わせた**：Protected Resource Metadata（`/.well-known/oauth-protected-resource`）を返し、401 に `WWW-Authenticate` を付けます。
- **redirect_uri を検証する**：`ALLOWED_REDIRECT_URIS` とループバックアドレスだけを許可します。upstream は任意の URI を受け付けるので、罠のリンク経由で認可コードを第三者に渡してしまうおそれがあります。
- **refresh_token に対応した**：クライアントがトークンを自動で更新できるので、定期的に接続し直す必要がありません。
- **Google Analytics を外した**：upstream の作者の Google Analytics を、プライバシーポリシーのページから外しました。

## 使えるツール

### タスクリスト
- `list_task_lists`：ログインしたユーザーのタスクリストをすべて返す
- `get_task_list`：指定したタスクリストを返す
- `insert_task_list`：タスクリストを作る
- `update_task_list`：タスクリストを更新する（全体を置き換え）
- `patch_task_list`：タスクリストを更新する（一部だけ）
- `delete_task_list`：タスクリストを削除する

### タスク
- `list_tasks`：タスクリスト内のタスクをすべて返す（完了状態や期限で絞り込める）
- `get_task`：指定したタスクを返す
- `insert_task`：タスクを作る（期限・メモ・親タスクを指定できる）
- `update_task`：タスクを更新する（全体を置き換え）
- `patch_task`：タスクを更新する（一部だけ。完了・未完了の切り替えなど）
- `delete_task`：タスクを削除する
- `clear_completed_tasks`：リストから完了済みのタスクをすべて消す
- `move_task`：タスクの位置や親タスクを変える（サブタスクにする）

「仕事リストに『レポートの確認』を金曜期限で追加して」「今週が期限のタスクは？」のように頼めます。

## 構成

| ファイル | 内容 |
| --- | --- |
| `src/serve.ts` | Node 用の起動口（`npm start`） |
| `src/index.ts` | アプリの組み立て（KV を開き、設定を読み、Hono のアプリを作る） |
| `src/server/` | Hono のアプリ、MCP のエンドポイント、Bearer 認証、回数制限 |
| `src/auth/` | OAuth の認可サーバー（クライアント登録・認可・コールバック・トークン発行）とトークンの保存 |
| `src/google/` | Google Tasks API のクライアント（Google のトークンの自動更新を含む） |
| `src/tools/` | MCP のツール（tasklists・tasks） |
| `src/utils/` | ロガー、暗号化、KV |
| `public/` | トップページ、プライバシーポリシー、favicon |
| `google-tasks-mcp.service` | systemd の定義の例 |
| `google-tasks-mcp.env.example` | 秘密情報を書く設定ファイルの雛形 |

## 必要なもの

- Linux などの常時動いているサーバー（Node.js 18 以上。例では systemd で動かす）
- HTTPS で公開できるリバースプロキシ（Apache・nginx など）。OAuth を使うので、**HTTP で公開しない**
- Google Cloud のプロジェクト（OAuth クライアントを作るため。無料で作れる）

## 導入

以下では、配置先を `/opt/google-tasks-mcp`、待ち受けを `127.0.0.1:8005`、公開する URL を `https://example.com/google_tasks_mcp/` として書きます。自分の環境に合わせて読み替えてください。サブドメイン（例：`https://tasks.example.com/`）のドメイン直下に置くこともできます（手順 5 を参照）。

### 1. Google Cloud で OAuth クライアントを作る

[Google Cloud Console](https://console.cloud.google.com/) で次の作業をします。今の Console では、OAuth 同意画面の設定は「Google Auth Platform」にまとめられています。

1. プロジェクトを作ります（既存のものでもかまいません）。
2. 「API とサービス」→「ライブラリ」で「Google Tasks API」を検索し、「有効にする」を押します。
3. 「OAuth 同意画面」（Google Auth Platform）を開き、ユーザーの種類を「外部」にして、アプリ名とメールアドレスを入れます。
4. 「データアクセス」→「スコープを追加または削除」で、`https://www.googleapis.com/auth/tasks` を追加して保存します。一覧に見つからなければ、「スコープの手動追加」欄に貼り付けます。
5. 「対象」で公開ステータスを「**本番環境**」にします（「アプリを公開」）。
   - 「テスト」のままだと、Google の refresh token が 7 日で切れるので、毎週接続し直すことになります。ログインできるのも、テストユーザーに登録したアカウントだけです。
   - 本番環境でも審査を受けていなければ、ログイン時に「Google はこのアプリを確認していません」と出ます。自分や身内で使うだけなら、「詳細」→「（アプリ名）に移動」で進めれば問題ありません。審査なしで使えるのは 100 ユーザーまでです。
   - Tasks のスコープは「機密性の高いスコープ」です。警告を消すには、Google の審査（ドメインの所有確認、ホームページとプライバシーポリシー、デモ動画など）が必要です。
6. 「クライアント」→「クライアントを作成」で、種類を「ウェブアプリケーション」にします。「承認済みのリダイレクト URI」に `https://example.com/google_tasks_mcp/callback` を入れて作ります。
7. 表示されるクライアント ID とクライアント シークレットを控えます。

### 2. 配置とビルド

```bash
sudo git clone https://github.com/swirhen/google-tasks-mcp.git /opt/google-tasks-mcp
sudo chown -R <動かすユーザー>: /opt/google-tasks-mcp
cd /opt/google-tasks-mcp
npm ci
npm run build
mkdir -p ~/.local/share/google-tasks-mcp   # KV（SQLite）の置き場所。動かすユーザーで作る
```

`npm ci` では、Deno KV のネイティブモジュール（`@deno/kv-linux-x64-gnu` など）も入ります。

### 3. 設定ファイル

秘密情報は、systemd が読む設定ファイルに書きます。

```bash
sudo install -m 0600 -o root -g root google-tasks-mcp.env.example /etc/default/google-tasks-mcp
sudo sed -i "s/^ENCRYPTION_SECRET=.*/ENCRYPTION_SECRET=$(openssl rand -hex 32)/" /etc/default/google-tasks-mcp
sudoedit /etc/default/google-tasks-mcp   # GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET を入れる
```

`ENCRYPTION_SECRET` は、保存するトークンの暗号化に使います。一度決めたら変えないでください。変えると、保存済みの接続はすべて使えなくなります。

### 4. systemd に登録する

`google-tasks-mcp.service` は例です。次の値を自分の環境に合わせて書き換えてから登録します。
- `User`・`Group`・`WorkingDirectory`・`ExecStart` のパス（`node` の場所は `command -v node` で確かめる）
- `PUBLIC_BASE_URL`・`GOOGLE_REDIRECT_URI`・`ALLOWED_REDIRECT_URIS`・`KV_PATH`

```bash
sudo install -m 0644 google-tasks-mcp.service /etc/systemd/system/   # 書き換えてから
sudo systemctl daemon-reload
sudo systemctl enable --now google-tasks-mcp.service
curl -s http://127.0.0.1:8005/health   # {"status":"ok"}
```

### 5. リバースプロキシで公開する

`/google_tasks_mcp/` を `http://127.0.0.1:8005/` に中継します。

**サブパス配下に置く場合は、ドメイン直下の `/.well-known/` も 2 つ中継してください。**MCP クライアントは、RFC 8414・RFC 9728 に従って、`https://example.com/.well-known/oauth-authorization-server/google_tasks_mcp` のように、ドメイン直下にパスを挿し込んだ URL でもメタデータを探しに来るためです。サブドメインのドメイン直下に置く場合は不要です。

- `PUBLIC_BASE_URL` は、どちらの置き方でも必ず設定してください。リバースプロキシが `Host` を書き換えると、サーバーからは外の URL が分からないためです。
- `X-Forwarded-For` を付けてください。OAuth のエンドポイントの回数制限を、接続元ごとに数えるのに使います。
- MCP の応答は SSE（`text/event-stream`）で返します。nginx では、バッファリングを止めておくと確実です。

Apache（`mod_proxy` と `mod_proxy_http` が必要。`X-Forwarded-For` は自動で付く）:

```apache
ProxyPass        /.well-known/oauth-authorization-server/google_tasks_mcp http://127.0.0.1:8005/.well-known/oauth-authorization-server
ProxyPass        /.well-known/oauth-protected-resource/google_tasks_mcp http://127.0.0.1:8005/.well-known/oauth-protected-resource
ProxyPass        /google_tasks_mcp/ http://127.0.0.1:8005/
ProxyPassReverse /google_tasks_mcp/ http://127.0.0.1:8005/
```

nginx:

```nginx
location = /.well-known/oauth-authorization-server/google_tasks_mcp {
    proxy_pass http://127.0.0.1:8005/.well-known/oauth-authorization-server;
}
location /.well-known/oauth-protected-resource/google_tasks_mcp {
    proxy_pass http://127.0.0.1:8005/.well-known/oauth-protected-resource;
}
location /google_tasks_mcp/ {
    proxy_pass http://127.0.0.1:8005/;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
}
```

反映したら、外から次の URL を開いて確かめます。どれも JSON が返り、中の URL が `https://example.com/google_tasks_mcp/...` になっていれば正しく設定できています。

```bash
curl -s https://example.com/.well-known/oauth-protected-resource/google_tasks_mcp/mcp
curl -s https://example.com/.well-known/oauth-authorization-server/google_tasks_mcp
curl -si -X POST https://example.com/google_tasks_mcp/mcp | grep -i www-authenticate   # 401 と一緒に返る
```

### 6. クライアントをつなぐ

claude.ai や Claude Desktop では、「設定」→「コネクタ」→「カスタムコネクタを追加」で、URL に `https://example.com/google_tasks_mcp/mcp` を入れます。「接続」を押すと Google のログイン画面が開くので、ログインして Google Tasks の権限を許可します。

## ほかの AI をつなぐ

URL だけ教えれば、たいていの AI は自分でクライアント登録をして OAuth を進めます。ただし、認可コードを返す先（クライアントのコールバック URL）は `ALLOWED_REDIRECT_URIS` で許可したものだけです。

| クライアント | 必要な設定 |
| --- | --- |
| claude.ai / Claude Desktop | `https://claude.ai/api/mcp/auth_callback` を許可する（例の service に入っている） |
| Claude Code、Cursor などのローカルのクライアント | 不要。`http://localhost`・`127.0.0.1`・`[::1]` に戻るものは常に許可する |
| ChatGPT・Meta AI など、ほかの Web サービス | そのサービスのコールバック URL を許可する |

許可していないクライアントは、クライアント登録（`/register`）か認可（`/authorize`）の段階で、`invalid_redirect_uri` または `redirect_uri is not allowed` で止まります。このとき、サーバーのログに弾いた URI がクエリを除いて出ます。

```
WARN [oauth] OAuth client registration rejected: redirect_uri not allowed redirectUris=["https://chatgpt.com/connector/oauth/xxxxxxxx"]
```

それが自分の使うサービスのものだと確かめてから、`ALLOWED_REDIRECT_URIS` にカンマ区切りで足して再起動します。ChatGPT の URI の末尾はコネクタごとの ID で、コネクタを作り直すと変わります。前方一致にすると、他人が作ったコネクタも通ってしまいます。そのため、許可は完全一致だけにしています。

## 更新

```bash
cd /opt/google-tasks-mcp && git pull --ff-only && npm ci && npm run build
sudo systemctl restart google-tasks-mcp.service
```

systemd の定義を変えたときは、`install` と `daemon-reload` もやり直します。

upstream の変更を取り込むときは、この fork の変更（上の「このフォークについて」）とぶつからないか確かめてください。特に、`src/auth/oauth.ts`・`src/server/app.ts`・`src/server/middleware.ts` と、KV を開く処理がぶつかりやすいところです。

## 設定

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | はい | Google の OAuth クライアント ID |
| `GOOGLE_CLIENT_SECRET` | はい | Google の OAuth クライアント シークレット |
| `GOOGLE_REDIRECT_URI` | はい | Google から戻ってくる URL。`<PUBLIC_BASE_URL>/callback` にして、Google Cloud の「承認済みのリダイレクト URI」と完全に一致させる |
| `ENCRYPTION_SECRET` | はい | トークンの暗号化に使う 32 文字以上の秘密鍵（`openssl rand -hex 32` などで作る） |
| `PUBLIC_BASE_URL` | リバースプロキシの裏では必須 | 外から見たサーバーの URL（例：`https://example.com/google_tasks_mcp`）。未指定ならリクエストの origin を使う |
| `ALLOWED_REDIRECT_URIS` | 実質必須 | 認可コードを返してよいクライアントのコールバック URL。カンマ区切りで完全一致。ループバックアドレスは常に許可する |
| `KV_PATH` | 推奨 | Deno KV を保存する SQLite ファイル。未指定ならメモリ上に置き、再起動で接続がすべて消える |
| `HOST` | いいえ | 待ち受けるアドレス（既定は `127.0.0.1`） |
| `PORT` | いいえ | 待ち受けるポート（既定は `3000`。例の service では `8005`） |
| `LOG_LEVEL` | いいえ | trace・debug・info・warn・error（既定は info） |
| `ALLOWED_ORIGINS` | いいえ | ブラウザから直接呼ぶクライアントに CORS を許可する origin。カンマ区切り |

例の service では、秘密でない値は service に、秘密の値（`GOOGLE_CLIENT_ID`・`GOOGLE_CLIENT_SECRET`・`ENCRYPTION_SECRET`）は `/etc/default/google-tasks-mcp` に書いています。

## トークンの寿命

- **アクセストークン**：クライアントに渡すトークンです。30 日で切れます。
- **refresh_token**：アクセストークンと一緒に渡し、クライアントはこれで新しいトークンを受け取ります。使うたびに作り直します。古い refresh_token と、それと対になっていたアクセストークンは、その時点で使えなくなります。最後に更新してから 180 日使わなければ切れます。
- **Google 側**：クライアントがトークンを更新するたびに、Google の refresh token がまだ有効かも確かめます。Google アカウントの「[サードパーティ製のアプリとサービス](https://myaccount.google.com/permissions)」でアクセスを取り消すと、次の更新で止まります。

## セキュリティ

- Google のアクセストークンと refresh token は、AES-256-GCM で暗号化して KV に保存します。鍵は `ENCRYPTION_SECRET` から PBKDF2（100,000 回）で作ります。
- ログには、トークン・認証情報・認可コード・ユーザー ID を出しません（`src/utils/logger.ts`）。例外として、弾いた redirect_uri だけは、許可リストに足すべき URI を調べられるように、クエリを除いた origin とパスを出します。
- クライアント登録（`/register`）は誰でもできます。それでも、Google でログインした人が見られるのは、その人自身の Tasks だけです。ほかの人に使わせたくない場合は、Google Cloud の公開ステータスを「テスト」にして、テストユーザーで絞ってください（refresh token は 7 日で切れるようになります）。
- `/etc/default/google-tasks-mcp` と `KV_PATH` のファイルは、ほかのユーザーから読めないようにしてください。

## 困ったとき

| 症状 | 確認すること |
| --- | --- |
| 接続の途中で `invalid_redirect_uri` や `redirect_uri is not allowed` が出る | 「[ほかの AI をつなぐ](#ほかの-ai-をつなぐ)」を参照。ログの `redirectUris=[...]` を許可リストに足す |
| Google の画面で `redirect_uri_mismatch` が出る | Google Cloud の「承認済みのリダイレクト URI」と `GOOGLE_REDIRECT_URI` が完全に一致しているか |
| クライアントが OAuth を始めない、メタデータが見つからないと言われる | 手順 5 の `/.well-known/` の中継と、メタデータの中の URL（`PUBLIC_BASE_URL`） |
| Google のログイン画面で「アクセスをブロック」と出る | 公開ステータスが「テスト」で、そのアカウントがテストユーザーに入っていない |
| 毎週接続し直すことになる | 公開ステータスが「テスト」のまま |
| 再起動のたびに接続が切れる | `KV_PATH` を設定しているか、そのディレクトリに書けるか |
| 再起動後に全員の接続が切れた | `ENCRYPTION_SECRET` を変えていないか |

ログは `journalctl -u google-tasks-mcp` で見られます。

## 開発

```bash
npm ci
npm run build   # TypeScript を build/ にコンパイルする
npm run dev     # 監視モード
npm start       # build/serve.js を起動する
```

テストの仕組みはありません。変更したら、少なくとも `npm run build` が通ることと、上の「5. リバースプロキシで公開する」の確認用 URL が正しい JSON を返すことを確かめてください。

## ライセンス

MIT ライセンスです。詳しくは [LICENSE](LICENSE) を見てください。

## 謝辞

upstream の [akutishevsky/google-tasks-mcp](https://github.com/akutishevsky/google-tasks-mcp) をもとにしています。使っているもの：[Model Context Protocol](https://modelcontextprotocol.io/)、[Google Tasks API](https://developers.google.com/workspace/tasks)、[Hono](https://hono.dev/)、[Deno KV](https://github.com/denoland/denokv)。
