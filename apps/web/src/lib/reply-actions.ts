"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

/** Mark a reply as done (the team dealt with it) or open it again. */
export async function setReplyHandled(id: string, done: boolean) {
  await requireWorkspace();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_reply_handled", {
    p_id: id,
    p_done: done,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/campaigns/replies");
}
