# Puente local de impresión

Aplicación local para que sistemas web de ventas e inventario puedan enviar
impresiones al equipo del usuario. El prototipo actual admite puertos COM y
tickets de texto ESC/POS en Windows.

## Empezar

Usar Node con **nvm-windows** (versión en `.nvmrc`) y **pnpm 11.19.0**.
Consulta [la guía de Windows](docs/WINDOWS.md) para preparar el entorno,
probar una impresora y autorizar tus aplicaciones web.

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm start
```

Interfaz local: http://127.0.0.1:4000.

## Estructura

```text
src/
  app.js                    Configuración HTTP y acceso local
  server.js                 Inicio y cierre del proceso
  routes/print.routes.js    Contrato y validación de la API
  services/printer.service.js Conexión serial y cola de envíos
public/                     Interfaz HTML, CSS y JavaScript
scripts/                    Herramientas del proyecto
test/                       Pruebas de API y transporte simulado
docs/                       Guía de Windows y siguientes etapas
dist/                       Artefactos generados (ejecutable histórico)
```

No se añaden capas vacías para funciones futuras. El servicio de impresión
está separado de HTTP para poder incorporar otros transportes posteriormente.

## Estado y límites

- Conexión serial confirmada solo después de abrir el puerto.
- Envíos y cambios de conexión serializados; comandos ESC/POS binarios.
- Gaveta desactivada por defecto; respuesta `sent` indica envío, no papel impreso.
- Acceso limitado a loopback y orígenes web autorizados explícitamente.
- Pruebas automatizadas con transporte simulado; no sustituyen la prueba física.
- Pendientes: autenticación/emparejamiento, aislamiento por tenant, etiquetas,
  spooler de Windows, transportes de red, ejecutable actualizado e instalador.

El ejecutable antiguo en `dist/` no contiene los cambios actuales. Primero se
validará el hardware y después se definirá y comprobará el empaquetado.

Aplicación de escritorio: consulta [bandeja, configuración y compilación](docs/DESKTOP.md). Código preparado; pendiente de validación manual y nueva compilación.
