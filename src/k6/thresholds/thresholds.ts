/**
 * Shared SLA thresholds for all k6 test scenarios.
 * These mirror production performance gates used at scale.
 *
 * Hard gates (CI will fail if breached):
 *   - p95 response time < 500ms
 *   - p99 response time < 1000ms
 *   - Error rate < 1%
 *   - Throughput > 100 req/s
 */

import { Options } from "k6/options";

/** Core SLA thresholds applied to every scenario */
export const BASE_THRESHOLDS: Options["thresholds"] = {
  // Response time SLAs
  http_req_duration: [
    "p(95)<500",   // 95th percentile under 500ms
    "p(99)<1000",  // 99th percentile under 1000ms
    "avg<300",     // average under 300ms
  ],

  // Error rate gate — less than 1% failures
  http_req_failed: ["rate<0.01"],

  // Throughput gate — at least 100 requests per second
  http_reqs: ["rate>100"],

  // Connection timing
  http_req_connecting: ["p(95)<100"],
  http_req_tls_handshaking: ["p(95)<100"],
  http_req_waiting: ["p(95)<400"],
};

/** Stricter thresholds for checkout — revenue-critical path */
export const CHECKOUT_THRESHOLDS: Options["thresholds"] = {
  ...BASE_THRESHOLDS,
  "http_req_duration{endpoint:checkout}": [
    "p(95)<800",
    "p(99)<1500",
  ],
  "http_req_failed{endpoint:checkout}": ["rate<0.005"], // 0.5% max errors on checkout
};

/** Relaxed thresholds for soak tests — focus on stability over speed */
export const SOAK_THRESHOLDS: Options["thresholds"] = {
  http_req_duration: [
    "p(95)<600",
    "p(99)<1200",
  ],
  http_req_failed: ["rate<0.01"],
  http_reqs: ["rate>50"],
};

/** Spike test thresholds — allow higher latency during traffic bursts */
export const SPIKE_THRESHOLDS: Options["thresholds"] = {
  http_req_duration: [
    "p(95)<2000",  // Allow up to 2s during spike
    "p(99)<5000",
  ],
  http_req_failed: ["rate<0.05"], // Allow up to 5% errors during spike
};
