"use client";

import { Shell } from "./_proto/shell";
import { StoreProvider, useStore } from "./_proto/store";
import { CorrectScreen } from "./_proto/screens/correct";
import { CrossScreen } from "./_proto/screens/cross";
import { HomeScreen } from "./_proto/screens/home";
import { ProcessingScreen } from "./_proto/screens/processing";
import { RemindersScreen } from "./_proto/screens/reminders";
import { ReportScreen } from "./_proto/screens/report";
import { SettingsScreen } from "./_proto/screens/settings";
import { UploadScreen } from "./_proto/screens/upload";
import { VaultScreen } from "./_proto/screens/vault";

function Router() {
  const { route } = useStore().state;
  switch (route.name) {
    case "home":
      return <HomeScreen />;
    case "upload":
      return <UploadScreen />;
    case "processing":
      return <ProcessingScreen key={route.id} id={route.id} />;
    case "report":
      return <ReportScreen key={route.id} id={route.id} tab={route.tab} focus={route.focus} />;
    case "correct":
      return <CorrectScreen key={route.reviewId} id={route.id} reviewId={route.reviewId} />;
    case "vault":
      return <VaultScreen />;
    case "cross":
      return <CrossScreen ids={route.ids} />;
    case "reminders":
      return <RemindersScreen />;
    case "settings":
      return <SettingsScreen />;
  }
}

export default function PrototypePage() {
  return (
    <StoreProvider>
      <Shell>
        <Router />
      </Shell>
    </StoreProvider>
  );
}
