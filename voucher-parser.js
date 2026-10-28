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
  const FLIGHT = /\b([A-Z][A-Z0-9]{1,2}\s?-?\d{2,5})\b/i;
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
    let collectingClient = false;
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
      const client = { nome: clean(name).replace(/[.,;]+$/, ""), cpf: clean(id), dataNascimento: "", idade: "" };
      if (!client.nome && !client.cpf) return;
      const duplicate = result.clients.find(c => client.nome && normalize(c.nome) === normalize(client.nome));
      if (duplicate) {
        if (!duplicate.cpf && client.cpf) duplicate.cpf = client.cpf;
        lastClient = duplicate;
        collectingClient = true;
        return;
      }
      result.clients.push(client);
      lastClient = client;
      collectingClient = true;
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
      collectingClient = true;
    }

    function setBirthDate(value) {
      const parsedDate = dateFrom(value);
      if (!lastClient || !collectingClient || !parsedDate) return false;
      if (lastClient.dataNascimento && lastClient.dataNascimento !== parsedDate) {
        result.warnings.push("Mais de uma data de nascimento para " + (lastClient.nome || "passageiro") + ". Confira.");
      } else {
        lastClient.dataNascimento = parsedDate;
      }
      const m = /\b(\d{1,3})\s*anos?\b/i.exec(value);
      if (m && +m[1] <= 120) lastClient.idade = m[1];
      return true;
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
        result.notes.push(val); notesMode = true; return true;
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
          const normalized = normalize(val);
          const adults = /(\d+)\s*adultos?/.exec(normalized);
          const kids = /(\d+)\s*(?:criancas?|menores|bebes?)/.exec(normalized);
          // "Pax: 2 adultos e 1 criança" descreve três viajantes, não dois.
          const count = adults && kids ? String(+adults[1] + +kids[1]) : qty[1];
          assign("numeroPassageiros", count, label);
          if (kids) assign("numeroCriancas", kids[1], label);
          return true;
        }
      }
      if (/^(?:origem|cidade de origem|local de saida|embarque em)$/.test(key)) {
        assign("origem", val, label); section = "transport"; return true;
      }
      if (/^(?:destino|cidade de destino|desembarque em)$/.test(key)) {
        assign("destino", val, label); section = "transport"; return true;
      }
      if (/^(?:trajeto|rota|transfer|itinerario)$/.test(key)) {
        const route = /^(?:saida\s+)?(?:de\s+)?(.+?)\s+(?:para|ate|a)\s+(.+)$/i.exec(normalize(val));
        if (route) {
          const originalRoute = /^(?:sa[ií]da\s+)?(?:de\s+)?(.+?)\s+(?:para|at[eé]|a)\s+(.+)$/i.exec(val);
          assign("origem", originalRoute[1], label);
          assign("destino", originalRoute[2], label);
        } else result.warnings.push("Trajeto sem origem e destino claros: " + val);
        section = "transport"; return true;
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
      if (/^(?:voo|numero do voo|numero voo)$/.test(key)) {
        const valNormal = normalize(val);
        const direction = /\b(?:chegada|ida)\b/.test(valNormal) ? "arrival" :
          /\b(?:partida|volta|saida|retorno)\b/.test(valNormal) ? "departure" : section;
        if (direction === "arrival" || direction === "departure") extractJourney(val, direction, label);
        else result.warnings.push("Voo sem indicação de chegada ou partida: " + val);
        return true;
      }
      if (/^(?:horario|hora|horario do voo|hora do voo)$/.test(key)) {
        const time = timeFrom(val);
        if (time && (section === "arrival" || section === "departure")) {
          assign(section === "arrival" ? "horaVooChegada" : "horaVooPartida", time, label);
        } else result.warnings.push("Horário sem referência de chegada ou partida: " + val);
        return true;
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
      // Um deslocamento terrestre não é uma data ou voo de partida.
      const route = /^(?:(?:sa[ií]da|transfer|trajeto|viagem|transporte)\s+)?de\s+(.+?)\s+(?:para|at[eé]|a)\s+(.+?)\s*[.!]?$/i.exec(line);
      if (route && !DATE.test(line)) {
        assign("origem", route[1], "origem do deslocamento");
        assign("destino", route[2].replace(/[.,;]+$/, ""), "destino do deslocamento");
        section = "transport";
        collectingClient = false;
        return true;
      }
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
      m = /\b(?:reserva (?:em nome de|para)|passageiro|cliente|hospede)\s+([\p{Lu}][\p{L}.'-]+(?:\s+[\p{Lu}][\p{L}.'-]+){1,4})(?=[,.]|$)/iu.exec(line);
      if (m) {
        addClient(m[1], "");
        // Se a mesma frase informar o hotel, o trecho seguinte será avaliado separadamente.
        const after = line.slice(m.index + m[0].length).replace(/^[.,;\s]+/, "");
        if (after) processNatural(after);
        return true;
      }
      m = /^(.{3,80}?)\s*[-–]\s*(?:cpf|rg)\s*:?\s*([\d.\-/]+)$/i.exec(line);
      if (m) { addClient(m[1], m[2]); return true; }
      // "Ficaremos no Hotel Mar Azul de 10/11/2026 até 15/11/2026".
      const stay = /\b(?:hotel|pousada|resort)\b.*?\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s*(?:a|ate|até|-|e)\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i.exec(line);
      if (stay) {
        assign("dataChegada", dateFrom(stay[1]), "início da hospedagem");
        assign("dataSaida", dateFrom(stay[2]), "fim da hospedagem");
      }
      m = /^(?:ficaremos no |hospedagem no |reserva no |(?:vamos ficar|ficaremos) (?:no|na) )?(hotel|pousada|resort)\s+(.+)$/i.exec(line);
      if (m) {
        const hotelName = m[2].replace(/\s+(?:de|entre)\s+\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}.*$/i, "").replace(/[.,;]+$/, "").trim();
        assign("hotel", m[1] + " " + hotelName, "hospedagem");
        section = ""; return true;
      }
      m = /\b(?:no|na)\s+(hotel|pousada|resort)\s+([^,.]+?)(?=\s+(?:de|entre)\s+\d{1,2}[\/.-]|[,.]|$)/i.exec(line);
      if (m) { assign("hotel", m[1] + " " + clean(m[2]), "hospedagem"); return true; }
      m = /\b(?:motorista|condutor)\s+(?:(?:e|sera|vai ser|é|será)\s+)?([\p{L}][\p{L}\s.'-]+?)(?=[,.]|$)/iu.exec(line);
      if (m && /^(?:a definir|confirmado|informado depois|nao informado)$/i.test(normalize(m[1]))) m = null;
      if (m) { assign("nomeMotorista", m[1], "motorista"); section = "transport"; return true; }
      m = /(?:placa\s*(?:do carro|do veiculo)?\s*:?[\s-]*)([A-Z]{3}[- ]?\d[A-Z0-9]\d{2}|[A-Z]{3}[- ]?\d{4})\b/i.exec(line);
      if (m) { assign("placaCarro", m[1], "placa"); return true; }
      // Sem rótulo: "2 adultos + 1 criança" ou "2 adultos e 1 criança".
      m = /^(\d+)\s+adultos?\s*(?:\+|e)\s*(\d+)\s+(?:criancas?|menores|bebes?)$/.exec(n);
      if (m) {
        assign("numeroPassageiros", String(+m[1] + +m[2]), "total de viajantes");
        assign("numeroCriancas", m[2], "crianças");
        return true;
      }
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

    for (let i = 0; i < lines.length; i++) {
      const original = lines[i];
      const line = clean(original.replace(/^\[\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}\]\s*[^:]{1,35}:\s*/, "")
        .replace(/^(?:[-*•📌✅✈️🏨👤📅📍🚗]\s*|\d+[.)]\s*)/, ""));
      if (!line) continue;
      // Lista de passageiros sem questionário: nome em uma linha, CPF e nascimento
      // em outras (ou na mesma linha) não podem ser classificados como texto avulso.
      // Evita interpretar nomes de hotéis, destinos, voos e motorista como passageiros.
      if (!notesMode) {
        const cpfLine = /^(?:CPF|CPF\s*\/\s*RG)\s*[:=\-]?\s*(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}|\d{11})\b/i.exec(line);
        const rgLine = /^RG\s*[:=\-]?\s*([\d.\-]{4,20})/i.exec(line);
        if (cpfLine || rgLine) {
          const match = cpfLine || rgLine;
          addId(match[1].trim());
          const afterId = line.slice(match[0].length).trim();
          if (afterId && DATE.test(afterId)) setBirthDate(afterId);
          else if (afterId && !/^[,;\s-]*$/.test(afterId)) result.unrecognized.push(afterId);
          continue;
        }

        const routeFirst = /^(?:sa[ií]da|transfer|trajeto|viagem|transporte)\s+de\s+(.+?)\s+(?:para|at[eé]|a)\s+(.+?)\s*[.!]?$/i.exec(line);
        if (routeFirst && !DATE.test(line)) {
          assign("origem", routeFirst[1], "origem do deslocamento");
          assign("destino", routeFirst[2].replace(/[.,;]+$/, ""), "destino do deslocamento");
          section = "transport";
          collectingClient = false;
          continue;
        }

        if (collectingClient && lastClient && DATE.test(line) &&
            /^(?:data\s+(?:de\s+)?nascimento\s*[:=]?\s*)?\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}(?:\s*[-–—,]\s*\d{1,3}\s*anos?)?\s*$/i.test(line)) {
          if (setBirthDate(line)) continue;
        }

        const nameCandidate = line.replace(DATE, "").replace(/\s*[-–—,]\s*\d{1,3}\s*anos?\b/i, "").trim();
        const looksLikeName = /^[\p{Lu}][\p{L}'’-]+(?:\s+(?:[\p{Lu}][\p{L}'’-]+|de|da|do|dos|das)){1,9}$/u.test(nameCandidate);
        const reserved = /\b(?:hotel|pousada|resort|motorista|condutor|origem|destino|saida|chegada|voo|transfer|trajeto|passageiro|passageiros|hospedagem|informacoes|informacao|pagamento|observacoes|cpf|data|telefone|contato|aeroporto|porto\s+de\s+galinhas)\b/i.test(normalize(nameCandidate));
        const next = lines.slice(i + 1).map(x => x.trim()).find(Boolean) || "";
        const followedByCpf = /^CPF\s*[:=\-]?\s*\d/i.test(next);
        if (looksLikeName && !reserved && (nameCandidate === nameCandidate.toLocaleUpperCase("pt-BR") || section === "clients" || followedByCpf)) {
          addClient(nameCandidate, "");
          if (DATE.test(line)) setBirthDate(line);
          section = "clients";
          continue;
        }
      }
      // Rótulos podem aparecer com '=' ou dois pontos. Evita confundir horários.
      const labelled = /^([^:=]{2,75}?)\s*[:=]\s*(.*)$/.exec(line);
      if (labelled && processLabel(labelled[1], labelled[2])) continue;
      // "Nome - João" e "Hotel - Atlântico".
      const hyphen = /^([\p{L}\s/]{3,45}?)\s+-\s+(.+)$/u.exec(line);
      if (hyphen && processLabel(hyphen[1], hyphen[2])) continue;
      if (notesMode) { result.notes.push(line); continue; }
      if (!processNatural(line)) {
        result.unrecognized.push(line);
        collectingClient = false;
      } else if (section !== "clients") {
        collectingClient = false;
      }
    }
    // Mantém total explícito como fonte primária; só calcula quando o texto fornece contagens de adultos e crianças.
    if (!result.fields.numeroPassageiros && result.fields._adultos !== undefined) {
      const kids = +(result.fields.numeroCriancas || 0);
      result.fields.numeroPassageiros = String(+result.fields._adultos + kids);
    }
    delete result.fields._adultos;
    if (!result.fields.numeroPassageiros && result.clients.length) {
      result.fields.numeroPassageiros = String(result.clients.length);
    }
    return result;
  }

  root.GaldinoParser = { extract, dateFrom, timeFrom };
})(window);
