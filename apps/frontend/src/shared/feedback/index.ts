// Public entry point for the shared save-status toast system (story 3):
// mount `ToastProvider` once near the app root, then call
// `useSaveStatusToast` from any mutation to drive its toast.
export { ToastProvider, useToastContext } from './ToastProvider';
export { useSaveStatusToast } from './useSaveStatusToast';
export { toProblemDetailsInfo } from './problemDetails';
export type { ProblemDetailsInfo } from './problemDetails';
export type { SaveStatusToastHandle } from './useSaveStatusToast';
export type { FailedToastDetails, ToastEntry, ToastStatus } from './types';

// The shared loading component (story 6): pair `LoadingIndicator` with
// `useDelayedLoading` wherever the app waits on a backend request.
export { LoadingIndicator } from './LoadingIndicator';
export { useDelayedLoading } from './useDelayedLoading';
