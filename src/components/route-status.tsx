import type { ErrorComponentProps } from "@tanstack/react-router";

type RouteStatusProps =
  | { kind: "not-found" }
  | { kind: "pending" }
  | { error: ErrorComponentProps["error"]; kind: "error" };

export function RouteStatus(props: RouteStatusProps) {
  switch (props.kind) {
    case "not-found":
      return (
        <div className="p-4">
          <h1 className="text-2xl font-semibold">404</h1>
          <p>ページが見つかりませんでした。</p>
        </div>
      );
    case "error":
      return (
        <div className="p-4">
          <h1 className="text-2xl font-semibold text-red-600">エラー</h1>
          <p>{props.error.message}</p>
        </div>
      );
    case "pending":
      return (
        <div className="p-4">
          <p>読み込み中...</p>
        </div>
      );
    default: {
      const _exhaustive: never = props;
      return _exhaustive;
    }
  }
}
