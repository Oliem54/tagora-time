import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type SecondaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export default function SecondaryButton({
  children,
  className,
  type = "button",
  ...props
}: SecondaryButtonProps) {
  return (
    <button
      type={type}
      className={cn("ui-button", "ui-button-secondary", className)}
      {...props}
    >
      {children}
    </button>
  );
}
