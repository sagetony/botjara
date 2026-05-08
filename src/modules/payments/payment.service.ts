import axios from "axios";
import crypto from "crypto";
import logger from "../../utils/logger";
import { Payment } from "./payment.model";
import { Order } from "../orders/order.model";
import { Customer } from "../customers/customer.model";
import { IOrder } from "../orders/order.model";
import mongoose from "mongoose";

const PAYSTACK_BASE = "https://api.paystack.co";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;

const paystackHeaders = {
  Authorization: `Bearer ${PAYSTACK_SECRET}`,
  "Content-Type": "application/json",
};

// ─── INITIALIZE PAYMENT ───────────────────────────────────
// Creates a Paystack payment link for an order
export const initializePayment = async (
  order: IOrder,
  customerPhone: string,
): Promise<{ authorizationUrl: string; reference: string } | null> => {
  try {
    const reference = `botjara-${order.orderNumber}-${Date.now()}`;
    const amountKobo = order.total * 100; // Paystack uses kobo

    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      {
        email: `${customerPhone}@botjara.ng`, // Paystack requires email, we generate one
        amount: amountKobo,
        reference,
        currency: "NGN",
        metadata: {
          orderId: order._id?.toString(),
          orderNumber: order.orderNumber,
          tenantId: order.tenantId?.toString(),
          customerPhone,
          custom_fields: [
            {
              display_name: "Order Number",
              variable_name: "order_number",
              value: order.orderNumber,
            },
            {
              display_name: "Customer Phone",
              variable_name: "customer_phone",
              value: customerPhone,
            },
          ],
        },
        channels: ["card", "bank_transfer", "ussd", "mobile_money"],
      },
      { headers: paystackHeaders },
    );

    const { authorization_url, access_code } = response.data.data;

    // Save payment record to DB
    await Payment.create({
      tenantId: order.tenantId,
      orderId: order._id,
      customerId: order.customerId,
      paystackReference: reference,
      paystackAccessCode: access_code,
      paystackAuthorizationUrl: authorization_url,
      amount: amountKobo,
      amountNaira: order.total,
      status: "pending",
    });

    logger.info(
      `💳 Payment initialized for ${order.orderNumber}: ${reference}`,
    );
    return { authorizationUrl: authorization_url, reference };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error(
        "❌ Paystack init error:",
        error.response?.data || error.message,
      );
    }
    return null;
  }
};

// ─── VERIFY WEBHOOK SIGNATURE ─────────────────────────────
export const verifyPaystackSignature = (
  body: string,
  signature: string,
): boolean => {
  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET)
    .update(body)
    .digest("hex");
  return hash === signature;
};

// ─── HANDLE PAYMENT WEBHOOK ───────────────────────────────
export const handlePaymentWebhook = async (
  event: string,
  data: Record<string, unknown>,
): Promise<{
  orderId: string;
  tenantId: string;
  customerPhone: string;
} | null> => {
  if (event !== "charge.success") return null;

  const reference = data.reference as string;
  const metadata = data.metadata as Record<string, unknown>;

  try {
    // Update payment record
    const payment = await Payment.findOneAndUpdate(
      { paystackReference: reference },
      {
        status: "success",
        channel: data.channel as string,
        paidAt: new Date(),
        webhookData: data,
      },
      { new: true },
    );

    if (!payment) {
      logger.warn(
        `⚠️ Payment webhook received for unknown reference: ${reference}`,
      );
      return null;
    }

    // Update order status
    const order = await Order.findByIdAndUpdate(
      payment.orderId,
      { status: "paid", paymentStatus: "paid" },
      { new: true },
    );

    if (!order) return null;

    // Update customer total spent
    await Customer.findByIdAndUpdate(payment.customerId, {
      $inc: { totalSpent: payment.amountNaira },
    });

    logger.info(`✅ Payment confirmed for order ${order.orderNumber}`);

    return {
      orderId: order._id?.toString() as string,
      tenantId: order.tenantId?.toString() as string,
      customerPhone: metadata.customerPhone as string,
    };
  } catch (error) {
    logger.error("❌ Payment webhook handling failed:", error);
    return null;
  }
};

// ─── VERIFY PAYMENT MANUALLY ──────────────────────────────
export const verifyPayment = async (reference: string): Promise<boolean> => {
  try {
    const response = await axios.get(
      `${PAYSTACK_BASE}/transaction/verify/${reference}`,
      { headers: paystackHeaders },
    );
    return response.data.data.status === "success";
  } catch {
    return false;
  }
};
