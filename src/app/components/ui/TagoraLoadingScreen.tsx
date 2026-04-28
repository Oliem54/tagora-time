"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type TagoraLoadingScreenProps = {
  isLoading: boolean;
  progress?: number;
  message?: string;
  fullScreen?: boolean;
};

const SHOW_DELAY_MS = 300;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function TagoraLoadingScreen({
  isLoading,
  progress,
  message = "Chargement de votre espace...",
  fullScreen = true,
}: TagoraLoadingScreenProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [simulatedProgress, setSimulatedProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  const controlled = typeof progress === "number";

  useEffect(() => {
    if (isLoading) {
      setIsExiting(false);
      const timer = window.setTimeout(() => {
        setIsVisible(true);
      }, SHOW_DELAY_MS);
      return () => window.clearTimeout(timer);
    }

    if (!isVisible) return;
    setIsExiting(true);
    const hideTimer = window.setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      setSimulatedProgress(0);
    }, 280);
    return () => window.clearTimeout(hideTimer);
  }, [isLoading, isVisible]);

  useEffect(() => {
    if (!isVisible || !isLoading || controlled) return;
    const interval = window.setInterval(() => {
      setSimulatedProgress((current) => {
        if (current < 70) return clamp(current + 3.2, 0, 70);
        if (current < 90) return clamp(current + 0.8, 0, 90);
        return current;
      });
    }, 90);
    return () => window.clearInterval(interval);
  }, [isVisible, isLoading, controlled]);

  const effectiveProgress = useMemo(() => {
    if (controlled) return clamp(progress ?? 0, 0, 100);
    if (!isLoading && isVisible) return 100;
    return simulatedProgress;
  }, [controlled, progress, simulatedProgress, isLoading, isVisible]);

  if (!isVisible && !isExiting) return null;

  return (
    <div
      className={`tagora-loading-overlay ${fullScreen ? "is-fullscreen" : ""} ${isExiting ? "is-exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Chargement de TAGORA"
    >
      <div className="tagora-loading-card">
        <div className="tagora-loading-logo-shell">
          <Image
            src="/logo.png"
            alt="TAGORA"
            width={260}
            height={260}
            priority
            className="tagora-loading-logo"
          />
        </div>
        <div className="tagora-loading-progress-track">
          <div
            className="tagora-loading-progress-bar"
            style={{ width: `${effectiveProgress}%` }}
          />
        </div>
        <p className="tagora-loading-message">{message}</p>
      </div>
    </div>
  );
}
