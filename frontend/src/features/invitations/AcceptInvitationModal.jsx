import { useEffect, useState } from "react";
import {
  Shield,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserCheck,
  Building,
  Mail,
  ArrowRight,
  X,
  ExternalLink,
} from "lucide-react";
import { api } from "../../services/api-client.js";

export function AcceptInvitationModal({ token, currentUser, onClose, onAccepted, onShowNotice }) {
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const [invitation, setInvitation] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function verify() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.verifyInvitation(token);
        if (mounted) {
          setInvitation(res.invitation);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || "Invalid or expired invitation token");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (token) {
      verify();
    }
    return () => {
      mounted = false;
    };
  }, [token]);

  async function handleAccept() {
    try {
      setAccepting(true);
      setError(null);
      const res = await api.acceptInvitation(token);
      if (onShowNotice) {
        onShowNotice({
          type: "success",
          message: `Successfully joined ${res.organization?.name || "the workspace"}!`,
        });
      }
      if (onAccepted) {
        onAccepted(res.organization);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  }

  const isEmailMismatch =
    currentUser &&
    invitation &&
    currentUser.email?.toLowerCase() !== invitation.email?.toLowerCase();

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
      <div className="modal-content invite-accept-modal max-w-lg">
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Shield size={22} />
            </div>
            <div>
              <h2 id="invite-modal-title" className="text-lg font-bold text-text-primary">
                Organization Invitation
              </h2>
              <p className="text-xs text-text-muted">TeamGuard Secure Access Portal</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body p-6 space-y-5">
          {loading && (
            <div className="py-8 text-center text-text-muted space-y-2">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
              <p className="text-sm">Verifying invitation credentials…</p>
            </div>
          )}

          {error && (
            <div className="view-error-container" role="alert">
              <AlertCircle size={20} className="text-destructive flex-shrink-0" />
              <div className="text-sm">
                <strong>Invitation Verification Failed:</strong>
                <p className="mt-1">{error}</p>
              </div>
            </div>
          )}

          {!loading && invitation && (
            <>
              <div className="invite-summary-card p-4 rounded-xl bg-surface-muted/50 border border-border-subtle space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Workspace
                    </span>
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2 mt-0.5">
                      <Building size={18} className="text-indigo-400" />
                      {invitation.organization?.name}
                    </h3>
                  </div>
                  <span className="badge-role-pill">
                    {invitation.role?.name || "Member"}
                  </span>
                </div>

                <div className="pt-2 border-t border-border-subtle/50 text-xs text-text-muted space-y-1">
                  <p>
                    Invited by:{" "}
                    <strong className="text-text-primary">
                      {invitation.inviter?.name || "Workspace Administrator"}
                    </strong>
                  </p>
                  <p>
                    Target email:{" "}
                    <strong className="text-text-primary">{invitation.email}</strong>
                  </p>
                  {invitation.department && (
                    <p>
                      Department:{" "}
                      <strong className="text-text-primary">{invitation.department}</strong>
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-amber-500/90 pt-1">
                    <Clock size={13} />
                    Valid until: {new Date(invitation.expiresAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {isEmailMismatch && (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs space-y-1">
                  <strong className="font-semibold flex items-center gap-1.5">
                    <AlertCircle size={15} />
                    Account Email Mismatch
                  </strong>
                  <p>
                    You are currently signed in as <strong>{currentUser.email}</strong>, but this
                    invitation was issued to <strong>{invitation.email}</strong>.
                  </p>
                  <p className="text-amber-400/80">
                    To maintain strict identity integrity, please sign in with the invited email
                    address before accepting.
                  </p>
                </div>
              )}

              {invitation.isExpired && (
                <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>This invitation has expired. Please contact the administrator to request a new link.</span>
                </div>
              )}

              {invitation.status === "REVOKED" && (
                <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>This invitation was revoked by an organization administrator.</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer flex items-center justify-end gap-3 p-4 border-t border-border-subtle">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={accepting}>
            Cancel
          </button>

          {!loading && invitation && !invitation.isExpired && invitation.status === "PENDING" && !isEmailMismatch && (
            <button
              type="button"
              className="btn-primary-emerald flex items-center gap-2"
              onClick={handleAccept}
              disabled={accepting}
            >
              {accepting ? (
                <span>Joining Workspace…</span>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Accept Invitation & Join</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
