'use client';

import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

// The selectors a modal's own Tab-trap (below) considers tabbable
// (styling.instructions.md requires interactive components to be fully
// custom-built, including dialog focus trapping).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The modal-mount focus lifecycle shared by this app's custom dialogs
// (currently `CardSelectionModal`/`CreateArtModal`): captures whatever had
// focus immediately before the modal mounted and restores it on unmount,
// so keyboard/screen-reader users land back where they started once the
// modal closes. Returns `handleTabTrap`, a `Tab`/`Shift+Tab` key handler
// that keeps focus cycling within the dialog's own focusable elements
// instead of escaping to the page behind the backdrop - callers still own
// their own `Escape` handling (which often needs to dismiss nested modal
// state, like a pending confirmation, before closing the modal itself)
// and should call this only when the pressed key isn't one they've
// already handled themselves.
export function useModalFocusTrap(dialogRef: RefObject<HTMLElement | null>) {
  const previouslyFocusedElementRef = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement;
    return () => {
      if (previouslyFocusedElementRef.current instanceof HTMLElement) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, []);

  function handleTabTrap(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;

    const container = dialogRef.current;
    if (!container) return;

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { handleTabTrap };
}
