import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return <EmptyState title="Not found" action={<ButtonLink href="/jobs">Back to jobs</ButtonLink>}>That page, job or candidate does not exist.</EmptyState>;
}
