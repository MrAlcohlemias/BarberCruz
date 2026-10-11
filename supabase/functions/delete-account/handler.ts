// Shared handler: all authorization is checked against Supabase Auth and live
// database profiles. The browser never receives the server's service-role key.
export type DeletionResult<T> = { data: T | null; error?: unknown };
export type DeletionProfile = { id: string; role: "customer" | "admin" };
export type AvatarEntry = { name: string; id?: string | null };

export interface AccountDeletionServices {
  getUser(token: string): Promise<DeletionResult<{ id: string }>>;
  getProfile(userId: string): Promise<DeletionResult<DeletionProfile>>;
  prepare(actorId: string, targetId: string): Promise<DeletionResult<unknown>>;
  release(targetId: string): Promise<DeletionResult<unknown>>;
  listAvatars(
    prefix: string,
    limit: number,
    offset: number,
  ): Promise<DeletionResult<AvatarEntry[]>>;
  removeAvatars(paths: string[]): Promise<DeletionResult<unknown>>;
  deleteUser(userId: string): Promise<DeletionResult<unknown>>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function avatarPaths(
  services: AccountDeletionServices,
  userId: string,
): Promise<string[]> {
  const paths: string[] = [];
  const folders: string[] = [userId];
  const pageSize = 100;
  for (let folderIndex = 0; folderIndex < folders.length; folderIndex++) {
    const prefix = folders[folderIndex];
    for (let offset = 0; ; offset += pageSize) {
      const result = await services.listAvatars(prefix, pageSize, offset);
      if (result.error || !result.data) throw new Error("avatar-list-failed");
      for (const entry of result.data) {
        // Storage returns folders with a null ID and objects with an ID. Never
        // allow a malformed response to escape this user's folder.
        if (
          !entry.name ||
          entry.name.includes("/") ||
          entry.name === "." ||
          entry.name === ".."
        )
          throw new Error("invalid-avatar-path");
        const path = `${prefix}/${entry.name}`;
        if (entry.id == null) folders.push(path);
        else paths.push(path);
      }
      if (
        paths.length > 10000 ||
        folders.length > 100 ||
        prefix.split("/").length > 5
      )
        throw new Error("avatar-limit-exceeded");
      if (result.data.length < pageSize) break;
    }
  }
  return paths;
}

export function createDeleteAccountHandler(services: AccountDeletionServices) {
  return async function deleteAccount(request: Request): Promise<Response> {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "POST")
      return json(405, { error: "Usa POST para eliminar una cuenta." });
    const authorization = request.headers.get("Authorization") ?? "";
    const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
    if (!token)
      return json(401, {
        error: "Inicia sesión de nuevo antes de eliminar la cuenta.",
      });

    let pendingUserId: string | undefined;
    try {
      // getUser calls the Auth server; decoding a JWT locally is insufficient.
      const authenticated = await services.getUser(token);
      if (
        authenticated.error ||
        !authenticated.data ||
        !uuid.test(authenticated.data.id)
      )
        return json(401, {
          error: "Tu sesión no es válida. Vuelve a iniciar sesión.",
        });
      const actorId = authenticated.data.id.toLowerCase();

      let body: Record<string, unknown>;
      try {
        const text = await request.text();
        if (text.length > 2048)
          return json(400, { error: "La solicitud no es válida." });
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          return json(400, { error: "La solicitud no es válida." });
        body = parsed as Record<string, unknown>;
      } catch {
        return json(400, { error: "La solicitud no es válida." });
      }
      if (
        body.confirmation !== "ELIMINAR" ||
        Object.keys(body).some(
          (key) => !["confirmation", "userId"].includes(key),
        )
      )
        return json(400, {
          error: "Escribe ELIMINAR para confirmar la eliminación.",
        });
      if (
        body.userId !== undefined &&
        (typeof body.userId !== "string" || !uuid.test(body.userId))
      )
        return json(400, { error: "La cuenta indicada no es válida." });
      const targetId =
        typeof body.userId === "string" ? body.userId.toLowerCase() : actorId;

      const actor = await services.getProfile(actorId);
      if (actor.error)
        return json(503, {
          error: "No se ha podido comprobar tu cuenta. Inténtalo de nuevo.",
        });
      if (!actor.data || !["admin", "customer"].includes(actor.data.role))
        return json(403, {
          error: "No tienes permiso para eliminar esta cuenta.",
        });
      if (actor.data.role !== "admin" && targetId !== actorId)
        return json(403, { error: "Solo puedes eliminar tu propia cuenta." });

      const target =
        targetId === actorId ? actor : await services.getProfile(targetId);
      if (target.error)
        return json(503, {
          error: "No se ha podido comprobar la cuenta. Inténtalo de nuevo.",
        });
      if (!target.data)
        return json(404, { error: "Esta cuenta ya no está disponible." });
      if (target.data.role !== "customer")
        return json(403, {
          error:
            "Las cuentas de administrador no se pueden eliminar desde la web.",
        });

      // The service-only SQL RPC locks both rows and rechecks their roles. While
      // pending, uploads, bookings and profile edits are blocked in the database.
      const prepared = await services.prepare(actorId, targetId);
      if (prepared.error)
        return json(409, {
          error:
            "La eliminación ya está en curso o no se ha podido preparar. Espera y actualiza la página; si continúa, contacta con el administrador.",
        });
      pendingUserId = targetId;

      const paths = await avatarPaths(services, targetId);
      for (let offset = 0; offset < paths.length; offset += 100) {
        const removed = await services.removeAvatars(
          paths.slice(offset, offset + 100),
        );
        if (removed.error) throw new Error("avatar-remove-failed");
      }
      // Removing only profiles would leave an Auth account that could sign in
      // again. Hard-delete the actual identity after Storage cleanup succeeds;
      // the SQL foreign keys cascade profiles and all of this user's bookings.
      const deleted = await services.deleteUser(targetId);
      if (deleted.error) throw new Error("auth-delete-failed");
      pendingUserId = undefined;
      return json(200, { deleted: true, userId: targetId });
    } catch {
      // A cleanup/Auth error must never be reported as success. Release the guard
      // so the customer can use their account and retry. Already removed photos
      // cannot be restored, but the Auth identity and appointments are retained.
      if (pendingUserId) {
        try {
          await services.release(pendingUserId);
        } catch {
          /* A project owner can recover an interrupted operation in SQL. */
        }
      }
      return json(503, {
        error:
          "No se ha podido confirmar la eliminación. Actualiza la página e inténtalo de nuevo si la cuenta sigue disponible; alguna foto retirada podría necesitar subirse otra vez.",
      });
    }
  };
}
