/* Shared UI helpers: nav, toast, copy, reveal, formatting */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // mobile nav
  const burger = $(".nav-burger");
  const menu = $(".mobile-menu");
  if (burger && menu) {
    burger.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
    });
    $$("a", menu).forEach(a => a.addEventListener("click", () => menu.classList.remove("open")));
  }

  // toast
  let toastEl, toastT;
  function toast(msg, icon = "info") {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = `<svg class="ico ico-sm" aria-hidden="true"><use href="#i-${icon}"/></svg><span></span>`;
    toastEl.lastChild.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  // copy buttons: <button data-copy="text">
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const text = b.getAttribute("data-copy");
    if (!text) return toast("Address published at launch");
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => toast("Copied to clipboard", "check"))
      .catch(() => toast(text));
  });

  // reveal on scroll
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach(el => io.observe(el));
  } else {
    $$(".reveal").forEach(el => el.classList.add("in"));
  }

  // brand fill: <span data-brand="ticker">
  const C = window.MAKO_CONFIG;
  if (C) {
    $$("[data-brand]").forEach(el => {
      const k = el.getAttribute("data-brand");
      if (C.brand[k] != null) el.textContent = C.brand[k];
    });
    $$("[data-href]").forEach(el => {
      const [grp, key] = el.getAttribute("data-href").split(".");
      const v = C[grp] && C[grp][key];
      if (v) el.setAttribute("href", v);
    });
  }

  const fmt = {
    usd(n, d = 2) { return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); },
    num(n, d = 0) { return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); },
    compact(n) { return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n); },
    pct(n, d = 2) { return (n >= 0 ? "+" : "") + n.toFixed(d) + "%"; },
    short(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; },
    time(t) { return new Date(t).toLocaleTimeString("en-US", { hour12: false }); },
  };

  window.MAKO = Object.assign(window.MAKO || {}, { $, $$, toast, fmt });
})();
