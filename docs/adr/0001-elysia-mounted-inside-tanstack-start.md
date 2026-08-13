# API 層に ElysiaJS を採用する

**決定:** HTTP API は ElysiaJS で書きます。フロントからの呼び出しは Eden Treaty、外向けの仕様書は OpenAPI とします。TanStack Start の Server Function に API を混ぜません。

## なぜ

クライアントへ型安全な RPC を提供でき、同時に API 仕様書を出せるためです。Start の Server Function とは切り離して管理できるので、API とクライアントの境界がコード上でもはっきりします。境界が曖昧だと「この遷移拒否は loader 側か、API 側か」の調査が毎回発生します。Elysia に寄せることで、管理コストと調査コストを下げられると判断しました。

Eden / OpenAPI / Valibot の役割分担は [0013](./0013-eden-treaty-with-openapi.md) をご参照ください。

## 採らなかった案

- **TanStack Start の Server Function のみ** — 画面と API が同じ入口になり、契約（OpenAPI）も型共有（Eden）も自前になります。境界が消えるため見送りました。
- **Express 等の別 FW** — 動きますが、Eden 相当の型共有と OpenAPI を別ライブラリで組むことになるため見送りました。

## 影響（配置）

採用したあとの置き方として、独立プロセスにはしません。TanStack Start の `src/routes/api.$.ts` から `app.fetch(request)` を渡し、起動は `vp dev` 一つにします。`.listen()` を呼ばないため `@elysiajs/node` は不要です。別プロセスにすると採点者の起動が 2 コマンドになりますが、それは配置の話であって、Elysia を選んだ理由ではありません。
