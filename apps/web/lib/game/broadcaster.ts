import { getRedisPublisher, getRedisSubscriber, isRedisConfigured } from "../redis";

/**
 * Fan-out for game events, delivered to clients over Server-Sent Events
 * (`/api/games/:id/stream`). Two implementations behind one interface:
 *
 *  - `RedisBroadcaster` (used whenever REDIS_URL is configured): publishes
 *    to a Redis Pub/Sub channel per game. Every realtime instance
 *    subscribes independently, so a player connected to instance #2
 *    receives events published by instance #1 — this is what makes the
 *    realtime layer horizontally scalable. Postgres remains the durable
 *    source of truth (GameEvent/BingoNumber/Winner rows); Redis only
 *    carries the live fan-out, so a dropped message never corrupts state —
 *    a reconnecting client just re-syncs from Postgres via `game:sync`.
 *
 *  - `InProcessBroadcaster` (fallback when REDIS_URL is unset): an
 *    in-memory Map, single-instance only. Kept so local development works
 *    with zero external dependencies. NOT safe for a multi-instance
 *    deployment — see docs/ARCHITECTURE.md §9.
 *
 * Stored on `globalThis` for the same reason as the Prisma client: Next.js
 * dev mode compiles each API route into its own webpack module graph, so a
 * plain module-scoped variable would not be shared between the route that
 * publishes an event and the route that streams it.
 */
export interface GameEvent {
  type: string;
  gameId: string;
  payload: unknown;
  at: string;
}

type Listener = (event: GameEvent) => void;

export interface GameEventBroadcaster {
  publish(gameId: string, type: string, payload: unknown): void;
  subscribe(gameId: string, listener: Listener): () => void;
}

class InProcessBroadcaster implements GameEventBroadcaster {
  private listeners = new Map<string, Set<Listener>>();

  publish(gameId: string, type: string, payload: unknown): void {
    const event: GameEvent = { type, gameId, payload, at: new Date().toISOString() };
    for (const listener of this.listeners.get(gameId) ?? []) listener(event);
  }

  subscribe(gameId: string, listener: Listener): () => void {
    if (!this.listeners.has(gameId)) this.listeners.set(gameId, new Set());
    this.listeners.get(gameId)!.add(listener);
    return () => this.listeners.get(gameId)?.delete(listener);
  }
}

const CHANNEL_PREFIX = "bingo:game:";

class RedisBroadcaster implements GameEventBroadcaster {
  private localListeners = new Map<string, Set<Listener>>();
  private messageHandlerBound = false;

  private ensureMessageHandler(): void {
    if (this.messageHandlerBound) return;
    this.messageHandlerBound = true;
    getRedisSubscriber().on("message", (channel: string, raw: string) => {
      if (!channel.startsWith(CHANNEL_PREFIX)) return;
      const gameId = channel.slice(CHANNEL_PREFIX.length);
      let event: GameEvent;
      try {
        event = JSON.parse(raw) as GameEvent;
      } catch {
        return; // malformed payload — never let a bad message crash the listener loop
      }
      for (const listener of this.localListeners.get(gameId) ?? []) listener(event);
    });
  }

  publish(gameId: string, type: string, payload: unknown): void {
    const event: GameEvent = { type, gameId, payload, at: new Date().toISOString() };
    // Fire-and-forget by design: a realtime fan-out hiccup must never fail
    // the game-state write it's reporting on. Postgres already has the
    // durable record by the time callers publish; Redis unavailability
    // only degrades live delivery, which reconnect (`game:sync`) repairs.
    void getRedisPublisher()
      .publish(`${CHANNEL_PREFIX}${gameId}`, JSON.stringify(event))
      .catch(() => {});
  }

  subscribe(gameId: string, listener: Listener): () => void {
    this.ensureMessageHandler();
    if (!this.localListeners.has(gameId)) this.localListeners.set(gameId, new Set());
    const set = this.localListeners.get(gameId)!;
    const isFirstLocalSubscriber = set.size === 0;
    set.add(listener);
    if (isFirstLocalSubscriber) {
      void getRedisSubscriber()
        .subscribe(`${CHANNEL_PREFIX}${gameId}`)
        .catch(() => {});
    }

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.localListeners.delete(gameId);
        void getRedisSubscriber()
          .unsubscribe(`${CHANNEL_PREFIX}${gameId}`)
          .catch(() => {});
      }
    };
  }
}

const globalForBroadcaster = globalThis as unknown as { __gameBroadcaster?: GameEventBroadcaster };

export function getGameBroadcaster(): GameEventBroadcaster {
  if (!globalForBroadcaster.__gameBroadcaster) {
    globalForBroadcaster.__gameBroadcaster = isRedisConfigured() ? new RedisBroadcaster() : new InProcessBroadcaster();
  }
  return globalForBroadcaster.__gameBroadcaster;
}
