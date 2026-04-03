import { useRef, useState, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api-config";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface TipTeaseSummary {
  summary: string;
  hint: string | null;
  market_status: string;
  is_market_open: boolean;
}

type ConnectionStatus = "idle" | "connecting" | "connected" | "streaming" | "disconnected" | "error";

interface UseTipTeaseChatReturn {
  messages: ChatMessage[];
  status: ConnectionStatus;
  error: string | null;
  isStreaming: boolean;
  sendMessage: (message: string, context?: string) => Promise<void>;
  cancelStream: () => void;
  reset: () => void;
  summary: TipTeaseSummary | null;
  fetchSummary: () => Promise<void>;
}

/**
 * Hook for TipHub AI chat with SSE streaming support.
 *
 * Features:
 * - Real-time streaming responses (typewriter effect)
 * - Message history management
 * - Today's summary and contextual hints
 * - Stream cancellation
 */
export function useTipTeaseChat(): UseTipTeaseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [summary, setSummary] = useState<TipTeaseSummary | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const currentAssistantMessageIdRef = useRef<string | null>(null);
  const baseUrl = getApiBaseUrl();

  /**
   * Fetch today's market summary and contextual hint.
   */
  const fetchSummary = useCallback(async () => {
    try {
      const response = await fetch(`${baseUrl}/api/tip-tease/summary`);
      if (response.ok) {
        const envelope = await response.json();
        setSummary(envelope.data ?? envelope);
      }
    } catch (err) {
      console.error("[TipHub] Failed to fetch summary:", err);
    }
  }, [baseUrl]);

  /**
   * Clean up any active stream.
   */
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    streamIdRef.current = null;
    currentAssistantMessageIdRef.current = null;
    setIsStreaming(false);
  }, []);

  /**
   * Cancel the current stream.
   */
  const cancelStream = useCallback(async () => {
    const streamId = streamIdRef.current;
    if (streamId) {
      try {
        await fetch(`${baseUrl}/api/tip-tease/cancel/${streamId}`, {
          method: "POST",
        });
      } catch (err) {
        console.error("[TipHub] Failed to cancel stream:", err);
      }
    }
    cleanup();
    setStatus("idle");
  }, [baseUrl, cleanup]);

  /**
   * Reset the chat (clear all messages).
   */
  const reset = useCallback(() => {
    cleanup();
    setMessages([]);
    setError(null);
    setStatus("idle");
  }, [cleanup]);

  /**
   * Send a message and stream the response.
   */
  const sendMessage = useCallback(
    async (message: string, context?: string) => {
      if (!message.trim()) return;

      // Reset error state
      setError(null);

      // Add user message
      const userMessageId = `user-${Date.now()}`;
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: message.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Prepare history for API (last 10 messages)
      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        setStatus("connecting");
        setIsStreaming(true);

        // Start the chat stream
        const startResponse = await fetch(`${baseUrl}/api/tip-tease/chat/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: message.trim(),
            context,
            history,
          }),
        });

        if (!startResponse.ok) {
          const errorData = await startResponse.json().catch(() => ({}));
          throw new Error(errorData.detail || `HTTP ${startResponse.status}`);
        }

        const responseData = await startResponse.json();
        const stream_id = responseData.data?.stream_id ?? responseData.stream_id;
        streamIdRef.current = stream_id;

        // Create assistant message placeholder
        const assistantMessageId = `assistant-${Date.now()}`;
        currentAssistantMessageIdRef.current = assistantMessageId;
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          timestamp: new Date(),
          isStreaming: true,
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Connect to SSE stream
        const eventSource = new EventSource(`${baseUrl}/api/tip-tease/stream/${stream_id}`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case "connected":
                setStatus("connected");
                break;

              case "chunk":
                // Append chunk to assistant message
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + data.content }
                      : m
                  )
                );
                setStatus("streaming");
                break;

              case "complete":
                // Mark message as complete
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: data.content, isStreaming: false }
                      : m
                  )
                );
                cleanup();
                setStatus("idle");
                break;

              case "error":
                setError(data.error);
                // Remove the empty assistant message
                setMessages((prev) =>
                  prev.filter((m) => m.id !== assistantMessageId || m.content.length > 0)
                );
                cleanup();
                setStatus("error");
                break;
            }
          } catch (parseError) {
            console.error("[TipHub] Failed to parse SSE event:", parseError);
          }
        };

        eventSource.onerror = () => {
          // Check if we have content (might be normal close)
          setMessages((prev) => {
            const assistantMsg = prev.find((m) => m.id === assistantMessageId);
            if (assistantMsg && assistantMsg.content.length > 0) {
              // Mark as complete if we have content
              return prev.map((m) =>
                m.id === assistantMessageId ? { ...m, isStreaming: false } : m
              );
            }
            return prev;
          });

          cleanup();
          setStatus("disconnected");
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to send message";
        setError(errorMessage);
        setStatus("error");
        setIsStreaming(false);
        console.error("[TipHub] Send message error:", err);
      }
    },
    [baseUrl, messages, cleanup]
  );

  return {
    messages,
    status,
    error,
    isStreaming,
    sendMessage,
    cancelStream,
    reset,
    summary,
    fetchSummary,
  };
}
