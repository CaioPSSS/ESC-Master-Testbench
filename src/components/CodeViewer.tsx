import { Copy, Check, ChevronDown, ChevronUp, Radio, Cpu } from 'lucide-react';
import { useState } from 'react';

const ESP32_BRIDGE_CODE = `
/*
 * ESC Master Testbench — Transmissor / Bridge (ESP32)
 * Faz a ponte entre o Dashboard (Web Serial USB) e o Arduino remoto (LoRa)
 *
 * Módulo LoRa: SX1278 Ra-02 433MHz
 * Biblioteca: LoRa.h (Sandeep Mistry)
 * Pinagem SPI (VSPI):
 *   NSS  = GPIO 5
 *   RST  = GPIO 14
 *   DIO0 = GPIO 2
 *   SCK  = GPIO 18   (default VSPI)
 *   MISO = GPIO 19   (default VSPI)
 *   MOSI = GPIO 23   (default VSPI)
 *
 * O ESP32 recebe comandos via Serial USB (ex: "45\\n")
 * e os repassa via LoRa para o Arduino remoto.
 * Também recebe telemetria LoRa do Arduino e a imprime
 * no Serial para o Dashboard React ler via Web Serial.
 */

#include <SPI.h>
#include <LoRa.h>

// Pinos SPI do LoRa no ESP32 (VSPI)
#define LORA_NSS   5
#define LORA_RST   14
#define LORA_DIO0  2

#define LORA_FREQ  433E6  // 433 MHz (ajuste para sua região)

void setup() {
  Serial.begin(115200);
  while (!Serial);

  // Configura pinos do LoRa
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("ERRO: Falha ao inicializar LoRa!");
    while (1);
  }

  // Configurações do rádio
  LoRa.setTxPower(17);           // 17 dBm
  LoRa.setSpreadingFactor(7);    // SF7 — menor latência
  LoRa.setSignalBandwidth(250E3); // 250kHz — bom throughput
  LoRa.setCodingRate4(5);         // 4/5

  Serial.println("ESP32 LoRa Bridge pronto.");
}

void loop() {
  // === 1. PC -> ESP32 (Serial USB) -> LoRa (para o Arduino) ===
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    if (cmd.length() > 0) {
      LoRa.beginPacket();
      LoRa.print(cmd);
      LoRa.endPacket();
    }
  }

  // === 2. LoRa (do Arduino) -> ESP32 -> PC (Serial USB) ===
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    String incoming = "";
    while (LoRa.available()) {
      incoming += (char)LoRa.read();
    }

    // Lê métricas de qualidade do rádio deste pacote recebido
    int rssi = LoRa.packetRssi();    // Potência do sinal (dBm)
    float snr = LoRa.packetSnr();    // Relação sinal-ruído (dB)

    // Anexa RSSI e SNR à telemetria antes de enviar ao PC
    // Ex: "T:V=7.80,P=50,S=OK,AR=-52" -> "T:V=7.80,P=50,S=OK,AR=-52,R=-45,N=9.5"
    incoming += ",R=" + String(rssi) + ",N=" + String(snr, 1);

    Serial.println(incoming);
  }
}
`.trim();

const ARDUINO_REMOTE_CODE = `
/*
 * ESC Master Testbench — Receptor Remoto (Arduino Uno)
 * Recebe comandos de throttle via LoRa e controla o ESC
 * Envia telemetria da bateria 2S de volta via LoRa
 *
 * Módulo LoRa: SX1278 Ra-02 433MHz
 * Biblioteca: LoRa.h (Sandeep Mistry)
 * Pinagem SPI:
 *   NSS  = D10
 *   RST  = D9
 *   DIO0 = D2
 *   SCK  = D13  (SPI padrão)
 *   MISO = D12  (SPI padrão)
 *   MOSI = D11  (SPI padrão)
 *
 * ATENÇÃO: O pino PWM do ESC mudou de D9 para D6,
 * pois D9 agora é usado pelo LoRa (NRESET).
 *
 * Bateria: 2x 18650 3000mAh 3.7V 30A Liitokala (Série 2S)
 * Tensão Nominal: 7.4V | Carga Máx: 8.4V
 * Proteção de Subtensão via Código (Corte de Software ~6.0V)
 * Conexão do Sinal: Pino 6 (PWM) | Sensor: Pino A0 (Divisor R1=R2)
 */

#include <SPI.h>
#include <LoRa.h>
#include <Servo.h>

// Pinos do LoRa no Arduino Uno
#define LORA_NSS   10
#define LORA_RST   9
#define LORA_DIO0  2

#define LORA_FREQ  433E6  // 433 MHz (deve ser igual ao ESP32)

Servo esc;
const int escPin = 6;      // Pino PWM (mudou de D9 para D6 por causa do LoRa)
const int voltagePin = A0;

// Configuração do Divisor de Tensão
// Se R1 e R2 forem iguais (ex: 8k/8k ou 10k/10k), a tensão é dividida por 2. (Fator = 2.0)
const float voltageDividerFactor = 2.0;
const float referenceVoltage = 5.0; // Tensão de operação do Arduino (5V)

int throttle = 0; // 0 a 100 (%)
int lastCmdRssi = 0; // RSSI do último comando recebido do ESP32
unsigned long lastTelemetryTime = 0;
unsigned long lastVoltageReadTime = 0;
unsigned long lastCommandTime = 0; // Failsafe: última vez que recebeu comando LoRa
const unsigned long FAILSAFE_TIMEOUT = 2000; // 2 segundos sem comando = motor para
float filteredVoltage = 0.0;
bool firstRead = true;
bool failsafeActive = false;

void setup() {
  Serial.begin(115200); // Debug local (opcional)

  // Inicializa LoRa
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("ERRO: Falha ao inicializar LoRa!");
    while (1);
  }

  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(250E3);
  LoRa.setCodingRate4(5);

  // Inicializa ESC
  esc.attach(escPin, 1000, 2000);

  // Arming do ESC (1000us)
  esc.writeMicroseconds(1000);
  delay(2000);

  Serial.println("Arduino LoRa Remoto pronto. 2S Li-ion (Com Telemetria).");
  lastCommandTime = millis(); // Inicializa o timer do failsafe
}

void loop() {
  // 1. Leitura e Filtragem Anti-Sag Extremamente Lenta (A cada 20ms)
  if (millis() - lastVoltageReadTime >= 20) {
    int sensorValue = analogRead(voltagePin);
    float pinVoltage = (sensorValue / 1023.0) * referenceVoltage;
    float currentVoltage = pinVoltage * voltageDividerFactor;

    if (firstRead) {
      filteredVoltage = currentVoltage;
      firstRead = false;
    } else {
      // Usamos um filtro simplificado, mas variamos a velocidade de resposta
      float alpha;
      if (throttle == 0) {
        // Motor parado: atualiza relativamente rápido (aprox 1 segundo para estabilizar)
        alpha = 0.05;
      } else {
        // Motor sob carga: Bateria sofre Sag. Atualizamos a média MUITO devagar.
        // Assim a tensão refletida não cai instantaneamente (anti-sag),
        // mas continua a cair caso a bateria descarregue de verdade ao longo dos minutos.
        alpha = 0.0002;
      }
      filteredVoltage = (filteredVoltage * (1.0 - alpha)) + (currentVoltage * alpha);
    }
    lastVoltageReadTime = millis();
  }

  float batteryVoltage = filteredVoltage;

  // 2. Estimativa de Porcentagem 2S (Min 6.0V, Max 8.4V)
  int batteryPercent = map(batteryVoltage * 100, 600, 840, 0, 100);
  batteryPercent = constrain(batteryPercent, 0, 100);

  // 3. Status de Segurança
  bool isBatteryLow = batteryVoltage < 6.0;

  // === FAILSAFE: Desliga motor se perder conexão LoRa ===
  if (throttle > 0 && (millis() - lastCommandTime > FAILSAFE_TIMEOUT)) {
    throttle = 0;
    esc.writeMicroseconds(1000);
    failsafeActive = true;
  } else if (millis() - lastCommandTime <= FAILSAFE_TIMEOUT) {
    failsafeActive = false;
  }

  String status;
  if (failsafeActive) {
    status = "FAILSAFE";
  } else if (isBatteryLow) {
    status = "ERROR_BATTERY";
  } else {
    status = "OK";
  }

  // 4. Envio de Telemetria via LoRa (a cada 500ms)
  if (millis() - lastTelemetryTime > 500) {
    String telemetry = "T:V=";
    telemetry += String(batteryVoltage, 2);
    telemetry += ",P=";
    telemetry += String(batteryPercent);
    telemetry += ",S=";
    telemetry += status;
    telemetry += ",AR=";
    telemetry += String(lastCmdRssi); // RSSI do sinal ESP32->Arduino

    LoRa.beginPacket();
    LoRa.print(telemetry);
    LoRa.endPacket();

    // Debug local (opcional)
    Serial.println(telemetry);

    lastTelemetryTime = millis();
  }

  // 5. Recebimento de Comandos via LoRa
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    String input = "";
    while (LoRa.available()) {
      input += (char)LoRa.read();
    }
    input.trim();

    // Guarda o RSSI do comando recebido (sinal ESP32 -> Arduino)
    lastCmdRssi = LoRa.packetRssi();
    lastCommandTime = millis(); // Reseta o timer do failsafe

    // Rotina de Calibração: Usada se o ESC não reconhecer a faixa do acelerador
    if (input == "CALIBRATE") {
      // Envia feedback via LoRa
      LoRa.beginPacket();
      LoRa.print("T:V=0.00,P=0,S=CALIBRATING");
      LoRa.endPacket();

      esc.writeMicroseconds(2000); // Manda o pulso máximo
      delay(8000); // 8 segundos para o usuário plugar a bateria e ouvir os bips
      esc.writeMicroseconds(1000); // Retorna ao mínimo para confirmar

      LoRa.beginPacket();
      LoRa.print("T:V=0.00,P=0,S=CAL_DONE");
      LoRa.endPacket();
    } else {
      throttle = constrain(input.toInt(), 0, 100);

      // Proteção de Subtensão (Desliga o motor se a bateria estiver crítica)
      if (isBatteryLow) {
        throttle = 0;
      }

      int pwmValue = 1000;
      if (throttle > 0) {
        // Mapeia 1 a 100 para 1040 a 2000us para compensar ESCs de baixa qualidade
        // que têm zona morta no início (ex: só começam a girar depois de 4%).
        pwmValue = map(throttle, 1, 100, 1040, 2000);
      }

      esc.writeMicroseconds(pwmValue);
    }
  }
}
`.trim();

export function CodeViewer() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'esp32' | 'arduino'>('esp32');

  const currentCode = activeTab === 'esp32' ? ESP32_BRIDGE_CODE : ARDUINO_REMOTE_CODE;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex justify-between items-start">
        <div>
          <h2 className="text-sm font-bold text-white mb-1 uppercase tracking-tight flex items-center gap-2">
            Código dos Microcontroladores
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed italic pr-4">
            Arquitetura wireless: ESP32 Bridge (USB↔LoRa) + Arduino Remoto (LoRa↔ESC). Filtro anti-sag, telemetria 2S Li-ion e compensação de zona morta preservados.
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-600 font-bold uppercase tracking-wider ml-4 cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'COPIADO' : 'COPIAR'}
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex mb-3 gap-1 shrink-0">
        <button
          onClick={() => { setActiveTab('esp32'); setCopied(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-[11px] font-bold uppercase tracking-wider transition-colors border border-b-0 cursor-pointer ${
            activeTab === 'esp32'
              ? 'bg-[#011627] text-amber-400 border-slate-700'
              : 'bg-slate-800/50 text-slate-500 border-slate-800 hover:text-slate-350'
          }`}
        >
          <Radio className="w-3 h-3" />
          Transmissor (ESP32 Bridge)
        </button>
        <button
          onClick={() => { setActiveTab('arduino'); setCopied(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-[11px] font-bold uppercase tracking-wider transition-colors border border-b-0 cursor-pointer ${
            activeTab === 'arduino'
              ? 'bg-[#011627] text-emerald-400 border-slate-700'
              : 'bg-slate-800/50 text-slate-500 border-slate-800 hover:text-slate-350'
          }`}
        >
          <Cpu className="w-3 h-3" />
          Receptor (Arduino Remoto)
        </button>
      </div>

      {/* Code Snippet Visual */}
      <div className="bg-[#011627] rounded-b-lg rounded-tr-lg p-5 font-mono text-[11px] leading-relaxed border border-slate-700 shadow-2xl overflow-y-auto flex-1 mb-4 min-h-[250px]">
        <div className="flex gap-1.5 mb-4 sticky top-0 bg-[#011627] pb-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
          <span className="ml-3 text-[10px] text-slate-600 font-sans">
            {activeTab === 'esp32' ? 'esp32_lora_bridge.ino' : 'arduino_lora_remote.ino'}
          </span>
        </div>
        <pre className="text-cyan-300">
          <code>{currentCode}</code>
        </pre>
      </div>

      {/* Connection Diagram — Updated for LoRa architecture */}
      <div className="border-t border-slate-800 pt-4 shrink-0">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Diagrama da Arquitetura Wireless</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-16 h-5 bg-slate-700 border border-slate-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">PC/USB</div>
            <div className="flex-1 h-px bg-slate-700 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 italic whitespace-nowrap">Web Serial 115200</div>
            </div>
            <div className="w-16 h-5 bg-amber-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESP32</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-16 h-5 bg-amber-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESP32</div>
            <div className="flex-1 h-px bg-amber-500/30 relative border-t border-dashed border-amber-500/50">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-amber-500 italic whitespace-nowrap">~~~ LoRa 433MHz ~~~</div>
            </div>
            <div className="w-16 h-5 bg-emerald-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">Arduino</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-16 h-5 bg-emerald-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">Arduino</div>
            <div className="flex-1 h-px bg-slate-700 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 italic whitespace-nowrap">PWM Pino 6</div>
            </div>
            <div className="w-16 h-5 bg-rose-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESC</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-16 h-5 bg-red-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">VCC</div>
            <div className="flex-1 h-px bg-slate-700 relative">
              <div className="absolute -top-3 left-0 text-[9px] text-slate-500 italic">2S 18650 (7.4V)</div>
            </div>
            <div className="text-[9px] text-slate-400">ESC + A0 (Divisor)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
