@echo off
setlocal EnableExtensions EnableDelayedExpansion

set BASE_AUTH=http://localhost:4001
set BASE_PRODUCT=http://localhost:4002
set BASE_CART=http://localhost:4003
set BASE_ORDER=http://localhost:4004
set BASE_GATEWAY=http://localhost:4000

set USER_EMAIL=user1@test.com
set USER_NAME=User One
set USER_PASSWORD=password123
set USER_ID=user-001

echo.
echo === Commit 5 Smoke Test Starting ===
echo.

call :health_checks || goto :fail
call :auth_flow || goto :fail
call :product_flow || goto :fail
call :cart_flow || goto :fail
call :grpc_internal_flow || goto :fail
call :order_cqrs_flow || goto :fail
call :step11_checkout_verify_flow || goto :fail
call :step13_compensation_flow || goto :fail
call :step16_idempotency_flow || goto :fail

echo.
echo === Smoke Test Completed Successfully ===
goto :end

:health_checks
echo [1/6] Health checks...
curl.exe -s "%BASE_GATEWAY%/health" > "%TEMP%\gateway_health.json" || exit /b 1
curl.exe -s "%BASE_AUTH%/health" > "%TEMP%\auth_health.json" || exit /b 1
curl.exe -s "%BASE_PRODUCT%/health" > "%TEMP%\product_health.json" || exit /b 1
curl.exe -s "%BASE_CART%/health" > "%TEMP%\cart_health.json" || exit /b 1
curl.exe -s "%BASE_ORDER%/health" > "%TEMP%\order_health.json" || exit /b 1
echo OK health endpoints responded.
exit /b 0

:auth_flow
echo [2/6] Auth flow...
curl.exe -s -X POST "%BASE_AUTH%/signup" -H "Content-Type: application/json" -d "{\"email\":\"%USER_EMAIL%\",\"name\":\"%USER_NAME%\",\"password\":\"%USER_PASSWORD%\"}" > "%TEMP%\auth_signup.json"
curl.exe -s -X POST "%BASE_AUTH%/login" -H "Content-Type: application/json" -d "{\"email\":\"%USER_EMAIL%\",\"password\":\"%USER_PASSWORD%\"}" > "%TEMP%\auth_login.json" || exit /b 1
call :json_get "%TEMP%\auth_login.json" "token" TOKEN || exit /b 1
if "%TOKEN%"=="" (
  echo Failed to get JWT token from login response.
  type "%TEMP%\auth_login.json"
  exit /b 1
)
curl.exe -s "%BASE_AUTH%/verify" -H "Authorization: Bearer %TOKEN%" > "%TEMP%\auth_verify.json" || exit /b 1
echo OK auth login/verify passed.
exit /b 0

:product_flow
echo [3/6] Product flow...
curl.exe -s "%BASE_PRODUCT%/products" > "%TEMP%\products_list.json" || exit /b 1
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$j = Get-Content -Raw '%TEMP%\\products_list.json' | ConvertFrom-Json; if($j.items.Count -gt 0){$j.items[0].id}"`) do set PRODUCT_ID=%%i
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$j = Get-Content -Raw '%TEMP%\\products_list.json' | ConvertFrom-Json; if($j.items.Count -gt 0){$j.items[0].price}"`) do set PRODUCT_PRICE=%%i
if "%PRODUCT_ID%"=="" (
  echo No products found from product service.
  type "%TEMP%\products_list.json"
  exit /b 1
)
if "%PRODUCT_PRICE%"=="" set PRODUCT_PRICE=100
curl.exe -s "%BASE_PRODUCT%/products/%PRODUCT_ID%" > "%TEMP%\product_by_id.json" || exit /b 1
echo OK product list/details passed. PRODUCT_ID=%PRODUCT_ID%
exit /b 0

:cart_flow
echo [4/6] Cart flow...
curl.exe -s -X POST "%BASE_CART%/cart/items" -H "Content-Type: application/json" -d "{\"userId\":\"%USER_ID%\",\"productId\":\"%PRODUCT_ID%\",\"quantity\":2,\"price\":%PRODUCT_PRICE%}" > "%TEMP%\cart_add.json" || exit /b 1
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$j = Get-Content -Raw '%TEMP%\\cart_add.json' | ConvertFrom-Json; if($j.items.Count -gt 0){$j.items[0].id}"`) do set CART_ITEM_ID=%%i
if "%CART_ITEM_ID%"=="" (
  echo Failed to extract cart item id.
  type "%TEMP%\cart_add.json"
  exit /b 1
)
curl.exe -s "%BASE_CART%/cart/%USER_ID%" > "%TEMP%\cart_get.json" || exit /b 1
curl.exe -s -X PUT "%BASE_CART%/cart/items/%CART_ITEM_ID%" -H "Content-Type: application/json" -d "{\"userId\":\"%USER_ID%\",\"quantity\":3}" > "%TEMP%\cart_update.json" || exit /b 1
echo OK cart add/get/update passed. CART_ITEM_ID=%CART_ITEM_ID%
exit /b 0

:grpc_internal_flow
echo [5/6] Internal gRPC bridge tests...
curl.exe -s -X POST "%BASE_ORDER%/internal/grpc/payment-session" -H "Content-Type: application/json" -d "{\"orderId\":\"order-test-1\",\"amount\":299.99,\"currency\":\"INR\"}" > "%TEMP%\grpc_create_session.json" || exit /b 1
curl.exe -s -X POST "%BASE_ORDER%/internal/grpc/payment-verify" -H "Content-Type: application/json" -d "{\"paymentId\":\"pay-test-1\",\"orderId\":\"order-test-1\"}" > "%TEMP%\grpc_verify.json" || exit /b 1
echo OK internal gRPC routes passed.
exit /b 0

:order_cqrs_flow
echo [6/6] Commit 5 CQRS order flow...
curl.exe -s -X POST "%BASE_ORDER%/checkout" -H "Content-Type: application/json" -d "{\"userId\":\"%USER_ID%\",\"currency\":\"INR\",\"items\":[{\"productId\":\"%PRODUCT_ID%\",\"price\":%PRODUCT_PRICE%,\"quantity\":2}]}" > "%TEMP%\order_checkout.json" || exit /b 1
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$j = Get-Content -Raw '%TEMP%\\order_checkout.json' | ConvertFrom-Json; if($j.order){$j.order.id}"`) do set ORDER_ID=%%i
if "%ORDER_ID%"=="" (
  echo Failed to extract ORDER_ID from checkout response.
  type "%TEMP%\order_checkout.json"
  exit /b 1
)
curl.exe -s "%BASE_ORDER%/orders/%ORDER_ID%" > "%TEMP%\order_by_id.json" || exit /b 1
curl.exe -s "%BASE_ORDER%/orders/user/%USER_ID%" > "%TEMP%\orders_by_user.json" || exit /b 1
curl.exe -s "%BASE_ORDER%/orders/admin" > "%TEMP%\orders_admin.json" || exit /b 1
curl.exe -s -X POST "%BASE_ORDER%/orders/%ORDER_ID%/confirm" -H "Content-Type: application/json" -d "{}" > "%TEMP%\order_confirm.json" || exit /b 1
curl.exe -s -X POST "%BASE_ORDER%/orders/%ORDER_ID%/fail" -H "Content-Type: application/json" -d "{\"reason\":\"PAYMENT_TIMEOUT\"}" > "%TEMP%\order_fail.json" || exit /b 1
curl.exe -s -X POST "%BASE_ORDER%/orders/%ORDER_ID%/refund-request" -H "Content-Type: application/json" -d "{\"reason\":\"STOCK_DEDUCTION_FAILED\"}" > "%TEMP%\order_refund_request.json" || exit /b 1
echo OK order CQRS routes passed. ORDER_ID=%ORDER_ID%
exit /b 0

:step11_checkout_verify_flow
echo [7/9] Step 11 checkout verify flow...
curl.exe -s -X POST "%BASE_ORDER%/checkout" -H "Content-Type: application/json" -d "{\"userId\":\"%USER_ID%\",\"currency\":\"INR\",\"items\":[{\"productId\":\"%PRODUCT_ID%\",\"price\":%PRODUCT_PRICE%,\"quantity\":1}]}" > "%TEMP%\order_checkout_step11.json" || exit /b 1
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$j = Get-Content -Raw '%TEMP%\\order_checkout_step11.json' | ConvertFrom-Json; if($j.order){$j.order.id}"`) do set STEP11_ORDER_ID=%%i
if "%STEP11_ORDER_ID%"=="" (
  echo Step 11 failed: unable to read order id.
  type "%TEMP%\order_checkout_step11.json"
  exit /b 1
)

curl.exe -s -X POST "%BASE_ORDER%/orders/%STEP11_ORDER_ID%/payment/verify" -H "Content-Type: application/json" -d "{}" > "%TEMP%\order_verify_step11.json" || exit /b 1
echo OK Step 11 verify passed. STEP11_ORDER_ID=%STEP11_ORDER_ID%
exit /b 0

:step13_compensation_flow
echo [8/9] Step 13 compensation path...
curl.exe -s -X POST "%BASE_ORDER%/checkout" -H "Content-Type: application/json" -d "{\"userId\":\"%USER_ID%\",\"currency\":\"INR\",\"items\":[{\"productId\":\"%PRODUCT_ID%\",\"price\":%PRODUCT_PRICE%,\"quantity\":999999}]}" > "%TEMP%\order_checkout_step13_fail.json" || exit /b 1
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$j = Get-Content -Raw '%TEMP%\\order_checkout_step13_fail.json' | ConvertFrom-Json; if($j.order){$j.order.status}"`) do set STEP13_STATUS=%%i
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$j = Get-Content -Raw '%TEMP%\\order_checkout_step13_fail.json' | ConvertFrom-Json; if($j.order){$j.order.refundRequired}"`) do set STEP13_REFUND=%%i

if /I not "%STEP13_STATUS%"=="FAILED" (
  echo Step 13 failed: expected status FAILED.
  type "%TEMP%\order_checkout_step13_fail.json"
  exit /b 1
)

if /I not "%STEP13_REFUND%"=="True" (
  echo Step 13 failed: expected refundRequired=true.
  type "%TEMP%\order_checkout_step13_fail.json"
  exit /b 1
)

echo OK Step 13 compensation path passed.
exit /b 0

:step16_idempotency_flow
echo [9/9] Step 16 idempotency path...
set IDEMPOTENCY_KEY=idem-%RANDOM%%RANDOM%
curl.exe -s -X POST "%BASE_ORDER%/checkout" -H "Content-Type: application/json" -H "x-idempotency-key: %IDEMPOTENCY_KEY%" -d "{\"userId\":\"%USER_ID%\",\"currency\":\"INR\",\"items\":[{\"productId\":\"%PRODUCT_ID%\",\"price\":%PRODUCT_PRICE%,\"quantity\":1}]}" > "%TEMP%\order_checkout_idem_1.json" || exit /b 1
curl.exe -s -X POST "%BASE_ORDER%/checkout" -H "Content-Type: application/json" -H "x-idempotency-key: %IDEMPOTENCY_KEY%" -d "{\"userId\":\"%USER_ID%\",\"currency\":\"INR\",\"items\":[{\"productId\":\"%PRODUCT_ID%\",\"price\":%PRODUCT_PRICE%,\"quantity\":1}]}" > "%TEMP%\order_checkout_idem_2.json" || exit /b 1

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$j = Get-Content -Raw '%TEMP%\\order_checkout_idem_1.json' | ConvertFrom-Json; if($j.order){$j.order.id}"`) do set IDEM_ORDER_1=%%i
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$j = Get-Content -Raw '%TEMP%\\order_checkout_idem_2.json' | ConvertFrom-Json; if($j.order){$j.order.id}"`) do set IDEM_ORDER_2=%%i

if "%IDEM_ORDER_1%"=="" (
  echo Step 16 failed: first order id missing.
  type "%TEMP%\order_checkout_idem_1.json"
  exit /b 1
)

if not "%IDEM_ORDER_1%"=="%IDEM_ORDER_2%" (
  echo Step 16 failed: repeated idempotent call returned different order id.
  type "%TEMP%\order_checkout_idem_1.json"
  type "%TEMP%\order_checkout_idem_2.json"
  exit /b 1
)

echo OK Step 16 idempotency path passed. ORDER_ID=%IDEM_ORDER_1%
exit /b 0

:json_get
set FILE_PATH=%~1
set FIELD_NAME=%~2
set OUTPUT_VAR=%~3
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$j = Get-Content -Raw '%FILE_PATH%' | ConvertFrom-Json; $v = $j.%FIELD_NAME%; if($v -ne $null){$v}"`) do set %OUTPUT_VAR%=%%i
exit /b 0

:fail
echo.
echo === Smoke Test Failed ===
echo Check the JSON files under %TEMP%\ for the latest responses.
exit /b 1

:end
endlocal
exit /b 0