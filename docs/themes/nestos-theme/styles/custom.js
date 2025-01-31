(function () {
    // Simplified initialization
    const init = () => {
        // Basic hover effect with debouncing
        let timeout;
        document.addEventListener('mouseover', (e) => {
            if (timeout) clearTimeout(timeout);

            timeout = setTimeout(() => {
                const tab = e.target.closest('.tab');
                if (tab) {
                    tab.style.transform = 'translateY(-2px)';
                }
            }, 50);
        });

        document.addEventListener('mouseout', (e) => {
            const tab = e.target.closest('.tab');
            if (tab) {
                tab.style.transform = '';
            }
        });
    };

    // Start when VS Code is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();