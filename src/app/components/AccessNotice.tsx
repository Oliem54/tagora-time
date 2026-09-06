import HororaStateBanner from "@/app/components/horora/HororaStateBanner";

type AccessNoticeProps = {
  title?: string;
  description: string;
};

export default function AccessNotice({
  title = "Accès limité",
  description,
}: AccessNoticeProps) {
  return (
    <HororaStateBanner tone="warning" title={title}>
      {description}
    </HororaStateBanner>
  );
}
