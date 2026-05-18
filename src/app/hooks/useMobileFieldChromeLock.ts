"use client";

import { useEffect, useState } from "react";
import {
  MOBILE_FIELD_ACTIONS_ATTR,
  MOBILE_FIELD_CHROME_MEDIA,
} from "@/app/lib/mobile-field-chrome.shared";

const MOBILE_FIELD_TOUCH_MEDIA = "(max-width: 1024px) and (hover: none) and (pointer: coarse)";

function isMobileFieldViewport() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia(MOBILE_FIELD_CHROME_MEDIA).matches ||
    window.matchMedia(MOBILE_FIELD_TOUCH_MEDIA).matches
  );
}

/** Viewport mobile terrain (aligné sur les media queries CSS de la barre d’actions). */
export function useMobileViewport() {
  const [isMobileViewport, setIsMobileViewport] = useState(() => isMobileFieldViewport());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const narrow = window.matchMedia(MOBILE_FIELD_CHROME_MEDIA);
    const touch = window.matchMedia(MOBILE_FIELD_TOUCH_MEDIA);
    const apply = () => setIsMobileViewport(isMobileFieldViewport());
    apply();
    narrow.addEventListener("change", apply);
    touch.addEventListener("change", apply);
    return () => {
      narrow.removeEventListener("change", apply);
      touch.removeEventListener("change", apply);
    };
  }, []);

  return isMobileViewport;
}

/**
 * Masque la bulle Améliorations sur mobile quand des actions terrain critiques sont visibles.
 */
export function useMobileFieldChromeLock(active: boolean) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const root = document.documentElement;
    const narrow = window.matchMedia(MOBILE_FIELD_CHROME_MEDIA);
    const touch = window.matchMedia(MOBILE_FIELD_TOUCH_MEDIA);

    const apply = () => {
      if (active && isMobileFieldViewport()) {
        root.setAttribute(MOBILE_FIELD_ACTIONS_ATTR, "open");
      } else {
        root.removeAttribute(MOBILE_FIELD_ACTIONS_ATTR);
      }
    };

    apply();
    narrow.addEventListener("change", apply);
    touch.addEventListener("change", apply);

    return () => {
      narrow.removeEventListener("change", apply);
      touch.removeEventListener("change", apply);
      root.removeAttribute(MOBILE_FIELD_ACTIONS_ATTR);
    };
  }, [active]);
}
