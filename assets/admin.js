(function () {
  const $ = (sel) => document.querySelector(sel);
  let password = null;

  try { password = sessionStorage.getItem("adminPassword"); } catch (e) { /* mod privat */ }

  const euro = (cents) => new Intl.NumberFormat("ro", { style: "currency", currency: "EUR", currencyDisplay: "narrowSymbol" }).format(cents / 100);
  const date = (ts) => new Date(ts).toLocaleString("ro");

  const ERRORS = {
    wrong_password: "Parolă greșită.",
    too_many_attempts: "Prea multe încercări. Așteaptă un minut.",
    admin_password_not_set: "Parola de admin nu este setată în Vercel (ADMIN_PASSWORD).",
    storage_not_configured: "Baza de date nu este conectată în Vercel (Storage → Upstash Redis).",
    invalid: "Date invalide.",
    not_found: "Elementul nu mai există (poate a fost deja procesat)."
  };

  async function api(action, extra) {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password || "" },
      body: JSON.stringify(Object.assign({ action }, extra || {}))
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* răspuns gol */ }
    if (!res.ok) {
      const err = new Error(ERRORS[data.error] || "Eroare de server (" + res.status + ").");
      err.code = data.error;
      throw err;
    }
    return data;
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.assign(node, props || {});
    (children || []).forEach((c) => node.append(c));
    return node;
  }

  function button(label, cls, onClick) {
    const b = el("button", { type: "button", className: "btn btn-sm " + cls, textContent: label });
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { await onClick(); await refresh(); } catch (e) {
        if (e.message !== "Anulat.") alert(e.message);
        b.disabled = false;
      }
    });
    return b;
  }

  function itemCard(item, actions) {
    const who = [item.name || "Anonim", item.country].filter(Boolean).join(" · ");
    const tag = el("span", { className: "tag " + item.type, textContent: item.type === "idea" ? "Idee" : "Testimonial" });
    return el("div", { className: "item" }, [
      el("div", { className: "meta" }, [tag, who + " · " + date(item.ts) + (item.lang ? " · " + item.lang : "")]),
      el("p", { textContent: item.message }),
      el("div", { className: "actions" }, actions)
    ]);
  }

  function renderList(container, items, emptyText, makeActions) {
    container.textContent = "";
    if (!items.length) {
      container.append(el("p", { className: "empty", textContent: emptyText }));
      return;
    }
    items.forEach((item) => container.append(itemCard(item, makeActions(item))));
  }

  function render(data) {
    $("#sVisitors").textContent = data.stats.visitors.toLocaleString("ro");
    $("#sDonations").textContent = data.stats.donations.toLocaleString("ro");
    $("#sTotal").textContent = euro(data.stats.cents);

    $("#pendingCount").textContent = data.pending.length ? "(" + data.pending.length + ")" : "";
    renderList($("#pendingList"), data.pending, "Nimic nou. 🎉", (item) => [
      button(item.type === "idea" ? "Marchează ca citită" : "Publică", "btn-gold", () => api("approve", { id: item.id })),
      button("Șterge", "btn-danger", () => {
        if (!confirm("Ștergi definitiv acest mesaj?")) throw new Error("Anulat.");
        return api("reject", { id: item.id });
      })
    ]);

    renderList($("#approvedList"), data.approved, "Niciun testimonial publicat încă.", (item) => [
      button("Scoate de pe site", "btn-danger", () => {
        if (!confirm("Scoți acest testimonial de pe site?")) throw new Error("Anulat.");
        return api("unpublish", { id: item.id });
      })
    ]);

    renderList($("#ideasList"), data.ideas, "Nicio idee citită încă.", () => []);

    const log = $("#donationLog");
    log.textContent = "";
    if (!data.donations.length) {
      log.append(el("p", { className: "empty", textContent: "Nicio donație adăugată încă." }));
    } else {
      const rows = data.donations.map((d) => el("tr", {}, [
        el("td", { textContent: date(d.ts) }),
        el("td", { textContent: d.source }),
        el("td", { textContent: String(d.count) }),
        el("td", { textContent: euro(d.cents) }),
        el("td", { textContent: d.note || "" })
      ]));
      log.append(el("table", {}, [
        el("thead", {}, [el("tr", {}, ["Data", "Sursa", "Oameni", "Suma", "Notă"].map((h) => el("th", { textContent: h })))]),
        el("tbody", {}, rows)
      ]));
    }
  }

  async function refresh() {
    render(await api("list"));
  }

  function showDashboard(show) {
    $("#loginPanel").hidden = show;
    $("#dashboard").hidden = !show;
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    password = $("#password").value;
    $("#loginMsg").textContent = "";
    try {
      await refresh();
      try { sessionStorage.setItem("adminPassword", password); } catch (err) { /* mod privat */ }
      showDashboard(true);
    } catch (err) {
      $("#loginMsg").textContent = err.message;
    }
  });

  $("#logoutBtn").addEventListener("click", () => {
    password = null;
    try { sessionStorage.removeItem("adminPassword"); } catch (e) { /* mod privat */ }
    $("#password").value = "";
    showDashboard(false);
  });

  $("#donationForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#donationMsg");
    msg.className = "msg";
    msg.textContent = "Se salvează…";
    try {
      await api("addDonations", {
        source: $("#dSource").value,
        count: $("#dCount").value,
        amount: $("#dAmount").value,
        note: $("#dNote").value
      });
      msg.textContent = "Salvat. Cifrele de pe site s-au actualizat.";
      $("#dNote").value = "";
      await refresh();
    } catch (err) {
      msg.className = "msg err";
      msg.textContent = err.message;
    }
  });

  if (password) {
    refresh().then(() => showDashboard(true)).catch(() => showDashboard(false));
  }
})();
