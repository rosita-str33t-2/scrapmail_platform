"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { forgetAccount } from "@/lib/auth/account-cache";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  { ok: true; message: string } | { ok: false; error: string };

const statusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["pending", "approved", "rejected", "suspended"]),
});

/**
 * Change an account's status at any time.
 * Authorization is enforced twice: here (requireAdmin) and in the database
 * function admin_review_account (checks the caller is a platform admin).
 */
export async function setAccountStatus(
  userId: string,
  status: string,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = statusSchema.safeParse({ userId, status });
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle<{ id: string }>();

  const { error } = await supabase.rpc("admin_review_account", {
    p_user_id: parsed.data.userId,
    p_status: parsed.data.status,
    p_workspace_id:
      parsed.data.status === "approved" ? (workspace?.id ?? null) : null,
    p_role: "member",
  });
  if (error) return { ok: false, error: error.message };

  // Only approved accounts may sign in; others are blocked in Supabase Auth,
  // which also ends their active sessions. Approving also confirms the email
  // address: the administrator vouches for the account, so a confirmation
  // email that never arrived (spam, mail limits) cannot lock the user out.
  const approved = parsed.data.status === "approved";
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(
    parsed.data.userId,
    {
      ban_duration: approved ? "none" : "876000h",
      ...(approved ? { email_confirm: true } : {}),
    },
  );
  forgetAccount(parsed.data.userId);
  if (banError) return { ok: false, error: banError.message };

  revalidatePath("/admin/users");
  return { ok: true, message: `Status changed to ${parsed.data.status}.` };
}

const passwordSchema = z.object({
  userId: z.uuid(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

/** Set a new password for a user (e.g. when they forgot it). */
export async function resetUserPassword(
  userId: string,
  password: string,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = passwordSchema.safeParse({ userId, password });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: error.message };

  // Record when (not what): the password itself is never stored readable.
  await admin
    .from("profiles")
    .update({ password_changed_at: new Date().toISOString() })
    .eq("user_id", parsed.data.userId);
  revalidatePath("/admin/users");
  return {
    ok: true,
    message: "Password updated. Share it with the user securely.",
  };
}

const memberSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Please enter the name")
    .max(200, "The name is too long"),
  email: z.email("Please enter a valid email address").max(320),
  password: passwordSchema.shape.password,
});

/**
 * The administrator registers a team member directly: the account is created,
 * confirmed and approved at once and joins the workspace, so the member can sign
 * in right away. Share the password with them securely.
 */
export async function createMember(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const parsed = memberSchema.safeParse({
    ...input,
    email: input.email.trim().toLowerCase(),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }

  const admin = createAdminClient();
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName },
    });
  if (createError || !created.user) {
    return {
      ok: false,
      error: /already|registered|exists/i.test(createError?.message ?? "")
        ? "An account with this email already exists."
        : (createError?.message ?? "The account could not be created."),
    };
  }
  const userId = created.user.id;

  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .order("created_at")
    .limit(1)
    .maybeSingle<{ id: string }>();
  // Approve and add to the workspace (checked again in the database).
  const { error } = await supabase.rpc("admin_review_account", {
    p_user_id: userId,
    p_status: "approved",
    p_workspace_id: workspace?.id ?? null,
    p_role: "member",
  });
  if (error) {
    await admin.auth.admin.deleteUser(userId); // no half-created accounts
    return { ok: false, error: error.message };
  }
  await admin
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      password_changed_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `${parsed.data.fullName} can now sign in with ${parsed.data.email}.`,
  };
}
