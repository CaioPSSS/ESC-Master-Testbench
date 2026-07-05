/*
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
SemaphoreHandle_t cmdMutex;
String pendingCommand = "";
bool hasPendingCommand = false;

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string rxValue = pCharacteristic->getValue();

      if (rxValue.length() > 0) {
        String cmd = rxValue.c_str();
        cmd.trim();
        
        if (cmd.length() > 0 && hasLoRa) {
          if (xSemaphoreTake(cmdMutex, portMAX_DELAY)) {
            pendingCommand = cmd;
            hasPendingCommand = true;
            xSemaphoreGive(cmdMutex);
          }
        }
      }
    }
};

void setup() {
  Serial.begin(115200);
  delay(500);
  
  cmdMutex = xSemaphoreCreateMutex();

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
  
  // Tenta aumentar o MTU para lidar com pacotes LoRa muito compridos
  BLEDevice::setMTU(512);

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

  BLEAdvertising *pAdvertising = pServer->getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06); // Funções auxiliares para conectividade
  pAdvertising->setMinPreferred(0x12);
  pAdvertising->start();
  
  Serial.println("[BLE] Aguardando conexão do Dashboard (ESC-TestBench-BLE)...");
}

void loop() {
  static unsigned long lastTxTime = 0;

  // Trata envio de comandos pendentes (Thread-safe)
  bool sendCmd = false;
  String cmdToSend = "";
  
  if (xSemaphoreTake(cmdMutex, portMAX_DELAY)) {
    if (hasPendingCommand) {
      sendCmd = true;
      cmdToSend = pendingCommand;
      // Não mudamos hasPendingCommand para false aqui ainda!
    }
    xSemaphoreGive(cmdMutex);
  }

  if (sendCmd && hasLoRa) {
    unsigned long now = millis();
    // Limite de 10Hz (100ms) para evitar afogar o LoRa (Half-Duplex) e colidir com telemetria
    if (now - lastTxTime > 100) {
      LoRa.beginPacket();
      LoRa.print(cmdToSend);
      LoRa.endPacket();
      LoRa.receive(); // Retorna explicitamente ao modo de recepção contínua
      lastTxTime = now;
      
      // Agora limpamos a flag, mas APENAS se o comando não mudou nesse meio tempo
      if (xSemaphoreTake(cmdMutex, portMAX_DELAY)) {
        if (pendingCommand == cmdToSend) {
          hasPendingCommand = false;
        }
        xSemaphoreGive(cmdMutex);
      }
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
