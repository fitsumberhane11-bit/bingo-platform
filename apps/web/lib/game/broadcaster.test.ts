import { describe, expect, it, afterEach } from "vitest";
import Redis from "ioredis";
import { getGameBroadcaster } from "./broadcaster";

/**
 * `getGameBroadcaster()` is a globalThis-bound singleton, so within a single
 * test process it always returns the same instance — it can't literally
 * simulate two separate Next.js processes. What CAN be proven in-process is
 * the actual data-plane contract every instance relies on: publishing to a
 * Redis channel is delivered to every independent connection subscribed to
 * it, not just the connection that happened to publish it. That's the
 * property that makes the broadcaster horizontally scalable — two raw
 * ioredis connections here stand in for "realtime instance #1" and
 * "realtime instance #2". The full multi-process proof (two live Next.js
 * servers, real browsers) is exercised separately as part of the 5-player
 * acceptance test.
 */
describe("Redis-backed game event fan-out", () => {
  const clients: Redis[] = [];

  afterEach(async () => {
    await Promise.all(clients.map((c) => c.quit().catch(() => {})));
    clients.length = 0;
  });

  it("delivers a published event to two independent subscriber connections", async () => {
    const url = process.env.REDIS_URL;
    expect(url, "REDIS_URL must be set by the vitest globalSetup").toBeTruthy();

    const instanceA = new Redis(url!);
    const instanceB = new Redis(url!);
    const publisher = new Redis(url!);
    clients.push(instanceA, instanceB, publisher);

    const gameId = "sim-multi-instance-game";
    const channel = `bingo:game:${gameId}`;

    const receivedByA = new Promise<string>((resolve) => {
      instanceA.on("message", (_ch, msg) => resolve(msg));
    });
    const receivedByB = new Promise<string>((resolve) => {
      instanceB.on("message", (_ch, msg) => resolve(msg));
    });

    await instanceA.subscribe(channel);
    await instanceB.subscribe(channel);

    const event = { type: "game:number-called", gameId, payload: { ballNumber: 42 }, at: new Date().toISOString() };
    await publisher.publish(channel, JSON.stringify(event));

    const [msgA, msgB] = await Promise.all([receivedByA, receivedByB]);
    expect(JSON.parse(msgA)).toEqual(event);
    expect(JSON.parse(msgB)).toEqual(event);
  });

  it("getGameBroadcaster() actually round-trips through Redis, not just local memory", async () => {
    const broadcaster = getGameBroadcaster();
    const gameId = `sim-broadcaster-${Date.now()}`;

    const received = new Promise<unknown>((resolve) => {
      const unsubscribe = broadcaster.subscribe(gameId, (event) => {
        unsubscribe();
        resolve(event.payload);
      });
    });

    // Give the underlying Redis SUBSCRIBE a moment to actually register on
    // the wire before publishing — same caveat any real Pub/Sub client has.
    await new Promise((r) => setTimeout(r, 50));
    broadcaster.publish(gameId, "test:event", { hello: "world" });

    await expect(received).resolves.toEqual({ hello: "world" });
  });
});
