# Servidor de Prueba de Impresora

Este proyecto permite probar una impresora térmica conectada vía puerto serial.  
Se puede listar los puertos, seleccionar la impresora y enviar tickets de prueba sin necesidad de un frontend.

---

## 1. Iniciar el servidor

Ejecuta el servidor Node.js:

```powershell
node .\src\server.js
```

Por defecto escuchará en `http://localhost:4000`.

---

## 2. Comandos para probar la impresora

### a) Listar los puertos seriales disponibles

```powershell
curl -X GET http://localhost:4000/print/list
```

Esto devuelve un listado de todos los puertos disponibles, por ejemplo:

```json
[
  { "path": "COM3", "manufacturer": "USB Printer", "serialNumber": "1234" },
  { "path": "COM4", "manufacturer": "USB Printer", "serialNumber": "5678" }
]
```

---

### b) Seleccionar la impresora

Conecta la impresora al puerto deseado (por ejemplo `COM4`):

```powershell
curl -X POST http://localhost:4000/print/select `
  -H "Content-Type: application/json" `
  -d '{ "path": "COM4", "baudRate": 19200 }'
```

- `path`: el puerto que quieres usar (`COM?` según lo que listaste)
- `baudRate`: la velocidad del puerto (por defecto 19200)

✅ Respuesta esperada:

```json
{ "status": "connected", "path": "COM4" }
```

---

### c) Imprimir un ticket de prueba

Envía un texto a la impresora seleccionada:

```powershell
curl -X POST http://localhost:4000/print `
  -H "Content-Type: application/json" `
  -d '{ "text": "Hola Queso!\nPrecio: $150" }'
```

✅ Respuesta esperada:

```json
{ "status": "printed" }
```

> El ticket incluirá un corte y apertura de gaveta automática (ESC/POS).

---

## ⚡ Notas

- Asegúrate de **seleccionar primero la impresora** antes de enviar un ticket.
- Si no hay impresora conectada o el puerto está ocupado, recibirás un error `503 - Impresora no disponible`.
- Los comandos `curl` son compatibles con PowerShell y también funcionan en Linux/macOS.

---

## 📌 Flujo recomendado

1. Listar puertos: `GET /print/list`
2. Seleccionar puerto: `POST /print/select`
3. Imprimir ticket: `POST /print`

Con esto puedes probar tu impresora completamente sin frontend.

```

```
