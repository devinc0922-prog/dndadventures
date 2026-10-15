// Shared Firebase helpers: Google sign-in, the member allowlist, and character storage.
// Firestore layout:
//   members/{email}     { name, role: "dm" | "player" }      (doc id = lowercase Google email)
//   characters/{id}     { owner, ownerName, name, summary, build (JSON text), state (JSON text), updated }
import { firebaseConfig, isConfigured } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, onSnapshot, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export { isConfigured };

let app, auth, db;
function init() {
  if (!isConfigured) throw new Error("Firebase is not configured yet. Fill in assets/js/firebase-config.js.");
  if (!app) { app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); }
}

/* ---------- auth ---------- */
// cb({ user, email, member }) — member is null when signed in but not on the allowlist; user is null when signed out.
export function watchSession(cb) {
  init();
  return onAuthStateChanged(auth, async user => {
    if (!user) return cb({ user: null, email: null, member: null });
    const email = (user.email || "").toLowerCase();
    let member = null;
    try { const snap = await getDoc(doc(db, "members", email)); if (snap.exists()) member = snap.data(); }
    catch (e) { /* not a member: rules deny the read */ }
    cb({ user, email, member });
  });
}
export async function signIn() { init(); await signInWithPopup(auth, new GoogleAuthProvider()); }
export async function signOut() { init(); await fbSignOut(auth); }

/* ---------- members (DM only can change) ---------- */
export function watchMembers(cb, onError) {
  init();
  return onSnapshot(collection(db, "members"), s => cb(s.docs.map(d => ({ email: d.id, ...d.data() }))), onError);
}
export function addMember(email, name, role = "player") {
  init();
  return setDoc(doc(db, "members", email.trim().toLowerCase()), { name: name.trim(), role });
}
export function removeMember(email) { init(); return deleteDoc(doc(db, "members", email)); }

/* ---------- characters ---------- */
function summaryOf(build) {
  return { name: build.name || "Unnamed adventurer", summary: [build.tagline, build.classLine].filter(Boolean).join(" · "), maxHp: build.maxHp || 10 };
}
export function watchCharacters(cb, onError) {
  init();
  return onSnapshot(query(collection(db, "characters"), orderBy("name")), s =>
    cb(s.docs.map(d => { const x = d.data(); let state = {}; try { state = JSON.parse(x.state || "{}"); } catch (e) {}
      return { id: d.id, ...x, hp: state.hp, temp: state.temp }; })), onError);
}
export async function createCharacter(owner, ownerName, build) {
  init();
  const ref = await addDoc(collection(db, "characters"), {
    owner, ownerName, ...summaryOf(build), build: JSON.stringify(build), state: "", updated: serverTimestamp()
  });
  return ref.id;
}
// cb({ id, owner, ownerName, build, state, pending }) on every change, including our own writes (pending = true).
export function watchCharacter(id, cb, onError) {
  init();
  return onSnapshot(doc(db, "characters", id), { includeMetadataChanges: true }, snap => {
    if (!snap.exists()) return cb(null);
    const x = snap.data(); let build = {}, state = null;
    try { build = JSON.parse(x.build || "{}"); } catch (e) {}
    try { state = x.state ? JSON.parse(x.state) : null; } catch (e) {}
    cb({ id: snap.id, owner: x.owner, ownerName: x.ownerName, build, state, stateText: x.state || "", pending: snap.metadata.hasPendingWrites });
  }, onError);
}
export function saveState(id, state) {
  init();
  return updateDoc(doc(db, "characters", id), { state: JSON.stringify(state), updated: serverTimestamp() });
}
export function saveBuild(id, build) {
  init();
  return updateDoc(doc(db, "characters", id), { build: JSON.stringify(build), ...summaryOf(build), updated: serverTimestamp() });
}
export function deleteCharacter(id) { init(); return deleteDoc(doc(db, "characters", id)); }

/* ---------- small DOM helpers ---------- */
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function friendlyError(e) {
  const m = String((e && (e.code || e.message)) || e);
  if (/permission-denied|insufficient permissions/i.test(m)) return "You don't have access to that. Ask the DM to add your Google account to the party.";
  if (/popup-closed|cancelled-popup/i.test(m)) return "Sign-in was closed before it finished.";
  if (/unauthorized-domain/i.test(m)) return "This site's address isn't on Firebase's authorized domains list yet (see SETUP.md, step 4).";
  if (/popup-blocked/i.test(m)) return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
  return m;
}
