import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getUser,
  login,
  logout,
  handleAuthCallback,
  requestPasswordRecovery,
  updateUser,
  acceptInvite,
  AuthError,
  MissingIdentityError,
  type User,
} from "@netlify/identity";

interface Props {
  children: React.ReactNode;
}

type AppView =
  | "loading"
  | "login"
  | "forgot"
  | "forgot_sent"
  | "reset_password"
  | "accept_invite"
  | "app";

export const AuthGate = ({ children }: Props) => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<AppView>("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Stored token for invite acceptance
  const [inviteToken, setInviteToken] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // Process any hash-based callback first (invite, recovery, confirmation, oauth)
        const result = await handleAuthCallback();
        if (result) {
          switch (result.type) {
            case "invite":
              // Need user to set a password before account is active
              setInviteToken(result.token);
              setView("accept_invite");
              return;
            case "recovery":
              // User is authenticated but must set a new password
              setUser(result.user!);
              setView("reset_password");
              return;
            case "confirmation":
            case "oauth":
              setUser(result.user!);
              setView("app");
              return;
            case "email_change":
              setUser(result.user!);
              setView("app");
              return;
          }
        }

        // No callback — check if already logged in
        const current = await getUser();
        if (current) {
          setUser(current);
          setView("app");
        } else {
          setView("login");
        }
      } catch (err) {
        if (err instanceof MissingIdentityError) {
          setError("Netlify Identity is not enabled on this site. Contact the administrator.");
        } else if (err instanceof AuthError) {
          setError(err.message);
        } else {
          setError("Failed to initialize authentication.");
        }
        setView("login");
      }
    })();
  }, []);

  // ── Login ─────────────────────────────────────────────────────
  const handleLogin = async () => {
    setError("");
    setBusy(true);
    try {
      const u = await login(email, password);
      setUser(u);
      setView("app");
    } catch (err) {
      if (err instanceof AuthError) {
        setError(err.status === 401 ? "Invalid email or password." : err.message);
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Logout ────────────────────────────────────────────────────
  const handleLogout = async () => {
    await logout();
    setUser(null);
    setEmail("");
    setPassword("");
    setView("login");
  };

  // ── Forgot password ───────────────────────────────────────────
  const handleForgotPassword = async () => {
    setError("");
    if (!email) { setError("Enter your email address first."); return; }
    setBusy(true);
    try {
      await requestPasswordRecovery(email);
      setView("forgot_sent");
    } catch (err) {
      if (err instanceof AuthError) setError(err.message);
      else setError("Could not send recovery email. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // ── Reset password (after recovery callback) ──────────────────
  const handleResetPassword = async () => {
    setError("");
    if (!newPassword || newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await updateUser({ password: newPassword });
      setView("app");
    } catch (err) {
      if (err instanceof AuthError) setError(err.message);
      else setError("Failed to update password. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // ── Accept invite ─────────────────────────────────────────────
  const handleAcceptInvite = async () => {
    setError("");
    if (!newPassword || newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const u = await acceptInvite(inviteToken, newPassword);
      setUser(u);
      setView("app");
    } catch (err) {
      if (err instanceof AuthError) setError(err.message);
      else setError("Failed to accept invite. The link may have expired.");
    } finally {
      setBusy(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────
  if (view === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs text-muted-foreground tracking-widest uppercase">Loading…</p>
        </div>
      </div>
    );
  }

  // ── App (authenticated) ───────────────────────────────────────
  if (view === "app" && user) {
    return (
      <>
        <div className="fixed top-3 right-4 z-50 flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden md:block">{user.email}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-lg border border-border/50 hover:border-primary/40 bg-background/80 backdrop-blur-sm"
          >
            Sign out
          </button>
        </div>
        {children}
      </>
    );
  }

  // ── Shared card wrapper ───────────────────────────────────────
  const Card = ({ title, subtitle, children: inner }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="fixed top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img
            src="https://dedicated-team8k.store/logo.png"
            alt="Team 8K"
            className="h-14 w-14 mx-auto mb-4 rounded-xl"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <h1 className="font-display font-bold text-3xl text-primary tracking-wide">TEAM 8K</h1>
          <p className="text-xs text-muted-foreground tracking-[0.3em] uppercase mt-1">Exclusive OTT Experience</p>
        </div>
        <div className="bg-gradient-card ring-gold rounded-2xl shadow-elegant p-8">
          <div className="h-14 w-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-5">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-display font-bold text-xl mb-1 text-center">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mb-6 text-center leading-relaxed">{subtitle}</p>}
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mb-4 text-center">{error}</p>
          )}
          {inner}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6 tracking-wider">© 2026 Team 8K. All Rights Reserved.</p>
      </div>
    </div>
  );

  // ── Login / Forgot password form ──────────────────────────────
  if (view === "login" || view === "forgot" || view === "forgot_sent") {
    return (
      <Card
        title={view === "forgot" ? "Reset Password" : view === "forgot_sent" ? "Check Your Email" : "Subscribers Only"}
        subtitle={
          view === "forgot"
            ? "Enter your email and we'll send a reset link."
            : view === "forgot_sent"
            ? `A reset link has been sent to ${email}. Check your inbox.`
            : "Sign in with your invite credentials to continue."
        }
      >
        {view === "forgot_sent" ? (
          <button
            className="w-full text-xs text-muted-foreground hover:text-primary mt-2 text-center transition-colors"
            onClick={() => setView("login")}
          >
            ← Back to sign in
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Email</label>
              <input
                type="email"
                className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (view === "forgot" ? handleForgotPassword() : handleLogin())}
              />
            </div>
            {view === "login" && (
              <div>
                <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Password</label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
            )}
            <Button
              variant="gold"
              className="w-full text-sm"
              disabled={busy}
              onClick={view === "forgot" ? handleForgotPassword : handleLogin}
            >
              {busy ? "Please wait…" : view === "forgot" ? "Send Reset Link" : "Sign In"}
            </Button>
            <div className="text-center">
              {view === "login" ? (
                <button
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => { setError(""); setView("forgot"); }}
                >
                  Forgot password?
                </button>
              ) : (
                <button
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => { setError(""); setView("login"); }}
                >
                  ← Back to sign in
                </button>
              )}
            </div>
          </div>
        )}
      </Card>
    );
  }

  // ── Reset password form (after recovery link) ─────────────────
  if (view === "reset_password") {
    return (
      <Card title="Set New Password" subtitle="Choose a new password for your account.">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1.5">New Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Min. 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
            />
          </div>
          <Button variant="gold" className="w-full text-sm" disabled={busy} onClick={handleResetPassword}>
            {busy ? "Saving…" : "Update Password"}
          </Button>
        </div>
      </Card>
    );
  }

  // ── Accept invite form ────────────────────────────────────────
  if (view === "accept_invite") {
    return (
      <Card title="Welcome to Team 8K" subtitle="Set a password to activate your account.">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1.5">Create Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Min. 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAcceptInvite()}
            />
          </div>
          <Button variant="gold" className="w-full text-sm" disabled={busy} onClick={handleAcceptInvite}>
            {busy ? "Activating…" : "Activate Account"}
          </Button>
        </div>
      </Card>
    );
  }

  // Fallback
  return null;
};
