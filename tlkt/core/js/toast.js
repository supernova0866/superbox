/* =========================================================
   Nova's Toolkit — Toast Engine
   window.Nova.toast(message, type, duration, options)

   Stacking: newest toast enters at the bottom (slot 0); every
   existing toast is visually pushed up (+1) automatically,
   since position is just its index in the live array.

   Dedupe: identical message+type within the visible stack
   bumps a "2x/3x..." badge instead of adding a new toast, and
   extends the remaining duration by +1s (not a full reset).
   Pass { dedupe: false } to always spawn a fresh toast instead
   (e.g. a rapid-fire "Copied!" toast).

   Also callable from the browser console: Nova.toast("hi").
   ========================================================= */

(function () {
  const DEFAULT_DURATION = 4000;
  const BUMP_MS = 1000;
  const TOAST_HEIGHT = 56; // px, keep in sync with min-height feel in toast.css
  const GAP = 10;
  const MAX_STACK = 6; // hard cap so a bad loop can't fill the whole screen

  let stack = []; // index 0 = bottom-most = newest

  function ensureContainer() {
    let el = document.getElementById("nova-toast-stack");
    if (!el) {
      el = document.createElement("div");
      el.id = "nova-toast-stack";
      document.body.appendChild(el);
    }
    return el;
  }

  function reposition() {
    stack.forEach((entry, index) => {
      entry.el.style.bottom = `${index * (TOAST_HEIGHT + GAP)}px`;
    });
  }

  function removeEntry(id) {
    const index = stack.findIndex((t) => t.id === id);
    if (index === -1) return;
    const entry = stack[index];
    clearTimeout(entry.timeoutId);
    entry.el.setAttribute("data-leaving", "true");
    setTimeout(() => entry.el.remove(), 200);
    stack.splice(index, 1);
    reposition();
  }

  function scheduleRemoval(entry) {
    const remaining = entry.endTime - Date.now();
    entry.timeoutId = setTimeout(() => removeEntry(entry.id), Math.max(remaining, 0));
  }

  function findDupe(message, type) {
    return stack.find((t) => t.message === message && t.type === type);
  }

  function toast(message, type, duration, options) {
    type = type || "info";
    duration = typeof duration === "number" ? duration : DEFAULT_DURATION;
    options = options || {};
    const dedupe = options.dedupe !== false;

    if (dedupe) {
      const dupe = findDupe(message, type);
      if (dupe) {
        dupe.count += 1;
        dupe.countEl.textContent = `${dupe.count}x`;
        dupe.countEl.style.display = "inline-block";
        dupe.endTime += BUMP_MS;
        clearTimeout(dupe.timeoutId);
        scheduleRemoval(dupe);
        return dupe.id;
      }
    }

    if (stack.length >= MAX_STACK) {
      // drop the oldest (topmost) toast to make room rather than growing forever
      const oldest = stack[stack.length - 1];
      if (oldest) removeEntry(oldest.id);
    }

    const container = ensureContainer();
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const el = document.createElement("div");
    el.className = "nova-toast";
    el.id = id;
    el.setAttribute("data-type", type);
    el.setAttribute("data-entering", "true");
    el.setAttribute("role", "status");

    const msgEl = document.createElement("span");
    msgEl.className = "nova-toast-message";
    msgEl.textContent = message;

    const countEl = document.createElement("span");
    countEl.className = "nova-toast-count";
    countEl.style.display = "none";

    el.appendChild(msgEl);
    el.appendChild(countEl);
    container.appendChild(el);

    // force layout then clear entering state so the transition plays
    requestAnimationFrame(() => el.removeAttribute("data-entering"));

    const entry = {
      id,
      message,
      type,
      el,
      countEl,
      count: 1,
      endTime: Date.now() + duration,
      timeoutId: null,
    };

    stack.unshift(entry); // new toast takes slot 0 (bottom); everyone else shifts up
    reposition();
    scheduleRemoval(entry);

    return id;
  }

  function dismiss(id) {
    removeEntry(id);
  }

  function dismissAll() {
    [...stack].forEach((entry) => removeEntry(entry.id));
  }

  window.Nova = window.Nova || {};
  window.Nova.toast = toast;
  window.Nova.dismissToast = dismiss;
  window.Nova.dismissAllToasts = dismissAll;
})();
