import process from "node:process";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

let oauthConfig: OAuthConfig | null = null;

export function setOAuthConfig(config: OAuthConfig) {
  oauthConfig = config;
}

export function getOAuthConfig(): OAuthConfig {
  if (!oauthConfig) {
    throw new Error("OAuth config not initialized");
  }
  return oauthConfig;
}

// サブパス配下に置くとき（例: https://example.com/google_tasks_mcp）の公開 URL。未指定ならリクエストの origin
export function getPublicBaseUrl(requestUrl: string): string {
  const base = process.env.PUBLIC_BASE_URL;
  return base ? base.replace(/\/+$/, "") : new URL(requestUrl).origin;
}

// 認可コードを返してよいリダイレクト先。ALLOWED_REDIRECT_URIS（カンマ区切りの完全一致）と、ループバックアドレスを許可する
export function isAllowedRedirectUri(redirectUri: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }

  if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return true;
  }

  const allowed = process.env.ALLOWED_REDIRECT_URIS?.split(",").map((u) => u.trim()).filter(Boolean) || [];
  return allowed.includes(redirectUri);
}
