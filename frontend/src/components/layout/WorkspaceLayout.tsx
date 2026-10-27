import { useState, useMemo } from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  MailCheck,
  BarChart3,
  History,
  Download,
  Settings,
  Menu,
  X,
  ArrowLeft,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import Logo from "../Logo";
import ThemeSwitcher from "../ThemeSwitcher";
import { BRAND } from "../../constants/brand";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/app",
    label: "Overview",
    icon: LayoutDashboard,
    end: true,
    description: "Deliverability dashboard & key metrics",
  },
  {
    to: "/app/analyze",
    label: "Analyze Emails",
    icon: MailCheck,
    description: "Syntax, DNS & SMTP batch verification",
  },
  {
    to: "/app/analytics",
    label: "Analytics",
    icon: BarChart3,
    description: "Aggregate statistics & domain metrics",
  },
  {
    to: "/app/history",
    label: "Analysis History",
    icon: History,
    description: "Previous analysis runs & session ledger",
  },
  {
    to: "/app/exports",
    label: "Export Center",
    icon: Download,
    description: "Sanitized CSV & report generation",
  },
  {
    to: "/app/settings",
    label: "Settings",
    icon: Settings,
    description: "Theme preferences & verification defaults",
  },
];

export default function WorkspaceLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Find the active page item for breadcrumb and header title
  const currentItem = useMemo(() => {
    return (
      NAV_ITEMS.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))) ??
      NAV_ITEMS[0]
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface-primary text-text-primary antialiased">
      {/* ========================================================================= */}
      {/* 1. Desktop Sidebar (Sticky, Left)                                         */}
      {/* ========================================================================= */}
      <aside
        className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30 border-r border-border-subtle bg-surface-secondary"
        aria-label="Workspace navigation"
      >
        {/* Brand & Workspace Header */}
        <div className="flex h-16 shrink-0 items-center justify-between px-5 border-b border-border-subtle">
          <Logo />
          <span className="rounded bg-brand-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-brand-400 border border-brand-500/20">
            Workspace
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto" aria-label="Sidebar">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                    isActive
                      ? "bg-brand-500/15 text-brand-400 border border-brand-500/20 font-semibold shadow-sm"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated/70"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-4 w-4 shrink-0 transition-colors ${
                        isActive ? "text-brand-400" : "text-text-muted group-hover:text-text-primary"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer: Theme switcher & Return home */}
        <div className="shrink-0 border-t border-border-subtle p-3 space-y-2 bg-surface-secondary">
          {/* Engine status indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-primary/70 border border-border-subtle text-[11px] text-text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-400 shrink-0" aria-hidden="true" />
            <span className="truncate">Zero Messages Sent</span>
          </div>

          {/* Theme switcher */}
          <div className="pt-1">
            <div className="flex items-center justify-between px-3 py-1 text-xs text-text-muted">
              <span>Appearance</span>
              <ThemeSwitcher variant="segmented" />
            </div>
          </div>

          {/* Return to website */}
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Return to Landing Page</span>
          </Link>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. Mobile Header & Drawer Navigation                                      */}
      {/* ========================================================================= */}
      <div className="md:hidden sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border-subtle bg-surface-secondary/95 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 text-text-secondary hover:text-text-primary rounded-md cursor-pointer"
            aria-label="Open workspace menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo />
        </div>

        <div className="flex items-center gap-2">
          <ThemeSwitcher variant="segmented" />
        </div>
      </div>

      {/* Mobile Slide-over Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile workspace menu"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="relative flex w-full max-w-xs flex-col bg-surface-secondary border-r border-border-default shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
              <Logo />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-text-muted hover:text-text-primary rounded-md cursor-pointer"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-4 flex-1 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? "bg-brand-500/15 text-brand-400 font-semibold"
                          : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            <div className="border-t border-border-subtle pt-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Appearance</span>
                <ThemeSwitcher variant="segmented" />
              </div>
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Return to Landing Page</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. Main Workspace Container                                               */}
      {/* ========================================================================= */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        {/* Top Breadcrumb & Status Bar */}
        <header className="hidden md:flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-surface-primary/80 px-6 backdrop-blur-md sticky top-0 z-20">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-text-muted">
            <Link to="/app" className="hover:text-text-primary transition-colors">
              {BRAND.name}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-text-muted/60" aria-hidden="true" />
            <span className="font-medium text-text-primary">{currentItem.label}</span>
          </nav>

          {/* Quick Context / Actions */}
          <div className="flex items-center gap-4 text-xs">
            <span className="text-text-muted hidden lg:inline">RFC 5321 &bull; RFC 5322 &bull; DNS MX</span>
            <Link
              to="/app/settings"
              className="text-text-muted hover:text-text-primary transition-colors"
              title="Workspace settings"
            >
              Settings
            </Link>
            <a
              href="https://github.com/sathvik-1506/Mailora"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors"
            >
              <span>GitHub</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </header>

        {/* Dynamic Outlet with consistent padding and max width */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
