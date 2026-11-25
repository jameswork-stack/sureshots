import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  runTransaction,
  query,
  where,
} from "firebase/firestore";

import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import "../styles/product.css";

const PRODUCTS_COLLECTION = "products";

const EMPTY_PRODUCT_FORM = {
  productName: "",
  category: "",
  details: "",
  price: "",
  stock: "",
  purchaseCost: "",
  reason: "",
  barcode: "",
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);

const getCreatedAtTime = (createdAt) => {
  if (typeof createdAt?.toMillis === "function") return createdAt.toMillis();
  if (typeof createdAt?.seconds === "number") return createdAt.seconds * 1000;
  return Number(createdAt) || 0;
};

const validCost = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const snapshotFields = (p) => Object.fromEntries(
  ["productName", "category", "details", "price", "stock", "unitCost", "barcode"].map(k => [k, p[k] ?? null])
);
const actor = () => {
  const user = getAuth().currentUser;
  return { actorUid: user?.uid ?? null, actorEmail: user?.email ?? null };
};
const logRef = () => doc(collection(db, "productLogs"));

export default function Product() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [stockProduct, setStockProduct] = useState(null);
  const [stockForm, setStockForm] = useState({ quantity: "", cost: "" });
  const [logProduct, setLogProduct] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logError, setLogError] = useState("");
  const filteredProducts = products.filter((product) => {
  const searchTerm = search.trim().toLowerCase();

  return [
    product.productName,
    product.category,
    product.details,
    product.barcode,
  ].some((value) =>
    String(value ?? "").toLowerCase().includes(searchTerm)
  );
});

const productGroups = Array.from(
  filteredProducts.reduce((groups, product) => {
    const category =
      typeof product.category === "string" &&
      product.category.trim()
        ? product.category.trim()
        : "Uncategorized";

    const categoryKey = category.toLowerCase();

    if (!groups.has(categoryKey)) {
      groups.set(categoryKey, {
        name: category,
        products: [],
        latestCreatedAt: 0,
      });
    }

    const group = groups.get(categoryKey);

    group.products.push(product);

    group.latestCreatedAt = Math.max(
      group.latestCreatedAt,
      getCreatedAtTime(product.createdAt)
    );

    return groups;
  }, new Map()).values()
)
  .map((group) => ({
    ...group,
    products: [...group.products].sort(
      (a, b) =>
        getCreatedAtTime(b.createdAt) -
        getCreatedAtTime(a.createdAt)
    ),
  }))
  .sort(
    (a, b) =>
      b.latestCreatedAt - a.latestCreatedAt ||
      a.name.localeCompare(b.name)
  );

  const selectedProduct = products.find(
  (product) => product.id === openMenuId
);

  useEffect(() => {
  if (!showForm && !stockProduct && !logProduct) return;

  const previousOverflow = document.body.style.overflow;

  document.body.style.overflow = "hidden";

  return () => {
    document.body.style.overflow = previousOverflow;
  };
}, [showForm, stockProduct, logProduct]);

  useEffect(() => {
    let isCurrent = true;
    const fetchProducts = async () => {
      try {
        const snapshot = await getDocs(collection(db, PRODUCTS_COLLECTION));
        const productList = snapshot.docs.map((productDoc) => ({
          id: productDoc.id,
          ...productDoc.data(),
        }));
        productList.sort(
          (first, second) =>
            getCreatedAtTime(second.createdAt) -
            getCreatedAtTime(first.createdAt)
        );
        if (isCurrent) {
          setProducts(productList);
          setPageError("");
        }
      } catch (loadError) {
        console.error("Error loading products:", loadError);
        if (isCurrent) {
          setPageError("Unable to load products. Please try again.");
        }
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    fetchProducts();
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!openMenuId) return undefined;

    const closeMenu = () => {
      setOpenMenuId(null);
      setMenuPosition(null);
    };

    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [openMenuId]);

  const closeMenu = () => {
    setOpenMenuId(null);
    setMenuPosition(null);
  };

  const openProductForm = (product = null) => {
    setEditingProductId(product?.id || null);
    setProductForm(
      product
        ? {
            productName: product.productName || "",
            category: product.category || "",
            details: product.details || "",
            price: String(product.price ?? ""),
            stock: String(product.stock ?? ""),
            purchaseCost: validCost(product.unitCost) ? String(Number(product.stock) * product.unitCost) : "",
            reason: "",
            barcode: product.barcode || "",
          }
        : EMPTY_PRODUCT_FORM
    );
    setFormError("");
    setPageError("");
    closeMenu();
    setShowForm(true);
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setProductForm((current) => ({ ...current, [name]: value }));
    setFormError("");
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingProductId(null);
    setProductForm(EMPTY_PRODUCT_FORM);
    setFormError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    const productName = productForm.productName.trim();
    const category = productForm.category.trim();
    const details = productForm.details.trim();
    const price = Number(productForm.price);
    const stock = Number(productForm.stock);
    const purchaseCost = Number(productForm.purchaseCost);
    const purchaseQuantity = stock;
    if (productForm.purchaseCost.trim() === "" || !Number.isFinite(purchaseCost) || purchaseCost < 0 || !Number.isInteger(purchaseQuantity) || purchaseQuantity < 0 || (stock === 0 && purchaseCost !== 0)) {
      setFormError("Enter a valid cost. Zero stock must have zero total cost.");
      return;
    }

    if (
      !productName ||
      !category ||
      !details ||
      productForm.price === "" ||
      !Number.isFinite(price) ||
      price < 0 ||
      productForm.stock === "" ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      setFormError("Enter a product name, category, details, valid price, and whole-number stock of 0 or more.");
      return;
    }

    if (editingProductId && !productForm.reason.trim()) {
      setFormError("Enter a reason for the edit."); return;
    }
    setSaving(true);
    try {
      const productData = {
        productName,
        category,
        details,
        price,
        stock,
        purchaseCost,
        purchaseQuantity,
        unitCost: stock > 0 ? purchaseCost / stock : null,
        barcode: productForm.barcode.trim(),
      };
      const ref = editingProductId ? doc(db, PRODUCTS_COLLECTION, editingProductId) : doc(collection(db, PRODUCTS_COLLECTION));
      const audit = logRef();
      const original = products.find(p => p.id === editingProductId);
      const saved = await runTransaction(db, async tx => {
        const snap = editingProductId ? await tx.get(ref) : null;
        if (snap && !snap.exists()) throw new Error("Product no longer exists.");
        const before = snap?.data();
        if (before && JSON.stringify(snapshotFields(before)) !== JSON.stringify(snapshotFields(original))) {
          throw new Error("Product changed since loading. Refresh the page before editing.");
        }
        const next = { ...productData, unitCost: stock === 0 ? (before?.unitCost ?? null) : productData.unitCost };
        if (before) tx.update(ref, { ...next, updatedAt: serverTimestamp() });
        else tx.set(ref, { ...next, createdAt: serverTimestamp() });
        tx.set(audit, { productId: ref.id, productName, type: before ? "Edit" : "Create", reason: before ? productForm.reason.trim() : "Initial product", before: before ? snapshotFields(before) : null, after: snapshotFields(next), ...actor(), createdAt: serverTimestamp() });
        return next;
      });
      setProducts(current => editingProductId ? current.map(p => p.id === ref.id ? {...p, ...saved} : p) : [{id: ref.id, ...saved, createdAt: Date.now()}, ...current]);
      setProductForm(EMPTY_PRODUCT_FORM);
      setEditingProductId(null);
      setShowForm(false);
    } catch (saveError) {
      console.error("Error saving product:", saveError);
      setFormError(saveError.message || "Unable to save this product.");
    } finally {
      setSaving(false);
    }
  };

  const openStockForm = (product) => {
    closeMenu(); setFormError(""); setStockForm({ quantity: "", cost: "" }); setStockProduct(product);
  };
  const handleAddStock = async (event) => {
    event.preventDefault(); setFormError("");
    const quantity = Number(stockForm.quantity), cost = Number(stockForm.cost);
    if (!Number.isInteger(quantity) || quantity < 1 || stockForm.cost.trim() === "" || !validCost(cost)) {
      setFormError("Enter a positive whole quantity and a valid total cost."); return;
    }
    setSaving(true);
    try {
      const ref = doc(db, PRODUCTS_COLLECTION, stockProduct.id), audit = logRef();
      const next = await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Product not found.");
        const before = snap.data(), oldStock = Number(before.stock);
        if (!Number.isInteger(oldStock) || oldStock < 0) throw new Error("Invalid existing stock.");
        if (oldStock > 0 && !validCost(before.unitCost)) throw new Error("Set the cost of existing stock in Edit Product first.");
        const stock = oldStock + quantity;
        const purchaseCost = oldStock * (before.unitCost ?? 0) + cost;
        const unitCost = purchaseCost / stock;
        const update = { stock, purchaseCost, purchaseQuantity: stock, unitCost };
        tx.update(ref, { ...update, updatedAt: serverTimestamp() });
        tx.set(audit, { productId: ref.id, productName: before.productName, type: "Add Stock", reason: "New stock purchase", addedQuantity: quantity, addedCost: cost, before: snapshotFields(before), after: snapshotFields({...before, ...update}), ...actor(), createdAt: serverTimestamp() });
        return update;
      });
      setProducts(current => current.map(p => p.id === ref.id ? {...p, ...next} : p));
      setStockProduct(null);
    } catch (err) { setFormError(err.message || "Unable to add stock."); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    if (!logProduct) return;
    let active = true;
    setLogsLoading(true); setLogs([]); setLogError("");
    getDocs(query(collection(db, "productLogs"), where("productId", "==", logProduct.id)))
      .then(snap => { if (active) setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(log => log.type !== "Create").sort((a,b) => getCreatedAtTime(b.createdAt)-getCreatedAtTime(a.createdAt))); })
      .catch(err => { if (active) setLogError(err.message || "Unable to load logs."); })
      .finally(() => { if (active) setLogsLoading(false); });
    return () => { active = false; };
  }, [logProduct]);

  const handleDeleteProduct = async (product) => {
    closeMenu();
    setPageError("");
    setDeletingProductId(product.id);

    try {
      const salesSnapshot = await getDocs(collection(db, "rangeSold"));
      const isInSalesHistory = salesSnapshot.docs.some((saleDoc) => {
        const productItems = saleDoc.data().productItems;
        return (
          Array.isArray(productItems) &&
          productItems.some((item) => item.productId === product.id)
        );
      });
      if (isInSalesHistory) {
        setPageError(
          `Unable to delete ${product.productName}: it is referenced by sold-item history.`
        );
        return;
      }

      const stock = Number(product.stock) || 0;
      const stockWarning =
        stock > 0 ? ` This will also discard its remaining stock (${stock}).` : "";
      if (
        !window.confirm(
          `Delete ${product.productName} from Product Management?${stockWarning}`
        )
      ) {
        return;
      }

      await deleteDoc(doc(db, PRODUCTS_COLLECTION, product.id));
      setProducts((current) =>
        current.filter((item) => item.id !== product.id)
      );
      setPageError("");
    } catch (deleteError) {
      console.error("Error deleting product:", deleteError);
      setPageError("Unable to delete this product. Please try again.");
    } finally {
      setDeletingProductId(null);
    }
  };

  return (
    <section className="product-page">
      <header className="product-page-header">
        <h1>Product</h1>
        <button
          className="product-add-button"
          type="button"
          onClick={() => openProductForm()}
        >
          <span aria-hidden="true">+</span>
          Add Product
        </button>
      </header>

      {pageError && (
        <p className="product-page-error" role="alert">
          {pageError}
        </p>
      )}

      {selectedProduct && menuPosition &&
        createPortal(
          <div
            className="product-action-menu"
            role="menu"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => openProductForm(selectedProduct)}
            >
              Edit
            </button>
            <button type="button" role="menuitem" onClick={() => openStockForm(selectedProduct)}>Add Stock</button>
            <button type="button" role="menuitem" onClick={() => { setLogProduct(selectedProduct); closeMenu(); }}>View Log</button>
            <button
              className="product-menu-delete"
              type="button"
              role="menuitem"
              onClick={() => handleDeleteProduct(selectedProduct)}
              disabled={deletingProductId === selectedProduct.id}
            >
              Delete
            </button>
          </div>,
          document.body
        )}

      {showForm && createPortal(
  <div className="product-modal-overlay">
    <form
      className="product-form product-modal-form"
      onSubmit={handleSubmit}
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
    >
      <div className="product-modal-header">
        <h2 id="product-modal-title">
          {editingProductId ? "Edit Product" : "Add Product"}
        </h2>

        <button
          type="button"
          className="product-modal-close"
          onClick={handleCancel}
          disabled={saving}
          aria-label="Close product form"
        >
          ×
        </button>
      </div>
          <div className="product-form-grid">
            <div className="product-form-field">
              <label htmlFor="product-name">Product Name</label>
              <input
                id="product-name"
                name="productName"
                type="text"
                value={productForm.productName}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="product-form-field">
              <label htmlFor="product-category">Category Name</label>
              <input
                id="product-category"
                name="category"
                type="text"
                value={productForm.category}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="product-form-field">
              <label htmlFor="product-barcode">Barcode</label>
              <input
                id="product-barcode"
                name="barcode"
                type="text"
                value={productForm.barcode}
                onChange={handleFormChange}
              />
            </div>

            <div className="product-form-field product-form-field-wide">
              <label htmlFor="product-details">Details</label>
              <textarea
                id="product-details"
                name="details"
                rows="3"
                value={productForm.details}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="product-form-field">
              <label htmlFor="product-price">Price</label>
              <input
                id="product-price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                value={productForm.price}
                onChange={handleFormChange}
                required
              />
            </div>

            <div className="product-form-field">
              <label htmlFor="product-purchase-cost">Total Cost of Entered Stock (₱)</label>
              <input id="product-purchase-cost" name="purchaseCost" type="number" min="0" step="0.01" value={productForm.purchaseCost} onChange={handleFormChange} required />
            </div>
            <div className="product-form-field">
              <label htmlFor="product-unit-cost">Cost per Unit (automatic)</label>
              <input id="product-unit-cost" readOnly value={productForm.purchaseCost !== "" && Number(productForm.stock) > 0 ? formatCurrency(Number(productForm.purchaseCost) / Number(productForm.stock)) : ""} />
            </div>
            <div className="product-form-field">
              <label htmlFor="product-stock">Stock Quantity</label>
              <input
                id="product-stock"
                name="stock"
                type="number"
                min="0"
                step="1"
                value={productForm.stock}
                onChange={handleFormChange}
                required
              />
            </div>
          </div>

          {editingProductId && <div className="product-form-field"><label htmlFor="product-edit-reason">Edit reason</label><textarea id="product-edit-reason" name="reason" required value={productForm.reason} onChange={handleFormChange} /></div>}
          {formError && (
            <p className="product-form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="product-form-actions">
            <button
              className="product-cancel-button"
              type="button"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="product-save-button"
              type="submit"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingProductId
                  ? "Save Changes"
                  : "Save Product"}
            </button>
          </div>
            </form>
  </div>,
  document.body
)}

      {stockProduct && createPortal(<div className="product-modal-overlay">
        <form className="product-form product-modal-form" onSubmit={handleAddStock} role="dialog" aria-modal="true" aria-label="Add stock">
          <div className="product-modal-header"><h2>Add Stock — {stockProduct.productName}</h2><button type="button" className="product-modal-close" disabled={saving} onClick={() => setStockProduct(null)} aria-label="Close">×</button></div>
          <p>Current stock: {stockProduct.stock} · Cost per unit: {validCost(stockProduct.unitCost) ? formatCurrency(stockProduct.unitCost) : "Not set"}</p>
          <div className="product-form-grid">
            <div className="product-form-field"><label htmlFor="added-quantity">Quantity to add</label><input id="added-quantity" type="number" min="1" step="1" required value={stockForm.quantity} onChange={e => setStockForm(p => ({...p, quantity: e.target.value}))}/></div>
            <div className="product-form-field"><label htmlFor="added-cost">Total new stock cost (₱)</label><input id="added-cost" type="number" min="0" step="0.01" required value={stockForm.cost} onChange={e => setStockForm(p => ({...p, cost: e.target.value}))}/></div>
          </div>
          {Number(stockForm.quantity) > 0 && stockForm.cost !== "" && (Number(stockProduct.stock) === 0 || validCost(stockProduct.unitCost)) && <p>Estimated new average cost: {formatCurrency((Number(stockProduct.stock) * (stockProduct.unitCost ?? 0) + Number(stockForm.cost))/(Number(stockProduct.stock)+Number(stockForm.quantity)))}</p>}
          {formError && <p role="alert" className="product-form-error">{formError}</p>}
          <div className="product-form-actions"><button type="button" className="product-cancel-button" disabled={saving} onClick={() => setStockProduct(null)}>Cancel</button><button className="product-save-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Stock"}</button></div>
        </form></div>, document.body)}
      {logProduct && createPortal(<div className="product-modal-overlay"><section className="product-form product-modal-form" role="dialog" aria-modal="true" aria-label="Product history">
        <div className="product-modal-header"><h2>View Log — {logProduct.productName}</h2><button type="button" className="product-modal-close" onClick={() => setLogProduct(null)} aria-label="Close">×</button></div>
        {logsLoading ? <p>Loading logs...</p> : logError ? <p role="alert">{logError}</p> : !logs.length ? <p>No logs recorded yet.</p> : logs.map(log => <article className="product-audit-entry" key={log.id}>
          <h3>{log.type}</h3><p>{log.createdAt?.toDate?.().toLocaleString("en-PH") || "Date unavailable"} · {log.actorEmail || log.actorUid || "Unknown user"}</p><p>Reason: {log.reason}</p>
          {log.type === "Add Stock" && <p>Added: {log.addedQuantity} · Purchase cost: {formatCurrency(log.addedCost)}</p>}
          <div className="product-table-scroll"><table className="product-table"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{Object.keys(log.after || {}).filter(k => !log.before || log.before[k] !== log.after[k]).map(k => <tr key={k}><td>{k}</td><td>{String(log.before?.[k] ?? "—")}</td><td>{String(log.after[k] ?? "—")}</td></tr>)}</tbody></table></div>
        </article>)}
      </section></div>, document.body)}

      <div className="product-search-container">
  <div className="product-search-box">
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>

    <input
      type="search"
      aria-label="Search products"
      placeholder="Search product, category, or barcode..."
      value={search}
      onChange={(event) => {
        setSearch(event.target.value);
        closeMenu();
      }}
    />

    {search && (
      <button
        type="button"
        className="product-search-clear"
        aria-label="Clear search"
        onClick={() => setSearch("")}
      >
        ×
      </button>
    )}
  </div>

  <span className="product-search-count">
    Showing {filteredProducts.length} of {products.length} products
  </span>
</div>

      <div className="product-list-panel">
        {loading ? (
          <p className="product-list-message">Loading products...</p>
        ) : products.length === 0 ? (
  <p className="product-list-message">
    No products have been added yet.
  </p>
) : filteredProducts.length === 0 ? (
  <p className="product-list-message">
    No products found matching "{search}".
  </p>
) : (
          <div className="product-category-list">
            {productGroups.map((group) => (
              <section className="product-category-section" key={group.name.toLowerCase()}>
                <header className="product-category-heading">
                  <h2>{group.name}</h2>
                  <span>
                    {group.products.length}{" "}
                    {group.products.length === 1 ? "product" : "products"}
                  </span>
                </header>
                <div className="product-table-scroll">
                  <table className="product-table">
                    <thead>
                      <tr>
                        <th>Product Name</th>
                        <th>Details</th>
                        <th>Price</th>
                        <th>Cost / Unit</th>
                        <th>Stock</th>
                        <th>Barcode</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.products.map((product) => (
                        <tr key={product.id}>
                          <td>{product.productName}</td>
                          <td>{product.details}</td>
                          <td>{formatCurrency(Number(product.price) || 0)}</td>
                          <td>{product.unitCost == null ? "Not set" : formatCurrency(product.unitCost)}</td>
                          <td>{product.stock}</td>
                          <td>{product.barcode || "-"}</td>
                          <td className="product-action-cell">
                            <button
                              className="product-menu-button"
                              type="button"
                              aria-label={`Actions for ${product.productName}`}
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === product.id}
                              disabled={deletingProductId === product.id}
                              onClick={(event) => {
                                if (openMenuId === product.id) {
                                  closeMenu();
                                  return;
                                }
                                const rect =
                                  event.currentTarget.getBoundingClientRect();
                                const menuWidth = 160;
                                const menuHeight = 190;
                                const top =
                                  rect.bottom + menuHeight + 8 >
                                  window.innerHeight
                                    ? rect.top - menuHeight - 4
                                    : rect.bottom + 4;
                                setMenuPosition({
                                  top: Math.max(
                                    8,
                                    Math.min(
                                      top,
                                      window.innerHeight - menuHeight - 8
                                    )
                                  ),
                                  left: Math.max(
                                    8,
                                    Math.min(
                                      rect.right - menuWidth,
                                      window.innerWidth - menuWidth - 8
                                    )
                                  ),
                                });
                                setOpenMenuId(product.id);
                              }}
                            >
                              ⋮
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
