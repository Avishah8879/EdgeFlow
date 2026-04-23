import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Sparkles, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionHeader } from "@/components/SectionHeader";
import { Card } from "@/components/ui/card";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import type { ChatMessage as ChatMessageType } from "@/hooks/use-tip-tease-chat";

interface ChatInterfaceProps {
  messages: ChatMessageType[];
  onSendMessage: (message: string) => void;
  onCancel: () => void;
  onReset: () => void;
  isStreaming: boolean;
  error: string | null;
  status: string;
}

/**
 * Full chat interface - displayed after first message.
 * Shows message history with sticky input at bottom.
 */
export default function ChatInterface({
  messages,
  onSendMessage,
  onCancel,
  onReset,
  isStreaming,
  error,
  status,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <SectionHeader
            title="Equity Pro AI"
            description="AI-powered financial insights"
            size="lg"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          className="gap-2"
          disabled={isStreaming}
        >
          <RotateCcw className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      {/* Chat container */}
      <Card className="border-border">
        {/* Messages container */}
        <div className="h-[500px] overflow-y-auto p-6">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              isStreaming={message.isStreaming}
              timestamp={message.timestamp}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Error alert */}
        {error && (
          <div className="px-6 pb-2">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Status indicator */}
        {status === "connecting" && (
          <div className="px-6 pb-2">
            <p className="text-sm text-muted-foreground animate-pulse">
              Connecting to Equity Pro AI...
            </p>
          </div>
        )}

        {/* Input area */}
        <div className="p-6 border-t border-border bg-muted/30">
          <ChatInput
            onSend={onSendMessage}
            onCancel={onCancel}
            isStreaming={isStreaming}
            placeholder="Ask a follow-up question..."
            disabled={status === "connecting"}
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Equity Pro provides general information, not financial advice.
          </p>
        </div>
      </Card>
    </div>
  );
}
