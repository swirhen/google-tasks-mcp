# SETUP：Google Tasks MCP サーバーを Claude アプリにつなぐ

この手順書では、このサーバーを Deno Deploy にデプロイし、Claude アプリ（claude.ai）にカスタムコネクタとしてつなぐまでを説明します。

個人で使う（ユーザーが 1 人の）デプロイを想定しています。自分の Google や Deno のアカウントでログインが必要な手順は、その旨をはっきり書いています。

> **このフォークについて**：この手順書は upstream の Deno Deploy 向けの内容を訳したものです。このフォークでは、自前のサーバー（Node + systemd + Apache のサブパス配下）でも動かせます。その場合は、手順 4 の代わりに README の「このフォークについて」と環境変数一覧に従ってください。どちらの場合も、`ALLOWED_REDIRECT_URIS` にクライアントのコールバック URL（claude.ai なら `https://claude.ai/api/mcp/auth_callback`）を入れる必要があります。

この MCP サーバーはリモート型で、`/mcp` エンドポイントで HTTP と SSE を使って通信し、Bearer 認証をかけています。OAuth のディスカバリーを `/.well-known/oauth-authorization-server` に、認可エンドポイントを `/authorize` に、コールバックを `/callback` に持っています。使う OAuth スコープは `https://www.googleapis.com/auth/tasks` です。

## 作業の流れ

1. Google Cloud Console で Google Tasks API を有効にする。
2. OAuth 同意画面を「外部」で設定し、自分をテストユーザーに加えて、tasks スコープを追加する。
3. ウェブアプリケーションの OAuth クライアントを作り、承認済みのリダイレクト URI を設定する。
4. このリポジトリを Deno Deploy にデプロイし、環境変数を設定する。
5. Google の OAuth クライアントのリダイレクト URI を、本番のドメインに合わせる。
6. Claude アプリでカスタムコネクタを追加し、許可する。

この手順書の YOUR_DEPLOYED_DOMAIN は、実際の Deno Deploy のドメイン（例：google-tasks-mcp.deno.dev）に読み替えてください。

## 必要なもの

- Google Tasks を使っている Google アカウント
- Deno Deploy のアカウント（https://dash.deno.com に GitHub でログイン）
- Deno Deploy につないだ fork のリポジトリ。deployctl でデプロイしたい場合は、ローカルに Deno CLI

## 手順 1：Google Tasks API を有効にする

1. Google Cloud Console（https://console.cloud.google.com）を開きます。
2. プロジェクトを新しく作るか、既存のものを選びます。名前は「google-tasks-mcp」のような簡単なもので十分です。
3. 左のメニューで「API とサービス」→「ライブラリ」を開きます。
4. 「Google Tasks API」を検索して開きます。
5. 「有効にする」を押します。

## 手順 2：OAuth 同意画面を設定する

1. 「API とサービス」で「OAuth 同意画面」を開きます。
2. ユーザーの種類は「外部」を選びます。Google Workspace の組織内アプリではないので、「外部」にする必要があります。個人で 1 人で使う場合も、これで動きます。
3. 「作成」を押し、必須の項目を入力します。
   - アプリ名：Google Tasks MCP（好きな名前でかまいません）
   - ユーザー サポートメール：自分のメールアドレス
   - デベロッパーの連絡先メール：自分のメールアドレス
4. スコープの画面で「スコープを追加または削除」を押し、`https://www.googleapis.com/auth/tasks` を追加します。
   一覧に見つからなければ、「スコープの手動追加」欄に貼り付けて「テーブルに追加」を押し、「更新」を押します。
5. テストユーザーの画面で「ユーザーを追加」を押し、Claude で使う Google アカウントを追加します。あとで許可するときに使うアカウントと同じものにしてください。
6. 保存して、概要の画面まで進みます。

> 今の Google Cloud Console では、OAuth 同意画面が「Google Auth Platform」にまとめられています。スコープは「データアクセス」で、公開ステータスとテストユーザーは「対象」で設定します。

### 注意：テストモードでは refresh token が 7 日で切れる（必ず読んでください）

OAuth 同意画面の公開ステータスが「テスト」のままだと、Google は refresh token を 7 日で失効させます。そのため、だいたい週に 1 回コネクタを許可し直すことになります。常時つないでおく個人用のコネクタとしては面倒です。

個人で 1 人で使うなら、同意画面を本番環境に公開して、毎週の再認可をなくすことをおすすめします。

公開するには、「API とサービス」→「OAuth 同意画面」を開き、「アプリを公開」を押します（公開ステータスを「テスト」から「本番環境」に変えます）。Google Tasks のような機密スコープ 1 つを自分だけで使う場合、アプリを動かすだけなら、通常は Google の本格的な審査は求められません。ただし同意画面に「未確認のアプリ」という警告が出ます。「詳細」→「（アプリ名）に移動」で進めます。審査が必須になるのは、たいてい多くの外部ユーザーにアプリを配る場合だけです。自分専用のコネクタなら、正式な審査を受けなくても、本番環境に公開すれば 7 日の期限はなくなります。

公開したくない場合は「テスト」のままでもかまいません。ただし、約 7 日ごとに Claude で「接続」を押し直すことになります。

## 手順 3：ウェブアプリケーションの OAuth クライアントを作る

1. 「API とサービス」で「認証情報」を開きます。
2. 「認証情報を作成」→「OAuth クライアント ID」を押します。
3. アプリケーションの種類は「ウェブアプリケーション」を選びます。
4. 名前：google-tasks-mcp web client（好きな名前でかまいません）
5. 「承認済みのリダイレクト URI」で「URI を追加」を押し、次を入力します。
   https://YOUR_DEPLOYED_DOMAIN/callback
   正確なドメインは手順 4 が終わるまで分からないかもしれません。先にデプロイしてから戻ってくるか、仮の値を入れておいて手順 5 で直してください。
6. 「作成」を押します。
7. クライアント ID とクライアント シークレットを控えます。これらは Deno Deploy に GOOGLE_CLIENT_ID と GOOGLE_CLIENT_SECRET として設定します。

注意：Google 側のリダイレクト URI は、GOOGLE_REDIRECT_URI と完全に一致させる必要があります。https と /callback のパスも含めて同じにしてください。

## 手順 4：Deno Deploy にデプロイする

入口は src/index.ts で、build/index.js にコンパイルされます（tsconfig.json の outDir が build）。コンパイルしたモジュールは、fetch ハンドラーを持つオブジェクトを default でエクスポートします。これが Deno Deploy の求める形式です。

    export default { fetch: app.fetch };

サーバーは public ディレクトリの静的ファイル（トップページ、プライバシーポリシー、favicon）も配信します。そのため、デプロイには public フォルダも含めてください。

デプロイは、Deno Deploy の管理画面からでも（おすすめ。ローカルの開発環境は不要です）、deployctl CLI からでもできます。

### 方法 A：Deno Deploy の管理画面（GitHub 連携）

1. https://dash.deno.com を開き、GitHub でログインします。
2. 「New Project」を押します。
3. fork したリポジトリを選びます。
4. エントリーポイントに build/index.js を指定します。
   注意：build/ は gitignore されているので、リポジトリには入っていません。次のどちらかにしてください。
   (a) ビルドを実行するように設定する。プロジェクトの Build の設定で、インストールのステップを「npm install」、ビルドコマンドを「npm run build」にします。これで Deno Deploy が配信の前に build/index.js を作ります。
   (b) Deno 向けの入口として src/index.ts を直接使う。tsconfig は rewriteRelativeImportExtensions を使っていて、ソースはすでに .ts の拡張子で import しているので、Deno なら tsc を通さずに src/index.ts を動かせます。この場合は、エントリーポイントを src/index.ts にして、ビルドコマンドは省きます。
5. プロジェクトの Settings → Environment Variables で、環境変数を設定します（手順 4c の表を参照）。
6. デプロイします。Deno が割り当てる本番の URL（例：https://google-tasks-mcp.deno.dev）を控えます。これが YOUR_DEPLOYED_DOMAIN です。

### 方法 B：deployctl CLI（ローカル）

Deno CLI と Deno Deploy のアクセストークン、それに Deno へのログインが必要です。トークンは、この手順書にも Web のフォームにも貼り付けないでください。

    # deno をインストールしてから（まだなら）、ビルドしてデプロイする
    npm install
    npm run build
    deployctl deploy --project=google-tasks-mcp --include=build,public build/index.js

--include=build,public を付けると、コンパイルした入口と public の静的ファイルの両方がアップロードされます。デプロイが終わったら、管理画面で環境変数を設定します。deployctl でも --env や --env-file で設定できますが、本物の秘密情報を入れたファイルは絶対にコミットしないでください。

### 手順 4c：Deno Deploy に設定する環境変数

Deno Deploy の Project Settings → Environment Variables で設定します。

| 変数 | 必須 | 設定する値 |
| --- | --- | --- |
| GOOGLE_CLIENT_ID | はい | 手順 3 のクライアント ID |
| GOOGLE_CLIENT_SECRET | はい | 手順 3 のクライアント シークレット |
| GOOGLE_REDIRECT_URI | はい | https://YOUR_DEPLOYED_DOMAIN/callback（Google のリダイレクト URI と完全に一致させる） |
| ENCRYPTION_SECRET | はい | 32 文字以上のランダムな秘密鍵。ローカルで npm run generate-secret を実行して作ります。出力は ENCRYPTION_SECRET= で始まる 1 行なので、等号より後ろの 16 進の値だけを使います。 |
| ALLOWED_REDIRECT_URIS | はい（このフォーク） | https://claude.ai/api/mcp/auth_callback（ほかのクライアントも使うなら、カンマ区切りで足す） |
| ALLOWED_ORIGINS | 推奨 | https://claude.ai |
| PORT | いいえ | Deno Deploy では設定しません（ポートではなく fetch ハンドラーを使うため）。ローカルで動かすときだけ使います（既定は 3000）。 |
| LOG_LEVEL | いいえ | info（調査中は debug） |

ENCRYPTION_SECRET は、再起動しても変えないでください。変えると、保存済みの暗号化されたトークンを復号できなくなり、許可し直す必要があります。

## 手順 5：Google の OAuth のリダイレクト URI を更新する

手順 4 で本番のドメインが分かったら、Google Cloud Console に戻ります。「API とサービス」→「認証情報」でウェブアプリケーションの OAuth クライアントを開き、「承認済みのリダイレクト URI」に次がそのまま入っているか確認します。

    https://YOUR_DEPLOYED_DOMAIN/callback

Deno Deploy の環境変数 GOOGLE_REDIRECT_URI と一致していることを確かめて、保存します。

次の URL を開くと、デプロイが正しくできているか簡単に確認できます。

    https://YOUR_DEPLOYED_DOMAIN/.well-known/oauth-authorization-server

issuer、authorization_endpoint（/authorize）、token_endpoint（/token）、mcp_endpoint（/mcp）を書いた JSON が返ってくるはずです。

## 手順 6：Claude アプリでカスタムコネクタを追加する

1. Claude アプリ（claude.ai かデスクトップアプリ）を開きます。
2. 設定を開きます。
3. コネクタを開きます。
4. 「カスタムコネクタを追加」を押します。
5. 次の内容を入力します。
   - 名前：Google Tasks（好きな名前でかまいません）
   - リモート MCP サーバーの URL：https://YOUR_DEPLOYED_DOMAIN/mcp
6. 「追加」を押します。
7. 追加したコネクタを探して「接続」を押します。
8. ブラウザで Google の認可ページが開きます。テストユーザーに加えたアカウント（公開済みなら、アプリの持ち主のアカウント）でログインし、Google Tasks の権限を許可します。
9. 元の画面に戻れば接続は完了です。

接続したら、「タスクリストには何がある？」「仕事リストに金曜期限のタスクを追加して」のように Claude に頼めます。

## 困ったとき

Google の同意画面に「アクセスをブロック」や「未確認のアプリ」と出る場合：自分の Google アカウントがテストユーザーに入っているか（テストモードの場合）、アプリを本番環境に公開しているかを確認してください。未確認の警告は、自分のアカウントなら「詳細」→「（アプリ名）に移動」で進めます。

Claude から接続できない、または CORS のエラーが出る場合：ALLOWED_ORIGINS に https://claude.ai がそのまま入っているか（末尾のスラッシュなし）、ディスカバリーの URL が正しい JSON を返すかを確認してください。

このフォークで、接続の途中に redirect_uri is not allowed や invalid_redirect_uri が出る場合：クライアントのコールバック URL が ALLOWED_REDIRECT_URIS に入っていません。サーバーのログに、弾いた URI が redirectUris=[...] として出ているので、それを確かめてから追加してください。

毎週許可し直す必要がある場合：同意画面がまだテストモードです。本番環境に公開してください（手順 2 の注意を参照）。

再デプロイ後にトークンが使えなくなった場合：デプロイの前後で ENCRYPTION_SECRET が変わっていないか確認してください。

## セキュリティ上の注意

本物の秘密情報は絶対にコミットしないでください。.env ファイルは .gitignore に入っています（build/ や node_modules/ と同じ）。そのため、ローカルの .env が Git に追跡されることはありません。.env.example には仮の値だけを書いておいてください。
