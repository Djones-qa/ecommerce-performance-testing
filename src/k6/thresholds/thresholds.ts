/**
 * Shared SLA thresholds for all k6 test scenarios.
 *
 * Two-tier threshold strategy:
 *
 *   CI_THRESHOLDS  — used in GitHub Actions (shared runners, mock server).
 *                    Validates the test completes cleanly without crashes.
 *                    Deliberately relaxed — GitHub runners aren't prod hardware.
 *
 *   PROD_THRESHOLDS — used against real infrastructure (point k6 at staging/prod).
 *                     Hard SLA gates: p95 < 500ms, p99 < 1s, error rate < 1%.
 *
 * Switch between them via the BASE_URL env var or by passing --env STRICT=true.
 */

import { Options } from "k6/options";

// ─── Production SLA targets (run locally or against staging) ──────────────────

/** Production-grade SLA — target for real infrastructure */
export const PROD_THRESHOLDS: Options["thresholds"] = {
  http_req_duration: [
    "p(95)<500",
    "p(99)<1000",
    "avg<300",
  ],
  http_req_failed: ["rate<0.01"],
  http_reqs: ["rate>100"],
  http_req_connecting: ["p(95)<100"],
  http_req_waiting: ["p(95)<400"],
};

// ─── CI-safe thresholds (GitHub-hosted runners + mock server) ─────────────────

/** CI thresholds — validates test runs without errors, not raw latency */
export const BASE_THRESHOLDS: Options["thresholds"] = {
  // Latency: relaxed for shared CI runners (2–4 vCPU, cold Node.js process)
  http_req_duration: [
    "p(95)<3000",
    "p(99)<5000",
  ],
  // Error rate: allow up to 5% — mock server payment failures + CI noise
  http_req_failed: ["rate<0.05"],
  // Throughput: just confirm requests are flowing
  http_reqs: ["rate>10"],
};

/** Checkout thresholds for CI — revenue path must not fully collapse */
export const CHECKOUT_THRESHOLDS: Options["thresholds"] = {
  ...BASE_THRESHOLDS,
  "http_req_duration{endpoint:checkout}": [
    "p(95)<5000",
    "p(99)<8000",
  ],
  // Allow up to 10% checkout errors on CI (mock has 2% intentional payment failures
  // plus connection contention under 500 VUs on a 2-core runner)
  "http_req_failed{endpoint:checkout}": ["rate<0.10"],
};

/** Soak test thresholds — focus is stability, not speed */
export const SOAK_THRESHOLDS: Options["thresholds"] = {
  http_req_duration: [
    "p(95)<3000",
    "p(99)<5000",
  ],
  http_req_failed: ["rate<0.05"],
  http_reqs: ["rate>10"],
};

/** Spike test thresholds — system must not fully die during burst */
export const SPIKE_THRESHOLDS: Options["thresholds"] = {
  http_req_duration: [
    "p(95)<10000",
    "p(99)<15000",
  ],
  http_req_failed: ["rate<0.20"],
};
