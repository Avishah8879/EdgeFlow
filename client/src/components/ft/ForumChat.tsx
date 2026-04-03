import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Loader2, LogIn, MessageCircle, Send } from "lucide-react";
import type { ForumMessage } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const MAX_MESSAGE_LENGTH = 1000;
const QUERY_KEY = ["/api/forum/messages?limit=100"];

export function ForumChat() {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const {
    data: messages,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<ForumMessage[]>({
    queryKey: QUERY_KEY,
    refetchInterval: 3000,
    placeholderData: keepPreviousData,
    select: (raw: any) =>
      Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [],
  });

  const { mutate: postMessage, isPending: isSending, error: sendError } = useMutation<
    ForumMessage,
    Error,
    { message: string },
    { previous: ForumMessage[] | undefined }
  >({
    mutationFn: async (payload) => {
      const res = await apiRequest("POST", "/api/forum/messages", payload);
      const json = await res.json();
      return (json?.data || json) as ForumMessage;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<ForumMessage[]>(QUERY_KEY);
      if (user) {
        queryClient.setQueryData<ForumMessage[]>(QUERY_KEY, (old) => [
          ...(old ?? []),
          {
            id: `optimistic-${Date.now()}`,
            userId: user.id,
            userName: user.name ?? user.email ?? "You",
            message: payload.message,
            createdAt: new Date(),
          } as ForumMessage,
        ]);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSuccess: () => {
      setDraft("");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const orderedMessages = useMemo(() => messages ?? [], [messages]);

  useEffect(() => {
    const container = listRef.current?.parentElement;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [orderedMessages]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSending) return;
    postMessage({ message: trimmed.slice(0, MAX_MESSAGE_LENGTH) });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError && !messages?.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-card text-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="text-sm text-muted-foreground">Unable to load chat messages.</p>
        <Button size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const characterCount = draft.length;

  return (
    <div className="flex h-full flex-col bg-card text-foreground">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <div className="text-xs uppercase tracking-wide font-bold">Live Forum Chat</div>
          <Badge variant="outline" className="text-[10px]">
            {isFetching ? "Syncing" : "Live"}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => {
            void refetch();
          }}
        >
          Refresh
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div ref={listRef} className="flex flex-col gap-3 px-4 py-3">
          {orderedMessages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              No messages yet. Be the first to share an update.
            </div>
          ) : (
            orderedMessages.map((message) => {
              const isOwn = message.userId === user?.id;
              return (
                <div
                  key={message.id}
                  className={`rounded-lg border border-border/60 bg-card/60 px-3 py-2 shadow-sm ${
                    isOwn ? "border-primary/50 bg-primary/5" : ""
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {message.userName}
                      </Badge>
                      {isOwn && (
                        <span className="text-[10px] uppercase text-primary/80">You</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">{message.message}</p>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {user ? (
        <form onSubmit={handleSubmit} className="border-t border-border bg-card/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share an update with the community..."
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={isSending}
              data-testid="input-forum-message"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!draft.trim() || isSending}
              className="gap-2"
              data-testid="button-send-forum-message"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                {characterCount}/{MAX_MESSAGE_LENGTH}
              </span>
              {sendError && <span className="text-destructive">{sendError.message}</span>}
            </div>
            <span>Visible to all logged-in users</span>
          </div>
        </form>
      ) : (
        <div className="border-t border-border bg-card/60 px-4 py-3">
          <a
            href="/login"
            className="flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-primary transition-colors hover:bg-primary/10"
          >
            <LogIn className="h-4 w-4" />
            Log in to chat
          </a>
        </div>
      )}
    </div>
  );
}
