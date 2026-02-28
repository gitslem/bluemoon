/**
 * BlueMoon — Admin Panel Module
 * Manage users, referrals, award credits, process payments
 */

import { initAuth, onAuthChange, getUserData, checkIsAdmin, logOut, formatNaira, getRewardAmount, getMilestoneBonus, esc } from './auth.js';
import { doc, updateDoc, collection, query, where, orderBy, onSnapshot, addDoc, getDocs, getDoc } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

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
        document.getElementById('appContent').style.display = 'block';
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
                <td>${esc(u.displayName) || '\u2014'}</td>
                <td>${esc(u.email || u.phone) || '\u2014'}</td>
                <td><code style="color:var(--accent);font-size:0.8rem;">${esc(u.referralCode)}</code></td>
                <td>${u.totalReferrals || 0} (${u.qualifiedReferrals || 0} qualified)</td>
                <td>${formatNaira(u.totalEarnings)}</td>
                <td>${formatNaira(u.availableBalance)}</td>
                <td>
                    ${u.isAdmin ? '<span class="badge badge-credited">Admin</span>' : `<button class="btn btn-sm btn-secondary make-admin-btn" data-uid="${esc(docSnap.id)}">Make Admin</button>`}
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.make-admin-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Make this user an admin?')) return;
                btn.disabled = true;
                try {
                    await updateDoc(doc(db, 'users', btn.dataset.uid), { isAdmin: true });
                    showToast('User promoted to admin.');
                } catch (err) {
                    showToast('Failed to promote user.', 'error');
                    btn.disabled = false;
                }
            });
        });
    });
}

// ─── Referrals ───
function listenReferrals() {
    const q = query(collection(db, 'referrals'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => {
        const tbody = document.getElementById('referralsTableBody');
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">No referrals yet.</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        snap.forEach(docSnap => {
            const r = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(r.referrerName) || '\u2014'}</td>
                <td>${esc(r.referredName) || '\u2014'}</td>
                <td>${esc(r.referredEmail || r.referredPhone) || '\u2014'}</td>
                <td><span class="badge badge-${esc(r.status)}">${esc(r.status)}</span></td>
                <td>${esc(r.serviceName) || '\u2014'}</td>
                <td>${r.referrerReward ? formatNaira(r.referrerReward) : '\u2014'}</td>
                <td class="action-cell" data-id="${esc(docSnap.id)}" data-referrer="${esc(r.referrerId)}" data-referred="${esc(r.referredUserId)}" data-status="${esc(r.status)}"></td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.action-cell').forEach(cell => {
            const status = cell.dataset.status;
            const refId = cell.dataset.id;
            const referrerId = cell.dataset.referrer;
            const referredId = cell.dataset.referred;

            if (status === 'pending') {
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm btn-primary';
                btn.textContent = 'Mark Qualified';
                btn.addEventListener('click', () => openQualifyModal(refId, referrerId, referredId, btn));
                cell.appendChild(btn);
            } else if (status === 'qualified') {
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm btn-success';
                btn.textContent = 'Award Credit';
                btn.addEventListener('click', () => awardCredit(refId, referrerId, referredId, btn));
                cell.appendChild(btn);
            } else {
                cell.innerHTML = '<span style="color:var(--success);font-size:0.8rem;">Done</span>';
            }
        });
    });
}

// ─── Qualify Referral ───
function openQualifyModal(refId, referrerId, referredId, btn) {
    const serviceName = prompt('Enter the service name used (e.g. "Dry Cleaning", "Laundry"):');
    if (!serviceName || !serviceName.trim()) return;
    btn.disabled = true;
    btn.textContent = 'Processing...';
    qualifyReferral(refId, referrerId, referredId, serviceName.trim(), btn);
}

async function qualifyReferral(refId, referrerId, referredId, serviceName, btn) {
    try {
        // Update referral status
        await updateDoc(doc(db, 'referrals', refId), {
            status: 'qualified',
            serviceUsed: true,
            serviceName: serviceName,
            qualifiedAt: new Date().toISOString()
        });

        // Update referrer's counts
        const referrerDoc = await getDoc(doc(db, 'users', referrerId));
        if (referrerDoc.exists()) {
            const data = referrerDoc.data();
            await updateDoc(doc(db, 'users', referrerId), {
                totalReferrals: (data.totalReferrals || 0) + (data.totalReferrals === data.qualifiedReferrals ? 0 : 0),
                qualifiedReferrals: (data.qualifiedReferrals || 0) + 1,
                updatedAt: new Date().toISOString()
            });
        }

        // Award welcome bonus to referred user (first service only)
        const referredDoc = await getDoc(doc(db, 'users', referredId));
        if (referredDoc.exists()) {
            const referredData = referredDoc.data();
            if (referredData.referredBy) {
                // Check no existing welcome bonus
                const existingBonus = await getDocs(query(
                    collection(db, 'transactions'),
                    where('userId', '==', referredId),
                    where('type', '==', 'referred_bonus')
                ));
                if (existingBonus.empty) {
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
                    await addDoc(collection(db, 'notifications'), {
                        userId: referredId,
                        message: `You earned \u20A6500 welcome bonus for your first service (${serviceName}). Thank you for choosing BlueMoon!`,
                        read: false,
                        createdAt: new Date().toISOString()
                    });
                }
            }
        }

        // Notify referrer
        await addDoc(collection(db, 'notifications'), {
            userId: referrerId,
            message: `Your referral used BlueMoon services (${serviceName}). The referral is now qualified for credit!`,
            read: false,
            createdAt: new Date().toISOString()
        });

        showToast('Referral qualified! You can now award credit.');
    } catch (err) {
        console.error('Qualify error:', err);
        showToast('Failed to qualify referral: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Mark Qualified'; }
    }
}

async function awardCredit(refId, referrerId, referredId, btn) {
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        const referrerDoc = await getDoc(doc(db, 'users', referrerId));
        if (!referrerDoc.exists()) { showToast('Referrer not found.', 'error'); return; }
        const referrerData = referrerDoc.data();
        const qualifiedCount = referrerData.qualifiedReferrals || 0;

        // Use current qualified count for tier calculation (not count - 1)
        const rewardAmount = getRewardAmount(qualifiedCount);
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

        // Milestone bonus at exactly 10
        if (milestoneBonus > 0) {
            // Prevent double-awarding: check if milestone bonus already exists
            const existingMilestone = await getDocs(query(
                collection(db, 'transactions'),
                where('userId', '==', referrerId),
                where('type', '==', 'milestone_bonus')
            ));
            if (existingMilestone.empty) {
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
        console.error('Award credit error:', err);
        showToast('Failed to award credit: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Award Credit';
    }
}

// ─── Payment Requests ───
function listenPaymentRequests() {
    const q = query(collection(db, 'paymentRequests'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => {
        const tbody = document.getElementById('paymentsTableBody');
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">No payment requests.</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        snap.forEach(docSnap => {
            const p = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(p.userName) || '\u2014'}</td>
                <td>${formatNaira(p.amount)}</td>
                <td>${esc(p.bankDetails?.bankName)}</td>
                <td>${esc(p.bankDetails?.accountNumber)}</td>
                <td>${esc(p.bankDetails?.accountName)}</td>
                <td><span class="badge badge-${esc(p.status)}">${esc(p.status)}</span></td>
                <td class="payment-action-cell" data-id="${esc(docSnap.id)}" data-uid="${esc(p.userId)}" data-status="${esc(p.status)}" data-amount="${p.amount}"></td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.payment-action-cell').forEach(cell => {
            if (cell.dataset.status !== 'pending') {
                cell.innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);">${esc(cell.dataset.status)}</span>`;
                return;
            }
            const approveBtn = document.createElement('button');
            approveBtn.className = 'btn btn-sm btn-success';
            approveBtn.textContent = 'Approve';
            approveBtn.style.marginRight = '6px';
            approveBtn.addEventListener('click', () => {
                approveBtn.disabled = true;
                processPayment(cell.dataset.id, cell.dataset.uid, Number(cell.dataset.amount), 'completed');
            });

            const rejectBtn = document.createElement('button');
            rejectBtn.className = 'btn btn-sm btn-danger';
            rejectBtn.textContent = 'Reject';
            rejectBtn.addEventListener('click', () => {
                rejectBtn.disabled = true;
                processPayment(cell.dataset.id, cell.dataset.uid, Number(cell.dataset.amount), 'rejected');
            });

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
            await addDoc(collection(db, 'transactions'), {
                userId: userId,
                type: 'payment',
                amount: amount,
                description: 'Withdrawal to bank account',
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
                message: `Your payment request of ${formatNaira(amount)} was declined.${note ? ' Reason: ' + note : ''} Your balance has been restored.`,
                read: false,
                createdAt: new Date().toISOString()
            });
            showToast('Payment rejected. Balance restored.');
        }
    } catch (err) {
        console.error('Process payment error:', err);
        showToast('Failed to process payment: ' + err.message, 'error');
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
