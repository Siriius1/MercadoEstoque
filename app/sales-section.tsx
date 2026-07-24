"use client";

import { useMemo, useRef, useState } from "react";

export type SalesProduct = {
  id: number;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  salePrice: number;
  currentStock: number;
  active: boolean;
};

type CartLine = { product: SalesProduct; quantity: number };
type PaymentMethod = "dinheiro" | "cartao" | "pix";

const API_BASE = process.env.NEXT_PUBLIC_MERCADO_API_URL || "";
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export default function SalesSection({
  products,
  user,
  onSaleCompleted,
}: {
  products: SalesProduct[];
  user: { name: string; email: string };
  onSaleCompleted: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [cart, setCart] = useState<Record<number, CartLine>>({});
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const available = useMemo(
    () => products.filter((product) => product.active && product.currentStock > 0),
    [products],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return available;
    return available.filter((product) =>
      `${product.name} ${product.sku} ${product.barcode} ${product.category}`
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [available, query]);
  const lines = Object.values(cart);
  const totalUnits = lines.reduce((total, line) => total + line.quantity, 0);
  const total = lines.reduce((sum, line) => sum + line.product.salePrice * line.quantity, 0);

  function addProduct(product: SalesProduct, quantity = addQuantity) {
    setError("");
    setSuccess("");
    setCart((current) => {
      const existing = current[product.id]?.quantity || 0;
      const nextQuantity = Math.min(product.currentStock, existing + Math.max(1, quantity));
      if (nextQuantity === existing) {
        setError(`Não há mais estoque disponível de ${product.name}.`);
        return current;
      }
      return { ...current, [product.id]: { product, quantity: nextQuantity } };
    });
    setQuery("");
    searchRef.current?.focus();
  }

  function changeQuantity(product: SalesProduct, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[product.id];
      else next[product.id] = { product, quantity: Math.min(quantity, product.currentStock) };
      return next;
    });
  }

  function handleSearchEnter() {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    const exact = available.find(
      (product) =>
        product.sku.toLocaleLowerCase("pt-BR") === normalized ||
        product.barcode?.toLocaleLowerCase("pt-BR") === normalized,
    );
    if (exact) addProduct(exact);
    else if (filtered.length === 1) addProduct(filtered[0]);
    else setError("Digite um código exato ou escolha um produto nos resultados.");
  }

  async function finalizeSale() {
    if (!payment || !lines.length) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
          paymentMethod: payment,
          operatorName: user.name,
          operatorEmail: user.email,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Não foi possível finalizar a venda.");
      setCart({});
      setPayment(null);
      setSuccess(`Venda #${result.sale.id} concluída — ${money(result.sale.total)}.`);
      await onSaleCompleted();
      searchRef.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível finalizar a venda.");
      setPayment(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="sales-page">
      <div className="sales-heading">
        <div>
          <small>FRENTE DE CAIXA</small>
          <h1>Nova venda</h1>
          <p>Pesquise pelo nome, código do produto ou código de barras.</p>
        </div>
        <span className="cashier-pill">Operador: <strong>{user.name}</strong></span>
      </div>

      <div className="pos-layout">
        <section className="catalog-panel">
          <div className="pos-search-row">
            <label className="pos-search">
              <span>⌕</span>
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(event) => { setQuery(event.target.value); setError(""); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearchEnter();
                  }
                }}
                placeholder="Nome, #0001 ou código de barras"
              />
            </label>
            <label className="quick-quantity">
              <span>Quant.</span>
              <input
                type="number"
                min="1"
                step="1"
                value={addQuantity}
                onChange={(event) => setAddQuantity(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
          </div>
          <div className="catalog-title">
            <div><strong>Produtos do estoque</strong><small>{filtered.length} disponíveis</small></div>
            {query && <button onClick={() => setQuery("")}>Limpar busca</button>}
          </div>
          <div className="shortcut-grid">
            {filtered.map((product) => (
              <button className="product-shortcut" key={product.id} onClick={() => addProduct(product)}>
                <span>{product.name}</span>
                <small>{product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</small>
                <strong>{money(product.salePrice)}</strong>
                <em>{product.currentStock} {product.unit} em estoque</em>
              </button>
            ))}
          </div>
          {!filtered.length && (
            <div className="pos-empty">
              <span>◇</span>
              <strong>Produto não encontrado</strong>
              <p>Somente produtos cadastrados e disponíveis no estoque aparecem aqui.</p>
            </div>
          )}
        </section>

        <aside className="cart-panel">
          <header>
            <div><h2>{lines.length} {lines.length === 1 ? "item" : "itens"}</h2><small>Quantidade total: {totalUnits}</small></div>
            {lines.length > 0 && <button onClick={() => setCart({})}>Limpar</button>}
          </header>
          <div className="cart-lines">
            {lines.map(({ product, quantity }) => (
              <div className="cart-line" key={product.id}>
                <div className="cart-product">
                  <strong>{product.name}</strong>
                  <small>{product.sku} · {money(product.salePrice)} cada</small>
                </div>
                <div className="quantity-stepper">
                  <button onClick={() => changeQuantity(product, quantity - 1)}>−</button>
                  <input
                    aria-label={`Quantidade de ${product.name}`}
                    type="number"
                    min="1"
                    max={product.currentStock}
                    value={quantity}
                    onChange={(event) => changeQuantity(product, Number(event.target.value))}
                  />
                  <button onClick={() => changeQuantity(product, quantity + 1)}>+</button>
                </div>
                <b>{money(product.salePrice * quantity)}</b>
                <button className="remove-line" onClick={() => changeQuantity(product, 0)} aria-label={`Remover ${product.name}`}>×</button>
              </div>
            ))}
            {!lines.length && (
              <div className="empty-cart"><span>▱</span><strong>Carrinho vazio</strong><p>Escolha um produto para começar.</p></div>
            )}
          </div>
          <footer className="cart-footer">
            {(error || success) && <div className={error ? "pos-message error" : "pos-message success"}>{error || success}</div>}
            <div className="sale-total"><span>Total</span><strong>{money(total)}</strong></div>
            <p>Escolha a forma de pagamento para finalizar:</p>
            <div className="payment-buttons">
              <button disabled={!lines.length} onClick={() => setPayment("dinheiro")}><span>R$</span>DINHEIRO</button>
              <button disabled={!lines.length} onClick={() => setPayment("cartao")}><span>▣</span>CARTÃO</button>
              <button disabled={!lines.length} onClick={() => setPayment("pix")}><span>◆</span>PIX</button>
            </div>
          </footer>
        </aside>
      </div>

      {payment && (
        <div className="payment-backdrop">
          <div className="payment-confirm">
            <span className="payment-icon">{payment === "dinheiro" ? "R$" : payment === "cartao" ? "▣" : "◆"}</span>
            <small>CONFIRMAR PAGAMENTO</small>
            <h2>{payment === "cartao" ? "Cartão" : payment[0].toUpperCase() + payment.slice(1)}</h2>
            <strong>{money(total)}</strong>
            <p>A venda será registrada e o estoque dos {lines.length} produto(s) será atualizado.</p>
            <div>
              <button className="cancel-payment" disabled={submitting} onClick={() => setPayment(null)}>Voltar</button>
              <button className="confirm-payment" disabled={submitting} onClick={finalizeSale}>
                {submitting ? "Finalizando..." : "Confirmar venda"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
