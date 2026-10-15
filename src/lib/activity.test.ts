import { afterEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const after = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (iPhone)" }) }));
vi.mock("./db", () => ({ db: () => ({ from: () => ({ insert }) }) }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => after(fn) }));

const { logActivity, logActivityInBackground } = await import("./activity");

afterEach(() => {
  insert.mockReset();
  after.mockReset();
  vi.restoreAllMocks();
});

describe("activity log", () => {
  it("never throws when the insert fails, so the page still renders", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    insert.mockRejectedValueOnce(new Error("network down"));
    await expect(logActivity("u1", "page_view", { page: "dashboard" })).resolves.toBeUndefined();
    insert.mockResolvedValueOnce({ error: { message: "violates check" } });
    await expect(logActivity("u1", "page_view")).resolves.toBeUndefined();
  });

  it("the background version schedules the insert with after() instead of making the caller wait", async () => {
    insert.mockResolvedValueOnce({ error: null });
    expect(logActivityInBackground("u1", "page_view", { page: "homework" })).toBeUndefined();
    expect(after).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
    await after.mock.calls[0][0]();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", event: "page_view", detail: { page: "homework" } }));
  });

  it("a failed background insert is caught", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    insert.mockRejectedValueOnce(new Error("network down"));
    logActivityInBackground("u1", "page_view");
    await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
  });
});
