import Link from "next/link";
import HeaderTagora from "@/app/components/HeaderTagora";

export default function Page() {
  return (
    <main style={{ minHeight: "100vh", background: "#f7f7f7" }}>
      <HeaderTagora />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "30px 20px 60px" }}>
        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: 24,
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            marginBottom: 24,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 32, color: "#111827" }}>
            Direction - Ressources
          </h1>

          <p style={{ marginTop: 10, marginBottom: 0, color: "#4b5563", fontSize: 16 }}>
            Gère les employés, les véhicules et les remorques à partir d’un seul endroit.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24,
          }}
        >
          <Link href="/direction/ressources/employes" style={cardLinkStyle}>
            <div style={cardStyle}>
              <div style={iconStyle}>👤</div>
              <h2 style={cardTitleStyle}>Employés / Chauffeurs</h2>
              <p style={cardTextStyle}>
                Ajouter, modifier et gérer les employés et chauffeurs utilisés dans les livraisons.
              </p>
              <div style={buttonStyle}>Gérer les employés</div>
            </div>
          </Link>

          <Link href="/direction/ressources/vehicules" style={cardLinkStyle}>
            <div style={cardStyle}>
              <div style={iconStyle}>🚚</div>
              <h2 style={cardTitleStyle}>Véhicules</h2>
              <p style={cardTextStyle}>
                Ajouter et gérer les véhicules disponibles pour les sorties et les livraisons.
              </p>
              <div style={buttonStyle}>Gérer les véhicules</div>
            </div>
          </Link>

          <Link href="/direction/ressources/remorques" style={cardLinkStyle}>
            <div style={cardStyle}>
              <div style={iconStyle}>🛻</div>
              <h2 style={cardTitleStyle}>Remorques</h2>
              <p style={cardTextStyle}>
                Ajouter et gérer les remorques qui peuvent être assignées aux livraisons.
              </p>
              <div style={buttonStyle}>Gérer les remorques</div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}

const cardLinkStyle: React.CSSProperties = {
  textDecoration: "none",
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 18,
  padding: 24,
  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  minHeight: 260,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  border: "1px solid #e5e7eb",
};

const iconStyle: React.CSSProperties = {
  fontSize: 42,
  marginBottom: 14,
};

const cardTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  color: "#111827",
};

const cardTextStyle: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 24,
  color: "#4b5563",
  fontSize: 15,
  lineHeight: 1.6,
};

const buttonStyle: React.CSSProperties = {
  height: 46,
  borderRadius: 12,
  border: "none",
  padding: "0 18px",
  fontSize: 15,
  cursor: "pointer",
  background: "#111827",
  color: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
};