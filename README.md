# LLEGO · Chocopez — Pedidos en línea (piloto)

Plataforma gratuita para vender pescados y mariscos por **libra** o por **kilo**, con domicilio o recogida en sitio, alistamiento, despacho y seguimiento del pedido.

| Página | Para quién | Ruta |
| --- | --- | --- |
| Portafolio interactivo y carrito | Clientes | `/` |
| Seguimiento del pedido | Clientes | `/seguimiento.html` |
| Panel de alistamiento y despacho (con clave) | Equipo y domiciliarios | `/admin/` |
| Política de datos y términos | Todos | `/politica.html` |

## Cómo funciona

1. El cliente elige producto, unidad (libra o kilo) y cantidad; el total se calcula al instante.
2. Elige **Domicilio** (dirección, barrio, ciudad, indicaciones, franja) o **Recoger en sitio** (fecha y franja), el medio de pago, y autoriza el tratamiento de datos (Ley 1581 de 2012).
3. Recibe un código (`LL-0001`) y un enlace para seguir su pedido.
4. En el panel, el administrador ve el pedido en **ALISTAMIENTO** → lo alista marcando cada producto → lo pasa a **DESPACHO** → lo entrega al domiciliario (**En camino**).
5. El domiciliario entra con su propia clave, ve la dirección con enlace al mapa y marca **ENTREGADO** con un toque.
6. El administrador descarga un **XML** con el detalle y el estado de todos los pedidos.

## Conectar la base de datos gratuita (Google Sheets) — 5 minutos

Mientras `API_URL` esté vacía, el sitio funciona en **modo demostración** (los pedidos quedan solo en el navegador donde se hacen; claves `admin123` y `domi123`).

1. Crea una hoja de cálculo nueva en [sheets.new](https://sheets.new) y nómbrala, por ejemplo, `LLEGO - Pedidos`.
2. Menú **Extensiones → Apps Script**. Borra el contenido, pega todo el archivo [`backend/Code.gs`](backend/Code.gs) y guarda.
3. Selecciona la función **`instalar`** y pulsa **Ejecutar**. Autoriza el acceso con tu cuenta de Google. Se crean las hojas `Pedidos`, `Productos` y `Config`.
4. **Implementar → Nueva implementación →** tipo **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
5. Copia la URL que termina en `/exec` y pégala en [`assets/js/config.js`](assets/js/config.js) en `API_URL`.
6. Abre la hoja `Config` para ver las claves del **administrador** y del **domiciliario** (puedes cambiarlas cuando quieras).

> Si cambias el código de `Code.gs`, crea una nueva versión: **Implementar → Gestionar implementaciones → Editar → Nueva versión**.

## Ajustes del día a día (sin tocar código)

En la hoja de Google:

- **Productos**: cambia precios por libra/kilo o escribe `NO` en *Disponible* para mostrar un producto como agotado.
- **Config → COSTO_DOMICILIO**: valor fijo del domicilio (vacío = «A convenir»).
- **Config → PEDIDOS_ABIERTOS**: `NO` pausa la tienda (también se puede desde el panel).
- **Pedidos**: todos los pedidos con su estado, listos para filtrar o exportar.

Datos del negocio (dirección de recogida, horario, WhatsApp, correo, NIT, medios de pago y franjas): [`assets/js/config.js`](assets/js/config.js).

## Estructura

```
index.html            Portafolio, carrito y envío del pedido
seguimiento.html      Estado del pedido para el cliente
admin/index.html      Panel de alistamiento, despacho y entregas
politica.html         Política de tratamiento de datos y términos
assets/js/            config, catálogo, utilidades, API, tienda, seguimiento, panel
assets/css/           estilos
assets/img/productos/ fotos de los productos
backend/Code.gs       API gratuita en Google Apps Script
```

## Marco normativo (Colombia)

- Ley 1581 de 2012 y Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015): autorización previa, expresa e informada; finalidades; derechos del titular; consultas (10 días hábiles) y reclamos (15 días hábiles).
- Ley 1480 de 2011 (Estatuto del Consumidor): información de precios, garantía y excepción de retracto para bienes perecederos (art. 47).
