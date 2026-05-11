import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { useAuthStore } from "./stores/authStore";
import { useProductStore } from "./stores/productStore";
import { useCartStore } from "./stores/cartStore";
import { useCheckoutStore } from "./stores/checkoutStore";
import { useOrderStore } from "./stores/orderStore";

function App() {
  const {
    token,
    user,
    busy: authBusy,
    message,
    setMessage,
    signup: signupAction,
    login: loginAction,
    logout,
    verifySession,
  } = useAuthStore();
  const {
    products,
    busy: productsBusy,
    loadProducts: loadProductsAction,
  } = useProductStore();
  const {
    cart,
    busy: cartBusy,
    loadCart: loadCartAction,
    addToCart: addToCartAction,
  } = useCartStore();
  const {
    checkoutResult,
    busy: checkoutBusy,
    checkout: checkoutAction,
  } = useCheckoutStore();
  const {
    orders,
    busy: ordersBusy,
    loadMyOrders,
    loadAdminOrders: loadAdminOrdersAction,
  } = useOrderStore();

  const [authForm, setAuthForm] = useState({
    name: "User One",
    email: "user1@test.com",
    password: "password123",
  });

  const [adminForm, setAdminForm] = useState({
    name: "Admin Tomato",
    category: "vegetable",
    price: 50,
    stock: 120,
    unit: "kg",
    description: "Created from frontend MVP",
  });

  const isLoggedIn = Boolean(token && user);
  const isAdmin = user?.role === "admin";
  const busy =
    authBusy || productsBusy || cartBusy || checkoutBusy || ordersBusy;

  useEffect(() => {
    if (!token || !user) return;
    verifySession();
  }, []);

  async function handleSignup() {
    try {
      await signupAction({
        name: authForm.name,
        email: authForm.email,
        password: authForm.password,
      });
    } catch (error) {
      setMessage(`Signup failed: ${error.message}`);
    }
  }

  async function handleLogin() {
    try {
      await loginAction({
        email: authForm.email,
        password: authForm.password,
      });
    } catch (error) {
      setMessage(`Login failed: ${error.message}`);
    }
  }

  async function handleLoadProducts() {
    try {
      const items = await loadProductsAction();
      setMessage(`Loaded ${items.length} products`);
    } catch (error) {
      setMessage(`Products load failed: ${error.message}`);
    }
  }

  async function handleAddToCart(product) {
    try {
      await addToCartAction(product, token);
      setMessage(`Added ${product.name} to cart`);
    } catch (error) {
      setMessage(`Add to cart failed: ${error.message}`);
    }
  }

  async function handleLoadCart() {
    try {
      const result = await loadCartAction(token);
      setMessage(`Cart has ${result.items.length} item(s)`);
    } catch (error) {
      setMessage(`Cart fetch failed: ${error.message}`);
    }
  }

  async function handleCheckout() {
    if (!cart?.items?.length) {
      setMessage("Cart is empty");
      return;
    }

    try {
      const result = await checkoutAction(cart.items, token);
      setMessage(`Checkout status: ${result.order?.status || "UNKNOWN"}`);
      await handleLoadOrders();
    } catch (error) {
      setMessage(`Checkout failed: ${error.message}`);
    }
  }

  async function handleLoadOrders() {
    try {
      const result = await loadMyOrders(token);
      setMessage(`Loaded ${result.count || 0} order(s)`);
    } catch (error) {
      setMessage(`Orders fetch failed: ${error.message}`);
    }
  }

  async function handleLoadAdminOrders() {
    try {
      const result = await loadAdminOrdersAction(token);
      setMessage(`Admin loaded ${result.count || 0} order(s)`);
    } catch (error) {
      setMessage(`Admin orders failed: ${error.message}`);
    }
  }

  async function createAdminProduct() {
    try {
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: adminForm.name,
          category: adminForm.category,
          price: Number(adminForm.price),
          stock: Number(adminForm.stock),
          unit: adminForm.unit,
          description: adminForm.description,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || `HTTP ${response.status}`);
      }

      setMessage(`Admin product created: ${result.name}`);
      await handleLoadProducts();
    } catch (error) {
      setMessage(`Admin create failed: ${error.message}`);
    }
  }

  const cartTotal = useMemo(() => {
    if (!cart?.items?.length) return 0;
    return cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
  }, [cart]);

  return (
    <div className="app-shell">
      <header className="masthead">
        <h1>Appo Commerce Console</h1>
        <p>React + Vite frontend wired to Gateway REST + GraphQL</p>
        <div className="status-strip">
          <span>
            {isLoggedIn
              ? `Signed in: ${user.email} (${user.role})`
              : "Signed out"}
          </span>
          <span>{busy ? "Working..." : "Idle"}</span>
          <span>{message}</span>
        </div>
      </header>

      <section className="panel">
        <h2>Authentication</h2>
        <div className="form-row">
          <input
            value={authForm.name}
            onChange={(e) =>
              setAuthForm((s) => ({ ...s, name: e.target.value }))
            }
            placeholder="Name"
          />
          <input
            value={authForm.email}
            onChange={(e) =>
              setAuthForm((s) => ({ ...s, email: e.target.value }))
            }
            placeholder="Email"
          />
          <input
            value={authForm.password}
            onChange={(e) =>
              setAuthForm((s) => ({ ...s, password: e.target.value }))
            }
            type="password"
            placeholder="Password"
          />
          <button onClick={handleSignup} disabled={busy}>
            Signup
          </button>
          <button onClick={handleLogin} disabled={busy}>
            Login
          </button>
          <button
            className="ghost"
            onClick={() => {
              logout();
            }}
            disabled={busy}
          >
            Logout
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Products (GraphQL)</h2>
        <div className="toolbar">
          <button onClick={handleLoadProducts} disabled={busy}>
            Load Products
          </button>
        </div>
        <div className="grid">
          {products.map((product) => (
            <article className="product-card" key={product.id}>
              <h3>{product.name}</h3>
              <p>{product.category}</p>
              <p>Rs {product.price}</p>
              <p>Stock: {product.stock ?? "NA"}</p>
              <button
                onClick={() => handleAddToCart(product)}
                disabled={!isLoggedIn || busy}
              >
                Add to Cart
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel split">
        <div>
          <h2>Cart</h2>
          <div className="toolbar">
            <button onClick={handleLoadCart} disabled={!isLoggedIn || busy}>
              Refresh Cart
            </button>
            <button onClick={handleCheckout} disabled={!isLoggedIn || busy}>
              Checkout
            </button>
          </div>
          <p>Total: Rs {cartTotal}</p>
          <pre>{JSON.stringify(cart, null, 2)}</pre>
        </div>
        <div>
          <h2>Checkout Result</h2>
          <pre>{JSON.stringify(checkoutResult, null, 2)}</pre>
        </div>
      </section>

      <section className="panel split">
        <div>
          <h2>Orders</h2>
          <div className="toolbar">
            <button onClick={handleLoadOrders} disabled={!isLoggedIn || busy}>
              My Orders
            </button>
            {/* <button
              onClick={handleLoadAdminOrders}
              disabled={!isLoggedIn || busy || !isAdmin}
            >
              Admin Orders
            </button> */}
          </div>
          <pre>{JSON.stringify(orders, null, 2)}</pre>
        </div>
      </section>
    </div>
  );
}

export default App;
