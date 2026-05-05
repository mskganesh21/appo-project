package com.example.appo.payment_service_springboot.gRPC;

// ✅ Correct imports — matching java_package in your .proto file
import com.appo.payment.proto.CreatePaymentSessionRequest;
import com.appo.payment.proto.CreatePaymentSessionResponse;
import com.appo.payment.proto.PaymentServiceGrpc;
import com.appo.payment.proto.VerifyPaymentStatusRequest;
import com.appo.payment.proto.VerifyPaymentStatusResponse;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;

@GrpcService
public class PaymentGrpcService extends PaymentServiceGrpc.PaymentServiceImplBase {

    private static final Logger log = LoggerFactory.getLogger(PaymentGrpcService.class);

    @Override
    public void createPaymentSession(
            CreatePaymentSessionRequest request,
            StreamObserver<CreatePaymentSessionResponse> responseObserver) {

        String paymentId = "pay-" + UUID.randomUUID();
        String correlationId = request.getCorrelationId();

        log.info("createPaymentSession orderId={} amount={} currency={} correlationId={}",
                request.getOrderId(), request.getAmount(), request.getCurrency(), correlationId);

        CreatePaymentSessionResponse response = CreatePaymentSessionResponse.newBuilder()
                .setSuccess(true)
                .setPaymentId(paymentId)
                .setPaymentUrl("https://payments.test.local/session/" + paymentId)
                .setStatus("PENDING")
                .setMessage("Mock payment session created")
                .build();

        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }

    @Override
    public void verifyPaymentStatus(
            VerifyPaymentStatusRequest request,
            StreamObserver<VerifyPaymentStatusResponse> responseObserver) {

        String correlationId = request.getCorrelationId();

        log.info("verifyPaymentStatus paymentId={} orderId={} correlationId={}",
                request.getPaymentId(), request.getOrderId(), correlationId);

        VerifyPaymentStatusResponse response = VerifyPaymentStatusResponse.newBuilder()
                .setSuccess(true)
                .setPaymentId(request.getPaymentId())
                .setOrderId(request.getOrderId())
                .setStatus("PAID")
                .setMessage("Mock payment status verified")
                .build();

        responseObserver.onNext(response);
        responseObserver.onCompleted();
    }
}