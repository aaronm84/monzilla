import { migrateSave, type MemberSave } from '@monzilla/core';
import type { SaveBackend } from './store.js';

/**
 * Firestore backend. Only loaded when the Firebase env vars are set, so the
 * game runs fully offline/local without a project. The parent signs in once
 * per device with Google; the kid never sees this.
 *
 * Data layout (see firebase/firestore.rules):
 *   families/{familyId}                 { name, memberIds, createdAt }
 *   families/{familyId}/members/{uid}   MemberSave
 */
export function firebaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID);
}

export interface FirebaseSession {
  backend: SaveBackend;
  uid: string;
  familyId: string;
  displayName: string;
  signOut(): Promise<void>;
}

/** Resolve the signed-in user, or null if the parent has not signed in on this device. */
export async function connectFirebase(): Promise<FirebaseSession | null> {
  if (!firebaseConfigured()) return null;
  const [{ initializeApp, getApps }, auth, fs] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ]);
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    });
  const authInstance = auth.getAuth(app);
  await auth.setPersistence(authInstance, auth.browserLocalPersistence);
  // Complete a redirect sign-in if one is in flight (iOS Safari path).
  await auth.getRedirectResult(authInstance).catch(() => null);
  const user = await new Promise<import('firebase/auth').User | null>((resolve) => {
    const stop = auth.onAuthStateChanged(authInstance, (u) => {
      stop();
      resolve(u);
    });
  });
  if (!user) return null;

  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });

  // One family per parent account for now; invites come later.
  const familyId = user.uid;
  const familyRef = fs.doc(db, 'families', familyId);
  const familySnap = await fs.getDoc(familyRef);
  if (!familySnap.exists()) {
    await fs.setDoc(familyRef, {
      name: `${user.displayName ?? 'Our'} Family`,
      memberIds: [user.uid],
      createdAt: Date.now(),
    });
  }
  const memberRef = fs.doc(db, 'families', familyId, 'members', user.uid);

  const backend: SaveBackend = {
    kind: 'firebase',
    async load() {
      const snap = await fs.getDoc(memberRef);
      return snap.exists() ? migrateSave(snap.data()) : null;
    },
    async save(save: MemberSave) {
      await fs.setDoc(memberRef, save);
    },
    onRemoteChange(handler) {
      return fs.onSnapshot(memberRef, (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const data = snap.exists() ? migrateSave(snap.data()) : null;
        if (data) handler(data);
      });
    },
  };

  return {
    backend,
    uid: user.uid,
    familyId,
    displayName: user.displayName ?? 'Parent',
    signOut: () => auth.signOut(authInstance),
  };
}

/** Start Google sign-in. Uses redirect on touch devices, popup elsewhere. */
export async function signInWithGoogle(): Promise<void> {
  if (!firebaseConfigured()) return;
  const [{ getApps, initializeApp }, auth] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    });
  const provider = new auth.GoogleAuthProvider();
  const authInstance = auth.getAuth(app);
  const touch = 'ontouchstart' in window;
  if (touch) await auth.signInWithRedirect(authInstance, provider);
  else await auth.signInWithPopup(authInstance, provider);
}
