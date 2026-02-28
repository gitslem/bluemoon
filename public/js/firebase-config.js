/**
 * BlueMoon — Firebase Configuration
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.firebase.google.com
 * 2. Create a new project (or select existing)
 * 3. Add a Web app from Project Settings
 * 4. Copy your config values below
 * 5. Enable Firestore Database (in production mode)
 * 6. Enable Google Analytics (optional, for tracking)
 */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

export default firebaseConfig;
