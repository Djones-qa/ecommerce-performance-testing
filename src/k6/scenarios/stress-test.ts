/**
 * Stress Test — Find the breaking point
 *
 * Progressively ramps VUs until the system degrades or fails.
 * Identifies the maximum sustainable load and failure modes.
 *
 * Used to answer: "At what point does our API start dropping requests?"
 *
 * Stages:
 *   Ramp from 0 → 2000 VUs in increments, watching for threshold breaches.
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Options } from "k6/options";
import { Rate, Trend, Counter } from "k6/metrics";

import { BASE_THRESHOLDS } from "../thresholds/thresholds";
import {
  generateCartItem,
  generatePaginationParams,
  randomProductId,
} from "../helpers/data";
import { generateSyntheticToken, authHeaders } from "../helpers/auth";

// ─── Custom Metrics ────────────────────────────────────────────────────────────
const errorRate = new Rate("stress_error_rate");
const breakingPointDuration = new Trend("breaking_point_duration", true);
const timeoutCount = new Counter("timeout_count");

// ─── Test Configuration ────────────────────────────────────────────────────────
const BASE_URL = __ENV["BASE_URL"] ?? "http://localhost:3000";

export const options: Options = {
  stages: [
    { duration: "2m", target: 100 },    // Baseline
    { duration: "3m", target: 300 },    // Moderate load
    { duration: "3m", target: 600 },    // Heavy load
    { duration: "3m", target: 1000 },   // Very heavy
    { duration: "3m", target: 1500 },   // Approaching limit
    { duration: "3m", target: 2000 },   // Maximum stress
    { duration: "5m", target: 2000 },   // Sustain at max
    { duration: "5m", target: 0 },      // Recovery — watch for memory leaks
  ],
  thresholds: {
    // Stress test uses relaxed thresholds — we WANT to find the breaking point
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
    http_req_failed: ["rate<0.10"],     // Allow up to 10% errors under stress
    stress_error_rate: ["rate<0.10"],
    ...BASE_THRESHOLDS,
  },
} as Options & { thresholdAbortOnFail?: boolean };

// ─── Main VU Script ────────────────────────────────────────────────────────────
export default function (): void {
  const token = generateSyntheticToken();
  const headers = authHeaders(token);

  // ── Health check first ─────────────────────────────────────────────────────
  group("Health Check", () => {
    const res = http.get(`${BASE_URL}/health`, {
      headers,
      tags: { endpoint: "health" },
      timeout: "5s",
    });

    const ok = check(res, {
      "health: status 200": (r) => r.status === 200,
    });

    if (!ok) {
      timeoutCount.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  // ── Product listing under stress ───────────────────────────────────────────
  group("Product Listing (Stress)", () => {
    const params = generatePaginationParams();
    const startTime = Date.now();

    const res = http.get(
      `${BASE_URL}/products?page=${params.page}&limit=${params.limit}`,
      {
        headers,
        tags: { endpoint: "product_list_stress" },
        timeout: "10s",
      }
    );

    breakingPointDuration.add(Date.now() - startTime);

    const ok = check(res, {
      "stress product list: not 5xx": (r) => r.status < 500,
      "stress product list: not timeout": (r) => r.status !== 0,
    });

    errorRate.add(!ok ? 1 : 0);
    sleep(0.2);
  });

  // ── Product detail under stress ────────────────────────────────────────────
  group("Product Detail (Stress)", () => {
    const productId = randomProductId();
    const res = http.get(`${BASE_URL}/products/${productId}`, {
      headers,
      tags: { endpoint: "product_detail_stress" },
      timeout: "10s",
    });

    check(res, {
      "stress product detail: not 5xx": (r) => r.status < 500,
    });

    sleep(0.2);
  });

  // ── Cart operations under stress ───────────────────────────────────────────
  group("Cart Add (Stress)", () => {
    const cartItem = generateCartItem();
    const res = http.post(
      `${BASE_URL}/cart`,
      JSON.stringify({ ...cartItem, sessionId: token.sessionId }),
      {
        headers,
        tags: { endpoint: "cart_stress" },
        timeout: "10s",
      }
    );

    const ok = check(res, {
      "stress cart: not 5xx": (r) => r.status < 500,
    });

    errorRate.add(!ok ? 1 : 0);
    sleep(0.1);
  });

  // Minimal think time to maximize pressure
  sleep(Math.random() * 0.5);
}
