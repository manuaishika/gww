import { describe, expect, it } from "vitest";
import { computeStats } from "./stats";
import { computeSignals } from "./signals";
import {
  detectIdiosyncratic,
  detectReturnZ,
  detectStructural,
  detectSymbol,
  detectVolume,
} from "./detectors";
import type { Bar, DetectContext } from "./types";

// ─── fixture helpers ────────────────────────────────────────────────────────

/** N ascending weekday dates from a start date (skips Sat/Sun). */
function weekdays(n: number, start = "2024-01-01"): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function pricesFromReturns(rets: number[], p0 = 1000): number[] {
  const px = [p0];
  for (const r of rets) px.push(px[px.length - 1] * Math.exp(r));
  return px;
}

type BarOpts = {
  dates?: string[];
  volume?: number | ((i: number) => number);
  /** raw close series; when omitted, close === adjClose === price */
  close?: number[];
  open?: number[];
};

function toBars(adjClose: number[], opts: BarOpts = {}): Bar[] {
  const dates = opts.dates ?? weekdays(adjClose.length);
  return adjClose.map((ac, i) => {
    const c = opts.close?.[i] ?? ac;
    const o = opts.open?.[i] ?? c;
    const vol =
      typeof opts.volume === "function"
        ? opts.volume(i)
        : (opts.volume ?? 1_000_000);
    return {
      sessionDate: dates[i],
      open: o,
      high: Math.max(o, c) * 1.004,
      low: Math.min(o, c) * 0.996,
      close: c,
      adjClose: ac,
      volume: vol,
    };
  });
}

/** Deterministic index returns in ~[-1%, +1%]. */
const indexRet = (i: number): number => Math.sin(i * 1.3) * 0.008 + Math.cos(i * 0.7) * 0.003;
/** Deterministic small idiosyncratic noise, ~±0.15%. */
const noise = (i: number): number => (i % 2 === 0 ? 1 : -1) * 0.0015 + Math.sin(i * 2.1) * 0.0004;

function buildContext(
  bars: Bar[],
  indexBars: Bar[],
  over: Partial<DetectContext> = {},
): DetectContext {
  return {
    symbol: over.symbol ?? "TEST",
    sessionDate: bars[bars.length - 1].sessionDate,
    bars,
    indexBars,
    stats: over.stats ?? computeStats(bars, indexBars),
    horizonSessions: over.horizonSessions ?? 1,
    circuitState: over.circuitState ?? "none",
  };
}

/**
 * A base world: 90 sessions where the stock is `beta` × index + small noise,
 * then one more session with a specified (stockRet, indexRet). Dates are shared
 * so the index aligns.
 */
function world(opts: {
  beta: number;
  finalStockRet: number;
  finalIndexRet: number;
  n?: number;
  baseVolume?: number;
  finalVolume?: number;
  /** when true the baseline volume history is perfectly flat (MAD = 0 case) */
  constantVolume?: boolean;
}) {
  const n = opts.n ?? 90;

  const idxRets = Array.from({ length: n }, (_, i) => indexRet(i));
  const stkRets = idxRets.map((r, i) => opts.beta * r + noise(i));
  idxRets.push(opts.finalIndexRet);
  stkRets.push(opts.finalStockRet);

  // pricesFromReturns yields rets.length + 1 prices → this many bars
  const barCount = idxRets.length + 1;
  const dates = weekdays(barCount);
  const base = opts.baseVolume ?? 1_000_000;
  const jitter = (i: number) =>
    opts.constantVolume ? 1 : 1 + 0.15 * Math.sin(i * 1.7);

  const indexBars = toBars(pricesFromReturns(idxRets, 20000), { dates });
  const bars = toBars(pricesFromReturns(stkRets, 1000), {
    dates,
    volume: (i) =>
      i === barCount - 1 && opts.finalVolume != null
        ? opts.finalVolume
        : Math.round(base * jitter(i)),
  });
  return { bars, indexBars, dates, barCount };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("computeStats", () => {
  it("recovers a known beta", () => {
    const { bars, indexBars } = world({ beta: 1.3, finalStockRet: 0, finalIndexRet: 0 });
    const stats = computeStats(bars, indexBars);
    expect(stats.beta60).not.toBeNull();
    expect(stats.beta60!).toBeCloseTo(1.3, 1);
    expect(stats.sigma60!).toBeGreaterThan(0);
    expect(stats.residSigma60!).toBeGreaterThan(0);
    expect(stats.sessionsAvailable).toBe(92);
  });

  it("reports insufficient history and fires nothing", () => {
    const { bars, indexBars } = world({ beta: 1, finalStockRet: 0.09, finalIndexRet: 0, n: 30 });
    const ctx = buildContext(bars, indexBars);
    expect(ctx.stats.sessionsAvailable).toBeLessThan(60);
    expect(detectSymbol(ctx)).toBeNull();
  });
});

describe("idiosyncratic detector (spec §4.2)", () => {
  it("a stock that moved exactly with the index has z_idio ≈ 0 and no event", () => {
    const { bars, indexBars } = world({
      beta: 1.2,
      finalIndexRet: 0.02,
      finalStockRet: 1.2 * 0.02, // pure market move, no company component
    });
    const ctx = buildContext(bars, indexBars);
    const s = computeSignals(ctx);
    expect(Math.abs(s.zIdio!)).toBeLessThan(1);
    expect(detectIdiosyncratic(ctx, s)).toBeNull();
  });

  it("a stock that moved against a flat index fires a strong idio event", () => {
    const { bars, indexBars } = world({
      beta: 1.2,
      finalIndexRet: 0.0,
      finalStockRet: 0.08, // +8% with the market flat
    });
    const ctx = buildContext(bars, indexBars);
    const s = computeSignals(ctx);
    const event = detectIdiosyncratic(ctx, s);
    expect(event).not.toBeNull();
    expect(event!.detector).toBe("idio_z");
    expect(Math.abs(event!.z)).toBeGreaterThan(3);
    expect(event!.payload.strength).toBe("strong");
    // the whole move is company-specific
    expect(event!.payload.companyPct as number).toBeGreaterThan(6);
    expect(Math.abs(event!.payload.marketPct as number)).toBeLessThan(0.5);
  });

  it("decomposes a mixed move into market and company parts", () => {
    const { bars, indexBars } = world({
      beta: 1.0,
      finalIndexRet: 0.01, // +1% market
      finalStockRet: 0.04, // +4% total → ~3% company
    });
    const ctx = buildContext(bars, indexBars);
    const s = computeSignals(ctx);
    const event = detectIdiosyncratic(ctx, s)!;
    expect(event.payload.totalPct as number).toBeCloseTo(4.08, 0);
    expect(event.payload.marketPct as number).toBeCloseTo(1.0, 0);
    expect(event.payload.companyPct as number).toBeCloseTo(3.0, 0);
  });
});

describe("return-z detector (spec §4.1)", () => {
  it("fires on a > 2σ move and labels ≥ 3σ as strong", () => {
    const { bars, indexBars } = world({ beta: 1, finalStockRet: 0.07, finalIndexRet: 0 });
    const ctx = buildContext(bars, indexBars);
    const s = computeSignals(ctx);
    const event = detectReturnZ(ctx, s)!;
    expect(event.detector).toBe("return_z");
    expect(Math.abs(event.z)).toBeGreaterThan(2);
    expect(event.payload.returnPct as number).toBeCloseTo(7.25, 0);
  });

  it("does not fire on a quiet session", () => {
    const { bars, indexBars } = world({ beta: 1, finalStockRet: 0.002, finalIndexRet: 0.002 });
    const ctx = buildContext(bars, indexBars);
    const s = computeSignals(ctx);
    expect(detectReturnZ(ctx, s)).toBeNull();
  });
});

describe("splits and bonus issues (spec §9)", () => {
  it("a 1:2 split does not fire the return detector (adjClose is smooth)", () => {
    const { bars, indexBars } = world({ beta: 1, finalStockRet: 0.001, finalIndexRet: 0.001 });
    // simulate an unadjusted split on the last day: raw close halves,
    // adjClose (what the detector uses) stays continuous.
    const rawClose = bars.map((b, i) => (i === bars.length - 1 ? b.adjClose / 2 : b.adjClose));
    const split = toBars(
      bars.map((b) => b.adjClose),
      { dates: bars.map((b) => b.sessionDate), close: rawClose },
    );
    const ctx = buildContext(split, indexBars);
    const s = computeSignals(ctx);
    expect(Math.abs(s.zRet!)).toBeLessThan(2);
    expect(detectReturnZ(ctx, s)).toBeNull();
    // the naive check on raw close would have been a ~-69% "return"
    const naive = Math.log(rawClose[rawClose.length - 1] / rawClose[rawClose.length - 2]);
    expect(naive).toBeLessThan(-0.6);
  });
});

describe("volume detector (spec §4.3, §9)", () => {
  it("fires on a genuine volume spike", () => {
    const { bars, indexBars } = world({
      beta: 1,
      finalStockRet: 0.03,
      finalIndexRet: 0,
      finalVolume: 9_000_000,
    });
    const ctx = buildContext(bars, indexBars);
    const s = computeSignals(ctx);
    const event = detectVolume(ctx, s)!;
    expect(event.detector).toBe("volume_z");
    expect(event.z).toBeGreaterThan(3);
    expect(event.payload.timesMedian as number).toBeGreaterThan(5);
  });

  it("zero-volume session with constant history: MAD is 0, detector is guarded", () => {
    const { bars, indexBars } = world({
      beta: 1,
      finalStockRet: 0.03,
      finalIndexRet: 0,
      finalVolume: 0,
      constantVolume: true,
    });
    const ctx = buildContext(bars, indexBars);
    expect(ctx.stats.volMad30).toBe(0);
    const s = computeSignals(ctx);
    expect(s.zVol).toBeNull();
    expect(detectVolume(ctx, s)).toBeNull();
  });

  it("is suppressed when the stock is circuit-locked", () => {
    const { bars, indexBars } = world({
      beta: 1,
      finalStockRet: 0.05,
      finalIndexRet: 0,
      finalVolume: 9_000_000,
    });
    const ctx = buildContext(bars, indexBars, { circuitState: "upper" });
    const s = computeSignals(ctx);
    expect(detectVolume(ctx, s)).toBeNull();
  });
});

describe("market holidays (spec §9)", () => {
  it("a normal move across a 4-calendar-day gap is not inflated (horizon is sessions, not days)", () => {
    const { bars, indexBars } = world({ beta: 1, finalStockRet: 0.02, finalIndexRet: 0 });
    // rewrite the last date so there is a Thu→Wed gap (holiday + weekend)
    const gapped = bars.map((b, i) =>
      i === bars.length - 1 ? { ...b, sessionDate: "2024-05-15" } : b,
    );
    const idxGap = indexBars.map((b, i) =>
      i === indexBars.length - 1 ? { ...b, sessionDate: "2024-05-15" } : b,
    );
    const ctx = buildContext(gapped, idxGap, { horizonSessions: 1 });
    const s = computeSignals(ctx);
    const oneSession = s.zRet!;
    // same move, but if we wrongly treated it as 4 sessions the z would shrink by √4
    const ctx4 = buildContext(gapped, idxGap, { horizonSessions: 4 });
    const s4 = computeSignals(ctx4);
    expect(Math.abs(oneSession)).toBeGreaterThan(Math.abs(s4.zRet!));
  });
});

describe("structural detector (spec §4.4)", () => {
  it("flags a new 252-session high", () => {
    // strictly increasing series → the last close is an all-time high
    const rising = Array.from({ length: 120 }, (_, i) => 1000 * Math.exp(0.002 * i));
    const dates = weekdays(120);
    const bars = toBars(rising, { dates });
    const indexBars = toBars(
      pricesFromReturns(Array.from({ length: 119 }, (_, i) => indexRet(i)), 20000),
      { dates },
    );
    const ctx = buildContext(bars, indexBars);
    const s = computeSignals(ctx);
    const event = detectStructural(ctx, s)!;
    expect(event.detector).toBe("structural");
    expect(event.payload.flags as string[]).toContain("new_252d_high");
  });
});

describe("detectSymbol: one event per (symbol, session)", () => {
  it("composes a single event carrying every computed signal", () => {
    const { bars, indexBars } = world({ beta: 1.1, finalStockRet: 0.09, finalIndexRet: 0.005 });
    const ctx = buildContext(bars, indexBars);
    const event = detectSymbol(ctx)!;
    expect(event).not.toBeNull();
    expect(event.score).toBeGreaterThan(0);
    expect(event.score).toBeLessThanOrEqual(100);
    expect(event.dedupeKey).toBe(`TEST:${ctx.sessionDate}:${Math.floor(Math.abs(event.z))}`);
    // idio fired here, and it's "the one that matters" — it headlines
    expect(event.detector).toBe("idio_z");
    expect(event.signals.idioZ).not.toBeNull();
    expect(event.signals.returnZ).not.toBeNull();
    expect(event.signals.companyPct).not.toBeNull();

    // re-running is identical (idempotent key)
    const again = detectSymbol(ctx)!;
    expect(again.dedupeKey).toBe(event.dedupeKey);
  });

  it("scores discriminate across move sizes instead of pinning at 100", () => {
    const scores = [0.006, 0.015, 0.03, 0.06, 0.12].map((finalStockRet) => {
      const w = world({ beta: 1, finalStockRet, finalIndexRet: 0 });
      return detectSymbol(buildContext(w.bars, w.indexBars))?.score ?? null;
    });
    const fired = scores.filter((s): s is number => s != null);
    expect(fired.length).toBeGreaterThan(2);
    // not every fired event pinned at the ceiling
    expect(fired.some((s) => s < 99)).toBe(true);
    // monotonic in move size (never gets LESS material as the move grows)
    for (let i = 1; i < fired.length; i++) {
      expect(fired[i]).toBeGreaterThanOrEqual(fired[i - 1]);
    }
  });

  it("returns null when nothing crosses a threshold", () => {
    const { bars, indexBars } = world({ beta: 1, finalStockRet: 0.001, finalIndexRet: 0.001 });
    const ctx = buildContext(bars, indexBars);
    expect(detectSymbol(ctx)).toBeNull();
  });
});
