(function () {
  const I18N = window.I18N;
  const GOAL = 100000000; // 100 de milioane de oameni
  const STATS_REFRESH_MS = 60000;

  let lang = "ro";
  let lastStats = null;
  let lastTestimonials = [];

  const $ = (sel) => document.querySelector(sel);
  const t = (key) => (I18N[lang] && I18N[lang][key]) || I18N.ro[key] || "";

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* mod privat */ }
  }

  // ---------- Limbă ----------
  function pickInitialLang() {
    const saved = storageGet("lang");
    if (saved && I18N[saved]) return saved;
    const browser = (navigator.language || "ro").split("-")[0];
    return I18N[browser] ? browser : "ro";
  }

  function applyLang(code) {
    if (!I18N[code]) return;
    lang = code;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml); // text fix din i18n.js, nu de la utilizatori
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nAria));
    });

    document.documentElement.lang = code;
    document.documentElement.dir = code === "ar" ? "rtl" : "ltr";
    $("#langSelect").value = code;

    if (lastStats) renderStats(lastStats, false);
    renderTestimonials(lastTestimonials);
  }

  function initLangSelect() {
    const select = $("#langSelect");
    window.LANGUAGES.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l.code;
      opt.textContent = l.name;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      storageSet("lang", select.value);
      applyLang(select.value);
    });
  }

  // ---------- Donații ----------
  function setPaymentsOpen(open) {
    const panel = $("#paymentMethods");
    panel.hidden = !open;
    $("#donateBtn").setAttribute("aria-expanded", String(open));
  }

  function initDonate() {
    $("#donateBtn").addEventListener("click", () => {
      setPaymentsOpen($("#paymentMethods").hidden);
    });
    document.querySelectorAll(".js-open-donate").forEach((btn) => {
      btn.addEventListener("click", () => {
        setPaymentsOpen(true);
        $("#donateBtn").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  // ---------- Impact live ----------
  function formatNumber(n) {
    return new Intl.NumberFormat(lang).format(n);
  }
  function formatEuro(cents) {
    return new Intl.NumberFormat(lang, {
      style: "currency",
      currency: "EUR",
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2
    }).format(cents / 100);
  }

  function animateValue(el, to, format, animate) {
    if (!animate || to === 0) { el.textContent = format(to); return; }
    const start = performance.now();
    const duration = 1200;
    function step(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(Math.round(to * eased));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderStats(stats, animate) {
    animateValue($("#statVisitors"), stats.visitors, formatNumber, animate);
    animateValue($("#statDonations"), stats.donations, formatNumber, animate);
    animateValue($("#statTotal"), stats.cents, formatEuro, animate);

    const pct = (stats.donations / GOAL) * 100;
    let label;
    if (pct === 0) label = "0%";
    else if (pct < 0.01) label = "< " + new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(0.01) + "%";
    else label = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(pct) + "%";

    $("#goalPercent").textContent = t("goal_progress").replace("{p}", label);
    $("#goalFill").style.width = Math.min(pct, 100) + "%";
    $("#goalBar").setAttribute("aria-valuenow", pct.toFixed(4));
    $("#statsOffline").hidden = true;
  }

  async function loadStats(animate) {
    try {
      const res = await fetch("/api/stats", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const stats = {
        visitors: Number(data.visitors) || 0,
        donations: Number(data.donations) || 0,
        cents: Number(data.cents) || 0
      };
      const changed = !lastStats || JSON.stringify(stats) !== JSON.stringify(lastStats);
      lastStats = stats;
      if (changed) renderStats(stats, animate);
    } catch (e) {
      if (!lastStats) $("#statsOffline").hidden = false;
    }
  }

  function countVisit() {
    if (storageGet("visited")) return Promise.resolve();
    return fetch("/api/visit", { method: "POST" })
      .then((res) => { if (res.ok) storageSet("visited", "1"); })
      .catch(() => {});
  }

  // ---------- Testimoniale ----------
  function renderTestimonials(items) {
    const grid = $("#testimonialGrid");
    grid.textContent = "";
    items.forEach((item) => {
      const fig = document.createElement("figure");
      fig.className = "testimonial";

      const quote = document.createElement("blockquote");
      quote.textContent = item.message;

      const cap = document.createElement("figcaption");
      const name = document.createElement("strong");
      name.textContent = item.name || t("anonymous");
      cap.appendChild(name);
      if (item.country) cap.appendChild(document.createTextNode(" · " + item.country));

      fig.append(quote, cap);
      grid.appendChild(fig);
    });
    $("#testimonialsEmpty").hidden = items.length > 0;
  }

  async function loadTestimonials() {
    try {
      const res = await fetch("/api/testimonials", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      lastTestimonials = Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      lastTestimonials = [];
    }
    renderTestimonials(lastTestimonials);
  }

  // ---------- Formular testimonial / idee ----------
  const dialog = $("#formDialog");
  const form = $("#submitForm");

  function openForm(type) {
    form.reset();
    $("#formType").value = type;
    $("#formTitle").textContent = t(type === "idea" ? "form_title_idea" : "form_title_testimonial");
    $("#formMessage").placeholder = t(type === "idea" ? "form_message_ph_idea" : "form_message_ph_testimonial");
    $("#consentRow").hidden = type === "idea"; // ideile nu se publică
    $("#formStatus").textContent = "";
    $("#formBody").hidden = false;
    $("#formDone").hidden = true;
    setSubmitting(false);

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    $("#formMessage").focus();
  }

  function closeForm() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function setSubmitting(on) {
    const btn = $("#formSubmit");
    btn.disabled = on;
    btn.textContent = t(on ? "form_sending" : "form_send");
  }

  async function submitForm(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const type = data.type;
    const status = $("#formStatus");
    const message = (data.message || "").trim();

    if (message.length < 10) {
      status.textContent = t("form_message") + ": min. 10";
      $("#formMessage").focus();
      return;
    }
    if (type === "testimonial" && !$("#formConsent").checked) {
      status.textContent = t("form_consent");
      $("#formConsent").focus();
      return;
    }

    status.textContent = "";
    setSubmitting(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: data.name || "",
          country: data.country || "",
          message,
          consent: $("#formConsent").checked,
          website: data.website || "",
          lang
        })
      });
      if (res.status === 429) throw new Error("rate");
      if (!res.ok) throw new Error("server");

      $("#formBody").hidden = true;
      $("#formDoneText").textContent = t(type === "idea" ? "form_ok_idea" : "form_ok_testimonial");
      $("#formDone").hidden = false;
    } catch (e) {
      status.textContent = t(e.message === "rate" ? "form_rate" : "form_error");
    } finally {
      setSubmitting(false);
    }
  }

  function initForms() {
    document.querySelectorAll("[data-form]").forEach((btn) => {
      btn.addEventListener("click", () => openForm(btn.dataset.form));
    });
    document.querySelectorAll(".js-close-dialog").forEach((btn) => {
      btn.addEventListener("click", closeForm);
    });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeForm(); // click în afara ferestrei
    });
    form.addEventListener("submit", submitForm);
  }

  // ---------- Pornire ----------
  $("#year").textContent = new Date().getFullYear();
  initLangSelect();
  initDonate();
  initForms();
  applyLang(pickInitialLang());

  countVisit().then(() => loadStats(true));
  loadTestimonials();
  setInterval(() => {
    if (!document.hidden) loadStats(false);
  }, STATS_REFRESH_MS);
})();
