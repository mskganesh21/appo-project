import crypto from "node:crypto";
import {
  runLocalTransaction,
  addOrder,
  addOrderAuditLog,
  getOrderById,
  updateOrder,
} from "../store/orderStore.js";

async function checkoutCommand({
  userId,
  items,
  currency = "INR",
  simulateAuditFailure = false,
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

  const order = runLocalTransaction(() => {
    const createdOrder = addOrder({
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

    if (simulateAuditFailure) {
      throw new Error("Simulated audit log failure");
    }

    addOrderAuditLog({
      orderId: createdOrder.id,
      eventType: "ORDER_CREATED",
      details: { userId, itemCount: items.length, totalAmount, correlationId },
    });

    return createdOrder;
  });

  let paymentSession;
  try {
    paymentSession = await paymentClient.createPaymentSession({
      orderId: order.id,
      amount: totalAmount,
      currency,
      correlationId,
    });
  } catch (error) {
    runLocalTransaction(() => {
      updateOrder(order.id, {
        status: "FAILED",
        failureReason: "PAYMENT_SESSION_CREATION_FAILED",
        payment: {
          status: "FAILED",
          error: error.message,
        },
      });

      addOrderAuditLog({
        orderId: order.id,
        eventType: "PAYMENT_SESSION_FAILED",
        details: { error: error.message, correlationId },
      });
    });

    throw error;
  }

  const updatedOrder = runLocalTransaction(() => {
    const nextOrder = updateOrder(order.id, {
      payment: {
        status: paymentSession.status || "PENDING",
        paymentId: paymentSession.payment_id,
        paymentUrl: paymentSession.payment_url,
      },
    });

    addOrderAuditLog({
      orderId: order.id,
      eventType: "PAYMENT_SESSION_CREATED",
      details: {
        paymentId: paymentSession.payment_id,
        paymentStatus: paymentSession.status || "PENDING",
      },
    });

    return nextOrder;
  });

  return {
    order: updatedOrder,
    paymentSession,
  };
}

async function verifyPaymentForOrderCommand({
  orderId,
  correlationId,
  paymentClient,
}) {
  const existingOrder = getOrderById(orderId);
  if (!existingOrder) {
    throw new Error("Order not found");
  }

  const paymentId = existingOrder.payment?.paymentId;
  if (!paymentId) {
    throw new Error("Payment not initialized for this order");
  }

  const verification = await paymentClient.verifyPaymentStatus({
    paymentId,
    orderId: existingOrder.id,
    correlationId,
  });

  const normalizedPaymentStatus = (
    verification.status || "UNKNOWN"
  ).toUpperCase();
  const nextOrderStatus =
    normalizedPaymentStatus === "PAID" ? "CONFIRMED" : "PENDING";

  const updatedOrder = runLocalTransaction(() => {
    const updated = updateOrder(existingOrder.id, {
      status: nextOrderStatus,
      payment: {
        ...(existingOrder.payment || {}),
        status: normalizedPaymentStatus,
        verifiedAt: new Date().toISOString(),
      },
    });

    addOrderAuditLog({
      orderId: existingOrder.id,
      eventType: "PAYMENT_STATUS_VERIFIED",
      details: {
        paymentId,
        paymentStatus: normalizedPaymentStatus,
        orderStatus: nextOrderStatus,
      },
    });

    return updated;
  });

  return {
    order: updatedOrder,
    paymentVerification: verification,
  };
}

function confirmOrderCommand(orderId) {
  const existingOrder = getOrderById(orderId);
  if (!existingOrder) {
    throw new Error("Order not found");
  }

  return runLocalTransaction(() => {
    const updated = updateOrder(orderId, { status: "CONFIRMED" });
    addOrderAuditLog({
      orderId,
      eventType: "ORDER_CONFIRMED",
      details: { previousStatus: existingOrder.status },
    });
    return updated;
  });
}

function failOrderCommand(orderId, reason = "UNKNOWN") {
  const existingOrder = getOrderById(orderId);
  if (!existingOrder) {
    throw new Error("Order not found");
  }

  return runLocalTransaction(() => {
    const updated = updateOrder(orderId, {
      status: "FAILED",
      failureReason: reason,
    });
    addOrderAuditLog({
      orderId,
      eventType: "ORDER_FAILED",
      details: { reason, previousStatus: existingOrder.status },
    });
    return updated;
  });
}

function requestRefundCommand(orderId, reason = "COMPENSATION_REQUIRED") {
  const existingOrder = getOrderById(orderId);
  if (!existingOrder) {
    throw new Error("Order not found");
  }

  return runLocalTransaction(() => {
    const updated = updateOrder(orderId, {
      refundRequired: true,
      refundReason: reason,
    });
    addOrderAuditLog({
      orderId,
      eventType: "REFUND_REQUESTED",
      details: { reason },
    });
    return updated;
  });
}

export {
  checkoutCommand,
  verifyPaymentForOrderCommand,
  confirmOrderCommand,
  failOrderCommand,
  requestRefundCommand,
};
