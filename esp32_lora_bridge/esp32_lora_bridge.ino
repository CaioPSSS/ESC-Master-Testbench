/*
 * GNC Ground Station — ESP32 Binary WebSocket <-> LoRa Bridge
 *
 * Wi-Fi: Access Point VANT_GCS / admin
 * WebSocket: /ws
 * Rádio: SX1278 Ra-02 433MHz
 * Transporte: binário puro, little-endian, sem parsing de payload.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <SPI.h>
#include <LoRa.h>

#define LORA_NSS 5
#define LORA_RST 14
#define LORA_DIO0 2
#define LORA_FREQ 433E6

#define WIFI_SSID "VANT_GCS"
#define WIFI_PASSWORD "admin"

#define WS_PATH "/ws"
#define MAX_PACKET_SIZE 128

static constexpr uint32_t LORA_QUEUE_WAIT_MS = 5;

struct BinaryPacket {
  uint16_t length;
  uint8_t data[MAX_PACKET_SIZE];
};

AsyncWebServer server(80);
AsyncWebSocket webSocket(WS_PATH);
QueueHandle_t outgoingQueue;
SemaphoreHandle_t loraIrqSem;
TaskHandle_t radioTaskHandle = nullptr;

static bool loraReady = false;
static volatile uint32_t droppedPackets = 0;

void IRAM_ATTR onLoraDio0Rise() {
  BaseType_t higherPriorityTaskWoken = pdFALSE;

  if (loraIrqSem) {
    xSemaphoreGiveFromISR(loraIrqSem, &higherPriorityTaskWoken);
  }

  if (higherPriorityTaskWoken == pdTRUE) {
    portYIELD_FROM_ISR();
  }
}

void enqueuePacket(const uint8_t *data, size_t length) {
  if (!outgoingQueue || !data || length == 0) {
    return;
  }

  BinaryPacket packet = {};
  packet.length = static_cast<uint16_t>(min(length, static_cast<size_t>(MAX_PACKET_SIZE)));
  memcpy(packet.data, data, packet.length);

  if (xQueueSend(outgoingQueue, &packet, pdMS_TO_TICKS(LORA_QUEUE_WAIT_MS)) != pdTRUE) {
    droppedPackets++;
    Serial.printf("[Queue] drop=%lu len=%u\n", static_cast<unsigned long>(droppedPackets), packet.length);
  }
}

void onWebSocketEvent(AsyncWebSocket *serverRef, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.printf("[WS] Client #%u connected\n", client->id());
    return;
  }

  if (type == WS_EVT_DISCONNECT) {
    Serial.printf("[WS] Client #%u disconnected\n", client->id());
    return;
  }

  if (type != WS_EVT_DATA) {
    return;
  }

  AwsFrameInfo *info = reinterpret_cast<AwsFrameInfo *>(arg);
  if (!info || !info->final || info->index != 0 || info->len != len || info->opcode != WS_BINARY) {
    return;
  }

  enqueuePacket(data, len);
}

void radioTask(void *parameter) {
  for (;;) {
    if (loraReady) {
      if (xSemaphoreTake(loraIrqSem, portMAX_DELAY) == pdTRUE) {
        const int packetSize = LoRa.parsePacket();
        if (packetSize > 0) {
          BinaryPacket packet = {};
          packet.length = static_cast<uint16_t>(min(packetSize, MAX_PACKET_SIZE));

          for (uint16_t index = 0; index < packet.length && LoRa.available(); ++index) {
            packet.data[index] = static_cast<uint8_t>(LoRa.read());
          }

          if (webSocket.count() > 0) {
            webSocket.binaryAll(packet.data, packet.length);
          }
        }
      }

      BinaryPacket outgoing = {};
      while (xQueueReceive(outgoingQueue, &outgoing, 0) == pdTRUE) {
        LoRa.idle();
        LoRa.beginPacket();
        LoRa.write(outgoing.data, outgoing.length);
        LoRa.endPacket();
        LoRa.receive();
      }
    }
  }
}

void setupLoRa() {
  pinMode(LORA_DIO0, INPUT);
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("[LoRa] init failed");
    loraReady = false;
    return;
      if (!loraReady) {
        vTaskDelay(pdMS_TO_TICKS(50));
        continue;
      }

      if (xSemaphoreTake(loraIrqSem, portMAX_DELAY) == pdTRUE) {
        const int packetSize = LoRa.parsePacket();
        if (packetSize > 0) {
          BinaryPacket packet = {};
          packet.length = static_cast<uint16_t>(min(packetSize, MAX_PACKET_SIZE));

          for (uint16_t index = 0; index < packet.length && LoRa.available(); ++index) {
            packet.data[index] = static_cast<uint8_t>(LoRa.read());
  WiFi.softAP(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] AP IP: ");

          if (webSocket.count() > 0) {
            webSocket.binaryAll(packet.data, packet.length);
          }
        }

        BinaryPacket outgoing = {};
        while (xQueueReceive(outgoingQueue, &outgoing, 0) == pdTRUE) {
          LoRa.idle();
          LoRa.beginPacket();
          LoRa.write(outgoing.data, outgoing.length);
          LoRa.endPacket();
          LoRa.receive();
  server.on("/health", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "application/json", "{\"ok\":true,\"bridge\":\"VANT_GCS\"}");
  });

  server.onNotFound([](AsyncWebServerRequest *request) {
    request->send(404, "text/plain", "VANT_GCS bridge online");
  });

  server.begin();
}

void setup() {
  Serial.begin(115200);
  delay(250);

  outgoingQueue = xQueueCreate(16, sizeof(BinaryPacket));
  loraIrqSem = xSemaphoreCreateBinary();

  setupLoRa();
  setupWiFi();
  setupWebSocket();

  xTaskCreatePinnedToCore(
    radioTask,
    "radioTask",
    4096,
    nullptr,
    2,
    &radioTaskHandle,
    1
  );

  Serial.println("[System] Binary bridge ready");
}

void loop() {
  webSocket.cleanupClients();
  delay(5);
}
