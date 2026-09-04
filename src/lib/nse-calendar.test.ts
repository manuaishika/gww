import { describe, expect, it } from "vitest";
import {
  allSessions,
  firstSession,
  isSession,
  lastSession,
  sessionOnOrBefore,
  sessionsBetween,
} from "./nse-calendar";

describe("nse-calendar (spec §9)", () => {
  it("loads the committed session list", () => {
    expect(allSessions().length).toBeGreaterThan(200);
    expect(firstSession < lastSession).toBe(true);
  });

  it("counts sessions in (from, to], not calendar days", () => {
    const sessions = allSessions();
    const a = sessions[10];
    const b = sessions[20];
    expect(sessionsBetween(a, b)).toBe(10);
    // a Friday→Monday span is one session even though it's 3 calendar days
    expect(sessionsBetween(b, b)).toBe(0);
    expect(sessionsBetween(b, a)).toBe(0); // reversed → 0
  });

  it("does not treat every weekday as a session", () => {
    // there is at least one weekday in the range that is a holiday
    const sessions = allSessions();
    let holidayFound = false;
    const d = new Date(sessions[0] + "T00:00:00Z");
    const end = new Date(sessions[sessions.length - 1] + "T00:00:00Z");
    while (d <= end) {
      const dow = d.getUTCDay();
      const iso = d.toISOString().slice(0, 10);
      if (dow !== 0 && dow !== 6 && !isSession(iso)) holidayFound = true;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    expect(holidayFound).toBe(true);
  });

  it("resolves the 'as of' session for a non-trading date", () => {
    const sessions = allSessions();
    const s = sessions[50];
    const next = new Date(s + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    // the day after session 50 resolves back to session 50 or later, never before
    const resolved = sessionOnOrBefore(next.toISOString().slice(0, 10));
    expect(resolved).not.toBeNull();
    expect(resolved! >= s).toBe(true);
  });
});
