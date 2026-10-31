/* =========================================================
   Nova's Toolkit — Home page doodles
   Set window.NOVA_DOODLES = ["assets/doodles/foo.png", ...]
   before this script runs (see index.html). Each doodle gets
   a random position + randomized float duration/delay so the
   bobbing never looks synchronized.
   ========================================================= */

(function () {
  document.addEventListener("DOMContentLoaded", init);

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function init() {
    const layer = document.getElementById("nova-doodle-layer");
    const sources = window.NOVA_DOODLES || [];
    if (!layer || !sources.length) return;

    sources.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.className = "nova-doodle";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");

      img.style.left = `${rand(4, 88)}%`;
      img.style.top = `${rand(8, 82)}%`;
      img.style.setProperty("--float-dur", `${rand(4, 8).toFixed(2)}s`);
      img.style.setProperty("--float-delay", `${rand(0, 4).toFixed(2)}s`);
      const size = rand(48, 96).toFixed(0);
      img.style.width = `${size}px`;

      layer.appendChild(img);
    });
  }
})();
