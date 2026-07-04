/* =========================================================
   Henry Wilhelm Kirenga — Luxury shared behaviour
   Pages may define window.artworks and window.whatsappNumber
   before this script loads to enable the artwork modal.
   ========================================================= */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    // Footer year
    var yr = document.getElementById('year');
    if (yr) yr.textContent = new Date().getFullYear();

    // Header scroll state
    var header = document.getElementById('header');
    if (header) {
      var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 40); };
      window.addEventListener('scroll', onScroll);
      onScroll();
    }

    // Mobile nav
    var hamburger = document.getElementById('hamburger');
    var navLinks = document.getElementById('navLinks');
    if (hamburger && navLinks) {
      hamburger.addEventListener('click', function () {
        hamburger.classList.toggle('open');
        navLinks.classList.toggle('open');
      });
      navLinks.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          hamburger.classList.remove('open');
          navLinks.classList.remove('open');
        });
      });
    }

    // Scroll reveal
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
      }, { threshold: 0.12 });
      document.querySelectorAll('.reveal').forEach(function (el, i) {
        el.style.transitionDelay = (i % 3) * 0.1 + 's';
        io.observe(el);
      });
    } else {
      document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    }

    // Artwork modal close on backdrop
    var modal = document.getElementById('artwork-modal');
    if (modal) {
      modal.addEventListener('click', function (e) { if (e.target === this) window.closeArtworkModal(); });
    }

    // Commission form
    var cform = document.getElementById('commission-form');
    if (cform) {
      cform.addEventListener('submit', function (e) {
        e.preventDefault();
        var fc = document.getElementById('form-content');
        var sp = document.getElementById('loading-spinner');
        var sm = document.getElementById('success-message');
        if (fc) fc.style.display = 'none';
        if (sp) sp.style.display = 'block';
        fetch('https://formspree.io/f/myzppjgn', { method: 'POST', body: new FormData(this), headers: { 'Accept': 'application/json' } })
          .then(function (r) {
            if (r.ok) { if (sp) sp.style.display = 'none'; if (sm) sm.style.display = 'block'; }
            else throw new Error();
          })
          .catch(function () {
            if (sp) sp.style.display = 'none';
            alert('There was a problem submitting your form. Please try again later.');
            if (fc) fc.style.display = 'block';
          });
      });
    }
  });

  // ---- Artwork modal ----
  window.openArtworkModal = function (id) {
    var a = (window.artworks || {})[id];
    if (!a) return;
    var set = function (elId, val, attr) {
      var el = document.getElementById(elId);
      if (!el) return;
      if (attr) el.setAttribute(attr, val); else el.textContent = val;
    };
    var img = document.getElementById('modal-artwork-image');
    if (img) { img.src = a.image; img.alt = a.title; }
    set('modal-artwork-title', a.title);
    set('modal-artwork-medium', a.medium);
    set('modal-artwork-size', a.size);
    set('modal-artwork-description', a.description);
    set('modal-artwork-year', a.year);
    var statusEl = document.getElementById('modal-artwork-status');
    if (statusEl) statusEl.textContent = a.status || '';
    var priceEl = document.getElementById('modal-artwork-price');
    if (priceEl) priceEl.textContent = a.price || '';
    var wa = document.getElementById('whatsapp-inquiry');
    if (wa) wa.href = 'https://wa.me/' + (window.whatsappNumber || '255684555058') +
      '?text=' + encodeURIComponent('I\'m interested in "' + a.title + '" (' + a.size + ')');
    var m = document.getElementById('artwork-modal');
    m.style.display = 'block';
    document.body.style.overflow = 'hidden';
    setTimeout(function () { m.classList.add('show'); }, 10);
  };

  window.closeArtworkModal = function () {
    var m = document.getElementById('artwork-modal');
    if (!m) return;
    m.classList.remove('show');
    setTimeout(function () { m.style.display = 'none'; document.body.style.overflow = 'auto'; }, 400);
  };

  // ---- Commission popup ----
  window.openPopup = function () {
    var p = document.getElementById('commission-popup');
    if (!p) return;
    p.style.display = 'flex';
    setTimeout(function () {
      p.style.opacity = '1';
      var card = p.querySelector('.popup-card');
      if (card) card.style.transform = 'translateY(0)';
    }, 10);
  };
  window.closePopup = function () {
    var p = document.getElementById('commission-popup');
    if (!p) return;
    p.style.opacity = '0';
    var card = p.querySelector('.popup-card');
    if (card) card.style.transform = 'translateY(24px)';
    setTimeout(function () { p.style.display = 'none'; resetForm(); }, 400);
  };
  window.resetForm = function () {
    var fc = document.getElementById('form-content');
    var sp = document.getElementById('loading-spinner');
    var sm = document.getElementById('success-message');
    var f = document.getElementById('commission-form');
    if (fc) fc.style.display = 'block';
    if (sp) sp.style.display = 'none';
    if (sm) sm.style.display = 'none';
    if (f) f.reset();
  };
})();
