"use client";
// Horloge + date de l'accueil (coin haut droit). Heure vive (mise à jour à la
// minute), date en mono uppercase à l'anglaise façon "SUNDAY, JULY 12 2026".
// Rendu uniquement côté client : on démarre à null pour éviter tout mismatch
// d'hydratation (le serveur ne connaît pas l'heure locale du navigateur).
import { useEffect, useState } from "react";

function format(d: Date): { time: string; date: string } {
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const date = `${weekday}, ${month} ${d.getDate()} ${d.getFullYear()}`.toUpperCase();
  return { time, date };
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Premier tick via setTimeout(0) plutôt qu'un setState synchrone dans le
    // corps de l'effet (règle react-hooks/set-state-in-effect) — l'horloge
    // s'affiche quasi instantanément, puis se rafraîchit à la minute.
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000 * 20);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  if (!now) return <div className="clock" aria-hidden />;
  const { time, date } = format(now);
  return (
    <div className="clock">
      <div className="clock-mark">OCTOPUS</div>
      <div className="clock-time">{time}</div>
      <div className="clock-date">{date}</div>
    </div>
  );
}
