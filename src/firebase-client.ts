import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export type UserRole = 'admin' | 'user';

export interface AppUserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  tutDone: boolean;
  isNew?: boolean;
  isBootstrapAdmin?: boolean;
}

function sanitizeDisplayName(raw: string | null | undefined, email: string | null | undefined): string {
  const base = (raw || '').trim() || (email ? email.split('@')[0] : '') || 'Superviviente';
  return base.slice(0, 80);
}

function sanitizeEmail(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase().slice(0, 200);
}

export async function ensureUserProfile(
  fbUser: User,
  customDisplayName?: string
): Promise<AppUserProfile> {
  const userPath = `users/${fbUser.uid}`;
  const userRef = doc(db, 'users', fbUser.uid);
  const bootRef = doc(db, 'system', 'bootstrap');

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  if (existingSnap.exists()) {
    const d = existingSnap.data();
    let isBoot = false;
    try {
      const bootSnap = await getDoc(bootRef);
      isBoot = bootSnap.exists() && bootSnap.data()?.adminUid === fbUser.uid;
    } catch {
      isBoot = false;
    }
    return {
      uid: fbUser.uid,
      email: typeof d.email === 'string' ? d.email : sanitizeEmail(fbUser.email),
      displayName: typeof d.displayName === 'string' ? d.displayName : sanitizeDisplayName(fbUser.displayName, fbUser.email),
      role: d.role === 'admin' || isBoot ? 'admin' : 'user',
      tutDone: !!d.tutDone,
      isNew: false,
      isBootstrapAdmin: isBoot
    };
  }

  try {
    return await runTransaction(db, async (tx) => {
      const bootSnap = await tx.get(bootRef);
      const userSnap = await tx.get(userRef);
      if (userSnap.exists()) {
        const d = userSnap.data();
        const isBoot = bootSnap.exists() && bootSnap.data()?.adminUid === fbUser.uid;
        return {
          uid: fbUser.uid,
          email: typeof d.email === 'string' ? d.email : sanitizeEmail(fbUser.email),
          displayName: typeof d.displayName === 'string' ? d.displayName : sanitizeDisplayName(fbUser.displayName, fbUser.email),
          role: d.role === 'admin' || isBoot ? 'admin' : 'user',
          tutDone: !!d.tutDone,
          isNew: false,
          isBootstrapAdmin: isBoot
        };
      }

      const isFirstUser = !bootSnap.exists();
      const assignedRole: UserRole = isFirstUser ? 'admin' : 'user';
      const email = sanitizeEmail(fbUser.email);
      const displayName = sanitizeDisplayName(customDisplayName || fbUser.displayName, email);

      if (isFirstUser) {
        tx.set(bootRef, {
          adminUid: fbUser.uid,
          claimedAt: serverTimestamp()
        });
      }

      tx.set(userRef, {
        uid: fbUser.uid,
        email,
        displayName,
        role: assignedRole,
        tutDone: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return {
        uid: fbUser.uid,
        email,
        displayName,
        role: assignedRole,
        tutDone: false,
        isNew: true,
        isBootstrapAdmin: isFirstUser
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export async function loginWithGooglePopup(): Promise<AppUserProfile> {
  const res = await signInWithPopup(auth, googleProvider);
  return await ensureUserProfile(res.user);
}

export async function registerWithEmailPassword(
  email: string,
  password: string,
  displayName?: string
): Promise<AppUserProfile> {
  const res = await createUserWithEmailAndPassword(auth, email, password);
  const cleanName = sanitizeDisplayName(displayName, email);
  try {
    if (cleanName && res.user.displayName !== cleanName) {
      await updateProfile(res.user, { displayName: cleanName });
    }
  } catch {
    // non-fatal if displayName update fails
  }
  return await ensureUserProfile(res.user, cleanName);
}

export async function loginWithEmailPassword(
  email: string,
  password: string
): Promise<AppUserProfile> {
  const res = await signInWithEmailAndPassword(auth, email, password);
  return await ensureUserProfile(res.user);
}

export async function logoutFirebase(): Promise<void> {
  await signOut(auth);
}

export function onFirebaseAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function markUserTutDoneCloud(uid: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      tutDone: true,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveCloudProgress(uid: string, state: Record<string, unknown>): Promise<void> {
  const path = `saves/${uid}`;
  const day = Math.max(1, Math.min(100000, Number(state.day) || 1));
  try {
    await setDoc(doc(db, 'saves', uid), {
      userId: uid,
      day,
      state,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function loadCloudProgress(uid: string): Promise<Record<string, unknown> | null> {
  const path = `saves/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'saves', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return d && typeof d.state === 'object' && d.state !== null
      ? (d.state as Record<string, unknown>)
      : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function clearCloudProgress(uid: string): Promise<void> {
  const path = `saves/${uid}`;
  try {
    await deleteDoc(doc(db, 'saves', uid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function getBootstrapAdminUid(): Promise<string | null> {
  const path = 'system/bootstrap';
  try {
    const snap = await getDoc(doc(db, 'system', 'bootstrap'));
    return snap.exists() ? String(snap.data()?.adminUid || '') || null : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function listAllUsersCloud(): Promise<AppUserProfile[]> {
  const path = 'users';
  try {
    const bootUid = await getBootstrapAdminUid();
    const q = query(collection(db, 'users'), orderBy('createdAt', 'asc'), limit(100));
    const snaps = await getDocs(q);
    return snaps.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        uid: docSnap.id,
        email: typeof d.email === 'string' ? d.email : '',
        displayName: typeof d.displayName === 'string' ? d.displayName : 'Superviviente',
        role: d.role === 'admin' || docSnap.id === bootUid ? 'admin' : 'user',
        tutDone: !!d.tutDone,
        isBootstrapAdmin: docSnap.id === bootUid
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function updateUserRoleCloud(targetUid: string, nextRole: UserRole): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      role: nextRole,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteUserProfileCloud(targetUid: string): Promise<void> {
  const userPath = `users/${targetUid}`;
  const savePath = `saves/${targetUid}`;
  try {
    await deleteDoc(doc(db, 'users', targetUid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, userPath);
  }
  try {
    await deleteDoc(doc(db, 'saves', targetUid));
  } catch {
    // Save may not exist yet
  }
}

export async function loadGlobalLayoutCloud(): Promise<{ layout: Record<string, unknown>; sprites: Record<string, unknown> } | null> {
  const path = 'config/layout';
  try {
    const snap = await getDoc(doc(db, 'config', 'layout'));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      layout: (d?.layout as Record<string, unknown>) || {},
      sprites: (d?.sprites as Record<string, unknown>) || {}
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveGlobalLayoutCloud(
  uid: string,
  layout: Record<string, unknown>,
  sprites: Record<string, unknown>
): Promise<void> {
  const path = 'config/layout';
  try {
    await setDoc(doc(db, 'config', 'layout'), {
      layout,
      sprites,
      updatedBy: uid,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function clearGlobalLayoutCloud(): Promise<void> {
  const path = 'config/layout';
  try {
    await deleteDoc(doc(db, 'config', 'layout'));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
