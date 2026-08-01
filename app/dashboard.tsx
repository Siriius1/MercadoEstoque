"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatDocument, formatPhone, maskEmail, normalizeEmail } from "./validation";
import SalesSection from "./sales-section";
import SalesMovementsSection from "./movements-section";
import EmployeesSection from "./employees-section";
import PaymentSettingsSection from "./payment-settings-section";
import { mercadoApiFetch } from "./api-base";

type Section = "painel" | "vendas" | "produtos" | "fornecedores" | "funcionarios" | "movimentacoes" | "relatorios" | "configuracoes";
type Product = { id:number; sku:string; barcode:string; name:string; category:string; unit:string; costPrice:number; salePrice:number; salePriceUpdatedAt:string|null; currentStock:number; minimumStock:number; supplierId:number|null; supplierName:string|null; active:boolean };
type Supplier = { id:number; name:string; document:string; contact:string; email:string; phone:string; productCount:number; active:boolean };
type Movement = { id:number; productId:number; productName:string; sku:string; unit:string; type:string; quantity:number; previousStock:number; resultingStock:number; unitCost:number; reason:string; notes:string; saleId?:number|null; operatorName?:string; closureId?:number; periodStart?:string; periodEnd?:string; systemCashTotal?:number; declaredCashTotal?:number; difference?:number; cashSalesCount?:number; totalSalesCount?:number; createdAt:string };
type Summary = { totalProducts:number; lowStock:number; stockValue:number; retailValue:number; totalSuppliers:number };
type DeleteTarget = { kind:"products"|"suppliers"; id:number; name:string; linkedCount:number };
type ProductSortKey = "name"|"sku"|"supplier"|"cost"|"sale"|"stock"|"status";
type Theme = "light"|"dark";

const money = (value = 0) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const dateTime = (value:string) => { const normalized=value.replace(" ","T"); const hasTimezone=/Z$|[+-]\d{2}:\d{2}$/.test(normalized); return new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short" }).format(new Date(hasTimezone?normalized:`${normalized}Z`)); };
const initials = (name:string) => name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase();
export default function Dashboard({user}:{user:{name:string;email:string;role:string;companyName:string;isDemo:boolean}}) {
  const isCashier = user.role === "cashier";
  const [section, setSection] = useState<Section>(isCashier ? "vendas" : "painel");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalProducts:0, lowStock:0, stockValue:0, retailValue:0, totalSuppliers:0 });
  const [recent, setRecent] = useState<Movement[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"product"|"supplier"|"movement"|null>(null);
  const [editing, setEditing] = useState<Product|Supplier|null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget|null>(null);
  const [theme, setTheme] = useState<Theme>("light");

  const load = useCallback(async () => {
    try {
      if (user.isDemo) {
        const demo = await mercadoApiFetch("/api/demo/seed", { method:"POST" });
        if (!demo.ok) throw new Error();
      }
      if (isCashier) {
        const response = await mercadoApiFetch("/api/products");
        if (!response.ok) throw new Error();
        const data = await response.json();
        setProducts(data.products);
        return;
      }
      const [p, s, m, d] = await Promise.all([
        mercadoApiFetch("/api/products"),
        mercadoApiFetch("/api/suppliers"),
        mercadoApiFetch("/api/movements"),
        mercadoApiFetch("/api/dashboard"),
      ]);
      if (![p,s,m,d].every(response => response.ok)) throw new Error();
      const [pd,sd,md,dd] = await Promise.all([p.json(), s.json(), m.json(), d.json()]);
      setProducts(pd.products); setSuppliers(sd.suppliers); setMovements(md.movements); setSummary(dd.summary); setRecent(dd.recent);
    } catch { setNotice("Não foi possível carregar o banco de dados."); }
    finally { setLoading(false); }
  }, [isCashier, user.isDemo]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => {
    const savedTheme = localStorage.getItem("mercado-theme");
    const preferredTheme: Theme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(preferredTheme);
    document.documentElement.dataset.theme = preferredTheme;
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("mercado-theme", nextTheme);
  }

  const filteredProducts = useMemo(() => products.filter(p => `${p.name} ${p.sku} ${p.barcode} ${p.category} ${p.supplierName}`.toLowerCase().includes(search.toLowerCase())), [products, search]);
  const filteredSuppliers = useMemo(() => suppliers.filter(s => `${s.name} ${s.document} ${s.contact}`.toLowerCase().includes(search.toLowerCase())), [suppliers, search]);
  const filteredMovements = useMemo(() => movements.filter(m => `${m.productName} ${m.sku} ${m.type} ${m.reason} ${m.notes} ${m.saleId||""} ${m.operatorName||""}`.toLowerCase().includes(search.toLowerCase())), [movements, search]);
  const lowProducts = products.filter(p => p.active && p.currentStock <= p.minimumStock);

  const openNew = (kind:"product"|"supplier"|"movement") => { setEditing(null); setModal(kind); };
  const openEdit = (kind:"product"|"supplier", item:Product|Supplier) => { setEditing(item); setModal(kind); };
  const closeModal = () => { setModal(null); setEditing(null); };

  async function submit(endpoint:string, data:Record<string, FormDataEntryValue>, method="POST") {
    const response = await mercadoApiFetch(endpoint, { method, headers:{ "Content-Type":"application/json" }, body:JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) {
      const validationMessage=Array.isArray(result.detail)&&result.detail[0]?.msg
        ? `Confira o campo ${String(result.detail[0]?.loc?.at(-1)||"informado")}.`
        : typeof result.detail==="string" ? result.detail : "";
      throw new Error(result.error || validationMessage || "Não foi possível salvar.");
    }
    closeModal(); setNotice("Salvo com sucesso."); await load();
  }

  function requestDelete(target:DeleteTarget) {
    if (target.kind === "suppliers" && localStorage.getItem("mercado-hide-supplier-delete-warning") === "true") {
      void executeDelete(target);
      return;
    }
    setPendingDelete(target);
  }

  async function executeDelete(target:DeleteTarget, hideSupplierWarning = false) {
    const response = await mercadoApiFetch(`/api/${target.kind}/${target.id}`, { method:"DELETE" });
    const result = await response.json();
    if (!response.ok) { setNotice(result.error || "Não foi possível excluir."); return; }
    if (hideSupplierWarning && target.kind === "suppliers") localStorage.setItem("mercado-hide-supplier-delete-warning", "true");
    setPendingDelete(null);
    setNotice(target.kind === "suppliers" ? `Fornecedor e ${result.deletedProducts ?? target.linkedCount} produto(s) excluído(s).` : "Produto excluído permanentemente.");
    await load();
  }

  const adminNav = [
    { id:"vendas", icon:"▤", label:"Vendas" },
    { id:"painel", icon:"▦", label:"Painel" }, { id:"produtos", icon:"◇", label:"Produtos" },
    { id:"fornecedores", icon:"♣", label:"Fornecedores" }, { id:"funcionarios", icon:"♙", label:"Funcionários" }, { id:"movimentacoes", icon:"⇄", label:"Movimentações" },
    { id:"relatorios", icon:"↗", label:"Relatórios" }, { id:"configuracoes", icon:"⚙", label:"Configurações" },
  ] as const;
  const nav = isCashier ? adminNav.filter(item => item.id === "vendas") : adminNav;
  const pendingText = summary.lowStock === 0
    ? "Não existem pendências"
    : summary.lowStock === 1
      ? "Existe 1 pendência"
      : `Existem ${summary.lowStock} pendências`;

  return <div className="app-shell">
    {menuOpen && <button className="menu-overlay" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark">+</span><div><strong>Mercado<span>+</span></strong><small>GESTÃO DE ESTOQUE</small></div></div>
      <nav>{nav.map(item => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setSearch(""); setMenuOpen(false); }}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-foot">
        <div className="sidebar-profile">
          <div className="profile-avatar">{initials(user.name)}</div>
          <div className="profile-copy">
            <div className="profile-meta">
              <span>{isCashier ? "Operador de caixa" : "Administrador"}</span>
              <em><i /> Online</em>
            </div>
            <strong title={user.name}>{user.name}</strong>
            <small title={user.email}>{maskEmail(user.email)}</small>
          </div>
        </div>
      </div>
    </aside>
    <main>
      <header className="topbar"><button className="menu-button" aria-label="Menu" onClick={() => setMenuOpen(true)}>☰</button><div className="breadcrumb">Mercado+ <span>/</span> {nav.find(n => n.id === section)?.label}</div><div className="top-actions"><span className="today">{new Intl.DateTimeFormat("pt-BR", { dateStyle:"long" }).format(new Date())}</span><button className={`theme-toggle ${theme}`} type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"} title={theme === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}><span className="theme-sun" aria-hidden="true">☀</span><span className="theme-moon" aria-hidden="true">☾</span></button>{!isCashier && <button className="icon-button" aria-label={pendingText}>●{summary.lowStock > 0 && <b>{summary.lowStock}</b>}<span className="notification-tooltip" role="tooltip">{pendingText}</span></button>}<button className="logout-button" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});window.location.href="/";}}>Sair</button></div></header>
      <div className="content">
        {user.isDemo && <div className="demo-environment-banner"><strong>Ambiente de demonstração</strong><span>Você possui acesso total. Estes dados são exclusivos desta sessão de teste.</span></div>}
        {notice && <div className="toast">{notice}</div>}
        {loading ? <div className="loading-card">Carregando seu estoque...</div> : <>
          {!isCashier && section === "painel" && <DashboardSection summary={summary} recent={recent} lowProducts={lowProducts} onNavigate={setSection} onMovement={() => openNew("movement")} />}
          {section === "vendas" && <SalesSection products={products} user={user} onSaleCompleted={load} />}
          {!isCashier && section === "produtos" && <ProductsSection products={filteredProducts} search={search} setSearch={setSearch} onNew={() => openNew("product")} onEdit={p => openEdit("product", p)} onDelete={p => requestDelete({ kind:"products", id:p.id, name:p.name, linkedCount:0 })} />}
          {!isCashier && section === "fornecedores" && <SuppliersSection suppliers={filteredSuppliers} search={search} setSearch={setSearch} onNew={() => openNew("supplier")} onEdit={s => openEdit("supplier", s)} onDelete={s => requestDelete({ kind:"suppliers", id:s.id, name:s.name, linkedCount:s.productCount })} />}
          {!isCashier && section === "funcionarios" && <EmployeesSection currentUser={user} />}
          {!isCashier && section === "movimentacoes" && <SalesMovementsSection movements={filteredMovements} search={search} setSearch={setSearch} onNew={() => openNew("movement")} />}
          {!isCashier && section === "relatorios" && <ReportsSection products={products} movements={movements} summary={summary} />}
          {!isCashier && section === "configuracoes" && <PaymentSettingsSection />}
        </>}
      </div>
    </main>
    {!isCashier && modal === "product" && <ProductModal item={editing as Product|null} suppliers={suppliers} onClose={closeModal} onSubmit={async (event) => { const data=Object.fromEntries(new FormData(event.currentTarget)); await submit(editing ? `/api/products/${editing.id}` : "/api/products", data, editing ? "PUT" : "POST"); }} />}
    {!isCashier && modal === "supplier" && <SupplierModal item={editing as Supplier|null} onClose={closeModal} onSubmit={async (event) => { const data=Object.fromEntries(new FormData(event.currentTarget)); await submit(editing ? `/api/suppliers/${editing.id}` : "/api/suppliers", data, editing ? "PUT" : "POST"); }} />}
    {!isCashier && modal === "movement" && <MovementModal products={products.filter(p=>p.active)} onClose={closeModal} onSubmit={async (event) => { const data=Object.fromEntries(new FormData(event.currentTarget)); await submit("/api/movements", data); }} />}
    {!isCashier && pendingDelete && <DeleteConfirmModal target={pendingDelete} onClose={() => setPendingDelete(null)} onConfirm={executeDelete} />}
  </div>;
}

function PageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}) { return <div className="page-heading"><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function Stat({icon,label,value,detail,tone="green"}:{icon:string;label:string;value:string|number;detail:string;tone?:string}) { return <article className={`stat ${tone}`}><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>; }

function DashboardSection({summary,recent,lowProducts,onNavigate,onMovement}:{summary:Summary;recent:Movement[];lowProducts:Product[];onNavigate:(s:Section)=>void;onMovement:()=>void}) {
  return <><PageTitle eyebrow="VISÃO GERAL" title="Painel" description="Acompanhe a saúde do seu estoque em tempo real." action={<button className="primary" onClick={onMovement}>+ Nova movimentação</button>} />
    <section className="stats-grid"><Stat icon="▣" label="Produtos ativos" value={summary.totalProducts} detail="itens cadastrados"/><Stat icon="!" label="Estoque baixo" value={summary.lowStock} detail="precisam de atenção" tone="yellow"/><Stat icon="♣" label="Fornecedores" value={summary.totalSuppliers} detail="parceiros ativos" tone="blue"/><Stat icon="R$" label="Valor em estoque" value={money(summary.stockValue)} detail={`${money(summary.retailValue)} em vendas`} tone="cream"/></section>
    <section className="dashboard-grid"><article className="panel"><div className="panel-head"><div><h2>Movimentações recentes</h2><p>Últimas entradas e saídas registradas</p></div><button className="link" onClick={()=>onNavigate("movimentacoes")}>Ver todas →</button></div><div className="activity-list">{recent.length ? recent.map(m=><div className="activity" key={m.id}><span className={`movement-icon ${m.type}`}>{m.type==="entrada"?"↓":m.type==="saida"?"↑":"⇄"}</span><div><strong>{m.productName}</strong><small>{m.reason || (m.type==="entrada"?"Entrada de estoque":"Saída de estoque")}</small></div><b className={m.type}>{m.type==="saida"?"-":"+"}{m.quantity} {m.unit}</b><time>{dateTime(m.createdAt)}</time></div>) : <Empty text="Nenhuma movimentação registrada."/>}</div></article>
      <article className="panel"><div className="panel-head"><div><h2>Atenção ao estoque</h2><p>Produtos abaixo do mínimo</p></div><span className="count-pill">{lowProducts.length}</span></div><div className="low-list">{lowProducts.slice(0,5).map(p=><div key={p.id}><span className="mini-avatar">{initials(p.name)}</span><div><strong>{p.name}</strong><small>Mínimo: {p.minimumStock} {p.unit}</small></div><b>{p.currentStock} <small>{p.unit}</small></b></div>)}{!lowProducts.length&&<Empty text="Tudo certo por aqui."/>}</div><button className="wide-link" onClick={()=>onNavigate("produtos")}>Gerenciar produtos</button></article></section></>;
}

function SearchBar({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}) { return <label className="search"><span>⌕</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>; }
function SortHeader({label,column,active,direction,onSort}:{label:string;column:ProductSortKey;active:boolean;direction:"asc"|"desc";onSort:(column:ProductSortKey)=>void}) {
  return <th><button className={`sort-header ${active?"active":""}`} onClick={()=>onSort(column)} title={`Ordenar por ${label}`}><span>{label}</span><b>{active?(direction==="asc"?"↑":"↓"):"↕"}</b></button></th>;
}

function ProductsSection({products,search,setSearch,onNew,onEdit,onDelete}:{products:Product[];search:string;setSearch:(s:string)=>void;onNew:()=>void;onEdit:(p:Product)=>void;onDelete:(p:Product)=>void}) {
  const [sortKey,setSortKey]=useState<ProductSortKey>("name");
  const [sortDirection,setSortDirection]=useState<"asc"|"desc">("asc");
  const sortedProducts=useMemo(()=>[...products].sort((a,b)=>{
    let comparison=0;
    if(sortKey==="name") comparison=a.name.localeCompare(b.name,"pt-BR",{sensitivity:"base"});
    if(sortKey==="sku") comparison=(Number(a.sku.replace(/\D/g,""))||0)-(Number(b.sku.replace(/\D/g,""))||0);
    if(sortKey==="supplier") comparison=(a.supplierName||"Sem fornecedor").localeCompare(b.supplierName||"Sem fornecedor","pt-BR",{sensitivity:"base"});
    if(sortKey==="cost") comparison=a.costPrice-b.costPrice;
    if(sortKey==="sale") comparison=a.salePrice-b.salePrice;
    if(sortKey==="stock") comparison=a.currentStock-b.currentStock;
    if(sortKey==="status") comparison=(!a.active?0:a.currentStock<=a.minimumStock?1:2)-(!b.active?0:b.currentStock<=b.minimumStock?1:2);
    return sortDirection==="asc"?comparison:-comparison;
  }),[products,sortKey,sortDirection]);
  const changeSort=(column:ProductSortKey)=>{if(column===sortKey)setSortDirection(direction=>direction==="asc"?"desc":"asc");else{setSortKey(column);setSortDirection("asc");}};
  const header=(label:string,column:ProductSortKey)=><SortHeader label={label} column={column} active={sortKey===column} direction={sortDirection} onSort={changeSort}/>;
  return <><PageTitle eyebrow="CATÁLOGO" title="Produtos" description="Cadastre e acompanhe todos os itens do mercado." action={<button className="primary" onClick={onNew}>+ Novo produto</button>}/><div className="toolbar"><SearchBar value={search} onChange={setSearch} placeholder="Buscar produto, código ou categoria..."/><span>{products.length} produtos</span></div><article className="table-card"><table><thead><tr>{header("Produto","name")}{header("Código","sku")}{header("Fornecedor","supplier")}{header("Custo","cost")}{header("Venda","sale")}{header("Estoque","stock")}{header("Status","status")}<th></th></tr></thead><tbody>{sortedProducts.map(p=><tr key={p.id}><td><div className="product-cell"><span className="mini-avatar">{initials(p.name)}</span><div><strong>{p.name}</strong><small>{p.category}</small></div></div></td><td><code>{p.sku}</code></td><td>{p.supplierName || <em>Não vinculado</em>}</td><td>{money(p.costPrice)}</td><td><strong>{money(p.salePrice)}</strong></td><td><StockBar product={p}/></td><td><span className={`status ${!p.active?"inactive":p.currentStock<=p.minimumStock?"low":"ok"}`}>{!p.active?"Inativo":p.currentStock<=p.minimumStock?"Estoque baixo":"Em estoque"}</span></td><td><div className="row-actions"><button onClick={()=>onEdit(p)} title="Editar">✎</button><button className="delete-button" onClick={()=>onDelete(p)} title="Excluir produto">Excluir</button></div></td></tr>)}</tbody></table>{!products.length&&<Empty text="Nenhum produto encontrado."/>}<div className="table-foot">Mostrando {products.length} produtos</div></article></>;
}
function StockBar({product}:{product:Product}) { const pct=Math.min(100,Math.round(product.currentStock/Math.max(product.minimumStock*2,1)*100)); return <div className="stock-cell"><span><i style={{width:`${pct}%`}} className={product.currentStock<=product.minimumStock?"danger":""}/></span><b>{product.currentStock} <small>{product.unit}</small></b></div>; }

function SuppliersSection({suppliers,search,setSearch,onNew,onEdit,onDelete}:{suppliers:Supplier[];search:string;setSearch:(s:string)=>void;onNew:()=>void;onEdit:(s:Supplier)=>void;onDelete:(s:Supplier)=>void}) { return <><PageTitle eyebrow="PARCEIROS" title="Fornecedores" description="Cadastre e mantenha os contatos dos seus parceiros." action={<button className="primary" onClick={onNew}>+ Novo fornecedor</button>}/><div className="toolbar"><SearchBar value={search} onChange={setSearch} placeholder="Buscar fornecedor, documento ou contato..."/><span>{suppliers.length} fornecedores</span></div><section className="supplier-grid">{suppliers.map(s=><article className={`supplier-card ${!s.active?"muted":""}`} key={s.id}><div className="supplier-top"><span className="supplier-logo">{initials(s.name)}</span><span className={`status ${s.active?"ok":"inactive"}`}>{s.active?"Ativo":"Inativo"}</span></div><h3>{s.name}</h3><p>{s.document || "Documento não informado"}</p><dl><div><dt>Contato</dt><dd>{s.contact || "—"}</dd></div><div><dt>E-mail</dt><dd>{s.email || "—"}</dd></div><div><dt>Telefone</dt><dd>{s.phone || "—"}</dd></div></dl><footer><span><b>{s.productCount}</b> produtos vinculados</span><div className="row-actions"><button onClick={()=>onEdit(s)} title="Editar fornecedor">✎</button><button className="delete-button" onClick={()=>onDelete(s)} title="Excluir fornecedor">Excluir</button></div></footer></article>)}</section>{!suppliers.length&&<Empty text="Nenhum fornecedor encontrado."/>}</>; }

function MovementsSection({movements,search,setSearch,onNew}:{movements:Movement[];search:string;setSearch:(s:string)=>void;onNew:()=>void}) { return <><PageTitle eyebrow="HISTÓRICO" title="Movimentações" description="Rastreie cada entrada, saída e ajuste de estoque." action={<button className="primary" onClick={onNew}>+ Registrar movimentação</button>}/><div className="toolbar"><SearchBar value={search} onChange={setSearch} placeholder="Buscar produto, código ou motivo..."/><span>{movements.length} registros</span></div><article className="table-card"><table><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Quantidade</th><th>Estoque anterior</th><th>Estoque final</th><th>Motivo</th></tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{dateTime(m.createdAt)}</td><td><div className="product-cell"><span className="mini-avatar">{initials(m.productName)}</span><div><strong>{m.productName}</strong><small>{m.sku}</small></div></div></td><td><span className={`movement-tag ${m.type}`}>{m.type}</span></td><td><strong>{m.type==="saida"?"-":"+"}{m.quantity} {m.unit}</strong></td><td>{m.previousStock} {m.unit}</td><td>{m.resultingStock} {m.unit}</td><td>{m.reason || "—"}</td></tr>)}</tbody></table>{!movements.length&&<Empty text="Nenhuma movimentação encontrada."/>}</article></>; }

function SalesChart({data,emptyText,minWidth}:{data:Array<{label:string;value:number;count:number}>;emptyText:string;minWidth:number}) {
  const maxValue=Math.max(...data.map(item=>item.value),1);
  const hasSales=data.some(item=>item.count>0);
  return <div className="sales-chart-scroll">
    <div className="sales-chart" style={{minWidth}}>
      {data.map(item=><div className="sales-chart-column" key={item.label} title={`${item.label}: ${money(item.value)} em ${item.count} venda(s)`}>
        <span className={item.value>0?"visible":""}>{item.value>0?money(item.value):""}</span>
        <div><i className={item.value>0?"has-value":""} style={{height:item.value>0?`${Math.max(item.value/maxValue*100,7)}%`:"2px"}}/></div>
        <b>{item.label}</b>
      </div>)}
      {!hasSales&&<div className="sales-chart-empty">{emptyText}</div>}
    </div>
  </div>;
}

function ReportsSection({products,movements,summary}:{products:Product[];movements:Movement[];summary:Summary}) {
  const categories=Object.entries(products.reduce<Record<string,number>>((a,p)=>{a[p.category]=(a[p.category]||0)+p.currentStock*p.costPrice;return a;},{})).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(...categories.map(c=>c[1]),1);
  const now=new Date();
  const cancelledSales=new Set(movements.filter(m=>m.saleId&&m.reason.startsWith("Cancelamento da venda")).map(m=>m.saleId as number));
  const salesById=new Map<number,{date:Date;total:number}>();
  for(const movement of movements){
    if(!movement.saleId||cancelledSales.has(movement.saleId)||movement.reason.startsWith("Cancelamento da venda")||salesById.has(movement.saleId))continue;
    const match=movement.notes.match(/Total da compra:\s*R\$\s*([\d.,]+)/i);
    if(!match)continue;
    const raw=match[1];
    const parsed=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);
    if(Number.isFinite(parsed))salesById.set(movement.saleId,{date:new Date(movement.createdAt),total:parsed});
  }
  const sales=[...salesById.values()];
  const dailyData=Array.from({length:24},(_,hour)=>{
    const hourSales=sales.filter(sale=>sale.date.getFullYear()===now.getFullYear()&&sale.date.getMonth()===now.getMonth()&&sale.date.getDate()===now.getDate()&&sale.date.getHours()===hour);
    return {label:`${String(hour).padStart(2,"0")}h`,value:hourSales.reduce((total,sale)=>total+sale.total,0),count:hourSales.length};
  });
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const monthlyData=Array.from({length:daysInMonth},(_,index)=>{
    const day=index+1;
    const daySales=sales.filter(sale=>sale.date.getFullYear()===now.getFullYear()&&sale.date.getMonth()===now.getMonth()&&sale.date.getDate()===day);
    return {label:String(day).padStart(2,"0"),value:daySales.reduce((total,sale)=>total+sale.total,0),count:daySales.length};
  });
  const todayTotal=dailyData.reduce((total,item)=>total+item.value,0);
  const todayCount=dailyData.reduce((total,item)=>total+item.count,0);
  const monthTotal=monthlyData.reduce((total,item)=>total+item.value,0);
  const monthCount=monthlyData.reduce((total,item)=>total+item.count,0);
  const monthName=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric"}).format(now);

  return <><PageTitle eyebrow="ANÁLISE" title="Relatórios" description="Indicadores para tomar decisões melhores sobre o estoque."/>
    <section className="stats-grid"><Stat icon="R$" label="Custo do estoque" value={money(summary.stockValue)} detail="capital investido"/><Stat icon="↗" label="Valor de venda" value={money(summary.retailValue)} detail="potencial de receita" tone="blue"/><Stat icon="%" label="Margem potencial" value={summary.retailValue?`${Math.round((summary.retailValue-summary.stockValue)/summary.retailValue*100)}%`:"0%"} detail="sobre valor de venda" tone="yellow"/><Stat icon="⇄" label="Movimentações" value={movements.length} detail="registros no histórico" tone="cream"/></section>
    <section className="dashboard-grid reports"><article className="panel"><div className="panel-head"><div><h2>Valor por categoria</h2><p>Distribuição do custo atual</p></div></div><div className="bars">{categories.map(([name,value])=><div key={name}><div><span>{name}</span><b>{money(value)}</b></div><i><span style={{width:`${value/max*100}%`}}/></i></div>)}</div></article><article className="panel"><div className="panel-head"><div><h2>Resumo operacional</h2><p>Pontos importantes do cadastro</p></div></div><div className="report-list"><div><span>Produtos sem fornecedor</span><strong>{products.filter(p=>!p.supplierId).length}</strong></div><div><span>Produtos com estoque baixo</span><strong>{products.filter(p=>p.currentStock<=p.minimumStock).length}</strong></div><div><span>Produtos inativos</span><strong>{products.filter(p=>!p.active).length}</strong></div><div><span>Lucro bruto potencial</span><strong>{money(summary.retailValue-summary.stockValue)}</strong></div></div></article></section>
    <section className="sales-report-grid">
      <article className="panel sales-chart-card">
        <div className="panel-head"><div><h2>Vendas de hoje</h2><p>Faturamento por hora em {new Intl.DateTimeFormat("pt-BR",{dateStyle:"long"}).format(now)}</p></div><div className="sales-chart-total"><small>{todayCount} venda(s)</small><strong>{money(todayTotal)}</strong></div></div>
        <SalesChart data={dailyData} emptyText="Nenhuma venda registrada hoje." minWidth={820}/>
      </article>
      <article className="panel sales-chart-card">
        <div className="panel-head"><div><h2>Vendas mensais</h2><p>Faturamento diário de {monthName}</p></div><div className="sales-chart-total"><small>{monthCount} venda(s)</small><strong>{money(monthTotal)}</strong></div></div>
        <SalesChart data={monthlyData} emptyText="Nenhuma venda registrada neste mês." minWidth={960}/>
      </article>
    </section>
  </>;
}

function Modal({title,description,onClose,children}:{title:string;description:string;onClose:()=>void;children:React.ReactNode}) { return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal"><button className="modal-close" onClick={onClose}>×</button><small>Mercado+</small><h2>{title}</h2><p>{description}</p>{children}</div></div>; }
function DeleteConfirmModal({target,onClose,onConfirm}:{target:DeleteTarget;onClose:()=>void;onConfirm:(target:DeleteTarget,hideWarning?:boolean)=>Promise<void>}) {
  const [hideWarning, setHideWarning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isSupplier = target.kind === "suppliers";
  return <Modal title={isSupplier ? "Excluir fornecedor?" : "Excluir produto?"} description="Esta ação é permanente e não poderá ser desfeita." onClose={onClose}>
    <div className="danger-warning"><strong>{target.name}</strong><p>{isSupplier ? `Ao continuar, este fornecedor, ${target.linkedCount} produto(s) vinculado(s) e todo o histórico desses itens serão apagados.` : "O produto e todo o seu histórico de movimentações serão apagados."}</p></div>
    {isSupplier && <label className="remember-choice"><input type="checkbox" checked={hideWarning} onChange={e=>setHideWarning(e.target.checked)}/><span>Não mostrar esta mensagem novamente neste navegador</span></label>}
    <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button type="button" className="danger-button" disabled={deleting} onClick={async()=>{setDeleting(true);await onConfirm(target,hideWarning);setDeleting(false);}}>{deleting ? "Excluindo..." : "Sim, excluir permanentemente"}</button></div>
  </Modal>;
}
function FormActions({onClose}:{onClose:()=>void}) { return <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" type="submit">Salvar cadastro</button></div>; }
function inferProductCategory(productName:string) {
  const name=productName.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const categories:[string,string[]][]=[
    ["Hortifrúti",["banana","manga","maca","laranja","limao","uva","mamao","abacaxi","tomate","batata","cebola","cenoura","alface","verdura","legume","fruta"]],
    ["Laticínios",["leite","queijo","iogurte","danone","manteiga","requeijao","creme de leite"]],
    ["Grãos",["arroz","feijao","cafe","lentilha","grao de bico","aveia","milho","farinha"]],
    ["Bebidas",["agua","refrigerante","suco","cerveja","vinho","energetico","cha","licor"]],
    ["Carnes",["carne","frango","peixe","linguica","bacon","presunto","hamburguer"]],
    ["Padaria",["pao","bolo","torrada","biscoito","rosca"]],
    ["Limpeza",["detergente","sabao","desinfetante","agua sanitaria","amaciante","esponja","limpador"]],
    ["Higiene",["sabonete","shampoo","condicionador","creme dental","papel higienico","desodorante"]],
    ["Doces",["chocolate","bala","bombom","doce","pirulito","sorvete"]],
    ["Congelados",["congelado","pizza","lasanha","nugget"]],
  ];
  return categories.find(([,keywords])=>keywords.some(keyword=>name.includes(keyword)))?.[0]||"Mercearia";
}
function ProductModal({
  item,
  suppliers,
  onClose,
  onSubmit,
}: {
  item: Product | null;
  suppliers: Supplier[];
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [priceEditable, setPriceEditable] = useState(!item);
  const [productName, setProductName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "Mercearia");
  return (
    <Modal
      title={item ? "Editar produto" : "Novo produto"}
      description="Preencha as informações do item do seu estoque."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onSubmit(e);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao salvar.");
          }
        }}
      >
        <div className="form-grid">
          <label className="span-2">
            Nome do produto
            <input
              name="name"
              required
              value={productName}
              onChange={(event) => {
                setProductName(event.target.value);
                setCategory(inferProductCategory(event.target.value));
              }}
            />
          </label>
          {item ? (
            <label>
              Código automático
              <input value={item.sku} readOnly className="readonly-code" />
            </label>
          ) : (
            <div className="auto-code-field">
              <span>Código do produto</span>
              <strong>Gerado automaticamente ao salvar</strong>
            </div>
          )}
          <label>
            Código de barras
            <input
              name="barcode"
              inputMode="numeric"
              defaultValue={item?.barcode || ""}
              placeholder="Ex.: 7891234567890"
            />
          </label>
          <label>
            Categoria
            <input
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
            <small className="category-auto-hint">Preenchida automaticamente pelo nome; ajuste se necessário.</small>
          </label>
          <label>
            Unidade
            <select name="unit" defaultValue={item?.unit || "un"}>
              <option>un</option>
              <option>kg</option>
              <option>pct</option>
              <option>cx</option>
              <option>lt</option>
            </select>
          </label>
          <label>
            Fornecedor
            <select name="supplierId" required defaultValue={item?.supplierId || ""}>
              <option value="" disabled>Selecione um fornecedor</option>
              {suppliers
                .filter((s) => s.active)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Preço de custo
            <input
              name="costPrice"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={item?.costPrice || ""}
            />
          </label>
          <label className="price-field">
            <span className="price-label">
              Preço de venda
              {item && (
                <button
                  type="button"
                  className={priceEditable ? "price-unlocked" : "price-unlock"}
                  aria-label={
                    priceEditable
                      ? "Bloquear edição do preço"
                      : "Editar preço de venda"
                  }
                  title={priceEditable ? "Bloquear edição" : "Editar preço"}
                  onClick={() => setPriceEditable((value) => !value)}
                >
                  {priceEditable ? "🔒" : "✎"}
                </button>
              )}
            </span>
            <input
              name="salePrice"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={item?.salePrice || ""}
              readOnly={!priceEditable}
              className={!priceEditable ? "protected-price" : ""}
            />
            {item && (
              <small className="price-updated">
                {item.salePriceUpdatedAt
                  ? `Última alteração: ${dateTime(item.salePriceUpdatedAt)}`
                  : "Última alteração não registrada"}
              </small>
            )}
          </label>
          <label>
            {item ? "Estoque atual" : "Estoque inicial"}
            <input
              name="currentStock"
              type="number"
              min={item ? "0" : "1"}
              step="1"
              required
              defaultValue={item?.currentStock ?? ""}
            />
            {item && <small className="category-auto-hint">Alterações ficam registradas em Movimentações.</small>}
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <FormActions onClose={onClose} />
      </form>
    </Modal>
  );
}
function SupplierModal({item,onClose,onSubmit}:{item:Supplier|null;onClose:()=>void;onSubmit:(e:FormEvent<HTMLFormElement>)=>Promise<void>}) { const [error,setError]=useState(""); const [documentValue,setDocumentValue]=useState(formatDocument(item?.document||"")); const [email,setEmail]=useState(item?.email||""); const [phone,setPhone]=useState(formatPhone(item?.phone||"")); return <Modal title={item?"Editar fornecedor":"Novo fornecedor"} description="Mantenha os dados comerciais do parceiro organizados." onClose={onClose}><form onSubmit={async e=>{e.preventDefault();try{await onSubmit(e)}catch(err){setError(err instanceof Error?err.message:"Erro ao salvar.")}}}><div className="form-grid"><label className="span-2">Nome / Razão social<input name="name" required defaultValue={item?.name}/></label><label>CPF ou CNPJ<input name="document" inputMode="numeric" value={documentValue} onChange={event=>setDocumentValue(formatDocument(event.target.value))} placeholder="000.000.000-00" maxLength={18} pattern="(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})" title="Informe um CPF com 11 números ou um CNPJ com 14 números."/></label><label>Pessoa de contato<input name="contact" defaultValue={item?.contact}/></label><label>E-mail<input name="email" type="email" value={email} onChange={event=>setEmail(normalizeEmail(event.target.value))} placeholder="contato@fornecedor.com.br"/></label><label>Telefone<input name="phone" inputMode="numeric" value={phone} onChange={event=>setPhone(formatPhone(event.target.value))} placeholder="(00) 00000-0000" maxLength={15}/></label></div>{error&&<p className="form-error">{error}</p>}<FormActions onClose={onClose}/></form></Modal>; }
function MovementModal({products,onClose,onSubmit}:{products:Product[];onClose:()=>void;onSubmit:(e:FormEvent<HTMLFormElement>)=>Promise<void>}) { const [type,setType]=useState("entrada"); const [selected,setSelected]=useState<Product|null>(products[0]||null); const [error,setError]=useState(""); return <Modal title="Registrar movimentação" description="Toda alteração fica salva no histórico do produto." onClose={onClose}><form onSubmit={async e=>{e.preventDefault();try{await onSubmit(e)}catch(err){setError(err instanceof Error?err.message:"Erro ao salvar.")}}}><div className="movement-choice"><label><input type="radio" name="type" value="entrada" checked={type==="entrada"} onChange={e=>setType(e.target.value)}/><span>↓</span> Entrada</label><label><input type="radio" name="type" value="saida" checked={type==="saida"} onChange={e=>setType(e.target.value)}/><span>↑</span> Saída</label><label><input type="radio" name="type" value="ajuste" checked={type==="ajuste"} onChange={e=>setType(e.target.value)}/><span>⇄</span> Ajuste</label></div><div className="form-grid"><label className="span-2">Produto<select name="productId" required onChange={e=>setSelected(products.find(p=>p.id===Number(e.target.value))||null)}>{products.map(p=><option value={p.id} key={p.id}>{p.sku} — {p.name} ({p.currentStock} {p.unit})</option>)}</select></label><label>{type==="ajuste"?"Novo saldo":"Quantidade"}<input name="quantity" required type="number" min="0" step="0.001"/></label><label>Custo unitário<input name="unitCost" type="number" min="0" step="0.01" defaultValue={selected?.costPrice||0}/></label><label className="span-2">Motivo<input name="reason" placeholder={type==="entrada"?"Ex.: compra do fornecedor":type==="saida"?"Ex.: perda, venda ou consumo":"Ex.: inventário físico"}/></label><label className="span-2">Observações<textarea name="notes" rows={2}/></label></div>{error&&<p className="form-error">{error}</p>}<FormActions onClose={onClose}/></form></Modal>; }
function Empty({text}:{text:string}) { return <div className="empty"><span>◇</span><p>{text}</p></div>; }
