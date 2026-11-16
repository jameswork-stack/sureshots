import { useEffect, useState } from "react";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";

import { db } from "../firebase";
import "../styles/product.css";

const PRODUCTS_COLLECTION = "products";

const EMPTY_PRODUCT_FORM = {
  productName: "",
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");

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

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setProductForm((current) => ({ ...current, [name]: value }));
    setFormError("");
  };

  const handleCancel = () => {
    setShowForm(false);
    setProductForm(EMPTY_PRODUCT_FORM);
    setFormError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    const productName = productForm.productName.trim();
    const details = productForm.details.trim();
    const price = Number(productForm.price);
    const stock = Number(productForm.stock);

    if (
      !productName ||
      !details ||
      productForm.price === "" ||
      !Number.isFinite(price) ||
      price < 0 ||
      productForm.stock === "" ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      setFormError("Enter a product name, details, valid price, and whole-number stock of 0 or more.");
      return;
    }

    setSaving(true);
    try {
      const productData = {
        productName,
        details,
        price,
        stock,
        barcode: productForm.barcode.trim(),
        createdAt: serverTimestamp(),
      };
      const productRef = await addDoc(
        collection(db, PRODUCTS_COLLECTION),
        productData
      );

      setProducts((current) =>
        [
          {
            id: productRef.id,
            ...productData,
            createdAt: Date.now(),
          },
          ...current,
        ].sort(
          (first, second) =>
            getCreatedAtTime(second.createdAt) -
            getCreatedAtTime(first.createdAt)
        )
      );
      setProductForm(EMPTY_PRODUCT_FORM);
      setShowForm(false);
    } catch (saveError) {
      console.error("Error saving product:", saveError);
      setFormError("Unable to save this product. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="product-page">
      <header className="product-page-header">
        <h1>Product</h1>
        <button
          className="product-add-button"
          type="button"
          onClick={() => {
            setFormError("");
            setShowForm(true);
          }}
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

      {showForm && (
        <form className="product-form" onSubmit={handleSubmit}>
          <h2>Add Product</h2>
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
              {saving ? "Saving..." : "Save Product"}
            </button>
          </div>
        </form>
      )}

      <div className="product-list-panel">
        {loading ? (
          <p className="product-list-message">Loading products...</p>
        ) : products.length === 0 ? (
          <p className="product-list-message">No products have been added yet.</p>
        ) : (
          <div className="product-table-scroll">
            <table className="product-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Details</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Barcode</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>{product.productName}</td>
                    <td>{product.details}</td>
                    <td>{formatCurrency(Number(product.price) || 0)}</td>
                    <td>{product.stock}</td>
                    <td>{product.barcode || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
