/* =========================================================
   Nova's Toolkit — Nav
   Expects this markup somewhere in the page (see index.html
   for the reference structure):
     <button class="nova-hamburger" id="nova-hamburger" aria-expanded="false" aria-controls="nova-sidebar">
       <span></span><span></span><span></span>
     </button>
     <div class="nova-nav-overlay" id="nova-nav-overlay"></div>
     <nav class="nova-sidebar" id="nova-sidebar" data-open="false"> ... </nav>
   ========================================================= */

(function () {
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const hamburger = document.getElementById("nova-hamburger");
    const sidebar = document.getElementById("nova-sidebar");
    const overlay = document.getElementById("nova-nav-overlay");
    if (!hamburger || !sidebar) return;

    function setOpen(open) {
      sidebar.setAttribute("data-open", String(open));
      hamburger.setAttribute("aria-expanded", String(open));
      if (overlay) overlay.setAttribute("data-open", String(open));
    }

    hamburger.addEventListener("click", () => {
      const isOpen = sidebar.getAttribute("data-open") === "true";
      setOpen(!isOpen);
    });

    if (overlay) {
      overlay.addEventListener("click", () => setOpen(false));
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });

    // Highlight current page link
    const links = sidebar.querySelectorAll(".nova-sidebar-link");
    const currentPath = window.location.pathname.replace(/\/+$/, "");
    links.forEach((link) => {
      const linkPath = new URL(link.href, window.location.origin).pathname.replace(/\/+$/, "");
      if (linkPath === currentPath) {
        link.setAttribute("aria-current", "page");
      }
    });

    // Theme picker buttons: <button class="nova-theme-btn" data-theme-choice="peak">
    const themeButtons = sidebar.querySelectorAll("[data-theme-choice]");

    function syncThemeButtons() {
      const active = window.Nova.getTheme();
      themeButtons.forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.themeChoice === active));
      });
    }

    themeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.dataset.themeChoice;
        const isReroll = choice === "gambling" && window.Nova.getTheme() === "gambling";
        window.Nova.setTheme(choice, { reroll: isReroll });
        if (isReroll) window.Nova.rerollGambling();
      });
    });

    document.addEventListener("nova:themechange", syncThemeButtons);
    syncThemeButtons();
  }
})();
