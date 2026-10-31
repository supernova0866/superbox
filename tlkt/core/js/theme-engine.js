/* =========================================================
   Nova's Toolkit — Theme Engine
   Applies data-theme on <html>, persists choice, and notifies
   the rest of the app (nav swatches, starfield, gambling roll)
   via a "nova:themechange" custom event.
   ========================================================= */

(function () {
  const STORAGE_KEY = "nova-theme";
  const VALID_THEMES = ["peak", "flashbang", "crime", "gambling"];
  const DEFAULT_THEME = "peak";

  const root = document.documentElement;

  function getStoredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.includes(stored) ? stored : DEFAULT_THEME;
  }

  function setTheme(name, opts) {
    opts = opts || {};
    if (!VALID_THEMES.includes(name)) name = DEFAULT_THEME;

    root.setAttribute("data-theme", name);
    localStorage.setItem(STORAGE_KEY, name);

    document.dispatchEvent(
      new CustomEvent("nova:themechange", { detail: { theme: name, reroll: !!opts.reroll } })
    );
  }

  function getTheme() {
    return root.getAttribute("data-theme") || DEFAULT_THEME;
  }

  // Apply immediately (before paint-blocking content) to avoid flash of wrong theme.
  setTheme(getStoredTheme());

  window.Nova = window.Nova || {};
  window.Nova.setTheme = setTheme;
  window.Nova.getTheme = getTheme;
  window.Nova.THEMES = VALID_THEMES;
})();
