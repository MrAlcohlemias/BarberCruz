import { describe, expect, it } from "vitest";
import {
  addDays,
  createDemoData,
  dateKey,
  defaultServices,
  formatDate,
  getSlots,
  loyalty,
  nextAppointment,
} from "./domain";
import type { Appointment } from "./types";

const now = new Date("2026-10-11T10:00:00Z");
const monday = "2026-10-12";
const cut = defaultServices.find((service) => service.id === "cut")!;

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "booking",
    userId: "customer",
    serviceId: "cut",
    date: monday,
    time: "16:00",
    status: "confirmed",
    redemption: false,
    note: "",
    createdAt: now.toISOString(),
    ...overrides,
  };
}

function paidCuts(count: number): Appointment[] {
  return Array.from({ length: count }, (_, index) =>
    appointment({ id: `cut-${index}`, status: "completed" }),
  );
}

describe("booking availability", () => {
  it("fits the entire service inside opening hours", () => {
    const data = createDemoData();
    expect(getSlots(monday, cut, data, { now })).toHaveLength(38);
    expect(getSlots(monday, cut, data, { now }).at(-1)).toBe("19:15");
    expect(
      getSlots(monday, { ...cut, duration: 60 }, data, { now }).at(-1),
    ).toBe("19:00");
    expect(getSlots("2026-10-11", cut, data, { now })).toEqual([]);
  });

  it("rejects overlaps even when the existing appointment starts off the slot grid", () => {
    const data = createDemoData();
    data.appointments = [appointment({ time: "16:10" })];
    const slots = getSlots(monday, cut, data, { now });
    expect(slots).not.toContain("16:00");
    expect(slots).not.toContain("16:30");
    expect(slots).toContain("17:00");
  });

  it("preserves the duration booked even when a service is later edited", () => {
    const data = createDemoData();
    data.appointments = [appointment({ duration: 90 })];
    const slots = getSlots(monday, cut, data, { now });
    expect(slots).not.toContain("17:00");
    expect(slots).toContain("17:30");
  });

  it("keeps completed appointments occupied, releases cancelled ones, and supports moving a booking", () => {
    const data = createDemoData();
    data.appointments = [appointment({ status: "completed" })];
    expect(getSlots(monday, cut, data, { now })).not.toContain("16:00");
    expect(
      getSlots(monday, cut, data, { now, excludeId: "booking" }),
    ).toContain("16:00");
    data.appointments[0].status = "cancelled";
    expect(getSlots(monday, cut, data, { now })).toContain("16:00");
  });

  it("checks blocks and anonymous remote intervals with exact non-overlapping boundaries", () => {
    const data = createDemoData();
    data.blocks = [
      {
        id: "break",
        date: monday,
        start: "17:15",
        end: "18:00",
        note: "Descanso",
      },
    ];
    const slots = getSlots(monday, cut, data, {
      now,
      bookedIntervals: [{ time: "18:15", duration: 45 }],
    });
    expect(slots).toContain("16:30");
    expect(slots).not.toContain("17:00");
    expect(slots).not.toContain("17:30");
    expect(slots).not.toContain("18:00");
    expect(slots).not.toContain("18:30");
    expect(slots).toContain("19:00");
  });

  it("uses Madrid calendar dates and time after UTC midnight and rejects past minutes", () => {
    const data = createDemoData();
    data.settings.openingHours[1] = {
      open: true,
      start: "00:00",
      end: "02:00",
    };
    const nearMidnight = new Date("2026-10-11T22:30:01Z");
    expect(dateKey(nearMidnight)).toBe(monday);
    expect(getSlots(monday, cut, data, { now: nearMidnight })).toEqual([
      "00:45",
      "01:00",
      "01:15",
    ]);
  });

  it("includes the final advance day and rejects past or more distant dates", () => {
    const data = createDemoData();
    data.settings.advanceDays = 1;
    expect(getSlots(monday, cut, data, { now })).not.toEqual([]);
    expect(getSlots("2026-10-13", cut, data, { now })).toEqual([]);
    expect(getSlots("2026-10-10", cut, data, { now })).toEqual([]);
    expect(getSlots("2026-02-30", cut, data, { now })).toEqual([]);
  });

  it("counts calendar days across daylight-saving changes instead of elapsed 24-hour periods", () => {
    const data = createDemoData();
    data.settings.advanceDays = 1;
    const beforeClockChange = new Date("2026-10-24T22:30:00Z");
    expect(dateKey(beforeClockChange)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(
      getSlots("2026-10-26", cut, data, { now: beforeClockChange }),
    ).not.toEqual([]);
    expect(
      getSlots("2026-10-27", cut, data, { now: beforeClockChange }),
    ).toEqual([]);
  });
});

describe("loyalty rewards", () => {
  it("earns a free cut after seven completed paid cuts and includes combos but not beards", () => {
    const bookings = [
      ...paidCuts(6),
      appointment({ id: "combo", serviceId: "combo", status: "completed" }),
      appointment({ id: "beard", serviceId: "beard", status: "completed" }),
      appointment({ id: "future" }),
    ];
    expect(loyalty("customer", bookings)).toEqual({
      paidCuts: 7,
      rewardsUsed: 0,
      stamps: 7,
      rewardsAvailable: 1,
    });
  });

  it("reserves rewards for confirmed free bookings and restores them after cancellation", () => {
    const bookings = [
      ...paidCuts(7),
      appointment({ id: "free", redemption: true }),
    ];
    expect(loyalty("customer", bookings)).toEqual({
      paidCuts: 7,
      rewardsUsed: 0,
      stamps: 0,
      rewardsAvailable: 0,
    });
    bookings.at(-1)!.status = "cancelled";
    expect(loyalty("customer", bookings)).toEqual({
      paidCuts: 7,
      rewardsUsed: 0,
      stamps: 7,
      rewardsAvailable: 1,
    });
  });

  it("never earns stamps from a free cut and reports progress toward the next one", () => {
    const bookings = [
      ...paidCuts(9),
      appointment({ id: "free", redemption: true, status: "completed" }),
    ];
    expect(loyalty("customer", bookings)).toEqual({
      paidCuts: 9,
      rewardsUsed: 1,
      stamps: 2,
      rewardsAvailable: 0,
    });
    expect(loyalty("another-customer", bookings)).toEqual({
      paidCuts: 0,
      rewardsUsed: 0,
      stamps: 0,
      rewardsAvailable: 0,
    });
  });

  it("can retain another reward while one is reserved and supports an edited threshold", () => {
    const bookings = [
      ...paidCuts(14),
      appointment({ id: "free", redemption: true }),
    ];
    expect(loyalty("customer", bookings).rewardsAvailable).toBe(1);
    expect(loyalty("customer", bookings).stamps).toBe(7);
    expect(loyalty("customer", paidCuts(5), 5)).toEqual({
      paidCuts: 5,
      rewardsUsed: 0,
      stamps: 5,
      rewardsAvailable: 1,
    });
  });
});

describe("customer agenda and initial data", () => {
  it("allows date strips to render only a weekday or month while keeping a full date by default", () => {
    expect(formatDate(monday, { weekday: "short" })).toBe("lun");
    expect(formatDate(monday, { month: "long" })).toBe("octubre");
    expect(formatDate(monday, { day: "numeric" })).toBe("12");
    expect(formatDate(monday)).toBe("lunes, 12 de octubre");
  });

  it("returns the earliest confirmed future appointment for this customer", () => {
    const bookings = [
      appointment({ id: "later", date: "2026-10-13" }),
      appointment({ id: "cancelled", status: "cancelled" }),
      appointment({ id: "someone-else", userId: "other", time: "16:00" }),
      appointment({ id: "first", time: "17:00" }),
      appointment({ id: "past", date: "2026-10-10" }),
    ];
    expect(nextAppointment("customer", bookings, now)?.id).toBe("first");
    expect(
      nextAppointment("customer", bookings, new Date("2026-10-14T10:00:00Z")),
    ).toBeUndefined();
  });

  it("creates independent editable defaults without inventing customers or appointments", () => {
    const first = createDemoData();
    const second = createDemoData();
    first.services[0].price = 99;
    first.settings.openingHours[1].open = false;
    expect(second.services[0].price).toBe(7);
    expect(second.settings.openingHours[1].open).toBe(true);
    expect(first.profiles).toEqual([]);
    expect(first.appointments).toEqual([]);
  });
});
