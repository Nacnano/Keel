/** Activate an already-downloaded update only after an explicit, idle-user action. */
export async function reloadApp() {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      const waiting = registration?.waiting;
      if (waiting) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timeout);
            navigator.serviceWorker.removeEventListener('controllerchange', done);
            resolve();
          };
          const timeout = setTimeout(done, 2000);
          navigator.serviceWorker.addEventListener('controllerchange', done);
          waiting.postMessage({ type: 'SKIP_WAITING' });
        });
      }
    }
  } catch {
    // Storage restrictions or a failed update must not prevent a normal reload.
  }
  window.location.reload();
}
