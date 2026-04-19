import type { ComponentProps } from "react";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";

type HeaderTagoraProps = ComponentProps<typeof AuthenticatedPageHeader>;

export default function HeaderTagora({
  title,
  actions,
  compact,
  showUserIdentity,
  showNavigation,
}: HeaderTagoraProps) {
  return (
    <AuthenticatedPageHeader
      title={title}
      subtitle={undefined}
      actions={actions}
      compact={compact ?? true}
      showUserIdentity={showUserIdentity}
      showNavigation={showNavigation ?? false}
      className="tagora-header"
    />
  );
}
