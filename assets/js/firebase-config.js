// Firebase web app settings.
// Get these from the Firebase console: Project settings → General → Your apps → (web app) → SDK setup and configuration → Config.
// These values are not secrets. Access is controlled by firestore.rules, not by hiding this file.
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "dnd-firebase.firebaseapp.com",
  projectId: "dnd-firebase",
  storageBucket: "dnd-firebase.firebasestorage.app",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

export const isConfigured = !Object.values(firebaseConfig).some(v => String(v).startsWith("PASTE_"));
