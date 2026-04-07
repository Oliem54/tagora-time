type AccessNoticeProps = {
  title?: string;
  description: string;
};

export default function AccessNotice({
  title = "Acces limite",
  description,
}: AccessNoticeProps) {
  return (
    <div className="tagora-panel">
      <h2 className="section-title" style={{ marginBottom: 10 }}>
        {title}
      </h2>
      <p className="tagora-note">{description}</p>
    </div>
  );
}
