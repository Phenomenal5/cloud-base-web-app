import { Plane } from "lucide-react";
import { HomeCta } from "@/components/HomeCta";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const Home = () => (
  <main className="relative flex flex-1 items-center justify-center px-6 py-16">
    <div className="fixed right-4 top-4 z-50">
      <ThemeToggle />
    </div>
    <div className="w-full max-w-lg text-center">
      <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <Plane className="h-7 w-7" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Nasight</h1>
      <p className="mx-auto mt-3 max-w-md text-balance text-slate-600 dark:text-slate-400">
        Ask about aviation safety in plain English. Get answers grounded in real NASA ASRS incident
        reports — with sources you can check.
      </p>
      <HomeCta />
    </div>
  </main>
);

export default Home;
