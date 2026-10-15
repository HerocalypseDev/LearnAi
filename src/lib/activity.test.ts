import { afterEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const waitUntil = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (iPhone)" }) }));
vi.mock("./db", () => ({ db: () => ({ from: () => ({ insert }) }) }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => waitUntil(p) }));

const { logActivity, logActivityInBackground } = await import("./activity");

afterEach(() => {
  insert.mockReset();
  waitUntil.mockReset();
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

  it("the background version hands the insert to waitUntil instead of making the caller wait", async () => {
    insert.mockResolvedValueOnce({ error: null });
    expect(logActivityInBackground("u1", "page_view", { page: "homework" })).toBeUndefined();
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", event: "page_view", detail: { page: "homework" } }));
  });
});
