import "server-only";

/**
 * Remembers each signed-in user's profile and workspace for a few seconds, so
 * moving between pages does not wait for the same two lookups every time.
 * Safe because the data itself stays protected by row level security in the
 * database, which always checks the account's current status. Changes made by an
 * administrator here (status, new member) clear the entry at once.
 */
const TTL_MS = 15_000;
type Entry = { at: number; value: unknown };
// One cache for the whole server process (pages and actions are bundled apart).
const shared = globalThis as typeof globalThis & {
  __scrapmailAccounts?: Map<string, Entry>;
};
const entries = (shared.__scrapmailAccounts ??= new Map<string, Entry>());

export async function remembered<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  if (value !== null && value !== undefined) {
    if (entries.size > 5000) entries.clear();
    entries.set(key, { at: Date.now(), value });
  }
  return value;
}

/** Forget a user's cached account data (after their status or access changed). */
export function forgetAccount(userId: string) {
  for (const key of entries.keys()) {
    if (key.endsWith(`:${userId}`)) entries.delete(key);
  }
}
