"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";

export default function TestSupabasePage() {
  const [resultat, setResultat] = useState("Chargement...");

  useEffect(() => {
    const test = async () => {
      const { data, error } = await supabase.from("test").select("*");

      console.log("DATA:", data);
      console.log("ERROR:", error);

      if (error) {
        setResultat(
          "ERREUR: " +
            error.message +
            " | code: " +
            error.code +
            " | details: " +
            (error.details || "aucun détail")
        );
      } else {
        setResultat("DATA: " + JSON.stringify(data));
      }
    };

    test();
  }, []);

  return <div>{resultat}</div>;
}