/**
 * BlueMoon — Authentication Module
 * Handles user registration, login, and session management
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut as firebaseSignOut, RecaptchaVerifier, signInWithPhoneNumber } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, query, collection, where, getDocs } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';
import firebaseConfig from './firebase-config.js';

let app, auth, db;

export function initAuth() {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    return { app, auth, db };
}

export function getAuthInstance() { return auth; }
export function getDbInstance() { return db; }

export function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'BM-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function ensureUniqueReferralCode() {
    let code, exists = true;
    while (exists) {
        code = generateReferralCode();
        const q = query(collection(db, 'users'), where('referralCode', '==', code));
        const snap = await getDocs(q);
        exists = !snap.empty;
    }
    return code;
}

export async function signUpWithEmail(email, password, displayName, phone, referralCode) {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;
    const myReferralCode = await ensureUniqueReferralCode();

    const userData = {
        uid,
        email: email.toLowerCase().trim(),
        phone: phone || '',
        displayName: displayName || '',
        referralCode: myReferralCode,
        referredBy: referralCode || '',
        totalReferrals: 0,
        qualifiedReferrals: 0,
        totalEarnings: 0,
        availableBalance: 0,
        paidOut: 0,
        bankDetails: null,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'users', uid), userData);

    if (referralCode) {
        const q = query(collection(db, 'users'), where('referralCode', '==', referralCode));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const referrerDoc = snap.docs[0];
            await setDoc(doc(db, 'referrals', `${referrerDoc.id}_${uid}`), {
                referrerId: referrerDoc.id,
                referrerName: referrerDoc.data().displayName,
                referredUserId: uid,
                referredName: displayName,
                referredEmail: email.toLowerCase().trim(),
                referredPhone: phone || '',
                referralCode: referralCode,
                status: 'pending',
                serviceUsed: false,
                serviceName: '',
                referrerReward: 0,
                referredReward: 0,
                qualifiedAt: null,
                creditedAt: null,
                createdAt: new Date().toISOString()
            });
        }
    }

    return { uid, referralCode: myReferralCode };
}

export async function signInWithEmail(email, password) {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    return userCred.user;
}

export function setupRecaptcha(buttonId) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
        size: 'invisible',
        callback: () => {}
    });
    return window.recaptchaVerifier;
}

export async function sendPhoneOTP(phoneNumber) {
    const appVerifier = window.recaptchaVerifier;
    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
    window.confirmationResult = confirmationResult;
    return confirmationResult;
}

export async function verifyPhoneOTP(otp, displayName, referralCode) {
    const result = await window.confirmationResult.confirm(otp);
    const uid = result.user.uid;
    const userDoc = await getDoc(doc(db, 'users', uid));

    if (!userDoc.exists()) {
        const myReferralCode = await ensureUniqueReferralCode();
        const userData = {
            uid,
            email: '',
            phone: result.user.phoneNumber || '',
            displayName: displayName || '',
            referralCode: myReferralCode,
            referredBy: referralCode || '',
            totalReferrals: 0,
            qualifiedReferrals: 0,
            totalEarnings: 0,
            availableBalance: 0,
            paidOut: 0,
            bankDetails: null,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', uid), userData);

        if (referralCode) {
            const q = query(collection(db, 'users'), where('referralCode', '==', referralCode));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const referrerDoc = snap.docs[0];
                await setDoc(doc(db, 'referrals', `${referrerDoc.id}_${uid}`), {
                    referrerId: referrerDoc.id,
                    referrerName: referrerDoc.data().displayName,
                    referredUserId: uid,
                    referredName: displayName,
                    referredEmail: '',
                    referredPhone: result.user.phoneNumber || '',
                    referralCode: referralCode,
                    status: 'pending',
                    serviceUsed: false,
                    serviceName: '',
                    referrerReward: 0,
                    referredReward: 0,
                    qualifiedAt: null,
                    creditedAt: null,
                    createdAt: new Date().toISOString()
                });
            }
        }
    }

    return result.user;
}

export async function logOut() {
    await firebaseSignOut(auth);
    window.location.href = '/register.html';
}

export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

export async function getUserData(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
}

export async function checkIsAdmin(uid) {
    const data = await getUserData(uid);
    return data?.isAdmin === true;
}

export function formatNaira(amount) {
    return '\u20A6' + Number(amount || 0).toLocaleString('en-NG');
}

export function getRewardAmount(qualifiedReferrals) {
    if (qualifiedReferrals >= 5) return 3000;
    return 2000;
}

export function getMilestoneBonus(qualifiedReferrals) {
    if (qualifiedReferrals === 10) return 10000;
    return 0;
}
