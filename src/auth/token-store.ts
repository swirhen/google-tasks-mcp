import { getKv, type Kv } from "../utils/kv.ts";
import { encrypt, decrypt } from "../utils/encryption.ts";

export interface TokenData {
  googleAccessToken: string;
  googleRefreshToken: string;
  expiresAt: number;
}

interface EncryptedTokenData {
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  expiresAt: number;
}

class TokenStore {
  private kv: Kv | null = null;

  async init() {
    this.kv = await getKv();
  }

  async storeTokens(mcpToken: string, tokenData: TokenData): Promise<void> {
    if (!this.kv) throw new Error("KV not initialized");
    const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

    const encryptedData: EncryptedTokenData = {
      encryptedAccessToken: encrypt(tokenData.googleAccessToken),
      encryptedRefreshToken: encrypt(tokenData.googleRefreshToken),
      expiresAt: tokenData.expiresAt,
    };

    await this.kv.set(["tokens", mcpToken], encryptedData, { expireIn: TTL_MS });
  }

  async getTokens(mcpToken: string): Promise<TokenData | null> {
    if (!this.kv) throw new Error("KV not initialized");
    const result = await this.kv.get<EncryptedTokenData>(["tokens", mcpToken]);

    if (!result.value) {
      return null;
    }

    return {
      googleAccessToken: decrypt(result.value.encryptedAccessToken),
      googleRefreshToken: decrypt(result.value.encryptedRefreshToken),
      expiresAt: result.value.expiresAt,
    };
  }

  async isValid(mcpToken: string): Promise<boolean> {
    const data = await this.getTokens(mcpToken);
    return data !== null;
  }

  async updateTokens(mcpToken: string, updates: Partial<TokenData>): Promise<void> {
    if (!this.kv) throw new Error("KV not initialized");
    const existing = await this.getTokens(mcpToken);
    if (!existing) throw new Error("Token not found");

    const updatedData: TokenData = {
      ...existing,
      ...updates,
    };

    const encryptedData: EncryptedTokenData = {
      encryptedAccessToken: encrypt(updatedData.googleAccessToken),
      encryptedRefreshToken: encrypt(updatedData.googleRefreshToken),
      expiresAt: updatedData.expiresAt,
    };

    const TTL_MS = 30 * 24 * 60 * 60 * 1000;
    await this.kv.set(["tokens", mcpToken], encryptedData, { expireIn: TTL_MS });
  }

  async deleteToken(mcpToken: string): Promise<void> {
    if (!this.kv) throw new Error("KV not initialized");
    await this.kv.delete(["tokens", mcpToken]);
  }

  // MCP の refresh_token。使うたびに作り直す（ローテーション）ので、期限は最後の更新から数える
  async storeRefreshToken(refreshToken: string, data: RefreshTokenData): Promise<void> {
    if (!this.kv) throw new Error("KV not initialized");
    const encryptedData: EncryptedRefreshTokenData = {
      mcpToken: data.mcpToken,
      clientId: data.clientId,
      encryptedGoogleRefreshToken: encrypt(data.googleRefreshToken),
    };
    await this.kv.set(["refresh_tokens", refreshToken], encryptedData, { expireIn: REFRESH_TOKEN_TTL_MS });
  }

  async getRefreshToken(refreshToken: string): Promise<RefreshTokenData | null> {
    if (!this.kv) throw new Error("KV not initialized");
    const result = await this.kv.get<EncryptedRefreshTokenData>(["refresh_tokens", refreshToken]);

    if (!result.value) {
      return null;
    }

    return {
      mcpToken: result.value.mcpToken,
      clientId: result.value.clientId,
      googleRefreshToken: decrypt(result.value.encryptedGoogleRefreshToken),
    };
  }

  async deleteRefreshToken(refreshToken: string): Promise<void> {
    if (!this.kv) throw new Error("KV not initialized");
    await this.kv.delete(["refresh_tokens", refreshToken]);
  }
}

export const REFRESH_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

export interface RefreshTokenData {
  // この refresh_token と対になっているアクセストークン（更新時に古い方を消すため）
  mcpToken: string;
  clientId?: string;
  googleRefreshToken: string;
}

interface EncryptedRefreshTokenData {
  mcpToken: string;
  clientId?: string;
  encryptedGoogleRefreshToken: string;
}

export const tokenStore = new TokenStore();
