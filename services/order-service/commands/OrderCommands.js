import crypto from "node:crypto";
import {addOrder, getOrderById, updateOrder} from '../store/orderStore.js';

async function checkoutCommand({
  userId,
  items,
  currency = "INR",
  correlationId,
  paymentClient,
}) {
  if (!userId || !Array.isArray(items) || items.length === 0) {
    throw new Error("Invalid checkout payload");
  }

  const totalAmount = items.reduce((sum, item) => {
    const price = Number(item.price || 0);
    const quantity = Number(item.quantity || 0);
    return sum + price * quantity;
  }, 0);

  if (totalAmount <= 0) {
    throw new Error("Order total must be greater than zero");
  }

  const order = addOrder({
    id: `ord-${crypto.randomUUID()}`,
    userId,
    items,
    totalAmount,
    currency,
    status: "PENDING",
    payment: {
      status: "NOT_INITIATED",
    },
    refundRequired: false,
    createdAt: new Date().toISOString(),
  });

  const paymentSession = await paymentClient.createPaymentSession({
    orderId: order.id,
    amount: totalAmount,
    currency,
    correlationId,
  });

  const updatedOrder = updateOrder(order.id, {
    payment: {
      status: paymentSession.status || "PENDING",
      paymentId: paymentSession.payment_id,
      paymentUrl: paymentSession.payment_url,
    },
  });

  return {
    order: updatedOrder,
    paymentSession,
  };
}

function confirmOrderCommand(orderId) {
  const existingOrder = getOrderById(orderId);
  if (!existingOrder) {
    throw new Error("Order not found");
  }

  return updateOrder(orderId, { status: "CONFIRMED" });
}

function failOrderCommand(orderId, reason = "UNKNOWN") {
  const existingOrder = getOrderById(orderId);
  if (!existingOrder) {
    throw new Error("Order not found");
  }

  return updateOrder(orderId, {
    status: "FAILED",
    failureReason: reason,
  });
}

function requestRefundCommand(orderId, reason = "COMPENSATION_REQUIRED") {
  const existingOrder = getOrderById(orderId);
  if (!existingOrder) {
    throw new Error("Order not found");
  }

  return updateOrder(orderId, {
    refundRequired: true,
    refundReason: reason,
  });
}

export {
  checkoutCommand,
  confirmOrderCommand,
  failOrderCommand,
  requestRefundCommand,
};



