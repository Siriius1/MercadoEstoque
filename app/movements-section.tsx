"use client";

import { useState } from "react";

type Movement = {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  unit: string;
  type: string;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  unitCost: number;
  reason: string;
  notes: string;
  saleId?: number | null;
  operatorName?: string;
  closureId?: number;
  periodStart?: string;
  periodEnd?: string;
  systemCashTotal?: number;
  declaredCashTotal?: number;
  difference?: number;
  cashSalesCount?: number;
  totalSalesCount?: number;
  createdAt: string;
};

type MovementRow =
  | { kind: "sale"; key: string; saleId: number; movements: Movement[] }
  | { kind: "cancellation"; key: string; saleId: number; movements: Movement[] }
  | { kind: "closure"; key: string; movement: Movement }
  | { kind: "movement"; key: string; movement: Movement };

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export default function MovementsSection({
  movements,
  search,
  setSearch,
  onNew,
}: {
  movements: Movement[];
  search: string;
  setSearch: (value: string) => void;
  onNew: () => void;
}) {
  const [selectedClosure, setSelectedClosure] = useState<Movement | null>(null);
  const groupedSales = new Map<number, Movement[]>();
  const groupedCancellations = new Map<number, Movement[]>();
  const rows: MovementRow[] = [];
  for (const movement of movements) {
    if (movement.type === "fechamento") {
      rows.push({ kind: "closure", key: `closure-${movement.closureId}`, movement });
    } else if (movement.saleId) {
      const target = movement.reason.startsWith("Cancelamento da venda")
        ? groupedCancellations
        : groupedSales;
      const group = target.get(movement.saleId);
      if (group) group.push(movement);
      else target.set(movement.saleId, [movement]);
    } else {
      rows.push({ kind: "movement", key: `movement-${movement.id}`, movement });
    }
  }
  for (const [saleId, saleMovements] of groupedSales) {
    rows.push({ kind: "sale", key: `sale-${saleId}`, saleId, movements: saleMovements });
  }
  for (const [saleId, cancellationMovements] of groupedCancellations) {
    rows.push({
      kind: "cancellation",
      key: `cancellation-${saleId}`,
      saleId,
      movements: cancellationMovements,
    });
  }
  rows.sort((a, b) => {
    const aDate = a.kind === "sale" || a.kind === "cancellation" ? a.movements[0].createdAt : a.movement.createdAt;
    const bDate = b.kind === "sale" || b.kind === "cancellation" ? b.movements[0].createdAt : b.movement.createdAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  return (
    <>
      <div className="page-heading">
        <div><small>HISTÓRICO</small><h1>Movimentações</h1><p>Rastreie cada entrada, saída, ajuste e venda do estoque.</p></div>
        <button className="primary" onClick={onNew}>+ Registrar movimentação</button>
      </div>
      <div className="toolbar">
        <label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto, código, venda ou motivo..."/></label>
        <span>{rows.length} operações</span>
      </div>
      <article className="table-card movement-table">
        <table>
          <thead><tr><th>Data</th><th>Operação / produto</th><th>Tipo</th><th>Itens / quantidade</th><th>Estoque anterior</th><th>Estoque final</th><th>Detalhes</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              if (row.kind === "closure") {
                const closure = row.movement;
                const difference = closure.difference || 0;
                return (
                  <tr
                    className="cash-closure-row"
                    key={row.key}
                    role="button"
                    tabIndex={0}
                    title="Ver detalhes do fechamento"
                    onClick={() => setSelectedClosure(closure)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedClosure(closure);
                      }
                    }}
                  >
                    <td>{dateTime(closure.createdAt)}</td>
                    <td><div className="sale-operation cash-closure"><span>R$</span><div><strong>Fechamento de caixa #{closure.closureId}</strong><small>Operador: {closure.operatorName || "Não informado"}</small></div></div></td>
                    <td><span className="movement-tag fechamento">fechamento</span></td>
                    <td><div className="closure-count"><strong>{closure.totalSalesCount ?? closure.cashSalesCount ?? 0}</strong><small>vendas realizadas</small></div></td>
                    <td><div className="closure-value"><small>Valor no sistema</small><strong>{money(closure.systemCashTotal || 0)}</strong></div></td>
                    <td><div className="closure-value"><small>Valor informado</small><strong>{money(closure.declaredCashTotal || 0)}</strong></div></td>
                    <td><div className={`closure-difference ${difference === 0 ? "balanced" : "unbalanced"}`}><small>Diferença</small><strong>{money(difference)}</strong></div></td>
                  </tr>
                );
              }
              if (row.kind === "cancellation") {
                const first = row.movements[0];
                const refundMatch = first.notes.match(/Estorno:\s*R\$\s*([\d.,]+)/i);
                return (
                  <tr className="cancellation-movement-row" key={row.key}>
                    <td>{dateTime(first.createdAt)}</td>
                    <td><div className="sale-operation cancellation"><span>↩</span><div><strong>Cancelamento da venda #{row.saleId}</strong><small>{first.operatorName ? `Operador: ${first.operatorName}` : "Estorno no caixa"}</small></div></div></td>
                    <td><span className="movement-tag entrada">estorno</span></td>
                    <td><div className="sale-items-list">{row.movements.map((movement) => <span key={movement.id}><b>+{movement.quantity} {movement.unit}</b> {movement.productName}</span>)}</div></td>
                    <td>—</td>
                    <td>Devolvido</td>
                    <td><div className="sale-detail cancellation"><strong>{refundMatch ? `R$ ${refundMatch[1]}` : "Valor estornado"}</strong><small>Venda cancelada</small></div></td>
                  </tr>
                );
              }
              if (row.kind === "sale") {
                const first = row.movements[0];
                const totalMatch = first.notes.match(/Total da compra:\s*R\$\s*([\d.,]+)/i);
                const paymentMatch = first.notes.match(/Pagamento:\s*(\w+)/i);
                return (
                  <tr className="sale-movement-row" key={row.key}>
                    <td>{dateTime(first.createdAt)}</td>
                    <td><div className="sale-operation"><span>R$</span><div><strong>Venda #{row.saleId}</strong><small>{first.operatorName ? `Operador: ${first.operatorName}` : "Venda no caixa"}</small></div></div></td>
                    <td><span className="movement-tag saida">venda</span></td>
                    <td><div className="sale-items-list">{row.movements.map((movement) => <span key={movement.id}><b>{movement.quantity} {movement.unit}</b> {movement.productName}</span>)}</div></td>
                    <td>—</td>
                    <td>—</td>
                    <td><div className="sale-detail"><strong>{totalMatch ? `R$ ${totalMatch[1]}` : "Venda concluída"}</strong><small>{paymentMatch ? `Pagamento: ${paymentMatch[1]}` : ""}</small></div></td>
                  </tr>
                );
              }
              const movement = row.movement;
              return (
                <tr key={row.key}>
                  <td>{dateTime(movement.createdAt)}</td>
                  <td><div className="product-cell"><span className="mini-avatar">{movement.productName.slice(0, 1).toUpperCase()}</span><div><strong>{movement.productName}</strong><small>{movement.sku}</small></div></div></td>
                  <td><span className={`movement-tag ${movement.type}`}>{movement.type}</span></td>
                  <td><strong>{movement.type === "saida" ? "−" : "+"}{movement.quantity} {movement.unit}</strong></td>
                  <td>{movement.previousStock} {movement.unit}</td>
                  <td>{movement.resultingStock} {movement.unit}</td>
                  <td>{movement.reason || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><span>◇</span><p>Nenhuma movimentação encontrada.</p></div>}
      </article>
      {selectedClosure && (
        <div
          className="closure-detail-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedClosure(null);
          }}
        >
          <article
            className="closure-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="closure-detail-title"
          >
            <button
              className="closure-detail-close"
              type="button"
              aria-label="Fechar detalhes"
              onClick={() => setSelectedClosure(null)}
            >
              ×
            </button>
            <header className="closure-detail-header">
              <span>R$</span>
              <div>
                <small>FECHAMENTO DE CAIXA</small>
                <h2 id="closure-detail-title">Fechamento #{selectedClosure.closureId}</h2>
                <p>Resumo da conferência realizada pelo operador.</p>
              </div>
            </header>
            <section className="closure-detail-period">
              <div>
                <small>ABERTURA DO CAIXA</small>
                <strong>{selectedClosure.periodStart ? dateTime(selectedClosure.periodStart) : "Não informado"}</strong>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <small>FECHAMENTO DO CAIXA</small>
                <strong>{selectedClosure.periodEnd ? dateTime(selectedClosure.periodEnd) : dateTime(selectedClosure.createdAt)}</strong>
              </div>
            </section>
            <dl className="closure-detail-grid">
              <div className="closure-detail-wide">
                <dt>Operador responsável</dt>
                <dd>{selectedClosure.operatorName || "Não informado"}</dd>
              </div>
              <div>
                <dt>Quantidade de vendas</dt>
                <dd>{selectedClosure.totalSalesCount ?? selectedClosure.cashSalesCount ?? 0}</dd>
              </div>
              <div>
                <dt>Valor esperado</dt>
                <dd>{money(selectedClosure.systemCashTotal || 0)}</dd>
              </div>
              <div>
                <dt>Valor informado</dt>
                <dd>{money(selectedClosure.declaredCashTotal || 0)}</dd>
              </div>
              <div className={`closure-detail-difference ${(selectedClosure.difference || 0) === 0 ? "balanced" : "unbalanced"}`}>
                <dt>Diferença</dt>
                <dd>{money(selectedClosure.difference || 0)}</dd>
              </div>
            </dl>
            <footer>
              <button type="button" className="primary" onClick={() => setSelectedClosure(null)}>
                Fechar
              </button>
            </footer>
          </article>
        </div>
      )}
    </>
  );
}
