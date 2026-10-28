// Executar localmente: node --test tests/voucher-v2.test.cjs
// Usa somente bibliotecas padrão do Node; não ativa GitHub Actions.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const parserCode = fs.readFileSync(path.join(__dirname, "..", "voucher-parser.js"), "utf8");
const appCode = fs.readFileSync(path.join(__dirname, "..", "voucher-v2.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const context = { window: {}, document: { addEventListener() {} } };
vm.runInNewContext(parserCode, context);
vm.runInNewContext(appCode, context);
const { parseQuickText, formatDate } = context.window.GaldinoVoucher;

test("gera dados parciais de cliente e hospedagem sem voo", () => {
  const data = parseQuickText("Cliente: Maria Silva\nHotel: Pousada das Flores");
  assert.equal(data.clients[0].nome, "Maria Silva");
  assert.equal(data.fields.hotel, "Pousada das Flores");
  assert.equal(data.fields.dataChegada, undefined);
});

test("vários clientes com CPF ou RG", () => {
  const data = parseQuickText("Nome: Ana\nCPF: 123.456.789-00\nNome: João\nRG: 1234");
  assert.equal(data.clients.length, 2);
  assert.equal(data.clients[0].cpf, "123.456.789-00");
  assert.equal(data.clients[1].cpf, "1234");
});

test("nomes em uma linha, número de passageiros e check-out", () => {
  const data = parseQuickText("Clientes: Ana; João\nPassageiros: 2\nCheck-out: 30/11/2026");
  assert.equal(data.clients.length, 2);
  assert.equal(data.fields.numeroPassageiros, "2");
  assert.equal(data.fields.dataSaida, "30/11/2026");
});

test("texto não identificado é preservado", () => {
  const data = parseQuickText("Viagem especial\nCadeira infantil necessária");
  assert.equal(data.unrecognized.join(" | "), "Viagem especial | Cadeira infantil necessária");
  assert.equal(data.notes.length, 0);
});

test("campos unidos na mesma linha", () => {
  const data = parseQuickText("Nome: Ana - CPF: 123 | Hotel: Atlântico");
  assert.equal(data.clients[0].cpf, "123");
  assert.equal(data.fields.hotel, "Atlântico");
});

test("dados de transporte e voos", () => {
  const data = parseQuickText("Motorista: Paulo\nPlaca: ABC1D23\nContato do motorista: 81999999999\nVoo de partida: G3123");
  assert.equal(data.fields.nomeMotorista, "Paulo");
  assert.equal(data.fields.placaCarro, "ABC1D23");
  assert.equal(data.fields.telefoneMotorista, "81999999999");
  assert.equal(data.fields.numeroVooPartida, "G3123");
});

test("dados parecidos com HTML permanecem texto, nunca instruções", () => {
  const data = parseQuickText("Nome: <img src=x onerror=alert(1)>");
  assert.equal(data.clients[0].nome, "<img src=x onerror=alert(1)>");
});

test("formata data ISO e preserva data em formato livre", () => {
  assert.equal(formatDate("2026-11-30"), "30/11/2026");
  assert.equal(formatDate("30/11/2026"), "30/11/2026");
});

test("ambos os modos carregam um único template fixo de voucher", () => {
  for (const id of ["clientsSection", "flightsSection", "hotelSection", "transportSection",
    "previewClients", "previewHotel", "previewDataChegada", "previewNomeMotorista"]) {
    assert.ok(html.includes('id="' + id + '"'));
  }
  assert.ok(appCode.includes('byId("quickMode").hidden ? readManualForm() : parseQuickText('));
  assert.ok(appCode.includes('el.textContent = content ? formatDateIfNeeded(field, content) : "Não informado";'));
  assert.equal(html.match(/id="voucherPreview"/g).length, 1);
});

test("reconhece voo de chegada/partida com data e hora na mesma linha", () => {
  const data = parseQuickText("Voo de chegada: AD2046 - 15/11/2026 às 14h30\nVoo de partida: G3 1245 - 20/11/2026 08:45");
  assert.equal(data.fields.numeroVooChegada, "AD2046");
  assert.equal(data.fields.numeroVooPartida, "G31245");
  assert.equal(data.fields.dataChegada, "15/11/2026");
  assert.equal(data.fields.dataSaida, "20/11/2026");
  assert.equal(data.fields.horaVooChegada, "14:30");
  assert.equal(data.fields.horaVooPartida, "08:45");
});

test("identifica datas do período e total de adultos e crianças", () => {
  const data = parseQuickText("Período: 12/11/2026 a 18/11/2026\nAdultos: 2\nCrianças: 1");
  assert.equal(data.fields.dataChegada, "12/11/2026");
  assert.equal(data.fields.dataSaida, "18/11/2026");
  assert.equal(data.fields.numeroPassageiros, "3");
  assert.equal(data.fields.numeroCriancas, "1");
});

test("mensagem incompleta não inventa campos", () => {
  const data = parseQuickText("Hotel: Mar Azul\nMotorista: José");
  assert.equal(data.fields.hotel, "Mar Azul");
  assert.equal(data.fields.nomeMotorista, "José");
  assert.equal(data.fields.numeroVooChegada, undefined);
  assert.equal(data.fields.pago, undefined);
});

test("observação explícita entra no voucher e texto desconhecido exige conferência", () => {
  const data = parseQuickText("Observações: Precisa de cadeirinha\nAtenção especial\nHotel: Atlântico\nServiço avulso");
  assert.equal(data.notes.join(" | "), "Precisa de cadeirinha | Atenção especial");
  assert.deepEqual([...data.unrecognized], ["Serviço avulso"]);
});

test("conflitos não substituem informação silenciosamente", () => {
  const data = parseQuickText("Hotel: Mar Azul\nHotel: Mar Azul II");
  assert.equal(data.fields.hotel, "Mar Azul");
  assert.equal(data.warnings.length, 1);
});

test("não valida datas impossíveis nem as inventa", () => {
  const data = parseQuickText("Data de chegada: 31/02/2026");
  assert.equal(data.fields.dataChegada, undefined);
  assert.ok(data.warnings.length > 0);
});

test("texto de WhatsApp sem rótulos rígidos identifica cliente e hospedagem", () => {
  const client = parseQuickText("Reserva para Maria Silva.");
  assert.equal(client.clients[0].nome, "Maria Silva");
  const stay = parseQuickText("Ficaremos no Hotel Mar Azul de 15/11/2026 até 20/11/2026");
  assert.equal(stay.fields.hotel, "Hotel Mar Azul");
  assert.equal(stay.fields.dataChegada, "15/11/2026");
  assert.equal(stay.fields.dataSaida, "20/11/2026");
});

test("voo e horário sem contexto não são atribuídos ao trecho errado", () => {
  const data = parseQuickText("Voo: AD1234");
  assert.equal(data.fields.numeroVooChegada, undefined);
  assert.equal(data.fields.numeroVooPartida, undefined);
  assert.ok(data.warnings.length > 0);
});

test("voo e horário com contexto da chegada preenchem o padrão", () => {
  const data = parseQuickText("Chegada: 15/11/2026\nVoo: AD1234\nHorário: 14h30");
  assert.equal(data.fields.numeroVooChegada, "AD1234");
  assert.equal(data.fields.horaVooChegada, "14:30");
});

test("pax com adultos e crianças informa o total corretamente", () => {
  const data = parseQuickText("Pax: 2 adultos e 1 criança");
  assert.equal(data.fields.numeroPassageiros, "3");
  assert.equal(data.fields.numeroCriancas, "1");
});


test("lista com 5 viajantes, CPF e nascimento em linhas livres", () => {
  // Exemplo fictício, sem dados reais de passageiros.
  const data = parseQuickText([
    "ANA BEATRIZ ALMEIDA",
    "CPF 123.456.789-00                         07/02/1986",
    "",
    "CARLOS MARQUES DE SOUZA",
    "CPF 234.567.890-11",
    "03/03/1977",
    "",
    "RAIMUNDO COSTA DA SILVA",
    "CPF 345.678.901-22",
    "15/03/1961 – 65 anos",
    "",
    "LARA MARTINS ALMEIDA",
    "CPF 456.789.012-33                     27/03/2013 – 13 anos",
    "",
    "LUIZA ALMEIDA MARQUES DE SOUZA",
    "CPF 567.890.123-44",
    "27/03/2024 – 2 anos",
    "Saída de Maceió para Porto de galinhas",
    "Motorista Zé"
  ].join("\n"));
  assert.equal(data.clients.length, 5);
  assert.equal(data.fields.numeroPassageiros, "5");
  assert.equal(data.clients[0].nome, "ANA BEATRIZ ALMEIDA");
  assert.equal(data.clients[0].cpf, "123.456.789-00");
  assert.equal(data.clients[0].dataNascimento, "07/02/1986");
  assert.equal(data.clients[1].dataNascimento, "03/03/1977");
  assert.equal(data.clients[2].idade, "65");
  assert.equal(data.clients[3].idade, "13");
  assert.equal(data.clients[4].idade, "2");
  assert.equal(data.fields.origem, "Maceió");
  assert.equal(data.fields.destino, "Porto de galinhas");
  assert.equal(data.fields.nomeMotorista, "Zé");
  assert.equal(data.unrecognized.length, 0);
  assert.equal(data.warnings.length, 0);
});

test("reconhece nome CPF e nascimento na mesma linha sem questionário", () => {
  const data = parseQuickText("Nome: Maria Silva CPF: 123.456.789-00 07/02/1986");
  assert.equal(data.clients[0].nome, "Maria Silva");
  assert.equal(data.clients[0].cpf, "123.456.789-00");
  assert.equal(data.clients[0].dataNascimento, "07/02/1986");
});

test("não confunde deslocamento terrestre com voo de partida", () => {
  const data = parseQuickText("Saída de Maceió para Porto de Galinhas\nMotorista Zé");
  assert.equal(data.fields.origem, "Maceió");
  assert.equal(data.fields.destino, "Porto de Galinhas");
  assert.equal(data.fields.nomeMotorista, "Zé");
  assert.equal(data.fields.dataSaida, undefined);
  assert.equal(data.fields.numeroVooPartida, undefined);
});

test("mantém nascimento idade e trajeto também no modelo manual", () => {
  for (const id of ["origem", "destino", "previewOrigem", "previewDestino"]) {
    assert.ok(html.includes('id="' + id + '"'));
  }
  assert.ok(appCode.includes('["nascimento", "Data de nascimento", "date"]'));
  assert.ok(appCode.includes('["idade", "Idade (anos)", "number"]'));
  assert.ok(appCode.includes('["Nome Completo", "CPF ou RG", "Nascimento", "Idade"]'));
});
