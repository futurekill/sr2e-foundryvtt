import { describe, it, expect } from "vitest";
import { daysPresent, chargeDaysPlan, spiritServiceStatus } from "../module/rules/sr2e-rules.mjs";

const H = 3600, D = 24 * H;
describe("elemental 24-hour rule (SR2E p.141)", () => {
  it("whole days only; absent or rewound is 0", () => {
    expect(daysPresent(0, 24 * H)).toBe(1);
    expect(daysPresent(0, 47 * H)).toBe(1);
    expect(daysPresent(0, 49 * H)).toBe(2);
    expect(daysPresent(undefined, 49 * H)).toBe(0);
    expect(daysPresent(10 * D, 9 * D)).toBe(0);
  });
  it("charging saturates at 0 services and moves the clock past every elapsed day", () => {
    expect(chargeDaysPlan({ services: 3, presentSince: 0, now: 49 * H })).toEqual({ days: 2, charged: 2, services: 1, presentSince: 2 * D });
    expect(chargeDaysPlan({ services: 1, presentSince: 0, now: 73 * H })).toEqual({ days: 3, charged: 1, services: 0, presentSince: 3 * D });
    expect(chargeDaysPlan({ services: 2, presentSince: 0, now: 5 * H })).toEqual({ days: 0, charged: 0, services: 2, presentSince: 0 });
  });
});

describe("spirit service status precedence", () => {
  it("departed > uncontrolled > engaged > bondEnded > bound", () => {
    expect(spiritServiceStatus({ departed: true, conjurerUuid: "", services: 3 })).toBe("departed");
    expect(spiritServiceStatus({ conjurerUuid: "", services: 0, fighting: true })).toBe("uncontrolled");
    expect(spiritServiceStatus({ conjurerUuid: "A", services: 0, fighting: true })).toBe("engaged");
    expect(spiritServiceStatus({ conjurerUuid: "A", services: 0, service: "sustain" })).toBe("engaged");
    expect(spiritServiceStatus({ conjurerUuid: "A", services: 0 })).toBe("bondEnded");
    expect(spiritServiceStatus({ conjurerUuid: "A", services: 2 })).toBe("bound");
  });
});
