"use client";

function buildClassName(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type SavedState = 'idle' | 'saved' | 'saved_just_now' | 'saving' | 'dirty' | 'error' | string;

type AdminSavedStateProps = {
  className?: string;
  errorCopy?: string;
  savedAgoText?: string;
  state?: SavedState;
};

function getStateCopy(state: SavedState, savedAgoText: string, errorCopy: string) {
  if (state === 'saving') return 'Saving...';
  if (state === 'dirty') return 'Unsaved changes';
  if (state === 'saved_just_now') return 'Saved just now';
  if (state === 'error') return errorCopy || 'Save failed';
  if (state === 'saved' || state === 'idle') return 'Saved';
  return savedAgoText ? `Saved ${savedAgoText}` : 'Saved';
}

export default function AdminSavedState({
  className = '',
  errorCopy = '',
  savedAgoText = '',
  state = 'idle',
}: AdminSavedStateProps) {
  const copy = getStateCopy(state, savedAgoText, errorCopy);
  const showCheck = state === 'idle' || state === 'saved' || state === 'saved_just_now';

  return (
    <span className={buildClassName(['admin-saved-state', `is-${state}`, className])}>
      {showCheck ? (
        <span className="material-symbols-outlined" aria-hidden="true">
          check_small
        </span>
      ) : null}
      <span>{copy}</span>
    </span>
  );
}
