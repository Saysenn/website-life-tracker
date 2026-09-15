"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";
import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm({ next }) {
  const [state, action, pending] = useActionState(login, undefined);
  const [visible, setVisible] = useState(false);

  return (
    <form action={action} className="grid gap-4 rounded-2xl bg-surface p-6 shadow-card sm:p-7">
      <input type="hidden" name="next" value={next} />
      <Field label="Username" htmlFor="username">
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state?.username ?? ""}
          required
          autoFocus
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            {visible ? <EyeOff className="size-[1.4rem]" /> : <Eye className="size-[1.4rem]" />}
          </button>
        </div>
      </Field>
      {state?.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger animate-pop">
          {state.error}
        </p>
      )}
      <Button type="submit" pending={pending} className="mt-1 w-full">
        {pending ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}
