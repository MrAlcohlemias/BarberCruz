import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
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

function originals(gallery: Locator) {
  return gallery.locator(".gallery-slide[data-gallery-original]");
}

async function settleScroll(track: Locator) {
  await track.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        let previous = element.scrollLeft;
        let unchanged = 0;
        const inspect = () => {
          unchanged =
            Math.abs(element.scrollLeft - previous) < 0.5 ? unchanged + 1 : 0;
          previous = element.scrollLeft;
          if (unchanged >= 12) resolve();
          else requestAnimationFrame(inspect);
        };
        requestAnimationFrame(inspect);
      }),
  );
}

async function seedGallery(page: Page, count: number) {
  await page
    .getByRole("button", { name: "Entrar", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Probar como cliente" }).click();
  await expect(
    page.getByRole("button", { name: "Menú de mi cuenta" }),
  ).toBeVisible();
  await page.evaluate((photoCount) => {
    const key = "barbercruz.demo.v1";
    const data = JSON.parse(localStorage.getItem(key)!) as AppData;
    data.galleryPhotos = Array.from({ length: photoCount }, (_, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = index % 2 ? 600 : 300;
      canvas.height = index % 2 ? 300 : 600;
      const context = canvas.getContext("2d")!;
      context.fillStyle = ["#e95454", "#4d94e4", "#dfa338"][index % 3];
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.fillRect(
        canvas.width * 0.4,
        0,
        canvas.width * 0.2,
        canvas.height,
      );
      const id = crypto.randomUUID();
      return {
        id,
        path: `${id}.jpg`,
        url: canvas.toDataURL("image/jpeg"),
        caption: `Corte de prueba ${index + 1}`,
        createdAt: new Date().toISOString(),
      };
    });
    localStorage.setItem(key, JSON.stringify(data));
  }, count);
  await page.reload();
  await expect(page.getByText("Demo local", { exact: true })).toBeVisible();
}

async function swipeGallery(page: Page) {
  const track = page.locator(".gallery-track");
  const counter = page.locator(".gallery-footnote");
  const initialCounter = await counter.textContent();
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  const y = box.y + Math.min(100, box.height / 2);
  const start = box.x + box.width * 0.8;
  const end = box.x + box.width * 0.3;
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
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(180);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect.poll(() => counter.textContent()).not.toBe(initialCounter);
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
  // Exercise manual navigation independently of the separately tested autoplay.
  await page.emulateMedia({ reducedMotion: "reduce" });
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
  await expect(originals(gallery).locator("img")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  const track = gallery.locator(".gallery-track");
  await expect(gallery.locator(".gallery-footnote")).toContainText(
    "Foto 1 de 2",
  );
  await gallery
    .getByRole("button", { name: "Ver foto siguiente", exact: true })
    .click();
  await expect(gallery.locator(".gallery-footnote")).toContainText(
    "Foto 2 de 2",
  );
  await gallery
    .getByRole("button", { name: "Ver foto anterior", exact: true })
    .click();
  await expect(gallery.locator(".gallery-footnote")).toContainText(
    "Foto 1 de 2",
  );
  await track.focus();
  await page.keyboard.press("ArrowRight");
  await expect(gallery.locator(".gallery-footnote")).toContainText(
    "Foto 2 de 2",
  );
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
  await expect(
    gallery.getByRole("button", { name: "Pausar carrusel", exact: true }),
  ).toBeVisible();
  const remainingTrack = gallery.locator(".gallery-track");
  await remainingTrack.scrollIntoViewIfNeeded();
  await remainingTrack.hover();
  const remainingImage = gallery.getByRole("img", {
    name: "Corte a tijera",
    exact: true,
  });
  const singlePhotoMovement = await remainingImage.evaluate(
    (image) =>
      new Promise<number>((resolve) => {
        const initialLeft = image.getBoundingClientRect().left;
        setTimeout(
          () => resolve(initialLeft - image.getBoundingClientRect().left),
          900,
        );
      }),
  );
  expect(singlePhotoMovement).toBeGreaterThan(6);
  expect(singlePhotoMovement).toBeLessThan(45);
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

test("el carrusel se desplaza lentamente incluso bajo el puntero, recorre el bucle sin saltos y permite pausarlo y usar el teclado", async ({
  page,
}) => {
  test.setTimeout(55_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await seedGallery(page, 2);
  await page.bringToFront();
  const gallery = page.getByRole("region", { name: "Galería de cortes" });
  const track = gallery.locator(".gallery-track");
  const counter = gallery.locator(".gallery-footnote");
  await track.scrollIntoViewIfNeeded();
  // The pointer stays over the photos, as it does while viewing the gallery.
  // This must not silently stop automatic movement.
  await track.hover();
  const positions = await originals(gallery)
    .first()
    .locator("img")
    .evaluate(
      (image) =>
        new Promise<number[]>((resolve) => {
          const positions: number[] = [];
          const sample = () => {
            positions.push(image.getBoundingClientRect().left);
            if (positions.length === 4) resolve(positions);
            else setTimeout(sample, 300);
          };
          sample();
        }),
    );
  for (let index = 1; index < positions.length; index++) {
    const movement = positions[index - 1] - positions[index];
    expect(movement).toBeGreaterThan(2);
    expect(movement).toBeLessThan(18);
  }
  expect(positions[0] - positions.at(-1)!).toBeLessThan(45);

  const loop = await track.evaluate(
    (element) =>
      new Promise<{
        wrapped: boolean;
        largestForwardStep: number;
        travelled: number;
        samples: number;
      }>((resolve) => {
        const children = Array.from(element.children) as HTMLElement[];
        const step = children[1].offsetLeft - children[0].offsetLeft;
        const cycleWidth = step * 2;
        let previous = element.scrollLeft;
        let travelled = 0;
        let largestForwardStep = 0;
        let samples = 0;
        const began = performance.now();
        const sample = () => {
          const current = element.scrollLeft;
          const rawDifference = current - previous;
          const forwardDifference =
            ((rawDifference % cycleWidth) + cycleWidth) % cycleWidth;
          largestForwardStep = Math.max(largestForwardStep, forwardDifference);
          travelled += forwardDifference;
          samples += 1;
          const wrapped = rawDifference < -cycleWidth / 2;
          previous = current;
          if (wrapped || performance.now() - began >= 20_000) {
            resolve({ wrapped, largestForwardStep, travelled, samples });
          } else {
            requestAnimationFrame(sample);
          }
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(loop.wrapped).toBe(true);
  expect(loop.samples).toBeGreaterThan(100);
  expect(loop.travelled).toBeGreaterThan(200);
  // Crossing the last photo returns to an identical copy of the first.
  // A backward animation or a full-photo jump would exceed this bound.
  expect(loop.largestForwardStep).toBeLessThan(8);
  await expect(originals(gallery)).toHaveCount(2);
  await expect(
    gallery.getByRole("img", { name: /Corte de prueba/ }),
  ).toHaveCount(2);
  expect(await gallery.locator('[aria-hidden="true"]').count()).toBeGreaterThan(
    0,
  );

  await gallery
    .getByRole("button", { name: "Pausar carrusel", exact: true })
    .click();
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  const stoppedAt = await track.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(1100);
  expect(
    Math.abs(
      (await track.evaluate((element) => element.scrollLeft)) - stoppedAt,
    ),
  ).toBeLessThan(1);
  await gallery
    .getByRole("button", { name: "Reanudar carrusel", exact: true })
    .click();
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await track.hover();
  await expect
    .poll(() => track.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(stoppedAt + 10);

  // Focusing the track keeps manual keyboard navigation under user control.
  await track.focus();
  await page.keyboard.press("Home");
  await expect(counter).toContainText("Foto 1 de 2");
  await settleScroll(track);
  const focusedAt = await track.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(4400);
  expect(
    Math.abs(
      (await track.evaluate((element) => element.scrollLeft)) - focusedAt,
    ),
  ).toBeLessThan(1);
  await page.keyboard.press("ArrowRight");
  await expect(counter).toContainText("Foto 2 de 2");
  await settleScroll(track);
  await page.keyboard.press("ArrowRight");
  await expect(counter).toContainText("Foto 1 de 2");
  await settleScroll(track);
  await page.keyboard.press("ArrowLeft");
  await expect(counter).toContainText("Foto 2 de 2");
  await settleScroll(track);
  await page.keyboard.press("Home");
  await expect(counter).toContainText("Foto 1 de 2");
  await settleScroll(track);
  await page.keyboard.press("End");
  await expect(counter).toContainText("Foto 2 de 2");
});

test("fotos verticales y horizontales llenan marcos compactos sin desbordamiento y se respeta reducir movimiento", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedGallery(page, 3);
  const gallery = page.getByRole("region", { name: "Galería de cortes" });
  const track = gallery.locator(".gallery-track");
  const counter = gallery.locator(".gallery-footnote");
  await expect(originals(gallery).locator("img")).toHaveCount(3);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await track.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    const alignment = await gallery.evaluate((element) => {
      const galleryRect = element.getBoundingClientRect();
      const mainRect = document.querySelector("main")!.getBoundingClientRect();
      return {
        galleryCenter: galleryRect.left + galleryRect.width / 2,
        mainCenter: mainRect.left + mainRect.width / 2,
        width: galleryRect.width,
      };
    });
    expect(
      Math.abs(alignment.galleryCenter - alignment.mainCenter),
    ).toBeLessThan(1);
    expect(alignment.width).toBeLessThanOrEqual(1000);
    await expect
      .poll(() =>
        originals(gallery)
          .locator("img")
          .evaluateAll((images) =>
            images.every((element) => {
              const image = element as HTMLImageElement;
              return image.complete && image.naturalWidth > 0;
            }),
          ),
      )
      .toBe(true);
    const imageFrames = await originals(gallery)
      .locator(".gallery-slide-image")
      .evaluateAll((frames) =>
        frames.map((frame) => {
          const image = frame.querySelector("img")!;
          const frameRect = frame.getBoundingClientRect();
          const imageRect = image.getBoundingClientRect();
          return {
            width: frameRect.width,
            height: frameRect.height,
            imageWidth: imageRect.width,
            imageHeight: imageRect.height,
            objectFit: getComputedStyle(image).objectFit,
            objectPosition: getComputedStyle(image).objectPosition,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
          };
        }),
      );
    expect(imageFrames[0].naturalHeight).toBeGreaterThan(
      imageFrames[0].naturalWidth,
    );
    expect(imageFrames[1].naturalWidth).toBeGreaterThan(
      imageFrames[1].naturalHeight,
    );
    for (const frame of imageFrames) {
      expect(frame.objectFit).toBe("cover");
      expect(frame.objectPosition).toBe("50% 50%");
      expect(frame.imageWidth).toBeCloseTo(frame.width, 0);
      expect(frame.imageHeight).toBeCloseTo(frame.height, 0);
      expect(frame.width).toBeLessThanOrEqual(width === 1440 ? 212 : 192);
      expect(frame.height).toBeLessThanOrEqual(width === 1440 ? 265 : 240);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(counter).toContainText("Foto 1 de 3");
  await page.waitForTimeout(4400);
  await expect(counter).toContainText("Foto 1 de 3");
  await track.focus();
  await page.keyboard.press("ArrowRight");
  await expect(counter).toContainText("Foto 2 de 3");
  // Reduced motion starts still, but the visitor can explicitly request playback.
  await page.bringToFront();
  await gallery
    .getByRole("button", { name: "Reanudar carrusel", exact: true })
    .click();
  await expect(
    gallery.getByRole("button", { name: "Pausar carrusel", exact: true }),
  ).toBeVisible();
  const resumedAt = await track.evaluate((element) => element.scrollLeft);
  await page.waitForTimeout(1000);
  const explicitMovement =
    (await track.evaluate((element) => element.scrollLeft)) - resumedAt;
  expect(explicitMovement).toBeGreaterThan(8);
  expect(explicitMovement).toBeLessThan(45);
});
