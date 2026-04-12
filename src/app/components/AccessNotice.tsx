import SectionCard from "@/app/components/ui/SectionCard";

type AccessNoticeProps = {
  title?: string;
  description: string;
};

export default function AccessNotice({
  title = "Acces limite",
  description,
}: AccessNoticeProps) {
  return (
    <SectionCard title={title} subtitle={description} tone="muted" />
  );
}
