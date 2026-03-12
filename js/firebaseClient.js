import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  getAuth,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  update
} from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
};

let firebaseServices = null;
let presenceCleanup = null;
let latestPresenceUid = null;

function hasAllConfigValues() {
  return Object.values(firebaseConfig).every(Boolean);
}

function ensureServices() {
  if (!hasAllConfigValues()) {
    throw new Error('Firebase environment variables are missing.');
  }

  if (!firebaseServices) {
    const app = initializeApp(firebaseConfig);
    firebaseServices = {
      app,
      auth: getAuth(app),
      db: getDatabase(app)
    };
  }

  return firebaseServices;
}

export function isFirebaseEnabled() {
  return hasAllConfigValues();
}

export function getFirebaseAuth() {
  return ensureServices().auth;
}

export function getFirebaseDb() {
  return ensureServices().db;
}

export async function ensureSignedInGuest() {
  const auth = getFirebaseAuth();
  if (auth.currentUser) return auth.currentUser;

  const credential = await signInAnonymously(auth);
  return credential.user;
}

export function subscribeToAuth(callback) {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export async function getIdToken(forceRefresh = false) {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function linkGuestAccount(email, password) {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) {
    throw new Error('No guest session is active.');
  }

  const credential = EmailAuthProvider.credential(email, password);
  await linkWithCredential(auth.currentUser, credential);
  return auth.currentUser;
}

export async function signInExistingAccount(email, password) {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signOutCurrentUser() {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export function subscribeToProfile(uid, callback) {
  return onValue(ref(getFirebaseDb(), `profiles/${uid}`), snapshot => {
    callback(snapshot.val());
  });
}

export function subscribeToQueue(uid, callback) {
  return onValue(ref(getFirebaseDb(), `queue/ranked/${uid}`), snapshot => {
    callback(snapshot.val());
  });
}

export function subscribeToMatch(matchId, callback) {
  return onValue(ref(getFirebaseDb(), `matches/${matchId}`), snapshot => {
    callback(snapshot.val());
  });
}

export function subscribeToPresence(uid, callback) {
  return onValue(ref(getFirebaseDb(), `presence/${uid}`), snapshot => {
    callback(snapshot.val());
  });
}

export function subscribeToLeaderboard(callback) {
  return onValue(ref(getFirebaseDb(), 'leaderboard'), snapshot => {
    const value = snapshot.val() || {};
    const rows = Object.values(value).sort((left, right) => {
      if (right.duelingRating !== left.duelingRating) {
        return right.duelingRating - left.duelingRating;
      }
      return (right.gamesPlayed || 0) - (left.gamesPlayed || 0);
    });
    callback(rows);
  });
}

export function subscribeToConnection(callback) {
  return onValue(ref(getFirebaseDb(), '.info/connected'), snapshot => {
    callback(Boolean(snapshot.val()));
  });
}

export async function publishPresence(uid, currentMatchId = null) {
  latestPresenceUid = uid;

  const db = getFirebaseDb();
  const presenceRef = ref(db, `presence/${uid}`);
  const disconnectHandler = onDisconnect(presenceRef);
  await disconnectHandler.update({
    connected: false,
    currentMatchId,
    lastSeenAt: serverTimestamp()
  });

  await update(presenceRef, {
    connected: true,
    currentMatchId,
    lastSeenAt: serverTimestamp()
  });

  presenceCleanup = async () => {
    try {
      await disconnectHandler.cancel();
    } catch {
      // Ignore disconnect cleanup failures when the tab closes.
    }
  };
}

export async function clearPresence(matchId = null) {
  if (!latestPresenceUid) return;

  const presenceRef = ref(getFirebaseDb(), `presence/${latestPresenceUid}`);
  await update(presenceRef, {
    connected: true,
    currentMatchId: matchId,
    lastSeenAt: serverTimestamp()
  });
}

export async function disposePresence() {
  if (presenceCleanup) {
    await presenceCleanup();
    presenceCleanup = null;
  }
}
