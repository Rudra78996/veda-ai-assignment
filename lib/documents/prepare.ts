"use client";

import type { DocumentKind, PreparedDocument, PreparedPage } from "@/lib/types";

const MAX_PAGES = 20;
const MAX_SOURCE_SIZE = 25 * 1024 * 1024;
const TARGET_LONG_EDGE = 1900;
const MAX_PAGE_BYTES = 3_200_000;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareDocument(
  kind: DocumentKind,
  files: File[],
): Promise<PreparedDocument> {
  if (files.length === 0) throw new Error("Choose at least one file.");
  if (files.some((file) => file.size > MAX_SOURCE_SIZE)) {
    throw new Error("Each source file must be 25 MB or smaller.");
  }

  const pdfFiles = files.filter((file) => isPdf(file));
  if (pdfFiles.length > 0 && files.length > 1) {
    throw new Error("Upload one PDF or a set of image pages, not both together.");
  }

  let pages: PreparedPage[];
  if (pdfFiles.length === 1) {
    pages = await renderPdf(pdfFiles[0]);
  } else {
    if (files.some((file) => !acceptedImageTypes.has(file.type))) {
      throw new Error("Use PDF, PNG, JPEG, or WebP files.");
    }
    if (files.length > MAX_PAGES) {
      throw new Error(`Use no more than ${MAX_PAGES} image pages.`);
    }
    pages = await Promise.all(files.map((file, index) => renderImage(file, index + 1)));
  }

  if (pages.length > MAX_PAGES) {
    revokePreparedPages(pages);
    throw new Error(`Use a document with no more than ${MAX_PAGES} pages.`);
  }

  return {
    kind,
    sourceNames: files.map((file) => file.name),
    pages,
  };
}

export function revokePreparedDocument(document: PreparedDocument | null) {
  if (!document) return;
  revokePreparedPages(document.pages);
}

async function renderPdf(file: File): Promise<PreparedPage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > MAX_PAGES) {
    throw new Error(`Use a PDF with no more than ${MAX_PAGES} pages.`);
  }

  const pages: PreparedPage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pdfPage = await pdf.getPage(pageNumber);
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const scale = TARGET_LONG_EDGE / Math.max(baseViewport.width, baseViewport.height);
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser cannot render PDF pages.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await canvasToSafeBlob(canvas);
    pages.push(createPreparedPage(blob, `${file.name} - page ${pageNumber}`, pageNumber, canvas));
    pdfPage.cleanup();
  }
  await loadingTask.destroy();
  return pages;
}

async function renderImage(file: File, pageNumber: number): Promise<PreparedPage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, TARGET_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser cannot prepare image pages.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvasToSafeBlob(canvas);
  return createPreparedPage(blob, file.name, pageNumber, canvas);
}

async function canvasToSafeBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of [0.88, 0.76, 0.64, 0.52]) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob.size <= MAX_PAGE_BYTES || quality === 0.52) return blob;
  }
  throw new Error("The page could not be compressed safely.");
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Page rendering failed."))),
      type,
      quality,
    );
  });
}

function createPreparedPage(
  blob: Blob,
  name: string,
  pageNumber: number,
  canvas: HTMLCanvasElement,
): PreparedPage {
  return {
    id: crypto.randomUUID(),
    pageNumber,
    name,
    blob,
    previewUrl: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  };
}

function revokePreparedPages(pages: PreparedPage[]) {
  pages.forEach((page) => URL.revokeObjectURL(page.previewUrl));
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
