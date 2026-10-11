import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createDeleteAccountHandler } from "./handler.ts";

// Supabase supplies these secrets to hosted Edge Functions automatically. Never
// copy the service-role value to Vercel, frontend variables, GitHub or the chat.
const projectUrl = Deno.env.get("SUPABASE_URL");
const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!projectUrl || !serverKey)
  throw new Error("Missing server-side Supabase configuration");
const supabase = createClient(projectUrl, serverKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(
  createDeleteAccountHandler({
    async getUser(token) {
      const { data, error } = await supabase.auth.getUser(token);
      return { data: data.user, error };
    },
    async getProfile(userId) {
      return await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .maybeSingle();
    },
    async prepare(actorId, targetId) {
      return await supabase.rpc("prepare_account_deletion", {
        p_actor_id: actorId,
        p_target_id: targetId,
      });
    },
    async release(targetId) {
      return await supabase.rpc("release_account_deletion", {
        p_target_id: targetId,
      });
    },
    async listAvatars(prefix, limit, offset) {
      return await supabase.storage.from("avatars").list(prefix, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
    },
    async removeAvatars(paths) {
      return await supabase.storage.from("avatars").remove(paths);
    },
    async deleteUser(userId) {
      const { data, error } = await supabase.auth.admin.deleteUser(
        userId,
        false,
      );
      return { data: data.user, error };
    },
  }),
);
