"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * What a page can follow. The database sends a tiny "changed" message (no row data)
 * over Supabase Realtime (a WebSocket) when that data changes; see the migration
 * 20261119130000_live_updates.sql.
 */
export type LiveKind =
  | "jobs"
  | "agencies"
  | "contacts"
  | "levels"
  | "replies"
  | "bounces"
  | "campaigns"
  | "templates"
  | "users"
  | "workers";

/** Realtime channel name of a kind. */
function topicOf(kind: LiveKind, workspaceId: string | null) {
  if (kind === "users") return "live:admin:users";
  if (kind === "workers") return "live:global:workers";
  return workspaceId ? `live:${workspaceId}:${kind}` : null;
}

/** Leave the channels after the tab was hidden this long (and catch up when shown). */
const HIDDEN_GRACE_MS = 30_000;

type Listener = () => void;
type Entry = {
  channel: RealtimeChannel | null;
  listeners: Set<Listener>;
  subscribed: boolean;
  /** Was subscribed before: a new subscription may have missed changes. */
  joinedBefore: boolean;
};

/**
 * One shared connection per browser tab. Each channel is joined while at least one
 * component on the page follows it.
 */
class LiveHub {
  private entries = new Map<string, Entry>();
  private statusListeners = new Set<Listener>();
  private paused = false;
  private ready: Promise<void> | null = null;

  /** Signed-in user's token for the private channels. */
  private auth() {
    this.ready ??= createClient()
      .realtime.setAuth()
      .catch(() => {});
    return this.ready;
  }

  private notify(entry: Entry) {
    for (const listener of entry.listeners) listener();
  }

  private emitStatus() {
    for (const listener of this.statusListeners) listener();
  }

  private join(topic: string, entry: Entry) {
    if (entry.channel || this.paused) return;
    const supabase = createClient();
    const channel = supabase.channel(topic, { config: { private: true } });
    entry.channel = channel;
    channel.on("broadcast", { event: "changed" }, () => this.notify(entry));
    void this.auth().then(() => {
      if (entry.channel !== channel) return; // left again meanwhile
      channel.subscribe((status) => {
        if (entry.channel !== channel) return;
        const subscribed = status === "SUBSCRIBED";
        if (subscribed && entry.joinedBefore) this.notify(entry); // catch up
        if (subscribed) entry.joinedBefore = true;
        entry.subscribed = subscribed;
        this.emitStatus();
      });
    });
  }

  private leave(entry: Entry) {
    const channel = entry.channel;
    entry.channel = null;
    entry.subscribed = false;
    if (channel) void createClient().removeChannel(channel);
  }

  follow(topic: string, listener: Listener) {
    let entry = this.entries.get(topic);
    if (!entry) {
      entry = {
        channel: null,
        listeners: new Set(),
        subscribed: false,
        joinedBefore: false,
      };
      this.entries.set(topic, entry);
    }
    entry.listeners.add(listener);
    this.join(topic, entry);
    this.emitStatus();
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        this.leave(entry);
        this.entries.delete(topic);
      }
      this.emitStatus();
    };
  }

  isConnected(topics: string[]) {
    return (
      topics.length > 0 &&
      topics.every((t) => this.entries.get(t)?.subscribed === true)
    );
  }

  onStatus(listener: Listener) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /** Hidden tab: leave every channel (no messages for nobody to see). */
  pause() {
    if (this.paused) return;
    this.paused = true;
    for (const entry of this.entries.values()) this.leave(entry);
    this.emitStatus();
  }

  /** Shown again: join again and catch up on what changed meanwhile. */
  resume() {
    if (!this.paused) return;
    this.paused = false;
    for (const [topic, entry] of this.entries) {
      entry.joinedBefore = true;
      this.join(topic, entry);
    }
    this.emitStatus();
  }
}

type LiveContext = { hub: LiveHub; workspaceId: string | null };
const Context = createContext<LiveContext | null>(null);

/** Provides the live connection to the signed-in app (in the app shell). */
export function LiveUpdatesProvider({
  workspaceId,
  children,
}: {
  workspaceId: string | null;
  children: ReactNode;
}) {
  const [hub] = useState(() => new LiveHub());
  // Same value across page refreshes, so components keep their channels.
  const value = useMemo(() => ({ hub, workspaceId }), [hub, workspaceId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (document.hidden) {
        timer = setTimeout(() => hub.pause(), HIDDEN_GRACE_MS);
      } else {
        hub.resume();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
    };
  }, [hub]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Calls `onChange` when any of `kinds` changes (also after a reconnect, which may
 * have missed changes). Returns whether every channel is connected.
 */
export function useLiveChanges(kinds: LiveKind[], onChange: () => void) {
  const context = useContext(Context);
  const callback = useRef(onChange);
  const [connected, setConnected] = useState(false);
  const key = kinds.join(",");

  useEffect(() => {
    callback.current = onChange;
  });

  useEffect(() => {
    if (!context) return;
    const { hub, workspaceId } = context;
    const topics = key
      .split(",")
      .map((k) => topicOf(k as LiveKind, workspaceId))
      .filter((t): t is string => t !== null);
    const listener = () => callback.current();
    const stops = topics.map((t) => hub.follow(t, listener));
    const update = () => setConnected(hub.isConnected(topics));
    const stopStatus = hub.onStatus(update);
    update();
    return () => {
      stopStatus();
      for (const stop of stops) stop();
    };
  }, [context, key]);

  return connected;
}
