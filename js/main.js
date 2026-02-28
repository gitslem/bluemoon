/* ============================================
   BlueMoon — Coming Soon Interactions
   ============================================ */

(function () {
  'use strict';

  // --- Particle Background ---
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

        // Wrap around edges
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

  // --- Email Form ---
  function initNotifyForm() {
    const form = document.getElementById('notifyForm');
    const success = document.getElementById('notifySuccess');
    if (!form || !success) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]');
      if (!email || !email.value) return;

      // Simulate submission
      const btn = form.querySelector('button');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span style="display:flex;align-items:center;gap:6px;">Sending...</span>';
      btn.disabled = true;

      setTimeout(function () {
        form.style.display = 'none';
        success.classList.add('visible');
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 800);
    });
  }

  // --- Header scroll effect ---
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

  // --- Phone float animation ---
  function initPhoneAnimations() {
    const phones = document.querySelectorAll('.phone');
    if (!phones.length) return;

    phones.forEach((phone, i) => {
      const delay = i * 0.8;
      const duration = 5 + i * 0.5;
      phone.style.animation = `phone-float ${duration}s ease-in-out ${delay}s infinite`;
    });

    // Add keyframes dynamically
    const style = document.createElement('style');
    style.textContent = `
      @keyframes phone-float {
        0%, 100% { transform: ${getBaseTransform(0)} translateY(0); }
        50% { transform: ${getBaseTransform(0)} translateY(-10px); }
      }
    `;
    document.head.appendChild(style);

    function getBaseTransform(index) {
      // Maintain perspective transforms
      return '';
    }

    // Use simpler vertical animation that composes with existing transforms
    phones.forEach((phone) => {
      let start = null;
      const speed = 0.0008 + Math.random() * 0.0004;
      const amplitude = 6 + Math.random() * 4;

      function animate(timestamp) {
        if (!start) start = timestamp;
        const elapsed = timestamp - start;
        const y = Math.sin(elapsed * speed) * amplitude;
        phone.style.setProperty('--float-y', `${y}px`);
        requestAnimationFrame(animate);
      }

      // Override the animation with a manual one that preserves transforms
      phone.style.animation = 'none';

      // Apply float via a wrapper approach using margin
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

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    initParticles();
    initNotifyForm();
    initHeaderScroll();
    initPhoneAnimations();
  });
})();
