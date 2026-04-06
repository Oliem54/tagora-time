"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

export default function DirectionLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/direction/dashboard");
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image
            src="/logo.png"
            alt="Logo Time"
            width={360}
            height={360}
            priority
          />

          <h1
            className="page-title"
            style={{
              margin: "-95px 0 0 0",
              lineHeight: 1,
              fontSize: 40,
              textAlign: "center",
            }}
          >
            Time
          </h1>

          <div
            className="page-subtitle"
            style={{
              textAlign: "center",
              marginTop: 0,
            }}
          >
            Connexion direction
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 20,
        }}
      >
        <div
          className="card"
          style={{
            width: "100%",
            maxWidth: 520,
            textAlign: "center",
          }}
        >
          <h2 className="section-title" style={{ textAlign: "center" }}>
            Se connecter
          </h2>

          <div className="spacer-16" />

          <input
            className="tagora-input"
            placeholder="Adresse courriel"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ textAlign: "center" }}
          />

          <div className="spacer-16" />

          <input
            className="tagora-input"
            placeholder="Mot de passe"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ textAlign: "center" }}
          />

          <div className="spacer-24" />

          <button
            className="tagora-btn tagora-btn-primary"
            onClick={handleLogin}
          >
            Connexion
          </button>
        </div>
      </div>
    </div>
  );
}