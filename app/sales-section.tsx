"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
type LastSale = {
  id: number;
  total: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  items: Array<{ productName: string; quantity: number; unit: string; subtotal: number }>;
};
type CashClosurePreview = {
  periodStart: string;
  periodEnd: string;
};

const API_BASE = process.env.NEXT_PUBLIC_MERCADO_API_URL || "";
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

function CartIcon({ large = false }: { large?: boolean }) {
  return <span className={`cart-symbol ${large ? "large" : ""}`} aria-hidden="true"><i /><b className="wheel-one" /><b className="wheel-two" /></span>;
}

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
  const [cancelSale, setCancelSale] = useState<LastSale | null>(null);
  const [cashPreview, setCashPreview] = useState<CashClosurePreview | null>(null);
  const [declaredCash, setDeclaredCash] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [clock, setClock] = useState("");
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

  useEffect(() => {
    const updateClock = () => setClock(new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
    updateClock();
    const clockTimer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        if (!payment && !cashPreview && !submitting) void requestCancellation();
      }
      if (event.key === "F4") {
        event.preventDefault();
        if (!payment && !cancelSale && !submitting) void requestCashClosure();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

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

  async function requestCancellation() {
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `${API_BASE}/api/sales/latest?operatorEmail=${encodeURIComponent(user.email)}`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Nenhuma venda disponível para cancelamento.");
      setCancelSale(result.sale);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível localizar a última venda.");
    }
  }

  async function confirmCancellation() {
    if (!cancelSale) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/sales/${cancelSale.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorName: user.name, operatorEmail: user.email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Não foi possível cancelar a venda.");
      setCancelSale(null);
      setSuccess(
        `Venda #${result.sale.id} cancelada — ${money(result.sale.total)} estornados e estoque restaurado.`,
      );
      await onSaleCompleted();
      searchRef.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível cancelar a venda.");
      setCancelSale(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function requestCashClosure() {
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `${API_BASE}/api/cash-closures/preview?operatorEmail=${encodeURIComponent(user.email)}`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Não foi possível calcular o caixa.");
      setDeclaredCash("");
      setCashPreview(result.preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível calcular o caixa.");
    }
  }

  async function confirmCashClosure() {
    if (!cashPreview || declaredCash === "") return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/cash-closures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorName: user.name,
          operatorEmail: user.email,
          declaredCashTotal: Number(declaredCash),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Não foi possível fechar o caixa.");
      setCashPreview(null);
      setSuccess(
        `Fechamento #${result.closure.id} registrado — valor informado: ${money(result.closure.declaredCashTotal)}.`,
      );
      await onSaleCompleted();
      searchRef.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível fechar o caixa.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="sales-page">
      <div className="sales-register-bar">
        <div className="register-title">
          <span className="register-status"><i /> CAIXA ABERTO</span>
          <div><small>FRENTE DE CAIXA</small><h1>Nova venda</h1></div>
        </div>
        <div className="register-meta">
          <div><small>OPERADOR</small><strong>{user.name}</strong></div>
          <div className="register-time"><small>HORÁRIO</small><strong>{clock || "--:--:--"}</strong></div>
        </div>
      </div>

      <div className="pos-layout">
        <section className="catalog-panel">
          <div className="pos-search-row">
            <label className="pos-search">
              <span className="search-symbol" aria-hidden="true" />
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
                placeholder="Pesquise por nome, código do produto ou código de barras"
              />
              <kbd>ENTER</kbd>
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
            <div><strong>Produtos disponíveis</strong><small>{filtered.length} resultado(s) · clique para adicionar</small></div>
            {query && <button onClick={() => setQuery("")}>Limpar busca</button>}
          </div>
          <div className="shortcut-grid">
            {filtered.map((product) => (
              <button className={`product-shortcut ${cart[product.id] ? "in-cart" : ""}`} key={product.id} onClick={() => addProduct(product)}>
                <div className="product-card-heading"><span>{product.name}</span><b>{product.category}</b></div>
                <small>{product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</small>
                <strong>{money(product.salePrice)}</strong>
                <em><i /> {product.currentStock} {product.unit} disponíveis</em>
                {cart[product.id] && <mark>{cart[product.id].quantity} no carrinho</mark>}
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
          <div className="pos-shortcuts">
            <button className="cancel-last-sale" type="button" onClick={requestCancellation}>
              <kbd>F2</kbd>
              <span><strong>Cancelar última venda</strong><small>Estorna o valor e devolve os itens ao estoque</small></span>
            </button>
            <button className="close-cash-register" type="button" onClick={requestCashClosure}>
              <kbd>F4</kbd>
              <span><strong>Fechamento de caixa</strong><small>Compare o dinheiro contado com o sistema</small></span>
            </button>
          </div>
        </section>

        <aside className="cart-panel">
          <header>
            <div className="cart-header-summary">
              <CartIcon />
              <div><small>CARRINHO DA VENDA</small><h2>{lines.length} {lines.length === 1 ? "item" : "itens"} <b>· {totalUnits} un.</b></h2></div>
            </div>
            {lines.length > 0 && <button onClick={() => setCart({})}>Limpar carrinho</button>}
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
              <div className="empty-cart"><CartIcon large /><strong>Seu carrinho está vazio</strong><p>Pesquise ou selecione um produto para iniciar a venda.</p></div>
            )}
          </div>
          <footer className="cart-footer">
            {(error || success) && <div className={error ? "pos-message error" : "pos-message success"}>{error || success}</div>}
            <div className="sale-total"><span>Total da venda</span><strong>{money(total)}</strong></div>
            <p>FORMA DE PAGAMENTO</p>
            <div className="payment-buttons">
              <button className="payment-cash" disabled={!lines.length} onClick={() => setPayment("dinheiro")}><span>R$</span><b>Dinheiro</b><small>Receber agora</small></button>
              <button className="payment-card" disabled={!lines.length} onClick={() => setPayment("cartao")}><span>▣</span><b>Cartão</b><small>Débito ou crédito</small></button>
              <button className="payment-pix" disabled={!lines.length} onClick={() => setPayment("pix")}><span>◆</span><b>PIX</b><small>Pagamento digital</small></button>
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
      {cancelSale && (
        <div className="payment-backdrop">
          <div className="payment-confirm cancellation-confirm">
            <span className="payment-icon">↩</span>
            <small>CANCELAR ÚLTIMA VENDA</small>
            <h2>Venda #{cancelSale.id}</h2>
            <strong>{money(cancelSale.total)}</strong>
            <div className="cancel-sale-items">
              {cancelSale.items.map((item, index) => (
                <span key={`${item.productName}-${index}`}>
                  <b>{item.quantity} {item.unit}</b> {item.productName}
                </span>
              ))}
            </div>
            <p>O valor será estornado, a venda ficará marcada como cancelada e todos os itens voltarão ao estoque.</p>
            <div>
              <button className="cancel-payment" disabled={submitting} onClick={() => setCancelSale(null)}>Voltar</button>
              <button className="confirm-cancellation" disabled={submitting} onClick={confirmCancellation}>
                {submitting ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
      {cashPreview && (
        <div className="payment-backdrop">
          <div className="payment-confirm cash-closure-confirm">
            <span className="payment-icon">R$</span>
            <small>FECHAMENTO DE CAIXA · F4</small>
            <h2>Conferência de dinheiro</h2>
            <p className="cash-period">Período: {dateTime(cashPreview.periodStart)} até {dateTime(cashPreview.periodEnd)}</p>
            <label className="declared-cash-field">
              Valor em dinheiro contado pelo operador
              <span><b>R$</b><input autoFocus type="number" min="0" step="0.01" value={declaredCash} onChange={(event) => setDeclaredCash(event.target.value)} placeholder="0,00"/></span>
            </label>
            <p>Informe somente o dinheiro contado. O valor esperado e a diferença ficarão disponíveis para o proprietário na aba Movimentações.</p>
            <div>
              <button className="cancel-payment" disabled={submitting} onClick={() => setCashPreview(null)}>Voltar</button>
              <button className="confirm-payment" disabled={submitting || declaredCash === ""} onClick={confirmCashClosure}>
                {submitting ? "Fechando..." : "Confirmar fechamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
