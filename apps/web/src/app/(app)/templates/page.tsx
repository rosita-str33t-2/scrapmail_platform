import type { Metadata } from "next";

import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { TemplateManager } from "@/components/app/template-manager";
import { requireWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Templates" };

type Row = {
  id: string;
  name: string;
  subject: string | null;
  body_html: string;
  updated_at: string;
};

/** Reply templates the whole team uses in conversations. */
export default async function TemplatesPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();
  const { data } = await supabase
    .from("reply_templates")
    .select("id, name, subject, body_html, updated_at")
    .eq("workspace_id", workspaceId)
    .order("name")
    .returns<Row[]>();

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable replies for the whole team"
        actions={<LiveRefresh kinds={["templates"]} />}
      />
      <TemplateManager templates={data ?? []} />
    </>
  );
}
