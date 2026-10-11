import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { AppData } from "../src/lib/types";

async function openAdmin(page: Page) {
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await page.getByRole("button", { name: "Administrar barbería" }).click();
  await expect(
    page.getByRole("tab", { name: "Agenda", exact: true }),
  ).toBeVisible();
}

async function seedAppointments(page: Page) {
  const dates = await page.evaluate(() => {
    const key = "barbercruz.demo.v1";
    const data = JSON.parse(localStorage.getItem(key)!) as AppData;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: data.settings.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const value = (name: string) =>
      parts.find((part) => part.type === name)!.value;
    const current = `${value("year")}-${value("month")}-${value("day")}`;
    const add = (date: string, days: number) => {
      const next = new Date(`${date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + days);
      return next.toISOString().slice(0, 10);
    };
    let future = add(current, 1);
    while (
      !data.settings.openingHours[new Date(`${future}T12:00:00Z`).getUTCDay()]
        ?.open
    ) {
      future = add(future, 1);
    }
    let nextFuture = add(future, 1);
    while (
      !data.settings.openingHours[
        new Date(`${nextFuture}T12:00:00Z`).getUTCDay()
      ]?.open
    ) {
      nextFuture = add(nextFuture, 1);
    }
    const past = add(current, -1);
    data.appointments.push(
      ...[
        {
          id: "admin-test-move",
          userId: "demo-customer",
          date: future,
          time: "11:00",
        },
        {
          id: "admin-test-cancel",
          userId: "demo-dani",
          date: future,
          time: "12:30",
        },
        {
          id: "admin-test-complete",
          userId: "demo-customer",
          date: past,
          time: "09:00",
        },
      ].map((appointment) => ({
        ...appointment,
        serviceId: "cut",
        duration: 45,
        price: 7,
        status: "confirmed" as const,
        redemption: false,
        note: "Cita de prueba del panel",
        createdAt: new Date().toISOString(),
      })),
    );
    localStorage.setItem(key, JSON.stringify(data));
    return { future, past, nextFuture };
  });
  await page.reload();
  await openAdmin(page);
  return dates;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Demo local", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Entrar", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Explorar el panel de administración" })
    .click();
  await openAdmin(page);
});

test("edita servicios, conserva cambios al recargar y respeta precios de citas existentes", async ({
  page,
}) => {
  const { past } = await seedAppointments(page);
  await page.getByRole("tab", { name: "Servicios", exact: true }).click();
  await page
    .getByLabel("Nombre del servicio", { exact: true })
    .fill("Corte a tu estilo");
  await page.getByLabel("Precio (€)", { exact: true }).fill("8.50");
  await page.getByLabel("Duración (min)", { exact: true }).fill("60");
  await page.getByRole("button", { name: "Guardar servicios" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Servicios actualizados.",
  );
  await page.reload();
  await openAdmin(page);
  await page.getByRole("tab", { name: "Servicios", exact: true }).click();
  await expect(
    page.getByLabel("Nombre del servicio", { exact: true }),
  ).toHaveValue("Corte a tu estilo");
  await expect(page.getByLabel("Precio (€)", { exact: true })).toHaveValue(
    "8.5",
  );
  await expect(page.getByLabel("Duración (min)", { exact: true })).toHaveValue(
    "60",
  );
  await page.getByRole("tab", { name: "Agenda", exact: true }).click();
  await page.getByLabel("Fecha de agenda").fill(past);
  const appointment = page
    .locator(".admin-appointment")
    .filter({ hasText: "09:00" });
  await expect(appointment.locator(".admin-appt-details")).toContainText("7 €");
  await appointment
    .getByRole("button", { name: "Completar", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Cita completada.");
  await expect(
    page.locator(".admin-stats>div").nth(2).locator("strong"),
  ).toHaveText("7 €");
});

test("guarda turnos, rechaza horarios y bloqueos inválidos y permite eliminar descansos", async ({
  page,
}) => {
  const { future } = await seedAppointments(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Horarios", exact: true }).click();
  await page.getByRole("button", { name: "Mañanas", exact: true }).click();
  await page.getByRole("button", { name: "Guardar horarios" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Horarios y preferencias guardados.",
  );
  expect(
    await page.evaluate(() => {
      const hours = (
        JSON.parse(localStorage.getItem("barbercruz.demo.v1")!) as AppData
      ).settings.openingHours;
      return (
        hours[1].start === "10:00" && hours[1].end === "14:00" && !hours[0].open
      );
    }),
  ).toBe(true);
  await page.getByLabel("Cierre del lunes").fill("09:00");
  await page.getByRole("button", { name: "Guardar horarios" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "La hora de cierre debe ser posterior",
  );
  await page.getByLabel("Cierre del lunes").fill("14:00");
  const block = page.locator(".admin-block-form");
  await block.getByLabel("Fecha", { exact: true }).fill(future);
  await block.getByLabel("Desde", { exact: true }).fill("11:00");
  await block.getByLabel("Hasta", { exact: true }).fill("11:30");
  await block.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Hay una cita en ese intervalo",
  );
  await block.getByLabel("Desde", { exact: true }).fill("13:30");
  await block.getByLabel("Hasta", { exact: true }).fill("14:00");
  await block.getByLabel("Motivo (opcional)", { exact: true }).fill("Descanso");
  await block.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(page.locator(".admin-block-list")).toContainText("Descanso");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: `Eliminar bloqueo del ${future} a las 13:30` })
    .click();
  await expect(page.getByRole("status")).toContainText("Bloqueo eliminado.");
  await expect(page.locator(".admin-block-list")).toHaveCount(0);
});

test("edita fecha, hora y notas; conserva las condiciones de la cita y el cliente recibe su sello", async ({
  page,
}) => {
  const { future, past, nextFuture } = await seedAppointments(page);
  await page.getByRole("tab", { name: "Servicios", exact: true }).click();
  await page.getByLabel("Duración (min)", { exact: true }).fill("60");
  await page.getByRole("button", { name: "Guardar servicios" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Servicios actualizados.",
  );
  await page.getByRole("tab", { name: "Agenda", exact: true }).click();
  await page.getByLabel("Mostrar fechas").selectOption("upcoming");
  const appointment = page
    .locator(".admin-appointment")
    .filter({ hasText: "11:00" });
  await expect(
    appointment.getByRole("button", { name: "Completar", exact: true }),
  ).toBeDisabled();
  await appointment
    .getByRole("button", { name: "Editar cita", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Editar cita" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    appointment.getByRole("button", { name: "Editar cita", exact: true }),
  ).toBeFocused();
  await appointment
    .getByRole("button", { name: "Editar cita", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Editar cita" });
  await expect(dialog.getByLabel("Nueva fecha")).toHaveValue(future);
  await expect(dialog.getByLabel("Hora disponible")).toHaveValue("11:00");
  await expect(dialog.getByLabel("Notas de la cita (opcional)")).toHaveValue(
    "Cita de prueba del panel",
  );
  await expect(
    dialog.getByLabel("Hora disponible").locator('option[value="11:45"]'),
  ).toHaveCount(1);
  await expect(
    dialog.getByLabel("Hora disponible").locator('option[value="12:15"]'),
  ).toHaveCount(0);
  await dialog.getByLabel("Nueva fecha").fill(nextFuture);
  await dialog.getByLabel("Hora disponible").selectOption("11:45");
  await dialog
    .getByLabel("Notas de la cita (opcional)")
    .fill("El cliente ha llamado para cambiar el día y la hora.");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await openAdmin(page);
  await page.getByLabel("Mostrar fechas").selectOption("upcoming");
  const editedAppointment = page
    .locator(".admin-appointment")
    .filter({ hasText: "11:45" });
  await expect(editedAppointment).toContainText("Alex");
  await expect(editedAppointment).toContainText(
    "El cliente ha llamado para cambiar el día y la hora.",
  );
  expect(
    await page.evaluate(() => {
      const data = JSON.parse(
        localStorage.getItem("barbercruz.demo.v1")!,
      ) as AppData;
      const appointment = data.appointments.find(
        (item) => item.id === "admin-test-move",
      )!;
      return {
        date: appointment.date,
        time: appointment.time,
        duration: appointment.duration,
        price: appointment.price,
      };
    }),
  ).toEqual({ date: nextFuture, time: "11:45", duration: 45, price: 7 });
  await editedAppointment
    .getByRole("button", { name: "Editar cita", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Editar cita" });
  await expect(dialog.getByLabel("Nueva fecha")).toHaveValue(nextFuture);
  await expect(dialog.getByLabel("Hora disponible")).toHaveValue("11:45");
  await dialog
    .getByLabel("Notas de la cita (opcional)")
    .fill("Solo ha cambiado la nota; mantenemos la cita.");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator(".admin-appointment").filter({ hasText: "11:45" }),
  ).toContainText("Solo ha cambiado la nota; mantenemos la cita.");
  await page.getByRole("button", { name: "Cancelar cita de Dani" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sí, cancelar cita" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .locator(".admin-appointment")
      .filter({ hasText: "Dani" })
      .locator(".admin-status"),
  ).toHaveText("Cancelada");
  await page.getByLabel("Fecha de agenda").fill(past);
  await page
    .locator(".admin-appointment")
    .filter({ hasText: "09:00" })
    .getByRole("button", { name: "Completar", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Cita completada.");
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Entrar", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Probar como cliente" }).click();
  await page
    .getByRole("button", { name: "Club Cruz", exact: false })
    .first()
    .click();
  await expect(page.locator(".loyalty-bottom")).toContainText("4 de 7");
  await expect(page.locator(".loyalty-card .stamp.earned")).toHaveCount(4);
});

test("busca clientes, edita su perfil y conserva los cambios para el propio cliente", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("tab", { name: "Clientes", exact: true }).click();
  const search = page.getByRole("searchbox", {
    name: "Buscar clientes por nombre o correo",
  });
  await expect(page.locator(".admin-client")).toHaveCount(2);
  await expect(page.locator(".admin-clients-list")).not.toContainText("Cruz");
  await search.fill("alex");
  await expect(page.locator(".admin-client")).toHaveCount(1);
  await page.getByRole("button", { name: "Editar perfil de Alex" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar cliente" });
  await dialog.getByLabel("Nombre del cliente").fill("Alex Renovado");
  await dialog.getByLabel("Estilo favorito").selectOption("Taper fade");
  await dialog
    .getByLabel("Sobre el cliente")
    .fill("Laterales cortos, arriba largo.");
  await dialog.getByRole("button", { name: "Avatar 👑" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Guardar perfil", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Perfil del cliente actualizado.",
  );
  await expect(page.locator(".admin-client")).toContainText("Alex Renovado");
  await expect(page.locator(".admin-client")).toContainText("Taper fade");
  const email = await page
    .locator(".admin-client-details > p")
    .first()
    .innerText();
  await search.fill(email);
  await expect(page.locator(".admin-client")).toHaveCount(1);
  await search.fill("cliente inexistente");
  await expect(page.getByText("No encontramos ese cliente")).toBeVisible();
  await page.reload();
  await openAdmin(page);
  await page.getByRole("tab", { name: "Clientes", exact: true }).click();
  await expect(
    page.locator(".admin-client").filter({ hasText: "Alex Renovado" }),
  ).toContainText("Taper fade");
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Entrar", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Probar como cliente" }).click();
  await page.getByRole("button", { name: "Menú de mi cuenta" }).click();
  await page
    .locator(".account-dropdown")
    .getByRole("button", { name: "Mi perfil", exact: true })
    .click();
  const ownProfile = page.getByRole("dialog", { name: "Editar mi perfil" });
  await expect(ownProfile.getByLabel("Tu nombre")).toHaveValue("Alex Renovado");
  await expect(ownProfile.getByLabel("Tu estilo favorito")).toHaveValue(
    "Taper fade",
  );
  await expect(ownProfile.getByLabel("Un poco sobre ti")).toHaveValue(
    "Laterales cortos, arriba largo.",
  );
  await expect(
    ownProfile.getByRole("button", { name: "Avatar 👑" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("elimina un cliente solo tras confirmar y borra también sus citas y puntos", async ({
  page,
}) => {
  await seedAppointments(page);
  await page.getByRole("tab", { name: "Clientes", exact: true }).click();
  await page.getByRole("button", { name: "Eliminar cuenta de Alex" }).click();
  let dialog = page.getByRole("dialog", { name: "Eliminar cliente" });
  const deletion = dialog.getByRole("button", {
    name: "Eliminar cuenta definitivamente",
  });
  await expect(deletion).toBeDisabled();
  await dialog.getByLabel("Escribe ELIMINAR para confirmar").fill("eliminar");
  await expect(deletion).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".admin-client")).toHaveCount(2);
  await page.getByRole("button", { name: "Eliminar cuenta de Alex" }).click();
  dialog = page.getByRole("dialog", { name: "Eliminar cliente" });
  await dialog.getByLabel("Escribe ELIMINAR para confirmar").fill("ELIMINAR");
  await dialog
    .getByRole("button", { name: "Eliminar cuenta definitivamente" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Cuenta del cliente eliminada.",
  );
  await expect(page.locator(".admin-client")).toHaveCount(1);
  await expect(page.locator(".admin-client")).toContainText("Dani");
  expect(
    await page.evaluate(() => {
      const data = JSON.parse(
        localStorage.getItem("barbercruz.demo.v1")!,
      ) as AppData;
      return {
        profileExists: data.profiles.some(
          (profile) => profile.id === "demo-customer",
        ),
        appointmentsExist: data.appointments.some(
          (appointment) => appointment.userId === "demo-customer",
        ),
        adminExists: data.profiles.some((profile) => profile.role === "admin"),
      };
    }),
  ).toEqual({
    profileExists: false,
    appointmentsExist: false,
    adminExists: true,
  });
  await page.reload();
  await openAdmin(page);
  await page.getByRole("tab", { name: "Clientes", exact: true }).click();
  await expect(page.locator(".admin-client")).toHaveCount(1);
  await page.getByRole("tab", { name: "Agenda", exact: true }).click();
  await page.getByLabel("Mostrar fechas").selectOption("all");
  await expect(page.locator(".admin-agenda-card")).not.toContainText("Alex");
});
