type UserIdentityBadgeProps = {
  value: string;
  className?: string;
};

export default function UserIdentityBadge({
  value,
  className,
}: UserIdentityBadgeProps) {
  const classes = ["ui-user-identity-badge", className].filter(Boolean).join(" ");

  return (
    <span className={classes} title={value}>
      <span className="ui-user-identity-badge-text">{value}</span>
    </span>
  );
}
