/**
 * BlueMoon — Authentication Module
 * Handles user registration, login, and session management
 *
 * Uses DYNAMIC imports so this module loads even if Firebase CDN is slow/blocked.
 * All Firebase functions are loaded inside initAuth() — nothing at the top level.
 */

let app, auth, db;

// Store Firebase SDK references after dynamic loading
let _appMod, _authMod, _storeMod;

export async function initAuth() {
    const { firebaseConfig: config } = await import('./firebase-config.js');

    const [appMod, authMod, storeMod] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js')
    ]);

    _appMod = appMod;
    _authMod = authMod;
    _storeMod = storeMod;

    if (appMod.getApps().length === 0) {
        app = appMod.initializeApp(config);
    } else {
        app = appMod.getApps()[0];
    }
    auth = authMod.getAuth(app);
    db = storeMod.getFirestore(app);
    return { app, auth, db };
}

export function getAuthInstance() { return auth; }
export function getDbInstance() { return db; }
export function getFirestoreMod() { return _storeMod; }

/** Escape HTML to prevent XSS when inserting user data into innerHTML */
export function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'BM-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Check referralCodes collection (not users) — any authenticated user can read this.
 * Falls back to a timestamped code if uniqueness check fails repeatedly.
 */
async function ensureUniqueReferralCode() {
    for (let i = 0; i < 10; i++) {
        const code = generateReferralCode();
        const snap = await _storeMod.getDoc(_storeMod.doc(db, 'referralCodes', code));
        if (!snap.exists()) return code;
    }
    // Fallback: append timestamp fragment to guarantee uniqueness
    return generateReferralCode() + Date.now().toString(36).slice(-3).toUpperCase();
}

export async function signUpWithEmail(email, password, displayName, phone, referralCode) {
    const userCred = await _authMod.createUserWithEmailAndPassword(auth, email, password);
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

    // Write user profile and referral code (both must succeed)
    await _storeMod.setDoc(_storeMod.doc(db, 'users', uid), userData);
    await _storeMod.setDoc(_storeMod.doc(db, 'referralCodes', myReferralCode), {
        uid,
        displayName: displayName || ''
    });

    // If user was referred, look up referrer via referralCodes collection
    if (referralCode) {
        const refCodeDoc = await _storeMod.getDoc(_storeMod.doc(db, 'referralCodes', referralCode));
        if (refCodeDoc.exists()) {
            const referrer = refCodeDoc.data();
            await _storeMod.setDoc(_storeMod.doc(db, 'referrals', `${referrer.uid}_${uid}`), {
                referrerId: referrer.uid,
                referrerName: referrer.displayName,
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
    const userCred = await _authMod.signInWithEmailAndPassword(auth, email, password);
    return userCred.user;
}

export function setupRecaptcha(buttonId) {
    if (window.recaptchaVerifier) return window.recaptchaVerifier;
    window.recaptchaVerifier = new _authMod.RecaptchaVerifier(auth, buttonId, {
        size: 'invisible',
        callback: () => {}
    });
    return window.recaptchaVerifier;
}

export async function sendPhoneOTP(phoneNumber) {
    const appVerifier = window.recaptchaVerifier;
    const confirmationResult = await _authMod.signInWithPhoneNumber(auth, phoneNumber, appVerifier);
    window.confirmationResult = confirmationResult;
    return confirmationResult;
}

export async function verifyPhoneOTP(otp, displayName, referralCode) {
    const result = await window.confirmationResult.confirm(otp);
    const uid = result.user.uid;
    const userDoc = await _storeMod.getDoc(_storeMod.doc(db, 'users', uid));

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
        await _storeMod.setDoc(_storeMod.doc(db, 'users', uid), userData);
        await _storeMod.setDoc(_storeMod.doc(db, 'referralCodes', myReferralCode), {
            uid,
            displayName: displayName || ''
        });

        if (referralCode) {
            const refCodeDoc = await _storeMod.getDoc(_storeMod.doc(db, 'referralCodes', referralCode));
            if (refCodeDoc.exists()) {
                const referrer = refCodeDoc.data();
                await _storeMod.setDoc(_storeMod.doc(db, 'referrals', `${referrer.uid}_${uid}`), {
                    referrerId: referrer.uid,
                    referrerName: referrer.displayName,
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
    await _authMod.signOut(auth);
    window.location.href = '/register.html';
}

export function onAuthChange(callback) {
    return _authMod.onAuthStateChanged(auth, callback);
}

export async function getUserData(uid) {
    const snap = await _storeMod.getDoc(_storeMod.doc(db, 'users', uid));
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
