/* ========================================
   CABINET CATRY - Modern Website Scripts
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {

    // --- Navbar scroll effect ---
    const navbar = document.getElementById('navbar');
    const handleScroll = () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    // --- Mobile menu ---
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    let overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    document.body.appendChild(overlay);

    const toggleMenu = () => {
        const isOpen = navMenu.classList.toggle('open');
        navToggle.classList.toggle('active', isOpen);
        overlay.classList.toggle('active', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
    };

    const closeMenu = () => {
        navMenu.classList.remove('open');
        navToggle.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    };

    navToggle.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', closeMenu);

    // Close menu on nav link click
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    // --- Active nav link on scroll ---
    const sections = document.querySelectorAll('.section, .hero');
    const navLinks = document.querySelectorAll('.nav-link');

    const updateActiveLink = () => {
        const scrollPos = window.scrollY + 150;

        sections.forEach(section => {
            const top = section.offsetTop;
            const height = section.offsetHeight;
            const id = section.getAttribute('id');

            if (scrollPos >= top && scrollPos < top + height && id) {
                navLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
                });
            }
        });
    };

    window.addEventListener('scroll', updateActiveLink, { passive: true });

    // --- Smooth scroll for anchor links ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                e.preventDefault();
                const offset = navbar.offsetHeight + 20;
                const top = target.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        });
    });

    // --- Counter animation ---
    const counters = document.querySelectorAll('.stat-number[data-target]');
    let countersAnimated = false;

    const animateCounters = () => {
        if (countersAnimated) return;

        const statsSection = document.querySelector('.hero-stats');
        if (!statsSection) return;

        const rect = statsSection.getBoundingClientRect();
        if (rect.top > window.innerHeight || rect.bottom < 0) return;

        countersAnimated = true;

        counters.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-target'));
            const duration = 2000;
            const start = performance.now();

            const update = (now) => {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                // Ease-out cubic
                const eased = 1 - Math.pow(1 - progress, 3);
                counter.textContent = Math.round(target * eased);

                if (progress < 1) {
                    requestAnimationFrame(update);
                }
            };

            requestAnimationFrame(update);
        });
    };

    window.addEventListener('scroll', animateCounters, { passive: true });
    // Run once in case hero is visible on load
    setTimeout(animateCounters, 1500);

    // --- Scroll reveal animations ---
    const revealElements = document.querySelectorAll(
        '.cabinet-grid, .cabinet-text > *, .value, .expertise-card, .team-card, ' +
        '.honoraire-card, .contact-card, .section-header, .visual-card'
    );

    revealElements.forEach(el => el.classList.add('reveal'));

    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Stagger animation for sibling cards
                const parent = entry.target.parentElement;
                const siblings = Array.from(parent.children).filter(c => c.classList.contains('reveal'));
                const idx = siblings.indexOf(entry.target);
                const delay = idx >= 0 ? idx * 100 : 0;

                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, delay);

                revealObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    revealElements.forEach(el => revealObserver.observe(el));

    // --- Contact form handling ---
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            // Basic validation
            if (!data.nom || !data.prenom || !data.email || !data.message) {
                showNotification('Veuillez remplir tous les champs obligatoires.', 'error');
                return;
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(data.email)) {
                showNotification('Veuillez entrer une adresse email valide.', 'error');
                return;
            }

            // Simulate form submission
            const btn = contactForm.querySelector('button[type="submit"]');
            const originalText = btn.textContent;
            btn.textContent = 'Envoi en cours...';
            btn.disabled = true;

            setTimeout(() => {
                showNotification(
                    'Merci ! Votre demande a bien été envoyée. Nous vous recontacterons rapidement.',
                    'success'
                );
                contactForm.reset();
                btn.textContent = originalText;
                btn.disabled = false;
            }, 1500);
        });
    }

    // --- Notification system ---
    function showNotification(message, type) {
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${type === 'success' ? '&#10003;' : '&#10007;'}</span>
                <span>${message}</span>
            </div>
        `;

        // Styles
        Object.assign(notification.style, {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            maxWidth: '420px',
            padding: '16px 24px',
            borderRadius: '10px',
            background: type === 'success' ? '#1a2744' : '#dc3545',
            color: '#fff',
            fontFamily: "'Inter', sans-serif",
            fontSize: '0.9rem',
            lineHeight: '1.5',
            zIndex: '9999',
            boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
            transform: 'translateY(20px)',
            opacity: '0',
            transition: 'all 0.3s ease'
        });

        const content = notification.querySelector('.notification-content');
        Object.assign(content.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
        });

        const icon = notification.querySelector('.notification-icon');
        Object.assign(icon.style, {
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: type === 'success' ? '#c8a44e' : 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: '0',
            fontSize: '0.85rem',
            fontWeight: '700'
        });

        document.body.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateY(0)';
            notification.style.opacity = '1';
        });

        // Auto remove
        setTimeout(() => {
            notification.style.transform = 'translateY(20px)';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    // --- Keyboard navigation ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMenu();
        }
    });

});
