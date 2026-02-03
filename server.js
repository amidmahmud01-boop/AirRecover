const path = require("path");
const express = require("express");
const { createMollieClient } = require("@mollie/api-client");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY;

if (!MOLLIE_API_KEY) {
  console.error("Missing MOLLIE_API_KEY in .env");
}

const mollieClient = createMollieClient({ apiKey: MOLLIE_API_KEY || "" });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.post("/create-payment", async (req, res) => {
  try {
    const qty = Math.max(1, parseInt(req.body.qty, 10) || 1);
    const method = (req.body.method || "card").toString().toLowerCase();
    const methodMap = {
      card: "creditcard",
      paypal: "paypal",
      twint: "twint"
    };
    const unitPrice = 5.95;
    const shipping = qty >= 2 ? 0 : 3.95;
    const subtotal = unitPrice * qty;
    const total = subtotal + shipping;

    const payment = await mollieClient.payments.create({
      amount: {
        currency: "CHF",
        value: total.toFixed(2)
      },
      description: `AirRecover Starter-Set x${qty}`,
      redirectUrl: `${PUBLIC_URL}/thankyou.html`,
      method: methodMap[method] || "creditcard"
    });

    res.json({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "payment_failed" });
  }
});

app.post("/webhook", (req, res) => {
  // Optional: handle Mollie webhooks here
  res.status(200).send("ok");
});

app.listen(PORT, () => {
  console.log(`Server running on ${PUBLIC_URL}`);
});
