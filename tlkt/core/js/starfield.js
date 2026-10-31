/* =========================================================
   Nova's Toolkit — Starfield (Peak Theme™ signature element)
   Expects a <canvas id="nova-starfield"> present in the page.
   Pauses entirely when the active theme isn't "peak" so other
   themes don't pay the animation cost.
   ========================================================= */

(function () {
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const canvas = document.getElementById("nova-starfield");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let width, height, dpr;
    let stars = [];
    let shootingStars = [];
    let parallax = { x: 0, y: 0 };
    let scrollParallax = 0;
    let running = window.Nova.getTheme() === "peak";
    let rafId = null;

    const STAR_COUNT_PER_1000PX2 = 0.8;
    const SHOOTING_STAR_MIN_MS = 4000;
    const SHOOTING_STAR_MAX_MS = 11000;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedStars();
    }

    function seedStars() {
      const count = Math.round(((width * height) / 1000) * STAR_COUNT_PER_1000PX2 / 10);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.4 + 0.3,
        depth: Math.random() * 0.6 + 0.2, // parallax strength
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinklePhase: Math.random() * Math.PI * 2,
      }));
    }

    function maybeSpawnShootingStar() {
      const delay = SHOOTING_STAR_MIN_MS + Math.random() * (SHOOTING_STAR_MAX_MS - SHOOTING_STAR_MIN_MS);
      setTimeout(() => {
        if (running) {
          shootingStars.push({
            x: Math.random() * width * 0.6,
            y: Math.random() * height * 0.3,
            len: 80 + Math.random() * 60,
            speed: 6 + Math.random() * 4,
            angle: Math.PI / 4 + (Math.random() * 0.2 - 0.1),
            life: 1,
          });
        }
        maybeSpawnShootingStar();
      }, delay);
    }

    function draw(time) {
      ctx.clearRect(0, 0, width, height);

      stars.forEach((s) => {
        const twinkle = 0.6 + Math.sin(time * s.twinkleSpeed + s.twinklePhase) * 0.4;
        const px = s.x + parallax.x * s.depth + scrollParallax * s.depth * 0.3;
        const py = s.y + parallax.y * s.depth;
        ctx.globalAlpha = Math.max(twinkle, 0.15);
        ctx.fillStyle = "#eee9ff";
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      shootingStars = shootingStars.filter((s) => s.life > 0);
      shootingStars.forEach((s) => {
        const dx = Math.cos(s.angle) * s.speed;
        const dy = Math.sin(s.angle) * s.speed;
        s.x += dx;
        s.y += dy;
        s.life -= 0.012;

        const grad = ctx.createLinearGradient(s.x, s.y, s.x - dx * (s.len / s.speed), s.y - dy * (s.len / s.speed));
        grad.addColorStop(0, `rgba(255,255,255,${s.life})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - dx * (s.len / s.speed), s.y - dy * (s.len / s.speed));
        ctx.stroke();
      });

      if (running) rafId = requestAnimationFrame(draw);
    }

    function onPointerMove(e) {
      const relX = (e.clientX / width - 0.5) * 2;
      const relY = (e.clientY / height - 0.5) * 2;
      parallax.x = relX * 14;
      parallax.y = relY * 14;
    }

    function onScroll() {
      scrollParallax = window.scrollY * 0.05;
    }

    function start() {
      if (rafId) return;
      running = true;
      rafId = requestAnimationFrame(draw);
    }

    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      ctx.clearRect(0, 0, width, height);
    }

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    document.addEventListener("nova:themechange", (e) => {
      if (e.detail.theme === "peak") {
        start();
      } else {
        stop();
      }
    });

    resize();
    maybeSpawnShootingStar();
    if (running) start();
  }
})();
