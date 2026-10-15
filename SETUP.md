# Setup

One-time steps to connect the site to Firebase so sign-in and character sheets work. About 10 minutes.

The site itself is public on GitHub Pages: home page, adventure log, house rules. Character sheets are stored in Firebase and only load for Google accounts on the party list.

## 1. Turn on GitHub Pages

Repository **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and save. A minute later the site is live at:

`https://devinc0922-prog.github.io/dndadventures/`

## 2. Create the database

In the [Firebase console](https://console.firebase.google.com/), open the project.

1. **Build → Firestore Database → Create database.** Pick a location near you (for Florida, `us-east1`). Start in **production mode**.
2. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.

## 3. Turn on Google sign-in

**Build → Authentication → Get started → Sign-in method → Google → Enable**, choose a support email, and save.

## 4. Allow the site's address

Still in **Authentication → Settings → Authorized domains**, click **Add domain** and add:

`devinc0922-prog.github.io`

Without this, the sign-in popup fails with an "unauthorized domain" error.

## 5. Register the web app and paste its config

1. **Project settings** (gear icon) → **General** → *Your apps* → click the **</>** (Web) icon. Give it a nickname, and leave Firebase Hosting unchecked.
2. Firebase shows a `firebaseConfig` block. Copy the values into [`assets/js/firebase-config.js`](assets/js/firebase-config.js), replacing every `PASTE_…` placeholder. Check that `projectId` and `authDomain` match what Firebase shows. (Project IDs are often the name plus a suffix, like `dnd-firebase-1a2b3`.)
3. Commit the change. These values are safe to publish; the rules from step 2 are what protect the data.

## 6. Make yourself the DM

You have to add the first member by hand, because the rules only let a DM add members.

1. **Firestore Database → Data → Start collection**. Collection ID: `members`.
2. Document ID: your Google email, **all lowercase**.
3. Add two string fields: `name` = your name, `role` = `dm`. Save.

Then open the site's **Party** page and sign in. You'll see the *Players* panel, where you can add everyone else by their Google email.

## Adding and removing players later

Party page → *Players* panel. Adding someone gives them access right away; removing them cuts it off. Their characters stay.

## Troubleshooting

| Problem | Fix |
|---|---|
| Sign-in popup closes with "unauthorized domain" | Step 4 |
| Signed in but "not on the party list" | Their email must be added on the Party page, lowercase, exactly matching their Google account |
| "You don't have access" when loading | Rules not published (step 2), or the member doc is missing |
| Party page says Firebase isn't connected | Placeholders still in `assets/js/firebase-config.js` (step 5) |
