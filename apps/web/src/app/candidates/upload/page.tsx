import type { Metadata } from "next";
import { ResumeUploadForm } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Upload resume" };

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Upload a resume"
        subtitle="PDF or plain text. The file is parsed, cleaned, split into chunks and embedded. Uploading identical bytes again returns the existing candidate."
      />
      <Card>
        <ResumeUploadForm />
      </Card>
      <p className="mt-4 text-xs text-slate-500">
        Demo app without authentication: please do not upload real personal data. Scanned (image-only) PDFs are not supported.
      </p>
    </div>
  );
}
