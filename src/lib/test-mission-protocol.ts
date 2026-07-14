import {
  buildMissionPacket,
  buildMissionControlPacket,
  parseMissionControl
} from './protocol.js';

// Custom assertion helpers
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion Failed: ${message} (Expected ${expected}, got ${actual})`);
  }
  console.log(`[PASS] ${message} (${actual})`);
}

function runTests() {
  console.log('Running Mission Protocol Tests...\n');

  // ==========================================
  // Test 1: buildMissionPacket layout & offsets
  // ==========================================
  console.log('--- Test 1: buildMissionPacket ---');
  const index = 2;
  const lat = -23.55052; // -235505200
  const lon = -46.633308; // -466333080
  const altDecimeters = 1205; // 120.5 meters
  const speedCentimeters = 1500; // 15.0 m/s
  const cmd = 0; // WAYPOINT
  const cmdVal = 30; // loiter time 30s

  const wpBuffer = buildMissionPacket(index, lat, lon, altDecimeters, speedCentimeters, cmd, cmdVal);
  
  assertEquals(wpBuffer.byteLength, 18, 'Waypoint packet size is exactly 18 bytes');

  const wpView = new DataView(wpBuffer);
  
  // Verify fields and byte offsets (little-endian)
  assertEquals(wpView.getUint8(0), 0xCC, 'Byte 0: Header is 0xCC');
  assertEquals(wpView.getUint8(1), 0x42, 'Byte 1: System ID is 0x42');
  assertEquals(wpView.getUint8(2), index, `Byte 2: Index is ${index}`);
  assertEquals(wpView.getInt32(3, true), Math.trunc(lat * 1e7), `Bytes 3-6: Latitude is ${Math.trunc(lat * 1e7)}`);
  assertEquals(wpView.getInt32(7, true), Math.trunc(lon * 1e7), `Bytes 7-10: Longitude is ${Math.trunc(lon * 1e7)}`);
  assertEquals(wpView.getInt16(11, true), altDecimeters, `Bytes 11-12: Altitude is ${altDecimeters}`);
  assertEquals(wpView.getUint16(13, true), speedCentimeters, `Bytes 13-14: Speed is ${speedCentimeters}`);
  assertEquals(wpView.getUint8(15), cmd, `Byte 15: Command is ${cmd}`);
  assertEquals(wpView.getUint16(16, true), cmdVal, `Bytes 16-17: Command Value is ${cmdVal}`);


  // ==========================================
  // Test 2: buildMissionControlPacket
  // ==========================================
  console.log('\n--- Test 2: buildMissionControlPacket ---');
  const ctrlCmd = 1; // START_UPLOAD
  const ctrlData1 = 5; // Expected 5 waypoints
  const ctrlChecksum = 0xabcdef12;

  const ctrlBuffer = buildMissionControlPacket(ctrlCmd, ctrlData1, ctrlChecksum);

  assertEquals(ctrlBuffer.byteLength, 9, 'Mission control packet size is exactly 9 bytes');

  const ctrlView = new DataView(ctrlBuffer);

  assertEquals(ctrlView.getUint8(0), 0xCE, 'Byte 0: Header is 0xCE');
  assertEquals(ctrlView.getUint8(1), 0x42, 'Byte 1: System ID is 0x42');
  assertEquals(ctrlView.getUint8(2), ctrlCmd, `Byte 2: Command is ${ctrlCmd}`);
  assertEquals(ctrlView.getUint8(3), ctrlData1, `Byte 3: Data1 is ${ctrlData1}`);
  assertEquals(ctrlView.getUint32(4, true), ctrlChecksum, `Bytes 4-7: Checksum is 0x${ctrlChecksum.toString(16)}`);
  assertEquals(ctrlView.getUint8(8), 0, 'Byte 8: Padding is 0');


  // ==========================================
  // Test 3: parseMissionControl
  // ==========================================
  console.log('\n--- Test 3: parseMissionControl ---');
  
  // Construct a buffer representing ACK (cmd=3)
  const ackBuffer = new ArrayBuffer(9);
  const ackView = new DataView(ackBuffer);
  ackView.setUint8(0, 0xCE);
  ackView.setUint8(1, 0x42);
  ackView.setUint8(2, 3); // ACK
  ackView.setUint8(3, 10); // waypoint index 10 acknowledged
  ackView.setUint32(4, 0, true);
  ackView.setUint8(8, 0);

  const parsedAck = parseMissionControl(ackBuffer);
  assert(parsedAck !== null, 'Parsed ACK is not null');
  assertEquals(parsedAck!.cmd, 3, 'Parsed ACK command is 3');
  assertEquals(parsedAck!.data1, 10, 'Parsed ACK data1 is 10');
  assertEquals(parsedAck!.checksum, 0, 'Parsed ACK checksum is 0');

  // Construct a buffer representing NACK (cmd=4)
  const nackBuffer = new ArrayBuffer(9);
  const nackView = new DataView(nackBuffer);
  nackView.setUint8(0, 0xCE);
  nackView.setUint8(1, 0x42);
  nackView.setUint8(2, 4); // NACK
  nackView.setUint8(3, 0);
  nackView.setUint32(4, 987654, true);
  nackView.setUint8(8, 0);

  const parsedNack = parseMissionControl(nackBuffer);
  assert(parsedNack !== null, 'Parsed NACK is not null');
  assertEquals(parsedNack!.cmd, 4, 'Parsed NACK command is 4');
  assertEquals(parsedNack!.data1, 0, 'Parsed NACK data1 is 0');
  assertEquals(parsedNack!.checksum, 987654, 'Parsed NACK checksum is 987654');

  // Construct a buffer representing CLEAR (cmd=5)
  const clearBuffer = new ArrayBuffer(9);
  const clearView = new DataView(clearBuffer);
  clearView.setUint8(0, 0xCE);
  clearView.setUint8(1, 0x42);
  clearView.setUint8(2, 5); // CLEAR
  clearView.setUint8(3, 0);
  clearView.setUint32(4, 0, true);
  clearView.setUint8(8, 0);

  const parsedClear = parseMissionControl(clearBuffer);
  assert(parsedClear !== null, 'Parsed CLEAR is not null');
  assertEquals(parsedClear!.cmd, 5, 'Parsed CLEAR command is 5');
  assertEquals(parsedClear!.data1, 0, 'Parsed CLEAR data1 is 0');
  assertEquals(parsedClear!.checksum, 0, 'Parsed CLEAR checksum is 0');


  // ==========================================
  // Test 4: Checksum Calculation
  // ==========================================
  console.log('\n--- Test 4: Checksum Calculation ---');

  // Helper function implementing UAV byte-level checksum algorithm
  function calculateUavChecksum(packets: ArrayBuffer[]): number {
    let checksum = 0;
    for (const packet of packets) {
      const bytes = new Uint8Array(packet);
      for (let i = 0; i < bytes.length; i++) {
        checksum = (checksum + bytes[i]) >>> 0;
      }
    }
    return checksum;
  }

  // Create two waypoints
  const wp1 = buildMissionPacket(0, -23.5, -46.6, 100, 1200, 0, 0);
  const wp2 = buildMissionPacket(1, -23.6, -46.7, 150, 1500, 0, 0);

  const calcChecksum = calculateUavChecksum([wp1, wp2]);

  // Hand-verify the checksum of wp1 and wp2. Let's extract the byte arrays and sum them.
  const bytes1 = new Uint8Array(wp1);
  const bytes2 = new Uint8Array(wp2);
  let expectedSum = 0;
  for (let i = 0; i < bytes1.length; i++) expectedSum += bytes1[i];
  for (let i = 0; i < bytes2.length; i++) expectedSum += bytes2[i];
  expectedSum = expectedSum >>> 0;

  assertEquals(calcChecksum, expectedSum, `Checksum matches hand-calculated sum of all bytes (${expectedSum})`);

  // Let's modify a byte and make sure the checksum changes
  bytes2[3] += 1;
  const badChecksum = calculateUavChecksum([wp1, wp2.slice(0)]);
  assert(badChecksum !== calcChecksum, 'Checksum changes when packet data is modified');

  console.log('\nAll tests completed successfully!');
}

try {
  runTests();
  process.exit(0);
} catch (e: any) {
  console.error('\nTest execution FAILED!');
  console.error(e.stack || e.message || e);
  process.exit(1);
}
