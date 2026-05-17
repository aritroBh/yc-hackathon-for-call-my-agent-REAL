"use client";

import { useSocket } from "@/lib/socket";
import { useEffect, useRef, useState } from "react";

interface TranscriptMessage {
  role: "agent" | "supplier" | "system";
  content: string;
  timestamp: string;
}

interface Props {
  callId: string;
  initial?: TranscriptMessage[];
  height?: string;
}

export default function LiveTranscriptPanel({ callId, initial, height = "h-96" }: Props) {
  const { socket, connected } = useSocket();
  const [messages, setMessages] = useState<TranscriptMessage[]>(initial || []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!socket) return;
    const handler = (event: any) => {
      if (event.call_id !== callId) return;
      if (event.type === "transcript_delta") {
        setMessages((prev) => [
          ...prev,
          {
            role: event.data.role || "system",
            content: event.data.content || event.data.text || "",
            timestamp: event.data.timestamp || new Date().toISOString(),
          },
        ]);
      }
    };
    socket.on("live_call_event", handler);
    return () => { socket.off("live_call_event", handler); };
  }, [socket, callId]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Transcript</span>
          {connected && (
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span>{messages.length} lines</span>
          <button onClick={() => setAutoScroll(!autoScroll)} className={`hover:text-slate-300 transition-colors ${autoScroll ? "text-cyan-400" : ""}`}>
            {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          </button>
        </div>
      </div>
      <div className={`${height} overflow-y-auto p-3 space-y-1 font-mono text-xs`} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-600 italic">
            Waiting for transcript...
          </div>
        ) : (
          messages.map((msg, i) => {
            const isAgent = msg.role === "agent";
            const isSupplier = msg.role === "supplier";
            return (
              <div key={i} className={`flex gap-2 ${isAgent ? "justify-start" : isSupplier ? "justify-start" : "justify-center"}`}>
                <span className={`shrink-0 w-12 text-[10px] uppercase leading-5 ${
                  isAgent ? "text-cyan-400" : isSupplier ? "text-amber-400" : "text-slate-600"
                }`}>
                  {msg.role}
                </span>
                <span className={`leading-5 ${
                  isAgent ? "text-slate-200" : isSupplier ? "text-slate-300" : "text-slate-600 italic"
                }`}>
                  {msg.content}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
