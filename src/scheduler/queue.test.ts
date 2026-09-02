import { describe, expect, it } from "vitest";

// Fresh module instance per test file run — queue.ts exports singletons, but
// each test in this file uses a fresh Lane import since vitest isolates
// module state per test file (not per test), so we assert on relative
// ordering rather than absolute state.
import { backgroundLane, interactiveLane } from "./queue.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("Lane", () => {
  it("runs enqueued jobs strictly one at a time, in order", async () => {
    const order: number[] = [];
    const gate = deferred<void>();

    interactiveLane.enqueue(async () => {
      await gate.promise; // block the first job until we release it below
      order.push(1);
    });
    interactiveLane.enqueue(async () => {
      order.push(2);
    });

    // While the first job is still blocked, nothing should have run yet.
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([]);

    gate.resolve();
    await new Promise((r) => setTimeout(r, 20));

    expect(order).toEqual([1, 2]);
  });

  it("a job throwing doesn't block the lane from processing later jobs", async () => {
    const order: string[] = [];

    backgroundLane.enqueue(async () => {
      order.push("before-throw");
      throw new Error("boom");
    });
    backgroundLane.enqueue(async () => {
      order.push("after-throw");
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(order).toEqual(["before-throw", "after-throw"]);
  });

  it("two lanes run independently of each other", async () => {
    const order: string[] = [];
    const gate = deferred<void>();

    interactiveLane.enqueue(async () => {
      await gate.promise;
      order.push("interactive");
    });
    backgroundLane.enqueue(async () => {
      order.push("background");
    });

    // The background lane should finish even while interactive is still blocked.
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(["background"]);

    gate.resolve();
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toEqual(["background", "interactive"]);
  });
});
