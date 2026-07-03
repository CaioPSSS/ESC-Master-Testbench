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
Servo leftElevon;
Servo rightElevon;
const int escPin = 6;      // Pino PWM (mudou de D9 para D6 por causa do LoRa)
const int leftElevonPin = 3;
const int rightElevonPin = 5;
const int voltagePin = A0;

// Trims mecânicos dos servos (Compensação de montagem física)
const int LEFT_TRIM = 50;   // +10 graus para asa esquerda (subiu 5 graus)
const int RIGHT_TRIM = -58; // -18 graus para asa direita (subiu 5 graus - espelhado)
const int LEFT_CENTER = 90 + LEFT_TRIM;
const int RIGHT_CENTER = 90 + RIGHT_TRIM;

// Configuração do Divisor de Tensão
// Se R1 e R2 forem iguais (ex: 8k/8k ou 10k/10k), a tensão é dividida por 2. (Fator = 2.0)
const float voltageDividerFactor = 2.0;
const float referenceVoltage = 5.0; // Tensão de operação do Arduino (5V)

// Fator de calibração: compensa tolerância dos resistores e referência real do Arduino.
const float VOLTAGE_CALIBRATION = 0.966;

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

  // Arming do ESC (1000us) e centraliza servos com seus trims
  esc.writeMicroseconds(1000);
  leftElevon.write(LEFT_CENTER);
  rightElevon.write(RIGHT_CENTER);
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
  if (millis() - lastCommandTime > FAILSAFE_TIMEOUT) {
    if (throttle > 0 || pitch != 0 || roll != 0) {
      throttle = 0;
      pitch = 0;
      roll = 0;
      esc.writeMicroseconds(1000);
      leftElevon.write(LEFT_CENTER);
      rightElevon.write(RIGHT_CENTER);
    }
    failsafeActive = true;
  } else {
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

      // Mixagem de Elevons (Corrigida para Servos Fisicamente Espelhados)
      // Pitch (Arfagem): Servos devem se mover em direções opostas (pois estão espelhados) para subir/descer juntos.
      // Roll (Rolagem): Servos devem se mover na mesma direção para que uma asa suba e a outra desça.
      int leftAngle = LEFT_CENTER + map(pitch, -100, 100, -45, 45) + map(roll, -100, 100, 45, -45);
      int rightAngle = RIGHT_CENTER + map(pitch, -100, 100, 45, -45) + map(roll, -100, 100, 45, -45);

      leftElevon.write(constrain(leftAngle, 0, 180));
      rightElevon.write(constrain(rightAngle, 0, 180));
    }
  }
}
