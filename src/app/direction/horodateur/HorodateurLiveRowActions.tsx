"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Ellipsis,
  Eye,
  Fingerprint,
  MoreHorizontal,
  PenLine,
  Phone,
  ShieldAlert,
} from "lucide-react";

export type HorodateurLiveRowActionsProps = {
  employeeLabel: string;
  exceptionCount: number;
  needsAttention: boolean;
  phoneHref: string | null;
  disabled?: boolean;
  onCorrect: () => void;
  onManualPunch: () => void;
  onDetail: () => void;
  onExceptions: () => void;
};

type MenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
};

export default function HorodateurLiveRowActions({
  employeeLabel,
  exceptionCount,
  needsAttention,
  phoneHref,
  disabled = false,
  onCorrect,
  onManualPunch,
  onDetail,
  onExceptions,
}: HorodateurLiveRowActionsProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasExceptions = exceptionCount > 0;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  function runAction(action: () => void) {
    if (disabled) {
      return;
    }
    setMenuOpen(false);
    action();
  }

  const plusMenuItems: MenuItem[] = [
    {
      key: "punch",
      label: "Punch manuel",
      icon: <Fingerprint size={15} />,
      onClick: onManualPunch,
    },
    {
      key: "call",
      label: "Appeler",
      icon: <Phone size={15} />,
      onClick: () => undefined,
      hidden: !phoneHref,
    },
  ].filter((item) => !item.hidden);

  const mobileMenuItems: MenuItem[] = [
    {
      key: "correct",
      label: needsAttention ? "Corriger le quart" : "Corriger un oubli",
      icon: needsAttention ? <AlertCircle size={15} /> : <PenLine size={15} />,
      onClick: onCorrect,
    },
    {
      key: "detail",
      label: "Voir détail",
      icon: <Eye size={15} />,
      onClick: onDetail,
    },
    {
      key: "exceptions",
      label: hasExceptions ? `Exceptions (${exceptionCount})` : "Exceptions — aucune",
      icon: <ShieldAlert size={15} />,
      onClick: onExceptions,
      disabled: !hasExceptions,
    },
    ...plusMenuItems,
  ];

  function renderMenu(menuItems: MenuItem[], id: string, className?: string) {
    if (!menuOpen) {
      return null;
    }

    return (
      <div id={id} role="menu" className={className ?? "horodateur-live-row-actions-menu"}>
        {menuItems.map((item) =>
          item.key === "call" && phoneHref ? (
            <a
              key={item.key}
              role="menuitem"
              href={phoneHref}
              className="horodateur-live-row-actions-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          ) : (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className="horodateur-live-row-actions-menu-item"
              disabled={disabled || item.disabled}
              onClick={() => runAction(item.onClick)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="horodateur-live-row-actions">
      <div className="horodateur-live-row-actions-toolbar" aria-label={`Actions — ${employeeLabel}`}>
        <button
          type="button"
          className={`horodateur-live-row-action-btn horodateur-live-row-action-btn--cta${
            needsAttention ? " horodateur-live-row-action-btn--cta-warning" : ""
          }`}
          title={
            needsAttention
              ? `Corriger le quart — ${employeeLabel}`
              : `Corriger un oubli — ${employeeLabel}`
          }
          aria-label={
            needsAttention
              ? `Corriger le quart — ${employeeLabel}`
              : `Corriger un oubli — ${employeeLabel}`
          }
          disabled={disabled}
          onClick={() => runAction(onCorrect)}
        >
          {needsAttention ? <AlertCircle size={16} strokeWidth={2.1} /> : <PenLine size={16} strokeWidth={2.1} />}
          <span>Corriger</span>
        </button>

        <button
          type="button"
          className="horodateur-live-row-action-btn horodateur-live-row-action-btn--icon"
          title={`Voir le détail — ${employeeLabel}`}
          aria-label={`Voir le détail — ${employeeLabel}`}
          disabled={disabled}
          onClick={() => runAction(onDetail)}
        >
          <Eye size={16} strokeWidth={2.1} />
        </button>

        {hasExceptions ? (
          <button
            type="button"
            className="horodateur-live-row-exception-chip"
            title={`${exceptionCount} exception(s) — ${employeeLabel}`}
            disabled={disabled}
            onClick={() => runAction(onExceptions)}
          >
            <ShieldAlert size={14} strokeWidth={2.2} />
            <span>{exceptionCount}</span>
          </button>
        ) : (
          <span className="horodateur-live-row-exception-none" aria-hidden="true">
            Aucune
          </span>
        )}

        <div className="horodateur-live-row-actions-overflow">
          <button
            type="button"
            className="horodateur-live-row-action-btn horodateur-live-row-action-btn--icon"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-controls={menuId}
            title={`Plus d'actions — ${employeeLabel}`}
            disabled={disabled || plusMenuItems.length === 0}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <MoreHorizontal size={16} strokeWidth={2.1} />
          </button>
          {renderMenu(plusMenuItems, menuId)}
        </div>
      </div>

      <div className="horodateur-live-row-actions-mobile">
        <button
          type="button"
          className="horodateur-live-row-action-btn horodateur-live-row-action-btn--mobile-sheet"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={`${menuId}-mobile`}
          disabled={disabled}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <Ellipsis size={16} strokeWidth={2.1} />
          <span>Actions</span>
        </button>
        {renderMenu(
          mobileMenuItems,
          `${menuId}-mobile`,
          "horodateur-live-row-actions-menu horodateur-live-row-actions-menu--mobile"
        )}
      </div>
    </div>
  );
}
