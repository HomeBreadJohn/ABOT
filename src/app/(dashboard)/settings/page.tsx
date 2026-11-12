import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PreferredLanguageSettings } from "@/features/profile/components/preferred-language-settings";
import { getCurrentProfile } from "@/features/profile/services/profile-service";
import { DEFAULT_PREFERRED_LANGUAGE } from "@/features/profile/types";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  const initialLanguage =
    profile?.preferredLanguage ?? DEFAULT_PREFERRED_LANGUAGE;

  return (
    <div className="mx-auto max-w-4xl min-w-0">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Choose the language you prefer for future document explanations."
      />
      <Card>
        <CardHeader>
          <CardTitle as="h2">Preferences</CardTitle>
          <CardDescription>
            Your preferred language is saved to your profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PreferredLanguageSettings initialLanguage={initialLanguage} />
        </CardContent>
      </Card>
    </div>
  );
}
