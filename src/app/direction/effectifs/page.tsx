import type { Metadata } from "next";
import DirectionEffectifsClient from "./DirectionEffectifsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Calendrier des effectifs",
  description: "Planification et couverture des équipes par département.",
};

export default function DirectionEffectifsPage() {
  return <DirectionEffectifsClient />;
}
