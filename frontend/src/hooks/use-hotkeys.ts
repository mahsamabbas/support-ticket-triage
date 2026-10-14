"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

export type HotkeyMap = Record<string, () => void>;
export type HotkeyEvent = Pick<KeyboardEvent, "altKey" | "shiftKey" | "repeat" | "isComposing" | "target">;
type HotkeyContext = { repeatable: boolean; overlayOpen: boolean };
type ElementLike = Pick<HTMLElement, "tagName" | "isContentEditable" | "getAttribute" | "closest">;

const TYPING_TAGS = ["INPUT", "TEXTAREA", "SELECT"];
const OVERLAY_ROLES = '[role="dialog"],[role="listbox"],[role="menu"]';
const OPEN_DIALOG = '[role="dialog"][data-state="open"]';

function asElement(target: EventTarget | null): ElementLike | null {
  if (!target || typeof (target as Partial<ElementLike>).getAttribute !== "function") return null;
  return target as unknown as ElementLike;
}

export function hotkeyId(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">): string {
  return `${event.metaKey || event.ctrlKey ? "mod+" : ""}${event.key.toLowerCase()}`;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (!element) return false;
  return (
    element.isContentEditable ||
    TYPING_TAGS.includes(element.tagName) ||
    element.getAttribute("role") === "combobox"
  );
}

export function shouldHandle(event: HotkeyEvent, id: string, { repeatable, overlayOpen }: HotkeyContext): boolean {
  if (event.altKey || event.shiftKey || event.isComposing) return false;
  if (event.repeat && !repeatable) return false;
  if (id.startsWith("mod+")) return true;
  if (overlayOpen || isTypingTarget(event.target)) return false;
  return !asElement(event.target)?.closest(OVERLAY_ROLES);
}

export function modShortcut(platform: string, key: string): string {
  return /Mac|iPhone|iPad|iPod/.test(platform) ? `⌘${key}` : `Ctrl ${key}`;
}

export function useHotkeys(map: HotkeyMap, { repeatable = [] }: { repeatable?: readonly string[] } = {}) {
  const mapRef = useRef(map);
  const repeatableRef = useRef(repeatable);
  useEffect(() => {
    mapRef.current = map;
    repeatableRef.current = repeatable;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (typeof event.key !== "string") return;
      const id = hotkeyId(event);
      const handler = mapRef.current[id];
      if (!handler) return;
      const context = {
        repeatable: repeatableRef.current.includes(id),
        overlayOpen: document.querySelector(OPEN_DIALOG) !== null,
      };
      if (!shouldHandle(event, id, context)) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

const noSubscribe = () => () => {};

export function useModShortcut(key: string): string {
  return useSyncExternalStore(
    noSubscribe,
    () => modShortcut(navigator.userAgent, key),
    () => modShortcut("Mac", key),
  );
}
