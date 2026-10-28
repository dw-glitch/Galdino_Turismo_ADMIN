/* Galdino Turismo | Voucher rápido e preenchimento manual.
   Sem serviços externos para interpretar dados pessoais: tudo acontece no navegador. */
(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const FIELDS = [
    ["numeroPassageiros", "previewPassageiros"],
    ["numeroCriancas", "previewCriancas"],
    ["dataChegada", "previewDataChegada"],
    ["numeroVooChegada", "previewVooChegada"],
    ["horaVooChegada", "previewHoraVooChegada"],
    ["dataSaida", "previewDataSaida"],
    ["numeroVooPartida", "previewVooPartida"],
    ["horaVooPartida", "previewHoraVooPartida"],
    ["hotel", "previewHotel"],
    ["pago", "previewPago"],
    ["nomeMotorista", "previewNomeMotorista"],
    ["placaCarro", "previewPlacaCarro"],
    ["telefoneMotorista", "previewTelefoneMotorista"]
  ];

  // Interpretação em módulo isolado, usando os campos exatos do formulário manual.

  function blankVoucher() {
    return { clients: [], fields: {}, notes: [] };
  }

  function formatDate(value) {
    const clean = String(value || "").trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
    return iso ? iso[3] + "/" + iso[2] + "/" + iso[1] : clean;
  }

  function parseQuickText(text) {
    return window.GaldinoParser.extract(text);
  }

  function readManualForm() {
    const result = blankVoucher();
    document.querySelectorAll("#clientsContainer .client-entry").forEach((entry) => {
      const nome = entry.querySelector('input[name^="nome"]')?.value.trim() || "";
      const cpf = entry.querySelector('input[name^="cpf"]')?.value.trim() || "";
      if (nome || cpf) result.clients.push({ nome, cpf });
    });
    for (const [field] of FIELDS) {
      const value = byId(field)?.value.trim() || "";
      if (value) result.fields[field] = value;
    }
    const observations = byId("observacoes").value.trim();
    if (observations) result.notes = [observations];
    return result;
  }

  function hasContent(data) {
    return data.clients.length > 0 ||
      Object.values(data.fields).some((value) => String(value).trim()) ||
      data.notes.length > 0;
  }

  function setStatus(message, error) {
    const status = byId("voucherStatus");
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(error));
  }

  // Este é o ÚNICO modelo de voucher: funciona igual para colagem e formulário.
  // Todas as seções e rótulos do voucher tradicional permanecem visíveis.
  function renderClients(clients) {
    const root = byId("previewClients");
    root.replaceChildren();
    const table = document.createElement("table");
    table.className = "clients-table";
    const thead = document.createElement("thead");
    const row = document.createElement("tr");
    for (const label of ["Nome Completo", "CPF ou RG"]) {
      const th = document.createElement("th");
      th.textContent = label;
      row.appendChild(th);
    }
    thead.appendChild(row);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const person of clients.length ? clients : [{ nome: "", cpf: "" }]) {
      const tr = document.createElement("tr");
      for (const content of [person.nome, person.cpf]) {
        const td = document.createElement("td");
        td.textContent = content || "Não informado";
        if (!content) td.classList.add("not-provided");
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    root.appendChild(table);
  }

  function renderVoucher(data) {
    renderClients(data.clients);
    for (const [field, previewId] of FIELDS) {
      const el = byId(previewId);
      const content = String(data.fields[field] || "").trim();
      el.textContent = content ? formatDateIfNeeded(field, content) : "Não informado";
      el.classList.toggle("not-provided", !content);
      el.closest("p").hidden = false;
    }
    // O bloco de observações é comum aos dois modos; conteúdo bruto não interpretado
    // NUNCA é copiado para o voucher como se fossem dados confirmados.
    const notes = data.notes.filter(Boolean).join("\n");
    byId("previewNotes").textContent = notes;
    byId("notesSection").hidden = !notes;
    for (const id of ["clientsSection", "flightsSection", "hotelSection", "transportSection"]) {
      byId(id).hidden = false;
    }
    byId("previewDataEmissao").textContent = new Date().toLocaleDateString("pt-BR");
    const preview = byId("voucherPreview");
    preview.hidden = false;
    preview.style.display = "block";
  }

  function formatDateIfNeeded(field, value) {
    return field === "dataChegada" || field === "dataSaida" ? formatDate(value) : value;
  }

  function getCurrentData() {
    return byId("quickMode").hidden ? readManualForm() : parseQuickText(byId("quickText").value);
  }

  function prepareVoucher() {
    const data = getCurrentData();
    if (!hasContent(data)) {
      setStatus("Cole as informações da reserva ou preencha pelo menos um campo.", true);
      return false;
    }
    renderVoucher(data);
    setStatus("Voucher gerado no modelo padrão. Confira os campos com “Não informado”.", false);
    return true;
  }

  async function downloadVoucher() {
    if (!prepareVoucher()) return;
    const button = byId("quickMode").hidden ? byId("generatePDF") : byId("generateQuickVoucher");
    button.disabled = true;
    setStatus("Preparando imagem PNG...", false);
    let copy;
    try {
      if (typeof window.html2canvas !== "function") {
        throw new Error("A biblioteca de exportação não carregou. Verifique a conexão e tente novamente.");
      }
      const preview = byId("voucherPreview");
      if (document.fonts?.ready) await document.fonts.ready;
      copy = preview.cloneNode(true);
      copy.removeAttribute("id");
      copy.classList.add("voucher-export");
      Object.assign(copy.style, {
        display: "block",
        width: "800px",
        maxWidth: "none",
        boxSizing: "border-box",
        position: "absolute",
        top: "0",
        left: "-10000px",
        margin: "0"
      });
      document.body.appendChild(copy);
      await Promise.all(Array.from(copy.querySelectorAll("img")).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
      }));
      const canvas = await window.html2canvas(copy, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 1000
      });
      if (!canvas.width || !canvas.height) throw new Error("Imagem vazia.");
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "voucher-galdino-turismo-" + new Date().toISOString().slice(0, 10) + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus("Voucher PNG gerado! Confira o arquivo baixado.", false);
    } catch (error) {
      console.error("Falha ao gerar voucher:", error);
      setStatus("Não foi possível baixar a imagem: " + error.message + " A prévia continua disponível.", true);
    } finally {
      copy?.remove();
      button.disabled = false;
    }
  }

  function setMode(mode) {
    const quick = mode === "quick";
    byId("quickMode").hidden = !quick;
    byId("manualMode").hidden = quick;
    document.querySelectorAll(".mode-switch button").forEach((button) => {
      const active = button.dataset.mode === mode;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    });
    byId("voucherPreview").hidden = true;
    setStatus("", false);
    if (quick && byId("quickText").value.trim()) updateQuickPreview();
  }

  function updateQuickPreview() {
    const data = parseQuickText(byId("quickText").value);
    const filled = FIELDS.filter(([field]) => data.fields[field]).length;
    const recognized = data.clients.length + filled + data.notes.length;
    const flagged = data.unrecognized.concat(data.warnings);
    const summary = byId("quickSummary");
    if (!byId("quickText").value.trim()) {
      summary.textContent = "";
      byId("quickReview").hidden = true;
      byId("voucherPreview").hidden = true;
      setStatus("", false);
      return;
    }
    summary.textContent = recognized
      ? "Identificados: " + filled + " campos, " + data.clients.length + " cliente(s)" +
        (data.notes.length ? " e observações." : ".") +
        " O voucher abaixo está no mesmo padrão do preenchimento manual."
      : "Nenhum dado reconhecido com segurança. Confira os trechos abaixo ou use o formulário.";
    byId("quickReview").hidden = flagged.length === 0;
    byId("quickUnrecognized").textContent = flagged.join("\n");
    if (hasContent(data)) {
      renderVoucher(data);
      setStatus("Prévia padronizada atualizada. Campos ausentes exibem “Não informado”.", false);
    } else {
      byId("voucherPreview").hidden = true;
    }
  }

  function toInputDate(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || "");
    return m ? m[3] + "-" + m[2] + "-" + m[1] : "";
  }

  function fillManualForm(data) {
    byId("clientsContainer").replaceChildren();
    for (const client of data.clients.length ? data.clients : [{ nome: "", cpf: "" }]) {
      addClient();
      const entry = byId("clientsContainer").lastElementChild;
      entry.querySelector('input[name^="nome"]').value = client.nome;
      entry.querySelector('input[name^="cpf"]').value = client.cpf;
    }
    for (const [field] of FIELDS) {
      const input = byId(field);
      let value = data.fields[field] || "";
      if (input.type === "date") value = toInputDate(value);
      // Inputs do tipo time só aceitam HH:MM.
      if (input.type === "time" && !/^\d{2}:\d{2}$/.test(value)) value = "";
      input.value = value;
    }
    byId("observacoes").value = data.notes.join("\n");
  }

  let clientIndex = 0;
  function addClient() {
    const entry = document.createElement("div");
    entry.className = "client-entry";
    const index = clientIndex++;
    for (const [id, label] of [["nome", "Nome"], ["cpf", "CPF ou RG"]]) {
      const group = document.createElement("div");
      group.className = "form-group";
      const labelEl = document.createElement("label");
      labelEl.htmlFor = id + index;
      labelEl.textContent = label + " (opcional)";
      const input = document.createElement("input");
      input.type = "text";
      input.id = id + index;
      input.name = id + index;
      group.append(labelEl, input);
      entry.appendChild(group);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-client";
    remove.textContent = "Remover cliente";
    remove.addEventListener("click", () => entry.remove());
    entry.appendChild(remove);
    byId("clientsContainer").appendChild(entry);
  }

  function init() {
    byId("addClientBtn").addEventListener("click", addClient);
    byId("voucherForm").addEventListener("submit", event => event.preventDefault());
    byId("generatePDF").addEventListener("click", downloadVoucher);
    byId("generateQuickVoucher").addEventListener("click", downloadVoucher);
    byId("quickText").addEventListener("input", updateQuickPreview);
    byId("previewQuickVoucher").addEventListener("click", () => {
      const data = parseQuickText(byId("quickText").value);
      if (!hasContent(data)) {
        setStatus("Não foi possível identificar dados. Revise a mensagem colada.", true);
        return;
      }
      fillManualForm(data);
      setMode("manual");
      renderVoucher(readManualForm());
      setStatus("Os campos foram preenchidos automaticamente. Ajuste apenas o que desejar e gere o mesmo voucher.", false);
      byId("manualMode").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.querySelectorAll(".mode-switch button").forEach(button => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    addClient();
    setMode("quick");
  }

  document.addEventListener("DOMContentLoaded", init);
  // Exposto apenas para testes automatizados; nenhum dado pessoal é persistido.
  window.GaldinoVoucher = { parseQuickText, formatDate };
})();
