import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { resolve } from "node:path";
import type { AppData } from "../src/lib/types";

const originalPhoto = resolve("public/barber-hero.jpg");

async function openAdminGallery(page: Page) {
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await page.getByRole("button", { name: "Administrar barbería" }).click();
  await page.getByRole("tab", { name: "Galería", exact: true }).click();
}

async function loginAdmin(page: Page) {
  await page
    .getByRole("button", { name: "Entrar", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Explorar el panel de administración" })
    .click();
  await openAdminGallery(page);
}

async function publishPhoto(page: Page, caption: string) {
  const publishedBefore = await page.locator(".gallery-admin-photo").count();
  await page.getByLabel("Elegir foto del corte").setInputFiles(originalPhoto);
  await expect(
    page.getByRole("img", { name: "Vista previa de la foto elegida" }),
  ).toBeVisible();
  await page.getByLabel("Descripción del corte (opcional)").fill(caption);
  const publish = page.getByRole("button", {
    name: "Publicar foto",
    exact: true,
  });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.locator(".gallery-admin-photo")).toHaveCount(
    publishedBefore + 1,
  );
  await expect(
    page
      .locator(".gallery-admin-photo")
      .filter({ hasText: caption || "Sin descripción" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Vista previa de la foto elegida" }),
  ).toHaveCount(0);
}

async function galleryCount(page: Page) {
  return page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem("barbercruz.demo.v1")!) as AppData)
        .galleryPhotos.length,
  );
}

async function home(page: Page) {
  await page
    .getByRole("button", { name: "Barber Cruz, inicio", exact: true })
    .click();
}

async function swipeGallery(page: Page) {
  const track = page.locator(".gallery-track");
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  const y = box.y + Math.min(100, box.height / 2);
  const start = box.x + box.width * 0.85;
  const end = box.x + box.width * 0.15;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: start, y, id: 1 }],
    });
    for (let step = 1; step <= 6; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: start + ((end - start) * step) / 6, y, id: 1 }],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => track.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
  } finally {
    await session.detach();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Demo local", { exact: true })).toBeVisible();
});

test("la galería empieza oculta y rechaza archivos que no sean fotos sin publicar nada", async ({
  page,
}) => {
  await expect(
    page.getByRole("region", { name: "Galería de cortes" }),
  ).toHaveCount(0);
  await loginAdmin(page);
  await expect(page.locator(".gallery-admin-photo")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Publicar foto", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Elegir foto del corte").setInputFiles({
    name: "no-es-una-foto.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  });
  await expect(page.getByRole("alert")).toContainText("Elige una foto JPG");
  await expect(
    page.getByRole("button", { name: "Publicar foto", exact: true }),
  ).toBeDisabled();
  expect(await galleryCount(page)).toBe(0);
  await page.getByLabel("Elegir foto del corte").setInputFiles(originalPhoto);
  await expect(
    page.getByRole("img", { name: "Vista previa de la foto elegida" }),
  ).toBeVisible();
  expect(await galleryCount(page)).toBe(0);
  await home(page);
  await expect(
    page.getByRole("region", { name: "Galería de cortes" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Galería de cortes" }),
  ).toHaveCount(0);
});

test("el administrador publica fotos, se conservan al recargar y los clientes pueden recorrerlas", async ({
  page,
}) => {
  await loginAdmin(page);
  await publishPhoto(page, "Degradado bajo");
  await publishPhoto(page, "Textura y volumen");
  expect(await galleryCount(page)).toBe(2);
  await page.reload();
  await openAdminGallery(page);
  await expect(page.locator(".gallery-admin-photo")).toHaveCount(2);
  await home(page);
  const gallery = page.getByRole("region", { name: "Galería de cortes" });
  await expect(gallery).toBeVisible();
  const image = gallery.getByRole("img", {
    name: "Textura y volumen",
    exact: true,
  });
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      image.evaluate(
        (element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect(gallery.locator(".gallery-slide img")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  const track = gallery.locator(".gallery-track");
  await gallery
    .getByRole("button", { name: "Ver foto siguiente", exact: true })
    .click();
  await expect
    .poll(() => track.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect(gallery.locator(".gallery-footnote")).toContainText(
    "Foto 2 de 2",
  );
  await gallery
    .getByRole("button", { name: "Ver foto anterior", exact: true })
    .click();
  await expect
    .poll(() => track.evaluate((element) => element.scrollLeft))
    .toBe(0);
  await track.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => track.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect(gallery).toBeVisible();
  await page
    .getByRole("button", { name: "Entrar", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Probar como cliente" }).click();
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await expect(
    page.getByRole("button", { name: "Administrar barbería" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Galería", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Elegir foto del corte")).toHaveCount(0);
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await expect(gallery).toBeVisible();
});

test("en móvil cancelar conserva la foto, borrar una mantiene el carrusel y borrar la última lo oculta", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await loginAdmin(page);
  await publishPhoto(page, "Corte a tijera");
  await publishPhoto(page, "");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await home(page);
  await swipeGallery(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await openAdminGallery(page);
  const selected = page
    .locator(".gallery-admin-photo")
    .filter({ hasText: "Sin descripción" });
  await selected.getByRole("button", { name: /Eliminar foto/ }).click();
  let confirmation = page.getByRole("dialog", {
    name: "Eliminar foto de la galería",
  });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  expect(await galleryCount(page)).toBe(2);
  await selected.getByRole("button", { name: /Eliminar foto/ }).click();
  confirmation = page.getByRole("dialog", {
    name: "Eliminar foto de la galería",
  });
  await confirmation
    .getByRole("button", { name: "Eliminar foto", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.locator(".gallery-admin-photo")).toHaveCount(1);
  await home(page);
  let gallery = page.getByRole("region", { name: "Galería de cortes" });
  await expect(gallery).toBeVisible();
  await expect(
    gallery.getByRole("img", { name: "Corte a tijera", exact: true }),
  ).toBeVisible();
  await expect(
    gallery.getByRole("button", { name: "Ver foto siguiente", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await openAdminGallery(page);
  await page
    .locator(".gallery-admin-photo")
    .getByRole("button", { name: /Eliminar foto/ })
    .click();
  confirmation = page.getByRole("dialog", {
    name: "Eliminar foto de la galería",
  });
  await confirmation
    .getByRole("button", { name: "Eliminar foto", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.locator(".gallery-admin-photo")).toHaveCount(0);
  expect(await galleryCount(page)).toBe(0);
  await home(page);
  gallery = page.getByRole("region", { name: "Galería de cortes" });
  await expect(gallery).toHaveCount(0);
  await page.reload();
  await expect(gallery).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
