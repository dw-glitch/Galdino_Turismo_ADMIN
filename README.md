# Galdino Turismo — Emissor de Vouchers

Aplicativo estático (HTML, CSS e JavaScript) para gerar vouchers em PNG, sem cadastro e sem backend.

## Modo rápido — recomendado
1. Abra `index.html` na versão publicada do app.
2. Mantenha selecionado **Colar informações**.
3. Cole uma mensagem com os dados da viagem. A prévia é atualizada automaticamente.
4. Clique em **Gerar voucher PNG** para baixar a imagem no modelo da Galdino Turismo.

Exemplo de mensagem:

```text
Cliente: Maria Silva
CPF: 000.000.000-00
Hotel: Pousada Exemplo
Data de chegada: 10/11/2026
Voo de chegada: AD1234
Motorista: João
Observações: Transfer do aeroporto para o hotel
```

**Informações opcionais:** qualquer um dos dados de cliente, CPF/RG, datas, voos, hospedagem, pagamento ou transporte pode faltar. Se uma seção estiver vazia, ela é omitida do voucher. Linhas não reconhecidas aparecem em **Informações adicionais**, para que as informações fornecidas não sejam perdidas. O sistema **não inventa dados nem corrige informações sem confirmação**.

Também é possível copiar vários clientes: `Clientes: Ana Silva; João Costa`. Use um campo por linha (por exemplo, `Hotel: ...`) para obter a melhor extração possível. O interpretador usa regras locais e não depende de IA ou de envio de informações pessoais para um servidor.

## Modo manual
Clique em **Preencher manualmente** para usar o questionário antigo, agora com todos os campos opcionais. É necessário apenas que alguma informação esteja preenchida para emitir o voucher.

## Exportação
O botão gera **PNG**. A biblioteca html2canvas é carregada pela CDN já utilizada anteriormente pelo projeto e, por isso, precisa estar acessível para baixar a imagem. A prévia pode ser vista sem ela.

## Desenvolvimento e testes
Sem dependências de build. Para executar testes locais, com Node.js instalado:

```bash
node --test tests/voucher-v2.test.cjs
```

Nenhum workflow do GitHub Actions é necessário para testar ou usar o app.

Os arquivos `index.html`, `styles.css` e `voucher-v2.js` compõem a versão nova. O `script.js` original foi mantido apenas como referência histórica e não é mais carregado pelo site.
