import { describe, expect, it } from "vitest";
import { avatarObjectPath, MAX_PHOTO_BYTES, validatePhoto } from "./avatar";

describe("profile photo upload boundaries", () => {
  it("accepts supported raster photos and rejects empty, oversized or active files", () => {
    expect(() =>
      validatePhoto({ type: "image/jpeg", size: 1000 }),
    ).not.toThrow();
    expect(() =>
      validatePhoto({ type: "image/png", size: MAX_PHOTO_BYTES }),
    ).not.toThrow();
    expect(() => validatePhoto({ type: "image/webp", size: 20 })).not.toThrow();
    expect(() => validatePhoto({ type: "image/svg+xml", size: 100 })).toThrow(
      "JPG",
    );
    expect(() =>
      validatePhoto({ type: "image/jpeg", size: MAX_PHOTO_BYTES + 1 }),
    ).toThrow("10 MB");
    expect(() => validatePhoto({ type: "image/jpeg", size: 0 })).toThrow(
      "vacía",
    );
  });
  it("only removes an uploaded object belonging to the signed-in profile", () => {
    const filename = "d923dc80-ff1d-46fb-b8db-c6d23b782321.jpg";
    expect(avatarObjectPath(`avatars/customer/${filename}`, "customer")).toBe(
      `customer/${filename}`,
    );
    expect(
      avatarObjectPath(`avatars/someone-else/${filename}`, "customer"),
    ).toBeNull();
    expect(
      avatarObjectPath("https://example.com/photo.jpg", "customer"),
    ).toBeNull();
    expect(
      avatarObjectPath(
        "avatars/customer/../someone-else/photo.jpg",
        "customer",
      ),
    ).toBeNull();
  });
});
