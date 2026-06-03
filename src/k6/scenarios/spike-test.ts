/**
 * Spike Test — Black Friday traffic simulation
 *
 * Simulates sudden, extreme traffic spikes:
 *   0 → 2000 VUs in 30 seconds (flash sale / viral moment)
 *
 * Tests system resilience against:
 *   - Sudden connection pool exhaustion
 *   - Auto-scaling response time
 *   - Circuit breaker activation
 *   - Queue overflow behavior
 *
 * Mirrors the traffic pattern seen at Walmart Labs on Black Friday midnight.
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Options } from "k6/options";
import { Rate, Trend, Counter } from "k6/metrics";

import { SPIKE_THRESHOLDS } from "../thresholds/thresholds";
import {
  generateCartItem,
  generateCheckoutPayload,
  randomProductId,
} from "../helpers/data";
import { generateSyntheticToken, authHeaders } from "../helpers/auth";

// ─── Custom Metrics ────────────────────────────────────────────────────────────
const spikeErrorRate = new Rate("spike_error_rate");
const recoveryTime = new Trend("spike_recovery_time", true);
const circuitBreakerTrips = new Counter("circuit_breaker_trips");
const queueOverflows = new Counter("queue_overflow_count");

// ─── Test Configuration ────────────────────────────────────────────────────────
const BASE_URL = __ENV["BASE_URL"] ?? "http://localhost:3000";

export const options: Options = {
  stages: [
    // Pre-spike baseline
    { duration: "2m", target: 50 },

    // THE SPIKE — 0 → 2000 VUs in 30 seconds (Black Friday midnight)
    { duration: "30s", target: 2000 },

    // Sustain spike for 2 minutes
    { duration: "2m", target: 2000 },

    // Rapid drop — flash sale ends
    { duration: "30s", target: 100 },

    // Recovery period — watch for cascading failures
    { duration: "5m", target: 100 },

    // Second spike — simulates "sold out" refresh storm
    { duration: "30s", target: 1500 },
    { duration: "1m", target: 1500 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    ...SPIKE_THRESHOLDS,
    spike_error_rate: ["rate<0.05"],
    spike_recovery_time: ["p(95)<3000"],
  },
};

// ─── Main VU Script ────────────────────────────────────────────────────────────
export default function (): void {
  const token = generateSyntheticToken();
  const headers = authHeaders(token);

  // ── Health check — detect circuit breaker trips ────────────────────────────
  group("Health Check", () => {
    const res = http.get(`${BASE_URL}/health`, {
      headers,
      tags: { endpoint: "health_spike" },
      timeout: "3s",
    });

    if (res.status === 503) {
      circuitBreakerTrips.add(1);
    }
    if (res.status === 429) {
      queueOverflows.add(1);
    }

    check(res, {
      "spike health: service available": (r) =>
        r.status === 200 || r.status === 503, // 503 is acceptable during spike
    });
  });

  // ── High-demand product page (the "deal of the day") ──────────────────────
  group("Hot Product Page", () => {
    // During a spike, everyone hits the same product (deal of the day = product 1)
    const productId = Math.random() < 0.7 ? 1 : randomProductId();
    const startTime = Date.now();

    const res = http.get(`${BASE_URL}/products/${productId}`, {
      headers,
      tags: { endpoint: "hot_product_spike" },
      timeout: "5s",
    });

    recoveryTime.add(Date.now() - startTime);

    const ok = check(res, {
      "spike product: not 5xx": (r) => r.status < 500,
      "spike product: not timeout": (r) => r.status !== 0,
    });

    spikeErrorRate.add(!ok ? 1 : 0);

    if (res.status === 429) {
      queueOverflows.add(1);
      sleep(1); // Back off on rate limit
    }
  });

  // ── Add to cart (high contention during spike) ─────────────────────────────
  group("Add to Cart (Spike)", () => {
    const cartItem = generateCartItem();
    const res = http.post(
      `${BASE_URL}/cart`,
      JSON.stringify({ ...cartItem, sessionId: token.sessionId }),
      {
        headers,
        tags: { endpoint: "cart_spike", name: "POST /cart" },
        timeout: "5s",
      }
    );

    const ok = check(res, {
      "spike cart: not 5xx": (r) => r.status < 500,
      "spike cart: accepted or rate-limited": (r) =>
        r.status === 200 || r.status === 201 || r.status === 429,
    });

    spikeErrorRate.add(!ok ? 1 : 0);
    sleep(0.1);
  });

  // ── Checkout (high-value path — must survive spike) ────────────────────────
  if (Math.random() < 0.4) {
    group("Checkout (Spike)", () => {
      const checkoutPayload = generateCheckoutPayload(token.sessionId);
      const startTime = Date.now();

      const res = http.post(
        `${BASE_URL}/checkout`,
        JSON.stringify(checkoutPayload),
        {
          headers,
          tags: { endpoint: "checkout_spike", name: "POST /checkout" },
          timeout: "10s",
        }
      );

      recoveryTime.add(Date.now() - startTime);

      const ok = check(res, {
        "spike checkout: not 5xx": (r) => r.status < 500,
        "spike checkout: has orderId or queued": (r) => {
          if (r.status === 200 || r.status === 201) {
            const body = r.json() as Record<string, unknown>;
            return typeof body["orderId"] === "string";
          }
          // 202 Accepted = queued for processing (acceptable during spike)
          return r.status === 202 || r.status === 429;
        },
      });

      spikeErrorRate.add(!ok ? 1 : 0);
    });
  }

  // Minimal think time — spike users are frantic
  sleep(Math.random() * 0.5);
}
