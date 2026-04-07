"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

export default function DirectionDocumentsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.push("/direction/login");
        return;
      }

      setEmail(userData.user.email || "");
      setLoading(false);
    };

    checkSession();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/direction/login");
  };

  if (loading) {
    return <div className="page-container">Chargement...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image
                src="/logo.png"
                alt="Logo TAGORA"
                width={180}
                height={180}
                priority
              />
            </div>

            <div style={{ color: "white" }}>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  lineHeight: 1.1,
                }}
              >
                Documents direction
              </div>

              <div
                style={{
                  marginTop: 6,
                  fontSize: 14,
                  opacity: 0.9,
                }}
              >
                Gestion et consultation des documents
              </div>
            </div>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.12)",
              padding: "10px 14px",
              borderRadius: 10,
              color: "white",
            }}
          >
            Connecté comme : {email}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div
            style={{
              fontSize: 24,
              color: "var(--tagora-blue)",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            Accès rapide
          </div>

          <div className="actions-row">
            <button
              className="tagora-btn tagora-btn-primary"
              onClick={() => router.push("/direction/dashboard")}
            >
              Retour au dashboard
            </button>

            <button
              className="tagora-btn tagora-btn-secondary"
              onClick={() => router.push("/employe/dashboard")}
            >
              Voir côté employé
            </button>
          </div>
        </div>

        <div className="card">
          <div
            style={{
              fontSize: 24,
              color: "var(--tagora-blue)",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            Session
          </div>

          <div className="muted" style={{ marginBottom: 16 }}>
            Utilisateur connecté : {email}
          </div>

          <button
            className="tagora-btn tagora-btn-danger"
            onClick={handleLogout}
          >
            Se déconnecter
          </button>
        </div>
      </div>

      <div className="spacer-24" />

      <div className="card">
        <div
          style={{
            fontSize: 24,
            color: "var(--tagora-blue)",
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Zone documents
        </div>

        <div className="muted">
          Cette page est prête visuellement. On pourra ensuite y ajouter la vraie
          liste de documents, les filtres, les téléchargements et les actions.
        </div>
      </div>
    </div>
  );
}
