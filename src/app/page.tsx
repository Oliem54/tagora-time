import Image from "next/image";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "black",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "20px",
      }}
    >
      <div style={{ maxWidth: "800px", width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "20px",
          }}
        >
          <Image
            src="/logo.png"
            alt="Logo TAGORA Time"
            width={220}
            height={220}
            priority
          />
        </div>

        <h1 style={{ fontSize: "48px", marginBottom: "20px" }}>
          TAGORA Time
        </h1>

        <p style={{ fontSize: "22px" }}>
          Première page de mon application
        </p>
      </div>
    </main>
  );
}