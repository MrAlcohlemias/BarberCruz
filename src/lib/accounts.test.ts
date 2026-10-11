import { describe, expect, it } from "vitest";
import { editableCustomer, removeCustomer } from "./accounts";
import { createDemoData } from "./domain";
import type { Profile } from "./types";

const customer: Profile = {
  id: "customer",
  email: "first@example.test",
  name: "Alex",
  avatar: "😎",
  bio: "",
  preferredStyle: "",
  role: "customer",
};
const admin: Profile = { ...customer, id: "admin", role: "admin" };

describe("customer management boundaries", () => {
  it("changes profile fields while preserving the authoritative identity and privileges", () => {
    const changed = editableCustomer(customer, {
      ...customer,
      id: "other",
      email: "other@example.test",
      role: "admin",
      name: "  Dani  ",
      bio: "Bajo",
      preferredStyle: "Taper fade",
      avatar: "⚡",
    });
    expect(changed).toMatchObject({
      id: customer.id,
      email: customer.email,
      role: "customer",
      name: "Dani",
      bio: "Bajo",
      avatar: "⚡",
    });
    expect(() => editableCustomer(admin, customer)).toThrow("clientes");
    expect(() =>
      editableCustomer(customer, { ...customer, name: " " }),
    ).toThrow("nombre");
  });
  it("deletes all customer reservations and loyalty history without changing another account", () => {
    const data = createDemoData();
    data.profiles = [customer, admin];
    data.appointments = [customer, admin].map((person) => ({
      id: `booking-${person.id}`,
      userId: person.id,
      serviceId: "cut",
      date: "2026-10-12",
      time: "12:00",
      status: "completed",
      redemption: false,
      note: "",
      createdAt: "",
    }));
    const result = removeCustomer(data, customer.id);
    expect(result.profiles).toEqual([admin]);
    expect(
      result.appointments.map((appointment) => appointment.userId),
    ).toEqual([admin.id]);
    expect(data.profiles).toHaveLength(2);
    expect(() => removeCustomer(data, admin.id)).toThrow("protegidas");
  });
});
