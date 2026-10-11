import { describe, expect, it } from "vitest";
import {
  appointmentHasEnded,
  appointmentIsFuture,
  assertAppointmentUpdate,
} from "./AppContext";
import type { Appointment, Profile } from "./types";

const timezone = "Europe/Madrid";
const customer: Profile = {
  id: "customer",
  name: "Alex",
  email: "",
  avatar: "",
  bio: "",
  preferredStyle: "",
  role: "customer",
};
const admin: Profile = { ...customer, id: "admin", role: "admin" };
const booking: Appointment = {
  id: "booking",
  userId: customer.id,
  serviceId: "cut",
  date: "2026-10-12",
  time: "12:00",
  duration: 45,
  status: "confirmed",
  redemption: false,
  note: "",
  createdAt: "2026-10-11T08:00:00Z",
};

describe("appointment changes use the barber shop clock", () => {
  it("allows a customer to cancel only their own future confirmed booking", () => {
    const now = new Date("2026-10-12T09:00:00Z"); // 11:00 in Madrid.
    expect(() =>
      assertAppointmentUpdate(booking, "cancelled", customer, timezone, now),
    ).not.toThrow();
    expect(() =>
      assertAppointmentUpdate(
        { ...booking, userId: "someone-else" },
        "cancelled",
        customer,
        timezone,
        now,
      ),
    ).toThrow("tus propias citas");
    expect(() =>
      assertAppointmentUpdate(booking, "completed", customer, timezone, now),
    ).toThrow("tus propias citas");
  });

  it("rejects cancellation after the Madrid start time even while it is earlier in UTC", () => {
    const now = new Date("2026-10-12T10:01:00Z"); // 12:01 in Madrid.
    expect(appointmentIsFuture(booking, timezone, now)).toBe(false);
    expect(() =>
      assertAppointmentUpdate(booking, "cancelled", customer, timezone, now),
    ).toThrow("tus propias citas futuras");
  });

  it("rejects cancellation exactly at the start and waits until the end before completion", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(() =>
      assertAppointmentUpdate(booking, "cancelled", customer, timezone, now),
    ).toThrow();
    expect(() =>
      assertAppointmentUpdate(booking, "completed", admin, timezone, now),
    ).toThrow("antes de que termine");
    expect(() =>
      assertAppointmentUpdate(
        booking,
        "completed",
        admin,
        timezone,
        new Date("2026-10-12T10:45:00Z"),
      ),
    ).not.toThrow();
  });

  it("prevents an admin from completing a booking before its full saved duration has elapsed", () => {
    expect(() =>
      assertAppointmentUpdate(
        booking,
        "completed",
        admin,
        timezone,
        new Date("2026-10-12T09:59:59Z"),
      ),
    ).toThrow("antes de que termine");
    expect(() =>
      assertAppointmentUpdate(
        booking,
        "completed",
        admin,
        timezone,
        new Date("2026-10-12T10:44:59Z"),
      ),
    ).toThrow("antes de que termine");
    expect(() =>
      assertAppointmentUpdate(
        { ...booking, duration: 90 },
        "completed",
        admin,
        timezone,
        new Date("2026-10-12T10:45:00Z"),
      ),
    ).toThrow("antes de que termine");
    expect(() =>
      assertAppointmentUpdate(
        booking,
        "completed",
        admin,
        timezone,
        new Date("2026-10-12T10:45:00Z"),
      ),
    ).not.toThrow();
  });

  it("compares an end time on the following calendar day correctly", () => {
    const overnight = { ...booking, time: "23:45", duration: 45 };
    expect(
      appointmentHasEnded(
        overnight,
        timezone,
        new Date("2026-10-12T22:15:00Z"),
      ),
    ).toBe(false);
    expect(
      appointmentHasEnded(
        overnight,
        timezone,
        new Date("2026-10-12T22:30:00Z"),
      ),
    ).toBe(true);
  });

  it("uses the Madrid date around UTC midnight and the winter clock after daylight saving ends", () => {
    const midnight = { ...booking, date: "2026-10-12", time: "00:15" };
    expect(
      appointmentIsFuture(midnight, timezone, new Date("2026-10-11T22:30:00Z")),
    ).toBe(false);
    expect(
      appointmentIsFuture(midnight, timezone, new Date("2026-10-11T22:00:00Z")),
    ).toBe(true);
    const winter = { ...booking, date: "2026-10-26", time: "12:00" };
    expect(
      appointmentIsFuture(winter, timezone, new Date("2026-10-26T10:59:59Z")),
    ).toBe(true);
    expect(
      appointmentIsFuture(winter, timezone, new Date("2026-10-26T11:00:00Z")),
    ).toBe(false);
  });

  it("keeps history immutable while permitting an admin to cancel an unattended past booking", () => {
    const now = new Date("2026-10-13T10:00:00Z");
    expect(() =>
      assertAppointmentUpdate(booking, "cancelled", admin, timezone, now),
    ).not.toThrow();
    expect(() =>
      assertAppointmentUpdate(
        { ...booking, status: "completed" },
        "confirmed",
        admin,
        timezone,
        now,
      ),
    ).toThrow("citas pendientes");
    expect(() =>
      assertAppointmentUpdate(
        { ...booking, status: "cancelled" },
        "confirmed",
        admin,
        timezone,
        now,
      ),
    ).toThrow("citas pendientes");
  });
});
