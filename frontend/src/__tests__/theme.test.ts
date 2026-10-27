import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  THEME_STORAGE_KEY,
  getInitialTheme,
  getSystemPreference,
  applyThemeToDOM,
} from "../context/themeUtils";
import { CHECK_STATUS_META, VERDICT_META, type CheckStatus, type Verdict } from "../types";

describe("Theme System & Appearance Modes", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  let storageMock: Record<string, string> = {};

  beforeEach(() => {
    storageMock = {};

    const mockClassList = new Set<string>();
    const attributes: Record<string, string> = {};
    const styleObj: Record<string, string> = {};

    const mockDocumentElement = {
      classList: {
        add: (cls: string) => {
          mockClassList.add(cls);
        },
        remove: (cls: string) => {
          mockClassList.delete(cls);
        },
        contains: (cls: string) => mockClassList.has(cls),
      },
      setAttribute: (name: string, val: string) => {
        attributes[name] = val;
      },
      getAttribute: (name: string) => attributes[name] ?? null,
      style: styleObj,
    };

    const mockStorage: Storage = {
      length: 0,
      clear: () => {
        storageMock = {};
      },
      getItem: (key: string) => storageMock[key] ?? null,
      setItem: (key: string, val: string) => {
        storageMock[key] = val;
      },
      removeItem: (key: string) => {
        delete storageMock[key];
      },
      key: () => null,
    };

    const mockMatchMedia = (query: string): MediaQueryList => {
      const isDark = query.includes("dark");
      return {
        matches: !isDark,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    };

    globalThis.window = {
      localStorage: mockStorage,
      matchMedia: mockMatchMedia,
    } as unknown as Window & typeof globalThis;

    globalThis.document = {
      documentElement: mockDocumentElement,
    } as unknown as Document;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  });

  describe("First-Time Visitor & Initial Preference", () => {
    it("defaults to 'light' when no preference is stored in localStorage", () => {
      const initial = getInitialTheme();
      assert.equal(initial, "light", "Default preference for first-time visitor MUST be light");
    });

    it("respects stored 'dark' preference", () => {
      storageMock[THEME_STORAGE_KEY] = "dark";
      assert.equal(getInitialTheme(), "dark");
    });

    it("respects stored 'system' preference", () => {
      storageMock[THEME_STORAGE_KEY] = "system";
      assert.equal(getInitialTheme(), "system");
    });

    it("respects stored 'light' preference", () => {
      storageMock[THEME_STORAGE_KEY] = "light";
      assert.equal(getInitialTheme(), "light");
    });

    it("falls back to 'light' if stored value is invalid or corrupted", () => {
      storageMock[THEME_STORAGE_KEY] = "invalid_theme_mode";
      assert.equal(getInitialTheme(), "light");
    });

    it("gracefully handles localStorage throwing SecurityError/QuotaExceeded", () => {
      globalThis.window.localStorage.getItem = () => {
        throw new Error("SecurityError: Access is denied");
      };
      assert.equal(getInitialTheme(), "light");
    });
  });

  describe("System Preference Resolution", () => {
    it("detects system dark mode via matchMedia", () => {
      globalThis.window.matchMedia = (query: string): MediaQueryList => ({
        matches: query.includes("dark"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      });

      assert.equal(getSystemPreference(), "dark");
    });

    it("detects system light mode via matchMedia", () => {
      globalThis.window.matchMedia = (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      });

      assert.equal(getSystemPreference(), "light");
    });

    it("safely falls back to 'light' when matchMedia is missing or throws", () => {
      (globalThis.window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
      assert.equal(getSystemPreference(), "light");
    });
  });

  describe("DOM Application & FOUC Prevention", () => {
    it("applies dark mode attributes and styles immediately to root element", () => {
      applyThemeToDOM("dark");
      const root = globalThis.document.documentElement;
      assert.equal(root.classList.contains("dark"), true);
      assert.equal(root.getAttribute("data-theme"), "dark");
      assert.equal(root.style.colorScheme, "dark");
    });

    it("removes dark class and applies light mode attributes to root element", () => {
      // First make it dark
      applyThemeToDOM("dark");
      assert.equal(globalThis.document.documentElement.classList.contains("dark"), true);

      // Switch to light
      applyThemeToDOM("light");
      const root = globalThis.document.documentElement;
      assert.equal(root.classList.contains("dark"), false);
      assert.equal(root.getAttribute("data-theme"), "light");
      assert.equal(root.style.colorScheme, "light");
    });
  });

  describe("Contrast & Verdict Evidence Tokens", () => {
    it("ensures all 3 verdicts have distinct labels and colors", () => {
      const verdicts: Verdict[] = ["likely_delivered", "likely_bounce", "unknown"];
      const labels = new Set<string>();
      const colors = new Set<string>();

      verdicts.forEach((v) => {
        const meta = VERDICT_META[v];
        assert.ok(meta, `Metadata for verdict ${v} must exist`);
        assert.ok(meta.label.length > 0, `Verdict ${v} must have a descriptive label`);
        labels.add(meta.label);
        colors.add(meta.badgeColor);
      });

      assert.equal(labels.size, 3, "All 3 verdicts must have unique readable labels");
      assert.equal(colors.size, 3, "All 3 verdicts must have distinct visual badge colors");
    });

    it("ensures all 5 check statuses define dual-mode contrast classes", () => {
      const statuses: CheckStatus[] = ["passed", "failed", "inconclusive", "skipped", "unavailable"];
      statuses.forEach((s) => {
        const meta = CHECK_STATUS_META[s];
        assert.ok(meta, `Meta for check status ${s} must exist`);
        assert.ok(meta.label.length > 0);
        assert.ok(
          meta.textClass.includes("dark:"),
          `Check status ${s} textClass must include dark: variant for accessibility`
        );
        assert.ok(
          meta.bgClass.includes("dark:"),
          `Check status ${s} bgClass must include dark: variant for accessibility`
        );
      });
    });
  });
});
