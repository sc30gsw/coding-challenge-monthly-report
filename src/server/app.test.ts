import { treaty } from "@elysia/eden";
import { describe, expect, it } from "vite-plus/test";

import { app } from "~/server/app";

// Eden Treaty をインプロセスの実アプリに直結します。HTTP は経由しませんが、
// ルーティング・検証・ハンドラ・DB まで本物を通ります。
const api = treaty(app).api;

describe("GET /api/health", () => {
  it("データベースに到達できることを返す", async () => {
    const res = await api.health.get();

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ database: "up", status: "ok" });
  });
});

describe("OpenAPI", () => {
  it("Valibot スキーマが JSON Schema として仕様書に載る", async () => {
    const res = await app.handle(new Request("http://localhost/api/openapi/json"));
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };

    const schema = spec.paths["/api/health"]?.["get"];

    expect(res.status).toBe(200);
    // 検証と仕様書がひとつの Valibot 定義から出ていることの確認。
    expect(JSON.stringify(schema)).toContain('"const":"ok"');
  });
});
