import { useEffect, useMemo, useState } from "react";
import "./App.css";

const STORAGE_TOKEN = "appo.token";
const STORAGE_USER = "appo.user";

function toErrorMessage(error, fallback = "Request failed") {
  return error?.message || fallback;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem(STORAGE_TOKEN) || "");
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [authForm, setAuthForm] = useState({
    name: "User One",
    email: "user1@test.com",
    password: "password123",
  });

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(null);
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [checkoutResult, setCheckoutResult] = useState(null);

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

  useEffect(() => {
    if (!token || !user) return;
    verifySession();
  }, []);

  async function api(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    return data;
  }

  async function verifySession() {
    try {
      await api("/api/auth/verify");
      setMessage("Session verified");
    } catch (error) {
      clearSession();
      setMessage(`Session expired: ${toErrorMessage(error)}`);
    }
  }

  function saveSession(nextToken, nextUser) {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem(STORAGE_TOKEN, nextToken);
    localStorage.setItem(STORAGE_USER, JSON.stringify(nextUser));
  }

  function clearSession() {
    setToken("");
    setUser(null);
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
  }

  async function signup() {
    setBusy(true);
    try {
      await api("/api/auth/signup", {
        method: "POST",
        body: {
          name: authForm.name,
          email: authForm.email,
          password: authForm.password,
        },
      });
      setMessage("Signup successful. Login now.");
    } catch (error) {
      setMessage(`Signup failed: ${toErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    setBusy(true);
    try {
      const result = await api("/api/auth/login", {
        method: "POST",
        body: {
          email: authForm.email,
          password: authForm.password,
        },
      });
      saveSession(result.token, result.user);
      setMessage(`Logged in as ${result.user.email}`);
    } catch (error) {
      setMessage(`Login failed: ${toErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadProducts() {
    setBusy(true);
    try {
      const result = await api("/graphql", {
        method: "POST",
        body: {
          query: `
            query Products($limit:Int,$offset:Int) {
              products(limit:$limit, offset:$offset) {
                items { id name category price stock unit description }
                total
              }
            }
          `,
          variables: { limit: 40, offset: 0 },
        },
      });

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }

      setProducts(result.data.products.items);
      setMessage(`Loaded ${result.data.products.items.length} products`);
    } catch (error) {
      setMessage(`Products load failed: ${toErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function addToCart(product) {
    setBusy(true);
    try {
      await api("/api/cart/items", {
        method: "POST",
        body: {
          productId: product.id,
          quantity: 1,
          price: product.price,
        },
      });
      await loadCart();
      setMessage(`Added ${product.name} to cart`);
    } catch (error) {
      setMessage(`Add to cart failed: ${toErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadCart() {
    setBusy(true);
    try {
      const result = await api("/api/cart");
      setCart(result);
      setMessage(`Cart has ${result.items.length} item(s)`);
    } catch (error) {
      setMessage(`Cart fetch failed: ${toErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (!cart?.items?.length) {
      setMessage("Cart is empty");
      return;
    }

    setBusy(true);
    try {
      const idemKey = `chk-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const result = await api("/api/checkout", {
        method: "POST",
        headers: {
          "x-idempotency-key": idemKey,
        },
        body: {
          currency: "INR",
          items: cart.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      });

      setCheckoutResult(result);
      setMessage(`Checkout status: ${result.order?.status || "UNKNOWN"}`);
      await loadOrders();
    } catch (error) {
      setMessage(`Checkout failed: ${toErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadOrders() {
    setBusy(true);
    try {
      const result = await api("/api/orders/me");
      setOrders(result.items || []);
      setMessage(`Loaded ${result.count || 0} order(s)`);
    } catch (error) {
      setMessage(`Orders fetch failed: ${toErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadAdminOrders() {
    setBusy(true);
    try {
      const result = await api("/api/orders/admin");
      setOrders(result.items || []);
      setMessage(`Admin loaded ${result.count || 0} order(s)`);
    } catch (error) {
      setMessage(`Admin orders failed: ${toErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function createAdminProduct() {
    setBusy(true);
    try {
      const result = await api("/api/admin/products", {
        method: "POST",
        body: {
          name: adminForm.name,
          category: adminForm.category,
          price: Number(adminForm.price),
          stock: Number(adminForm.stock),
          unit: adminForm.unit,
          description: adminForm.description,
        },
      });
      setMessage(`Admin product created: ${result.name}`);
      await loadProducts();
    } catch (error) {
      setMessage(`Admin create failed: ${toErrorMessage(error)}`);
    } finally {
      setBusy(false);
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
          <button onClick={signup} disabled={busy}>
            Signup
          </button>
          <button onClick={login} disabled={busy}>
            Login
          </button>
          <button
            className="ghost"
            onClick={() => {
              clearSession();
              setMessage("Logged out");
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
          <button onClick={loadProducts} disabled={busy}>
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
                onClick={() => addToCart(product)}
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
            <button onClick={loadCart} disabled={!isLoggedIn || busy}>
              Refresh Cart
            </button>
            <button onClick={checkout} disabled={!isLoggedIn || busy}>
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
            <button onClick={loadOrders} disabled={!isLoggedIn || busy}>
              My Orders
            </button>
            <button
              onClick={loadAdminOrders}
              disabled={!isLoggedIn || busy || !isAdmin}
            >
              Admin Orders
            </button>
          </div>
          <pre>{JSON.stringify(orders, null, 2)}</pre>
        </div>

        <div>
          <h2>Admin Product Create</h2>
          <div className="stack">
            <input
              value={adminForm.name}
              onChange={(e) =>
                setAdminForm((s) => ({ ...s, name: e.target.value }))
              }
              placeholder="name"
            />
            <input
              value={adminForm.category}
              onChange={(e) =>
                setAdminForm((s) => ({ ...s, category: e.target.value }))
              }
              placeholder="category"
            />
            <input
              value={adminForm.price}
              onChange={(e) =>
                setAdminForm((s) => ({ ...s, price: e.target.value }))
              }
              placeholder="price"
            />
            <input
              value={adminForm.stock}
              onChange={(e) =>
                setAdminForm((s) => ({ ...s, stock: e.target.value }))
              }
              placeholder="stock"
            />
            <input
              value={adminForm.unit}
              onChange={(e) =>
                setAdminForm((s) => ({ ...s, unit: e.target.value }))
              }
              placeholder="unit"
            />
            <input
              value={adminForm.description}
              onChange={(e) =>
                setAdminForm((s) => ({ ...s, description: e.target.value }))
              }
              placeholder="description"
            />
            <button onClick={createAdminProduct} disabled={!isAdmin || busy}>
              Create Product
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
