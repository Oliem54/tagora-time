import Image from "next/image";
import Link from "next/link";

type TimeBrandProps = {
  href?: string;
  /** Surface: light hub/login uses light asset; dark uses dark asset. */
  variant?: "light" | "dark";
  /** Semantic size — never renders below 120px. */
  size?: "hub" | "login";
  showWordmark?: boolean;
  /** Optional asset override. Accessible name stays on alt / aria-label. */
  src?: string;
};

const sizeMap = {
  hub: { desktop: 176, mobile: 144 },
  login: { desktop: 128, mobile: 120 },
} as const;

export default function TimeBrand({
  href = "/",
  variant = "light",
  size = "hub",
  showWordmark = true,
  src,
}: TimeBrandProps) {
  const dims = sizeMap[size];
  const resolvedSrc =
    src ??
    (variant === "dark"
      ? "/brand/horora/horora.png"
      : "/brand/horora/horora-light.png");

  return (
    <Link
      href={href}
      className={`time-public-brand time-public-brand--${size}${
        showWordmark ? "" : " time-public-brand--logo-only"
      }`}
      aria-label={showWordmark ? "TAGORA HORORA — Accueil" : "TAGORA HORORA"}
    >
      <Image
        src={resolvedSrc}
        alt={showWordmark ? "TAGORA HORORA" : ""}
        width={dims.desktop}
        height={dims.desktop}
        priority
        className="time-public-brand-logo"
        style={{
          width: "var(--time-public-logo-size)",
          height: "var(--time-public-logo-size)",
        }}
      />
      {showWordmark ? (
        <span className="time-public-brand-text" aria-hidden="true">
          <span className="time-public-brand-name">TAGORA HORORA</span>
          <span className="time-public-brand-tag">Pointage et heures</span>
        </span>
      ) : null}
    </Link>
  );
}
