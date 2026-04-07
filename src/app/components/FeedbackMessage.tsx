import React from "react";

interface FeedbackMessageProps {
  message: string;
  type: "success" | "error" | null;
}

export default function FeedbackMessage({ message, type }: FeedbackMessageProps) {
  if (!message || !type) return null;

  const styles = {
    success: {
      background: "#d1fae5", // vert pâle
      color: "#065f46", // vert foncé
      border: "1px solid #a7f3d0",
    },
    error: {
      background: "#fee2e2", // rouge pâle
      color: "#991b1b", // rouge foncé
      border: "1px solid #fca5a5",
    },
  };

  return (
    <div
      style={{
        marginTop: 18,
        padding: "12px 14px",
        borderRadius: 12,
        fontSize: 14,
        ...styles[type],
      }}
    >
      {message}
    </div>
  );
}