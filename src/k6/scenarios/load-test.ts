/**
 * Load Test — Steady-state traffic simulation
 *
 * Simulates 500 concurrent virtual users exercising the full
 * e-commerce flow: browse products → add to cart → checkout.
 *
 * Mirrors Black Friday "warm-up" traffic patterns used at Shopify/Walmart Labs.
 *
 * Stages:
 *   0 → 100 VUs  over  2 min  (ramp up)
 *   100 → 500 VUs over  5 min  (scale to peak)
 *   500 VUs       for  10 min  (sustained load)
 *   500 → 0 VUs  over  3 min  (ramp down)
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Options } from "k6/options";
import { Counter, Rate, Trend } from "k6/metrics";

import { BASE_THRESHOLDS, CHECKOUT_THRESHOLDS } from "../thresholds/thresholds";
import {
  generateCartItem,
  generateCheckoutPayload,
  generatePaginationParams,
  generateSearchQuery,
  randomProductId,
} from "../helpers/data";
import { generateSyntheticToken, authHeaders } from "../helpers/auth";

// ─── Custom Metrics ────────────────────────────────────────────────────────────
const checkoutSuccessRate = new Rate("checkout_success_rate");
const cartAddSuccessRate = new Rate("cart_add_success_rate");
const productPageDuration = new Trend("product_page_duration", true);
const checkoutDuration = new Trend("checkout_duration", true);
const errorCount = new Counter("error_count");

// ─── Test Configuration ────────────────────────────────────────────────────────
const BASE_URL = __ENV["BASE_URL"] ?? "http://localhost:3000";

export const options: Options = {
  stages: [
    { duration: "2m", target: 100 },   // Ramp up to 100 VUs
    { duration: "5m", target: 500 },   // Scale to 500 VUs
    { duration: "10m", target: 500 },  // Sustain peak load
    { duration: "3m", target: 0 },     // Ramp down
  ],
  thresholds: {
    ...BASE_THRESHOLDS,
    ...CHECKOUT_THRESHOLDS,
    // Custom metric thresholds — relaxed for CI environment
    checkout_success_rate: ["rate>0.85"],
    cart_add_success_rate: ["rate>0.90"],
    checkout_duration: ["p(95)<5000"],
    product_page_duration: ["p(95)<3000"],
  },
  ext: {
    loadimpact: {
      projectID: 3596791,
      name: "Ecommerce Load Test — 500 VUs",
    },
  },
};

// ─── Main VU Script ────────────────────────────────────────────────────────────
export default function (): void {
  const token = generateSyntheticToken();
  const headers = authHeaders(token);

  // ── 1. Browse product listing ──────────────────────────────────────────────
  group("Product Listing", () => {
    const params = generatePaginationParams();
    const url = `${BASE_URL}/products?page=${params.page}&limit=${params.limit}&sort=${params.sort}`;

    const startTime = Date.now();
    const res = http.get(url, { headers, tags: { endpoint: "product_list" } });
    productPageDuration.add(Date.now() - startTime);

    const ok = check(res, {
      "product list: status 200": (r) => r.status === 200,
      "product list: has data array": (r) => {
        const body = r.json() as Record<string, unknown>;
        return Array.isArray(body["data"]);
      },
      "product list: response time < 500ms": (r) => r.timings.duration < 500,
    });

    if (!ok) errorCount.add(1);
    sleep(1);
  });

  // ── 2. View product detail ─────────────────────────────────────────────────
  group("Product Detail", () => {
    const productId = randomProductId();
    const res = http.get(`${BASE_URL}/products/${productId}`, {
      headers,
      tags: { endpoint: "product_detail" },
    });

    check(res, {
      "product detail: status 200": (r) => r.status === 200,
      "product detail: has id field": (r) => {
        const body = r.json() as Record<string, unknown>;
        return typeof body["id"] === "number";
      },
      "product detail: response time < 300ms": (r) => r.timings.duration < 300,
    });

    sleep(0.5);
  });

  // ── 3. Search products ─────────────────────────────────────────────────────
  group("Product Search", () => {
    const query = generateSearchQuery();
    const res = http.get(
      `${BASE_URL}/search?q=${encodeURIComponent(query)}`,
      { headers, tags: { endpoint: "search" } }
    );

    check(res, {
      "search: status 200": (r) => r.status === 200,
      "search: has results": (r) => {
        const body = r.json() as Record<string, unknown>;
        return Array.isArray(body["results"]);
      },
    });

    sleep(0.5);
  });

  // ── 4. Add to cart ─────────────────────────────────────────────────────────
  group("Add to Cart", () => {
    const cartItem = generateCartItem();
    const payload = JSON.stringify({
      ...cartItem,
      sessionId: token.sessionId,
    });

    const res = http.post(`${BASE_URL}/cart`, payload, {
      headers,
      tags: { endpoint: "cart_add" },
    });

    const ok = check(res, {
      "cart add: status 200 or 201": (r) => r.status === 200 || r.status === 201,
      "cart add: has sessionId": (r) => {
        const body = r.json() as Record<string, unknown>;
        return typeof body["sessionId"] === "string";
      },
      "cart add: response time < 400ms": (r) => r.timings.duration < 400,
    });

    cartAddSuccessRate.add(ok);
    if (!ok) errorCount.add(1);
    sleep(0.5);
  });

  // ── 5. View cart ───────────────────────────────────────────────────────────
  group("View Cart", () => {
    const res = http.get(`${BASE_URL}/cart/${token.sessionId}`, {
      headers,
      // name tag normalizes the URL so all cart views share one metric series
      tags: { endpoint: "cart_view", name: "GET /cart/:sessionId" },
    });

    check(res, {
      "cart view: status 200": (r) => r.status === 200,
      "cart view: has items array": (r) => {
        const body = r.json() as Record<string, unknown>;
        return Array.isArray(body["items"]);
      },
    });

    sleep(1);
  });

  // ── 6. Checkout (30% of users complete purchase) ───────────────────────────
  if (Math.random() < 0.3) {
    group("Checkout", () => {
      const checkoutPayload = generateCheckoutPayload(token.sessionId);

      const startTime = Date.now();
      const res = http.post(
        `${BASE_URL}/checkout`,
        JSON.stringify(checkoutPayload),
        { headers, tags: { endpoint: "checkout", name: "POST /checkout" } }
      );
      checkoutDuration.add(Date.now() - startTime);

      const ok = check(res, {
        "checkout: status 200 or 201": (r) => r.status === 200 || r.status === 201,
        "checkout: has orderId": (r) => {
          const body = r.json() as Record<string, unknown>;
          return typeof body["orderId"] === "string";
        },
        "checkout: response time < 800ms": (r) => r.timings.duration < 800,
      });

      checkoutSuccessRate.add(ok);
      if (!ok) errorCount.add(1);
    });
  }

  // Think time between user journeys
  sleep(Math.random() * 2 + 1);
}
