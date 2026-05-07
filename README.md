Appo is a microservices e-commerce MVP demonstrating production-grade distributed system patterns: CQRS, saga orchestration, gRPC cross-language communication, and idempotent request handling.
Tech Stack
Backend:
Microservices: Node.js + Express (auth, product, cart, order, gateway)
Payment Service: Spring Boot 3.3.2 (Java 21) with gRPC
API Layer: Express gateway with GraphQL reads + REST commands
Auth: JWT with role-based access control
Data: In-memory storage (MVP)

Frontend:
Framework: React 19 + Vite
State Management: Zustand
HTTP: Axios (via gateway proxy)

 
Pattern	Implementation
CQRS	Order service separates commands (/commands) from queries (/queries)
Saga + Compensation	Checkout orchestrates payment + stock; auto-rollback on failure
Idempotency	x-idempotency-key header prevents duplicate orders
Local Transaction	Atomic order + audit log writes with rollback
Adapter Pattern	Mock/Stripe payment adapters with automatic fallback
gRPC Bridge	Node order service ↔ Spring payment service
API Aggregation	GraphQL at gateway unifies products, cart, orders reads


Features
✅ JWT auth (signup/login/verify)
✅ Product catalog via GraphQL
✅ Shopping cart with checkout
✅ gRPC payment session creation
✅ Order CQRS (commands + queries)
✅ Saga compensation (stock failure → refund)
✅ Idempotent checkout (duplicate prevention)
✅ Local transaction rollback
✅ Admin product creation
✅ Stripe adapter with mock fallback
