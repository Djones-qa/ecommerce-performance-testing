# ⚡ E-Commerce Performance Testing Suite

[![Performance Tests](https://github.com/Djones-qa/ecommerce-performance-testing/actions/workflows/performance-tests.yml/badge.svg)](https://github.com/Djones-qa/ecommerce-performance-testing/actions/workflows/performance-tests.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![k6](https://img.shields.io/badge/k6-0.49-7D64FF?logo=k6&logoColor=white)](https://k6.io/)
[![Artillery](https://img.shields.io/badge/Artillery-2.0-FF6B35?logo=artillery&logoColor=white)](https://www.artillery.io/)
[![Grafana](https://img.shields.io/badge/Grafana-10.2-F46800?logo=grafana&logoColor=white)](https://grafana.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

> Production-grade performance & load testing suite for e-commerce REST APIs. Mirrors the toolchain used at **Shopify**, **Walmart Labs**, and **Amazon** to validate APIs survive Black Friday traffic.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI Pipeline                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ TypeCheck│  │k6 Tests  │  │Artillery │  │ Lighthouse CI │  │
│  │  (tsc)   │  │500→2000  │  │  Spike + │  │  LCP/CLS/FID  │  │
│  │          │  │   VUs    │  │  Search  │  │   Web Vitals  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│       └─────────────┴─────────────┴────────────────┘           │
│                         Performance Gate                         │
│              (Hard fail if SLA thresholds breached)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Local Testing Stack                          │
│                                                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  k6 / CLI   │───▶│  Mock API    │───▶│  InfluxDB 1.8    │   │
│  │  Artillery  │    │  Express.js  │    │  (metrics store) │   │
│  │  Lighthouse │    │  Port 3000   │    │  Port 8086       │   │
│  └─────────────┘    └──────────────┘    └────────┬─────────┘   │
│                                                   │             │
│                                         ┌─────────▼─────────┐  │
│                                         │  Grafana 10.2      │  │
│                                         │  Real-time dash    │  │
│                                         │  Port 3001         │  │
│                                         └───────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Test Scenarios

| Scenario | Tool | VUs | Duration | Purpose |
|----------|------|-----|----------|---------|
| **Load Test** | k6 | 500 | ~20 min | Steady-state production traffic |
| **Stress Test** | k6 | 0→2000 | ~28 min | Find the breaking point |
| **Soak Test** | k6 | 200 | ~2 hours | Detect memory leaks & degradation |
| **Spike Test** | k6 | 0→2000 in 30s | ~12 min | Black Friday midnight surge |
| **Search Load** | Artillery | 100→200/s | ~9 min | Search API sustained load |
| **Checkout Spike** | Artillery | 50→500/s | ~6 min | Checkout pipeline under spike |

---

## SLA Thresholds (Hard CI Gates)

| Metric | Threshold | Consequence |
|--------|-----------|-------------|
| p95 response time | **< 500ms** | CI fails |
| p99 response time | **< 1000ms** | CI fails |
| Error rate | **< 1%** | CI fails |
| Throughput | **> 100 req/s** | CI fails |
| Checkout p95 | **< 800ms** | CI fails |
| Checkout error rate | **< 0.5%** | CI fails |

---

## Quick Start

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [k6](https://k6.io/docs/get-started/installation/)
- [Docker + Docker Compose](https://docs.docker.com/get-docker/) (for Grafana dashboard)

### 1. Install dependencies

```bash
npm install
```

### 2. Start the mock API server

```bash
npm run mock-server
# → http://localhost:3000
```

### 3. Start the Grafana + InfluxDB stack

```bash
npm run docker:up
# Grafana → http://localhost:3001  (admin/admin)
# InfluxDB → http://localhost:8086
```

### 4. Run load tests

```bash
# Load test — 500 VUs, full e-commerce journey
npm run k6:load

# Stress test — ramp to breaking point
npm run k6:stress

# Soak test — 2-hour sustained load
npm run k6:soak

# Spike test — Black Friday simulation
npm run k6:spike
```

### 5. Run Artillery tests

```bash
# Product search load test
npm run artillery:search

# Black Friday checkout spike
npm run artillery:checkout
```

### 6. Run Lighthouse CI

```bash
npm run lighthouse
```

### 7. Generate HTML report

```bash
# After running a k6 test with --out json=results.json
npm run report -- --input results.json --output reports/report.html
```

---

## Mock API Endpoints

The included Express mock server simulates a production e-commerce API:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check with service status |
| `GET` | `/products` | Product listing with pagination & sorting |
| `GET` | `/products/:id` | Product detail with related items |
| `POST` | `/cart` | Add item to cart |
| `GET` | `/cart/:sessionId` | Get cart contents |
| `POST` | `/checkout` | Process order (simulates payment) |
| `GET` | `/search?q=` | Full-text product search |
| `POST` | `/auth/login` | Mock authentication |

---

## Project Structure

```
ecommerce-performance-testing/
├── .github/
│   └── workflows/
│       └── performance-tests.yml   # CI pipeline with hard gates
├── docker/
│   ├── Dockerfile                  # Mock API container
│   ├── docker-compose.yml          # Full observability stack
│   └── grafana/
│       ├── dashboards/
│       │   └── k6-dashboard.json   # Pre-built Grafana dashboard
│       └── provisioning/           # Auto-provisioned datasources
├── lighthouserc.json               # Core Web Vitals thresholds
├── src/
│   ├── k6/
│   │   ├── scenarios/
│   │   │   ├── load-test.ts        # 500 VUs, product + cart + checkout
│   │   │   ├── stress-test.ts      # Ramp to breaking point
│   │   │   ├── soak-test.ts        # 2hr sustained load
│   │   │   └── spike-test.ts       # 0→2000 VUs in 30s
│   │   ├── helpers/
│   │   │   ├── auth.ts             # Token generation helpers
│   │   │   └── data.ts             # Test data generators
│   │   └── thresholds/
│   │       └── thresholds.ts       # Shared SLA definitions
│   ├── artillery/
│   │   ├── checkout-spike.yml      # Black Friday checkout spike
│   │   └── product-search-load.yml # Search API load test
│   └── mock-server/
│       └── app.ts                  # Express mock e-commerce API
├── scripts/
│   └── generate-report.ts          # HTML summary report generator
├── package.json
├── tsconfig.json
└── README.md
```

---

## Grafana Dashboard

The pre-built dashboard auto-provisions when you run `npm run docker:up`:

- **Real-time p50/p95/p99 response time** charts
- **Throughput** (requests/sec) over time
- **Error rate** with threshold indicators
- **Active VUs** gauge
- **Per-endpoint breakdown** via tags

Access at **http://localhost:3001** (admin/admin).

---

## CI Pipeline

The GitHub Actions workflow runs on every push to `main`/`develop` and nightly at 2 AM UTC:

```
push/PR → TypeScript Check
              ↓
    ┌─────────┼──────────┬──────────────┐
    ▼         ▼          ▼              ▼
k6 Load   Artillery   Lighthouse    k6 Stress/Spike
  Test      Tests       CI          (manual trigger)
    └─────────┴──────────┴──────────────┘
                    ↓
           Performance Gate
        (fails build if SLAs breached)
```

Trigger specific test types manually via **Actions → Run workflow → test_type**.

---

## Topics

`k6` · `performance-testing` · `load-testing` · `ecommerce` · `artillery` · `lighthouse` · `grafana` · `stress-testing` · `api-testing` · `web-vitals` · `influxdb` · `typescript` · `github-actions` · `black-friday`

---

## Author

**Darrius Jones**

[![GitHub](https://img.shields.io/badge/GitHub-Djones--qa-181717?logo=github)](https://github.com/Djones-qa)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?logo=linkedin)](https://linkedin.com/in/darrius-jones)

---

## License

[MIT](./LICENSE) © 2024 Darrius Jones
