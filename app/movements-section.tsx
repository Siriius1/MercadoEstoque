"use client";

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
  createdAt: string;
};

type MovementRow =
  | { kind: "sale"; key: string; saleId: number; movements: Movement[] }
  | { kind: "movement"; key: string; movement: Movement };

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

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
  const groupedSales = new Map<number, Movement[]>();
  const rows: MovementRow[] = [];
  for (const movement of movements) {
    if (movement.saleId) {
      const group = groupedSales.get(movement.saleId);
      if (group) group.push(movement);
      else groupedSales.set(movement.saleId, [movement]);
    } else {
      rows.push({ kind: "movement", key: `movement-${movement.id}`, movement });
    }
  }
  for (const [saleId, saleMovements] of groupedSales) {
    rows.push({ kind: "sale", key: `sale-${saleId}`, saleId, movements: saleMovements });
  }
  rows.sort((a, b) => {
    const aDate = a.kind === "sale" ? a.movements[0].createdAt : a.movement.createdAt;
    const bDate = b.kind === "sale" ? b.movements[0].createdAt : b.movement.createdAt;
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
    </>
  );
}
