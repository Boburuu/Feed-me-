import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./appUpdate";

describe("isNewerVersion", () => {
  it("compare les numéros, pas le texte", () => {
    expect(isNewerVersion("v1.10", "v1.9")).toBe(true);
    expect(isNewerVersion("v2.0", "v1.10")).toBe(true);
    expect(isNewerVersion("v1.9.1", "v1.9")).toBe(true);
  });

  it("ne propose ni la même version ni une plus ancienne", () => {
    expect(isNewerVersion("v1.9", "v1.9")).toBe(false);
    expect(isNewerVersion("v1.9", "v1.10")).toBe(false);
  });

  it("ne propose rien si un numéro est illisible", () => {
    expect(isNewerVersion("test-12", "v1.9")).toBe(false);
    expect(isNewerVersion("v1.10", "")).toBe(false);
  });
});
