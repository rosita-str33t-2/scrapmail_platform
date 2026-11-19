"use client";

/**
 * "Undo send": a reply waits this long before it really goes out, like Gmail.
 * The waiting sends live outside the page, so moving to another page does not
 * cancel or lose them; closing the tab while one is waiting asks for confirmation.
 */
export const UNDO_SECONDS = 10;

type Waiting = { timer: ReturnType<typeof setTimeout>; run: () => void };
const waiting = new Map<number, Waiting>();
let nextId = 1;

function warnBeforeClose(event: BeforeUnloadEvent) {
  if (waiting.size === 0) return;
  event.preventDefault();
  event.returnValue = ""; // the browser shows its own "Leave site?" question
}

function watchClose() {
  if (waiting.size === 1)
    window.addEventListener("beforeunload", warnBeforeClose);
  if (waiting.size === 0)
    window.removeEventListener("beforeunload", warnBeforeClose);
}

export type ScheduledSend = {
  /** Stops the send; false when it already went out. */
  cancel: () => boolean;
  /** Sends at once instead of waiting. */
  now: () => void;
};

/** Runs `send` after UNDO_SECONDS unless cancelled first. */
export function scheduleSend(send: () => void): ScheduledSend {
  const id = nextId++;
  const run = () => {
    const entry = waiting.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    waiting.delete(id);
    watchClose();
    send();
  };
  waiting.set(id, { timer: setTimeout(run, UNDO_SECONDS * 1000), run });
  watchClose();
  return {
    cancel() {
      const entry = waiting.get(id);
      if (!entry) return false;
      clearTimeout(entry.timer);
      waiting.delete(id);
      watchClose();
      return true;
    },
    now: run,
  };
}
