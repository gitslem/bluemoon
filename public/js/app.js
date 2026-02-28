/**
 * BlueMoon — Coming Soon Application
 * UI-first approach: all forms and buttons work immediately.
 * Firebase loads in background as an optional enhancement.
 */

// ============================================
// Firebase State (loaded dynamically)
// ============================================

let db = null;
let analytics = null;
let firebaseReady = false;

async function loadFirebase() {
  try {
    const { firebaseConfig: config } = await import('./firebase-config.js');

    if (!config || !config.apiKey || config.apiKey === 'YOUR_API_KEY') {
      console.warn('Firebase not configured.');
      return;
    }

    const [appMod, storeMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js')
    ]);

    const app = appMod.initializeApp(config);
    db = storeMod.getFirestore(app);
    firebaseReady = true;

    // Store Firestore functions for later use
    window._fbDoc = storeMod.doc;
    window._fbSetDoc = storeMod.setDoc;

    // Analytics is optional — don't block on it
    try {
      if (config.measurementId && config.measurementId !== 'YOUR_MEASUREMENT_ID') {
        const analyticsMod = await import('https://www.gstatic.com/firebasejs/11.4.0/firebase-analytics.js');
        analytics = analyticsMod.getAnalytics(app);
        analyticsMod.logEvent(analytics, 'page_view', {
          page_title: document.title,
          page_location: window.location.href
        });
        window._fbLogEvent = analyticsMod.logEvent;
      }
    } catch (e) {
      console.warn('Analytics unavailable:', e.message);
    }

    console.log('Firebase loaded successfully');
  } catch (error) {
    console.warn('Firebase load failed (forms still work):', error.message);
  }
}

function trackEvent(eventName, params) {
  if (analytics && window._fbLogEvent) {
    try { window._fbLogEvent(analytics, eventName, params); } catch (e) { /* ignore */ }
  }
}

// ============================================
// Referral Code Generator
// ============================================

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BM-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================
// Promo Signup Form (Join Referral Program)
// ============================================

function initPromoForm() {
  const form = document.getElementById('promoForm');
  const successEl = document.getElementById('promoSuccess');
  const errorEl = document.getElementById('promoError');
  const refCodeDisplay = document.getElementById('promoRefCode');
  if (!form || !successEl) return;

  // Pre-fill referral code from URL
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const refFromUrl = urlParams.get('ref');
    if (refFromUrl) {
      const refInput = document.getElementById('promoReferral');
      if (refInput) refInput.value = refFromUrl.toUpperCase();
    }
  } catch (e) { /* ignore URL parse errors */ }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hidePromoError();

    const name = (document.getElementById('promoName').value || '').trim();
    const email = (document.getElementById('promoEmail').value || '').trim();
    const password = (document.getElementById('promoPassword').value || '');
    const referral = (document.getElementById('promoReferral').value || '').trim().toUpperCase();
    const btn = document.getElementById('promoSubmitBtn');

    if (!name) { showPromoError('Please enter your full name.'); return; }
    if (!email) { showPromoError('Please enter your email address.'); return; }
    if (!password || password.length < 6) { showPromoError('Password must be at least 6 characters.'); return; }

    // Show loading state
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Joining...';
    btn.disabled = true;

    // Create a real Firebase Auth account
    try {
      const authModule = await import('./auth.js');
      await authModule.initAuth();
      const result = await authModule.signUpWithEmail(email, password, name, '', referral);

      // Show success with their referral code
      form.style.display = 'none';
      if (refCodeDisplay) refCodeDisplay.textContent = result.referralCode;
      successEl.classList.add('visible');
      trackEvent('promo_signup_complete', { has_referral: !!referral });
    } catch (err) {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      if (err.code === 'auth/email-already-in-use') {
        showPromoError('This email is already registered. Please sign in from the registration page.');
      } else if (err.code === 'auth/weak-password') {
        showPromoError('Password must be at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        showPromoError('Please enter a valid email address.');
      } else {
        showPromoError(err.message || 'Sign up failed. Please try again.');
      }
    }
  });

  function showPromoError(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.add('visible');
    }
  }

  function hidePromoError() {
    if (errorEl) errorEl.classList.remove('visible');
  }
}

// ============================================
// Email Notify Form
// ============================================

function initNotifyForm() {
  const form = document.getElementById('notifyForm');
  const successEl = document.getElementById('notifySuccess');
  const errorEl = document.getElementById('notifyError');
  if (!form || !successEl) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const emailInput = form.querySelector('input[type="email"]');
    const btn = form.querySelector('button');
    if (!emailInput || !emailInput.value) return;

    const email = emailInput.value.trim();
    if (!email) return;

    if (errorEl) errorEl.classList.remove('visible');

    // Show loading state
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Saving...';
    btn.disabled = true;

    // Try to save to Firebase
    try {
      if (firebaseReady && db && window._fbDoc && window._fbSetDoc) {
        const normalizedEmail = email.toLowerCase().trim();
        const subscriberRef = window._fbDoc(db, 'subscribers', normalizedEmail);
        await window._fbSetDoc(subscriberRef, {
          email: normalizedEmail,
          subscribedAt: new Date().toISOString(),
          source: 'coming_soon_page',
          userAgent: navigator.userAgent
        });
      }
    } catch (err) {
      console.warn('Subscriber save failed:', err.message);
    }

    // Always show success — even if Firebase wasn't available
    form.style.display = 'none';
    successEl.classList.add('visible');
    trackEvent('waitlist_signup', { email_domain: email.split('@')[1] });
  });
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

    particles.forEach(function (p) {
      p.x += p.speedX;
      p.y += p.speedY;
      p.pulse += 0.01;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      var dynamicOpacity = p.opacity * (0.7 + 0.3 * Math.sin(p.pulse));

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 165, 36, ' + dynamicOpacity + ')';
      ctx.fill();
    });

    animationId = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', function () {
    cancelAnimationFrame(animationId);
    init();
    draw();
  });

  init();
  draw();
}

// ============================================
// Header Scroll Effect
// ============================================

function initHeaderScroll() {
  const header = document.getElementById('siteHeader');
  if (!header) return;

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(function () {
        header.classList.toggle('scrolled', window.scrollY > 50);
        ticking = false;
      });
      ticking = true;
    }
  });
}

// ============================================
// Mobile Menu
// ============================================

function initMobileMenu() {
  var toggle = document.getElementById('menuToggle');
  var nav = document.getElementById('headerNav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', function () {
    toggle.classList.toggle('active');
    nav.classList.toggle('open');
  });

  // Close menu when clicking a nav link
  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      toggle.classList.remove('active');
      nav.classList.remove('open');
    });
  });
}

// ============================================
// Scroll Reveal (Intersection Observer)
// ============================================

function initScrollReveal() {
  var reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;

  if (!('IntersectionObserver' in window)) {
    // Fallback: just show everything
    reveals.forEach(function (el) { el.classList.add('visible'); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  });

  reveals.forEach(function (el) {
    observer.observe(el);
  });
}

// ============================================
// Click Tracking
// ============================================

function initClickTracking() {
  document.querySelectorAll('.store-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var storeEl = this.querySelector('.store-btn-large');
      trackEvent('store_button_click', { store: storeEl ? storeEl.textContent : 'unknown' });
    });
  });

  document.querySelectorAll('.footer-social a').forEach(function (link) {
    link.addEventListener('click', function () {
      trackEvent('social_click', { platform: this.getAttribute('aria-label') || 'unknown' });
    });
  });

  var headerCta = document.querySelector('.header-cta');
  if (headerCta) {
    headerCta.addEventListener('click', function () {
      trackEvent('cta_click', { location: 'header' });
    });
  }

  var whatsappFab = document.querySelector('.whatsapp-fab');
  if (whatsappFab) {
    whatsappFab.addEventListener('click', function () {
      trackEvent('whatsapp_click', { location: 'fab' });
    });
  }
}

// ============================================
// Initialize — UI first, Firebase second
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  // 1. Attach all UI event listeners IMMEDIATELY (no Firebase needed)
  initParticles();
  initPromoForm();
  initNotifyForm();
  initHeaderScroll();
  initMobileMenu();
  initScrollReveal();
  initClickTracking();

  // 2. Load Firebase in the background (non-blocking)
  loadFirebase();
});
