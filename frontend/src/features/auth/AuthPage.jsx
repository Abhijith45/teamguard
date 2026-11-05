import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  PlayCircle,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  Layers,
  FileCheck2,
  User,
  Info,
  Loader2,
} from "lucide-react";
import { api, setAccessToken } from "../../services/api-client.js";
import { Brand } from "../../components/Brand.jsx";

const DEMO_ACCOUNTS = [
  {
    key: "admin",
    label: "Super Admin",
    email: "admin@teamguard.io",
    role: "Super Admin",
    desc: "Full access to manage teams, roles, and projects.",
    badge: "Full Access",
  },
  {
    key: "manager",
    label: "Project Manager",
    email: "manager@teamguard.io",
    role: "Project Manager",
    desc: "Manage assigned projects, tasks, and team members.",
    badge: "Manager",
  },
  {
    key: "member",
    label: "Team Member",
    email: "member@teamguard.io",
    role: "Team Member",
    desc: "Work on tasks assigned directly to you.",
    badge: "Member",
  },
  {
    key: "viewer",
    label: "Stakeholder",
    email: "viewer@teamguard.io",
    role: "Stakeholder",
    desc: "Review projects and view activity logs.",
    badge: "View Only",
  },
];

/**
 * Validates individual input fields against backend and business rules.
 */
function validateField(fieldName, value, isRegistering, isDemo) {
  const val = typeof value === "string" ? value : "";
  const trimmed = val.trim();

  switch (fieldName) {
    case "name":
      if (!trimmed) {
        return { isValid: false, error: "Full name is required." };
      }
      if (trimmed.length < 2) {
        return { isValid: false, error: "Full name must be at least 2 characters." };
      }
      if (trimmed.length > 80) {
        return { isValid: false, error: "Full name cannot exceed 80 characters." };
      }
      return { isValid: true, error: null };

    case "username":
      if (!trimmed) {
        return { isValid: false, error: "Username is required." };
      }
      if (trimmed.length < 3) {
        return { isValid: false, error: "Username must be at least 3 characters." };
      }
      if (trimmed.length > 32) {
        return { isValid: false, error: "Username cannot exceed 32 characters." };
      }
      if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        return { isValid: false, error: "Only letters, numbers, and underscores allowed." };
      }
      return { isValid: true, error: null };

    case "email":
      if (!trimmed) {
        return { isValid: false, error: "Email address is required." };
      }
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
        return { isValid: false, error: "Please enter a valid work email address." };
      }
      return { isValid: true, error: null };

    case "identifier":
      if (!trimmed) {
        return { isValid: false, error: "Email or username is required." };
      }
      if (trimmed.length < 3) {
        return { isValid: false, error: "Must be at least 3 characters." };
      }
      return { isValid: true, error: null };

    case "password":
      if (!val) {
        return { isValid: false, error: "Password is required." };
      }
      if (isRegistering) {
        if (val.length < 8) {
          return { isValid: false, error: "Password must be at least 8 characters." };
        }
        if (new TextEncoder().encode(val).length > 72) {
          return { isValid: false, error: "Password cannot exceed 72 bytes." };
        }
      }
      return { isValid: true, error: null };

    default:
      return { isValid: true, error: null };
  }
}

export function AuthPage({ onAuthenticated }) {
  // Page mode: "business" (Work Workspace) vs "demo" (Interactive Demo Accounts)
  const [loginType, setLoginType] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get("mode") || params.get("page") || params.get("view");
      if (modeParam === "demo") return "demo";
    }
    return "business";
  });

  const [mode, setMode] = useState("login"); // "login" | "register"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [infoNotice, setInfoNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("teamguard_remember_me");
      if (stored !== null) return stored === "true";
    }
    return true;
  });

  function handleRememberMeChange(checked) {
    setRememberMe(checked);
    try {
      localStorage.setItem("teamguard_remember_me", String(checked));
    } catch {
      // Graceful fallback
    }
  }

  // Form values
  const [values, setValues] = useState(() => ({
    name: "",
    username: "",
    email: "",
    identifier: loginType === "demo" ? "admin@teamguard.io" : "",
    password: loginType === "demo" ? "Password123!" : "",
  }));

  // Field interaction & validation state
  const [touched, setTouched] = useState({
    name: false,
    username: false,
    email: false,
    identifier: false,
    password: false,
  });

  const [validationState, setValidationState] = useState({
    name: { isValid: false, error: null },
    username: { isValid: false, error: null },
    email: { isValid: false, error: null },
    identifier: { isValid: false, error: null },
    password: { isValid: false, error: null },
  });

  const isDemo = loginType === "demo";
  const activeDemoAccount = DEMO_ACCOUNTS.find((a) => a.email === values.identifier);
  const isRegistering = !isDemo && mode === "register";

  // Debounce & Throttle reference tracker
  const validationTimersRef = useRef({});

  const runValidation = useCallback((fieldName, val, registering, demo) => {
    const result = validateField(fieldName, val, registering, demo);
    setValidationState((prev) => ({
      ...prev,
      [fieldName]: result,
    }));
    return result;
  }, []);

  /**
   * Synchronized Debounce & Throttle:
   * - Throttles rapid typing so validation runs at most every 300ms.
   * - Debounces keypresses so settled input validates 200ms after user pauses.
   */
  const debouncedThrottledValidate = useCallback(
    (fieldName, val, registering, demo) => {
      const existing = validationTimersRef.current[fieldName] || {
        debounceTimer: null,
        throttleTimer: null,
        lastRan: 0,
      };

      const now = Date.now();
      const THROTTLE_LIMIT = 300;
      const DEBOUNCE_DELAY = 200;

      // Throttle: execute immediately if throttle window has passed
      if (!existing.lastRan || now - existing.lastRan >= THROTTLE_LIMIT) {
        existing.lastRan = now;
        runValidation(fieldName, val, registering, demo);
      } else if (!existing.throttleTimer) {
        existing.throttleTimer = setTimeout(() => {
          existing.lastRan = Date.now();
          runValidation(fieldName, val, registering, demo);
          existing.throttleTimer = null;
        }, THROTTLE_LIMIT - (now - existing.lastRan));
      }

      // Debounce: reset trailing wait timer on every keypress
      if (existing.debounceTimer) {
        clearTimeout(existing.debounceTimer);
      }
      existing.debounceTimer = setTimeout(() => {
        existing.lastRan = Date.now();
        runValidation(fieldName, val, registering, demo);
        if (existing.throttleTimer) {
          clearTimeout(existing.throttleTimer);
          existing.throttleTimer = null;
        }
        existing.debounceTimer = null;
      }, DEBOUNCE_DELAY);

      validationTimersRef.current[fieldName] = existing;
    },
    [runValidation]
  );

  const handleBlur = (fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));
    const timers = validationTimersRef.current[fieldName];
    if (timers) {
      if (timers.debounceTimer) clearTimeout(timers.debounceTimer);
      if (timers.throttleTimer) clearTimeout(timers.throttleTimer);
      validationTimersRef.current[fieldName] = null;
    }
    runValidation(fieldName, values[fieldName], isRegistering, isDemo);
  };

  const change = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setTouched((prev) => ({ ...prev, [name]: true }));
    debouncedThrottledValidate(name, value, isRegistering, isDemo);
  };

  // Synchronize loginType with URL query parameter without page reload
  function switchLoginType(nextType) {
    setLoginType(nextType);
    setError("");
    setInfoNotice("");

    if (nextType === "demo") {
      setMode("login");
    }

    if (typeof window !== "undefined" && window.history?.pushState) {
      const url = new URL(window.location.href);
      if (nextType === "demo") {
        url.searchParams.set("mode", "demo");
      } else {
        url.searchParams.delete("mode");
      }
      window.history.pushState({}, "", url.toString());
    }

    if (nextType === "demo") {
      const demoEmail = values.identifier || "admin@teamguard.io";
      const demoPass = values.password || "Password123!";
      setValues((prev) => ({
        ...prev,
        identifier: demoEmail,
        password: demoPass,
      }));
      setTouched((prev) => ({ ...prev, identifier: true, password: true }));
      runValidation("identifier", demoEmail, false, true);
      runValidation("password", demoPass, false, true);
    } else {
      if (values.identifier === "admin@teamguard.io" && values.password === "Password123!") {
        setValues((prev) => ({
          ...prev,
          identifier: "",
          password: "",
        }));
        setTouched({ name: false, username: false, email: false, identifier: false, password: false });
      }
    }
  }

  // Handle browser back / forward navigation
  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get("mode") || params.get("page") || params.get("view");
      const nextType = modeParam === "demo" ? "demo" : "business";
      setLoginType(nextType);
      if (nextType === "demo") {
        setMode("login");
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Cleanup pending validation timers on unmount
  useEffect(() => {
    return () => {
      Object.values(validationTimersRef.current).forEach((t) => {
        if (t?.debounceTimer) clearTimeout(t.debounceTimer);
        if (t?.throttleTimer) clearTimeout(t.throttleTimer);
      });
    };
  }, []);

  // Validate pre-filled or autofilled values when mode or environment changes
  useEffect(() => {
    Object.keys(values).forEach((k) => {
      if (values[k]) {
        runValidation(k, values[k], isRegistering, isDemo);
      }
    });
  }, [loginType, mode, runValidation, isRegistering, isDemo]);

  function quickFillDemo(email) {
    const nextValues = {
      ...values,
      identifier: email,
      password: "Password123!",
    };
    setValues(nextValues);
    setError("");
    setInfoNotice("");
    setTouched((prev) => ({ ...prev, identifier: true, password: true }));
    runValidation("identifier", email, false, true);
    runValidation("password", "Password123!", false, true);
  }

  /**
   * Computes the display status ("valid" | "invalid" | "neutral") for an input.
   * - Highlights green with rounded check icon when valid.
   * - Highlights red with warning outline if user has interacted and value is invalid.
   */
  function getFieldStatus(fieldName) {
    const val = values[fieldName] || "";
    const isFieldTouched = touched[fieldName];
    const validation = validationState[fieldName];

    if (val.length > 0) {
      if (validation && typeof validation.isValid === "boolean") {
        return validation.isValid ? "valid" : isFieldTouched ? "invalid" : "neutral";
      }
      const immediate = validateField(fieldName, val, isRegistering, isDemo);
      return immediate.isValid ? "valid" : isFieldTouched ? "invalid" : "neutral";
    }

    if (isFieldTouched) {
      return "invalid";
    }

    return "neutral";
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfoNotice("");

    // Enforce login-only for Demo mode
    const effectiveMode = loginType === "demo" ? "login" : mode;

    // Validate all required fields for active mode before submitting
    const fieldsToValidate =
      effectiveMode === "login"
        ? ["identifier", "password"]
        : ["name", "username", "email", "password"];

    let hasValidationErrors = false;
    const newTouched = { ...touched };
    const newValidation = { ...validationState };

    for (const f of fieldsToValidate) {
      newTouched[f] = true;
      const res = validateField(f, values[f], effectiveMode === "register", loginType === "demo");
      newValidation[f] = res;
      if (!res.isValid) {
        hasValidationErrors = true;
      }
    }

    setTouched(newTouched);
    setValidationState(newValidation);

    if (hasValidationErrors) {
      setError("Please resolve the highlighted fields before proceeding.");
      setBusy(false);
      return;
    }

    try {
      const session =
        effectiveMode === "login"
          ? await api.login({
              identifier: values.identifier,
              password: values.password,
              rememberMe,
            })
          : await api.register({
              name: values.name,
              username: values.username,
              email: values.email,
              password: values.password,
              rememberMe,
            });
      setAccessToken(session.accessToken);
      onAuthenticated(session.user);
    } catch (submitError) {
      setError(submitError.message || "Authentication failed. Please verify credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      {/* =========================================================================
          LEFT PANE - BRAND HERO & SECURITY HIGHLIGHTS
         ========================================================================= */}
      <aside className="auth-aside">
        <Brand size={34} variant="light" />

        <div className="auth-aside-content">
          <span className="eyebrow eyebrow-light">TeamGuard · Secure Team Access</span>
          <h1>Give the right people the right access.</h1>

          <div className="auth-security-pillars">
            <div className="pillar-item">
              <ShieldCheck size={16} className="pillar-icon" />
              <div>
                <strong>Team Privacy</strong>
                <span>Keep your team's data secure and separate.</span>
              </div>
            </div>
            <div className="pillar-item">
              <Layers size={16} className="pillar-icon" />
              <div>
                <strong>Role-Based Permissions</strong>
                <span>Control what each team member can view or edit.</span>
              </div>
            </div>
            <div className="pillar-item">
              <FileCheck2 size={16} className="pillar-icon" />
              <div>
                <strong>Activity History</strong>
                <span>Keep track of important actions and security events.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-aside-footer">
          <span>TEAMGUARD</span>
          <span>EST. 2026</span>
        </div>
        <div className="auth-grid-pattern" />
      </aside>

      {/* =========================================================================
          RIGHT PANE - AUTHENTICATION CARD
         ========================================================================= */}
      <section className="auth-main">
        <div className="auth-form-wrap">
          {/* Centered Brand Icon on Mobile Screens */}
          <div className="auth-card-brand">
            <Brand size={32} />
          </div>

          {/* Dual-Mode Navigation Bar */}
          <div className="auth-mode-segmented-bar" role="tablist" aria-label="Sign-in environment">
            <button
              type="button"
              className={`auth-mode-pill ${!isDemo ? "active" : ""}`}
              onClick={() => switchLoginType("business")}
              role="tab"
              aria-selected={!isDemo}
            >
              <Building2 size={15} />
              <span>Team Workspace</span>
            </button>
            <a
              href="?mode=demo"
              className={`auth-mode-pill ${isDemo ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                switchLoginType("demo");
              }}
              role="tab"
              aria-selected={isDemo}
              title="Test with demo accounts"
            >
              <PlayCircle size={15} />
              <span>Try Demo</span>
            </a>
          </div>

          {/* Header Block */}
          <div className="auth-header-block">
            <h2>{isRegistering ? "Create your workspace" : "Welcome back"}</h2>
            <p className="auth-subtitle">
              {!isDemo
                ? isRegistering
                  ? "Create a workspace for your team with full admin access."
                  : "Sign in to access your projects, tasks, and team settings."
                : "Choose a role below to see how TeamGuard works in action."}
            </p>
          </div>

          {/* Quick-Access Demo Accounts (Exclusive to Demo Mode) */}
          {isDemo && (
            <div className="auth-quick-access-box auth-quick-access-demo">
              <div className="auth-quick-access-header">
                <div className="auth-quick-access-header-left">
                  <User size={14} className="text-emerald" />
                  <span>Choose a demo account:</span>
                </div>
              </div>

              {/* Interactive Role Cards Grid */}
              <div className="auth-quick-access-grid">
                {DEMO_ACCOUNTS.map((acc) => {
                  const isActive = values.identifier === acc.email;
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      className={`auth-access-card demo-card ${isActive ? "active" : ""}`}
                      onClick={() => quickFillDemo(acc.email)}
                      title={`Select ${acc.label} (${acc.role})`}
                    >
                      <div className="auth-card-top-row">
                        <strong>{acc.label}</strong>
                        <div className="auth-card-badge-group">
                          <span className="auth-role-tag">{acc.badge}</span>
                          {isActive && <CheckCircle2 size={14} className="text-emerald" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Account Description Box */}
              {DEMO_ACCOUNTS.filter((acc) => values.identifier === acc.email).map((acc) => (
                <div key={acc.email} className="auth-card-subtext-box">
                  <Info size={14} className="auth-subtext-icon" />
                  <span>{acc.desc}</span>
                </div>
              ))}
            </div>
          )}

          {/* Segmented Auth Mode Tabs (Sign In vs Create Workspace) */}
          {!isDemo && (
            <div className="auth-tabs" role="tablist" aria-label="Sign-in options">
              <button
                type="button"
                className={mode === "login" ? "selected" : ""}
                onClick={() => {
                  setMode("login");
                  setError("");
                  setInfoNotice("");
                }}
                role="tab"
                aria-selected={mode === "login"}
              >
                Sign in
              </button>
              <button
                type="button"
                className={mode === "register" ? "selected" : ""}
                onClick={() => {
                  setMode("register");
                  setError("");
                  setInfoNotice("");
                }}
                role="tab"
                aria-selected={mode === "register"}
              >
                Create workspace
              </button>
            </div>
          )}

          {/* Main Authentication Form */}
          <form className="auth-form" onSubmit={submit} noValidate>
            {isRegistering && (
              <>
                <label>
                  <span>Full name</span>
                  <div className="auth-input-wrapper">
                    <input
                      name="name"
                      className={`auth-field-input ${
                        getFieldStatus("name") === "valid"
                          ? "is-valid"
                          : getFieldStatus("name") === "invalid"
                          ? "is-invalid"
                          : ""
                      }`}
                      value={values.name}
                      onChange={change}
                      onBlur={() => handleBlur("name")}
                      autoComplete="name"
                      minLength={2}
                      maxLength={80}
                      placeholder="e.g. Elena Rostova"
                      required
                    />
                    {getFieldStatus("name") === "valid" && (
                      <span className="auth-input-end-icon text-emerald" aria-hidden="true">
                        <CheckCircle2 size={16} />
                      </span>
                    )}
                    {getFieldStatus("name") === "invalid" && (
                      <span className="auth-input-end-icon text-destructive" aria-hidden="true">
                        <AlertCircle size={16} />
                      </span>
                    )}
                  </div>
                  {getFieldStatus("name") === "invalid" && validationState.name?.error && (
                    <span className="auth-field-error" role="alert">
                      {validationState.name.error}
                    </span>
                  )}
                </label>

                <label>
                  <span>Username</span>
                  <div className="auth-input-wrapper">
                    <input
                      name="username"
                      className={`auth-field-input ${
                        getFieldStatus("username") === "valid"
                          ? "is-valid"
                          : getFieldStatus("username") === "invalid"
                          ? "is-invalid"
                          : ""
                      }`}
                      value={values.username}
                      onChange={change}
                      onBlur={() => handleBlur("username")}
                      autoComplete="username"
                      minLength={3}
                      maxLength={32}
                      pattern="[A-Za-z0-9_]+"
                      placeholder="e.g. elenar"
                      required
                    />
                    {getFieldStatus("username") === "valid" && (
                      <span className="auth-input-end-icon text-emerald" aria-hidden="true">
                        <CheckCircle2 size={16} />
                      </span>
                    )}
                    {getFieldStatus("username") === "invalid" && (
                      <span className="auth-input-end-icon text-destructive" aria-hidden="true">
                        <AlertCircle size={16} />
                      </span>
                    )}
                  </div>
                  {getFieldStatus("username") === "invalid" && validationState.username?.error && (
                    <span className="auth-field-error" role="alert">
                      {validationState.username.error}
                    </span>
                  )}
                </label>

                <label>
                  <span>Work email address</span>
                  <div className="auth-input-wrapper">
                    <input
                      name="email"
                      type="email"
                      className={`auth-field-input ${
                        getFieldStatus("email") === "valid"
                          ? "is-valid"
                          : getFieldStatus("email") === "invalid"
                          ? "is-invalid"
                          : ""
                      }`}
                      value={values.email}
                      onChange={change}
                      onBlur={() => handleBlur("email")}
                      autoComplete="email"
                      placeholder="e.g. elena@enterprise.io"
                      required
                    />
                    {getFieldStatus("email") === "valid" && (
                      <span className="auth-input-end-icon text-emerald" aria-hidden="true">
                        <CheckCircle2 size={16} />
                      </span>
                    )}
                    {getFieldStatus("email") === "invalid" && (
                      <span className="auth-input-end-icon text-destructive" aria-hidden="true">
                        <AlertCircle size={16} />
                      </span>
                    )}
                  </div>
                  {getFieldStatus("email") === "invalid" && validationState.email?.error && (
                    <span className="auth-field-error" role="alert">
                      {validationState.email.error}
                    </span>
                  )}
                </label>
              </>
            )}

            {!isRegistering && (
              <label>
                <span>Email or Username</span>
                <div className="auth-input-wrapper">
                  <input
                    name="identifier"
                    className={`auth-field-input ${
                      getFieldStatus("identifier") === "valid"
                        ? "is-valid"
                        : getFieldStatus("identifier") === "invalid"
                        ? "is-invalid"
                        : ""
                    }`}
                    value={values.identifier}
                    onChange={change}
                    onBlur={() => handleBlur("identifier")}
                    autoComplete="username"
                    placeholder={!isDemo ? "name@company.com or username" : "admin@teamguard.io"}
                    required
                  />
                  {getFieldStatus("identifier") === "valid" && (
                    <span className="auth-input-end-icon text-emerald" aria-hidden="true">
                      <CheckCircle2 size={16} />
                    </span>
                  )}
                  {getFieldStatus("identifier") === "invalid" && (
                    <span className="auth-input-end-icon text-destructive" aria-hidden="true">
                      <AlertCircle size={16} />
                    </span>
                  )}
                </div>
                {getFieldStatus("identifier") === "invalid" && validationState.identifier?.error && (
                  <span className="auth-field-error" role="alert">
                    {validationState.identifier.error}
                  </span>
                )}
              </label>
            )}

            <label>
              <div className="password-label-row">
                <span>Password</span>
                {isRegistering && (
                  <span className="password-sub-hint">Minimum 8 characters</span>
                )}
                {isDemo && (
                  <span className="password-sub-hint">Pre-filled password</span>
                )}
              </div>
              <div className="auth-input-wrapper password-input-wrap">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  className={`auth-field-input ${
                    getFieldStatus("password") === "valid"
                      ? "is-valid"
                      : getFieldStatus("password") === "invalid"
                      ? "is-invalid"
                      : ""
                  }`}
                  value={values.password}
                  onChange={change}
                  onBlur={() => handleBlur("password")}
                  autoComplete={!isRegistering ? "current-password" : "new-password"}
                  minLength={isRegistering ? 8 : 1}
                  maxLength={72}
                  placeholder={!isRegistering ? "••••••••••••" : undefined}
                  required
                />
                <div className="password-actions-wrap">
                  {getFieldStatus("password") === "valid" && (
                    <span className="auth-input-status-icon text-emerald" aria-hidden="true">
                      <CheckCircle2 size={16} />
                    </span>
                  )}
                  {getFieldStatus("password") === "invalid" && (
                    <span className="auth-input-status-icon text-destructive" aria-hidden="true">
                      <AlertCircle size={16} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {getFieldStatus("password") === "invalid" && validationState.password?.error && (
                <span className="auth-field-error" role="alert">
                  {validationState.password.error}
                </span>
              )}
            </label>

            {/* Options Row */}
            <div className="auth-options-row">
              <label className="remember-checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => handleRememberMeChange(e.target.checked)}
                />
                <span>Keep me signed in</span>
              </label>
            </div>

            {/* Error Message Alert */}
            {error && (
              <div className="form-error" role="alert">
                <AlertCircle size={15} className="error-icon" />
                <span>{error}</span>
              </div>
            )}

            {/* Information Notice Alert */}
            {infoNotice && !error && (
              <div className="form-info-notice" role="status">
                <CheckCircle2 size={15} className="text-emerald" />
                <span>{infoNotice}</span>
              </div>
            )}

            {/* Primary Action Button */}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{isRegistering ? "Creating workspace…" : "Signing in…"}</span>
                </>
              ) : (
                <>
                  <span>
                    {isRegistering
                      ? "Create Workspace"
                      : isDemo
                      ? `Sign in as ${activeDemoAccount?.label || "Demo User"}`
                      : "Sign in to Workspace"}
                  </span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
