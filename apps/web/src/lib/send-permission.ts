import "server-only";

import { InstantlyError, replyToEmail } from "@/lib/instantly-api";

/**
 * Whether the Instantly key may send, checked with a reply to an email that does
 * not exist (nothing can be sent). A clear answer is kept for 10 minutes; when
 * Instantly cannot be reached the last clear answer is used and checked again soon.
 */
type Check = { at: number; ttl: number; value: Promise<boolean> };
// Shared by the whole server process (pages, actions and the start-up warm-up).
const state = globalThis as typeof globalThis & {
  __scrapmailSend?: { check: Check | null; lastKnown: boolean | null };
};
const shared = (state.__scrapmailSend ??= { check: null, lastKnown: null });

export function canSendReplies() {
  if (shared.check && Date.now() - shared.check.at < shared.check.ttl)
    return shared.check.value;
  const check = {
    at: Date.now(),
    ttl: 10 * 60_000,
    value: Promise.resolve(true),
  };
  check.value = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const status = await probeSendPermission();
      // Refused for its scope: the key can only read.
      if (status === 401 || status === 403) return (shared.lastKnown = false);
      // Accepted for checking (the made-up email does not exist): it may send.
      if ([200, 400, 404, 422].includes(status))
        return (shared.lastKnown = true);
      // Busy (429) or unreachable: try once more shortly.
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
      else
        console.warn(`Instantly permission check: no clear answer (${status})`);
    }
    check.ttl = 30_000;
    return shared.lastKnown ?? true;
  })();
  shared.check = check;
  return check.value;
}

/** HTTP status of a reply to an email that does not exist (nothing is sent). */
async function probeSendPermission() {
  try {
    await replyToEmail({
      replyToId: "00000000-0000-0000-0000-000000000000",
      eaccount: "permission-check@invalid.invalid",
      subject: "permission check",
      html: "",
      text: "",
    });
    return 200;
  } catch (error) {
    return error instanceof InstantlyError ? error.status : 0;
  }
}

/** After a send worked, or failed for the key's scope. */
export function rememberSendPermission(allowed: boolean) {
  shared.lastKnown = allowed;
  shared.check = {
    at: Date.now(),
    ttl: 10 * 60_000,
    value: Promise.resolve(allowed),
  };
}
