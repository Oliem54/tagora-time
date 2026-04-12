import type { ComponentProps } from "react";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";

type HeaderTagoraProps = ComponentProps<typeof AuthenticatedPageHeader>;

export default function HeaderTagora({
  title,
  subtitle,
  actions,
  compact,
  showUserIdentity,
}: HeaderTagoraProps) {
  return (
    <AuthenticatedPageHeader
      title={title}
      subtitle={subtitle}
      actions={actions}
      compact={compact}
      showUserIdentity={showUserIdentity}
      className="tagora-header"
    />
  );
}
