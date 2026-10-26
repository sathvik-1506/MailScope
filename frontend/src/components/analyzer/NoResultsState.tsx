import { SearchX } from "lucide-react";
import Button from "../Button";

interface NoResultsStateProps {
  searchQuery: string;
  hasFilter: boolean;
  onClearFilters: () => void;
}

export default function NoResultsState({
  searchQuery,
  hasFilter,
  onClearFilters,
}: NoResultsStateProps) {
  return (
    <div className="rounded-xl border border-border-default bg-surface-secondary/60 p-8 text-center sm:p-12">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-muted mb-3">
        <SearchX className="h-6 w-6" aria-hidden="true" />
      </div>

      <h3 className="text-sm font-semibold text-text-primary">
        No Matching Records Found
      </h3>

      <p className="mt-1 text-xs text-text-muted max-w-sm mx-auto">
        {searchQuery ? (
          <>
            No addresses matched query <strong className="font-mono text-text-secondary">"{searchQuery}"</strong>.
          </>
        ) : (
          "No addresses match the currently selected verdict filter."
        )}
      </p>

      {(searchQuery || hasFilter) && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onClearFilters}>
            Clear Search & Reset Filter
          </Button>
        </div>
      )}
    </div>
  );
}
