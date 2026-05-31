/**
 * Performance Test Report Generator
 *
 * Parses k6 JSON output and generates a rich HTML summary report.
 * Includes charts, threshold pass/fail status, and trend analysis.
 *
 * Usage:
 *   k6 run --out json=results.json src/k6/scenarios/load-test.ts
 *   ts-node scripts/generate-report.ts --input results.json --output reports/report.html
 */

import * as fs from "fs";
import * as path from "path";

interface K6Metric {
  type: string;
  data: {
    name: string;
    value: number;
    tags?: Record<string, string>;
    time?: string;
  };
}

interface ThresholdResult {
  name: string;
  passed: boolean;
  value: number;
  threshold: string;
}

interface ReportData {
  testName: string;
  startTime: string;
  endTime: string;
  duration: string;
  totalRequests: number;
  failedRequests: number;
  errorRate: number;
  p95: number;
  p99: number;
  avgDuration: number;
  maxDuration: number;
  requestsPerSecond: number;
  thresholds: ThresholdResult[];
  passed: boolean;
}

function parseArgs(): { input: string; output: string; testName: string } {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf("--input");
  const outputIdx = args.indexOf("--output");
  const nameIdx = args.indexOf("--name");

  return {
    input: inputIdx >= 0 ? (args[inputIdx + 1] ?? "results.json") : "results.json",
    output: outputIdx >= 0 ? (args[outputIdx + 1] ?? "reports/report.html") : "reports/report.html",
    testName: nameIdx >= 0 ? (args[nameIdx + 1] ?? "Performance Test") : "Performance Test",
  };
}

function parseK6Results(filePath: string): ReportData {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Results file not found: ${filePath}`);
  }

  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  const metrics: K6Metric[] = lines.map((line) => JSON.parse(line) as K6Metric);

  const durations: number[] = [];
  let totalRequests = 0;
  let failedRequests = 0;
  let startTime = "";
  let endTime = "";

  for (const metric of metrics) {
    if (metric.type === "Point" && metric.data.name === "http_req_duration") {
      durations.push(metric.data.value);
      if (!startTime && metric.data.time) startTime = metric.data.time;
      if (metric.data.time) endTime = metric.data.time;
    }
    if (metric.type === "Point" && metric.data.name === "http_reqs") {
      totalRequests++;
    }
    if (metric.type === "Point" && metric.data.name === "http_req_failed") {
      if (metric.data.value === 1) failedRequests++;
    }
  }

  durations.sort((a, b) => a - b);
  const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;
  const p99 = durations[Math.floor(durations.length * 0.99)] ?? 0;
  const avg = durations.reduce((a, b) => a + b, 0) / (durations.length || 1);
  const max = durations[durations.length - 1] ?? 0;
  const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

  const start = startTime ? new Date(startTime) : new Date();
  const end = endTime ? new Date(endTime) : new Date();
  const durationMs = end.getTime() - start.getTime();
  const durationSec = durationMs / 1000;
  const rps = totalRequests / (durationSec || 1);

  const thresholds: ThresholdResult[] = [
    { name: "p95 < 500ms", passed: p95 < 500, value: Math.round(p95), threshold: "500ms" },
    { name: "p99 < 1000ms", passed: p99 < 1000, value: Math.round(p99), threshold: "1000ms" },
    { name: "Error rate < 1%", passed: errorRate < 1, value: parseFloat(errorRate.toFixed(2)), threshold: "1%" },
    { name: "RPS > 100", passed: rps > 100, value: Math.round(rps), threshold: "100 req/s" },
  ];

  return {
    testName: parseArgs().testName,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    duration: `${Math.floor(durationSec / 60)}m ${Math.floor(durationSec % 60)}s`,
    totalRequests,
    failedRequests,
    errorRate: parseFloat(errorRate.toFixed(2)),
    p95: Math.round(p95),
    p99: Math.round(p99),
    avgDuration: Math.round(avg),
    maxDuration: Math.round(max),
    requestsPerSecond: parseFloat(rps.toFixed(1)),
    thresholds,
    passed: thresholds.every((t) => t.passed),
  };
}

function generateHTML(data: ReportData): string {
  const statusColor = data.passed ? "#22c55e" : "#ef4444";
  const statusText = data.passed ? "✅ PASSED" : "❌ FAILED";

  const thresholdRows = data.thresholds
    .map(
      (t) => `
      <tr>
        <td>${t.name}</td>
        <td>${t.value}${t.name.includes("rate") ? "%" : t.name.includes("RPS") ? " req/s" : "ms"}</td>
        <td>${t.threshold}</td>
        <td style="color: ${t.passed ? "#22c55e" : "#ef4444"}; font-weight: bold;">
          ${t.passed ? "✅ PASS" : "❌ FAIL"}
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.testName} — Performance Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.25rem; margin: 1.5rem 0 1rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
    .status { font-size: 1.5rem; font-weight: bold; color: ${statusColor}; margin-bottom: 2rem; }
    .meta { color: #64748b; margin-bottom: 2rem; font-size: 0.9rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border-radius: 0.75rem; padding: 1.25rem; border: 1px solid #334155; }
    .card-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card-value { font-size: 1.75rem; font-weight: bold; color: #f1f5f9; }
    .card-unit { font-size: 0.875rem; color: #94a3b8; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 0.75rem; overflow: hidden; }
    th { background: #334155; padding: 0.75rem 1rem; text-align: left; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; }
    td { padding: 0.75rem 1rem; border-bottom: 1px solid #334155; font-size: 0.9rem; }
    tr:last-child td { border-bottom: none; }
    .footer { margin-top: 2rem; color: #475569; font-size: 0.8rem; text-align: center; }
  </style>
</head>
<body>
  <h1>${data.testName}</h1>
  <div class="status">${statusText}</div>
  <div class="meta">
    Started: ${new Date(data.startTime).toLocaleString()} &nbsp;|&nbsp;
    Duration: ${data.duration} &nbsp;|&nbsp;
    Ended: ${new Date(data.endTime).toLocaleString()}
  </div>

  <h2>Key Metrics</h2>
  <div class="grid">
    <div class="card">
      <div class="card-label">Total Requests</div>
      <div class="card-value">${data.totalRequests.toLocaleString()}</div>
    </div>
    <div class="card">
      <div class="card-label">Requests/sec</div>
      <div class="card-value">${data.requestsPerSecond}<span class="card-unit"> rps</span></div>
    </div>
    <div class="card">
      <div class="card-label">Error Rate</div>
      <div class="card-value" style="color: ${data.errorRate < 1 ? "#22c55e" : "#ef4444"}">${data.errorRate}<span class="card-unit">%</span></div>
    </div>
    <div class="card">
      <div class="card-label">p95 Latency</div>
      <div class="card-value" style="color: ${data.p95 < 500 ? "#22c55e" : "#ef4444"}">${data.p95}<span class="card-unit">ms</span></div>
    </div>
    <div class="card">
      <div class="card-label">p99 Latency</div>
      <div class="card-value" style="color: ${data.p99 < 1000 ? "#22c55e" : "#ef4444"}">${data.p99}<span class="card-unit">ms</span></div>
    </div>
    <div class="card">
      <div class="card-label">Avg Latency</div>
      <div class="card-value">${data.avgDuration}<span class="card-unit">ms</span></div>
    </div>
    <div class="card">
      <div class="card-label">Max Latency</div>
      <div class="card-value">${data.maxDuration}<span class="card-unit">ms</span></div>
    </div>
    <div class="card">
      <div class="card-label">Failed Requests</div>
      <div class="card-value" style="color: ${data.failedRequests === 0 ? "#22c55e" : "#ef4444"}">${data.failedRequests.toLocaleString()}</div>
    </div>
  </div>

  <h2>Threshold Results</h2>
  <table>
    <thead>
      <tr><th>Threshold</th><th>Actual</th><th>Limit</th><th>Status</th></tr>
    </thead>
    <tbody>${thresholdRows}</tbody>
  </table>

  <div class="footer">
    Generated by ecommerce-performance-testing &nbsp;|&nbsp; ${new Date().toISOString()}
  </div>
</body>
</html>`;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
const { input, output } = parseArgs();

try {
  console.log(`📊 Parsing results from: ${input}`);
  const reportData = parseK6Results(input);

  const outputDir = path.dirname(output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const html = generateHTML(reportData);
  fs.writeFileSync(output, html, "utf-8");

  console.log(`✅ Report generated: ${output}`);
  console.log(`\n📈 Summary:`);
  console.log(`   Total Requests: ${reportData.totalRequests.toLocaleString()}`);
  console.log(`   RPS: ${reportData.requestsPerSecond}`);
  console.log(`   p95: ${reportData.p95}ms`);
  console.log(`   p99: ${reportData.p99}ms`);
  console.log(`   Error Rate: ${reportData.errorRate}%`);
  console.log(`\n${reportData.passed ? "✅ All thresholds PASSED" : "❌ Some thresholds FAILED"}`);

  process.exit(reportData.passed ? 0 : 1);
} catch (err) {
  console.error("❌ Report generation failed:", err);
  process.exit(1);
}
