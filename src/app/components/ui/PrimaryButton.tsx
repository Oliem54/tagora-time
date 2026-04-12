import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export default function PrimaryButton({
  children,
  className,
  type = "button",
  ...props
}: PrimaryButtonProps) {
  return (
    <button type={type} className={cn("ui-button", "ui-button-primary", className)} {...props}>
      {children}
    </button>
  );
}
