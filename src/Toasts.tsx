import { lazy, Suspense, useSyncExternalStore } from "react";

const Sonner = lazy(() =>
  import("sonner").then((module) => ({ default: module.Toaster })),
);
let requested = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => requested;

export function notify(
  message: string,
  kind: "info" | "success" | "error" = "info",
) {
  if (!message) return;
  requested = true;
  listeners.forEach((listener) => listener());
  void import("sonner")
    .then(({ toast }) => {
      toast[kind](message, { duration: kind === "error" ? Infinity : 6000 });
    })
    .catch((error) => console.error("Could not load notifications", error));
}
export function Toaster() {
  const active = useSyncExternalStore(subscribe, getSnapshot);
  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <Sonner
        theme="light"
        position="bottom-right"
        closeButton
        visibleToasts={3}
        containerAriaLabel="Notifications"
        toastOptions={{
          closeButtonAriaLabel: "Dismiss notification",
          className: "app-toast",
        }}
      />
    </Suspense>
  );
}
