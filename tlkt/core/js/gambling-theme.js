/* =========================================================
   Nova's Toolkit — Gambling™
   Rolls: base is black or white (coin flip), everything else
   is randomized HSL relative to that base. No guarantee it
   looks good — that's the gamble.
   ========================================================= */

(function () {
  const root = document.documentElement;

  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function hsl(h, s, l) {
    return `hsl(${h} ${s}% ${l}%)`;
  }

  function rollPalette() {
    const isBlackBase = Math.random() < 0.5;
    const baseHue = rand(0, 359);

    const bgLightness = isBlackBase ? rand(3, 10) : rand(92, 99);
    const textLightness = isBlackBase ? rand(88, 97) : rand(5, 15);

    const bg = hsl(baseHue, rand(10, 40), bgLightness);
    const bgElevated = hsl(baseHue, rand(10, 40), isBlackBase ? bgLightness + 4 : bgLightness - 4);
    const surface = hsl(baseHue, rand(10, 40), isBlackBase ? bgLightness + 7 : bgLightness - 7);
    const surfaceAlt = hsl(baseHue, rand(10, 40), isBlackBase ? bgLightness + 11 : bgLightness - 11);
    const border = hsl(baseHue, rand(15, 45), isBlackBase ? bgLightness + 18 : bgLightness - 18);

    const text = hsl(baseHue, rand(0, 20), textLightness);
    const textDim = hsl(baseHue, rand(0, 15), isBlackBase ? textLightness - 25 : textLightness + 25);
    const textFaint = hsl(baseHue, rand(0, 10), isBlackBase ? textLightness - 45 : textLightness + 35);

    // accents: two independently rolled hues, full chaos allowed
    const accentAHue = rand(0, 359);
    const accentBHue = rand(0, 359);
    const accentA = hsl(accentAHue, rand(60, 100), rand(45, 65));
    const accentB = hsl(accentBHue, rand(60, 100), rand(45, 65));

    return {
      "--bg": bg,
      "--bg-elevated": bgElevated,
      "--surface": surface,
      "--surface-alt": surfaceAlt,
      "--border": border,
      "--text": text,
      "--text-dim": textDim,
      "--text-faint": textFaint,
      "--accent-a": accentA,
      "--accent-b": accentB,
      "--accent-gradient": `linear-gradient(135deg, ${accentA}, ${accentB})`,
    };
  }

  function reroll() {
    const palette = rollPalette();
    Object.entries(palette).forEach(([prop, value]) => {
      root.style.setProperty(prop, value);
    });
  }

  function clearInlineOverrides() {
    [
      "--bg", "--bg-elevated", "--surface", "--surface-alt", "--border",
      "--text", "--text-dim", "--text-faint",
      "--accent-a", "--accent-b", "--accent-gradient",
    ].forEach((prop) => root.style.removeProperty(prop));
  }

  document.addEventListener("nova:themechange", (e) => {
    if (e.detail.theme === "gambling") {
      reroll();
    } else {
      clearInlineOverrides();
    }
  });

  // Reroll immediately if the page loaded directly into Gambling™.
  if (root.getAttribute("data-theme") === "gambling") {
    reroll();
  }

  window.Nova = window.Nova || {};
  window.Nova.rerollGambling = reroll;
})();
