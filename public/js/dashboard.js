/**
 * BlueMoon — Dashboard Module
 * User dashboard logic: referrals, earnings, payment requests, profile
 */

import { initAuth, onAuthChange, getUserData, logOut, formatNaira, getRewardAmount, esc, getFirestoreMod } from './auth.js';

let db, currentUser, userData;
let unsubReferrals, unsubTransactions, unsubUserDoc, unsubNotifications, unsubPayments;
// Firestore functions — populated after initAuth()
let doc, updateDoc, collection, query, where, orderBy, onSnapshot, addDoc;

const NIGERIAN_BANKS = [
    'Access Bank', 'Citibank Nigeria', 'Ecobank Nigeria', 'Fidelity Bank',
    'First Bank of Nigeria', 'First City Monument Bank (FCMB)', 'Globus Bank',
    'Guaranty Trust Bank (GTBank)', 'Heritage Bank', 'Jaiz Bank', 'Keystone Bank',
    'Kuda Bank', 'OPay', 'PalmPay', 'Polaris Bank', 'Providus Bank',
    'Stanbic IBTC Bank', 'Standard Chartered Bank', 'Sterling Bank',
    'Titan Trust Bank', 'Union Bank of Nigeria', 'United Bank for Africa (UBA)',
    'Unity Bank', 'VFD Microfinance Bank', 'Wema Bank', 'Zenith Bank'
];

export async function initDashboard() {
    const { db: fireDb } = await initAuth();
    db = fireDb;

    // Get Firestore functions from the dynamically loaded module
    const store = getFirestoreMod();
    doc = store.doc;
    updateDoc = store.updateDoc;
    collection = store.collection;
    query = store.query;
    where = store.where;
    orderBy = store.orderBy;
    onSnapshot = store.onSnapshot;
    addDoc = store.addDoc;

    onAuthChange(async (user) => {
        if (!user) {
            window.location.href = '/register.html';
            return;
        }
        currentUser = user;
        userData = await getUserData(user.uid);
        if (!userData) {
            window.location.href = '/register.html';
            return;
        }
        if (userData.isAdmin) {
            document.getElementById('adminLink').style.display = 'flex';
        }
        renderHeader();
        setupNavigation();
        loadOverview();
        listenReferrals();
        listenTransactions();
        listenNotifications();
        loadPaymentSection();
        loadProfile();
        document.getElementById('pageLoading').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
    });
}

function renderHeader() {
    document.getElementById('userName').textContent = userData.displayName || 'User';
}

// ─── Navigation ───
function setupNavigation() {
    const links = document.querySelectorAll('.sidebar-nav a[data-section]');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.getElementById(link.dataset.section).classList.add('active');
            document.querySelector('.sidebar')?.classList.remove('open');
            document.querySelector('.sidebar-overlay')?.classList.remove('open');
        });
    });

    document.getElementById('menuToggle')?.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
        document.querySelector('.sidebar-overlay').classList.toggle('open');
    });
    document.querySelector('.sidebar-overlay')?.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.remove('open');
        document.querySelector('.sidebar-overlay').classList.remove('open');
    });

    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        logOut();
    });
    document.getElementById('logoutTopBtn')?.addEventListener('click', () => logOut());
}

// ─── Overview ───
function loadOverview() {
    document.getElementById('statEarnings').textContent = formatNaira(userData.totalEarnings);
    document.getElementById('statBalance').textContent = formatNaira(userData.availableBalance);
    document.getElementById('statReferrals').textContent = userData.totalReferrals || 0;
    document.getElementById('statQualified').textContent = userData.qualifiedReferrals || 0;

    // Referral code
    document.getElementById('myReferralCode').textContent = userData.referralCode;
    const referralLink = `${window.location.origin}/register.html?ref=${userData.referralCode}`;
    document.getElementById('myReferralLink').textContent = referralLink;

    document.getElementById('copyCodeBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(userData.referralCode)
            .then(() => showToast('Referral code copied!'))
            .catch(() => {
                // Fallback for browsers without clipboard API
                const input = document.createElement('input');
                input.value = userData.referralCode;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                showToast('Referral code copied!');
            });
    });
    document.getElementById('copyLinkBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(referralLink)
            .then(() => showToast('Referral link copied!'))
            .catch(() => {
                const input = document.createElement('input');
                input.value = referralLink;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                showToast('Referral link copied!');
            });
    });
    document.getElementById('shareWhatsApp').addEventListener('click', () => {
        const text = `Join BlueMoon Laundry and get \u20A6500 bonus on your first service! Use my referral code: ${userData.referralCode}\n\nSign up here: ${referralLink}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    });

    updateTierProgress();
}

function updateTierProgress() {
    const q = userData.qualifiedReferrals || 0;
    const progressPct = Math.min((q / 10) * 100, 100);
    document.getElementById('tierBarFill').style.width = progressPct + '%';

    const step1 = document.getElementById('tierStep1');
    const step2 = document.getElementById('tierStep2');
    const step3 = document.getElementById('tierStep3');

    step1.className = 'tier-step ' + (q >= 1 ? 'completed' : 'active');
    step2.className = 'tier-step ' + (q >= 5 ? 'completed' : q >= 1 ? 'active' : '');
    step3.className = 'tier-step ' + (q >= 10 ? 'completed' : q >= 5 ? 'active' : '');

    const currentReward = getRewardAmount(q);
    document.getElementById('currentTierReward').textContent = formatNaira(currentReward);
}

// ─── Referrals (real-time) ───
function listenReferrals() {
    if (unsubReferrals) unsubReferrals();

    const q = query(
        collection(db, 'referrals'),
        where('referrerId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );

    unsubReferrals = onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('referralTableBody');
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:32px;">No referrals yet. Share your code to start earning!</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        let totalRefs = 0, qualifiedRefs = 0;
        snapshot.forEach(docSnap => {
            const r = docSnap.data();
            totalRefs++;
            if (r.status !== 'pending') qualifiedRefs++;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(r.referredName) || 'User'}</td>
                <td>${esc(r.referredEmail || r.referredPhone) || '\u2014'}</td>
                <td><span class="badge badge-${esc(r.status)}">${esc(r.status)}</span></td>
                <td>${esc(r.serviceName) || '\u2014'}</td>
                <td>${r.referrerReward ? formatNaira(r.referrerReward) : '\u2014'}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('statReferrals').textContent = totalRefs;
        document.getElementById('statQualified').textContent = qualifiedRefs;
        userData.totalReferrals = totalRefs;
        userData.qualifiedReferrals = qualifiedRefs;
        updateTierProgress();
    }, (err) => {
        console.error('Referrals listener error:', err);
    });
}

// ─── Transactions (real-time) ───
function listenTransactions() {
    if (unsubTransactions) unsubTransactions();
    if (unsubUserDoc) unsubUserDoc();

    const q = query(
        collection(db, 'transactions'),
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );

    unsubTransactions = onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('transactionTableBody');
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px;">No transactions yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const t = docSnap.data();
            const tr = document.createElement('tr');
            const typeLabels = {
                referral_reward: 'Referral Reward',
                referred_bonus: 'Welcome Bonus',
                milestone_bonus: 'Milestone Bonus',
                payment: 'Payment'
            };
            const isCredit = t.type !== 'payment';
            tr.innerHTML = `
                <td>${esc(typeLabels[t.type] || t.type)}</td>
                <td>${esc(t.description) || '\u2014'}</td>
                <td style="color:${isCredit ? 'var(--success)' : 'var(--danger)'}">${isCredit ? '+' : '-'}${formatNaira(t.amount)}</td>
                <td>${new Date(t.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
            `;
            tbody.appendChild(tr);
        });
    }, (err) => {
        console.error('Transactions listener error:', err);
    });

    // Listen to user doc for balance updates
    unsubUserDoc = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            userData = data;
            document.getElementById('statBalance').textContent = formatNaira(data.availableBalance);
            document.getElementById('statEarnings').textContent = formatNaira(data.totalEarnings);
            renderHeader();
        }
    }, (err) => {
        console.error('User doc listener error:', err);
    });
}

// ─── Notifications (real-time) ───
function listenNotifications() {
    if (unsubNotifications) unsubNotifications();

    const q = query(
        collection(db, 'notifications'),
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );

    unsubNotifications = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('notificationList');
        if (snapshot.empty) {
            list.innerHTML = '<div class="empty-state"><p>No updates yet.</p></div>';
            return;
        }

        list.innerHTML = '';
        snapshot.forEach(docSnap => {
            const n = docSnap.data();
            const li = document.createElement('li');
            li.className = 'notification-item';
            li.innerHTML = `
                <span class="notification-dot ${n.read ? 'read' : ''}"></span>
                <div>
                    <div class="notification-text">${esc(n.message)}</div>
                    <div class="notification-time">${new Date(n.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
            `;
            list.appendChild(li);
        });
    }, (err) => {
        console.error('Notifications listener error:', err);
    });
}

// ─── Payment Section ───
function loadPaymentSection() {
    const bankSelect = document.getElementById('bankName');
    NIGERIAN_BANKS.forEach(bank => {
        const opt = document.createElement('option');
        opt.value = bank;
        opt.textContent = bank;
        bankSelect.appendChild(opt);
    });

    if (userData.bankDetails) {
        bankSelect.value = userData.bankDetails.bankName || '';
        document.getElementById('accountNumber').value = userData.bankDetails.accountNumber || '';
        document.getElementById('accountName').value = userData.bankDetails.accountName || '';
    }

    document.getElementById('saveBankBtn').addEventListener('click', async () => {
        const bankName = bankSelect.value;
        const accountNumber = document.getElementById('accountNumber').value.trim();
        const accountName = document.getElementById('accountName').value.trim();

        if (!bankName || !accountNumber || !accountName) {
            showToast('Please fill in all bank details.', 'error');
            return;
        }
        if (!/^\d{10}$/.test(accountNumber)) {
            showToast('Account number must be 10 digits.', 'error');
            return;
        }

        const btn = document.getElementById('saveBankBtn');
        btn.disabled = true;
        try {
            await updateDoc(doc(db, 'users', currentUser.uid), {
                bankDetails: { bankName, accountNumber, accountName },
                updatedAt: new Date().toISOString()
            });
            userData.bankDetails = { bankName, accountNumber, accountName };
            showToast('Bank details saved!');
        } catch (err) {
            showToast('Failed to save bank details.', 'error');
        }
        btn.disabled = false;
    });

    document.getElementById('requestPaymentBtn').addEventListener('click', async () => {
        const amount = parseInt(document.getElementById('paymentAmount').value);
        if (!amount || amount < 1000) {
            showToast('Minimum withdrawal is \u20A61,000.', 'error');
            return;
        }
        if (amount > (userData.availableBalance || 0)) {
            showToast('Insufficient balance.', 'error');
            return;
        }
        if (!userData.bankDetails) {
            showToast('Please save your bank details first.', 'error');
            return;
        }

        const btn = document.getElementById('requestPaymentBtn');
        btn.disabled = true;

        try {
            await addDoc(collection(db, 'paymentRequests'), {
                userId: currentUser.uid,
                userName: userData.displayName,
                amount,
                bankDetails: userData.bankDetails,
                status: 'pending',
                adminNote: '',
                processedAt: null,
                createdAt: new Date().toISOString()
            });

            await updateDoc(doc(db, 'users', currentUser.uid), {
                availableBalance: (userData.availableBalance || 0) - amount,
                updatedAt: new Date().toISOString()
            });

            document.getElementById('paymentAmount').value = '';
            showToast('Payment request submitted! You will be credited shortly.');
        } catch (err) {
            showToast('Failed to submit request.', 'error');
        }
        btn.disabled = false;
    });

    listenPaymentRequests();
}

function listenPaymentRequests() {
    if (unsubPayments) unsubPayments();

    const q = query(
        collection(db, 'paymentRequests'),
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
    );

    unsubPayments = onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('paymentRequestsBody');
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px;">No payment requests yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const p = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatNaira(p.amount)}</td>
                <td>${esc(p.bankDetails.bankName)} \u2014 ${esc(p.bankDetails.accountNumber)}</td>
                <td><span class="badge badge-${esc(p.status)}">${esc(p.status)}</span></td>
                <td>${new Date(p.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
            `;
            tbody.appendChild(tr);
        });
    }, (err) => {
        console.error('Payment requests listener error:', err);
    });
}

// ─── Profile ───
function loadProfile() {
    document.getElementById('profileName').value = userData.displayName || '';
    document.getElementById('profileEmail').value = userData.email || '';
    document.getElementById('profilePhone').value = userData.phone || '';

    document.getElementById('saveProfileBtn').addEventListener('click', async () => {
        const displayName = document.getElementById('profileName').value.trim();
        const phone = document.getElementById('profilePhone').value.trim();

        if (!displayName) {
            showToast('Name cannot be empty.', 'error');
            return;
        }

        const btn = document.getElementById('saveProfileBtn');
        btn.disabled = true;
        try {
            await updateDoc(doc(db, 'users', currentUser.uid), {
                displayName,
                phone,
                updatedAt: new Date().toISOString()
            });
            userData.displayName = displayName;
            userData.phone = phone;
            renderHeader();
            showToast('Profile updated!');
        } catch (err) {
            showToast('Failed to update profile.', 'error');
        }
        btn.disabled = false;
    });
}

// ─── Toast ───
function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
