
import React, { useEffect, useMemo, useState } from "react";
import Icon from "../lib/icons";
import { API_URL, img, money } from "../lib/api";
import "../styles/customer-order.css";

// API REQUEST
async function request(path, options = {}) {
  const res = await fetch(API_URL + path, {
    method: options.method || "GET",
    headers: options.body
      ? { "Content-Type": "application/json" }
      : {},
    body: options.body
      ? JSON.stringify(options.body)
      : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    throw new Error(data.message || "Request failed.");
  }

  return data;
}

// PRODUCT IMAGE WITH AUTOMATIC ICON FALLBACK
function ProductVisual({ product }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [product.image_url]);

  if (!product.image_url || failed) {
    return (
      <div className="co-noimg">
        <Icon n="utensils" size={38} />
        <span>{product.item_type || "Food Item"}</span>
      </div>
    );
  }

  return (
    <img
      className="co-product-image"
      src={img(product.image_url)}
      alt={product.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

// MAIN CUSTOMER ORDER PAGE
export default function CustomerOrder({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState({});

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [order, setOrder] = useState(null);

  const [bellBusy, setBellBusy] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // LOAD TABLE MENU
  useEffect(() => {
    let active = true;

    request(`/public/qr/${token}`)
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });

    return () => {
      active = false;
    };
  }, [token]);

  // AUTO HIDE NOTICE AFTER 3 SECONDS
  useEffect(() => {
    if (!notice) return;

    const timer = setTimeout(() => {
      setNotice("");
    }, 3000);

    return () => clearTimeout(timer);
  }, [notice]);

  // FILTER PRODUCTS
  const products = useMemo(() => {
    return (data?.products || []).filter((p) => {
      const categoryMatch =
        category === "all" ||
        String(p.category_id) === String(category);

      const text = `${p.name} ${p.description || ""}`.toLowerCase();

      const searchMatch = text.includes(search.toLowerCase().trim());

      return categoryMatch && searchMatch;
    });
  }, [data, category, search]);

  // CART ITEMS
  const lines = (data?.products || [])
    .filter((p) => cart[p.id])
    .map((p) => ({
      ...p,
      qty: cart[p.id],
    }));

  const total = lines.reduce(
    (sum, p) => sum + Number(p.price) * p.qty,
    0
  );

  const count = lines.reduce(
    (sum, p) => sum + p.qty,
    0
  );

  // QUANTITY CHANGE
  const change = (id, qty) => {
    setCart((current) => {
      const next = { ...current };

      if (qty <= 0) {
        delete next[id];
      } else {
        next[id] = Math.min(99, qty);
      }

      return next;
    });
  };

  // PLACE CUSTOMER ORDER
  const place = async () => {
    if (!count || busy) return;

    if (customerPhone && !/^[0-9]{10}$/.test(customerPhone)) {
      setNotice("Please enter a valid 10-digit mobile number.");
      return;
    }

    setBusy(true);

    try {
      const result = await request(
        `/public/qr/${token}/order`,
        {
          method: "POST",
          body: {
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim(),
            items: lines.map((p) => ({
              product_id: p.id,
              qty: p.qty,
            })),
          },
        }
      );

      setOrder(result.order);
      setCart({});
      setShowCheckout(false);
      setNotice("Your order has been sent to the cashier.");

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  // CALL CASHIER
  const callCashier = async () => {
    if (bellBusy) return;

    setBellBusy(true);

    try {
      const result = await request(
        `/public/qr/${token}/call`,
        {
          method: "POST",
          body: {},
        }
      );

      setNotice(result.message || "Cashier has been notified.");

    } catch (e) {
      setNotice(e.message);
    } finally {
      setBellBusy(false);
    }
  };

  // LOADING
  if (!data && !error) {
    return (
      <div className="co-wrap">
        <div className="co-loading">
          <Icon n="loader-circle" size={30} />
          <p>Loading restaurant menu...</p>
        </div>
      </div>
    );
  }

  // ERROR
  if (error) {
    return (
      <div className="co-wrap">
        <div className="co-error">
          <Icon n="alert-triangle" size={36} />
          <h2>Unable to open this table menu</h2>
          <p>{error}</p>
          <button
            className="co-primary-btn"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="co-wrap">

      {/* RESTAURANT HEADER */}
      <header className="co-head">

        <div className="co-brand">
          {data.logo_url && (
            <img
              src={img(data.logo_url)}
              alt="Restaurant"
              className="co-logo"
            />
          )}

          <div>
            <small>{data.restaurant}</small>
            <h1>{data.tagline || "CAFÉ & RESTAURANT"}</h1>

            <p>
              <Icon n="map-pin" size={16} />
              Table {data.table.name}
            </p>
          </div>
        </div>

        <button
          className="co-bell"
          onClick={callCashier}
          disabled={bellBusy}
          aria-label="Call cashier"
        >
          <Icon n="bell" size={25} />
          <span>{bellBusy ? "..." : "Call"}</span>
        </button>

      </header>

      {/* NOTICE */}
      {notice && (
        <div className="co-notice" role="status">
          <Icon n="check-circle" size={20} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      {/* ORDER CONFIRMATION */}
      {order && (
        <div className="co-confirm">
          <Icon n="check-circle" size={26} />

          <div>
            <b>Order received · {order.bill_no}</b>
            <span>
              Table {order.table} · {money(order.total)}
            </span>
          </div>
        </div>
      )}

      {/* SEARCH */}
      <section className="co-search-section">
        <div className="co-search">
          <Icon n="search" size={20} />

          <input
            type="search"
            placeholder="Search food, drinks and more..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {search && (
            <button onClick={() => setSearch("")}>
              ×
            </button>
          )}
        </div>
      </section>

      {/* CATEGORIES */}
      <nav className="co-cats">

        <button
          className={category === "all" ? "active" : ""}
          onClick={() => setCategory("all")}
        >
          All Items
        </button>

        {(data.categories || []).map((c) => (
          <button
            key={c.id}
            className={
              String(category) === String(c.id)
                ? "active"
                : ""
            }
            onClick={() => setCategory(String(c.id))}
          >
            {c.name}
          </button>
        ))}

      </nav>

      {/* PRODUCT COUNT */}
      <div className="co-results">
        <b>{search ? "Search Results" : "Our Menu"}</b>
        <span>{products.length} items</span>
      </div>

      {/* PRODUCTS */}
      <main className="co-products">

        {products.length === 0 ? (
          <div className="co-empty">
            <Icon n="search-x" size={38} />
            <h3>No items found</h3>
            <p>Try another search or category.</p>
            <button
              className="co-primary-btn"
              onClick={() => {
                setSearch("");
                setCategory("all");
              }}
            >
              View All Items
            </button>
          </div>
        ) : (
          products.map((p) => (
            <article className="co-product" key={p.id}>

              <ProductVisual product={p} />

              <div className="co-product-info">
                <b>{p.name}</b>

                {p.description && (
                  <p>{p.description}</p>
                )}

                <strong>{money(p.price)}</strong>
              </div>

              <div className="co-qty">

                {cart[p.id] ? (
                  <>
                    <button
                      aria-label="Decrease quantity"
                      onClick={() =>
                        change(p.id, cart[p.id] - 1)
                      }
                    >
                      −
                    </button>

                    <b>{cart[p.id]}</b>

                    <button
                      aria-label="Increase quantity"
                      onClick={() =>
                        change(p.id, cart[p.id] + 1)
                      }
                    >
                      +
                    </button>
                  </>
                ) : (
                  <button onClick={() => change(p.id, 1)}>
                    ADD
                  </button>
                )}

              </div>
            </article>
          ))
        )}

      </main>

      {/* CUSTOMER CART */}
      {count > 0 && (
        <div className="co-cart">

          <div className="co-cart-info">
            <b>{count} item(s) added</b>
            <span>{money(total)}</span>
          </div>

          <button
            onClick={() => setShowCheckout(true)}
            disabled={busy}
          >
            View Cart & Order
            <Icon n="arrow-right" />
          </button>

        </div>
      )}

      {/* CHECKOUT PANEL */}
      {showCheckout && (
        <div
          className="co-checkout-overlay"
          onClick={() => setShowCheckout(false)}
        >
          <section
            className="co-checkout"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="co-checkout-header">
              <div>
                <h2>Your Order</h2>
                <p>Table {data.table.name}</p>
              </div>

              <button
                onClick={() => setShowCheckout(false)}
              >
                ×
              </button>
            </div>

            <div className="co-checkout-items">
              {lines.map((p) => (
                <div className="co-checkout-item" key={p.id}>
                  <div>
                    <b>{p.name}</b>
                    <small>
                      {money(p.price)} × {p.qty}
                    </small>
                  </div>

                  <div className="co-checkout-qty">
                    <button onClick={() => change(p.id, p.qty - 1)}>
                      −
                    </button>

                    <b>{p.qty}</b>

                    <button onClick={() => change(p.id, p.qty + 1)}>
                      +
                    </button>
                  </div>

                  <strong>{money(p.price * p.qty)}</strong>
                </div>
              ))}
            </div>

            <div className="co-customer-details">
              <h3>Customer Details (Optional)</h3>

              <input
                type="text"
                placeholder="Your name"
                maxLength={100}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />

              <input
                type="tel"
                placeholder="10-digit mobile number"
                maxLength={10}
                value={customerPhone}
                onChange={(e) =>
                  setCustomerPhone(
                    e.target.value.replace(/\D/g, "").slice(0, 10)
                  )
                }
              />
            </div>

            <div className="co-total">
              <span>Total Amount</span>
              <b>{money(total)}</b>
            </div>

            <button
              className="co-place-order"
              onClick={place}
              disabled={busy || count === 0}
            >
              {busy ? "Sending Order..." : "Place Order"}
              <Icon n="check-circle" />
            </button>

            <p className="co-payment-note">
              Please pay at the cashier after your meal.
            </p>

          </section>
        </div>
      )}

      {/* FOOTER */}
      <footer className="co-foot">
        <p>Thank you for visiting {data.restaurant}!</p>
        <small>Powered by AmpleMind Technologies</small>
      </footer>

    </div>
  );
}
