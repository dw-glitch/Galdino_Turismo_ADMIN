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

  // Rótulos reconhecidos em mensagens, reservas e textos copiados do WhatsApp.
  // O padrão é conservador: o que não for reconhecido permanece em Observações.
  const PATTERNS = [
    ["numeroPassageiros", /^(?:n[uú]mero (?:de )?passageiros|quantidade (?:de )?(?:pessoas|passageiros)|total (?:de )?(?:pessoas|passageiros)|qtd\.? (?:de )?(?:passageiros|pessoas)|pax|passageiros)\s*[:：=–-]\s*(.+)$/i],
    ["numeroCriancas", /^(?:n[uú]mero (?:de )?crian[cç]as|quantidade (?:de )?crian[cç]as|crian[cç]as|menores|infantes)\s*[:：=–-]\s*(.+)$/i],
    ["dataChegada", /^(?:data (?:de |da )?(?:chegada|entrada|ida)|chegada|check[\s-]?in|entrada no hotel)\s*[:：=–-]\s*(.+)$/i],
    ["dataSaida", /^(?:data (?:de |da )?(?:sa[ií]da|partida|volta|retorno)|sa[ií]da|partida|retorno|check[\s-]?out)\s*[:：=–-]\s*(.+)$/i],
    ["numeroVooChegada", /^(?:n[uú]mero (?:do )?voo (?:de |da )?(?:chegada|ida)|voo (?:de |da )?(?:chegada|ida)|voo ida)\s*[:：=–-]\s*(.+)$/i],
    ["numeroVooPartida", /^(?:n[uú]mero (?:do )?voo (?:de |da )?(?:partida|sa[ií]da|volta|retorno)|voo (?:de |da )?(?:partida|sa[ií]da|volta|retorno)|voo volta)\s*[:：=–-]\s*(.+)$/i],
    ["horaVooChegada", /^(?:hor[aá]rio (?:do |de )?(?:voo de )?(?:chegada|ida)|hora (?:do |de )?(?:voo de )?(?:chegada|ida)|previs[aã]o de chegada)\s*[:：=–-]\s*(.+)$/i],
    ["horaVooPartida", /^(?:hor[aá]rio (?:do |de )?(?:voo de )?(?:partida|sa[ií]da|volta|retorno)|hora (?:do |de )?(?:voo de )?(?:partida|sa[ií]da|volta|retorno))\s*[:：=–-]\s*(.+)$/i],
    ["hotel", /^(?:hotel|pousada|resort|hospedagem|nome (?:do )?hotel|acomoda[cç][aã]o)\s*[:：=–-]\s*(.+)$/i],
    ["pago", /^(?:pagamento|status (?:do )?pagamento|situa[cç][aã]o (?:do )?pagamento|pago)\s*[:：=–-]\s*(.+)$/i],
    ["nomeMotorista", /^(?:nome (?:do )?motorista|motorista|condutor)\s*[:：=–-]\s*(.+)$/i],
    ["placaCarro", /^(?:placa(?: (?:do )?(?:carro|ve[ií]culo))?|ve[ií]culo\/placa)\s*[:：=–-]\s*(.+)$/i],
    ["telefoneMotorista", /^(?:telefone (?:do )?motorista|contato (?:do )?motorista|whats(?:app)? (?:do )?motorista|telefone\/contato (?:do )?motorista)\s*[:：=–-]\s*(.+)$/i]
  ];

  function blankVoucher() {
    return { clients: [], fields: {}, notes: [] };
  }

  function formatDate(value) {
    const clean = String(value || "").trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
    return iso ? iso[3] + "/" + iso[2] + "/" + iso[1] : clean;
  }

  function splitPeople(value) {
    return String(value || "")
      .split(/\s*[;,]\s*/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function parseQuickText(text) {
    const result = blankVoucher();
    let lastClient = null;
    const normalized = String(text || "").replace(/\r\n?/g, "\n")
      // Divide campos unidos na mesma linha, sem separar os nomes compostos.
      .replace(/\s*(?:\||;|\s+-\s+)\s*(?=(?:nome|cpf|rg|documento|hotel|pousada|motorista|placa|voo|data|telefone|pagamento|check[\s-]?in|check[\s-]?out)\s*[:：=])/gi, "\n")
      .replace(/\s+(?=(?:cpf|rg)\s*[:：=])/gi, "\n");

    for (const original of normalized.split("\n")) {
      const line = original.trim().replace(/^(?:[-*•]\s*|\d+[.)]\s*)/, "").trim();
      if (!line) continue;

      let match = /^(?:clientes?|h[oó]spedes?|nomes? (?:dos? )?(?:clientes?|h[oó]spedes?|passageiros)|lista de passageiros)\s*[:：=–-]\s*(.+)$/i.exec(line);
      if (match) {
        for (const nome of splitPeople(match[1])) {
          result.clients.push({ nome, cpf: "" });
          lastClient = result.clients[result.clients.length - 1];
        }
        continue;
      }

      match = /^(?:nome(?: completo)?(?: (?:do|da) (?:cliente|passageiro|h[oó]spede))?|cliente \d+|passageiro \d+|h[oó]spede \d+)\s*[:：=–-]\s*(.+)$/i.exec(line);
      if (match) {
        lastClient = { nome: match[1].trim(), cpf: "" };
        result.clients.push(lastClient);
        continue;
      }

      match = /^(?:cpf(?:\/rg)?|rg|documento(?: de identifica[cç][aã]o)?)(?: \d+)?\s*[:：=–-]\s*(.+)$/i.exec(line);
      if (match) {
        if (!lastClient || lastClient.cpf) {
          lastClient = { nome: "", cpf: "" };
          result.clients.push(lastClient);
        }
        lastClient.cpf = match[1].trim();
        continue;
      }

      match = /^(?:observa[cç][oõ]es|informa[cç][oõ]es adicionais|detalhes|servi[cç]os|passeios)\s*[:：=–-]\s*(.+)$/i.exec(line);
      if (match) {
        result.notes.push(match[1].trim());
        continue;
      }

      let recognized = false;
      for (const [field, regex] of PATTERNS) {
        const found = regex.exec(line);
        if (!found) continue;
        const value = found[1].trim();
        if (field === "numeroPassageiros" && !/^\d/.test(value)) {
          for (const nome of splitPeople(value)) {
            lastClient = { nome, cpf: "" };
            result.clients.push(lastClient);
          }
        } else if (result.fields[field]) {
          // Não perder informações quando uma mensagem contém vários valores.
          result.notes.push(line);
        } else {
          result.fields[field] = value;
        }
        recognized = true;
        break;
      }
      if (!recognized) result.notes.push(line);
    }

    return result;
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

  function renderClients(clients) {
    const root = byId("previewClients");
    root.replaceChildren();
    if (!clients.length) return false;
    const table = document.createElement("table");
    table.className = "clients-table";
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    for (const heading of ["Nome completo", "CPF ou RG"]) {
      const th = document.createElement("th");
      th.textContent = heading;
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const client of clients) {
      const row = document.createElement("tr");
      for (const value of [client.nome, client.cpf]) {
        const td = document.createElement("td");
        td.textContent = value || "Não informado";
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    root.appendChild(table);
    return true;
  }

  function updateSection(id) {
    const section = byId(id);
    if (!section) return;
    const visibleRow = Array.from(section.querySelectorAll(".voucher-info p")).some((row) => !row.hidden);
    section.hidden = !visibleRow;
  }

  function renderVoucher(data) {
    byId("clientsSection").hidden = !renderClients(data.clients);
    for (const [field, previewId] of FIELDS) {
      const el = byId(previewId);
      const value = String(data.fields[field] || "").trim();
      el.textContent = formatDateIfNeeded(field, value);
      el.closest("p").hidden = !value;
    }
    for (const sectionId of ["flightsSection", "hotelSection", "transportSection"]) updateSection(sectionId);
    byId("previewNotes").textContent = data.notes.join("\n");
    byId("notesSection").hidden = !data.notes.length;
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
    setStatus("Voucher preparado. Informações ausentes foram omitidas, sem inventar dados.", false);
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
    setStatus("", false);
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
    byId("voucherForm").addEventListener("submit", (event) => event.preventDefault());
    byId("generatePDF").addEventListener("click", downloadVoucher);
    byId("generateQuickVoucher").addEventListener("click", downloadVoucher);
    byId("previewQuickVoucher").addEventListener("click", () => {
      if (prepareVoucher()) byId("voucherPreview").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.querySelectorAll(".mode-switch button").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    addClient();
    setMode("quick");
  }

  document.addEventListener("DOMContentLoaded", init);
  // Exposto apenas para testes automatizados; nenhum dado pessoal é persistido.
  window.GaldinoVoucher = { parseQuickText, formatDate };
})();
