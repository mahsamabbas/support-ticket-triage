import { describe, expect, it } from "vitest";
import { hotkeyId, isTypingTarget, modShortcut, shouldHandle, type HotkeyEvent } from "./use-hotkeys";

type FakeTarget = { tagName?: string; role?: string; editable?: boolean; within?: string[] };

function fakeTarget({ tagName = "DIV", role, editable = false, within = [] }: FakeTarget = {}): EventTarget {
  const roles = role ? [role, ...within] : within;
  return {
    tagName,
    isContentEditable: editable,
    getAttribute: (name: string) => (name === "role" ? (role ?? null) : null),
    closest: (selector: string) => (roles.some((r) => selector.includes(`[role="${r}"]`)) ? {} : null),
  } as unknown as EventTarget;
}

function keyEvent(overrides: Partial<HotkeyEvent> = {}): HotkeyEvent {
  return {
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    target: fakeTarget(),
    ...overrides,
  };
}

const IDLE = { repeatable: false, overlayOpen: false };

describe("hotkeyId", () => {
  it("lower-cases plain keys", () => {
    expect(hotkeyId({ key: "J", metaKey: false, ctrlKey: false })).toBe("j");
  });
  it("prefixes mod for cmd or ctrl", () => {
    expect(hotkeyId({ key: "k", metaKey: true, ctrlKey: false })).toBe("mod+k");
    expect(hotkeyId({ key: "k", metaKey: false, ctrlKey: true })).toBe("mod+k");
  });
});

describe("isTypingTarget", () => {
  it.each(["INPUT", "TEXTAREA", "SELECT"])("treats %s as typing", (tagName) => {
    expect(isTypingTarget(fakeTarget({ tagName }))).toBe(true);
  });
  it("treats contenteditable and comboboxes as typing", () => {
    expect(isTypingTarget(fakeTarget({ editable: true }))).toBe(true);
    expect(isTypingTarget(fakeTarget({ tagName: "BUTTON", role: "combobox" }))).toBe(true);
  });
  it("ignores plain elements and non-elements", () => {
    expect(isTypingTarget(fakeTarget())).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});

describe("shouldHandle", () => {
  it("handles a plain key on the page", () => {
    expect(shouldHandle(keyEvent(), "a", IDLE)).toBe(true);
  });
  it("ignores alt, shift and IME composition", () => {
    expect(shouldHandle(keyEvent({ altKey: true }), "a", IDLE)).toBe(false);
    expect(shouldHandle(keyEvent({ shiftKey: true }), "a", IDLE)).toBe(false);
    expect(shouldHandle(keyEvent({ isComposing: true }), "a", IDLE)).toBe(false);
  });
  it("only lets repeatable keys auto-repeat", () => {
    expect(shouldHandle(keyEvent({ repeat: true }), "t", IDLE)).toBe(false);
    expect(shouldHandle(keyEvent({ repeat: true }), "mod+k", IDLE)).toBe(false);
    expect(shouldHandle(keyEvent({ repeat: true }), "j", { ...IDLE, repeatable: true })).toBe(true);
  });
  it("skips letters while typing but keeps mod shortcuts", () => {
    const event = keyEvent({ target: fakeTarget({ tagName: "TEXTAREA" }) });
    expect(shouldHandle(event, "a", IDLE)).toBe(false);
    expect(shouldHandle(event, "mod+k", IDLE)).toBe(true);
  });
  it.each(["dialog", "listbox", "menu"])("skips letters when focus is inside a %s", (role) => {
    const event = keyEvent({ target: fakeTarget({ tagName: "BUTTON", within: [role] }) });
    expect(shouldHandle(event, "r", IDLE)).toBe(false);
    expect(shouldHandle(event, "mod+k", IDLE)).toBe(true);
  });
  it("skips letters while an overlay is open anywhere", () => {
    const open = { ...IDLE, overlayOpen: true };
    expect(shouldHandle(keyEvent(), "j", open)).toBe(false);
    expect(shouldHandle(keyEvent(), "mod+k", open)).toBe(true);
  });
});

describe("modShortcut", () => {
  it("uses the command glyph on Apple platforms", () => {
    expect(modShortcut("MacIntel", "K")).toBe("⌘K");
    expect(modShortcut("iPhone", "K")).toBe("⌘K");
  });
  it("uses Ctrl elsewhere", () => {
    expect(modShortcut("Win32", "K")).toBe("Ctrl K");
    expect(modShortcut("Linux x86_64", "K")).toBe("Ctrl K");
  });
});
