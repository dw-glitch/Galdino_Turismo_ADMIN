// Executar localmente: node --test tests/voucher-v2.test.cjs
// Usa somente bibliotecas padrão do Node; não ativa GitHub Actions.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.join(__dirname, "..", "voucher-v2.js"), "utf8");
const context = {
  window: {},
  document: { addEventListener() {} }
};
vm.runInNewContext(code, context);
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
  assert.equal(data.notes.join(" | "), "Viagem especial | Cadeira infantil necessária");
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
