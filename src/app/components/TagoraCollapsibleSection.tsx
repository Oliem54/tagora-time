"use client";

import { useId } from "react";
import { cn } from "@/app/components/ui/cn";

export type TagoraCollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  /** Section ouverte : affiche « − » ; fermée : « + ». */
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  children: React.ReactNode;
  /** Éléments optionnels à droite du titre (hors bouton ±). */
  actions?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  /**
   * Garder le contenu monté quand la section est fermée (champs de formulaire, état interne).
   * @default true
   */
  preserveContent?: boolean;
  /** `id` sur l’élément `<section>` (ancrage, scroll). */
  sectionId?: string;
};

/**
 * Section repliable : + ouvre, − ferme. Le déclencheur est toujours `type="button"`.
 */
export default function TagoraCollapsibleSection({
  title,
  subtitle,
  open,
  onOpenChange,
  children,
  actions,
  disabled,
  className,
  contentClassName,
  preserveContent = true,
  sectionId,
}: TagoraCollapsibleSectionProps) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  return (
    <section
      id={sectionId}
      className={cn("tagora-panel ui-stack-md tagora-collapsible-section", className)}
    >
      <div
        className="tagora-collapsible-header"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 16,
          width: "100%",
        }}
      >
        <button
          type="button"
          className="tagora-collapsible-trigger"
          style={{ flex: 1, minWidth: 0 }}
          onClick={() => {
            if (!disabled) onOpenChange(!open);
          }}
          disabled={disabled}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <div className="ui-stack-xs" style={{ flex: 1, textAlign: "left" }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              {title}
            </h2>
            {subtitle ? (
              <p className="tagora-note" style={{ margin: 0 }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <span className="tagora-collapsible-toggle" aria-hidden>
            {open ? "−" : "+"}
          </span>
        </button>
        {actions ? (
          <div className="tagora-collapsible-actions" style={{ flexShrink: 0 }}>
            {actions}
          </div>
        ) : null}
      </div>

      {preserveContent ? (
        <div
          id={panelId}
          hidden={!open}
          className={cn("tagora-collapsible-panel", contentClassName)}
        >
          {children}
        </div>
      ) : open ? (
        <div id={panelId} className={cn("tagora-collapsible-panel", contentClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
