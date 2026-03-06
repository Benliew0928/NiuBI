/**
 * NiuBi+ Smart Home - General Script
 * Handles mobile menu, header scroll effects, etc.
 */
document.addEventListener('DOMContentLoaded', () => {

    /* --- Mobile drawer logic --- */
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const mobileClose = document.getElementById('mobile-close');
    const mobileDrawer = document.getElementById('mobile-drawer');
    const mobileOverlay = document.getElementById('mobile-overlay');

    function toggleMobileMenu() {
        if (!mobileDrawer) return;
        mobileDrawer.classList.toggle('open');
        mobileOverlay.classList.toggle('open');
        // Prevent body scroll
        document.body.style.overflow = mobileDrawer.classList.contains('open') ? 'hidden' : '';
    }

    if (mobileBtn) mobileBtn.addEventListener('click', toggleMobileMenu);
    if (mobileClose) mobileClose.addEventListener('click', toggleMobileMenu);
    if (mobileOverlay) mobileOverlay.addEventListener('click', toggleMobileMenu);


    /* --- Header scroll effect --- */
    const header = document.querySelector('.site-header');
    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 10) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }

});
