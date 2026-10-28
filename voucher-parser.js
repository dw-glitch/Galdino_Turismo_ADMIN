/* Leitor local de reservas para o MESMO voucher do formulário manual.
 * Não envia mensagens ou dados de hóspedes a serviços externos.
 * Extrai apenas informações com contexto suficiente; dados duvidosos vão para conferência.
 */
(function (root) {
  "use strict";

  function normalize(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[‐‑–—]/g, "-").replace(/\s+/g, " ").trim();
  }

  function clean(value) {
    return String(value || "").replace(/^[\s"'*•:=-]+|[\s"'*]+$/g, "").trim();
  }

  const DATE = /\b(?:([0-3]?\d)[\/.-]([01]?\d)[\/.-](\d{2}|\d{4})|(\d{4})-([01]?\d)-([0-3]?\d))\b/;
  const TIME = /\b((?:[01]?\d|2[0-3]))\s*(?:[:hH])\s*([0-5]\d)?\b/;
  const FLIGHT = /\b([A-Z]{1,3}\s?-?\d{2,5})\b/i;
  const PLATE = /\b([A-Z]{3}[- ]?\d[A-Z0-9]\d{2}|[A-Z]{3}[- ]?\d{4})\b/i;
  const PHONE = /(?:\+?55[\s()-]*)?(?:\(?\d{2}\)?[\s-]*)?9?\d{4}[\s-]?\d{4}\b/;
  const LABEL_SPLIT = /(?:\s+\|\s+|;\s*|\s+-\s+)(?=(?:nome|cliente|cpf|rg|documento|hotel|pousada|motorista|placa|voo|data|chegada|sa[ií]da|partida|volta|ida|telefone|contato|pagamento|check[\s-]?(?:in|out)|passageiros|crian[cç]as|observa[cç][oõ]es)\b\s*[:=])/gi;

  function dateFrom(value) {
    const match = DATE.exec(value || "");
    if (!match) return "";
    const day = +(match[1] || match[6]);
    const month = +(match[2] || match[5]);
    let year = +(match[3] || match[4]);
    if (year < 100) year += 2000;
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return "";
    return [String(day).padStart(2, "0"), String(month).padStart(2, "0"), String(year)].join("/");
  }

  function timeFrom(value) {
    const m = TIME.exec(value || "");
    return m ? m[1].padStart(2, "0") + ":" + (m[2] || "00") : "";
  }

  function peopleFrom(value) {
    return clean(value).split(/\s*(?:;|\n|\s+\+\s+)\s*/).map(clean).filter(Boolean);
  }

  function extract(text) {
    const result = { clients: [], fields: {}, notes: [], unrecognized: [], warnings: [] };
    let section = "";
    let lastClient = null;
    let notesMode = false;

    function assign(field, raw, origin) {
      const value = clean(raw);
      if (!value) return false;
      if (result.fields[field] && result.fields[field] !== value) {
        result.warnings.push("Valores diferentes para " + origin + ". Confira: " + value);
        return true;
      }
      result.fields[field] = value;
      return true;
    }

    function addClient(name, id) {
      const client = { nome: clean(name), cpf: clean(id) };
      if (!client.nome && !client.cpf) return;
      const duplicate = result.clients.find(c => client.nome && normalize(c.nome) === normalize(client.nome));
      if (duplicate) {
        if (!duplicate.cpf && client.cpf) duplicate.cpf = client.cpf;
        lastClient = duplicate;
        return;
      }
      result.clients.push(client);
      lastClient = client;
    }

    function addId(value) {
      const id = clean(value);
      if (!id) return;
      if (!lastClient || lastClient.cpf) {
        const pending = result.clients.find(c => !c.cpf);
        lastClient = pending || null;
      }
      if (!lastClient) addClient("", id);
      else lastClient.cpf = id;
    }

    function setPayment(value) {
      const lower = normalize(value);
      if (/\b(nao pago|nao quitado|pendente|em aberto|a pagar|aguardando pagamento)\b/.test(lower)) {
        return assign("pago", "Pendente", "pagamento");
      }
      if (/\b(pago|quitado|pagamento realizado|pagamento confirmado)\b/.test(lower)) {
        return assign("pago", "Pago", "pagamento");
      }
      result.warnings.push("Status do pagamento não confirmado: " + clean(value));
      return true;
    }

    function extractJourney(raw, direction, origin, label) {
      const suffix = direction === "arrival" ? "Chegada" : "Partida";
      let identified = false;
      const date = dateFrom(raw);
      const time = timeFrom(raw);
      const flight = FLIGHT.exec(raw);
      if (date) identified = assign(direction === "arrival" ? "dataChegada" : "dataSaida", date, origin) || identified;
      if (time && !/^(?:[\d\/.-]+)$/.test(raw.trim())) {
        identified = assign("horaVoo" + suffix, time, origin) || identified;
      }
      if (flight) identified = assign("numeroVoo" + suffix, flight[1].toUpperCase().replace(/\s+/g, ""), origin) || identified;
      // Permite números em horários ou datas sem tratar como identificador de voo.
      return identified;
    }

    function processLabel(label, value) {
      const key = normalize(label).replace(/[:*]/g, "");
      const val = clean(value);
      if (!val) {
        if (/^(?:clientes?|hospedes?|passageiros|nomes? dos? passageiros|lista de passageiros)$/.test(key)) section = "clients";
        else if (/^observac|^informacoes adicionais/.test(key)) notesMode = true;
        else if (/^(?:ida|chegada|voo ida|voo chegada)$/.test(key)) section = "arrival";
        else if (/^(?:volta|retorno|saida|partida|voo volta|voo partida)$/.test(key)) section = "departure";
        return true;
      }
      notesMode = false;
      if (/^(?:observacoes?|informacoes adicionais|detalhes adicionais|observacao|obs|servicos inclusos)$/.test(key)) {
        result.notes.push(val); return true;
      }
      if (/^nome (?:do |da )?motorista$|^(?:motorista|condutor)(?: responsavel)?$/.test(key)) {
        assign("nomeMotorista", val, label); return true;
      }
      if (/^(?:clientes?|hospedes?|nomes? (?:dos? )?(?:clientes?|passageiros|hospedes)|lista de passageiros|titulares)$/.test(key) ||
         (/^passageiros$/.test(key) && !/^\d/.test(val))) {
        peopleFrom(val).forEach(name => addClient(name, ""));
        section = "clients"; return true;
      }
      if (/^(?:nome(?: completo)?(?: (?:do|da) (?:cliente|passageiro|hospede|titular))?|cliente\s*\d+|passageiro\s*\d+|hospede\s*\d+|titular(?: da reserva)?)$/.test(key)) {
        addClient(val, ""); section = "clients"; return true;
      }
      if (/^(?:cpf|rg|cpf\/rg|cpf ou rg|documento(?: de identificacao)?)(?:\s*\d+)?$/.test(key)) {
        addId(val); return true;
      }
      if (/^(?:adultos?|qtd adultos|quantidade de adultos)$/.test(key)) {
        const qty = /\d+/.exec(val);
        if (qty) { assign("_adultos", qty[0], label); return true; }
      }
      if (/^(?:criancas?|menores|infantes|qtd criancas|numero de criancas|quantidade de criancas|bebes)$/.test(key)) {
        const qty = /\d+/.exec(val);
        if (qty) { assign("numeroCriancas", qty[0], label); return true; }
      }
      if (/^(?:n[uú]mero de passageiros|numero passageiros|total de passageiros|total de pessoas|qtd de passageiros|qtd passageiros|qtd pessoas|pax|passageiros|quantidade de passageiros|quantidade de pessoas)$/.test(key)) {
        const qty = /(\d+)/.exec(val);
        if (qty) {
          assign("numeroPassageiros", qty[1], label);
          const kids = /(\d+)\s*(?:criancas?|menores|bebes)/.exec(normalize(val));
          if (kids) assign("numeroCriancas", kids[1], label);
          return true;
        }
      }
      if (/^(?:hotel|pousada|resort|hospedagem|nome (?:do )?hotel|acomodacao|local de hospedagem)$/.test(key)) {
        assign("hotel", val, label); return true;
      }
      if (/^(?:pagamento|status (?:do )?pagamento|situacao (?:do )?pagamento|pago|situacao financeira)$/.test(key)) {
        return setPayment(val);
      }
      if (/^(?:placa|placa do carro|placa do veiculo|veiculo\/placa|placa veiculo)$/.test(key)) {
        assign("placaCarro", val, label); return true;
      }
      if (/^(?:telefone|contato|telefone do motorista|contato do motorista|whatsapp do motorista|telefone\/contato do motorista|celular do motorista)$/.test(key)) {
        if (/\bmotorista\b/.test(key) || section === "transport") assign("telefoneMotorista", val, label);
        else result.warnings.push("Contato sem destinatário identificado: " + val);
        return true;
      }
      if (/^(?:data (?:de |da )?(?:chegada|entrada|ida)|chegada|entrada|ida|check-?in|check in|data de embarque)$/.test(key)) {
        if (!extractJourney(val, "arrival", label)) result.warnings.push("Chegada sem data/voo reconhecido: " + val);
        section = "arrival"; return true;
      }
      if (/^(?:data (?:de |da )?(?:saida|partida|volta|retorno)|saida|partida|volta|retorno|check-?out|check out)$/.test(key)) {
        if (!extractJourney(val, "departure", label)) result.warnings.push("Saída sem data/voo reconhecido: " + val);
        section = "departure"; return true;
      }
      if (/^(?:numero (?:do )?voo (?:de |da )?(?:chegada|ida)|voo (?:de |da )?(?:chegada|ida)|voo ida|numero voo ida|voo chegada|voo de entrada)$/.test(key)) {
        if (!extractJourney(val, "arrival", label)) result.warnings.push("Voo de chegada não reconhecido: " + val);
        section = "arrival"; return true;
      }
      if (/^(?:numero (?:do )?voo (?:de |da )?(?:partida|saida|volta|retorno)|voo (?:de |da )?(?:partida|saida|volta|retorno)|voo volta|numero voo volta|voo partida)$/.test(key)) {
        if (!extractJourney(val, "departure", label)) result.warnings.push("Voo de partida não reconhecido: " + val);
        section = "departure"; return true;
      }
      if (/^(?:hora|horario|hora prevista|horario previsto|previsao)(?: (?:do |de |da )?(?:voo de )?(?:chegada|ida|entrada))$/.test(key)) {
        const tm = timeFrom(val);
        if (tm) assign("horaVooChegada", tm, label);
        else result.warnings.push("Horário de chegada inválido: " + val);
        return true;
      }
      if (/^(?:hora|horario|hora prevista|horario previsto|previsao)(?: (?:do |de |da )?(?:voo de )?(?:partida|saida|volta|retorno))$/.test(key)) {
        const tm = timeFrom(val);
        if (tm) assign("horaVooPartida", tm, label);
        else result.warnings.push("Horário de partida inválido: " + val);
        return true;
      }
      if (/^(?:periodo|periodo da estadia|datas da hospedagem|datas da viagem)$/.test(key)) {
        const dates = Array.from(val.matchAll(new RegExp(DATE.source, "g"))).map(m => dateFrom(m[0])).filter(Boolean);
        if (dates.length >= 2) {
          assign("dataChegada", dates[0], label);
          assign("dataSaida", dates[1], label);
          return true;
        }
      }
      return false;
    }

    function processNatural(line) {
      const n = normalize(line);
      let m;
      if (/^(?:informacoes? do voo|dados dos clientes|hospedagem|informacoes? do transporte|dados do transfer|transporte)$/.test(n)) {
        section = /clientes/.test(n) ? "clients" : /transporte|transfer/.test(n) ? "transport" : ""; return true;
      }
      if (/^(?:passageiros|clientes|hospedes|nomes|lista de passageiros)\s*:?$/.test(n)) { section = "clients"; return true; }
      if (/^(?:observacoes|observacao|obs)\s*:?$/.test(n)) { notesMode = true; return true; }
      if (/^(?:voo de )?(?:ida|chegada)\s*:?$/.test(n)) { section = "arrival"; return true; }
      if (/^(?:voo de )?(?:volta|retorno|partida|saida)\s*:?$/.test(n)) { section = "departure"; return true; }

      if (section === "clients" && /^[\p{L}][\p{L}\s.'-]{2,100}$/u.test(line) && !/hotel|voo|transfer|pagamento|saida|chegada/i.test(line)) {
        addClient(line, ""); return true;
      }
      m = /^(.{3,80}?)\s*[-–]\s*(?:cpf|rg)\s*:?\s*([\d.\-/]+)$/i.exec(line);
      if (m) { addClient(m[1], m[2]); return true; }
      m = /^(?:ficaremos no |hospedagem no |reserva no )?(hotel|pousada|resort)\s+(.+)$/i.exec(line);
      if (m) { assign("hotel", m[1] + " " + m[2], "hospedagem"); section = ""; return true; }
      m = /^(?:motorista|condutor)\s+([\p{L}][\p{L}\s.'-]+)$/iu.exec(line);
      if (m) { assign("nomeMotorista", m[1], "motorista"); section = "transport"; return true; }
      m = /(?:placa\s*(?:do carro|do veiculo)?\s*:?[\s-]*)([A-Z]{3}[- ]?\d[A-Z0-9]\d{2}|[A-Z]{3}[- ]?\d{4})\b/i.exec(line);
      if (m) { assign("placaCarro", m[1], "placa"); return true; }
      if (/^(?:pagamento\s+)?(?:pago|quitado|pendente|nao pago|em aberto)$/i.test(n)) {
        setPayment(n); return true;
      }
      // Aceita mensagens com direção de voo, sem formato chave:valor.
      if (/\b(?:voo|embarque|desembarque)\b/.test(n)) {
        const direction = /(?:volta|retorno|partida|saida)/.test(n) ? "departure" :
          /(?:ida|chegada|desembarque)/.test(n) ? "arrival" : section;
        if (direction === "arrival" || direction === "departure") {
          return extractJourney(line, direction, "voo mencionado no texto");
        }
      }
      // Datas em textos simples: "Chegada dia 12/11 às 10h30".
      if (/\b(?:chegada|check-?in|entrada|saida|partida|retorno|check-?out)\b/.test(n)) {
        const direction = /(?:saida|partida|retorno|check-?out)/.test(n) ? "departure" : "arrival";
        if (extractJourney(line, direction, "data mencionada no texto")) return true;
      }
      if (section === "transport" && PHONE.test(line) && !/[a-z]/i.test(line.replace(/\+\d+/, ""))) {
        assign("telefoneMotorista", PHONE.exec(line)[0], "contato do motorista"); return true;
      }
      if ((section === "arrival" || section === "departure") && (FLIGHT.test(line) || DATE.test(line) || TIME.test(line))) {
        return extractJourney(line, section, "dados do voo");
      }
      return false;
    }

    const cleanedText = String(text || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ")
      .replace(/\*\s*([^*\n]+)\s*\*\s*:/g, "$1:");
    const lines = cleanedText.split("\n").flatMap(value => value.split(LABEL_SPLIT));

    for (const original of lines) {
      const line = clean(original.replace(/^\[\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}\]\s*[^:]{1,35}:\s*/, "")
        .replace(/^(?:[-*•📌✅✈️🏨👤📅📍🚗]\s*|\d+[.)]\s*)/, ""));
      if (!line) continue;
      // Rótulos podem aparecer com '=' ou dois pontos. Evita confundir horários.
      const labelled = /^([^:=]{2,75}?)\s*[:=]\s*(.*)$/.exec(line);
      if (labelled && processLabel(labelled[1], labelled[2])) continue;
      // "Nome - João" e "Hotel - Atlântico".
      const hyphen = /^([\p{L}\s/]{3,45}?)\s+-\s+(.+)$/u.exec(line);
      if (hyphen && processLabel(hyphen[1], hyphen[2])) continue;
      if (notesMode) { result.notes.push(line); continue; }
      if (!processNatural(line)) result.unrecognized.push(line);
    }
    // Mantém total explícito como fonte primária; só calcula quando o texto fornece contagens de adultos e crianças.
    if (!result.fields.numeroPassageiros && result.fields._adultos !== undefined) {
      const kids = +(result.fields.numeroCriancas || 0);
      result.fields.numeroPassageiros = String(+result.fields._adultos + kids);
    }
    delete result.fields._adultos;
    return result;
  }

  root.GaldinoParser = { extract, dateFrom, timeFrom };
})(window);
