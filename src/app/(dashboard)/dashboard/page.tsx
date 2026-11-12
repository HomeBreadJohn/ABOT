import { ArrowUpRight, FileText, ListChecks, Upload } from "lucide-react";
import Link from "next/link";

import { brand } from "@/config/brand";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { platformPreviewData } from "@/features/platform/view-data";
import { adaptPresentationValue } from "@/lib/presentation";

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
    <div className="mx-auto max-w-6xl min-w-0">
      <PageHeader
        eyebrow="Workspace"
        title={`Welcome to ${brand.name}`}
        description="This foundation is ready for document-centric workflows as the product direction becomes clearer."
      />
      <Card className="mb-6 border-slate-300 bg-slate-950 text-white">
        <CardContent className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="font-medium">Your workspace is ready.</p>
            <p className="mt-1 text-sm text-slate-300">
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
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle as="h2">Sample foundation preview</CardTitle>
            <Badge variant="neutral" cue="◇">
              {platformPreviewData.contentLabel}
            </Badge>
          </div>
          <CardDescription>
            Local presentation examples only. This is not a completed user
            analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-3">
            {platformPreviewData.items.map((item) => {
              const presentation = adaptPresentationValue(item.descriptor);
              const badgeVariant =
                presentation.tone === "positive"
                  ? "success"
                  : presentation.tone === "caution" ||
                      presentation.tone === "critical"
                    ? "warning"
                    : "neutral";

              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <dt className="text-sm font-medium text-slate-600">
                    {item.title}
                  </dt>
                  <dd className="mt-2 flex flex-wrap items-center gap-2">
                    {presentation.categoryLabel ? (
                      <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                        {presentation.categoryLabel}
                      </span>
                    ) : null}
                    <Badge variant={badgeVariant} cue={presentation.cue}>
                      {presentation.label}
                    </Badge>
                  </dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>
      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        {areas.map(({ title, description, icon: Icon, href }) => (
          <Card key={title}>
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <Icon className="h-5 w-5 text-slate-700" aria-hidden="true" />
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
