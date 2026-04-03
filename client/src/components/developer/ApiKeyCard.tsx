import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  MoreVertical,
  Copy,
  RotateCcw,
  Trash2,
  Check,
  Key,
  Globe,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { ApiKey } from "@/hooks/use-api-keys";
import { useRevealKey } from "@/hooks/use-api-keys";
import { formatDistanceToNow } from "date-fns";

interface ApiKeyCardProps {
  apiKey: ApiKey;
  onRevoke: (keyId: string) => void;
  onRotate: (keyId: string) => void;
  isRevoking?: boolean;
  isRotating?: boolean;
}

export function ApiKeyCard({
  apiKey,
  onRevoke,
  onRotate,
  isRevoking,
  isRotating,
}: ApiKeyCardProps) {
  const [copied, setCopied] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showRotateDialog, setShowRotateDialog] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const revealMutation = useRevealKey();

  const isRevoked = !!apiKey.revokedAt;
  const isExpired = apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date();
  const isInactive = !apiKey.isActive;
  const isDisabled = isRevoked || !!isExpired || isInactive;

  // Clear auto-hide timer on unmount
  useEffect(() => () => { clearTimeout(hideTimerRef.current); }, []);

  const hideKey = useCallback(() => {
    setRevealedKey(null);
    clearTimeout(hideTimerRef.current);
  }, []);

  const toggleReveal = async () => {
    if (revealedKey) {
      hideKey();
      return;
    }
    try {
      const result = await revealMutation.mutateAsync(apiKey.id);
      setRevealedKey(result.key);
      // Auto-hide after 30 seconds
      hideTimerRef.current = setTimeout(hideKey, 30_000);
    } catch (err: any) {
      toast.error(err.message || "Failed to reveal key");
    }
  };

  const copyKey = async () => {
    const text = revealedKey || apiKey.keyPrefix + "...";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(revealedKey ? "Full key copied" : "Key prefix copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const statusBadge = () => {
    if (isRevoked)
      return <Badge variant="destructive">Revoked</Badge>;
    if (isExpired)
      return <Badge variant="destructive">Expired</Badge>;
    if (isInactive)
      return <Badge variant="secondary">Inactive</Badge>;
    return <Badge className="bg-positive/15 text-positive border-positive/30">Active</Badge>;
  };

  return (
    <>
      <Card className={isDisabled ? "opacity-60" : ""}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{apiKey.name}</span>
                {statusBadge()}
                <Badge variant="outline" className="text-xs">
                  {apiKey.tier}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded max-w-[320px] truncate select-all">
                  {revealedKey || `${apiKey.keyPrefix}...`}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={copyKey}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-positive" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                {!isDisabled && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={toggleReveal}
                    disabled={revealMutation.isPending}
                    title={revealedKey ? "Hide key" : "Reveal full key"}
                  >
                    {revealMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : revealedKey ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span>
                  Created{" "}
                  {formatDistanceToNow(new Date(apiKey.createdAt), {
                    addSuffix: true,
                  })}
                </span>
                {apiKey.lastUsedAt && (
                  <span>
                    Last used{" "}
                    {formatDistanceToNow(new Date(apiKey.lastUsedAt), {
                      addSuffix: true,
                    })}
                  </span>
                )}
                {apiKey.allowedOrigins.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {apiKey.allowedOrigins.length} origin
                    {apiKey.allowedOrigins.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            {!isDisabled && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowRotateDialog(true)}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Rotate Key
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setShowRevokeDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Revoke Key
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke the key{" "}
              <strong>{apiKey.name}</strong> ({apiKey.keyPrefix}...). Any
              applications using this key will stop working immediately. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onRevoke(apiKey.id)}
              disabled={isRevoking}
            >
              {isRevoking ? "Revoking..." : "Revoke Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRotateDialog} onOpenChange={setShowRotateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate a new key for{" "}
              <strong>{apiKey.name}</strong> and revoke the current one. You'll
              need to update your applications with the new key.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onRotate(apiKey.id)}
              disabled={isRotating}
            >
              {isRotating ? "Rotating..." : "Rotate Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
