import path from 'node:path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const paymentGrpcHost = process.env.PAYMENT_GRPC_HOST || "localhost:9091";

const protoPath = path.resolve(__dirname, "../../../../proto/payment.proto");

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

function createPaymentSession({ orderId, amount, currency, correlationId }) {
  return new Promise((resolve, reject) => {
    client.CreatePaymentSession(
      {
        order_id: orderId,
        amount,
        currency,
        correlation_id: correlationId,
      },
      (error, response) => {
        if (error) {
          return reject(error);
        }
        return resolve(response);
      },
    );
  });
}

function verifyPaymentStatus({ paymentId, orderId, correlationId }) {
  return new Promise((resolve, reject) => {
    client.VerifyPaymentStatus(
      {
        payment_id: paymentId,
        order_id: orderId,
        correlation_id: correlationId,
      },
      (error, response) => {
        if (error) {
          return reject(error);
        }
        return resolve(response);
      },
    );
  });
}

module.exports = {
  createPaymentSession,
  verifyPaymentStatus,
};



