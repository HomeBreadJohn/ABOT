import { ArrowUpRight, FileText, ListChecks, Upload } from "lucide-react";
import Link from "next/link";

import { brand } from "@/config/brand";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const areas = [
  {
    title: "Documents",
    description: "Your document workspace will appear here.",
    icon: FileText,
    href: "/documents",
  },
  {
    title: "Tasks",
    description: "Follow-up actions will be organized here.",
    icon: ListChecks,
    href: "/documents",
  },
  {
    title: "Upload",
    description: "Secure document upload is ready for the next feature phase.",
    icon: Upload,
    href: "/documents",
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Welcome to ${brand.name}`}
        description="This foundation is ready for document-centric workflows as the product direction becomes clearer."
      />
      <Card className="mb-6 border-transparent bg-ink-950 text-white">
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Your workspace is ready.</p>
            <p className="mt-1 text-sm text-ink-300">
              Product workflows and AI processing will be added after
              requirements are finalized.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/documents">
              View documents{" "}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {areas.map(({ title, description, icon: Icon, href }) => (
          <Card key={title}>
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="ghost" size="sm" className="px-0">
                <Link href={href}>
                  Open {title.toLowerCase()}{" "}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
