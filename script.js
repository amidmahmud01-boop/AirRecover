(function () {
  var storageKey = "airrecover_cart";

  function formatCHF(value) {
    return "CHF " + value.toFixed(2);
  }

  function readCart() {
    var raw = localStorage.getItem(storageKey);
    if (!raw) return { qty: 1, subtotal: 5.95, shipping: 3.95, total: 9.90 };
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { qty: 1, subtotal: 5.95, shipping: 3.95, total: 9.90 };
    }
  }

  function writeCart(cart) {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  }

  function updateDrawer() {
    var drawer = document.getElementById("cartDrawer");
    if (!drawer) return;

    var cartItem = drawer.querySelector(".cart-item");
    var unitPrice = parseFloat(cartItem.dataset.unitPrice || "5.95");
    var qtyEl = document.getElementById("drawerQty");
    var lineTotalEl = document.getElementById("drawerLineTotal");
    var subtotalEl = document.getElementById("drawerSubtotal");
    var shippingEl = document.getElementById("drawerShipping");
    var totalEl = document.getElementById("drawerTotal");

    var cart = readCart();

    function updateTotals(qty) {
      var subtotal = unitPrice * qty;
      var shipping = qty >= 2 ? 0 : 3.95;
      var total = subtotal + shipping;
      var next = { qty: qty, subtotal: subtotal, shipping: shipping, total: total };

      qtyEl.textContent = String(qty);
      lineTotalEl.textContent = formatCHF(subtotal);
      subtotalEl.textContent = formatCHF(subtotal);
      shippingEl.textContent = formatCHF(shipping);
      totalEl.textContent = formatCHF(total);

      writeCart(next);
    }

    function setQty(value) {
      var qty = Math.max(1, value);
      updateTotals(qty);
    }

    var backdrop = document.getElementById("drawerBackdrop");
    var openButtons = document.querySelectorAll(".js-open-cart");
    var closeButton = drawer.querySelector(".drawer-close");

    function openDrawer() {
      drawer.classList.add("open");
      if (backdrop) backdrop.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
      if (backdrop) backdrop.setAttribute("aria-hidden", "false");
    }

    function closeDrawer() {
      drawer.classList.remove("open");
      if (backdrop) backdrop.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      if (backdrop) backdrop.setAttribute("aria-hidden", "true");
    }

    drawer.addEventListener("click", function (event) {
      var btn = event.target.closest(".qty-btn");
      if (!btn) return;
      var qty = parseInt(qtyEl.textContent, 10) || 1;
      if (btn.dataset.action === "increase") setQty(qty + 1);
      if (btn.dataset.action === "decrease") setQty(qty - 1);
    });

    openButtons.forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        openDrawer();
      });
    });

    if (closeButton) closeButton.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);

    updateTotals(cart.qty || 1);
  }

  function updateCheckoutSummary() {
    var subtotalEl = document.getElementById("summarySubtotal");
    if (!subtotalEl) return;

    var qtyEl = document.getElementById("summaryQty");
    var shippingEl = document.getElementById("summaryShipping");
    var totalEl = document.getElementById("summaryTotal");

    var cart = readCart();
    subtotalEl.textContent = formatCHF(cart.subtotal);
    if (qtyEl) qtyEl.textContent = String(cart.qty);
    if (shippingEl) shippingEl.textContent = formatCHF(cart.shipping);
    if (totalEl) totalEl.textContent = formatCHF(cart.total);
  }

  function bindCheckoutForm() {
    var form = document.getElementById("checkoutForm");
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      var submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Bitte warten...";
      }

      try {
        var cart = readCart();
        var selected = form.querySelector("input[name='pay']:checked");
        var method = selected ? selected.value : "card";
        var payload = {
          qty: cart.qty,
          method: method
        };

        var response = await fetch("/create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        var data = await response.json();
        if (data && data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }

        throw new Error("payment_failed");
      } catch (error) {
        alert("Zahlung konnte nicht gestartet werden. Bitte versuche es erneut.");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Jetzt bezahlen";
        }
      }
    });
  }

  function clearCartOnThankYou() {
    if (!document.getElementById("thankyou")) return;
    localStorage.removeItem(storageKey);
  }

  updateDrawer();
  updateCheckoutSummary();
  bindCheckoutForm();
  clearCartOnThankYou();
})();
