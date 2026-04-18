import React from "react";

interface FeedbackMessageProps {
  message: string;
  type: "success" | "error" | null;
}

export default function FeedbackMessage({ message, type }: FeedbackMessageProps) {
  if (!message || !type) return null;

  const styles = {
    success: {
      background: "#e8f7ee",
      color: "#1f8f54",
      border: "1px solid #c9ecd5",
    },
    error: {
      background: "#fdecec",
      color: "#cf4a4a",
      border: "1px solid #f6caca",
    },
  };

  return (
    <div
      style={{
        marginTop: 18,
        padding: "12px 14px",
        borderRadius: 14,
        fontSize: 13,
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
        ...styles[type],
      }}
    >
      {message}
    </div>
  );
}
