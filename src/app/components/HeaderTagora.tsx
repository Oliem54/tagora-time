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
    <div
      style={{
        background: "linear-gradient(135deg, #0f2f63 0%, #133b7a 100%)",
        borderRadius: 20,
        padding: "26px 30px",
        color: "white",
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: hasText ? "flex-start" : "center",
        gap: hasText ? 34 : 0,
        boxShadow: "0 12px 30px rgba(15, 47, 99, 0.18)",
      }}
    >
      <div
        style={{
          width: 240,
          flexShrink: 0,
        }}
      >
        <Image
          src="/logo.png"
          alt="Logo TAGORA"
          width={240}
          height={120}
          priority
          style={{
            width: "240px",
            height: "auto",
            objectFit: "contain",
            display: "block",
          }}
        />

      </div>

      {hasText ? (
        <div>
          {title ? (
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                lineHeight: 1.1,
                marginBottom: subtitle ? 6 : 0,
              }}
            >
              {title}
            </div>
          ) : null}

          {subtitle ? (
            <div
              style={{
                fontSize: 18,
                color: "rgba(255,255,255,0.88)",
                lineHeight: 1.3,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
