/**
 * Authentication helpers for k6 test scenarios.
 * Handles token generation, session management, and auth headers.
 */

import http from "k6/http";
import { check } from "k6";
import { RefinedResponse, ResponseType } from "k6/http";

const BASE_URL = __ENV["BASE_URL"] ?? "http://localhost:3000";

export interface AuthToken {
  token: string;
  sessionId: string;
  expiresAt: number;
}

export interface UserCredentials {
  email: string;
  password: string;
}

/**
 * Generate a mock JWT-style auth token for load testing.
 * In real scenarios, replace with actual auth endpoint call.
 */
export function generateAuthToken(credentials?: UserCredentials): AuthToken {
  const email = credentials?.email ?? `user_${__VU}_${__ITER}@loadtest.dev`;
  const password = credentials?.password ?? "LoadTest@2024!";

  const payload = {
    email,
    password,
  };

  const res: RefinedResponse<ResponseType> = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify(payload),
    {
      headers: {
        "Content-Type": "application/json",
        "X-Load-Test": "true",
      },
      tags: { endpoint: "auth" },
    }
  );

  check(res, {
    "auth: status 200": (r) => r.status === 200,
    "auth: has token": (r) => {
      const body = r.json() as Record<string, unknown>;
      return typeof body["token"] === "string";
    },
  });

  if (res.status === 200) {
    const body = res.json() as Record<string, unknown>;
    return {
      token: body["token"] as string,
      sessionId: body["sessionId"] as string,
      expiresAt: Date.now() + 3600 * 1000,
    };
  }

  // Fallback: generate a synthetic token for mock server testing
  return generateSyntheticToken();
}

/**
 * Minimal base64 encoder for k6 (no btoa in k6 runtime).
 */
function b64(str: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    result +=
      chars.charAt(a >> 2) +
      chars.charAt(((a & 3) << 4) | (b >> 4)) +
      (i - 1 < str.length + 1 ? chars.charAt(((b & 15) << 2) | (c >> 6)) : "=") +
      (i < str.length + 1 ? chars.charAt(c & 63) : "=");
  }
  return result;
}

/**
 * Generate a synthetic bearer token for use with the mock server.
 * Format mirrors a real JWT structure without actual signing.
 */
export function generateSyntheticToken(): AuthToken {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(
    JSON.stringify({
      sub: `vu_${__VU}`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: "customer",
    })
  );
  const signature = b64(`sig_${__VU}_${__ITER}`);

  return {
    token: `${header}.${payload}.${signature}`,
    sessionId: `sess_${__VU}_${Date.now()}`,
    expiresAt: Date.now() + 3600 * 1000,
  };
}

/**
 * Build standard auth headers for API requests.
 */
export function authHeaders(token: AuthToken): Record<string, string> {
  return {
    Authorization: `Bearer ${token.token}`,
    "X-Session-ID": token.sessionId,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Load-Test": "true",
  };
}

/**
 * Check if a token is still valid (not expired).
 */
export function isTokenValid(token: AuthToken): boolean {
  return Date.now() < token.expiresAt - 60_000; // 60s buffer
}
