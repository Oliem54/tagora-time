"use client";

import AccountAuthGate from "@/app/account/AccountAuthGate";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccountAuthGate>{children}</AccountAuthGate>;
}
