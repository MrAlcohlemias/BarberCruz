import type { Profile } from "./types";

/** Published demos must never restore a previously open local admin session. */
export function getDemoSessionProfile(
  profiles: Profile[],
  id: string | null,
  development: boolean,
): Profile | null {
  const profile = profiles.find((person) => person.id === id);
  if (!profile || (profile.role === "admin" && !development)) return null;
  return profile;
}
