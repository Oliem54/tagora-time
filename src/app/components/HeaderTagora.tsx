import Image from "next/image";

type HeaderTagoraProps = {
  title?: string;
  subtitle?: string;
};

export default function HeaderTagora({
  title,
  subtitle,
}: HeaderTagoraProps) {
  const hasText = Boolean(title || subtitle);

  return (
    <div className="tagora-header">
      <div
        style={{
          width: 260,
          flexShrink: 0,
        }}
      >
        <div className="tagora-header-logo-shell">
          <Image
            src="/logo.png"
            alt="Logo TAGORA"
            width={260}
            height={130}
            priority
            style={{
              width: "260px",
              height: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>
      </div>

      {hasText ? (
        <div className="tagora-header-copy">
          {title ? <div className="tagora-header-title">{title}</div> : null}
          {subtitle ? (
            <div className="tagora-header-subtitle">{subtitle}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
