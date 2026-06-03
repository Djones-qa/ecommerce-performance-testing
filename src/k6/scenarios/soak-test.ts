/**
 * Soak Test — 2-hour sustained load
 *
 * Runs moderate load for an extended period to detect:
 *   - Memory leaks
 *   - Connection pool exhaustion
 *   - Database connection degradation
 *   - Gradual performance degradation over time
 *
 * Mirrors the "overnight soak" tests run before major releases at Amazon.
 *
 * Duration: ~2 hours total
 * VUs: 200 sustained (realistic steady-state traffic)
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Options } from "k6/options";
import { Rate, Trend, Counter, Gauge } from "k6/metrics";

import { SOAK_THRESHOLDS } from "../thresholds/thresholds";
import {
  generateCartItem,
  generateCheckoutPayload,
  generatePaginationParams,
  generateSearchQuery,
  randomProductId,
} from "../helpers/data";
import { generateSyntheticToken, authHeaders } from "../helpers/auth";

// ─── Custom Metrics ────────────────────────────────────────────────────────────
const soakErrorRate = new Rate("soak_error_rate");
const memoryLeakIndicator = new Trend("response_time_trend", true);
const degradationCounter = new Counter("performance_degradation_events");
const activeSessionsGauge = new Gauge("active_sessions");

// ─── Test Configuration ────────────────────────────────────────────────────────
const BASE_URL = __ENV["BASE_URL"] ?? "http://localhost:3000";

// Track response times over time to detect gradual degradation
let iterationCount = 0;
const DEGRADATION_THRESHOLD_MS = 800; // Alert if p95 exceeds this during soak

export const options: Options = {
  stages: [
    { duration: "5m", target: 50 },    // Gentle ramp up
    { duration: "10m", target: 200 },  // Scale to soak load
    { duration: "100m", target: 200 }, // 100-minute soak (core test)
    { duration: "5m", target: 0 },     // Ramp down
  ],
  thresholds: {
    ...SOAK_THRESHOLDS,
    soak_error_rate: ["rate<0.01"],
    // Critical: response times should NOT increase over time
    response_time_trend: ["p(95)<600"],
  },
};

// ─── Main VU Script ────────────────────────────────────────────────────────────
export default function (): void {
  iterationCount++;
  const token = generateSyntheticToken();
  const headers = authHeaders(token);

  activeSessionsGauge.add(1);

  // ── Health check (every iteration) ────────────────────────────────────────
  group("Health Check", () => {
    const res = http.get(`${BASE_URL}/health`, {
      headers,
      tags: { endpoint: "health_soak" },
    });

    check(res, {
      "soak health: status 200": (r) => r.status === 200,
      "soak health: response time stable": (r) => {
        if (r.timings.duration > DEGRADATION_THRESHOLD_MS) {
          degradationCounter.add(1);
          return false;
        }
        return true;
      },
    });
  });

  // ── Product browsing (simulates organic traffic) ───────────────────────────
  group("Browse Products", () => {
    const params = generatePaginationParams();
    const startTime = Date.now();

    const res = http.get(
      `${BASE_URL}/products?page=${params.page}&limit=${params.limit}&sort=${params.sort}`,
      { headers, tags: { endpoint: "product_list_soak" } }
    );

    const duration = Date.now() - startTime;
    memoryLeakIndicator.add(duration);

    const ok = check(res, {
      "soak product list: status 200": (r) => r.status === 200,
      "soak product list: no degradation": (r) => r.timings.duration < DEGRADATION_THRESHOLD_MS,
    });

    soakErrorRate.add(!ok ? 1 : 0);
    sleep(1);
  });

  // ── Product detail ─────────────────────────────────────────────────────────
  group("Product Detail", () => {
    const productId = randomProductId();
    const res = http.get(`${BASE_URL}/products/${productId}`, {
      headers,
      tags: { endpoint: "product_detail_soak" },
    });

    check(res, {
      "soak product detail: status 200": (r) => r.status === 200,
    });

    sleep(0.5);
  });

  // ── Search (CPU-intensive — good for detecting memory leaks) ──────────────
  group("Search", () => {
    const query = generateSearchQuery();
    const res = http.get(
      `${BASE_URL}/search?q=${encodeURIComponent(query)}`,
      { headers, tags: { endpoint: "search_soak" } }
    );

    check(res, {
      "soak search: status 200": (r) => r.status === 200,
    });

    sleep(0.5);
  });

  // ── Cart operations ────────────────────────────────────────────────────────
  group("Cart Operations", () => {
    const cartItem = generateCartItem();
    const addRes = http.post(
      `${BASE_URL}/cart`,
      JSON.stringify({ ...cartItem, sessionId: token.sessionId }),
      { headers, tags: { endpoint: "cart_add_soak" } }
    );

    check(addRes, {
      "soak cart add: status 200/201": (r) => r.status === 200 || r.status === 201,
    });

    sleep(0.5);

    const viewRes = http.get(`${BASE_URL}/cart/${token.sessionId}`, {
      headers,
      tags: { endpoint: "cart_view_soak", name: "GET /cart/:sessionId" },
    });

    check(viewRes, {
      "soak cart view: status 200": (r) => r.status === 200,
    });

    sleep(1);
  });

  // ── Checkout (10% of users — lower rate for soak to avoid DB saturation) ──
  if (Math.random() < 0.1) {
    group("Checkout", () => {
      const checkoutPayload = generateCheckoutPayload(token.sessionId);
      const res = http.post(
        `${BASE_URL}/checkout`,
        JSON.stringify(checkoutPayload),
        { headers, tags: { endpoint: "checkout_soak", name: "POST /checkout" } }
      );

      const ok = check(res, {
        "soak checkout: status 200/201": (r) => r.status === 200 || r.status === 201,
        "soak checkout: has orderId": (r) => {
          const body = r.json() as Record<string, unknown>;
          return typeof body["orderId"] === "string";
        },
      });

      soakErrorRate.add(!ok ? 1 : 0);
    });
  }

  activeSessionsGauge.add(-1);

  // Realistic think time — users don't hammer APIs continuously
  sleep(Math.random() * 3 + 2);
}
