# Conectar Barber Cruz a Supabase

La aplicación funciona en modo demo local cuando faltan las dos variables de Supabase. Las reservas de la demo se guardan en ese navegador: para compartir citas entre móviles hay que conectar el backend y publicar la web con HTTPS.

## 1. Crear las tablas

En un proyecto de Supabase, abre **SQL Editor** y ejecuta el contenido completo de [schema.sql](schema.sql). Crea las tablas, las políticas de acceso, las funciones de reserva y el perfil al registrarse. Puedes volver a ejecutar el archivo sin perder citas ni reemplazar horarios o precios que ya hayas editado.

La configuración inicial es un **corte de pelo de 7 € y 45 minutos**, de lunes a sábado de **10:00 a 20:00**, con turnos cada 15 minutos y reservas hasta 30 días antes. El domingo está cerrado. Son valores iniciales que el administrador puede cambiar. La zona horaria es **Europe/Madrid**, incluidos los cambios de hora de verano.

Si Supabase ya tiene la publicación `supabase_realtime`, el script añade estas tablas a ella sin reemplazar sus tablas anteriores. Las políticas también limitan qué cambios puede recibir cada usuario.

## 2. Activar el acceso con Google

1. En Google Cloud Console, configura una pantalla de consentimiento OAuth para tu aplicación. Si está en modo de pruebas, añade los correos que podrán entrar como usuarios de prueba; para clientes generales necesitará estar disponible para esos usuarios.
2. Crea un cliente OAuth de tipo **Aplicación web**. En **URI de redirección autorizados**, añade el callback exacto que indica **Supabase → Authentication → Sign In / Providers → Google**: normalmente `https://TU_PROYECTO.supabase.co/auth/v1/callback`.
3. En ese proveedor de Supabase, activa Google e introduce el identificador y el secreto OAuth de Google. Guarda el secreto únicamente en Supabase, nunca en el repositorio, las variables `VITE_` o el chat.
4. En **Supabase → Authentication → URL Configuration**, establece **Site URL** como el origen HTTPS final, por ejemplo `https://barbercruz.example`. Añade ese origen a **Redirect URLs**, junto con `http://localhost:5173` para desarrollo. Si usas otro puerto local, añade también ese origen exacto. La aplicación vuelve a `window.location.origin` después del acceso.

## 3. Conectar la aplicación

Copia `.env.example` a `.env.local` y rellena:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
```

Usa la clave pública **anon** o **publishable** del proyecto. La clave `service_role` o una clave secreta daría acceso privilegiado: **nunca debe entrar en el frontend**. Estas dos variables públicas identifican el proyecto; las políticas SQL son las que protegen las citas y los perfiles.

En el alojamiento configura las mismas variables antes de compilar. Vite las incorpora al build; después de modificarlas hay que volver a compilar y publicar. No añadas `.env.local` a Git.

## 4. Crear el administrador con correo y contraseña

El botón de administración de prueba solo existe en desarrollo local. **La web compilada y publicada no permite entrar como administrador de demo**, ni restaura una sesión local de admin de versiones anteriores. No hay contraseña predeterminada ni una contraseña dentro del código.

1. En Supabase, comprueba que **Authentication → Sign In / Providers → Email** está activado.
2. En **Authentication → Users → Add user → Create new user**, crea la cuenta de tu amigo con su correo y una contraseña única de al menos 12 caracteres. Introduce la contraseña directamente en Supabase; no la compartas en el chat ni la incluyas en variables `VITE_`. Confirma/verifica el correo según las opciones del panel.
3. Ejecuta en el SQL Editor, sustituyendo el correo por el de esa cuenta:

```sql
update public.profiles
set role = 'admin'
where lower(email) = lower('correo-real-de-tu-amigo@example.com');
```

Comprueba que se actualiza una sola fila y que corresponde a tu amigo. Después, en Barber Cruz: **Entrar → Acceso de administrador**, introduce ese correo y contraseña. Una cuenta con rol `customer` será rechazada por este acceso. Las políticas SQL también comprueban el rol al gestionar citas, precios y horarios; no basta con cambiar un dato en el navegador.

Tu amigo podrá cambiar su contraseña desde **Mi perfil → Contraseña de administrador**. La contraseña solo se envía a Supabase Auth por HTTPS, nunca se guarda en el almacenamiento local de la demo ni en el repositorio. Activa las opciones de seguridad de contraseñas y de cambio de contraseña de Supabase; si requiere autenticación reciente, vuelve a iniciar sesión antes de cambiarla.

Si prefieres Google para el administrador, configura el proveedor descrito arriba, inicia sesión una vez con su cuenta y asigna el rol a ese perfil con el mismo SQL. El acceso de clientes con Google puede configurarse después; no es necesario para habilitar primero el administrador con correo y contraseña.

## 5. Reservas y puntos

- Los clientes ven su perfil y sus propias citas. El administrador ve los perfiles y la agenda completa, cambia horarios/precios, bloquea horas, mueve citas pendientes y las completa o cancela.
- Una reserva se confirma mediante `book_appointment`: la base de datos vuelve a comprobar horario, antelación, duración, bloqueos y solapamientos. Un bloqueo no se puede añadir encima de una cita activa; hay que moverla o cancelarla primero.
- Las reservas simultáneas se serializan por día. Los puntos se serializan además por cliente, de modo que dos reservas no pueden gastar el mismo regalo a la vez.
- Cada corte pagado que el administrador marque como completado da un sello. Tras **7 cortes pagados**, el siguiente corte de pelo puede canjearse gratis. El corte gratis no genera otro sello. Un regalo ya reservado queda apartado; si se cancela, vuelve a estar disponible.
- Solo `cut` permite canjear el regalo; `cut` y un posible servicio `combo` cuentan como cortes pagados. Un posible servicio `beard` no cuenta. El catálogo inicial contiene únicamente `cut`.
- Los clientes pueden cancelar sus citas futuras pendientes. Las citas completadas o canceladas no se pueden reabrir ni eliminar a través de la API. El administrador solo puede completar una cita que ya haya terminado, respetando su duración original.
- La disponibilidad pública muestra únicamente hora y duración ocupadas, incluyendo bloqueos. Nunca muestra clientes, emails, notas ni identificadores de otras citas.

Los pagos no se procesan en la web: «pagado» representa un corte normal completado por el administrador, frente a una cita gratis canjeada. El precio y los horarios definitivos debe validarlos el barbero antes de compartir el enlace.

## 6. Comprobar antes de compartirla

Conecta dos cuentas de Google distintas y comprueba una reserva real: la segunda cuenta debe ver el turno ocupado y no poder leer la cita ni el perfil de la primera. Comprueba también que un cliente no puede abrir el panel administrativo, que la cuenta de tu amigo sí puede gestionar esa cita y que cancelarla libera el turno.

Para validar los puntos en producción, usa citas realmente completadas; no alteres el estado desde una cuenta cliente. En móviles, la instalación en la pantalla de inicio y el acceso con Google requieren comprobarse en el dominio HTTPS final.

El esquema se ha ejecutado y comprobado en PostgreSQL 17 con roles `anon` y `authenticated` y una simulación local de `auth.uid()`: acceso por fila, reserva/cancelación, restricciones de administrador, duración y precio conservados al mover citas o editar el catálogo, precio cero en canjes y cálculo de regalos. También se probaron dos transacciones simultáneas intentando reservar el mismo turno y otras dos intentando gastar el mismo regalo en días distintos: solo una reserva se confirmó en cada caso. La migración del precio y sus ejecuciones repetidas se comprobaron sin alterar los precios ya guardados. Esto valida la lógica SQL; el acceso real con Google y la conexión al proyecto de Supabase deben comprobarse después de configurarlos.

## Contrato de la API

| Recurso | Campos relevantes | Acceso |
| --- | --- | --- |
| `profiles` | `id`, `name`, `email`, `avatar`, `bio`, `preferred_style`, `role` | Propio perfil o administrador; cada usuario edita su nombre, avatar, bio y estilo |
| `services` | `id`, `name`, `description`, `duration`, `price`, `icon` | Lectura pública; escritura del administrador |
| `settings` | `id = 'singleton'`, `payload` | Lectura pública; el administrador edita `payload` |
| `blocks` | `id`, `date`, `starts_at`, `ends_at`, `note` | Solo administrador |
| `appointments` | `id`, `user_id`, `service_id`, `date`, `time`, `duration`, `price`, `status`, `redemption`, `note`, `created_at` | Citas propias o administrador; reserva por RPC |

`settings.payload` tiene la forma camelCase `Settings` de `src/lib/types.ts`; los días van de `0` (domingo) a `6` (sábado). `appointments.duration` y `appointments.price` conservan la duración y el precio de la reserva, aunque cambie el catálogo o se mueva la cita. Un canje tiene precio `0`. Si el administrador cambia el servicio o el canje de una cita pendiente, se toma el precio actual correspondiente. Las fechas son `YYYY-MM-DD`, las horas de tabla `HH:mm:ss` y los estados `confirmed`, `completed` o `cancelled`.

Si ya habías ejecutado una versión del esquema sin el campo `price`, al ejecutarlo de nuevo se añade y se rellenan únicamente esas citas anteriores con el precio actual de su servicio (o `0` para canjes). Los precios anteriores a esa migración no se pueden reconstruir; a partir de entonces quedan conservados.

```ts
// La identidad la toma el servidor de la sesión, no del cuerpo enviado.
await supabase.rpc('book_appointment', {
  p_service_id: 'cut',
  p_date: '2026-10-20',
  p_time: '17:00',
  p_redemption: false,
  p_note: '',
}) // Devuelve una fila appointments.

await supabase.rpc('booked_intervals', { p_date: '2026-10-20' })
// Devuelve [{ time: '17:00', duration: 45 }, ...], sin datos personales.
```
