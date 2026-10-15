import { describe, expect, it } from "vitest";
import { thumbnailPath } from "./storage";

describe("thumbnailPath", () => {
  it("keeps a picture's preview beside it, in the same student and homework folder", () => {
    expect(thumbnailPath("stu/hw/abc-photo.png")).toBe("stu/hw/thumbs/abc-photo.png.jpg");
  });
});
