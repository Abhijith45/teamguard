import { useState } from "react";
import { Lock, Send, X, Shield, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { api } from "../../services/api-client.js";

/**
 * ClickUp-style Self-Service Request Access Modal
 * Allows users encountering private spaces or restricted resources
 * to request privilege escalation with 1-click administrative review.
 */
export function RequestAccessModal({
  isOpen,
  onClose,
  resourceType = "SPACE",
  resourceId = null,
  resourceName = "Private Container",
  onSuccess,
}) {
  const [requestedLevel, setRequestedLevel] = useState("VIEW");
  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!resourceId) {
      setError("Target resource ID is missing.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await api.createAccessRequest({
        resourceType,
        resourceId: Number(resourceId),
        requestedLevel,
        justification: justification.trim() || undefined,
      });

      setSubmitted(true);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setSubmitted(false);
        setJustification("");
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || "Failed to submit access request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-6 text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-100">Access Request Sent!</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Your request for access has been submitted to workspace administrators for review.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">Request Access</h3>
                <p className="text-xs text-slate-400">
                  You need permission to access this {resourceType.toLowerCase()}
                </p>
              </div>
            </div>

            {/* Target Container Badge */}
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between">
              <span className="text-slate-400">Target Resource:</span>
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                {resourceName}
              </span>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Requested Level */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Requested Access Tier
              </label>
              <select
                value={requestedLevel}
                onChange={(e) => setRequestedLevel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="VIEW">VIEW (Read-only tasks and projects)</option>
                <option value="EDIT">EDIT (Create and edit tasks)</option>
                <option value="FULL">FULL (Manage container settings and members)</option>
              </select>
            </div>

            {/* Justification */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Business Justification
              </label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explain why you need access to this container (e.g., 'Working on Q4 backend features with Alex')..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> Submit Request
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
