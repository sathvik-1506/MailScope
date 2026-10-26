interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

/**
 * Reusable section heading block with optional eyebrow and subtitle.
 */
export default function SectionHeading({ eyebrow, title, subtitle }: SectionHeadingProps) {
  return (
    <div className="mb-12 max-w-2xl">
      {eyebrow && (
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-400">
          {eyebrow}
        </p>
      )}
      <h2 className="text-h2 font-bold leading-h2 tracking-tight">{title}</h2>
      {subtitle && (
        <p className="mt-4 text-base leading-relaxed text-text-secondary">
          {subtitle}
        </p>
      )}
    </div>
  );
}
