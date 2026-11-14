import React, { useState } from "react";
import Icon from "./Icons";
import { money } from "../../lib/api";
import {
  CatTile, Header, ItemRow, NeedAnything, OrderCard, OrderStatusCard, Pic, Timeline,
  STATUS_LABEL, billNo, countItems, fmtWhen,
} from "./parts";

/* One component per screen of the customer app. `c` is the shared state + handlers from CustomerOrder.jsx */

const plural = (n, w) => `${n} ${n === 1 ? w : w + "s"}`;

function PageBar({ title, onBack, right }) {
  return (
    <div className="cx-pagebar">
      <button className="cx-xbtn" aria-label="Back" onClick={onBack}>
        <Icon n="arrowl" size={22} />
      </button>
      <h2>{title}</h2>
      <div className="cx-pagebar-r">{right}</div>
    </div>
  );
}

function Empty({ icon, title, text, action, onAction }) {
  return (
    <div className="cx-empty">
      <Icon n={icon} size={38} stroke={1.5} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="cx-outline" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

function ItemGrid({ items, c }) {
  return (
    <div className="cx-ilist">
      {items.map((p) => (
        <ItemRow key={p.id} p={p} qty={c.cart[p.id]} onChange={c.change} fav={c.favs.includes(p.id)} onFav={c.toggleFav} />
      ))}
    </div>
  );
}

function OfferBanner({ o, c }) {
  return (
    <article className="cx-offer">
      <div className="cx-offer-tx">
        {o.badge && <span className="cx-tag solid">{o.badge}</span>}
        <h3>{o.title}</h3>
        {o.subtitle && <p>{o.subtitle}</p>}
        <div className="cx-offer-pr">
          {o.price != null && <strong>{money(o.price)}</strong>}
          {o.old_price != null && <s>{money(o.old_price)}</s>}
        </div>
        {o.product_id && (
          <button className="cx-primary sm" onClick={() => c.change(o.product_id, (c.cart[o.product_id] || 0) + 1)}>
            Order now <Icon n="chevr" size={16} />
          </button>
        )}
      </div>
      <Pic src={o.image_url} className="cx-offer-img" />
    </article>
  );
}

/* ---------------- HOME ---------------- */
export function HomeTab({ c }) {
  const { data, categories, track } = c;
  return (
    <>
      <Header data={data} home bell={c.bell} onHelp={c.openHelp} onGuests={() => c.setAskParty("guests")} />
      <div className="cx-body">
        {c.callNote}
        {c.showTracker && (
          <OrderStatusCard
            track={track}
            onOpen={() => c.openDeep("order", track.id)}
            onRate={c.openFeedback}
            onDismiss={["served", "bill_pending", "cancelled"].includes(track.status) ? c.dismissTrack : undefined}
          />
        )}

        <NeedAnything picked={c.picked} onToggle={c.toggleRequest} otherText={c.otherText} onOtherText={c.setOtherText} left={c.left} busy={c.bellBusy} onCall={() => c.callCashier(c.picked, c.otherText)} />

        <div className="cx-sec-h spaced">
          <h3>Categories</h3>
          <span>{categories.length} to explore</span>
        </div>
        {categories.length === 0 ? (
          <Empty icon="utensils" title="Menu is not available right now" text="Please ask our staff for help." />
        ) : (
          <div className="cx-grid">
            {categories.map((cat) => (
              <CatTile key={cat.id} cat={cat} onOpen={c.openCategory} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- MENU ---------------- */
export function MenuTab({ c }) {
  const { categories, search } = c;
  const hasFilter = c.filters.type !== "all" || c.filters.sort !== "default";
  const q = search.toLowerCase().trim();
  let items = c.products.filter((p) => c.selCat === "all" || String(p.category_id) === String(c.selCat));
  if (q) items = items.filter((p) => `${p.name} ${p.description || ""}`.toLowerCase().includes(q));
  if (c.filters.type !== "all") items = items.filter((p) => (p.item_type || "veg") === c.filters.type);
  if (c.filters.sort === "low") items = [...items].sort((a, b) => a.price - b.price);
  if (c.filters.sort === "high") items = [...items].sort((a, b) => b.price - a.price);
  const grouped = c.selCat === "all" && !q && !hasFilter;

  return (
    <>
      <Header
        data={c.data}
        title="Menu"
        sub="Explore our delicious food and beverages"
        bell={c.bell}
        onHelp={c.openHelp}
        right={
          <button className="cx-cartbtn" onClick={c.openCart} aria-label={`Cart, ${plural(c.count, "item")}`}>
            <Icon n="cart" size={26} />
            {c.count > 0 && <em>{c.count}</em>}
          </button>
        }
      />
      <div className="cx-body">
        {c.callNote}
        <div className="cx-searchrow">
          <label className="cx-search">
            <Icon n="search" size={20} />
            <input ref={c.searchRef} type="search" aria-label="Search the menu" placeholder="Search food, drinks..." value={search} onChange={(e) => c.setSearch(e.target.value)} />
            {search && (
              <button aria-label="Clear search" onClick={() => c.setSearch("")}>
                <Icon n="x" size={16} />
              </button>
            )}
          </label>
          <button className={`cx-filterbtn ${hasFilter ? "on" : ""}`} onClick={c.openFilters} aria-label="Filters">
            <Icon n="sliders" size={22} />
            {hasFilter && <i aria-hidden="true" />}
          </button>
        </div>

        {grouped ? (
          <>
            {c.offers.length > 0 && (
              <div className="cx-offers">
                {c.offers.map((o, i) => (
                  <OfferBanner key={o.id || i} o={o} c={c} />
                ))}
              </div>
            )}

            <div className="cx-sec-h spaced">
              <h3>Categories</h3>
              <span>{categories.length} to explore</span>
            </div>
            <div className="cx-grid">
              {categories.map((cat) => (
                <CatTile key={cat.id} cat={cat} onOpen={(id) => c.setSelCat(String(id))} />
              ))}
            </div>

            {c.recommended.length > 0 && (
              <section>
                <div className="cx-sec-h spaced">
                  <h3>Recommended</h3>
                </div>
                <ItemGrid items={c.recommended} c={c} />
              </section>
            )}
          </>
        ) : (
          <>
            <nav className="cx-chips" aria-label="Categories">
              <button onClick={() => c.setSelCat("all")}>
                <Icon n="grid" size={18} /> All
              </button>
              {categories.map((cat) => (
                <button key={cat.id} className={String(c.selCat) === String(cat.id) ? "on" : ""} onClick={() => c.setSelCat(String(cat.id))}>
                  {cat.name}
                </button>
              ))}
            </nav>

            {items.length === 0 ? (
              <Empty icon="search" title="No items found" text="Try another word, or clear the filters." action="Clear search and filters" onAction={c.clearFilters} />
            ) : (
              <>
                <div className="cx-sec-h spaced">
                  <h3>{q ? "Search results" : categories.find((x) => String(x.id) === String(c.selCat))?.name || "Items"}</h3>
                  <span>{plural(items.length, "item")}</span>
                </div>
                <ItemGrid items={items} c={c} />
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ---------------- MY ORDERS ---------------- */
const FILTERS = [
  ["all", "All"],
  ["current", "Current"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];

export function OrdersTab({ c }) {
  const [f, setF] = useState("all");
  const list = c.orders.filter((o) => {
    if (f === "current") return ["pending", "preparing", "ready"].includes(o.ui);
    if (f === "completed") return ["served", "bill_pending", "completed"].includes(o.ui);
    if (f === "cancelled") return o.ui === "cancelled";
    return true;
  });
  const last = c.orders.find((o) => o.items?.length && o.ui !== "cancelled");
  return (
    <>
      <Header data={c.data} title="My Orders" sub="Track and view your orders from this visit" bell={c.bell} onHelp={c.openHelp} />
      <div className="cx-body">
        <nav className="cx-seg" aria-label="Order filter">
          {FILTERS.map(([k, l]) => (
            <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>
              {l}
            </button>
          ))}
        </nav>

        {list.length === 0 ? (
          <Empty
            icon="bag"
            title={c.orders.length ? "No orders in this list" : "No orders yet"}
            text={c.orders.length ? "Try another filter." : "Orders you place at this table will show up here."}
            action={c.orders.length ? "Show all orders" : "Browse menu"}
            onAction={() => (c.orders.length ? setF("all") : c.setTab("menu"))}
          />
        ) : (
          <div className="cx-olist">
            {list.map((o) => (
              <OrderCard key={o.id} o={o} status={o.ui} live={["pending", "preparing", "ready"].includes(o.ui)} onOpen={() => c.openDeep("order", o.id)} />
            ))}
          </div>
        )}

        {last && (
          <button className="cx-banner-btn" onClick={() => c.reorder(last)}>
            <Icon n="gift" size={28} stroke={1.5} />
            <div>
              <b>Reorder your last order</b>
              <small>Order again with one tap</small>
            </div>
            <Icon n="chevr" size={20} />
          </button>
        )}
      </div>
    </>
  );
}

/* ---------------- ORDER DETAILS ---------------- */
export function OrderDetail({ c, id }) {
  const o = c.orders.find((x) => String(x.id) === String(id));
  if (!o) {
    return (
      <>
        <PageBar title="Order Details" onBack={c.goBack} />
        <div className="cx-body">
          <Empty icon="bag" title="Order not found" text="This order is no longer available on this phone." action="Back to orders" onAction={c.goBack} />
        </div>
      </>
    );
  }
  const st = o.ui;
  const open = ["pending", "preparing", "ready"].includes(st);
  const served = ["served", "bill_pending", "completed"].includes(st);
  const live = c.track && c.track.id === o.id;
  return (
    <>
      <PageBar title="Order Details" onBack={c.goBack} />
      <div className="cx-body">
        <section className="cx-panel">
          <div className="cx-panel-h">
            <div>
              <h3>Order #{billNo(o)}</h3>
              <small>{fmtWhen(o.created_at)}</small>
            </div>
            <span className={`cx-badge ${st}`}>{STATUS_LABEL[st]}</span>
          </div>
          {st === "cancelled" ? (
            <p className="cx-cancelnote">
              <Icon n="alert" size={20} />
              {live && c.track.cancel_reason ? `This order was cancelled. Reason: ${c.track.cancel_reason}` : "This order was cancelled. Please ask our staff if you need help."}
            </p>
          ) : (
            <Timeline status={st} created={o.created_at} />
          )}
        </section>

        <section className="cx-panel">
          <div className="cx-panel-h">
            <h3>Order Items ({countItems(o)})</h3>
          </div>
          {(o.items || []).map((i, k) => (
            <div className="cx-line" key={`${i.name}-${k}`}>
              <span>
                <b>{i.name}</b>
                <small>Qty {i.qty}</small>
              </span>
              <strong>{money(i.line_total)}</strong>
            </div>
          ))}
          <div className="cx-total">
            <span>{served ? "Total" : "Total (pay at cashier)"}</span>
            <b>{money(o.total)}</b>
          </div>
        </section>

        <section className="cx-panel">
          <div className="cx-panel-h">
            <h3>Order Information</h3>
          </div>
          <dl className="cx-info">
            <div>
              <dt>
                <Icon n="table" size={18} /> Table no.
              </dt>
              <dd>{c.data.table.name}</dd>
            </div>
            <div>
              <dt>
                <Icon n="users" size={18} /> Guests
              </dt>
              <dd>{o.guests || c.data.party?.guests || "-"}</dd>
            </div>
            <div>
              <dt>
                <Icon n="clock" size={18} /> Order time
              </dt>
              <dd>{fmtWhen(o.created_at)}</dd>
            </div>
          </dl>
        </section>

        <div className="cx-actions">
          <button className="cx-outline" onClick={() => c.reorder(o)} disabled={st === "cancelled" && !o.items?.length}>
            <Icon n="refresh" size={20} /> Reorder
          </button>
          <button className="cx-primary" onClick={() => c.callCashier()} disabled={c.callBlocked}>
            <Icon n="headset" size={20} /> {c.left > 0 ? `Wait ${c.left}s` : "Call Staff"}
          </button>
        </div>
        {open && (
          <button className="cx-outline full" onClick={c.requestBill} disabled={c.callBlocked}>
            <Icon n="receipt" size={20} /> Request Bill
          </button>
        )}
        {served && live && (
          <button className="cx-outline full" onClick={c.openFeedback}>
            <Icon n="star" size={20} /> Rate your visit
          </button>
        )}
      </div>
    </>
  );
}

/* ---------------- ACCOUNT ---------------- */
export function AccountTab({ c }) {
  const cards = [
    ["bag", "My Orders", "Track and view your current orders", () => c.setTab("orders")],
    ["heart", "My Favorites", "Save items for this visit", () => c.openDeep("fav")],
    ["percent", "Offers & Deals", "View current offers and combos", () => c.openDeep("offers")],
    ["headset", "Call Staff", "Need any help? Call our staff", c.openHelp],
    ["receipt", "Request Bill", "Ask for your bill at any time", c.requestBill],
    ["info", "About Cafe", "Contact, location and more", () => c.openDeep("about")],
  ];
  return (
    <>
      <Header data={c.data} title="My Account" sub="Your table session and quick actions" bell={c.bell} onHelp={c.openHelp} />
      <div className="cx-body">
        <section className="cx-guestcard">
          <Icon n="user" size={40} stroke={1.4} />
          <div>
            <h3>{c.profile.name || "Guest Customer"}</h3>
            <span className="cx-tablepill dark">
              <Icon n="table" size={16} /> Table {c.data.table.name}
            </span>
            {c.profile.phone && <small className="cx-phone">{c.profile.phone}</small>}
          </div>
          <div className="cx-session">
            <span className="cx-live">
              <i /> Active session
            </span>
            <button className="cx-textbtn" onClick={() => c.setAskParty("name")}>
              <Icon n="note" size={15} /> Edit details
            </button>
          </div>
        </section>

        <div className="cx-acc-grid">
          {cards.map(([icon, title, sub, fn]) => (
            <button key={title} onClick={fn}>
              <span className="cx-acc-top">
                <Icon n={icon} size={28} stroke={1.5} />
                <Icon n="chevr" size={18} />
              </span>
              <b>{title}</b>
              <small>{sub}</small>
            </button>
          ))}
        </div>

        <section className="cx-session-note">
          <Icon n="clock" size={24} stroke={1.6} />
          <div>
            <b>Guest session</b>
            <p>Your activity (orders, favorites) is kept only for this table visit on this phone.</p>
          </div>
        </section>
      </div>
    </>
  );
}

/* ---------------- ACCOUNT SUB PAGES ---------------- */
export function FavoritesPage({ c }) {
  const items = c.products.filter((p) => c.favs.includes(p.id));
  return (
    <>
      <PageBar title="My Favorites" onBack={c.goBack} />
      <div className="cx-body">
        {items.length === 0 ? (
          <Empty icon="heart" title="No favorites yet" text="Tap the heart on any item to save it here." action="Browse menu" onAction={() => c.setTab("menu")} />
        ) : (
          <ItemGrid items={items} c={c} />
        )}
      </div>
    </>
  );
}

export function OffersPage({ c }) {
  return (
    <>
      <PageBar title="Offers & Deals" onBack={c.goBack} />
      <div className="cx-body">
        {c.offers.length === 0 ? (
          <Empty icon="percent" title="No offers right now" text="Check back later for combos and special deals." action="Browse menu" onAction={() => c.setTab("menu")} />
        ) : (
          <div className="cx-offers col">
            {c.offers.map((o, i) => (
              <OfferBanner key={o.id || i} o={o} c={c} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function AboutPage({ c }) {
  const d = c.data;
  return (
    <>
      <PageBar title="About Cafe" onBack={c.goBack} />
      <div className="cx-body">
        <section className="cx-panel about">
          {d.logo_url && <Pic src={d.logo_url} className="cx-about-logo" />}
          <h3>{d.restaurant}</h3>
          {d.tagline && <p>{d.tagline}</p>}
          <dl className="cx-info">
            {d.address && (
              <div>
                <dt>
                  <Icon n="pin" size={18} /> Address
                </dt>
                <dd>{d.address}</dd>
              </div>
            )}
            {d.phone && (
              <div>
                <dt>
                  <Icon n="phone" size={18} /> Phone
                </dt>
                <dd>
                  <a href={`tel:${d.phone}`}>{d.phone}</a>
                </dd>
              </div>
            )}
            <div>
              <dt>
                <Icon n="table" size={18} /> Your table
              </dt>
              <dd>{d.table.name}</dd>
            </div>
          </dl>
          {!d.address && !d.phone && <p>Please ask our staff for more information.</p>}
        </section>
      </div>
    </>
  );
}