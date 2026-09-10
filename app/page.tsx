import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SetupBanner } from "@/components/setup-banner";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10">
      <SetupBanner />

      <section className="space-y-6 pt-4 text-center sm:pt-10">
        <p className="text-sm uppercase tracking-[0.25em] text-amber-500/90">
          Voice-conversion studio
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Η Φωνή Μου
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-zinc-400">
          Όχι text-to-music. Πραγματικό pipeline cover: τραγούδι → απομόνωση
          φωνής → μετατροπή στη δική σας κλωνοποιημένη φωνή → μίξη με οργανικό →
          λήψη.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/app">Ξεκίνα στο Studio</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/settings">Κατάσταση API</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            t: "1. Η φωνή μου",
            d: "Συναίνεση + καθαρά δείγματα τραγουδιού (30–180s).",
          },
          {
            t: "2. Το τραγούδι μου",
            d: "Αρχείο ή URL. Προαιρετικά ήδη acapella.",
          },
          {
            t: "3. Μετατροπή",
            d: "Demucs + zero-shot VC στο Replicate, μίξη με ffmpeg.",
          },
        ].map((x) => (
          <Card key={x.t}>
            <CardHeader>
              <CardTitle className="text-base">{x.t}</CardTitle>
              <CardDescription>{x.d}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card className="border-zinc-800">
        <CardContent className="space-y-2 p-6 text-sm text-zinc-400">
          <p>
            Απαιτείται{" "}
            <span className="text-amber-300">REPLICATE_API_TOKEN</span>. Χωρίς
            token εμφανίζεται οθόνη ρύθμισης — δεν υπάρχουν dummy ήχοι.
          </p>
          <p>
            Η ποιότητα εξαρτάται από καθαρά, στεγνά (dry) φωνητικά χωρίς
            αντήχηση. Δεν υποστηρίζουμε celebrity packs ή YouTube scrape.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
