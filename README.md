# F1 KeyVault — Bóveda de Seguridad

Portal corporativo para guardar **contraseñas de portales** y **llaves, tokens y secretos técnicos** de F1+.
Express + PostgreSQL en el servidor, React 19 + Kit F1+ (tema Matrix) en el cliente. Se despliega como un solo servicio en Railway.

## Cómo protege los secretos

| Capa | Qué hace |
|---|---|
| Cifrado en reposo | AES-256-GCM. La clave se deriva una vez al arrancar desde `MASTER_ENCRYPTION_KEY`. Cada valor queda atado a su tabla, registro y campo (AAD): copiar un cifrado a otro registro no sirve. |
| Sesión | Cookie `HttpOnly`, `SameSite=Strict` y `Secure`. Expira en 8 h. En cada petición se comprueban en la BD el estado, el rol y la versión de sesión, así que cerrar sesión, deshabilitar o cambiar la contraseña la revocan al instante. |
| PIN personal | Cada usuario tiene su propio PIN de 6 dígitos y su propio bloqueo: 5 intentos fallidos lo bloquean 15 minutos. El contador corre en una transacción con la fila bloqueada, así que las peticiones en paralelo no lo saltan. |
| Token de bóveda | Cookie `HttpOnly` ligada al usuario y a su sesión. Expira tras 15 min de inactividad (2 h como máximo). "Bloquear" lo invalida en el servidor. |
| Revelación | El listado no trae secretos. Cada vez que alguien ve, copia o abre un secreto para editarlo, el servidor lo registra **antes** de entregarlo; si no puede registrarlo, no lo entrega. |
| Bitácora | La base de datos rechaza `UPDATE`, `DELETE` y `TRUNCATE` sobre `vault_audit_logs`. La IP se toma según `TRUST_PROXY`. |
| Permisos | Los roles son `admin` y `operator`. Cada operador ve solo las llaves de los entornos que se le habilitaron. La papelera y el historial de versiones son solo para administradores. |
| Segregación | Otorgar el rol admin requiere la aprobación de otro admin. Nadie se cambia a sí mismo rol, estado, contraseña ni PIN desde la gestión de usuarios. El último admin no se puede quitar. |
| Navegador | CSP estricta (`script-src 'self'`, sin recursos externos), HSTS, `frame-ancestors 'none'`, protección CSRF por cabecera propia y por `Origin`, y límites de peticiones. |

## Variables de entorno

Están descritas en [.env.example](.env.example). Las obligatorias son `DATABASE_URL`, `MASTER_ENCRYPTION_KEY` y `JWT_SECRET`: el servidor **no arranca** si falta alguna, si tiene menos de 32 caracteres o si es un valor publicado en versiones anteriores.

> ⚠️ **Respalda `MASTER_ENCRYPTION_KEY` fuera de Railway.** Sin ella no hay forma de descifrar los datos.

### Rotar la clave maestra
1. Copia el valor actual a `MASTER_ENCRYPTION_KEY_PREVIOUS` y define un valor nuevo en `MASTER_ENCRYPTION_KEY`.
2. Redespliega. Al arrancar, el servidor re-cifra en segundo plano todo lo que usaba la clave anterior y lo anota en los logs (`[cifrado] Re-cifrado a v2: …`).
3. Cuando el log confirme que no hubo errores, borra `MASTER_ENCRYPTION_KEY_PREVIOUS` y redespliega.

## Despliegue en Railway

1. Crea el servicio desde el repositorio y agrega un PostgreSQL.
2. Carga las variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `NODE_ENV=production`, `MASTER_ENCRYPTION_KEY`, `JWT_SECRET` y, solo para el primer arranque con la base vacía, `DEFAULT_ADMIN_EMAIL` y `DEFAULT_ADMIN_PASSWORD`.
3. Railway usa [railway.json](railway.json): compila con `npm run build`, inicia con `npm start` y revisa `/api/health`, que responde 503 si la BD no contesta.
4. Al arrancar, el servidor aplica las migraciones pendientes ([server/db/migrations.ts](server/db/migrations.ts)) y re-cifra los datos heredados.
5. Si la conexión a PostgreSQL falla por un certificado autofirmado, carga la CA en `DATABASE_SSL_CA`. Como último recurso, usa `DATABASE_SSL=no-verify`.

### Migrar desde la versión 1.x
- Las sesiones anteriores dejan de valer: todos vuelven a iniciar sesión.
- El PIN compartido de 4 dígitos ya no se usa. Cada persona crea su PIN personal en su próximo ingreso, confirmando con su contraseña. La tabla `vault_config` queda sin uso y se eliminará en una versión futura.
- Las cuentas que seguían con la contraseña publicada en la v1 quedan obligadas a cambiarla al entrar.
- Revisa en los logs de Railway del primer arranque de la v1 si aparecieron la contraseña inicial o el PIN en texto plano. Si fue así, cámbialos.

## Desarrollo local

```bash
npm install
cp .env.example .env   # y completa los valores
npm run dev:server     # API en :3001
npm run dev            # cliente en :3000 con proxy a /api
```

Demo sin base de datos, con PostgreSQL en memoria y datos ficticios:

```bash
npm run build:client && npm run dev:demo
```

Las credenciales de demostración están en [scripts/dev-demo.ts](scripts/dev-demo.ts) y solo existen mientras la demo corre.

## Pruebas

```bash
npm test          # criptografía + API completa contra PostgreSQL en memoria (PGlite)
npm run typecheck
npm run build
```

Las pruebas de API cubren:
- configuración insegura;
- bloqueo de login y de PIN, incluso con intentos en paralelo;
- revocación de sesiones y del token de bóveda;
- CSRF y orígenes;
- listado sin secretos y revelación auditada;
- versiones, papelera e historial;
- permisos por entorno;
- inmutabilidad de la bitácora;
- segregación de funciones.

## Estructura

```
server/
  config.ts              variables validadas al arrancar
  app.ts / index.ts      aplicación Express y arranque
  db/                    conexión, migraciones versionadas, tareas de arranque
  middleware/            sesión, bóveda, cabeceras, CSRF/CORS, límites
  routes/                auth, PIN, ítems (contraseñas y llaves), bitácora, usuarios
  services/              cifrado y bitácora
  validation.ts          esquemas Zod de toda entrada
src/
  components/f1-ui/      Kit F1+ (copiado sin editar, v1.6.0)
  components/            vistas del portal
  index.css              tema Matrix sobre los tokens del kit
tests/                   pruebas (node:test + PGlite)
scripts/dev-demo.ts      demo local en memoria
```
