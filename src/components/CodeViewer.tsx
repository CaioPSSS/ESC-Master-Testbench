import { Copy, Check, ChevronDown, ChevronUp, Radio, Cpu } from 'lucide-react';
import { useState } from 'react';

const ESP32_BRIDGE_CODE = `\n/*
 * ESC Master Testbench — Bridge BLE + LoRa (ESP32)
 * O ESP32 atua como um servidor Bluetooth Low Energy (BLE)
 * usando o protocolo padrão UART.
 * Comandos recebidos via BLE são retransmitidos via LoRa
 * para o Arduino remoto, e a telemetria LoRa recebida é
 * enviada de volta por BLE Notify.
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
 */

#include <SPI.h>
#include <LoRa.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ========================
// Pinos SPI do LoRa (VSPI)
// ========================
#define LORA_NSS   5
#define LORA_RST   14
#define LORA_DIO0  2

#define LORA_FREQ  433E6  // 433 MHz

bool hasLoRa = false;

// ========================
// Configuração BLE UART
// ========================
BLEServer *pServer = NULL;
BLECharacteristic *pTxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// UUIDs padrão Nordic UART
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("[BLE] Dispositivo conectado!");
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("[BLE] Dispositivo desconectado!");
    }
};

// Globais para thread-safety (Comunicação entre Task BLE e Task Loop)
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
String pendingCommand = "";
bool hasPendingCommand = false;

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string rxValue = pCharacteristic->getValue();

      if (rxValue.length() > 0) {
        String cmd = rxValue.c_str();
        cmd.trim();
        
        if (cmd.length() > 0 && hasLoRa) {
          portENTER_CRITICAL(&mux);
          pendingCommand = cmd;
          hasPendingCommand = true;
          portEXIT_CRITICAL(&mux);
        }
      }
    }
};

void setup() {
  Serial.begin(115200);
  delay(500);

  // 1. Inicializa LoRa
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("ERRO: Falha LoRa! Verifique as conexões SPI.");
    hasLoRa = false;
  } else {
    LoRa.setTxPower(17);
    LoRa.setSpreadingFactor(7);
    LoRa.setSignalBandwidth(250E3);
    LoRa.setCodingRate4(5);
    Serial.println("[OK] LoRa inicializado.");
    hasLoRa = true;
  }

  // 2. Inicialização BLE
  BLEDevice::init("ESC-TestBench-BLE");
  
  // Opcional: Aumenta a potência do BLE para +9dBm (máximo do ESP32)
  BLEDevice::setPower(ESP_PWR_LVL_P9);

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pTxCharacteristic = pService->createCharacteristic(
                        CHARACTERISTIC_UUID_TX,
                        BLECharacteristic::PROPERTY_NOTIFY
                      );
                      
  pTxCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
                        CHARACTERISTIC_UUID_RX,
                        BLECharacteristic::PROPERTY_WRITE |
                        BLECharacteristic::PROPERTY_WRITE_NR
                      );

  pRxCharacteristic->setCallbacks(new MyCallbacks());

  pService->start();

  pServer->getAdvertising()->addServiceUUID(SERVICE_UUID);
  pServer->getAdvertising()->start();
  
  Serial.println("[BLE] Aguardando conexão do Dashboard (ESC-TestBench-BLE)...");
}

void loop() {
  static unsigned long lastTxTime = 0;

  // Trata envio de comandos pendentes (Thread-safe)
  bool sendCmd = false;
  String cmdToSend = "";
  
  portENTER_CRITICAL(&mux);
  if (hasPendingCommand) {
    sendCmd = true;
    cmdToSend = pendingCommand;
    hasPendingCommand = false;
  }
  portEXIT_CRITICAL(&mux);

  if (sendCmd && hasLoRa) {
    unsigned long now = millis();
    if (now - lastTxTime > 40) {
      LoRa.beginPacket();
      LoRa.print(cmdToSend);
      LoRa.endPacket();
      LoRa.receive(); // Retorna explicitamente ao modo de recepção contínua
      lastTxTime = now;
    }
  }

  // 3. LoRa (Arduino) -> BLE (Dashboard)
  if (hasLoRa) {
    int packetSize = LoRa.parsePacket();
    if (packetSize) {
      String incoming = "";
      while (LoRa.available()) {
        incoming += (char)LoRa.read();
      }
      
      int rssi = LoRa.packetRssi();
      float snr = LoRa.packetSnr();
      // Ex: "T:V=7.80,P=50,S=OK,AR=-52" -> "T:V=7.80,P=50,S=OK,AR=-52,R=-45,N=9.5"
      incoming += ",R=" + String(rssi) + ",N=" + String(snr, 1);
      
      // Envia via BLE se o dashboard estiver pareado
      if (deviceConnected) {
        pTxCharacteristic->setValue(incoming.c_str());
        pTxCharacteristic->notify();
      }
      
      Serial.println(incoming);
    }
  }

  // 4. Trata reconexão BLE
  if (!deviceConnected && oldDeviceConnected) {
      delay(500); // dá um tempo para a stack BLE processar
      pServer->startAdvertising(); // Reinicia a publicação do nome para reconectar
      Serial.println("[BLE] Reiniciando publicidade...");
      oldDeviceConnected = deviceConnected;
  }
  
  if (deviceConnected && !oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
  }
}
\n`.trim();

const ARDUINO_REMOTE_CODE = `\n/*
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
Servo leftElevon;
Servo rightElevon;
const int escPin = 6;      // Pino PWM (mudou de D9 para D6 por causa do LoRa)
const int leftElevonPin = 3;
const int rightElevonPin = 5;
const int voltagePin = A0;

// Configuração do Divisor de Tensão
// Se R1 e R2 forem iguais (ex: 8k/8k ou 10k/10k), a tensão é dividida por 2. (Fator = 2.0)
const float voltageDividerFactor = 2.0;
const float referenceVoltage = 5.0; // Tensão de operação do Arduino (5V)

// Fator de calibração: compensa tolerância dos resistores e referência real do Arduino.
// Calcule: tensão_multímetro / tensão_dashboard (ex: 7.28 / 6.38 = 1.141)
const float VOLTAGE_CALIBRATION = 1.141;

int throttle = 0; // 0 a 100 (%)
int pitch = 0;    // -100 a 100
int roll = 0;     // -100 a 100
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

  // Inicializa ESC e Servos
  esc.attach(escPin, 1000, 2000);
  leftElevon.attach(leftElevonPin);
  rightElevon.attach(rightElevonPin);

  // Arming do ESC (1000us) e centraliza servos (90)
  esc.writeMicroseconds(1000);
  leftElevon.write(90);
  rightElevon.write(90);
  delay(2000);

  Serial.println("Arduino LoRa Remoto pronto. 2S Li-ion (Com Telemetria).");
  lastCommandTime = millis(); // Inicializa o timer do failsafe
}

void loop() {
  // 1. Leitura e Filtragem Anti-Sag Extremamente Lenta (A cada 20ms)
  if (millis() - lastVoltageReadTime >= 20) {
    int sensorValue = analogRead(voltagePin);
    float pinVoltage = (sensorValue / 1023.0) * referenceVoltage;
    float currentVoltage = pinVoltage * voltageDividerFactor * VOLTAGE_CALIBRATION;

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
  if ((throttle > 0 || pitch != 0 || roll != 0) && (millis() - lastCommandTime > FAILSAFE_TIMEOUT)) {
    throttle = 0;
    pitch = 0;
    roll = 0;
    esc.writeMicroseconds(1000);
    leftElevon.write(90);
    rightElevon.write(90);
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
      int parsedThrottle = 0, parsedPitch = 0, parsedRoll = 0;
      if (sscanf(input.c_str(), "%d,%d,%d", &parsedThrottle, &parsedPitch, &parsedRoll) == 3) {
        throttle = constrain(parsedThrottle, 0, 100);
        pitch = constrain(parsedPitch, -100, 100);
        roll = constrain(parsedRoll, -100, 100);
      } else {
        // Fallback backward compatibility
        throttle = constrain(input.toInt(), 0, 100);
        pitch = 0;
        roll = 0;
      }

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

      // Mixagem de Elevons (Pitch e Roll)
      // Mapeando -100 a 100 para +/- 45 graus de curso no servo
      int leftAngle = 90 + map(pitch, -100, 100, -45, 45) + map(roll, -100, 100, -45, 45);
      int rightAngle = 90 + map(pitch, -100, 100, -45, 45) - map(roll, -100, 100, -45, 45);

      leftElevon.write(constrain(leftAngle, 0, 180));
      rightElevon.write(constrain(rightAngle, 0, 180));
    }
  }
}
\n`.trim();

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
            Arquitetura wireless: ESP32 BLE Bridge (BLE UART↔LoRa) + Arduino Remoto (LoRa↔ESC/Servos). Filtro anti-sag, telemetria 2S Li-ion e mixagem de elevons preservados.
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
          Bridge WiFi (ESP32)
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

      {/* Connection Diagram - Updated for BLE + LoRa architecture */}
      <div className="border-t border-slate-800 pt-4 shrink-0">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Diagrama da Arquitetura BLE + LoRa</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-cyan-700 border border-cyan-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">📱 Celular</div>
            <div className="flex-1 h-px bg-blue-500/30 relative border-t border-dashed border-blue-500/50">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-blue-400 italic whitespace-nowrap">~~~ BLE (Nordic UART) ~~~</div>
            </div>
            <div className="w-16 h-5 bg-amber-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESP32</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-slate-700 border border-slate-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">BLE API</div>
            <div className="flex-1 h-px bg-slate-700 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 italic whitespace-nowrap">Service: 6E400001-...</div>
            </div>
            <div className="w-16 h-5 bg-amber-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESP32</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-amber-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESP32</div>
            <div className="flex-1 h-px bg-amber-500/30 relative border-t border-dashed border-amber-500/50">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-amber-500 italic whitespace-nowrap">~~~ LoRa 433MHz ~~~</div>
            </div>
            <div className="w-16 h-5 bg-emerald-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">Arduino</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-emerald-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">Arduino</div>
            <div className="flex-1 h-px bg-slate-700 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 italic whitespace-nowrap">PWM Pino 6</div>
            </div>
            <div className="w-16 h-5 bg-rose-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESC</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-emerald-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">Arduino</div>
            <div className="flex-1 h-px bg-slate-700 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 italic whitespace-nowrap">PWM Pinos 3 e 5</div>
            </div>
            <div className="w-16 h-5 bg-cyan-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">Servos L/R</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-red-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">VCC</div>
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
