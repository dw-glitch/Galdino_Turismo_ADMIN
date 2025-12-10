let clientIndex = 0;

function addClient() {
    const container = document.getElementById('clientsContainer');
    const clientDiv = document.createElement('div');
    clientDiv.className = 'client-entry';
    clientDiv.innerHTML = `
        <div class="form-group">
            <label for="nome${clientIndex}">Nome:</label>
            <input type="text" id="nome${clientIndex}" name="nome${clientIndex}" required>
        </div>
        <div class="form-group">
            <label for="cpf${clientIndex}">CPF ou RG:</label>
            <input type="text" id="cpf${clientIndex}" name="cpf${clientIndex}" required>
        </div>
        <button type="button" class="remove-client" onclick="removeClient(this)">Remover</button>
    `;
    container.appendChild(clientDiv);
    clientIndex++;
}

function removeClient(button) {
    button.parentElement.remove();
}

document.getElementById('addClientBtn').addEventListener('click', addClient);

// Add initial client
addClient();

document.getElementById('generatePDF').addEventListener('click', async function() {
  const form = document.getElementById('voucherForm');
  if (!form.checkValidity()) {
    alert('Por favor, preencha todos os campos obrigatórios.');
    return;
  }

  // Preenche preview
  const clientsList = [];
  const clientEntries = document.querySelectorAll('.client-entry');
  clientEntries.forEach((entry) => {
    const nomeInput = entry.querySelector('input[name^="nome"]');
    const cpfInput = entry.querySelector('input[name^="cpf"]');
    if (nomeInput && cpfInput) {
      const nome = nomeInput.value;
      const cpf = cpfInput.value;
      clientsList.push({ nome, cpf });
    }
  });
  const previewClients = document.getElementById('previewClients');
  if (clientsList.length > 0) {
    previewClients.innerHTML = `
      <table class="clients-table">
        <thead>
          <tr>
            <th>Nome Completo</th>
            <th>CPF ou RG</th>
          </tr>
        </thead>
        <tbody>
          ${clientsList.map(client => `
            <tr>
              <td>${client.nome}</td>
              <td>${client.cpf}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    previewClients.innerHTML = '<p>Nenhum cliente adicionado.</p>';
  }

  document.getElementById('previewPassageiros').textContent = document.getElementById('numeroPassageiros').value;
  document.getElementById('previewCriancas').textContent = document.getElementById('numeroCriancas').value;
  
  // Formata datas para o padrão brasileiro
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
  };
  
  document.getElementById('previewDataChegada').textContent = formatDate(document.getElementById('dataChegada').value);
  document.getElementById('previewVooChegada').textContent = document.getElementById('numeroVooChegada').value;
  document.getElementById('previewHoraVooChegada').textContent = document.getElementById('horaVooChegada').value;
  document.getElementById('previewDataSaida').textContent = formatDate(document.getElementById('dataSaida').value);
  document.getElementById('previewVooPartida').textContent = document.getElementById('numeroVooPartida').value;
  document.getElementById('previewHoraVooPartida').textContent = document.getElementById('horaVooPartida').value;
  document.getElementById('previewHotel').textContent = document.getElementById('hotel').value;
  document.getElementById('previewPago').textContent = document.getElementById('pago').value;
  
  // Adiciona informações do transporte
  document.getElementById('previewNomeMotorista').textContent = document.getElementById('nomeMotorista').value;
  document.getElementById('previewPlacaCarro').textContent = document.getElementById('placaCarro').value;
  document.getElementById('previewTelefoneMotorista').textContent = document.getElementById('telefoneMotorista').value;

  // Data de emissão
  const hoje = new Date();
  document.getElementById('previewDataEmissao').textContent = hoje.toLocaleDateString('pt-BR');

  const preview = document.getElementById('voucherPreview');
  preview.style.display = 'block';

  // Espera assets
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const imgs = Array.from(preview.querySelectorAll('img'));
  await Promise.all(imgs.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(res => { img.onload = res; img.onerror = res; });
  }));

  // Info debug básica
  const rect = preview.getBoundingClientRect();
  console.log('DEBUG: voucherPreview rect:', rect);
  console.log('DEBUG: computed style display:', getComputedStyle(preview).display);
  console.log('DEBUG: images list:', imgs.map(i => ({ src: i.src, complete: i.complete, naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight })));

  try {
    // Define tamanho fixo para o voucher
    const voucherWidth = 800;
    const voucherHeight = 1000; // Aumentado para acomodar todo o conteúdo

    // Cria um container temporário com dimensões fixas
    const tempContainer = document.createElement('div');
    tempContainer.style.width = voucherWidth + 'px';
    tempContainer.style.minHeight = voucherHeight + 'px';
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.style.backgroundColor = 'white';
    tempContainer.style.padding = '20px';
    tempContainer.style.boxSizing = 'border-box';
    tempContainer.innerHTML = preview.innerHTML;

    // Copia os estilos essenciais do preview original
    tempContainer.style.fontFamily = getComputedStyle(preview).fontFamily;
    tempContainer.style.fontSize = '14px';
    tempContainer.style.lineHeight = '1.4';
    tempContainer.style.color = '#333';

    document.body.appendChild(tempContainer);

    const canvas = await html2canvas(tempContainer, {
      useCORS: true,
      allowTaint: false,
      scale: 1.5, // Reduzido para melhor qualidade
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: voucherWidth,
      windowHeight: voucherHeight
    });

    document.body.removeChild(tempContainer);

    // Remove canvas de debug anterior se existir
    const oldCanvas = document.getElementById('debug_canvas_voucher');
    if (oldCanvas) {
      oldCanvas.remove();
    }

    // checa pixels do canto
    const ctx = canvas.getContext('2d');
    const w = Math.max(1, Math.min(10, canvas.width)), h = Math.max(1, Math.min(10, canvas.height));
    const data = ctx.getImageData(0, 0, w, h).data;
    const allZero = data.every(v => v === 0);
    console.log('DEBUG: primeira amostra de pixels (len):', data.length, 'allZero?', allZero);

    if (allZero) {
      throw new Error('Canvas aparentemente vazio (pixels iniciais todos 0).');
    }

    // Converte para PNG e faz download
    const imgData = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'voucher_galdino_turismo.png';
    link.href = imgData;
    link.click();

    console.log('PNG gerado com sucesso via html2canvas');

  } catch (err) {
    // Log do erro
    console.error('Erro na geração PNG:', err);

    // Método direto com dimensões fixas
    const voucherWidth = 800;
    const voucherHeight = 1000; // Aumentado para acomodar todo o conteúdo

    const tempContainer = document.createElement('div');
    tempContainer.style.width = voucherWidth + 'px';
    tempContainer.style.minHeight = voucherHeight + 'px';
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.style.backgroundColor = 'white';
    tempContainer.style.padding = '20px';
    tempContainer.style.boxSizing = 'border-box';
    tempContainer.innerHTML = preview.innerHTML;

    tempContainer.style.fontFamily = getComputedStyle(preview).fontFamily;
    tempContainer.style.fontSize = '14px';
    tempContainer.style.lineHeight = '1.4';
    tempContainer.style.color = '#333';

    document.body.appendChild(tempContainer);

    const canvas = await html2canvas(tempContainer, {
      useCORS: true,
      allowTaint: true,
      scale: 1.5,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: voucherWidth,
      windowHeight: voucherHeight
    });

    document.body.removeChild(tempContainer);

    const imgData = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'voucher_galdino_turismo.png';
    link.href = imgData;
    link.click();
    console.log('PNG gerado com sucesso.');
  }
});
