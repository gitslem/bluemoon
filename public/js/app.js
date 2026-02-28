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

    // Analytics — only initialize if measurementId is configured
    if (firebaseConfig.measurementId && firebaseConfig.measurementId !== 'YOUR_MEASUREMENT_ID') {
      analytics = getAnalytics(app);
      logEvent(analytics, 'page_view', {
        page_title: 'Coming Soon',
        page_location: window.location.href
      });
    }

    console.log('Firebase initialized successfully');
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
    // Fallback: log to console when Firebase isn't configured yet
    console.log('Subscriber (demo mode):', email);
    return { success: true, demo: true };
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Use email as document ID — setDoc is idempotent so duplicates
    // simply overwrite, avoiding the need for read access.
    const subscriberRef = doc(db, 'subscribers', normalizedEmail);
    await setDoc(subscriberRef, {
      email: normalizedEmail,
      subscribedAt: new Date().toISOString(),
      source: 'coming_soon_page',
      userAgent: navigator.userAgent
    });

    // Track signup event
    if (analytics) {
      logEvent(analytics, 'sign_up', {
        method: 'email_waitlist'
      });
      logEvent(analytics, 'generate_lead', {
        currency: 'USD',
        value: 0
      });
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
// Notify Form — Firestore Integration
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

    // Hide any previous error
    if (errorEl) errorEl.classList.remove('visible');

    // Show loading state
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span style="display:flex;align-items:center;gap:6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Saving...</span>';
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
  const header = document.querySelector('.header');
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
// Phone Float Animation
// ============================================

function initPhoneAnimations() {
  const phones = document.querySelectorAll('.phone');
  if (!phones.length) return;

  phones.forEach((phone) => {
    let startTime = null;
    const floatSpeed = 0.0006 + Math.random() * 0.0004;
    const floatAmplitude = 5 + Math.random() * 5;

    function floatAnimate(timestamp) {
      if (!startTime) startTime = timestamp;
      const y = Math.sin((timestamp - startTime) * floatSpeed) * floatAmplitude;
      phone.style.marginTop = `${-y}px`;
      phone.style.marginBottom = `${y}px`;
      requestAnimationFrame(floatAnimate);
    }

    requestAnimationFrame(floatAnimate);
  });
}

// ============================================
// CTA Button Tracking
// ============================================

function initClickTracking() {
  // Track App Store button clicks
  document.querySelectorAll('.store-btn').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      const store = this.querySelector('.store-btn-large')?.textContent || 'unknown';
      trackEvent('store_button_click', { store: store });
    });
  });

  // Track social link clicks
  document.querySelectorAll('.footer-social a').forEach((link) => {
    link.addEventListener('click', function () {
      const platform = this.getAttribute('aria-label') || 'unknown';
      trackEvent('social_click', { platform: platform });
    });
  });

  // Track "Get Notified" CTA header button
  const headerCta = document.querySelector('.header-cta');
  if (headerCta) {
    headerCta.addEventListener('click', function () {
      trackEvent('cta_click', { location: 'header' });
    });
  }
}

// ============================================
// Initialize Everything
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  initFirebase();
  initParticles();
  initNotifyForm();
  initHeaderScroll();
  initPhoneAnimations();
  initClickTracking();
});
