import * as v from "valibot";

/**
 * コメントはやりとりの記録であって、報告書の中身ではありません。
 * だから確定後も投稿できます。
 * @see docs/adr/0011-comments-outlive-confirmation.md
 */

export const CommentSchema = v.object({
  author: v.object({ id: v.string(), name: v.string(), role: v.picklist(["admin", "sales"]) }),
  body: v.string(),
  createdAt: v.string(),
  id: v.string(),
  /** null なら報告書全体へのコメントです。 */
  lineId: v.nullable(v.string()),
  /** 明細コメントのとき、どの案件に対するものかを画面で示すために持ちます。 */
  lineProjectName: v.nullable(v.string()),
});

export const CreateCommentInputSchema = v.object({
  body: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "コメントを入力してください"),
    v.maxLength(2000, "コメントは 2000 文字までです"),
  ),
  lineId: v.nullish(v.pipe(v.string(), v.uuid())),
});

export type Comment = v.InferOutput<typeof CommentSchema>;
export type CreateCommentInput = v.InferOutput<typeof CreateCommentInputSchema>;
