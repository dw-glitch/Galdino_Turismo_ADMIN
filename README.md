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

**Modelo tradicional fixo:** o modo automático usa exatamente o mesmo voucher que o questionário manual, com cabeçalho, logo, tabela de clientes, informações de voo, hospedagem e transporte. Todas as seções continuam visíveis. Os campos ausentes mostram **Não informado**, mas não impedem gerar o PNG.

**Extração automática:** são reconhecidos dados com rótulos e frases comuns, como `Chegada: 10/11/2026`, `Voo de chegada: AD2046 às 14h30`, `Ficaremos no Hotel Mar Azul de 10/11/2026 até 15/11/2026`, `Pax: 2 adultos e 1 criança`, motorista, placa e contato. A extração roda localmente, sem envio a serviços externos.

**Conferência:** trechos não reconhecidos ou contraditórios ficam na seção **Trechos que precisam de conferência**, fora do voucher. Isso evita que textos avulsos sejam transformados em dados incorretos. Use o botão **Conferir / ajustar** para preencher automaticamente o formulário tradicional com o que foi identificado e corrigir somente o necessário. A seção de **Observações** no voucher é usada quando o texto identifica explicitamente observações. Dados ausentes não são inventados.

**Limite:** reconhecimento automático por regras não interpreta todo tipo de texto livre. Quando houver dúvida, a informação será sinalizada para revisão, e não atribuída arbitrariamente a um campo.

Também é possível copiar vários clientes: `Clientes: Ana Silva; João Costa`. Use um campo por linha (por exemplo, `Hotel: ...`) para obter a melhor extração possível. O interpretador usa regras locais e não depende de IA ou de envio de informações pessoais para um servidor.

## Modo manual
Clique em **Preencher manualmente** para usar o questionário tradicional. Todos os campos são opcionais. O botão **Conferir / ajustar**, no modo rápido, abre esse mesmo formulário já preenchido com os dados reconhecidos. Em ambos os modos, o PNG usa a mesma prévia e o mesmo layout.

## Exportação
O botão gera **PNG**. A biblioteca html2canvas é carregada pela CDN já utilizada anteriormente pelo projeto e, por isso, precisa estar acessível para baixar a imagem. A prévia pode ser vista sem ela.

## Desenvolvimento e testes
Sem dependências de build. Para executar testes locais, com Node.js instalado:

```bash
node --test tests/voucher-v2.test.cjs
```

Nenhum workflow do GitHub Actions é necessário para testar ou usar o app.

Os arquivos `index.html`, `styles.css`, `voucher-parser.js` e `voucher-v2.js` compõem a versão nova. O `script.js` original foi mantido apenas como referência histórica e não é mais carregado pelo site.

## Listas de passageiros sem rótulos

O modo **Colar informações** entende blocos como:
```text
ANA BEATRIZ ALMEIDA
CPF 123.456.789-00                   07/02/1986

CARLOS MARQUES DE SOUZA
CPF 234.567.890-11
03/03/1977

LARA MARTINS ALMEIDA
CPF 456.789.012-33
27/03/2013 – 13 anos

Saída de Maceió para Porto de Galinhas
Motorista Zé
```
*Os dados acima são fictícios e servem apenas como exemplos.*

O sistema associa CPF e data de nascimento ao último passageiro reconhecido, mesmo quando os dados estão separados por espaços e linhas em branco. Também entende nascimento e idade juntos, nomes maiúsculos sem "Nome:", CPF sem pontuação ou rótulo em listas de passageiros, e nome/CPF/nascimento na mesma linha.

**O voucher tradicional foi ampliado:** a tabela de clientes também mostra nascimento e idade; a seção de transporte informa origem e destino. Essas informações aparecem igualmente no formulário manual, e não são acrescentadas como texto solto. Quando o número de passageiros não é fornecido, é usado o total de pessoas identificadas. A quantidade de crianças **não é deduzida automaticamente** a partir da idade porque os critérios variam conforme o serviço.

A interpretação é local e não publica os dados colados no repositório. Trechos duvidosos seguem para conferência. Não se deve assumir que qualquer mensagem em linguagem livre será compreendida sem revisão.
