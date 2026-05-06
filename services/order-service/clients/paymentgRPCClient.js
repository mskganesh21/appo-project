import path from "node:path";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";

const paymentGrpcHost = process.env.PAYMENT_GRPC_HOST || "localhost:9091";
const grpcTimeoutMs = Number(process.env.PAYMENT_GRPC_TIMEOUT_MS || 5000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const protoPath = path.resolve(__dirname, "../../../proto/payment.proto");

const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const paymentProto = grpc.loadPackageDefinition(packageDefinition).payment;

const client = new paymentProto.PaymentService(
  paymentGrpcHost,
  grpc.credentials.createInsecure(),
);

function toGrpcError(methodName, error) {
  const code = error.code ?? "UNKNOWN";
  const details = error.details || error.message || "Unknown gRPC error";
  return new Error(`Payment gRPC ${methodName} failed (${code}): ${details}`);
}

function waitForClientReady() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + grpcTimeoutMs;
    client.waitForReady(deadline, (error) => {
      if (error) {
        return reject(toGrpcError("waitForReady", error));
      }
      return resolve();
    });
  });
}

async function invokeUnary(methodName, payload, correlationId) {
  await waitForClientReady();

  return new Promise((resolve, reject) => {
    const metadata = new grpc.Metadata();
    metadata.set("x-correlation-id", correlationId || "");

    const deadline = Date.now() + grpcTimeoutMs;
    client[methodName](payload, metadata, { deadline }, (error, response) => {
      if (error) {
        return reject(toGrpcError(methodName, error));
      }
      return resolve(response);
    });
  });
}

function createPaymentSession({ orderId, amount, currency, correlationId }) {
  return invokeUnary(
    "CreatePaymentSession",
    {
      order_id: orderId,
      amount,
      currency,
      correlation_id: correlationId,
    },
    correlationId,
  );
}

function verifyPaymentStatus({ paymentId, orderId, correlationId }) {
  return invokeUnary(
    "VerifyPaymentStatus",
    {
      payment_id: paymentId,
      order_id: orderId,
      correlation_id: correlationId,
    },
    correlationId,
  );
}

export { verifyPaymentStatus, createPaymentSession };
