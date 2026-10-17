import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateStoragePercentage,
  formatBytes,
  validateClientFileSafety,
  CLIENT_MAX_FILE_SIZE,
} from "./filesUtils.js";

test("TASK-502 [FE REQ 1 / Storage Safety]: Disallow dangerous executable binaries", () => {
  const executables = [
    "virus.exe",
    "script.sh",
    "batch.bat",
    "command.cmd",
    "binary.bin",
    "installer.msi",
    "macro.vbs",
  ];

  for (const name of executables) {
    const error = validateClientFileSafety(name, 1024, 1000000);
    assert.equal(
      error,
      "Disallowed file type: executable binaries cannot be uploaded",
      `Expected error for ${name}`
    );
  }
});

test("TASK-502 [FE REQ 2 / Storage Limit]: Disallow files exceeding 50 MB", () => {
  const oversizedBytes = CLIENT_MAX_FILE_SIZE + 1;
  const error = validateClientFileSafety("large-video.mp4", oversizedBytes, 1000000000);
  assert.equal(error, "File exceeds maximum size limit of 50 MB");

  const validBytes = CLIENT_MAX_FILE_SIZE;
  const validError = validateClientFileSafety("valid-archive.zip", validBytes, 1000000000);
  assert.equal(validError, null);
});

test("TASK-502 [FE REQ 3 / Quota Enforcement]: Disallow files exceeding remaining organization quota", () => {
  const remainingQuota = 5 * 1024 * 1024; // 5 MB remaining
  const fileBytes = 6 * 1024 * 1024; // 6 MB file
  const error = validateClientFileSafety("presentation.pdf", fileBytes, remainingQuota);
  assert.equal(error, "Storage quota exceeded for this organization");

  const withinQuota = 4 * 1024 * 1024;
  assert.equal(validateClientFileSafety("presentation.pdf", withinQuota, remainingQuota), null);
});

test("TASK-502 [FE REQ 4 / Percentage Math]: calculateStoragePercentage computes accurate percentage", () => {
  assert.equal(calculateStoragePercentage(0, 10737418240), 0);
  assert.equal(calculateStoragePercentage(1073741824, 10737418240), 10);
  assert.equal(calculateStoragePercentage(5368709120, 10737418240), 50);
  assert.equal(calculateStoragePercentage(10737418240, 10737418240), 100);
  assert.equal(calculateStoragePercentage(12000000000, 10737418240), 100); // capped at 100
  assert.equal(calculateStoragePercentage(100, 0), 0); // division by zero guarded
});

test("TASK-502 [FE REQ 5 / Byte Formatting]: formatBytes formats bytes across units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(5242880), "5.0 MB");
  assert.equal(formatBytes(10737418240), "10.00 GB");
});
