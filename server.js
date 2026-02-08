const path = require("path");
const express = require("express");
const Stripe = require("stripe");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const CONTACT_RECEIVER_EMAIL = process.env.CONTACT_RECEIVER_EMAIL || "airrecover@gmail.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

if (!STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY in .env");
}

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20"
});

async function sendContactWithResend(mail) {
  if (!RESEND_API_KEY) {
    const err = new Error("Resend API key missing");
    err.code = "RESEND_NOT_CONFIGURED";
    throw err;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [CONTACT_RECEIVER_EMAIL],
      reply_to: mail.replyTo,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    })
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (e) {
      payload = null;
    }

    const err = new Error("Resend send failed");
    err.code = "RESEND_SEND_FAILED";
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
}

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    if (!STRIPE_WEBHOOK_SECRET) {
      return res.status(200).send("webhook_not_configured");
    }

    const signature = req.headers["stripe-signature"];
    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        STRIPE_WEBHOOK_SECRET
      );

      if (event.type === "checkout.session.completed") {
        // TODO: Persist order + trigger fulfillment.
      }

      return res.status(200).send("ok");
    } catch (error) {
      console.error("Webhook signature verification failed:", error.message);
      return res.status(400).send("invalid_signature");
    }
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.post("/contact", async (req, res) => {
  try {
    const name = (req.body.name || "").toString().trim();
    const email = (req.body.email || "").toString().trim();
    const order = (req.body.order || "").toString().trim();
    const message = (req.body.message || "").toString().trim();

    if (!name || !email || !message) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const safeMessageHtml = message.replace(/\r?\n/g, "<br>");
    const orderText = order || "-";

    await sendContactWithResend({
      replyTo: email,
      subject: "Neue Kontaktanfrage von airrecover.ch",
      text:
        `Name: ${name}\n` +
        `E-Mail: ${email}\n` +
        `Bestellnummer: ${orderText}\n\n` +
        `Nachricht:\n${message}`,
      html:
        `<p><strong>Name:</strong> ${name}</p>` +
        `<p><strong>E-Mail:</strong> ${email}</p>` +
        `<p><strong>Bestellnummer:</strong> ${orderText}</p>` +
        `<p><strong>Nachricht:</strong><br>${safeMessageHtml}</p>`
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("Contact form send failed:", {
      message: error.message,
      code: error.code || null,
      status: error.status || null,
      payload: error.payload || null
    });

    if (error.code === "RESEND_NOT_CONFIGURED") {
      return res.status(500).json({ error: "resend_not_configured" });
    }

    if (error.code === "RESEND_SEND_FAILED") {
      return res.status(500).json({ error: "resend_send_failed" });
    }

    return res.status(500).json({ error: "send_failed" });
  }
});

app.post("/create-payment", async (req, res) => {
  try {
    const qty = Math.max(1, parseInt(req.body.qty, 10) || 1);
    const method = (req.body.method || "card").toString().toLowerCase();
    const shipping = qty >= 2 ? 0 : 3.95;

    const methodMap = {
      card: "card",
      paypal: "paypal",
      twint: "twint"
    };
    const paymentMethodType = methodMap[method] || "card";

    const lineItems = [
      {
        price_data: {
          currency: "chf",
          product_data: {
            name: "AirRecover Starter-Set"
          },
          unit_amount: 595
        },
        quantity: qty
      }
    ];

    if (shipping > 0) {
      lineItems.push({
        price_data: {
          currency: "chf",
          product_data: {
            name: "Versand"
          },
          unit_amount: 395
        },
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: [paymentMethodType],
      line_items: lineItems,
      success_url: `${PUBLIC_URL}/thankyou.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_URL}/?cancelled=1`,
      metadata: {
        qty: String(qty),
        selected_method: paymentMethodType
      }
    });

    return res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Stripe session creation failed:", error.message);
    return res.status(500).json({ error: "payment_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${PUBLIC_URL}`);
});
