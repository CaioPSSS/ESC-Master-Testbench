/*
 * ESC Master Testbench — Receptor Remoto (Arduino Uno/Nano)
 * Recebe comandos de throttle via LoRa e controla o ESC
 * Envia telemetria da bateria 2S, MPU6050, BMP280 e NEO6M GPS
 */

#include <SPI.h>
#include <LoRa.h>
#include <Servo.h>
#include <Wire.h>
#include <SoftwareSerial.h>

// --- Pinos ---
#define LORA_NSS   10
#define LORA_RST   9
#define LORA_DIO0  2
#define LORA_FREQ  433E6

const int escPin = 6;
const int leftElevonPin = 3;
const int rightElevonPin = 5;
const int voltagePin = A0;

// GPS no SoftwareSerial
SoftwareSerial gpsSerial(4, 7); // RX(D4), TX(D7)

Servo esc;
Servo leftElevon;
Servo rightElevon;

// Centros Mecânicos e Limites
const int LEFT_CENTER = 105;
const int RIGHT_CENTER = 70;
const int LEFT_MIN = 46;
const int LEFT_MAX = 150;
const int RIGHT_MIN = 24; 
const int RIGHT_MAX = 116;

const float voltageDividerFactor = 2.0;
const float referenceVoltage = 5.0;
const float VOLTAGE_CALIBRATION = 0.966;

int throttle = 0, pitch_cmd = 0, roll_cmd = 0;
int lastCmdRssi = 0;
unsigned long lastTelemetryTime = 0;
unsigned long lastVoltageReadTime = 0;
unsigned long lastCommandTime = 0;
const unsigned long FAILSAFE_TIMEOUT = 2000;
float filteredVoltage = 0.0;
bool firstRead = true;
bool failsafeActive = false;

// Sensores MPU6050
const int MPU_addr = 0x68;
int16_t AcX, AcY, AcZ;
float pitch_mpu = 0, roll_mpu = 0;

// Sensores BMP280
const int BMP_addr = 0x76;
uint16_t dig_T1; int16_t dig_T2, dig_T3;
uint16_t dig_P1; int16_t dig_P2, dig_P3, dig_P4, dig_P5, dig_P6, dig_P7, dig_P8, dig_P9;
int32_t t_fine;
float bmp_altitude = 0, base_pressure = 0;

// GPS Data
float gps_lat = -12.9714; // Default inicial solicitado
float gps_lon = -38.5104;
int gps_satellites = 0;
int gps_fix_quality = 0;
float gps_course = 0;

// Leitura NMEA simplificada
void readGPS() {
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    static String sentence = "";
    if (c == '\n') {
      if (sentence.startsWith("$GPRMC") || sentence.startsWith("$GNRMC")) {
        int commaIdx[13];
        int cIdx = 0;
        for(int i=0; i<sentence.length(); i++) {
          if(sentence[i] == ',') {
            commaIdx[cIdx++] = i;
            if(cIdx >= 13) break;
          }
        }
        if(cIdx >= 7 && sentence.charAt(commaIdx[1]+1) == 'A') { // A = Active
          String latStr = sentence.substring(commaIdx[2]+1, commaIdx[3]);
          String latDir = sentence.substring(commaIdx[3]+1, commaIdx[4]);
          String lonStr = sentence.substring(commaIdx[4]+1, commaIdx[5]);
          String lonDir = sentence.substring(commaIdx[5]+1, commaIdx[6]);
          
          if(latStr.length() > 2 && lonStr.length() > 3) {
            float latDeg = latStr.substring(0,2).toFloat();
            float latMin = latStr.substring(2).toFloat();
            gps_lat = latDeg + (latMin/60.0);
            if(latDir == "S") gps_lat = -gps_lat;
            
            float lonDeg = lonStr.substring(0,3).toFloat();
            float lonMin = lonStr.substring(3).toFloat();
            gps_lon = lonDeg + (lonMin/60.0);
            if(lonDir == "W") gps_lon = -gps_lon;
          }
          if(cIdx >= 9) {
            String courseStr = sentence.substring(commaIdx[7]+1, commaIdx[8]);
            if(courseStr.length() > 0) gps_course = courseStr.toFloat();
          }
        }
      } else if (sentence.startsWith("$GPGGA") || sentence.startsWith("$GNGGA")) {
        int commaIdx[15];
        int cIdx = 0;
        for(int i=0; i<sentence.length(); i++) {
          if(sentence[i] == ',') {
            commaIdx[cIdx++] = i;
            if(cIdx >= 15) break;
          }
        }
        if(cIdx >= 8) {
          String fixQualStr = sentence.substring(commaIdx[5]+1, commaIdx[6]);
          String satStr = sentence.substring(commaIdx[6]+1, commaIdx[7]);
          
          if(fixQualStr.length() > 0) gps_fix_quality = fixQualStr.toInt();
          if(satStr.length() > 0) gps_satellites = satStr.toInt();
        }
      }
      sentence = "";
    } else if (c != '\r') {
      sentence += c;
    }
    if(sentence.length() > 80) sentence = ""; // Previne leak
  }
}

// Inicializa BMP280 e le coeficientes
void initBMP280() {
  Wire.beginTransmission(BMP_addr);
  Wire.write(0x88);
  Wire.endTransmission();
  Wire.requestFrom(BMP_addr, 24);
  if(Wire.available() == 24) {
    dig_T1 = Wire.read() | (Wire.read() << 8);
    dig_T2 = Wire.read() | (Wire.read() << 8);
    dig_T3 = Wire.read() | (Wire.read() << 8);
    dig_P1 = Wire.read() | (Wire.read() << 8);
    dig_P2 = Wire.read() | (Wire.read() << 8);
    dig_P3 = Wire.read() | (Wire.read() << 8);
    dig_P4 = Wire.read() | (Wire.read() << 8);
    dig_P5 = Wire.read() | (Wire.read() << 8);
    dig_P6 = Wire.read() | (Wire.read() << 8);
    dig_P7 = Wire.read() | (Wire.read() << 8);
    dig_P8 = Wire.read() | (Wire.read() << 8);
    dig_P9 = Wire.read() | (Wire.read() << 8);
  }
  Wire.beginTransmission(BMP_addr);
  Wire.write(0xF4);
  Wire.write(0x27); // Normal mode, temp and press x1
  Wire.endTransmission();
  Wire.beginTransmission(BMP_addr);
  Wire.write(0xF5);
  Wire.write(0xA0); // Standby 1000ms
  Wire.endTransmission();
}

float readBMP280Pressure() {
  Wire.beginTransmission(BMP_addr);
  Wire.write(0xF7);
  Wire.endTransmission();
  Wire.requestFrom(BMP_addr, 6);
  if(Wire.available() != 6) return 0;
  uint32_t press_msb = Wire.read();
  uint32_t press_lsb = Wire.read();
  uint32_t press_xlsb = Wire.read();
  uint32_t temp_msb = Wire.read();
  uint32_t temp_lsb = Wire.read();
  uint32_t temp_xlsb = Wire.read();

  int32_t adc_T = (temp_msb << 12) | (temp_lsb << 4) | (temp_xlsb >> 4);
  int32_t var1_t = ((((adc_T >> 3) - ((int32_t)dig_T1 << 1))) * ((int32_t)dig_T2)) >> 11;
  int32_t var2_t = (((((adc_T >> 4) - ((int32_t)dig_T1)) * ((adc_T >> 4) - ((int32_t)dig_T1))) >> 12) * ((int32_t)dig_T3)) >> 14;
  t_fine = var1_t + var2_t;

  int32_t adc_P = (press_msb << 12) | (press_lsb << 4) | (press_xlsb >> 4);
  int64_t var1_p, var2_p, p;
  var1_p = ((int64_t)t_fine) - 128000;
  var2_p = var1_p * var1_p * (int64_t)dig_P6;
  var2_p = var2_p + ((var1_p * (int64_t)dig_P5) << 17);
  var2_p = var2_p + (((int64_t)dig_P4) << 35);
  var1_p = ((var1_p * var1_p * (int64_t)dig_P3) >> 8) + ((var1_p * (int64_t)dig_P2) << 12);
  var1_p = (((((int64_t)1) << 47) + var1_p)) * ((int64_t)dig_P1) >> 33;

  if (var1_p == 0) return 0;
  p = 1048576 - adc_P;
  p = (((p << 31) - var2_p) * 3125) / var1_p;
  var1_p = (((int64_t)dig_P9) * (p >> 13) * (p >> 13)) >> 25;
  var2_p = (((int64_t)dig_P8) * p) >> 19;
  p = ((p + var1_p + var2_p) >> 8) + (((int64_t)dig_P7) << 4);
  return (float)p / 256.0;
}

void setup() {
  Wire.begin();
  gpsSerial.begin(9600);
  
  LoRa.setPins(LORA_NSS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) while (1);
  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(250E3);
  LoRa.setCodingRate4(5);

  esc.attach(escPin, 1000, 2000);
  leftElevon.attach(leftElevonPin);
  rightElevon.attach(rightElevonPin);
  esc.writeMicroseconds(1000);
  leftElevon.write(LEFT_CENTER);
  rightElevon.write(RIGHT_CENTER);
  
  // MPU6050 Wake up
  Wire.beginTransmission(MPU_addr);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission(true);

  initBMP280();
  delay(100);
  base_pressure = readBMP280Pressure();

  lastCommandTime = millis();
}

void loop() {
  readGPS();

  if (millis() - lastVoltageReadTime >= 20) {
    int sensorValue = analogRead(voltagePin);
    float currentVoltage = (sensorValue / 1023.0) * referenceVoltage * voltageDividerFactor * VOLTAGE_CALIBRATION;

    if (firstRead) {
      filteredVoltage = currentVoltage;
      firstRead = false;
    } else {
      float alpha = (throttle == 0) ? 0.05 : 0.0002;
      filteredVoltage = (filteredVoltage * (1.0 - alpha)) + (currentVoltage * alpha);
    }
    lastVoltageReadTime = millis();
  }

  bool isBatteryLow = filteredVoltage < 6.0;

  if (millis() - lastCommandTime > FAILSAFE_TIMEOUT) {
    if (throttle > 0 || pitch_cmd != 0 || roll_cmd != 0) {
      throttle = 0; pitch_cmd = 0; roll_cmd = 0;
      esc.writeMicroseconds(1000);
      leftElevon.write(LEFT_CENTER);
      rightElevon.write(RIGHT_CENTER);
    }
    failsafeActive = true;
  } else {
    failsafeActive = false;
  }

  if (millis() - lastTelemetryTime > 500) {
    // MPU6050 Pitch & Roll
    Wire.beginTransmission(MPU_addr);
    Wire.write(0x3B);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_addr, 6, true);
    if(Wire.available() == 6) {
      AcX = Wire.read()<<8|Wire.read();
      AcY = Wire.read()<<8|Wire.read();
      AcZ = Wire.read()<<8|Wire.read();
      
      pitch_mpu = -(atan2(AcX, sqrt((long)AcY * AcY + (long)AcZ * AcZ)) * 180.0) / PI;
      roll_mpu = (atan2(AcY, AcZ) * 180.0) / PI;
    }

    // BMP280 Altitude
    float press = readBMP280Pressure();
    if (press > 0 && base_pressure > 0) {
      bmp_altitude = 44330.0 * (1.0 - pow(press / base_pressure, 0.1903));
    }

    String status = failsafeActive ? "FAILSAFE" : (isBatteryLow ? "ERROR_BATTERY" : "OK");
    
    // T:V=8.4,P=100,S=OK,AR=-50,PIT=12.1,ROL=-5.2,ALT=120.1,LAT=-12.9714,LON=-38.5104
    String telemetry = "T:V=" + String(filteredVoltage, 2) + 
                       ",P=" + String(constrain(map(filteredVoltage * 100, 600, 840, 0, 100), 0, 100)) + 
                       ",S=" + status + 
                       ",AR=" + String(lastCmdRssi) + 
                       ",PIT=" + String(pitch_mpu, 1) + 
                       ",ROL=" + String(roll_mpu, 1) + 
                       ",ALT=" + String(bmp_altitude, 1) + 
                       ",LAT=" + String(gps_lat, 6) + 
                       ",LON=" + String(gps_lon, 6) +
                       ",SAT=" + String(gps_satellites) +
                       ",FIX=" + String(gps_fix_quality) +
                       ",CRS=" + String(gps_course, 1);

    LoRa.beginPacket();
    LoRa.print(telemetry);
    LoRa.endPacket();
    LoRa.receive();

    lastTelemetryTime = millis();
  }

  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    String input = "";
    while (LoRa.available()) input += (char)LoRa.read();
    input.trim();
    lastCmdRssi = LoRa.packetRssi();
    lastCommandTime = millis();

    if (input == "CALIBRATE") {
      LoRa.beginPacket(); LoRa.print("T:V=0.00,P=0,S=CALIBRATING"); LoRa.endPacket();
      esc.writeMicroseconds(2000);
      delay(8000);
      esc.writeMicroseconds(1000);
      LoRa.beginPacket(); LoRa.print("T:V=0.00,P=0,S=CAL_DONE"); LoRa.endPacket();
    } else {
      int pT = 0, pP = 0, pR = 0;
      if (sscanf(input.c_str(), "%d,%d,%d", &pT, &pP, &pR) == 3) {
        throttle = constrain(pT, 0, 100);
        pitch_cmd = constrain(pP, -100, 100);
        roll_cmd = constrain(pR, -100, 100);
      } else {
        throttle = constrain(input.toInt(), 0, 100);
        pitch_cmd = 0; roll_cmd = 0;
      }
      if (isBatteryLow) throttle = 0;

      int pwmValue = (throttle > 0) ? map(throttle, 1, 100, 1040, 2000) : 1000;
      esc.writeMicroseconds(pwmValue);

      int leftAngle = LEFT_CENTER + map(pitch_cmd, -100, 100, -45, 45) + map(roll_cmd, -100, 100, 45, -45);
      int rightAngle = RIGHT_CENTER + map(pitch_cmd, -100, 100, 45, -45) + map(roll_cmd, -100, 100, 45, -45);
      leftElevon.write(constrain(leftAngle, LEFT_MIN, LEFT_MAX));
      rightElevon.write(constrain(rightAngle, RIGHT_MIN, RIGHT_MAX));
    }
  }
}
