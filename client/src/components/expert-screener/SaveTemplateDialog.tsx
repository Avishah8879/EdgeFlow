import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  useCreateUserTemplate,
  useUpdateUserTemplate,
  type UserTemplateMutationError,
} from "@/hooks/use-user-templates";
import type { ExpressionValidation } from "@/hooks/use-expression-validation";

const NAME_MAX = 120;
const DESCRIPTION_MAX = 280;

interface SaveTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expression: string;
  /** Parent's validation state (PR 1.5 hook output). Re-used here — not re-run. */
  validation: ExpressionValidation;
  /** If provided, dialog opens in "edit" mode and PATCHes instead of POSTs. */
  initial?: { id: string; name: string; description: string | null };
}

export default function SaveTemplateDialog({
  open,
  onOpenChange,
  expression,
  validation,
  initial,
}: SaveTemplateDialogProps) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serverError, setServerError] = useState<UserTemplateMutationError | null>(null);

  const createMutation = useCreateUserTemplate();
  const updateMutation = useUpdateUserTemplate();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Reset/prefill on open.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setServerError(null);
  }, [open, initial]);

  // For brand-new saves we need a valid expression. For edits where only the
  // name/description change, validation isn't re-required because the
  // expression isn't being changed here.
  const requiresValidExpression = !isEdit;
  const saveDisabled =
    !name.trim() ||
    isPending ||
    (requiresValidExpression &&
      (validation.isValidating || !validation.isValid));

  const validationErrorText =
    requiresValidExpression && validation.error ? validation.error : null;
  const validationUnknown =
    requiresValidExpression ? validation.unknownIdentifiers : [];

  async function handleSave() {
    setServerError(null);
    try {
      if (isEdit && initial) {
        await updateMutation.mutateAsync({
          id: initial.id,
          name: name.trim(),
          description: description.trim() || null,
        });
        toast.success("Template updated");
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          expression,
        });
        toast.success("Template saved");
      }
      onOpenChange(false);
    } catch (err) {
      setServerError(err as UserTemplateMutationError);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Rename template" : "Save as template"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the name or description. The expression stays the same."
              : "Give this expression a name so you can load it later."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              maxLength={NAME_MAX}
              placeholder="e.g. My Momentum Setup"
              disabled={isPending}
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground text-right">
              {name.length} / {NAME_MAX}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-description">Description (optional)</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              maxLength={DESCRIPTION_MAX}
              placeholder="What does this template look for?"
              disabled={isPending}
              rows={2}
            />
            <p className="text-[10px] text-muted-foreground text-right">
              {description.length} / {DESCRIPTION_MAX}
            </p>
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Expression
              </Label>
              <div className="rounded-md bg-muted/30 border border-border/40 p-2 text-xs font-mono break-words max-h-24 overflow-auto">
                {expression || <span className="text-muted-foreground">(empty)</span>}
              </div>
            </div>
          )}

          {validationErrorText && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {validationErrorText}
              {validationUnknown.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {validationUnknown.map((n) => (
                    <code
                      key={n}
                      className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px]"
                    >
                      {n}
                    </code>
                  ))}
                </div>
              )}
            </div>
          )}

          {validation.isOffline && !isEdit && !validationErrorText && (
            <p className="text-xs text-muted-foreground">
              Validation offline — Save will still try.
            </p>
          )}

          {serverError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {serverError.message}
              {serverError.unknownIdentifiers && serverError.unknownIdentifiers.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {serverError.unknownIdentifiers.map((n) => (
                    <code
                      key={n}
                      className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px]"
                    >
                      {n}
                    </code>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saveDisabled}>
            {isPending ? "Saving..." : isEdit ? "Save changes" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
