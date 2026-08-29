import { desktopBridge } from "@/platform/desktop";

export function installDiagnostics(): void {
  window.addEventListener("error", (event) => {
    const stack = event.error instanceof Error ? event.error.stack ?? "" : "";
    desktopBridge()?.app.report("error", `${event.message}\n${stack}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error
      ? event.reason.stack ?? event.reason.message
      : String(event.reason);
    desktopBridge()?.app.report("error", `Unhandled rejection: ${reason}`);
  });
}
