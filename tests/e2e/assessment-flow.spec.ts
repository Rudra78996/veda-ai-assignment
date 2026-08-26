import { expect, test } from "@playwright/test";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const questionPdf = createQuestionPdf();

test("uploads, maps, grades, and highlights answers", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Map every answer to the right question" })).toBeVisible();

  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles({
    name: "questions.pdf",
    mimeType: "application/pdf",
    buffer: questionPdf,
  });
  await inputs.nth(1).setInputFiles({ name: "answers.png", mimeType: "image/png", buffer: onePixelPng });

  await expect(page.getByText("Ready to process")).toHaveCount(2);
  await page.getByRole("button", { name: "Process assessment" }).click();

  await expect(page.getByRole("heading", { name: "Answer mapping" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Question 2 (a)")).toBeVisible();
  await expect(page.getByText("Unmatched answers")).toBeVisible();
  await expect(page.getByText("4/4")).toBeVisible();

  await page.getByRole("button", { name: /Question 1/ }).click();
  if (testInfo.project.name === "mobile") {
    await expect(page.getByRole("button", { name: "Answer sheet" })).toHaveAttribute("class", /bg-/);
  }
  await expect(page.getByLabel("Answer sheet viewer")).toBeVisible();
  await expect(page.locator(".highlight-region")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("review.png"), fullPage: true });
});

function createQuestionPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length 66 >>\nstream\nBT /F1 22 Tf 72 700 Td (1. What is photosynthesis?) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}
