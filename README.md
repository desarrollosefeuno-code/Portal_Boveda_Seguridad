# F1 KeyVault & Fortress | Portal de Bóveda Ultra-Segura

Portal corporativo independiente y autónomo diseñado para la gestión y resguardo centralizado de **Contraseñas de Portales** y **Llaves, Tokens y Secretos Técnicos de Infraestructura**, con cifrado de grado militar **AES-256-GCM**, doble barrera de acceso (Login + PIN Maestro de 4 dígitos) y bitácora inmutable de auditoría.

---

## 🛡️ Características Principales

### 1. Separación Arquitectónica de Secretos
* **🌐 Contraseñas de Portales y Accesos Web:**
  * Plataformas web, sistemas de clientes, SaaS, correos y paneles de administración.
  * URL de acceso directo en 1 clic, usuario/correo, contraseña cifrada, generador avanzado de contraseñas (con medidor de entropía), campos adicionales dinámicos (RUT Empresa, Clave secundaria, Preguntas secretas), notas seguras y etiquetas.
* **🔑 Llaves, Tokens y Secretos Técnicos:**
  * Almacenamiento especializado para:
    * `API_KEY`: API Keys y Webhooks de integración.
    * `TOKEN`: Bearer Tokens, JWT y OAuth Secrets.
    * `SSH_KEY`: Claves SSH privadas y públicas para servidores y bastiones.
    * `DATABASE`: Cadenas de conexión DSN y passwords de Bases de Datos.
    * `PIN_CODE`: PINs numéricos de acceso físico a recintos o tarjetas.
    * `CERTIFICATE`: Certificados SSL/TLS y licencias de software.
  * Clasificación por entorno: `PROD` (Producción), `STAGING` (Pre-prod), `QA` (Pruebas) y `DEV` (Desarrollo).
  * Fecha de expiración y aviso de vencimiento/renovación periódica.

### 2. Cifrado Autenticado de Grado Militar (AES-256-GCM)
* Todo dato sensible se cifra en el servidor antes de guardarse en PostgreSQL utilizando **AES-256-GCM**.
* Clave simétrica derivada mediante **scrypt** a partir de `MASTER_ENCRYPTION_KEY`.
* Vector de inicialización único de 12 bytes (`iv`) y etiqueta de autenticación de 16 bytes (`authTag`) por cada registro cifrado.
* Detección inmediata y rechazo ante cualquier manipulación del texto cifrado o la etiqueta.

### 3. Doble Factor de Acceso (Login + PIN Maestro Verbal)
* **Paso 1:** Inicio de sesión del usuario con email y contraseña (hasheada con `scrypt`), generando cookie de sesión segura `HttpOnly`.
* **Paso 2:** Desbloqueo verbal de la bóveda mediante código PIN numérico de 4 dígitos validado en tiempo constante (`crypto.timingSafeEqual`).
* **Protección Anti-Fuerza Bruta:** Tras 5 intentos fallidos consecutivos, la bóveda se bloquea temporalmente por 15 minutos (`429 Too Many Requests`).
* **Sesión Efímera:** El desbloqueo emite un token efímero con caducidad automática de 15 minutos por inactividad y botón de bloqueo instantáneo.

### 4. Blindaje Total Anti-Autocompletado de Navegadores
* Eliminación definitiva de inyecciones involuntarias del correo del usuario por parte de Chrome / Edge:
  * Casillas de PIN y buscadores con `autoComplete="one-time-code"`.
  * Formulario señuelo invisible (*Decoy Trap*) fuera de pantalla.
  * Modo `readOnly` dinámico hasta foco o clic activo del usuario.
  * Watchdog nativo a nivel de DOM mediante `useRef` y eventos del navegador.

### 5. Bitácora Inmutable de Auditoría
* Registro cronológico y detallado de cada acción: inicios de sesión, fallos de clave, desbloqueos de bóveda, revelación de contraseñas, copiado al portapapeles y modificaciones de registros, con marca de tiempo, usuario, dirección IP y User-Agent.

### 6. Gestión de Usuarios y Roles
* Administración de colaboradores con roles `admin` y `operator`.
* Creación de usuarios, reseteo de contraseñas y activación/desactivación de cuentas.

---

## 🚀 Despliegue en Railway (Paso a Paso)

Este proyecto está 100% optimizado para desplegarse como un servicio único en **Railway** (Node.js + Express + Vite + PostgreSQL).

### Paso 1: Crear el Proyecto en Railway
1. Inicia sesión en [Railway.app](https://railway.app/).
2. Haz clic en **"New Project"** -> **"Deploy from GitHub repo"**.
3. Selecciona el repositorio `desarrollosefeuno-code/Portal_Boveda_Seguridad`.

### Paso 2: Agregar la Base de Datos PostgreSQL
1. Dentro del proyecto en Railway, presiona el botón **"+ New"** -> **"Database"** -> **"Add PostgreSQL"**.
2. Railway aprovisionará la base de datos y generará automáticamente la variable `DATABASE_URL`.

### Paso 3: Conectar las Variables de Entorno
En el servicio del portal (Node.js), dirígete a la pestaña **Variables** y agrega:

| Variable | Descripción | Ejemplo / Valor Recomendado |
|---|---|---|
| `DATABASE_URL` | Conexión a Postgres | `${{Postgres.DATABASE_URL}}` (Variable de referencia de Railway) |
| `NODE_ENV` | Entorno | `production` |
| `MASTER_ENCRYPTION_KEY` | Llave secreta para cifrado AES-256-GCM | Genera una frase aleatoria de 32 a 64 caracteres |
| `JWT_SECRET` | Secreto para firmas de sesión | Genera una cadena aleatoria de mínimo 32 caracteres |
| `DEFAULT_ADMIN_EMAIL` | Correo del Administrador inicial | `admin@f1.services` |
| `DEFAULT_ADMIN_PASSWORD` | Contraseña inicial del Administrador | `AdminFortress2026!` *(Cámbiala en tu primer acceso)* |
| `DEFAULT_VAULT_PIN` | PIN inicial de 4 dígitos | `1234` *(Cámbialo en Ajustes de Seguridad)* |

> **Nota:** Railway inyecta la variable `PORT` automáticamente al contenedor.

### Paso 4: Despliegue Automático
* Railway detectará el archivo [railway.json](railway.json) y compilará la aplicación mediante **Nixpacks**:
  * Build: `npm run build` (compila el frontend Vite a `dist/client` y el backend a `dist/server`).
  * Start: `npm start` (ejecuta el servidor Express en `node dist/server/index.js`).
* Al iniciar, el servidor ejecutará automáticamente `ensureDatabaseSchema()`, creando las tablas, el usuario administrador inicial y el PIN maestro.
* Asigna un dominio público en Railway (pestaña **Settings** -> **Generate Domain**) y el portal quedará operativo de inmediato.

---

## 💻 Desarrollo Local

### Requisitos
* Node.js v20 o superior.
* PostgreSQL local o instancia remota (Neon / Railway / Supabase).

### Instalación
```bash
# Instalar dependencias
npm install

# Copiar variables de entorno
cp .env.example .env
```

Configura tu `.env` con tu `DATABASE_URL` local.

### Ejecución
```bash
# Modo desarrollo con recarga en caliente (Hot Reload)
# Terminal 1 (Servidor Express en puerto 3001):
npm run dev:server

# Terminal 2 (Cliente Vite en puerto 3000 con proxy a /api):
npm run dev
```

Abre tu navegador en `http://localhost:3000`.

### Pruebas Automatizadas
```bash
npm test
```
Ejecuta la suite criptográfica verificando cifrado AES-256-GCM, rechazo de manipulaciones (AuthTag), hash scrypt y validación en tiempo constante.

---

## 🔒 Estándar de Seguridad

* **OWASP ASVS Level 2:** Cifrado autenticado para todo dato en reposo, cookies `HttpOnly`, `SameSite=Strict`, prevención de inyecciones SQL con consultas parametrizadas, tokens efímeros firmados y cabeceras estrictas (`nosniff`, `DENY`, `HSTS`).
* **Calificación SecurityScorecard:** Apto para máxima calificación en seguridad corporativa.
