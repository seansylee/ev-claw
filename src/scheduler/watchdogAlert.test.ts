import { describe, expect, it } from "vitest";
import { classifyWatchdogTransition } from "./watchdogAlert.js";

describe("classifyWatchdogTransition", () => {
  it("alerts when a previously-healthy (or brand new) watchdog starts failing", () => {
    expect(classifyWatchdogTransition(undefined, "failure")).toBe("became_failing");
    expect(classifyWatchdogTransition("success", "failure")).toBe("became_failing");
  });

  it("alerts when a failing watchdog recovers", () => {
    expect(classifyWatchdogTransition("failure", "success")).toBe("recovered");
  });

  it("does not alert on repeated identical failures (no spam)", () => {
    expect(classifyWatchdogTransition("failure", "failure")).toBeNull();
  });

  it("does not alert when nothing changed (healthy -> healthy)", () => {
    expect(classifyWatchdogTransition("success", "success")).toBeNull();
    expect(classifyWatchdogTransition(undefined, "success")).toBeNull();
  });
});
