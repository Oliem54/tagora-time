import Image from "next/image";

type HeaderTagoraProps = {
  title: string;
  subtitle: string;
};

export default function HeaderTagora({
  title,
  subtitle,
}: HeaderTagoraProps) {
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
        gap: 34,
        boxShadow: "0 12px 30px rgba(15, 47, 99, 0.18)",
      }}
    >
      <div
        style={{
          width: 260,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
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

        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1,
            color: "white",
            marginTop: -78,
            marginLeft: 40,
          }}
        >
          Time
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 38,
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: 6,
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: 18,
            color: "rgba(255,255,255,0.88)",
            lineHeight: 1.3,
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}
