import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bookmark, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useUserTemplates,
  useDeleteUserTemplate,
  type ScreenerType,
  type UserScreenerTemplate,
} from "@/hooks/use-user-templates";

interface MyTemplatesProps {
  /** Which screener's templates to list — Expert or Fundamental. */
  screenerType: ScreenerType;
  /** Called when the user clicks Load on a saved card. */
  onLoad: (expression: string) => void;
  /** Called when the user clicks Rename. Parent owns the SaveTemplateDialog. */
  onRename: (template: UserScreenerTemplate) => void;
  disabled?: boolean;
}

export default function MyTemplates({
  screenerType,
  onLoad,
  onRename,
  disabled = false,
}: MyTemplatesProps) {
  const { data: templates, isLoading, error } = useUserTemplates(screenerType);
  const deleteMutation = useDeleteUserTemplate(screenerType);
  const [confirmDelete, setConfirmDelete] = useState<UserScreenerTemplate | null>(null);

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteMutation.mutateAsync(confirmDelete.id);
      toast.success("Template deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete template");
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">My Templates</h2>
        <p className="text-sm text-muted-foreground">
          Expressions you&apos;ve saved
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border/40 bg-muted/20 h-32 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Failed to load your templates. Try refreshing.
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/10 px-6 py-10 text-center">
          <Bookmark className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No saved templates yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Build an expression and click <span className="font-medium">Save as Template</span> to keep it.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-primary" />
                  {template.name}
                </CardTitle>
                {template.description && (
                  <CardDescription className="text-xs mt-1">
                    {template.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col gap-3">
                <div className="p-2 bg-accent text-accent-foreground rounded text-xs font-mono break-words flex-1">
                  {template.expression}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onLoad(template.expression)}
                    disabled={disabled}
                    className="flex-1"
                  >
                    Load
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onRename(template)}
                    disabled={disabled}
                    aria-label="Rename"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(template)}
                    disabled={disabled}
                    aria-label="Delete"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(next) => !next && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete ? `"${confirmDelete.name}" will be removed permanently.` : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
