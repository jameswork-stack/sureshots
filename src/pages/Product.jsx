import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase";
import "../styles/product.css";

const PRODUCTS_COLLECTION = "products";

const EMPTY_PRODUCT_FORM = {
  productName: "",
  category: "",
  details: "",
  price: "",
  stock: "",
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
        typeof product.category === "string" && product.category.trim()
          ? product.category.trim()
          : "Uncategorized";
      const categoryKey = category.toLowerCase();
      if (!groups.has(categoryKey)) {
        groups.set(categoryKey, { name: category, products: [] });
      }
      groups.get(categoryKey).products.push(product);
      return groups;
    }, new Map()).values()
  ).sort((first, second) => first.name.localeCompare(second.name));
  const selectedProduct = products.find(
    (product) => product.id === openMenuId
  );

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

    setSaving(true);
    try {
      const productData = {
        productName,
        category,
        details,
        price,
        stock,
        barcode: productForm.barcode.trim(),
      };
      if (editingProductId) {
        await updateDoc(doc(db, PRODUCTS_COLLECTION, editingProductId), {
          ...productData,
          updatedAt: serverTimestamp(),
        });
        setProducts((current) =>
          current.map((product) =>
            product.id === editingProductId
              ? { ...product, ...productData }
              : product
          )
        );
      } else {
        const productRef = await addDoc(
          collection(db, PRODUCTS_COLLECTION),
          { ...productData, createdAt: serverTimestamp() }
        );
        setProducts((current) =>
          [
            { id: productRef.id, ...productData, createdAt: Date.now() },
            ...current,
          ].sort(
          (first, second) =>
            getCreatedAtTime(second.createdAt) -
            getCreatedAtTime(first.createdAt)
          )
        );
      }
      setProductForm(EMPTY_PRODUCT_FORM);
      setEditingProductId(null);
      setShowForm(false);
    } catch (saveError) {
      console.error("Error saving product:", saveError);
      setFormError("Unable to save this product. Please try again.");
    } finally {
      setSaving(false);
    }
  };

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

      {showForm && (
        <form className="product-form" onSubmit={handleSubmit}>
          <h2>{editingProductId ? "Edit Product" : "Add Product"}</h2>
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
              <label htmlFor="product-stock">Stock</label>
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
      )}

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
                                const menuHeight = 92;
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
