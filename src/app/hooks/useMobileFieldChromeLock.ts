"use client";

import { useEffect } from "react";
import {
  MOBILE_FIELD_ACTIONS_ATTR,
  MOBILE_FIELD_CHROME_MEDIA,
} from "@/app/lib/mobile-field-chrome.shared";

/**
 * Masque la bulle Améliorations sur mobile quand des actions terrain critiques sont visibles.
 */
export function useMobileFieldChromeLock(active: boolean) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const root = document.documentElement;
    const media = window.matchMedia(MOBILE_FIELD_CHROME_MEDIA);

    const apply = () => {
      if (active && media.matches) {
        root.setAttribute(MOBILE_FIELD_ACTIONS_ATTR, "open");
      } else {
        root.removeAttribute(MOBILE_FIELD_ACTIONS_ATTR);
      }
    };

    apply();
    media.addEventListener("change", apply);

    return () => {
      media.removeEventListener("change", apply);
      root.removeAttribute(MOBILE_FIELD_ACTIONS_ATTR);
    };
  }, [active]);
}
