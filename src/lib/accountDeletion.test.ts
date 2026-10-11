import { describe, expect, it, vi } from "vitest";
import {
  createDeleteAccountHandler,
  type AccountDeletionServices,
  type AvatarEntry,
  type DeletionProfile,
} from "../../supabase/functions/delete-account/handler";

const customerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";
const anotherAdminId = "44444444-4444-4444-8444-444444444444";

function fixture(actorId = customerId) {
  const events: string[] = [];
  const profiles = new Map<string, DeletionProfile>([
    [customerId, { id: customerId, role: "customer" }],
    [otherId, { id: otherId, role: "customer" }],
    [adminId, { id: adminId, role: "admin" }],
    [anotherAdminId, { id: anotherAdminId, role: "admin" }],
  ]);
  const services: AccountDeletionServices = {
    getUser: vi.fn(async () => ({ data: { id: actorId } })),
    getProfile: vi.fn(async (id) => ({ data: profiles.get(id) ?? null })),
    prepare: vi.fn(async () => {
      events.push("prepare");
      return { data: null };
    }),
    release: vi.fn(async () => {
      events.push("release");
      return { data: null };
    }),
    listAvatars: vi.fn(async () => {
      events.push("list");
      return { data: [] };
    }),
    removeAvatars: vi.fn(async () => {
      events.push("remove");
      return { data: [] };
    }),
    deleteUser: vi.fn(async () => {
      events.push("delete-auth");
      return { data: {} };
    }),
  };
  const handler = createDeleteAccountHandler(services);
  return { services, handler, events, profiles };
}

function request(
  body: unknown = { confirmation: "ELIMINAR" },
  token = "test-session",
) {
  return new Request("https://example.test/functions/v1/delete-account", {
    method: "POST",
    headers: token
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : {},
    body: JSON.stringify(body),
  });
}

describe("real account deletion authorization and cleanup", () => {
  it("requires a Bearer session verified by the Auth server", async () => {
    const { handler, services } = fixture();
    expect((await handler(request(undefined, ""))).status).toBe(401);
    expect(services.getUser).not.toHaveBeenCalled();
    vi.mocked(services.getUser).mockResolvedValue({
      data: null,
      error: new Error("invalid session"),
    });
    expect((await handler(request())).status).toBe(401);
    expect(services.getUser).toHaveBeenCalledWith("test-session");
    expect(services.prepare).not.toHaveBeenCalled();
    expect(services.deleteUser).not.toHaveBeenCalled();
  });

  it("lets a customer delete only themselves, regardless of forged metadata", async () => {
    const { handler, services } = fixture();
    vi.mocked(services.getUser).mockResolvedValue({
      data: { id: customerId, user_metadata: { role: "admin" } } as {
        id: string;
      },
    });
    expect(
      (await handler(request({ userId: otherId, confirmation: "ELIMINAR" })))
        .status,
    ).toBe(403);
    expect(services.getProfile).toHaveBeenCalledTimes(1);
    expect(services.prepare).not.toHaveBeenCalled();
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      deleted: true,
      userId: customerId,
    });
    expect(services.prepare).toHaveBeenCalledWith(customerId, customerId);
    expect(services.deleteUser).toHaveBeenCalledWith(customerId);
  });

  it("allows the live administrator to delete a customer", async () => {
    const { handler, services } = fixture(adminId);
    expect(
      (await handler(request({ userId: otherId, confirmation: "ELIMINAR" })))
        .status,
    ).toBe(200);
    expect(services.prepare).toHaveBeenCalledWith(adminId, otherId);
    expect(services.deleteUser).toHaveBeenCalledWith(otherId);
  });

  it("refuses to delete any administrator, including the actor's own account", async () => {
    const { handler, services } = fixture(adminId);
    expect((await handler(request())).status).toBe(403);
    expect(
      (
        await handler(
          request({ userId: anotherAdminId, confirmation: "ELIMINAR" }),
        )
      ).status,
    ).toBe(403);
    expect(services.prepare).not.toHaveBeenCalled();
    expect(services.deleteUser).not.toHaveBeenCalled();
  });

  it("requires a valid customer profile and explicit confirmation", async () => {
    const { handler, services, profiles } = fixture();
    expect((await handler(request({ confirmation: "yes" }))).status).toBe(400);
    expect(
      (await handler(request({ confirmation: "ELIMINAR", userId: "../other" })))
        .status,
    ).toBe(400);
    expect(
      (await handler(request({ confirmation: "ELIMINAR", role: "admin" })))
        .status,
    ).toBe(400);
    profiles.delete(customerId);
    expect((await handler(request())).status).toBe(403);
    expect(services.deleteUser).not.toHaveBeenCalled();
  });

  it("stops before Storage when the atomic live-role preparation fails", async () => {
    const { handler, services } = fixture(adminId);
    vi.mocked(services.prepare).mockResolvedValue({
      data: null,
      error: new Error("role changed"),
    });
    expect(
      (await handler(request({ userId: customerId, confirmation: "ELIMINAR" })))
        .status,
    ).toBe(409);
    expect(services.listAvatars).not.toHaveBeenCalled();
    expect(services.deleteUser).not.toHaveBeenCalled();
  });

  it("lists every Storage page before removing every photo, then hard-deletes Auth", async () => {
    const { handler, services, events } = fixture();
    const files: AvatarEntry[] = Array.from({ length: 205 }, (_, index) => ({
      id: `file-${index}`,
      name: `${index}.jpg`,
    }));
    vi.mocked(services.listAvatars).mockImplementation(
      async (prefix, limit, offset) => {
        events.push("list");
        expect(prefix).toBe(customerId);
        return { data: files.slice(offset, offset + limit) };
      },
    );
    expect((await handler(request())).status).toBe(200);
    expect(services.listAvatars).toHaveBeenNthCalledWith(1, customerId, 100, 0);
    expect(services.listAvatars).toHaveBeenNthCalledWith(
      2,
      customerId,
      100,
      100,
    );
    expect(services.listAvatars).toHaveBeenNthCalledWith(
      3,
      customerId,
      100,
      200,
    );
    expect(services.removeAvatars).toHaveBeenCalledTimes(3);
    const removed = vi
      .mocked(services.removeAvatars)
      .mock.calls.flatMap(([paths]) => paths);
    expect(removed).toEqual(files.map((file) => `${customerId}/${file.name}`));
    expect(events).toEqual([
      "prepare",
      "list",
      "list",
      "list",
      "remove",
      "remove",
      "remove",
      "delete-auth",
    ]);
    expect(services.release).not.toHaveBeenCalled();
  });

  it("also cleans nested avatar folders without escaping the target user's folder", async () => {
    const { handler, services } = fixture();
    vi.mocked(services.listAvatars).mockImplementation(async (prefix) => ({
      data:
        prefix === customerId
          ? [{ id: null, name: "legacy" }]
          : [{ id: "photo", name: "old.jpg" }],
    }));
    expect((await handler(request())).status).toBe(200);
    expect(services.removeAvatars).toHaveBeenCalledWith([
      `${customerId}/legacy/old.jpg`,
    ]);
  });

  it("keeps the Auth account when listing fails on a later page", async () => {
    const { handler, services } = fixture();
    vi.mocked(services.listAvatars)
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, index) => ({
          id: `file-${index}`,
          name: `${index}.jpg`,
        })),
      })
      .mockResolvedValueOnce({
        data: null,
        error: new Error("Storage unavailable"),
      });
    expect((await handler(request())).status).toBe(503);
    expect(services.removeAvatars).not.toHaveBeenCalled();
    expect(services.deleteUser).not.toHaveBeenCalled();
    expect(services.release).toHaveBeenCalledWith(customerId);
  });

  it("keeps the Auth account when photo removal fails", async () => {
    const { handler, services } = fixture();
    vi.mocked(services.listAvatars).mockResolvedValue({
      data: [{ id: "photo", name: "photo.jpg" }],
    });
    vi.mocked(services.removeAvatars).mockResolvedValue({
      data: null,
      error: new Error("cannot remove"),
    });
    expect((await handler(request())).status).toBe(503);
    expect(services.deleteUser).not.toHaveBeenCalled();
    expect(services.release).toHaveBeenCalledWith(customerId);
  });

  it("never reports success when hard deletion fails, and releases the pending guard", async () => {
    const { handler, services } = fixture();
    vi.mocked(services.deleteUser).mockResolvedValue({
      data: null,
      error: new Error("Auth unavailable"),
    });
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("deleted", true);
    expect(services.release).toHaveBeenCalledWith(customerId);
  });

  it("refuses malformed Storage paths before deleting the identity", async () => {
    const { handler, services } = fixture();
    vi.mocked(services.listAvatars).mockResolvedValue({
      data: [{ id: "photo", name: "../someone-else.jpg" }],
    });
    expect((await handler(request())).status).toBe(503);
    expect(services.removeAvatars).not.toHaveBeenCalled();
    expect(services.deleteUser).not.toHaveBeenCalled();
  });

  it("allows CORS preflight and rejects other methods without making Auth calls", async () => {
    const { handler, services } = fixture();
    const response = await handler(
      new Request("https://example.test", { method: "OPTIONS" }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "authorization",
    );
    expect((await handler(new Request("https://example.test"))).status).toBe(
      405,
    );
    expect(services.getUser).not.toHaveBeenCalled();
  });

  it("rejects a concurrent duplicate without releasing the first request's guard", async () => {
    const { handler, services } = fixture();
    let pending = false;
    let resume!: () => void;
    let started!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const cleanupMayContinue = new Promise<void>((resolve) => {
      resume = resolve;
    });
    vi.mocked(services.prepare).mockImplementation(async () => {
      if (pending) return { data: null, error: new Error("already pending") };
      pending = true;
      return { data: null };
    });
    vi.mocked(services.listAvatars).mockImplementation(async () => {
      started();
      await cleanupMayContinue;
      return { data: [] };
    });
    const first = handler(request());
    await cleanupStarted;
    expect((await handler(request())).status).toBe(409);
    expect(services.release).not.toHaveBeenCalled();
    expect(services.deleteUser).not.toHaveBeenCalled();
    resume();
    expect((await first).status).toBe(200);
    expect(services.deleteUser).toHaveBeenCalledTimes(1);
    expect(services.release).not.toHaveBeenCalled();
  });
});
