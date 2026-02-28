/**
 * BlueMoon — Coming Soon Application
 * Firebase Firestore + Analytics + UI Interactions
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { getFirestore, doc, setDoc } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';
import { getAnalytics, logEvent } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-analytics.js';
import firebaseConfig from './firebase-config.js';

// ============================================
// Firebase Initialization
// ============================================

let app = null;
let db = null;
let analytics = null;

function initFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);

    if (firebaseConfig.measurementId && firebaseConfig.measurementId !== 'YOUR_MEASUREMENT_ID') {
      analytics = getAnalytics(app);
      logEvent(analytics, 'page_view', {
        page_title: document.title,
        page_location: window.location.href
      });
    }
  } catch (error) {
    console.warn('Firebase initialization skipped:', error.message);
  }
}

function isFirebaseReady() {
  return db !== null && firebaseConfig.apiKey !== 'YOUR_API_KEY';
}

// ============================================
// Email Subscriber — Firestore
// ============================================

async function saveSubscriber(email) {
  if (!isFirebaseReady()) {
    console.log('Subscriber (demo mode):', email);
    return { success: true, demo: true };
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const subscriberRef = doc(db, 'subscribers', normalizedEmail);
    await setDoc(subscriberRef, {
      email: normalizedEmail,
      subscribedAt: new Date().toISOString(),
      source: 'coming_soon_page',
      userAgent: navigator.userAgent
    });

    if (analytics) {
      logEvent(analytics, 'sign_up', { method: 'email_waitlist' });
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving subscriber:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// Analytics Helpers
// ============================================

function trackEvent(eventName, params) {
  if (analytics) {
    logEvent(analytics, eventName, params);
  }
}

// ============================================
// Particle Background
// ============================================

function initParticles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particles = [];
  let animationId;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.5 + 0.5,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.4 + 0.1,
      pulse: Math.random() * Math.PI * 2,
    };
  }

  function init() {
    resize();
    const count = Math.min(Math.floor((canvas.width * canvas.height) / 15000), 80);
    particles = Array.from({ length: count }, createParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p) => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.pulse += 0.01;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      const dynamicOpacity = p.opacity * (0.7 + 0.3 * Math.sin(p.pulse));

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245, 165, 36, ${dynamicOpacity})`;
      ctx.fill();
    });

    animationId = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => {
    cancelAnimationFrame(animationId);
    init();
    draw();
  });

  init();
  draw();
}

// ============================================
// Promo Signup Form (Inline Referral Join)
// ============================================

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BM-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function initPromoForm() {
  const form = document.getElementById('promoForm');
  const successEl = document.getElementById('promoSuccess');
  const errorEl = document.getElementById('promoError');
  const refCodeDisplay = document.getElementById('promoRefCode');
  if (!form || !successEl) return;

  // Pre-fill referral code from URL
  const urlParams = new URLSearchParams(window.location.search);
  const refFromUrl = urlParams.get('ref');
  if (refFromUrl) {
    const refInput = document.getElementById('promoReferral');
    if (refInput) refInput.value = refFromUrl.toUpperCase();
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (errorEl) errorEl.classList.remove('visible');

    const name = document.getElementById('promoName').value.trim();
    const phone = document.getElementById('promoPhone').value.trim();
    const email = document.getElementById('promoEmail').value.trim();
    const referral = document.getElementById('promoReferral').value.trim().toUpperCase();
    const btn = document.getElementById('promoSubmitBtn');

    if (!name) {
      showPromoError('Please enter your full name.');
      return;
    }
    if (!phone) {
      showPromoError('Please enter your phone number.');
      return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" style="display:inline-block;width:16px;height:16px;border:2px solid rgba(0,0,0,0.2);border-top-color:currentColor;border-radius:50%;animation:spin 0.6s linear infinite;"></span> Joining...';
    btn.disabled = true;

    try {
      const myRefCode = generateReferralCode();

      if (isFirebaseReady()) {
        // Save to Firestore promoSignups collection
        const signupRef = doc(db, 'promoSignups', phone.replace(/\s/g, ''));
        await setDoc(signupRef, {
          name,
          phone: phone.replace(/\s/g, ''),
          email: email.toLowerCase() || '',
          referralCode: myRefCode,
          referredBy: referral || '',
          source: 'homepage_promo',
          createdAt: new Date().toISOString()
        });

        if (analytics) {
          logEvent(analytics, 'promo_signup', { method: 'inline_form' });
        }
      } else {
        console.log('Promo signup (demo mode):', { name, phone, email, referral });
      }

      // Show success
      form.style.display = 'none';
      if (refCodeDisplay) refCodeDisplay.textContent = myRefCode;
      successEl.classList.add('visible');
      trackEvent('promo_signup_complete', { has_referral: !!referral });
    } catch (err) {
      console.error('Promo signup error:', err);
      showPromoError('Something went wrong. Please try again or contact us on WhatsApp.');
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  });

  function showPromoError(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.add('visible');
    }
  }
}

// ============================================
// Notify Form
// ============================================

function initNotifyForm() {
  const form = document.getElementById('notifyForm');
  const success = document.getElementById('notifySuccess');
  const errorEl = document.getElementById('notifyError');
  if (!form || !success) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const emailInput = form.querySelector('input[type="email"]');
    const btn = form.querySelector('button');
    if (!emailInput || !emailInput.value) return;

    const email = emailInput.value.trim();

    if (errorEl) errorEl.classList.remove('visible');

    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" style="display:inline-block;width:16px;height:16px;border:2px solid rgba(0,0,0,0.2);border-top-color:currentColor;border-radius:50%;animation:spin 0.6s linear infinite;"></span> Saving...';
    btn.disabled = true;

    const result = await saveSubscriber(email);

    if (result.success) {
      form.style.display = 'none';
      success.classList.add('visible');
      trackEvent('waitlist_signup', { email_domain: email.split('@')[1] });
    } else {
      btn.innerHTML = originalText;
      btn.disabled = false;
      if (errorEl) {
        errorEl.textContent = 'Something went wrong. Please try again.';
        errorEl.classList.add('visible');
      }
    }
  });
}

// ============================================
// Header Scroll Effect
// ============================================

function initHeaderScroll() {
  const header = document.getElementById('siteHeader');
  if (!header) return;

  let ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(function () {
        if (window.scrollY > 50) {
          header.style.background = 'rgba(7, 11, 26, 0.95)';
          header.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.3)';
        } else {
          header.style.background = 'rgba(7, 11, 26, 0.7)';
          header.style.boxShadow = 'none';
        }
        ticking = false;
      });
      ticking = true;
    }
  });
}

// ============================================
// Click Tracking
// ============================================

function initClickTracking() {
  document.querySelectorAll('.store-btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      const store = this.querySelector('.store-btn-large')?.textContent || 'unknown';
      trackEvent('store_button_click', { store });
    });
  });

  document.querySelectorAll('.footer-social a').forEach((link) => {
    link.addEventListener('click', function () {
      const platform = this.getAttribute('aria-label') || 'unknown';
      trackEvent('social_click', { platform });
    });
  });

  const headerCta = document.querySelector('.header-cta');
  if (headerCta) {
    headerCta.addEventListener('click', function () {
      trackEvent('cta_click', { location: 'header' });
    });
  }

  const whatsappFab = document.querySelector('.whatsapp-fab');
  if (whatsappFab) {
    whatsappFab.addEventListener('click', function () {
      trackEvent('whatsapp_click', { location: 'fab' });
    });
  }
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  initFirebase();
  initParticles();
  initPromoForm();
  initNotifyForm();
  initHeaderScroll();
  initClickTracking();
});
