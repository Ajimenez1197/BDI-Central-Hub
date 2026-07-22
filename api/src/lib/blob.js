/**
 * blob.js — Azure Blob Storage helpers.
 */

import { BlobServiceClient } from "@azure/storage-blob";

let _blobService = null;

function getBlobService() {
  if (!_blobService) {
    const connStr = process.env.BLOB_CONNECTION_STRING;
    if (!connStr) throw new Error("BLOB_CONNECTION_STRING not set");
    _blobService = BlobServiceClient.fromConnectionString(connStr);
  }
  return _blobService;
}

function getContainer() {
  return process.env.BLOB_CONTAINER || "twc-data";
}

/**
 * Upload a buffer to blob storage.
 * @param {string} blobPath - e.g. "TWC/input/TWC_Mailed.csv"
 * @param {Buffer|string} data
 * @param {string} [contentType="text/csv"]
 */
export async function uploadBlob(blobPath, data, contentType = "text/csv") {
  const container = getBlobService().getContainerClient(getContainer());
  const blob = container.getBlockBlobClient(blobPath);
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8");
  await blob.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
  return blobPath;
}

/**
 * Download a blob as a Buffer.
 * @param {string} blobPath
 * @returns {Promise<Buffer>}
 */
export async function downloadBlob(blobPath) {
  const container = getBlobService().getContainerClient(getContainer());
  const blob = container.getBlockBlobClient(blobPath);
  const response = await blob.download(0);
  const chunks = [];
  for await (const chunk of response.readableStreamBody) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Generate a time-limited SAS URL for downloading the output workbook.
 * @param {string} blobPath
 * @param {number} [expiryMinutes=60]
 * @returns {Promise<string>}
 */
export async function getSasUrl(blobPath, expiryMinutes = 60) {
  const { BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential }
    = await import("@azure/storage-blob");

  // Parse account name + key from connection string for SAS generation
  const connStr = process.env.BLOB_CONNECTION_STRING;
  const accountName = connStr.match(/AccountName=([^;]+)/)?.[1];
  const accountKey = connStr.match(/AccountKey=([^;]+)/)?.[1];

  if (!accountName || !accountKey) {
    throw new Error("Cannot parse AccountName/AccountKey from BLOB_CONNECTION_STRING for SAS generation");
  }

  const sharedKey = new StorageSharedKeyCredential(accountName, accountKey);
  const containerName = getContainer();

  const expiresOn = new Date(Date.now() + expiryMinutes * 60 * 1000);

  const sas = generateBlobSASQueryParameters({
    containerName,
    blobName: blobPath,
    permissions: BlobSASPermissions.parse("r"),
    expiresOn,
  }, sharedKey).toString();

  return `https://${accountName}.blob.core.windows.net/${containerName}/${blobPath}?${sas}`;
}
