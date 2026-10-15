import { useState } from "react";
import { ArrowRight, LockKeyhole, Sparkles, UserCheck } from "lucide-react";
import { api, setAccessToken } from "../../services/api-client.js";
import { Brand } from "../../components/Brand.jsx";

const DEMO_ACCOUNTS = [
  { label: "Super Admin", email: "admin@teamguard.io", role: "Super Admin" },
  { label: "Project Manager", email: "manager@teamguard.io", role: "Project Manager" },
  { label: "Team Member", email: "member@teamguard.io", role: "Team Member" },
  { label: "Stakeholder", email: "viewer@teamguard.io", role: "Stakeholder" },
];

export function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState({
    name: "",
    username: "",
    email: "",
    identifier: "admin@teamguard.io",
    password: "Password123!",
  });

  const change = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));

  function quickFill(email) {
    setValues((prev) => ({
      ...prev,
      identifier: email,
      password: "Password123!",
    }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = mode === "login"
        ? await api.login({ identifier: values.identifier, password: values.password })
        : await api.register({
            name: values.name,
            username: values.username,
            email: values.email,
            password: values.password,
          });
      setAccessToken(session.accessToken);
      onAuthenticated(session.user);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <Brand size={34} />
        <div className="auth-aside-content">
          <span className="eyebrow eyebrow-light">TEAMGUARD RBAC / 01</span>
          <h1>Every access decision, securely enforced.</h1>
          <div className="auth-equation">
            <span>user</span>
            <b>+</b>
            <span>tenant</span>
            <b>+</b>
            <span>role</span>
            <b>+</b>
            <span>policy</span>
            <ArrowRight size={17} />
          </div>
          <p>
            Experience multi-tenant role-based access control, resource-level ABAC policies, and live permission matrix administration.
          </p>
        </div>
        <div className="auth-aside-footer">
          <span>TEAMGUARD MULTI-TENANT RBAC</span>
          <span>EST. 2026</span>
        </div>
        <div className="auth-grid-pattern" />
      </aside>

      <section className="auth-main">
        <div className="auth-mobile-brand"><Brand /></div>
        <div className="auth-form-wrap">
          <span className="eyebrow">ENTERPRISE ACCESS</span>
          <h2>{mode === "login" ? "Welcome back" : "Create your workspace"}</h2>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Sign in with your workspace credentials or use a 1-click demo persona."
              : "Register to get a new organization workspace with Super Admin privileges."}
          </p>

          {/* Demo 1-click accounts banner */}
          {mode === "login" && (
            <div className="demo-accounts-box">
              <div className="demo-accounts-title">
                <Sparkles size={14} className="text-emerald" />
                <span>Quick Fill Demo Personas:</span>
              </div>
              <div className="demo-accounts-chips">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    className={`demo-chip ${values.identifier === acc.email ? "active" : ""}`}
                    onClick={() => quickFill(acc.email)}
                  >
                    <strong>{acc.label}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              className={mode === "login" ? "selected" : ""}
              onClick={() => { setMode("login"); setError(""); }}
              role="tab"
              aria-selected={mode === "login"}
            >
              Sign in
            </button>
            <button
              className={mode === "register" ? "selected" : ""}
              onClick={() => { setMode("register"); setError(""); }}
              role="tab"
              aria-selected={mode === "register"}
            >
              Create workspace
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <>
                <label>
                  Full name
                  <input
                    name="name"
                    value={values.name}
                    onChange={change}
                    autoComplete="name"
                    minLength="2"
                    maxLength="80"
                    placeholder="e.g. Elena Rostova"
                    required
                  />
                </label>
                <label>
                  Username
                  <input
                    name="username"
                    value={values.username}
                    onChange={change}
                    autoComplete="username"
                    minLength="3"
                    maxLength="32"
                    pattern="[A-Za-z0-9_]+"
                    placeholder="e.g. elenar"
                    required
                  />
                </label>
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    value={values.email}
                    onChange={change}
                    autoComplete="email"
                    placeholder="e.g. elena@company.com"
                    required
                  />
                </label>
              </>
            )}

            {mode === "login" && (
              <label>
                Username or email
                <input
                  name="identifier"
                  value={values.identifier}
                  onChange={change}
                  autoComplete="username"
                  required
                />
              </label>
            )}

            <label>
              Password
              <input
                name="password"
                type="password"
                value={values.password}
                onChange={change}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : 1}
                maxLength="72"
                required
              />
              {mode === "register" && <small>Use at least 8 characters (max 72 UTF-8 bytes).</small>}
            </label>

            {error && <div className="form-error" role="alert">{error}</div>}

            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create workspace"}
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="auth-security-note">
            <LockKeyhole size={14} />
            <span>Protected with JWT access &amp; HttpOnly refresh sessions</span>
          </div>
        </div>

        <div className="auth-main-footer">
          TEAMGUARD <span>·</span> MULTI-TENANT ACCESS ENGINE
        </div>
      </section>
    </main>
  );
}
