"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { plural } from "@/lib/utils";
import { firstErrors, groupSchema } from "@/lib/validation";

function GroupForm({ state, options, memberCount, onClose, onSubmit }) {
  const { group, draft } = state;
  const [values, setValues] = useState(
    () =>
      draft ?? {
        name: group?.name ?? "",
        paymentType: group?.paymentType ?? "",
        paymentMethod: group?.paymentMethod ?? "",
        applyToCompanies: false,
      },
  );
  const [errors, setErrors] = useState(() => state.errors ?? {});
  const paymentChanged =
    group && (values.paymentType !== (group.paymentType ?? "") || values.paymentMethod !== (group.paymentMethod ?? ""));

  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  function submit(event) {
    event.preventDefault();
    const parsed = groupSchema.safeParse(values);
    if (!parsed.success) return setErrors(firstErrors(parsed.error));
    const taken = options.groups.some(
      (item) => item.id !== group?.id && item.name.toLowerCase() === parsed.data.name.toLowerCase(),
    );
    if (taken) return setErrors({ name: "That group already exists" });
    onSubmit(group, { ...values, applyToCompanies: Boolean(paymentChanged && values.applyToCompanies) });
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      <Field label="Group name" htmlFor="group-name" error={errors.name}>
        <Input
          id="group-name"
          value={values.name}
          onChange={(event) => update("name", event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          placeholder="Client websites"
          autoComplete="off"
          autoFocus
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Default payment type" htmlFor="group-payment-type">
          <Combobox
            id="group-payment-type"
            value={values.paymentType}
            onChange={(value) => update("paymentType", value)}
            options={options.paymentTypes}
            placeholder="Select type"
          />
        </Field>
        <Field label="Default payment method" htmlFor="group-payment-method">
          <Combobox
            id="group-payment-method"
            value={values.paymentMethod}
            onChange={(value) => update("paymentMethod", value)}
            options={options.paymentMethods}
            placeholder="Select method"
          />
        </Field>
      </div>
      {paymentChanged && memberCount > 0 && (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-sunken px-3 py-2.5 text-sm text-ink-2 animate-pop">
          <input
            type="checkbox"
            checked={values.applyToCompanies}
            onChange={(event) => update("applyToCompanies", event.target.checked)}
            className="size-[1.4rem] accent-ink"
          />
          Also apply to the {plural(memberCount, "company", "companies")} in this group
        </label>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="soft" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{group ? "Save group" : "Create group"}</Button>
      </div>
    </form>
  );
}

export function GroupDialog({ state, options, memberCount, onClose, onSubmit }) {
  return (
    <Dialog
      open={Boolean(state)}
      onOpenChange={(open) => !open && onClose()}
      title={state?.group ? "Edit group" : "New group"}
      description="New companies in this group start with its default payment."
    >
      {state && (
        <GroupForm
          key={state.group?.id ?? "new"}
          state={state}
          options={options}
          memberCount={memberCount}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  );
}
