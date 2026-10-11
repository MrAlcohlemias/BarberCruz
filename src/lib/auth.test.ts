import { describe, expect, it } from "vitest";
import { getDemoSessionProfile } from "./auth";
import type { Profile } from "./types";

const admin: Profile = {
  id: "demo-admin",
  name: "Cruz",
  email: "cruz@demo.local",
  avatar: "",
  bio: "",
  preferredStyle: "",
  role: "admin",
};
const customer: Profile = { ...admin, id: "demo-customer", role: "customer" };
describe("published demo sessions", () => {
  it("rejects a remembered admin session in a production build", () => {
    expect(
      getDemoSessionProfile([admin, customer], admin.id, false),
    ).toBeNull();
  });
  it("keeps customer previews available without granting admin rights", () => {
    expect(
      getDemoSessionProfile([admin, customer], customer.id, false),
    ).toEqual(customer);
  });
  it("allows admin fixtures only in development", () => {
    expect(getDemoSessionProfile([admin, customer], admin.id, true)).toEqual(
      admin,
    );
  });
});
