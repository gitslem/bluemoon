/**
 * BlueMoon — Admin Panel Module
 * Manage users, referrals, award credits, process payments
 */

import { initAuth, onAuthChange, getUserData, checkIsAdmin, logOut, formatNaira, getRewardAmount, getMilestoneBonus, getDbInstance } from './auth.js';
import { doc, updateDoc, collection, query, where, orderBy, onSnapshot, addDoc, getDocs, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

let db, currentUser;

export function initAdmin() {
    const { db: fireDb } = initAuth();
    db = fireDb;

    onAuthChange(async (user) => {
        if (!user) { window.location.href = '/register.html'; return; }
        currentUser = user;
        const isAdmin = await checkIsAdmin(user.uid);
        if (!isAdmin) { window.location.href = '/dashboard.html'; return; }

        setupNavigation();
        loadStats();
        listenUsers();
        listenReferrals();
        listenPaymentRequests();
        document.getElementById('pageLoading').style.display = 'none';
        document.getElementById('appContent').style.display = 'flex';
    });
}

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

    document.getElementById('logoutBtn')?.addEventListener('click', (e) => { e.preventDefault(); logOut(); });
    document.getElementById('logoutTopBtn')?.addEventListener('click', () => logOut());
}

// ─── Stats ───
function loadStats() {
    onSnapshot(collection(db, 'users'), (snap) => {
        document.getElementById('statTotalUsers').textContent = snap.size;
    });
    onSnapshot(collection(db, 'referrals'), (snap) => {
        let total = 0, qualified = 0;
        snap.forEach(d => { total++; if (d.data().status !== 'pending') qualified++; });
        document.getElementById('statTotalReferrals').textContent = total;
        document.getElementById('statQualifiedReferrals').textContent = qualified;
    });
    onSnapshot(collection(db, 'paymentRequests'), (snap) => {
        let pending = 0;
        snap.forEach(d => { if (d.data().status === 'pending') pending++; });
        document.getElementById('statPendingPayments').textContent = pending;
    });
}

// ─── Users ───
function listenUsers() {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';
        snap.forEach(docSnap => {
            const u = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.displayName || '—'}</td>
                <td>${u.email || u.phone || '—'}</td>
                <td><code style="color:var(--accent);font-size:0.8rem;">${u.referralCode}</code></td>
                <td>${u.totalReferrals || 0} (${u.qualifiedReferrals || 0} qualified)</td>
                <td>${formatNaira(u.totalEarnings)}</td>
                <td>${formatNaira(u.availableBalance)}</td>
                <td>
                    ${u.isAdmin ? '<span class="badge badge-credited">Admin</span>' : `<button class="btn btn-sm btn-secondary make-admin-btn" data-uid="${docSnap.id}">Make Admin</button>`}
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Bind make admin buttons
        tbody.querySelectorAll('.make-admin-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Make this user an admin?')) return;
                await updateDoc(doc(db, 'users', btn.dataset.uid), { isAdmin: true });
                showToast('User promoted to admin.');
            });
        });
    });
}

// ─── Referrals ───
function listenReferrals() {
    const q = query(collection(db, 'referrals'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => {
        const tbody = document.getElementById('referralsTableBody');
        tbody.innerHTML = '';
        snap.forEach(docSnap => {
            const r = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${r.referrerName || '—'}</td>
                <td>${r.referredName || '—'}</td>
                <td>${r.referredEmail || r.referredPhone || '—'}</td>
                <td><span class="badge badge-${r.status}">${r.status}</span></td>
                <td>${r.serviceName || '—'}</td>
                <td>${r.referrerReward ? formatNaira(r.referrerReward) : '—'}</td>
                <td class="action-cell" data-id="${docSnap.id}" data-referrer="${r.referrerId}" data-referred="${r.referredUserId}" data-status="${r.status}"></td>
            `;
            tbody.appendChild(tr);
        });

        // Build action buttons
        tbody.querySelectorAll('.action-cell').forEach(cell => {
            const status = cell.dataset.status;
            const refId = cell.dataset.id;
            const referrerId = cell.dataset.referrer;
            const referredId = cell.dataset.referred;

            if (status === 'pending') {
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm btn-primary';
                btn.textContent = 'Mark Qualified';
                btn.addEventListener('click', () => openQualifyModal(refId, referrerId, referredId));
                cell.appendChild(btn);
            } else if (status === 'qualified') {
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm btn-success';
                btn.textContent = 'Award Credit';
                btn.addEventListener('click', () => awardCredit(refId, referrerId, referredId));
                cell.appendChild(btn);
            } else {
                cell.innerHTML = '<span style="color:var(--success);font-size:0.8rem;">Done</span>';
            }
        });
    });
}

// ─── Qualify Modal ───
function openQualifyModal(refId, referrerId, referredId) {
    const serviceName = prompt('Enter the service name used (e.g. "Dry Cleaning", "Laundry"):');
    if (!serviceName) return;
    qualifyReferral(refId, referrerId, referredId, serviceName);
}

async function qualifyReferral(refId, referrerId, referredId, serviceName) {
    try {
        // Update referral status
        await updateDoc(doc(db, 'referrals', refId), {
            status: 'qualified',
            serviceUsed: true,
            serviceName: serviceName,
            qualifiedAt: new Date().toISOString()
        });

        // Update referrer's qualified count
        const referrerDoc = await getDoc(doc(db, 'users', referrerId));
        if (referrerDoc.exists()) {
            const data = referrerDoc.data();
            await updateDoc(doc(db, 'users', referrerId), {
                qualifiedReferrals: (data.qualifiedReferrals || 0) + 1,
                updatedAt: new Date().toISOString()
            });
        }

        // Award ₦500 bonus to referred user (first service)
        const referredDoc = await getDoc(doc(db, 'users', referredId));
        if (referredDoc.exists()) {
            const referredData = referredDoc.data();
            // Check if they haven't already received the welcome bonus
            const existingBonus = await getDocs(query(
                collection(db, 'transactions'),
                where('userId', '==', referredId),
                where('type', '==', 'referred_bonus')
            ));
            if (existingBonus.empty && referredData.referredBy) {
                await addDoc(collection(db, 'transactions'), {
                    userId: referredId,
                    type: 'referred_bonus',
                    amount: 500,
                    description: `Welcome bonus for first service (${serviceName})`,
                    referralId: refId,
                    status: 'completed',
                    createdAt: new Date().toISOString()
                });
                await updateDoc(doc(db, 'users', referredId), {
                    totalEarnings: (referredData.totalEarnings || 0) + 500,
                    availableBalance: (referredData.availableBalance || 0) + 500,
                    updatedAt: new Date().toISOString()
                });
                // Notify referred user
                await addDoc(collection(db, 'notifications'), {
                    userId: referredId,
                    message: `You earned ₦500 welcome bonus for your first service (${serviceName}). Thank you for choosing BlueMoon!`,
                    read: false,
                    createdAt: new Date().toISOString()
                });
            }
        }

        // Notify referrer
        await addDoc(collection(db, 'notifications'), {
            userId: referrerId,
            message: `Your referral has used BlueMoon services (${serviceName}). The referral is now qualified! Click "Award Credit" in your dashboard to claim.`,
            read: false,
            createdAt: new Date().toISOString()
        });

        showToast('Referral marked as qualified! You can now award credit.');
    } catch (err) {
        console.error(err);
        showToast('Failed to qualify referral.', 'error');
    }
}

async function awardCredit(refId, referrerId, referredId) {
    try {
        const referrerDoc = await getDoc(doc(db, 'users', referrerId));
        if (!referrerDoc.exists()) { showToast('Referrer not found.', 'error'); return; }
        const referrerData = referrerDoc.data();
        const qualifiedCount = referrerData.qualifiedReferrals || 0;
        const rewardAmount = getRewardAmount(qualifiedCount - 1); // current tier based on count before this one
        const milestoneBonus = getMilestoneBonus(qualifiedCount);

        // Award referral reward
        await addDoc(collection(db, 'transactions'), {
            userId: referrerId,
            type: 'referral_reward',
            amount: rewardAmount,
            description: `Referral reward (referral #${qualifiedCount})`,
            referralId: refId,
            status: 'completed',
            createdAt: new Date().toISOString()
        });

        let totalReward = rewardAmount;

        // Milestone bonus
        if (milestoneBonus > 0) {
            await addDoc(collection(db, 'transactions'), {
                userId: referrerId,
                type: 'milestone_bonus',
                amount: milestoneBonus,
                description: `Milestone bonus for reaching ${qualifiedCount} referrals!`,
                referralId: refId,
                status: 'completed',
                createdAt: new Date().toISOString()
            });
            totalReward += milestoneBonus;
        }

        // Update user balance
        await updateDoc(doc(db, 'users', referrerId), {
            totalEarnings: (referrerData.totalEarnings || 0) + totalReward,
            availableBalance: (referrerData.availableBalance || 0) + totalReward,
            updatedAt: new Date().toISOString()
        });

        // Update referral as credited
        await updateDoc(doc(db, 'referrals', refId), {
            status: 'credited',
            referrerReward: rewardAmount,
            creditedAt: new Date().toISOString()
        });

        // Notify referrer
        let notifMsg = `You earned ${formatNaira(rewardAmount)} for referral #${qualifiedCount}!`;
        if (milestoneBonus > 0) {
            notifMsg += ` Plus a ${formatNaira(milestoneBonus)} milestone bonus for reaching ${qualifiedCount} referrals!`;
        }
        await addDoc(collection(db, 'notifications'), {
            userId: referrerId,
            message: notifMsg,
            read: false,
            createdAt: new Date().toISOString()
        });

        showToast(`Credited ${formatNaira(totalReward)} to referrer!`);
    } catch (err) {
        console.error(err);
        showToast('Failed to award credit.', 'error');
    }
}

// ─── Payment Requests ───
function listenPaymentRequests() {
    const q = query(collection(db, 'paymentRequests'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => {
        const tbody = document.getElementById('paymentsTableBody');
        tbody.innerHTML = '';
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">No payment requests.</td></tr>';
            return;
        }
        snap.forEach(docSnap => {
            const p = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.userName || '—'}</td>
                <td>${formatNaira(p.amount)}</td>
                <td>${p.bankDetails.bankName}</td>
                <td>${p.bankDetails.accountNumber}</td>
                <td>${p.bankDetails.accountName}</td>
                <td><span class="badge badge-${p.status}">${p.status}</span></td>
                <td class="payment-action-cell" data-id="${docSnap.id}" data-uid="${p.userId}" data-status="${p.status}" data-amount="${p.amount}"></td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.payment-action-cell').forEach(cell => {
            if (cell.dataset.status !== 'pending') {
                cell.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">${cell.dataset.status}</span>`;
                return;
            }
            const approveBtn = document.createElement('button');
            approveBtn.className = 'btn btn-sm btn-success';
            approveBtn.textContent = 'Approve';
            approveBtn.style.marginRight = '6px';
            approveBtn.addEventListener('click', () => processPayment(cell.dataset.id, cell.dataset.uid, Number(cell.dataset.amount), 'completed'));

            const rejectBtn = document.createElement('button');
            rejectBtn.className = 'btn btn-sm btn-danger';
            rejectBtn.textContent = 'Reject';
            rejectBtn.addEventListener('click', () => processPayment(cell.dataset.id, cell.dataset.uid, Number(cell.dataset.amount), 'rejected'));

            cell.appendChild(approveBtn);
            cell.appendChild(rejectBtn);
        });
    });
}

async function processPayment(requestId, userId, amount, action) {
    const note = action === 'rejected' ? (prompt('Reason for rejection (optional):') || '') : '';
    try {
        await updateDoc(doc(db, 'paymentRequests', requestId), {
            status: action,
            adminNote: note,
            processedAt: new Date().toISOString()
        });

        if (action === 'completed') {
            // Record payment transaction
            await addDoc(collection(db, 'transactions'), {
                userId: userId,
                type: 'payment',
                amount: amount,
                description: `Withdrawal to bank account`,
                status: 'completed',
                createdAt: new Date().toISOString()
            });

            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                await updateDoc(doc(db, 'users', userId), {
                    paidOut: (userDoc.data().paidOut || 0) + amount,
                    updatedAt: new Date().toISOString()
                });
            }

            await addDoc(collection(db, 'notifications'), {
                userId: userId,
                message: `Your payment of ${formatNaira(amount)} has been processed and sent to your bank account.`,
                read: false,
                createdAt: new Date().toISOString()
            });
            showToast('Payment approved and processed!');
        } else {
            // Refund balance on rejection
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                await updateDoc(doc(db, 'users', userId), {
                    availableBalance: (userDoc.data().availableBalance || 0) + amount,
                    updatedAt: new Date().toISOString()
                });
            }
            await addDoc(collection(db, 'notifications'), {
                userId: userId,
                message: `Your payment request of ${formatNaira(amount)} was declined. ${note ? 'Reason: ' + note : ''} Your balance has been restored.`,
                read: false,
                createdAt: new Date().toISOString()
            });
            showToast('Payment rejected. Balance restored.');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to process payment.', 'error');
    }
}

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
