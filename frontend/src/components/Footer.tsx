import Logo from "./Logo";

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Site-wide footer.
 */
export default function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-surface-primary">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-12 sm:flex-row sm:justify-between sm:px-8 lg:px-12">
        <Logo />

        <nav aria-label="Footer navigation" className="flex gap-6 text-sm text-text-muted">
          <a href="#features" className="hover:text-text-secondary transition-colors">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-text-secondary transition-colors">
            How It Works
          </a>
          <a href="#privacy" className="hover:text-text-secondary transition-colors">
            Privacy
          </a>
        </nav>

        <p className="text-xs text-text-muted">
          &copy; {CURRENT_YEAR} MailScope. Built for transparency.
        </p>
      </div>
    </footer>
  );
}
