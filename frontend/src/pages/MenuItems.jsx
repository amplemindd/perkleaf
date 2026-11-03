import Icon from "../lib/icons";
import React, { useRef, useState } from "react";
import { api, money, saveCSV, cap, img } from "../lib/api";
import { useAuth, useDebounced, useFetch, useShell, useUI } from "../lib/store";
import { Empty, ErrorBox, Field, Loading, Menu, Toggle } from "../lib/ui";

const Veg = ({ t }) => (
  <span className={`vmark ${t}`}>
    <i />
  </span>
);

const blank = {
  name: "",
  category_id: "",
  price: "",
  cost_price: "",
  item_type: "veg",
  description: "",
  is_active: true,
  show_in_pos: true,
  is_featured: false,
  tax_rate_id: "",
  sku: "",
  track_stock: false,
  stock_qty: 0,
  low_stock_level: 5,
  image_url: "",
  image_data: "",
  remove_image: false
};

function parseCSV(text) {
  const rows = [];
  let row = [], cur = "", q = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        q = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      q = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }

  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);

  return rows;
}

export default function MenuItems({ embedded }) {
  const { can } = useAuth();
  const { toast, ask } = useUI();
  const { search, reload } = useShell();

  const manage = can("menu.manage");

  const [f, setF] = useState({
    category_id: "",
    availability: "all",
    type: "all",
    sort: "name"
  });

  const [view, setView] = useState("grid");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const fileRef = useRef();
  const imageRef = useRef();

  const dq = useDebounced(search);

  const cats = useFetch("/categories");
  const prods = useFetch("/products", {
    ...f,
    q: dq,
    limit: 2000
  });

  const taxes = useFetch(can("taxes") ? "/taxes" : "");

  const categories = cats.data?.categories || [];
  const products = prods.data?.products || [];

  const total = categories.reduce(
    (s, c) => s + c.product_count,
    0
  );

  const set = (k, v) =>
    setF((x) => ({ ...x, [k]: v }));

  const refresh = () => {
    prods.reload();
    cats.reload();
    reload();
  };

  // PRODUCT IMAGE UPLOAD
  const chooseImage = (file) => {
    if (!file || !form) return;

    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowed.includes(file.type)) {
      toast(
        "Please select a JPG, PNG or WEBP image.",
        "err"
      );
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast(
        "Image size must be 2 MB or less.",
        "err"
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        toast(
          "Could not read this image. Please try another file.",
          "err"
        );
        return;
      }

      setForm((current) => ({
        ...current,
        image_data: reader.result,
        remove_image: false
      }));
    };

    reader.onerror = () => {
      toast(
        "Could not read this image. Please try again.",
        "err"
      );
    };

    reader.readAsDataURL(file);
  };

  // REMOVE PRODUCT IMAGE
  const removeProductImage = () => {
    setForm((current) => ({
      ...current,
      image_url: "",
      image_data: "",
      remove_image: true
    }));

    if (imageRef.current) {
      imageRef.current.value = "";
    }
  };

  // SAVE PRODUCT
  const save = async () => {
    if (!form.name.trim()) {
      return toast("Item name is required.", "err");
    }

    if (!form.category_id) {
      return toast(
        "Please select a category.",
        "err"
      );
    }

    if (form.price === "" || +form.price < 0) {
      return toast(
        "Enter a valid price.",
        "err"
      );
    }

    setBusy(true);

    try {
      const body = {
        ...form,
        price: +form.price,
        cost_price: +form.cost_price || 0
      };

      await api(
        form.id
          ? `/products/${form.id}`
          : "/products",
        {
          method: form.id ? "PUT" : "POST",
          body
        }
      );

      toast(
        form.id
          ? "Menu item updated."
          : "Menu item saved."
      );

      setForm(null);
      refresh();

    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  // DELETE PRODUCT
  const del = async (p) => {
    if (
      await ask(
        `Delete "${p.name}"? Items used in past bills are archived instead.`,
        {
          danger: true,
          okText: "Delete"
        }
      )
    ) {
      try {
        const r = await api(
          `/products/${p.id}`,
          {
            method: "DELETE"
          }
        );

        toast(r.message);
        refresh();

      } catch (e) {
        toast(e.message, "err");
      }
    }
  };

  // DUPLICATE PRODUCT
  const dup = async (p) => {
    try {
      const r = await api(
        `/products/${p.id}/duplicate`,
        {
          method: "POST"
        }
      );

      toast(r.message);
      refresh();

    } catch (e) {
      toast(e.message, "err");
    }
  };

  // CHANGE PRODUCT STATUS
  const toggle = async (p) => {
    try {
      await api(
        `/products/${p.id}/status`,
        {
          method: "PATCH",
          body: {
            is_active: !p.is_active
          }
        }
      );

      refresh();

    } catch (e) {
      toast(e.message, "err");
    }
  };

  // EDIT PRODUCT
  const edit = (p) => {
    setForm({
      ...blank,
      ...p,

      price: p.price,
      cost_price: p.cost_price,

      tax_rate_id: p.tax_rate_id || "",

      is_active: !!p.is_active,
      show_in_pos: !!p.show_in_pos,
      is_featured: !!p.is_featured,
      track_stock: !!p.track_stock,

      sku: p.sku || "",
      description: p.description || "",

      image_url: p.image_url || "",
      image_data: "",
      remove_image: false
    });
  };

  // EXPORT CSV
  const exportCsv = () =>
    saveCSV(
      "menu-items.csv",
      products,
      [
        {
          label: "name",
          key: "name"
        },
        {
          label: "category",
          key: "category_name"
        },
        {
          label: "price",
          key: "price"
        },
        {
          label: "cost_price",
          key: "cost_price"
        },
        {
          label: "item_type",
          key: "item_type"
        },
        {
          label: "sku",
          key: "sku"
        },
        {
          label: "description",
          key: "description"
        }
      ]
    );

  // IMPORT CSV
  const importCsv = async (file) => {
    if (!file) return;

    const rows = parseCSV(
      await file.text()
    );

    const head = rows.shift().map(
      (h) => h.trim().toLowerCase()
    );

    const ix = (n) => head.indexOf(n);

    if (
      ix("name") < 0 ||
      ix("price") < 0 ||
      ix("category") < 0
    ) {
      return toast(
        "CSV needs the columns: name, category, price (optional: cost_price, item_type, sku, description).",
        "err"
      );
    }

    let ok = 0;
    let bad = 0;

    for (const r of rows) {
      const cat = categories.find(
        (c) =>
          c.name.toLowerCase() ===
          (r[ix("category")] || "")
            .trim()
            .toLowerCase()
      );

      if (!cat) {
        bad++;
        continue;
      }

      try {
        await api(
          "/products",
          {
            method: "POST",
            body: {
              name: r[ix("name")],
              category_id: cat.id,

              price: +r[ix("price")],

              cost_price:
                ix("cost_price") >= 0
                  ? +r[ix("cost_price")] || 0
                  : 0,

              item_type:
                ix("item_type") >= 0
                  ? r[ix("item_type")]
                  : "veg",

              sku:
                ix("sku") >= 0
                  ? r[ix("sku")]
                  : "",

              description:
                ix("description") >= 0
                  ? r[ix("description")]
                  : ""
            }
          }
        );

        ok++;

      } catch {
        bad++;
      }
    }

    toast(
      `Imported ${ok} item(s)${bad ? `, ${bad} skipped` : ""}.`,
      bad ? "err" : "ok"
    );

    refresh();
  };

  const upd = (k) => (e) =>
    setForm({
      ...form,
      [k]: e.target.value
    });

  // IMAGE PREVIEW
  const imagePreview = form
    ? form.image_data ||
      (form.image_url ? img(form.image_url) : "")
    : "";

  return (
    <div
      className={`page split ${
        form ? "has-panel" : ""
      }`}
    >

      <div className="split-main">

        {/* PAGE HEADER */}
        <div className="ph">

          <div>
            {embedded ? (
              <h2>Items</h2>
            ) : (
              <h1>Menu Items</h1>
            )}

            <p className="muted">
              {manage
                ? "Manage all food and beverage items, prices, categories and availability"
                : "All food and beverage items and their prices"}
            </p>
          </div>

          <div className="row-end">

            {manage && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(e) => {
                    importCsv(e.target.files[0]);
                    e.target.value = "";
                  }}
                />

                <button
                  className="btn"
                  onClick={() =>
                    fileRef.current.click()
                  }
                >
                  <Icon n="upload" size={16} />
                  Import
                </button>
              </>
            )}

            <button
              className="btn"
              onClick={exportCsv}
            >
              <Icon n="download" />
              Export
            </button>

            {manage && (
              <button
                className="btn pri"
                onClick={() =>
                  setForm({
                    ...blank,
                    category_id:
                      f.category_id ||
                      (categories[0] &&
                        categories[0].id) ||
                      ""
                  })
                }
              >
                <Icon n="plus" />
                Add Item
              </button>
            )}

          </div>
        </div>

        {/* CATEGORY FILTERS */}
        <div className="catchips">

          <button
            className={`chip ${
              !f.category_id ? "on" : ""
            }`}
            onClick={() =>
              set("category_id", "")
            }
          >
            All Items ({total})
          </button>

          {categories.map((c) => (
            <button
              key={c.id}
              className={`chip ${
                String(f.category_id) ===
                String(c.id)
                  ? "on"
                  : ""
              }`}
              onClick={() =>
                set("category_id", c.id)
              }
            >
              {c.name} ({c.product_count})
            </button>
          ))}

        </div>

        {/* FILTERS */}
        <div className="filters">

          <select
            value={f.availability}
            onChange={(e) =>
              set("availability", e.target.value)
            }
          >
            <option value="all">
              Availability: All
            </option>
            <option value="available">
              Available
            </option>
            <option value="unavailable">
              Unavailable
            </option>
          </select>

          <select
            value={f.type}
            onChange={(e) =>
              set("type", e.target.value)
            }
          >
            <option value="all">
              Type: All
            </option>
            <option value="veg">Veg</option>
            <option value="nonveg">Non-Veg</option>
            <option value="egg">Egg</option>
          </select>

          <select
            value={f.sort}
            onChange={(e) =>
              set("sort", e.target.value)
            }
          >
            <option value="name">
              Sort By: Name (A-Z)
            </option>
            <option value="name_desc">
              Name (Z-A)
            </option>
            <option value="price">
              Price (Low-High)
            </option>
            <option value="price_desc">
              Price (High-Low)
            </option>
            <option value="newest">
              Newest
            </option>
          </select>

          <span className="sp" />

          <button
            className={`btn sm ico ${
              view === "grid" ? "pri" : ""
            }`}
            onClick={() => setView("grid")}
            aria-label="Grid view"
          >
            <Icon n="grid" />
          </button>

          <button
            className={`btn sm ico ${
              view === "list" ? "pri" : ""
            }`}
            onClick={() => setView("list")}
            aria-label="List view"
          >
            <Icon n="list" />
          </button>

        </div>

        {/* PRODUCTS */}
        {prods.error && !prods.data ? (
          <ErrorBox
            msg={prods.error}
            retry={prods.reloadFull}
          />
        ) : !prods.data ? (
          <Loading />
        ) : !products.length ? (
          <Empty
            icon="utensils"
            text="No menu items found."
          />
        ) : view === "grid" ? (

          <div className="mgrid">

            {products.map((p, i) => (
              <div
                key={p.id}
                className={`mcard ${
                  p.is_active ? "" : "off"
                }`}
                style={{
                  "--i": Math.min(i, 30)
                }}
              >

                <div className="mtop">
                  <Veg t={p.item_type} />
                  <b title={p.name}>
                    {p.name}
                  </b>
                </div>

                <div className="mbot">
                  <span className="mp">
                    {money(p.price)}
                  </span>

                  <span
                    className={`avl ${
                      p.is_active ? "ok" : "no"
                    }`}
                  >
                    {p.is_active
                      ? "Available"
                      : "Unavailable"}
                  </span>
                </div>

                {manage && (
                  <div className="mact">

                    <button
                      className="btn sm ico"
                      onClick={() => edit(p)}
                      aria-label="Edit"
                    >
                      <Icon
                        n="edit"
                        size={14}
                      />
                    </button>

                    <button
                      className="btn sm ico dng flat"
                      onClick={() => del(p)}
                      aria-label="Delete"
                    >
                      <Icon
                        n="trash"
                        size={14}
                      />
                    </button>

                    <Menu
                      items={[
                        [
                          "Duplicate",
                          () => dup(p)
                        ],
                        [
                          p.is_active
                            ? "Mark unavailable"
                            : "Mark available",
                          () => toggle(p)
                        ]
                      ]}
                    />

                  </div>
                )}

              </div>
            ))}

          </div>

        ) : (

          <section className="card">

            <div className="table-wrap">

              <table className="tbl">

                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Price</th>
                    <th>Cost</th>
                    <th>Status</th>
                    {manage && <th>Action</th>}
                  </tr>
                </thead>

                <tbody>

                  {products.map((p) => (
                    <tr key={p.id}>

                      <td>
                        <b>{p.name}</b>
                      </td>

                      <td>{p.category_name}</td>

                      <td>
                        <Veg t={p.item_type} />
                        {" "}
                        {cap(p.item_type)}
                      </td>

                      <td>{money(p.price)}</td>

                      <td>{money(p.cost_price)}</td>

                      <td>
                        <span
                          className={`avl ${
                            p.is_active ? "ok" : "no"
                          }`}
                        >
                          {p.is_active
                            ? "Available"
                            : "Unavailable"}
                        </span>
                      </td>

                      {manage && (
                        <td className="macts">

                          <button
                            className="btn sm ico"
                            onClick={() => edit(p)}
                          >
                            <Icon n="edit" />
                          </button>

                          <button
                            className="btn sm ico dng flat"
                            onClick={() => del(p)}
                          >
                            <Icon n="trash" />
                          </button>

                          <Menu
                            items={[
                              [
                                "Duplicate",
                                () => dup(p)
                              ],
                              [
                                p.is_active
                                  ? "Mark unavailable"
                                  : "Mark available",
                                () => toggle(p)
                              ]
                            ]}
                          />

                        </td>
                      )}

                    </tr>
                  ))}

                </tbody>

              </table>

            </div>

          </section>
        )}

      </div>

      {/* ADD / EDIT ITEM SIDE PANEL */}
      {form && (

        <div className="side-panel">

          <div className="sp-h">

            <h3>
              {form.id
                ? "Edit Menu Item"
                : "Add New Menu Item"}
            </h3>

            <button
              className="x"
              onClick={() => setForm(null)}
              aria-label="Close"
            >
              <Icon n="x" />
            </button>

          </div>

          {/* ITEM NAME */}
          <Field label="Item Name" req>

            <input
              value={form.name}
              maxLength={150}
              onChange={upd("name")}
              placeholder="e.g. Cappuccino"
            />

          </Field>

          {/* CATEGORY */}
          <Field label="Category" req>

            <select
              value={form.category_id}
              onChange={upd("category_id")}
            >
              <option value="">
                Select Category
              </option>

              {categories.map((c) => (
                <option
                  key={c.id}
                  value={c.id}
                >
                  {c.name}
                </option>
              ))}

            </select>

          </Field>

          {/* PRODUCT IMAGE UPLOAD */}
          <Field
            label="Product Image"
            hint="JPG, PNG or WEBP · Maximum 2 MB · Shown on customer QR menu"
          >

            <input
              ref={imageRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                chooseImage(e.target.files[0]);
                e.target.value = "";
              }}
            />

            {/* IMAGE PREVIEW */}
            {imagePreview ? (

              <div
                style={{
                  marginTop: 10,
                  border: "1px solid var(--line, #d8e5dc)",
                  borderRadius: 10,
                  padding: 10
                }}
              >

                <img
                  src={imagePreview}
                  alt={`${form.name || "Product"} preview`}
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: 190,
                    objectFit: "contain",
                    borderRadius: 8
                  }}
                />

                <button
                  type="button"
                  className="btn sm dng"
                  style={{
                    marginTop: 10
                  }}
                  onClick={removeProductImage}
                >
                  <Icon
                    n="trash"
                    size={14}
                  />
                  Remove Image
                </button>

              </div>

            ) : (

              <p
                className="muted"
                style={{
                  marginTop: 8,
                  fontSize: 12
                }}
              >
                No product image selected.
              </p>

            )}

          </Field>

          {/* PRICE AND COST */}
          <div className="two">

            <Field label="Price (₹)" req>

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={upd("price")}
                placeholder="e.g. 149"
              />

            </Field>

            <Field label="Cost Price (₹)">

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost_price}
                onChange={upd("cost_price")}
                placeholder="e.g. 50"
              />

            </Field>

          </div>

          {/* ITEM TYPE */}
          <div className="fld">

            <span>Item Type</span>

            <div className="radios">

              {[
                ["veg", "Veg"],
                ["nonveg", "Non-Veg"],
                ["egg", "Egg"]
              ].map(([v, l]) => (

                <label key={v}>

                  <input
                    type="radio"
                    name="itype"
                    checked={form.item_type === v}
                    onChange={() =>
                      setForm({
                        ...form,
                        item_type: v
                      })
                    }
                  />

                  <Veg t={v} />
                  {" "}
                  {l}

                </label>

              ))}

            </div>

          </div>

          {/* SKU */}
          <Field label="SKU (optional)">

            <input
              value={form.sku}
              maxLength={50}
              onChange={upd("sku")}
            />

          </Field>

          {/* DESCRIPTION */}
          <Field label="Description">

            <textarea
              rows={3}
              maxLength={200}
              value={form.description}
              onChange={upd("description")}
              placeholder="Enter item description..."
            />

            <small className="muted end">
              {form.description.length}/200
            </small>

          </Field>

          {/* TAX */}
          {can("taxes") && (

            <Field
              label="Tax override (optional)"
              hint="Leave empty to use the category / default GST rate"
            >

              <select
                value={form.tax_rate_id}
                onChange={upd("tax_rate_id")}
              >

                <option value="">
                  Use category / default rate
                </option>

                {(taxes.data?.rates || [])
                  .filter((r) => r.is_active)
                  .map((r) => (

                    <option
                      key={r.id}
                      value={r.id}
                    >
                      {r.name}
                    </option>

                  ))}

              </select>

            </Field>

          )}

          {/* STATUS OPTIONS */}
          <Toggle
            checked={form.is_active}
            onChange={(v) =>
              setForm({
                ...form,
                is_active: v
              })
            }
            label="Available"
          />

          <Toggle
            checked={form.show_in_pos}
            onChange={(v) =>
              setForm({
                ...form,
                show_in_pos: v
              })
            }
            label="Show in POS"
          />

          <Toggle
            checked={form.is_featured}
            onChange={(v) =>
              setForm({
                ...form,
                is_featured: v
              })
            }
            label="Featured Item"
          />

          <Toggle
            checked={form.track_stock}
            onChange={(v) =>
              setForm({
                ...form,
                track_stock: v
              })
            }
            label="Track stock"
          />

          {/* STOCK */}
          {form.track_stock && (

            <div className="two">

              <Field label="Stock quantity">

                <input
                  type="number"
                  min="0"
                  value={form.stock_qty}
                  onChange={upd("stock_qty")}
                />

              </Field>

              <Field label="Low stock alert at">

                <input
                  type="number"
                  min="0"
                  value={form.low_stock_level}
                  onChange={upd("low_stock_level")}
                />

              </Field>

            </div>

          )}

          {/* SAVE / CANCEL */}
          <div className="sp-actions">

            <button
              className="btn"
              onClick={() => setForm(null)}
            >
              Cancel
            </button>

            <button
              className="btn pri"
              disabled={busy}
              onClick={save}
            >
              {busy
                ? "Saving…"
                : "Save Item"}
            </button>

          </div>

        </div>

      )}

    </div>
  );
}