import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

// Netlify Identity widget — loaded from CDN in index.html
declare global {
  interface Window {
    netlifyIdentity: {
      open: (cmd?: string) => void;
      close: () => void;
      on: (event: string, cb: (user?: any) => void) => void;
      currentUser: () => any | null;
      logout: () => void;
      init: (opts?: any) => void;
    };
  }
}

interface Props {
  children: React.ReactNode;
}

export const AuthGate = ({ children }: Props) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ni = window.netlifyIdentity;
    if (!ni) {
      // Identity widget not loaded yet — wait for it
      const interval = setInterval(() => {
        if (window.netlifyIdentity) {
          clearInterval(interval);
          initIdentity();
        }
      }, 100);
      return () => clearInterval(interval);
    }
    initIdentity();
  }, []);

  const initIdentity = () => {
    const ni = window.netlifyIdentity;

    // Check if already logged in
    const current = ni.currentUser();
    if (current) {
      setUser(current);
      setLoading(false);
    } else {
      setLoading(false);
    }

    // Listen for login
    ni.on("login", (loggedInUser) => {
      setUser(loggedInUser);
      ni.close();
    });

    // Listen for logout
    ni.on("logout", () => {
      setUser(null);
    });

    // Handle invite token in URL (user clicking invite email link)
    ni.on("init", (u) => {
      if (u) setUser(u);
      setLoading(false);
    });
  };

  const handleLogin = () => {
    window.netlifyIdentity?.open("login");
  };

  const handleLogout = () => {
    window.netlifyIdentity?.logout();
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs text-muted-foreground tracking-widest uppercase">Loading…</p>
        </div>
      </div>
    );
  }

  // Not logged in — show login gate
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        {/* Gold top bar */}
        <div className="fixed top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />

        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-10">
            <img
              src="https://dedicated-team8k.store/logo.png"
              alt="Team 8K"
              className="h-14 w-14 mx-auto mb-4 rounded-xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <h1 className="font-display font-bold text-3xl text-primary tracking-wide">
              TEAM 8K
            </h1>
            <p className="text-xs text-muted-foreground tracking-[0.3em] uppercase mt-1">
              Exclusive OTT Experience
            </p>
          </div>

          {/* Card */}
          <div className="bg-gradient-card ring-gold rounded-2xl shadow-elegant p-8 text-center">
            <div className="h-14 w-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-5">
              <Shield className="h-6 w-6 text-primary" />
            </div>

            <h2 className="font-display font-bold text-xl mb-2">
              Subscribers Only
            </h2>
            <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
              This tool is exclusively available to Team 8K subscribers.
              Sign in with your invite credentials to continue.
            </p>

            <Button variant="gold" className="w-full text-sm" onClick={handleLogin}>
              Sign In
            </Button>

            <p className="text-xs text-muted-foreground mt-5 leading-relaxed">
              Don't have access?{" "}
              <span className="text-primary">Contact Team 8K to get invited.</span>
            </p>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground mt-6 tracking-wider">
            © 2026 Team 8K. All Rights Reserved.
          </p>
        </div>
      </div>
    );
  }

  // Logged in — show the app with a logout button
  return (
    <>
      {/* Logout button — top right */}
      <div className="fixed top-3 right-4 z-50 flex items-center gap-2">
        <span className="text-xs text-muted-foreground hidden md:block">
          {user.email}
        </span>
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
};
