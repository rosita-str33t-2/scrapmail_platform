import type { Metadata } from "next";

import { TableFrame } from "@/components/app/data-table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, PageHeader, PageTabs } from "@/components/app/page-header";
import { StatusBadge, type Tone } from "@/components/app/status-badge";
import { requireAdmin, type AccountStatus } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  AddMemberDialog,
  ResetPasswordDialog,
  StatusSelect,
} from "./user-controls";

export const metadata: Metadata = { title: "User management" };

type Row = {
  user_id: string;
  email: string;
  full_name: string;
  status: AccountStatus;
  platform_role: "user" | "admin";
  created_at: string;
  password_changed_at: string | null;
};

const TONE: Record<AccountStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
  suspended: "danger",
};

const when = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

const STATUS_TABS: { value: AccountStatus | ""; label: string }[] = [
  { value: "", label: "All users" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Rejected" },
];

type Props = { searchParams: Promise<{ status?: string }> };

export default async function AdminUsersPage({ searchParams }: Props) {
  const [me, { status: statusParam }] = await Promise.all([
    requireAdmin(),
    searchParams,
  ]);
  const status = STATUS_TABS.some((t) => t.value === statusParam)
    ? (statusParam as AccountStatus)
    : "";
  const supabase = await createClient();
  const [{ data: users }, authUsers] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "user_id, email, full_name, status, platform_role, created_at, password_changed_at",
      )
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<Row[]>(),
    // Sign-in times live in Supabase Auth (server-side admin API, admins only).
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const lastSignIn = new Map(
    (authUsers.data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]),
  );
  const unconfirmed = new Set(
    (authUsers.data?.users ?? [])
      .filter((u) => !u.email_confirmed_at)
      .map((u) => u.id),
  );
  const pending = users?.filter((u) => u.status === "pending").length ?? 0;
  const countOf = (value: AccountStatus | "") =>
    value
      ? (users?.filter((u) => u.status === value).length ?? 0)
      : (users?.length ?? 0);
  const shown = status
    ? (users ?? []).filter((u) => u.status === status)
    : (users ?? []);

  return (
    <>
      <PageHeader
        title="User management"
        description={pending ? `${pending} waiting for review` : undefined}
        tabs={
          <PageTabs
            label="Account status"
            tabs={STATUS_TABS.map((t) => ({
              label: t.label,
              href: t.value ? `/admin/users?status=${t.value}` : "/admin/users",
              active: status === t.value,
              count: countOf(t.value),
            }))}
          />
        }
        actions={
          <>
            <LiveRefresh kinds={["users"]} />
            <AddMemberDialog />
          </>
        }
      />

      {!shown.length ? (
        <EmptyState
          title="No users"
          text={
            status
              ? "No accounts have this status."
              : "No accounts have registered yet."
          }
        />
      ) : (
        <TableFrame>
          <table>
            <thead>
              <tr>
                <th className="px-5">Name</th>
                <th className="px-5">Email</th>
                <th className="px-5">Registered</th>
                <th className="px-5">Last sign-in</th>
                <th className="px-5">Status</th>
                <th className="px-5">Change status</th>
                <th className="px-5">Password</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((user) => {
                const isMe = user.user_id === me.user_id;
                return (
                  <tr key={user.user_id} className="animate-in fade-in">
                    <td className="px-5 py-3 font-medium">
                      {user.full_name || "—"}
                      {user.platform_role === "admin" && (
                        <StatusBadge tone="info" className="ml-2">
                          Admin
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {user.email}
                      {unconfirmed.has(user.user_id) && (
                        <div
                          className="mt-1"
                          title="The user has not clicked the link in the confirmation email yet. Approving the account confirms it."
                        >
                          <StatusBadge tone="warning">
                            email not confirmed
                          </StatusBadge>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                      {when(lastSignIn.get(user.user_id))}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={TONE[user.status]}>
                        {user.status}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3">
                      {isMe ? (
                        <span
                          className="text-muted-foreground"
                          title="You cannot change your own status"
                        >
                          You
                        </span>
                      ) : (
                        <StatusSelect
                          key={user.status}
                          userId={user.user_id}
                          status={user.status}
                        />
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ResetPasswordDialog
                          userId={user.user_id}
                          email={user.email}
                        />
                        <span className="text-xs whitespace-nowrap text-muted-foreground">
                          {user.password_changed_at
                            ? `Changed ${when(user.password_changed_at)}`
                            : "Set by user"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
      )}
    </>
  );
}
