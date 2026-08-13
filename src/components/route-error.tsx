import type { ErrorComponentProps } from "@tanstack/react-router";

export function RouteError({ error }: ErrorComponentProps) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold text-red-600">エラー</h1>
      <p>{error.message}</p>
    </div>
  );
}
