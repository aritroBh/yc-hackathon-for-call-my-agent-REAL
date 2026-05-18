"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import {
  isValidEmail,
  signIn,
  signInWithGoogle,
} from "@/lib/auth/mock-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fadeUp, fadeUpTransition } from "@/lib/motion/presets";

export function AuthFormPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function continueWithEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    signIn({ email: email.trim(), provider: "email" });
    router.push("/");
  }

  function continueWithGoogle() {
    signInWithGoogle();
    router.push("/");
  }

  return (
    <div className="flex items-center justify-center px-6 py-16 lg:px-24">
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        transition={fadeUpTransition}
        className="w-full max-w-sm"
      >
        <h1 className="font-display text-[34px] font-semibold leading-tight text-ink">
          Your agent is ready.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Sign in to start sourcing and negotiating overseas.
        </p>

        <form onSubmit={continueWithEmail} className="mt-8 space-y-2">
          <Label htmlFor="email" className="sr-only">
            Email address
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={!!error}
            aria-describedby={error ? "email-error" : undefined}
          />
          {error && (
            <p id="email-error" className="text-xs text-status-red">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="mt-2 w-full">
            Continue with email
            <ArrowRight className="size-4" />
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3.5">
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-xs text-ink-3">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={continueWithGoogle}
        >
          <span className="flex size-[18px] items-center justify-center rounded-full bg-clay font-display text-[11px] font-bold text-white">
            G
          </span>
          Continue with Google
        </Button>

        <p className="mt-7 text-xs text-ink-3">
          By continuing you agree to our Terms and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}
