import type { Metadata } from "next";
import { JobForm } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Post a job" };

export default function NewJobPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Post a job" subtitle="The job is embedded on submit; posting the same job twice will not create a duplicate." />
      <Card>
        <JobForm />
      </Card>
    </div>
  );
}
