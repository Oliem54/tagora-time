interface FeedbackMessageProps {
  message: string;
  type: "success" | "error" | null;
}

export default function FeedbackMessage({ message, type }: FeedbackMessageProps) {
  if (!message || !type) return null;

  const tone = type === "success" ? "success" : "danger";

  return (
    <div className={`horora-state horora-state--${tone}`} role="status">
      <p className="horora-state-body">{message}</p>
    </div>
  );
}
