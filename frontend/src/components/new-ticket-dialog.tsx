"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useCreateTicket } from "@/lib/queries";
import type { Ticket } from "@/lib/types";

const BODY_MAX = 4000;

const schema = z.object({
  customer_name: z.string().trim().min(1, "Customer name is required.").max(80, "Keep it under 80 characters."),
  subject: z.string().trim().min(3, "Subject needs at least 3 characters.").max(120, "Keep it under 120 characters."),
  body: z
    .string()
    .trim()
    .min(10, "Describe the issue in at least 10 characters.")
    .max(BODY_MAX, `Keep it under ${BODY_MAX} characters.`),
  triageNow: z.boolean(),
});

type FormValues = z.infer<typeof schema>;
type TicketField = Exclude<keyof FormValues, "triageNow">;

const DEFAULTS: FormValues = { customer_name: "", subject: "", body: "", triageNow: true };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ticket: Ticket, triageNow: boolean) => void;
};

export function NewTicketDialog({ open, onOpenChange, onCreated }: Props) {
  const create = useCreateTicket();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  const body = useWatch({ control, name: "body" });

  function handleOpenChange(next: boolean) {
    if (!next) reset(DEFAULTS);
    onOpenChange(next);
  }

  const onSubmit = handleSubmit(async ({ triageNow, ...payload }) => {
    try {
      const ticket = await create.mutateAsync(payload);
      toast.success(`${ticket.id} created`);
      handleOpenChange(false);
      onCreated(ticket, triageNow);
    } catch (error) {
      if (error instanceof ApiError) {
        const known = Object.entries(error.fields).filter(([field]) => field in payload);
        for (const [field, message] of known) setError(field as TicketField, { message });
        if (known.length > 0) return;
      }
      toast.error(error instanceof ApiError ? error.message : "Could not create the ticket.");
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>Write a synthetic customer ticket. It joins the inbox as new.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <Field id="customer_name" label="Customer name" error={errors.customer_name?.message}>
            <Input id="customer_name" {...errorProps("customer_name", errors.customer_name)} {...register("customer_name")} />
          </Field>
          <Field id="subject" label="Subject" error={errors.subject?.message}>
            <Input id="subject" {...errorProps("subject", errors.subject)} {...register("subject")} />
          </Field>
          <Field id="body" label="Message" error={errors.body?.message} hint={`${body.length}/${BODY_MAX}`}>
            <Textarea id="body" rows={6} {...errorProps("body", errors.body)} {...register("body")} />
          </Field>
          <Controller
            control={control}
            name="triageNow"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                Triage immediately
              </label>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function errorId(id: string) {
  return `${id}-error`;
}

function errorProps(id: TicketField, error: unknown) {
  return error ? { "aria-invalid": true, "aria-describedby": errorId(id) } : { "aria-invalid": false };
}

type FieldProps = { id: string; label: string; error?: string; hint?: string; children: ReactNode };

function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {hint && <span className="font-mono text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && (
        <p id={errorId(id)} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
