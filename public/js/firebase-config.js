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
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBI2vkpcRZw2SyRZqWNV-MIknUMoVILUtU",
  authDomain: "bluemoon-ng.firebaseapp.com",
  projectId: "bluemoon-ng",
  storageBucket: "bluemoon-ng.firebasestorage.app",
  messagingSenderId: "982381307468",
  appId: "1:982381307468:web:69c27c87f240d72e21f6e9",
  measurementId: "G-H79QBGJKZ2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
