// Latency, hangs and errors for one run, and the report printed at the end.

export const HANG_MS = 10_000;

export const P95_LIMIT_MS = 500;
export const BURST_LIMIT_MS = 2_000;

const bump = (map, name) => map.set(name, (map.get(name) ?? 0) + 1);
const isHttp = (name) => /^(GET|POST|PUT|PATCH|DELETE) /.test(name);
const percentile = (sorted, p) => sorted[Math.ceil((p / 100) * sorted.length) - 1] ?? 0;

export class Metrics {
  samples = new Map();
  errors = new Map();
  hangs = new Map();
  outageErrors = new Map();
  // Set while the API is deliberately down.
  outage = false;
  killed = false;

  // A failure the restart caused: anything during the outage, or a dropped
  // connection after it (Node's fetch reuses keep-alive connections the killed
  // process left; a browser would retry them). http() sets `cause` only for
  // connection-level failures.
  restartFallout(error) {
    return this.outage || (this.killed && error.cause !== undefined);
  }

  record(name, ms) {
    if (!this.samples.has(name)) this.samples.set(name, []);
    this.samples.get(name).push(ms);
  }

  async timed(name, promise) {
    const start = performance.now();
    let hung = false;
    const timer = setTimeout(() => {
      hung = true;
      bump(this.hangs, name);
    }, HANG_MS);
    try {
      const value = await promise;
      if (!hung) this.record(name, performance.now() - start);
      return value;
    } catch (error) {
      bump(this.restartFallout(error) ? this.outageErrors : this.errors, name);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // Time from a cause (an emit, a click) to each client that reacts to it.
  since(name, startedAt) {
    if (startedAt !== undefined) this.record(name, performance.now() - startedAt);
  }

  stats(name) {
    const sorted = [...(this.samples.get(name) ?? [])].sort((a, b) => a - b);
    return {
      count: sorted.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted.at(-1) ?? 0,
    };
  }

  apiStats() {
    const all = [...this.samples]
      .filter(([name]) => isHttp(name))
      .flatMap(([, values]) => values)
      .sort((a, b) => a - b);
    return { count: all.length, p95: percentile(all, 95) };
  }

  total(map) {
    return [...map.values()].reduce((sum, n) => sum + n, 0);
  }

  table() {
    const ms = (n) => String(Math.round(n));
    const names = [
      ...new Set([...this.samples.keys(), ...this.errors.keys(), ...this.hangs.keys()]),
    ];
    const rows = names.sort().map((name) => {
      const s = this.stats(name);
      const flag = s.p95 > P95_LIMIT_MS && isHttp(name) ? ' ⚠' : '';
      return `| ${name}${flag} | ${s.count} | ${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.p99)} | ${ms(s.max)} | ${this.errors.get(name) ?? 0} | ${this.hangs.get(name) ?? 0} |`;
    });
    return [
      '| Request or event | Count | p50 ms | p95 ms | p99 ms | Max ms | Errors | Hangs |',
      '| --- | --: | --: | --: | --: | --: | --: | --: |',
      ...rows,
    ].join('\n');
  }
}
