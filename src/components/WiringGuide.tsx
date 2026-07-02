import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function WiringGuide() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-slate-900/40 backdrop-blur-md rounded-xl p-5 border border-slate-800/80 transition-all duration-300 space-y-4">
      <div 
        className="flex justify-between items-center cursor-pointer" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            Guia de Conexão Física e Segurança (BLE + LoRa)
            {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">Especificações de hardware, Web Bluetooth, pinagem SPI dos módulos LoRa e diagrama de fios.</p>
        </div>
      </div>
      
      {isExpanded && (
        <div className="space-y-6">
          {/* Hardware Specs Table */}
          <div>
            <div className="grid grid-cols-2 gap-px bg-slate-800 border border-slate-800 rounded-lg overflow-hidden">
              <div className="bg-slate-900 p-3 flex justify-between">
                <span className="text-xs text-slate-500">Motor</span>
                <span className="text-xs text-slate-200">A2212 1000KV</span>
              </div>
              <div className="bg-slate-900 p-3 flex justify-between">
                <span className="text-xs text-slate-500">Bateria (Pack)</span>
                <span className="text-xs text-slate-200">2x 18650 Liitokala 30A</span>
              </div>
              <div className="bg-slate-900 p-3 flex justify-between">
                <span className="text-xs text-slate-500">Tensão 2S (Série)</span>
                <span className="text-xs text-slate-200">7.4V Nom. / 8.4V Máx.</span>
              </div>
              <div className="bg-slate-900 p-3 flex justify-between">
                <span className="text-xs text-slate-500">BMS e Cut-off</span>
                <span className="text-xs text-slate-200">Obrigatório BMS 2S (6.0V)</span>
              </div>
              <div className="bg-slate-900 p-3 flex justify-between">
                <span className="text-xs text-slate-500">Módulo LoRa (×2)</span>
                <span className="text-xs text-amber-400">SX1278 Ra-02 433MHz</span>
              </div>
              <div className="bg-slate-900 p-3 flex justify-between">
                <span className="text-xs text-slate-500">MCU Bridge</span>
                <span className="text-xs text-amber-400">ESP32 DevKit V1</span>
              </div>
              <div className="bg-slate-900 p-3 flex justify-between">
                <span className="text-xs text-slate-500">MCU Remoto</span>
                <span className="text-xs text-emerald-400">Arduino Uno</span>
              </div>
              <div className="bg-slate-900 p-3 flex justify-between">
                <span className="text-xs text-slate-500">Servos (Elevons)</span>
                <span className="text-xs text-cyan-400">2x Micro Servos (Pinos 3 e 5)</span>
              </div>
              <div className="bg-slate-900 p-3 flex justify-between">
                <span className="text-xs text-slate-500">Comunicação</span>
                <span className="text-xs text-blue-400">Bluetooth BLE + LoRa</span>
              </div>
            </div>
          </div>

          {/* BLE Connection Info */}
          <div>
            <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-2">Conexão Bluetooth — Web Bluetooth API</h4>
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="grid grid-cols-2 gap-px bg-slate-800">
                <div className="bg-slate-800/80 p-2 text-center"><span className="text-[10px] font-bold text-slate-400">PARÂMETRO</span></div>
                <div className="bg-slate-800/80 p-2 text-center"><span className="text-[10px] font-bold text-slate-400">VALOR</span></div>
                
                <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">Nome do Dispositivo</span></div>
                <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-blue-400 font-mono font-bold">ESC-TestBench-BLE</span></div>
                
                <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">Serviço (UUID)</span></div>
                <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-blue-400 font-mono font-bold">Nordic UART</span></div>
                
                <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">Compatibilidade</span></div>
                <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-blue-400 font-mono">Chrome / Edge (PC e Android)</span></div>
              </div>
            </div>
          </div>

          {/* SPI Pinout Tables */}
          <div className="space-y-4">
            {/* ESP32 SPI Pinout */}
            <div>
              <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2">Pinagem SPI — ESP32 Bridge ↔ LoRa SX1278</h4>
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <div className="grid grid-cols-2 gap-px bg-slate-800">
                  <div className="bg-slate-800/80 p-2 text-center"><span className="text-[10px] font-bold text-slate-400">PINO LORA</span></div>
                  <div className="bg-slate-800/80 p-2 text-center"><span className="text-[10px] font-bold text-slate-400">PINO ESP32</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">NSS (CS)</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-amber-400 font-mono">GPIO 5</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">NRESET</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-amber-400 font-mono">GPIO 14</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">DIO0</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-amber-400 font-mono">GPIO 2</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">SCK</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-amber-400 font-mono">GPIO 18</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">MISO</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-amber-400 font-mono">GPIO 19</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">MOSI</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-amber-400 font-mono">GPIO 23</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">VCC</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-red-400 font-mono">3.3V</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">GND</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-500 font-mono">GND</span></div>
                </div>
              </div>
            </div>

            {/* Arduino Uno SPI Pinout */}
            <div>
              <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">Pinagem SPI — Arduino Uno ↔ LoRa SX1278</h4>
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <div className="grid grid-cols-2 gap-px bg-slate-800">
                  <div className="bg-slate-800/80 p-2 text-center"><span className="text-[10px] font-bold text-slate-400">PINO LORA</span></div>
                  <div className="bg-slate-800/80 p-2 text-center"><span className="text-[10px] font-bold text-slate-400">PINO ARDUINO</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">NSS (CS)</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-emerald-400 font-mono">D10</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">NRESET</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-emerald-400 font-mono">D9</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">DIO0</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-emerald-400 font-mono">D2</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">SCK</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-emerald-400 font-mono">D13</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">MISO</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-emerald-400 font-mono">D12</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">MOSI</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-emerald-400 font-mono">D11</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">VCC</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-red-400 font-mono">3.3V</span></div>
                  
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-300">GND</span></div>
                  <div className="bg-slate-900 p-2 text-center"><span className="text-[11px] text-slate-500 font-mono">GND</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Wiring Instructions (Textual) */}
          <div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-cyan-400 uppercase">1. Conectar ao Dashboard (Bluetooth BLE)</span>
                <span className="text-xs text-slate-400 mt-1">Ligue o ESP32. Ele não criará rede WiFi. Apenas abra o Dashboard no seu navegador (Chrome/Edge), clique em <strong>"CONECTAR BLUETOOTH"</strong> e selecione <strong>"ESC-TestBench-BLE"</strong>. O pareamento ocorre diretamente por Bluetooth de baixo consumo, poupando energia do microcontrolador e garantindo que você não perca o acesso à internet.</span>
              </div>
              <div className="flex flex-col border-t border-slate-800 pt-4 mt-2">
                <span className="text-[10px] font-bold text-amber-500 uppercase">2. ESP32 Bridge (Lado BLE + LoRa)</span>
                <span className="text-xs text-slate-400 mt-1">O módulo LoRa SX1278 é ligado ao ESP32 via SPI (veja a tabela de pinagem acima). O ESP32 atua como ponte: recebe comandos do Dashboard via Bluetooth (BLE) e os retransmite via LoRa para o Arduino remoto. Recebe telemetria LoRa e a envia de volta por Bluetooth Notify. <strong>Não precisa mais de cabo USB no notebook!</strong></span>
              </div>
              <div className="flex flex-col border-t border-slate-800 pt-4 mt-2">
                <span className="text-[10px] font-bold text-emerald-500 uppercase">3. Arduino Remoto (Lado do Motor e Servos)</span>
                <span className="text-xs text-slate-400 mt-1">Conecte o módulo LoRa SX1278 ao Arduino Uno via SPI (veja a tabela acima). O fio de sinal PWM do ESC (Amarelo) vai no <strong>Pino 6</strong> (o Pino 9 é usado pelo LoRa NRESET). Os <strong>Servos dos Elevons</strong> vão nos <strong>Pinos 3 (Esquerdo) e 5 (Direito)</strong>. O GND do Arduino deve ser comum ao GND do ESC e dos servos. Se o Arduino for alimentado pela bateria (via regulador), o BEC do ESC pode ser desconectado.</span>
              </div>
              <div className="flex flex-col border-t border-slate-800 pt-4 mt-2">
                <span className="text-[10px] font-bold text-rose-500 uppercase">4. Atenção: Alimentação do LoRa</span>
                <span className="text-xs text-slate-400 mt-1">Os módulos LoRa SX1278 operam em <strong>3.3V</strong>. <strong>NUNCA</strong> alimente o VCC do LoRa com 5V, ou o módulo será danificado permanentemente. No Arduino Uno, use o pino <strong>3.3V</strong> (corrente limitada, mas suficiente para o SX1278). No ESP32, use o pino <strong>3.3V</strong> nativo. <strong>Nunca transmita sem uma antena conectada</strong> ao módulo LoRa.</span>
              </div>
              <div className="flex flex-col border-t border-slate-800 pt-4 mt-2">
                <span className="text-[10px] font-bold text-amber-500 uppercase">5. Bateria 2S 18650 (Série)</span>
                <span className="text-xs text-slate-400 mt-1">Solde as duas células Liitokala 3000mAh em <strong>Série (2S)</strong>, gerando 7.4V. É essencial o uso de um módulo <strong>BMS 2S</strong> acoplado ao pack para garantir balanceamento e proteger contra subtensão (corte de Li-ion em ~3.0V/célula).</span>
              </div>
              <div className="flex flex-col border-t border-slate-800 pt-4 mt-2">
                <span className="text-[10px] font-bold text-rose-500 uppercase">6. Precauções de Teste</span>
                <span className="text-xs text-slate-400 mt-1">Recomenda-se adicionar um fusível de 30A a 40A na linha positiva (+). Nunca solde diretamente nas células se não tiver experiência. <strong>Remova a hélice do motor A2212</strong> antes de qualquer teste na bancada.</span>
              </div>
              <div className="flex flex-col border-t border-slate-800 pt-4 mt-2">
                <span className="text-[10px] font-bold text-cyan-400 uppercase">7. Como Inverter a Rotação? (Fios vs Código)</span>
                <span className="text-xs text-slate-400 mt-1">Para motores brushless e ESCs de aeromodelismo padrão, a reversão de giro <strong>NÃO é feita por código</strong>. O sinal PWM apenas controla a velocidade (0 a 100%). Para inverter o sentido que o motor gira, você deve <strong>trocar de posição quaisquer dois dos três fios grossos</strong> que ligam o ESC ao motor.</span>
              </div>
              <div className="flex flex-col border-t border-slate-800 pt-4 mt-2">
                <span className="text-[10px] font-bold text-amber-500 uppercase">8. A velocidade não aumenta depois de uma certa %? (Calibração)</span>
                <span className="text-xs text-slate-400 mt-1">Se você perceber que o motor atinge a velocidade máxima antes de chegar a 100% no controle (por exemplo, ele para de acelerar em 70%), <strong>NÃO HÁ ERRO NO CÓDIGO</strong>. Isso acontece porque o seu ESC veio de fábrica configurado com limites diferentes (ex: acha que o máximo é 1500µs em vez de 2000µs). <strong>Para resolver, use o botão "CALIBRAR 2S"</strong> (desconecte a bateria, clique no botão, ligue a bateria no ESC nos próximos 8 segundos, aguarde os bips confirmarem e pronto).</span>
              </div>
              <div className="flex flex-col border-t border-slate-800 pt-4 mt-2">
                <span className="text-[10px] font-bold text-emerald-500 uppercase">9. Leitura de Voltagem e Proteção (Telemetria)</span>
                <span className="text-xs text-slate-400 mt-1">Para o Arduino ler a bateria (máx 8.4V), <strong>nunca ligue a bateria direto no pino A0</strong>, pois o Arduino só suporta 5V. Use um <strong>Divisor de Tensão</strong> com dois resistores de 10kΩ (serve 8kΩ, 22kΩ, etc. <strong>desde que R1 e R2 sejam iguais</strong>): ligue R1 no Positivo da bateria e R2 no GND. O ponto entre R1 e R2 vai no pino A0. O código divide a tensão pela metade (x2), envia a telemetria via LoRa e corta o motor se a tensão cair de 6.0V.</span>
              </div>
              <div className="flex flex-col border-t border-slate-800 pt-4 mt-2">
                <span className="text-[10px] font-bold text-cyan-400 uppercase">10. Execução Local e Hospedagem</span>
                <span className="text-xs text-slate-400 mt-1">Como estamos usando Web Bluetooth, o ESP32 não hospeda mais o site. Você pode rodar o site localmente no PC executando <strong>npm run dev</strong>, ou hospedar a pasta gerada pelo <strong>npm run build</strong> gratuitamente no GitHub Pages, Vercel ou Netlify para acessá-lo facilmente do seu celular Android por HTTPS.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
