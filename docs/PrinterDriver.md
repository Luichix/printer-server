**No tuve errores al crear la impresora.** Usé una herramienta de administración de Windows para asociar el controlador ya instalado **POS-80C** al puerto **USB004**, sin pasar por el asistente que se te cerraba.

No puedo confirmar por qué se cerraba: podría ser un fallo del asistente o del instalador. El controlador sí funcionó, como comprobamos con el ticket.

Para hacerlo tú en otro equipo:

1. Instala el paquete **RPT Drivers de 3nStar**.
2. Conecta y enciende la impresora.
3. Abre **PowerShell como administrador**.
4. Comprueba los controladores instalados:

   ```powershell
   Get-PrinterDriver | Select-Object Name
   ```

   Debe aparecer **POS-80C**.

5. Identifica el puerto de la impresora conectada:

   ```powershell
   Get-PnpDevice -PresentOnly |
     Where-Object { $_.InstanceId -like 'USBPRINT*' } |
     Format-List FriendlyName,InstanceId
   ```

   En este equipo, el identificador terminaba en **USB004**. En otro puede ser USB001, USB002, etc.

6. Crea la impresora usando el puerto que encontraste:

   ```powershell
   Add-Printer -Name "3nStar RPT006" -DriverName "POS-80C" -PortName "USB004"
   ```

7. Confirma la configuración:

   ```powershell
   Get-Printer -Name "3nStar RPT006" |
     Format-List Name,DriverName,PortName
   ```

Finalmente, abre el servidor, pulsa **Actualizar** y selecciona ese puerto USB.

**Eso fue lo que hice:** reutilizar el controlador instalado y crear la impresora en el puerto correcto. No fue necesario convertirla a COM.
