import crypto from "node:crypto";
import {
  runLocalTransaction,
  addOrder,
  addOrderAuditLog,
  getOrderById,
  updateOrder,
  saveIdempotencyRecord,
  getIdempotencyRecord,
} from "../store/orderStore.js";

async function checkoutCommand({
  userId,
  items,
  currency = "INR",
  simulateAuditFailure = false,
  idempotencyKey,
  correlationId,
  paymentClient,
  productClient,
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

  if (idempotencyKey) {
    const existingRecord = getIdempotencyRecord(userId, idempotencyKey);
    if (existingRecord) {
      const existingOrder = getOrderById(existingRecord.orderId);
      if (existingOrder) {
        return {
          order: existingOrder,
          idempotencyKey,
          replayed: true,
        };
      }
    }
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

    if (idempotencyKey) {
      saveIdempotencyRecord({
        userId,
        idempotencyKey,
        orderId: createdOrder.id,
      });
      addOrderAuditLog({
        orderId: createdOrder.id,
        eventType: "IDEMPOTENCY_KEY_REGISTERED",
        details: { idempotencyKey },
      });
    }

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

  const paymentVerification = await paymentClient.verifyPaymentStatus({
    paymentId: paymentSession.payment_id,
    orderId: order.id,
    correlationId,
  });

  const paymentStatus = (paymentVerification.status || "UNKNOWN").toUpperCase();
  if (paymentStatus !== "PAID") {
    const failedOrder = runLocalTransaction(() => {
      const nextOrder = updateOrder(order.id, {
        status: "FAILED",
        failureReason: "PAYMENT_NOT_COMPLETED",
        payment: {
          ...(updatedOrder.payment || {}),
          status: paymentStatus,
        },
      });
      addOrderAuditLog({
        orderId: order.id,
        eventType: "CHECKOUT_FAILED_PAYMENT_NOT_PAID",
        details: { paymentStatus },
      });

      return nextOrder;
    });

    return {
      order: failedOrder,
      paymentSession,
      paymentVerification,
    };
  }

  try {
    await productClient.deductStock(items, correlationId);
  } catch (error) {
    const compensatedOrder = runLocalTransaction(() => {
      const nextOrder = updateOrder(order.id, {
        status: "FAILED",
        failureReason: "STOCK_DEDUCTION_FAILED",
        refundRequired: true,
        refundReason: "STOCK_DEDUCTION_FAILED",
        payment: {
          ...(updatedOrder.payment || {}),
          status: "PAID",
        },
      });

      addOrderAuditLog({
        orderId: order.id,
        eventType: "CHECKOUT_COMPENSATION_REQUIRED",
        details: {
          reason: "STOCK_DEDUCTION_FAILED",
          error: error.message,
        },
      });

      return nextOrder;
    });

    return {
      order: compensatedOrder,
      paymentSession,
      paymentVerification,
      compensationRequired: true,
    };
  }

  const confirmedOrder = runLocalTransaction(() => {
    const nextOrder = updateOrder(order.id, {
      status: "CONFIRMED",
      payment: {
        ...(updatedOrder.payment || {}),
        status: "PAID",
        verifiedAt: new Date().toISOString(),
      },
    });

    addOrderAuditLog({
      orderId: order.id,
      eventType: "CHECKOUT_CONFIRMED",
      details: { paymentStatus: "PAID" },
    });

    return nextOrder;
  });

  return {
    order: confirmedOrder,
    paymentSession,
    paymentVerification,
    idempotencyKey,
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
