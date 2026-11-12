import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Account and workspace preferences will be added as the product requirements are finalized."
      />
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>
            There are no configurable preferences yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            Settings are intentionally limited in this foundation release.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
