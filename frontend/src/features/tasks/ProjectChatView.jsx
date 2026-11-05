import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, User, Hash, AlertCircle } from "lucide-react";
import { api } from "../../services/api-client.js";

export function ProjectChatView({
  project,
  user,
  onShowNotice,
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const messagesEndRef = useRef(null);

  // Initial mock or loaded messages
  useEffect(() => {
    // Staged initial discussions for project
    setMessages([
      {
        id: 1,
        author: { name: "System Bot", id: 0 },
        content: `Welcome to #${(project?.name || "general").toLowerCase().replace(/\s+/g, "-")} discussion channel! Use this channel to coordinate sprints, discuss technical specs, and ask questions.`,
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
      {
        id: 2,
        author: { name: "Alex Chen", id: 2 },
        content: "Hey team, remember that all tasks in this project follow our strict ABAC ownership rules and 15-minute comment edit windows.",
        createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      },
    ]);
  }, [project?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendMessage(e) {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    const newMsg = {
      id: Date.now(),
      author: { name: user?.name || "You", id: user?.id || 1 },
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText("");

    try {
      setSubmitting(true);
      // Attempt backend call if channel exists
      if (project?.id) {
        await api.sendChannelMessage(project.id, { content: trimmed }).catch(() => {});
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="project-chat-container flex flex-col h-[calc(100vh-210px)] max-h-[780px] bg-slate-900/60 rounded-xl border border-slate-800/80 overflow-hidden shadow-lg">
      {/* Channel Header */}
      <div className="px-6 py-3.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash size={18} className="text-indigo-400" />
          <h3 className="font-semibold text-sm text-slate-100">
            {(project?.name || "general").toLowerCase().replace(/\s+/g, "-")}
          </h3>
          <span className="text-xs text-slate-500">· Project Discussion & Activity</span>
        </div>
        <div className="text-xs text-slate-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Online</span>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg) => {
          const isCurrentUser = msg.author?.id === user?.id;
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${
                isCurrentUser ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow">
                {msg.author?.name ? msg.author.name[0] : "U"}
              </div>

              <div
                className={`max-w-[70%] rounded-xl px-4 py-2.5 text-xs ${
                  isCurrentUser
                    ? "bg-indigo-600 text-white rounded-tr-none"
                    : "bg-slate-800 border border-slate-700/60 text-slate-200 rounded-tl-none"
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="font-semibold text-[11px] opacity-90">
                    {msg.author?.name}
                  </span>
                  <span className="text-[10px] opacity-60">
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center gap-2"
      >
        <input
          type="text"
          placeholder={`Message #${(project?.name || "general").toLowerCase().replace(/\s+/g, "-")}...`}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={submitting}
          className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={submitting || !inputText.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
        >
          <span>Send</span>
          <Send size={13} />
        </button>
      </form>
    </div>
  );
}
