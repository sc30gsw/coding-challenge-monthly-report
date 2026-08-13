import type { CreateCommentInput } from "~/features/comments/schemas/comment-schema";
import { getApi } from "~/lib/api/client";
import { toResult } from "~/lib/api/result";

export async function fetchComments(reportId: string) {
  return toResult(await getApi().reports({ reportId }).comments.get());
}

export async function postComment(reportId: string, input: CreateCommentInput) {
  return toResult(await getApi().reports({ reportId }).comments.post(input));
}
