# Google Tasks MCP サーバー

Google Tasks を Claude などの MCP 対応クライアントから使えるようにする、Model Context Protocol（MCP）サーバーです。タスク、タスクリスト、ToDo を会話で管理できます。

**🔒 プライバシー重視**：透明性を示すため、このリポジトリは公開しています。**個人情報を不正に記録・保存していない**ことは、コードを読めば確かめられます。機密データ（トークン）は暗号化して保存し、ログからは自動で伏せます。コード全体を読んで、この方針が守られているか確認できます。

**⚠️ 免責事項**：このサーバーは**現状のまま**提供するもので、保証は一切ありません。セキュリティとプライバシーには十分配慮していますが、稼働率・データの完全性・セキュリティについて何も保証しません。自己責任で使ってください。本番用途では、自分でホストすることを検討してください。

## このフォークについて

このリポジトリは [akutishevsky/google-tasks-mcp](https://github.com/akutishevsky/google-tasks-mcp) の fork です。Deno Deploy ではなく、自前のサーバー（Node + systemd + Apache のサブパス配下）で動かすために、`selfhost` ブランチで次の変更を入れています。

- **Node で起動できる**：`npm start`（`build/serve.js`）で、`HOST` と `PORT` で指定したアドレスで待ち受けます。
- **KV を永続化する**：`KV_PATH` を指定すると、Deno KV を SQLite ファイルに保存します。再起動しても接続が消えません。
- **サブパス配下に置ける**：`PUBLIC_BASE_URL`（例：`https://example.com/google_tasks_mcp`）を指定すると、OAuth のメタデータがその URL を返します。
- **MCP の認可の仕様に合わせた**：Protected Resource Metadata（`/.well-known/oauth-protected-resource`）を返し、401 に `WWW-Authenticate` を付けます。
- **redirect_uri を検証する**：`ALLOWED_REDIRECT_URIS`（カンマ区切り、完全一致）とループバックアドレスだけを許可します。upstream は任意の URI を受け付けるので、罠のリンク経由で認可コードを第三者に渡してしまうおそれがあります。弾いた URI は、クエリを除いてログに出します。
- **refresh_token に対応した**：アクセストークン（30 日）と一緒に refresh_token（最後の更新から 180 日）を発行します。refresh_token は使うたびに作り直します。
- **Google Analytics を外した**：upstream の作者の Google Analytics を、プライバシーポリシーのページから外しました。

配置に使うファイルは `google-tasks-mcp.service`（systemd ユニット）と `google-tasks-mcp.env.example`（秘密情報のひな形）です。

## 目次

- [このフォークについて](#このフォークについて)
- [何ができるか](#何ができるか)
- [利用者向け：ホストされたサーバーを使う](#利用者向けホストされたサーバーを使う)
  - [必要なもの](#必要なもの)
  - [設定手順](#設定手順)
  - [使えるツール](#使えるツール)
  - [会話の例](#会話の例)
  - [プライバシーとセキュリティ](#プライバシーとセキュリティ)
- [開発者向け：セルフホスト](#開発者向けセルフホスト)
  - [必要なもの](#必要なもの-1)
  - [手順 1：Google Cloud プロジェクトを作る](#手順-1google-cloud-プロジェクトを作る)
  - [手順 2：clone と準備](#手順-2clone-と準備)
  - [手順 3：ローカルで開発する](#手順-3ローカルで開発する)
  - [手順 4：本番にデプロイする](#手順-4本番にデプロイする)
  - [手順 5：Google の OAuth 設定を更新する](#手順-5google-の-oauth-設定を更新する)
  - [手順 6：MCP クライアントを設定する](#手順-6mcp-クライアントを設定する)
  - [環境変数一覧](#環境変数一覧)
  - [開発用コマンド](#開発用コマンド)
  - [ディレクトリ構成](#ディレクトリ構成)
- [セキュリティ機能](#セキュリティ機能)
  - [トークンの暗号化](#トークンの暗号化)
  - [プライバシーに配慮したログ](#プライバシーに配慮したログ)
- [コントリビュート](#コントリビュート)
- [ライセンス](#ライセンス)
- [サポート](#サポート)
- [謝辞](#謝辞)

## 何ができるか

この MCP サーバーを使うと、Claude から Google Tasks のデータを扱えるようになります。

- **タスクリストの管理**：作成・取得・更新・削除
- **タスクの管理**：作成・取得・更新・削除・移動
- **タスクの整理**：サブタスクの作成、期限の設定、メモの追加
- **完了状態の変更**：完了・未完了の切り替え
- **まとめて操作**：リストから完了済みのタスクをまとめて消す
- **タスクの検索**：完了状態や期限などで絞り込む
- **自然な言葉で操作**：Claude との会話でタスクを扱う

どれも Claude や、ほかの MCP 対応クライアントとの会話でできます。

## 利用者向け：ホストされたサーバーを使う

自分でホストせずに Claude Desktop から使うだけなら、次の手順で設定します。

### 必要なもの

1. Google Tasks を使っている [Google アカウント](https://accounts.google.com/)
2. [Claude Desktop](https://claude.ai/download)、またはほかの MCP 対応クライアント

### 設定手順

#### 手順 1：Claude Desktop にコネクタを追加する

1. Claude Desktop を開きます。
2. **設定**（左下の歯車アイコン）を開きます。
3. **コネクタ** タブを開きます。
4. **カスタムコネクタを追加** を押します。
5. 次の内容を入力します。
   - **名前**：`Google Tasks`（好きな名前でかまいません）
   - **リモート MCP サーバーの URL**：`https://your-deployed-domain.com/mcp`
6. **追加** を押します。

#### 手順 2：接続して許可する

1. **コネクタ** の設定で、追加した Google Tasks のコネクタを探します。
2. コネクタの横の **接続** を押します。
3. ブラウザで Google の認可ページが開きます。
4. Google アカウントでログインします。
5. 求められる権限を確認して許可します。
6. 元の画面に戻れば接続は完了です。

許可すると、Claude から Google Tasks を使えるようになります。

### 使えるツール

接続すると、Claude は次のツールでデータを扱えます。

#### タスクリストの管理
- `list_task_lists`：ログインしたユーザーのタスクリストをすべて返す
- `get_task_list`：指定したタスクリストを返す
- `insert_task_list`：タスクリストを作る
- `update_task_list`：タスクリストを更新する（全体を置き換え）
- `patch_task_list`：タスクリストを更新する（一部だけ）
- `delete_task_list`：タスクリストを削除する

#### タスクの管理
- `list_tasks`：タスクリスト内のタスクをすべて返す
- `get_task`：指定したタスクを返す
- `insert_task`：タスクを作る
- `update_task`：タスクを更新する（全体を置き換え）
- `patch_task`：タスクを更新する（一部だけ）
- `delete_task`：タスクを削除する
- `clear_completed_tasks`：リストから完了済みのタスクをすべて消す
- `move_task`：タスクの位置や親タスクを変える

### 会話の例

Claude に次のように頼んでみてください。

- 「タスクリストには何がある？」
- 「仕事リストのタスクを全部見せて」
- 「『個人プロジェクト』というタスクリストを作って」
- 「仕事リストに『第 4 四半期レポートの確認』を来週金曜期限で追加して」
- 「『買い物』のタスクを完了にして」
- 「『提案書を書く』を『クライアント案件』のサブタスクにして」
- 「買い物リストの完了済みタスクを全部消して」
- 「今週が期限のタスクは？」

### プライバシーとセキュリティ

- **トークンの暗号化**：認証トークンはすべて AES-256-GCM で暗号化してから保存します。
- **個人データを記録しない**：コードは公開しているので、機密情報をログに残していないことを確かめられます。
- **自動で伏せる**：ユーザー ID・トークン・認証情報は、システムログから自動で伏せます。
- **OAuth 2.0**：Google との認証には、業界標準の安全な仕組みを使います。
- **いつでも止められる**：Google アカウントの設定から、いつでもアクセスを取り消せます。

---

## 開発者向け：セルフホスト

自分のインスタンスを動かす手順です。

> このフォークを自前のサーバーで動かす場合は、[このフォークについて](#このフォークについて) と [環境変数一覧](#環境変数一覧) もあわせて読んでください。以下の手順 4 は upstream の Deno Deploy 向けの内容です。

### 必要なもの

1. [Node.js](https://nodejs.org/) 18 以上と npm
2. デプロイ用の [Deno CLI](https://deno.land/)
3. [Google Cloud Platform](https://console.cloud.google.com/) のアカウント

### 手順 1：Google Cloud プロジェクトを作る

1. [Google Cloud Console](https://console.cloud.google.com/) を開きます。
2. プロジェクトを新しく作るか、既存のものを選びます。
3. Google Tasks API を有効にします。
   - **API とサービス** → **ライブラリ** を開きます。
   - 「Google Tasks API」を検索します。
   - **有効にする** を押します。
4. OAuth 2.0 の認証情報を作ります。
   - **API とサービス** → **認証情報** を開きます。
   - **認証情報を作成** → **OAuth クライアント ID** を押します。
   - 種類は **ウェブアプリケーション** を選びます。
   - 承認済みのリダイレクト URI に `https://your-domain.com/callback` を追加します。
   - **クライアント ID** と **クライアント シークレット** を控えておきます。
5. OAuth 同意画面を設定します。
   - **API とサービス** → **OAuth 同意画面** を開きます。
   - スコープ `https://www.googleapis.com/auth/tasks` を追加します。

### 手順 2：clone と準備

```bash
# リポジトリを clone する
git clone https://github.com/swirhen/google-tasks-mcp.git
cd google-tasks-mcp

# 依存をインストールする
npm install

# 暗号化用の秘密鍵を作る
npm run generate-secret
# 出力は環境変数に使うので控えておく
```

### 手順 3：ローカルで開発する

> **注意**：Google の OAuth のコールバックには、外から届く URL が必要です。ローカルで開発するときは、トンネル用のサービス（ngrok など）でローカルのサーバーを公開するか、検証用の環境にデプロイして試してください。

```bash
# 環境変数のひな形をコピーする
cp .env.example .env

# .env に値を書く
# GOOGLE_CLIENT_ID=your_client_id
# GOOGLE_CLIENT_SECRET=your_client_secret
# GOOGLE_REDIRECT_URI=https://your-tunnel-url.com/callback
# ENCRYPTION_SECRET=paste_generated_secret_here
# PORT=3000

# ビルドする
npm run build

# Deno で動かす
deno task dev
```

.env のリダイレクト URI は、ローカルのサーバーにつながる公開 URL と一致させてください。

### 手順 4：本番にデプロイする

#### Deno Deploy にデプロイする

1. Deno Deploy の CLI をインストールします。
```bash
deno install -A --unstable https://deno.land/x/deploy/deployctl.ts
```

2. デプロイします。
```bash
# 先にビルドする
npm run build

# Deno Deploy にデプロイする
deployctl deploy --project=google-tasks-mcp build/index.js
```

3. Deno Deploy の管理画面で環境変数を設定します。
   - プロジェクトの設定を開きます。
   - 必要な環境変数をすべて追加します。
   - デプロイを再起動します。

### 手順 5：Google の OAuth 設定を更新する

Google Cloud Console の OAuth クライアントに戻り、リダイレクト URI をデプロイ先の URL に合わせます。
`https://your-domain.com/callback`

### 手順 6：MCP クライアントを設定する

#### Claude Desktop の場合

1. Claude Desktop を開きます。
2. **設定** → **コネクタ** タブを開きます。
3. **カスタムコネクタを追加** を押します。
4. 次の内容を入力します。
   - **名前**：`Google Tasks`（好きな名前でかまいません）
   - **リモート MCP サーバーの URL**：`https://your-domain.com/mcp`
5. **追加** を押します。
6. コネクタの横の **接続** を押して許可します。

#### ほかの MCP クライアントの場合

次の接続情報を設定します。
- **サーバーの URL**：`https://your-domain.com`
- **トランスポート**：Server-Sent Events（SSE）
- **エンドポイント**：`/mcp`
- **認証**：OAuth 2.0
- **ディスカバリー URL**：`/.well-known/oauth-authorization-server`

このフォークでは、クライアントのコールバック URL を `ALLOWED_REDIRECT_URIS` に入れておく必要があります。localhost に戻るクライアントは、入れなくても通ります。

### 環境変数一覧

| 変数 | 必須 | 説明 |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | はい | Google の OAuth クライアント ID |
| `GOOGLE_CLIENT_SECRET` | はい | Google の OAuth クライアント シークレット |
| `GOOGLE_REDIRECT_URI` | はい | OAuth のコールバック URL（Google Cloud Console の設定と一致させる） |
| `ENCRYPTION_SECRET` | はい | トークンの暗号化に使う 32 文字以上の秘密鍵（`npm run generate-secret` で作る） |
| `PORT` | いいえ | 待ち受けるポート（既定は 3000） |
| `HOST` | いいえ | 待ち受けるアドレス。`npm start` のときだけ使う（既定は `127.0.0.1`）。fork で追加 |
| `PUBLIC_BASE_URL` | いいえ | 外から見たときのサーバーの URL。サブパス配下に置くときに指定する（既定はリクエストの origin）。fork で追加 |
| `ALLOWED_REDIRECT_URIS` | いいえ | 認可コードを返してよいクライアントのコールバック URL。カンマ区切りで完全一致。ループバックアドレスは常に許可する。fork で追加 |
| `KV_PATH` | いいえ | Deno KV を保存する SQLite ファイル。未指定ならメモリ上に置き、再起動で消える。fork で追加 |
| `LOG_LEVEL` | いいえ | ログの出力レベル：trace、debug、info、warn、error（既定は info） |
| `ALLOWED_ORIGINS` | いいえ | ブラウザのクライアントに CORS を許可する origin。カンマ区切り |

### 開発用コマンド

```bash
npm run build            # TypeScript を JavaScript にコンパイルする
npm run dev              # 監視モード。変更のたびにコンパイルし直す
npm start                # Node で起動する（build/serve.js）。fork で追加
npm run generate-secret  # 環境変数 ENCRYPTION_SECRET 用の秘密鍵を作る
```

### ディレクトリ構成

```
src/
├── auth/              # OAuth 2.0 の認証とトークンの保存
├── server/            # Hono のアプリ、MCP のエンドポイント、ミドルウェア
├── tools/             # Google Tasks API を使う MCP ツール（tasklists、tasks）
├── transport/         # MCP 用の独自 SSE トランスポート
├── google/            # Google Tasks API のクライアント
├── utils/             # ロガー、暗号化、KV
├── index.ts           # メインの入口（Deno Deploy 用）
└── serve.ts           # Node 用の起動口（fork で追加）
```

## セキュリティ機能

### トークンの暗号化

Google のアクセストークンと refresh token は、すべて **AES-256-GCM** で暗号化して保存します。

- **アルゴリズム**：AES-256-GCM（認証付き暗号）
- **鍵の導出**：PBKDF2、反復 100,000 回
- **多層防御**：データベースが漏れても、トークンは守られます

**大切なこと**：`ENCRYPTION_SECRET` は次のように扱ってください。
- 32 文字以上にする
- ランダムに作る（`npm run generate-secret` を使う）
- 安全に保管し、バージョン管理には絶対にコミットしない
- 再起動しても変えない

### プライバシーに配慮したログ

独自のロガーが、機密情報を自動で伏せます。
- ✅ 動作の記録とエラーは残す
- ❌ トークン・認証情報・認可コードは残さない
- ❌ ユーザー ID や個人情報は残さない
- ❌ 機密データを含む API のリクエスト・レスポンスの中身は残さない

このフォークでは、許可リストで弾いた redirect_uri だけは、クエリを除いた origin とパスをログに出します。許可リストに足すべき URI を調べるためです。

ログの実装は `src/utils/logger.ts` で確認できます。

## コントリビュート

個人のプロジェクトですが、コントリビュートは歓迎します。次の手順でお願いします。

1. リポジトリを fork する
2. 機能用のブランチを作る
3. 変更を入れる
4. プルリクエストを送る

## ライセンス

MIT ライセンスです。詳しくは [LICENSE](LICENSE) を見てください。

## サポート

- **Issues**：バグ報告や機能の要望は、upstream の [GitHub Issues](https://github.com/akutishevsky/google-tasks-mcp/issues) へ
- **Google Tasks API**：[Google Tasks API のドキュメント](https://developers.google.com/workspace/tasks/reference/rest)
- **MCP プロトコル**：[Model Context Protocol のドキュメント](https://modelcontextprotocol.io/)

## 謝辞

使っているもの：
- Anthropic の [Model Context Protocol](https://modelcontextprotocol.io/)
- [Google Tasks API](https://developers.google.com/workspace/tasks)
- Web フレームワークの [Hono](https://hono.dev/)
- ホスティングの [Deno Deploy](https://deno.com/deploy)
