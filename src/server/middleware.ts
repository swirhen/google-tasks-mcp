import { Context, Next } from "hono";
import { tokenStore } from "../auth/token-store.ts";
import { createLogger } from "../utils/logger.ts";
import { getPublicBaseUrl } from "../config.ts";

const logger = createLogger({ component: "middleware" });

// 401 には認可情報の場所を添える（MCP クライアントはここから OAuth を始める）
function setAuthenticateHeader(c: Context) {
  const baseUrl = getPublicBaseUrl(c.req.url);
  c.header("WWW-Authenticate", `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`);
}

export async function authenticateBearer(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn("Authentication failed: missing or invalid Authorization header");
    setAuthenticateHeader(c);
    return c.json(
      {
        error: "unauthorized",
        error_description: "Missing or invalid Authorization header",
      },
      401
    );
  }

  const token = authHeader.substring(7);

  const isValid = await tokenStore.isValid(token);
  if (!isValid) {
    logger.warn("Authentication failed: invalid or expired token");
    setAuthenticateHeader(c);
    return c.json(
      {
        error: "unauthorized",
        error_description: "Invalid or expired access token",
      },
      401
    );
  }

  c.set("mcpToken", token);

  await next();
}
