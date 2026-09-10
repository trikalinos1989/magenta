import { CoverWizard } from "@/components/wizard/cover-wizard";

export default function AppPage() {
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-3xl space-y-1">
        <h1 className="text-2xl font-semibold">Studio</h1>
        <p className="text-sm text-zinc-400">
          Οδηγός 3 βημάτων για voice-conversion cover.
        </p>
      </div>
      <CoverWizard />
    </div>
  );
}
