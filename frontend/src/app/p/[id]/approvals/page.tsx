"use client";

import { Inbox } from "lucide-react";
import * as React from "react";
import { ApprovalCard, useApprovals } from "@/components/approval-card";
import { EmptyState, PageHeader, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { useProjectId } from "@/lib/project";

export default function ApprovalsPage() {
  const id = useProjectId();
  const q = useApprovals(id);
  const pending = q.data?.filter((a) => a.status === "pending") ?? [];
  const decided = q.data?.filter((a) => a.status !== "pending") ?? [];
  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Every risky change waits here, already dry-run against the real database. Nothing runs until you approve."
      />
      <Tabs defaultValue="pending">
        <TabsList className="px-fluid">
          <TabsTrigger value="pending">Pending {pending.length > 0 && `(${pending.length})`}</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        {q.isLoading && <Spinner className="m-6" />}
        <TabsContent value="pending" className="px-fluid py-fluid max-w-[56rem] space-y-3">
          {pending.length === 0 && !q.isLoading && (
            <EmptyState icon={<Inbox className="size-5" />} title="You're all caught up">
              Changes proposed by you or the copilot that need a decision show up here.
            </EmptyState>
          )}
          {pending.map((a) => (
            <ApprovalCard key={a.approval_id} approval={a} projectId={id} />
          ))}
        </TabsContent>
        <TabsContent value="history" className="px-fluid py-fluid max-w-[56rem] space-y-3">
          {decided.length === 0 && !q.isLoading && <EmptyState title="No decisions yet" />}
          {decided.map((a) => (
            <ApprovalCard key={a.approval_id} approval={a} projectId={id} defaultOpen={false} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
