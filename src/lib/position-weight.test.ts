import { describe, expect, it } from "vitest";
import { effectiveScore, positionBonus } from "./position-weight";

describe("positionBonus", () => {
  it("is zero with no position", () => {
    expect(positionBonus(null)).toBe(0);
    expect(positionBonus(undefined)).toBe(0);
    expect(positionBonus(0)).toBe(0);
    expect(positionBonus(-5)).toBe(0);
  });

  it("grows with position size but saturates", () => {
    const small = positionBonus(10);
    const medium = positionBonus(100);
    const large = positionBonus(10_000);
    expect(small).toBeGreaterThan(0);
    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
    expect(large).toBeLessThan(8); // bounded, never reaches the cap
  });

  it("never lets a huge position outrank a real signal in something small", () => {
    // a trivial move (score just above the emit floor) in a massive holding...
    const hugePositionTrivialMove = effectiveScore(21, 1_000_000);
    // ...must not beat a strong, genuine signal in a barely-held stock
    const tinyPositionStrongMove = effectiveScore(95, 1);
    expect(hugePositionTrivialMove).toBeLessThan(tinyPositionStrongMove);
  });

  it("can break a near-tie in favour of the larger position", () => {
    const a = effectiveScore(80, 500);
    const b = effectiveScore(80, 0);
    expect(a).toBeGreaterThan(b);
  });
});
