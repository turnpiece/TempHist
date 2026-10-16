/**
 * Tracks whether anonymous sign-in has completed, so standalone pages that
 * render their static content at load (Snapshots, Locations) can hold their
 * API calls until the user exists. If sign-in fails, the promise stays pending
 * and the page shows the connection notice; a successful Retry resolves it.
 */
let signedIn = false;
let resolveSignedIn: () => void = () => {};
const signedInPromise = new Promise<void>((resolve) => {
  resolveSignedIn = resolve;
});

export function markSignedIn(): void {
  signedIn = true;
  resolveSignedIn();
}

export function isSignedIn(): boolean {
  return signedIn || !!globalThis.currentUser;
}

export function whenSignedIn(): Promise<void> {
  return isSignedIn() ? Promise.resolve() : signedInPromise;
}
