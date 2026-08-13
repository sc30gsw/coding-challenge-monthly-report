import { Link } from "@tanstack/react-router";
import { cn } from "cnfast";
import type { ReactNode } from "react";

type ReportLinkProps = {
  children: ReactNode;
  className?: string;
  reportId: string;
};

/**
 * 報告書詳細へのリンクです。一覧・版の履歴など、複数の feature から使います。
 *
 * Mantine の Anchor に `component={Link}` を渡すと Link の型が落ち、`params` が
 * 検査されなくなるため、Link をそのまま使います。
 */
export function ReportLink({ children, className, reportId }: ReportLinkProps) {
  return (
    <Link
      className={cn("text-blue-700 underline underline-offset-2", className)}
      params={{ reportId }}
      to="/reports/$reportId"
    >
      {children}
    </Link>
  );
}
