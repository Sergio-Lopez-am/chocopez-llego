/**
 * LLEGO · Chocopez — API de pedidos (piloto gratuito)
 * ----------------------------------------------------
 * Backend en Google Apps Script vinculado a una Hoja de cálculo de Google.
 * Guarda los pedidos en la hoja "Pedidos", lee precios y disponibilidad de la
 * hoja "Productos" y las claves del equipo de la hoja "Config".
 *
 * Instalación (ver README.md):
 *   1. Crea una Hoja de cálculo de Google nueva.
 *   2. Extensiones → Apps Script → pega este archivo completo y guarda.
 *   3. Ejecuta la función "instalar" una vez y autoriza el acceso.
 *   4. Implementar → Nueva implementación → Aplicación web
 *      · Ejecutar como: Yo   · Quién tiene acceso: Cualquier usuario
 *   5. Copia la URL que termina en /exec y pégala en assets/js/config.js (API_URL).
 */

var ZONA = 'America/Bogota';
var VERSION_API = '1.0';
var HOJA_PEDIDOS = 'Pedidos';
var HOJA_PRODUCTOS = 'Productos';
var HOJA_CONFIG = 'Config';

var PRODUCTOS_INICIALES = [
  ['camaron-tigre-precocido', 'Camarón tigre precocido', 19000, 40000, 'SI'],
  ['jurelito', 'Jurelito', 10000, 20000, 'SI'],
  ['corvina', 'Corvina', 24000, 50000, 'SI'],
  ['pargo-platero', 'Pargo platero', 24000, 50000, 'SI'],
  ['sierra', 'Sierra', 14000, 28000, 'SI'],
  ['bagre-mar', 'Bagre de mar', 15000, 30000, 'SI']
];

var COLUMNAS = [
  'Código', 'Fecha', 'Estado', 'Tipo de entrega', 'Nombre', 'Teléfono', 'Correo',
  'Dirección', 'Barrio', 'Ciudad', 'Indicaciones', 'Fecha de recogida', 'Franja horaria',
  'Medio de pago', 'Productos', 'Subtotal', 'Domicilio', 'Total', 'Observaciones',
  'Domiciliario', 'Última actualización', 'Autorización de datos', 'Token',
  'Items (JSON)', 'Historial (JSON)'
];

var ESTADOS = ['RECIBIDO', 'ALISTAMIENTO', 'LISTO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'];

/* ======================= Entradas HTTP ======================= */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.action) return salida({ ok: true, data: { servicio: 'LLEGO API', version: VERSION_API } });
  return procesar(p);
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return salida({ ok: false, error: 'Solicitud inválida.' });
  }
  return procesar(body);
}

function procesar(req) {
  try {
    asegurarHojas();
    var acciones = {
      catalogo: catalogo,
      crearPedido: crearPedido,
      seguimiento: seguimiento,
      login: login,
      listar: listar,
      actualizar: actualizar,
      tienda: tienda
    };
    if (!Object.prototype.hasOwnProperty.call(acciones, req.action)) throw fallo('Acción no reconocida.');
    return salida({ ok: true, data: acciones[req.action](req) });
  } catch (err) {
    if (err && err.publico) return salida({ ok: false, error: err.message });
    console.error(err && err.stack ? err.stack : err);
    return salida({ ok: false, error: 'Ocurrió un error en el servidor. Intenta de nuevo en unos segundos.' });
  }
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fallo(msg) {
  var e = new Error(msg);
  e.publico = true;
  return e;
}

/* ======================= Instalación ======================= */

/** Ejecuta esta función una vez desde el editor para crear las hojas y autorizar el script. */
function instalar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  CacheService.getScriptCache().remove('hojas_ok');
  asegurarHojas();
  var cfg = leerConfig();
  Logger.log('Listo. Hojas creadas en: ' + ss.getUrl());
  Logger.log('Clave administrador: ' + cfg.CLAVE_ADMIN);
  Logger.log('Clave domiciliario: ' + cfg.CLAVE_DOMICILIARIO);
  Logger.log('Puedes cambiar las claves en la hoja "Config".');
}

function libro() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function asegurarHojas() {
  var cache = CacheService.getScriptCache();
  if (cache.get('hojas_ok')) return;
  var ss = libro();

  var h = ss.getSheetByName(HOJA_PEDIDOS);
  if (!h) {
    var hojas = ss.getSheets();
    if (hojas.length === 1 && hojas[0].getLastRow() === 0 && hojas[0].getLastColumn() === 0) {
      h = hojas[0].setName(HOJA_PEDIDOS);
    } else {
      h = ss.insertSheet(HOJA_PEDIDOS);
    }
    h.getRange(1, 1, h.getMaxRows(), COLUMNAS.length).setNumberFormat('@');
    h.getRange(2, 16, h.getMaxRows() - 1, 3).setNumberFormat('#,##0');
    h.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS])
      .setFontWeight('bold').setBackground('#111111').setFontColor('#ffffff');
    h.setFrozenRows(1);
    h.setColumnWidth(15, 260);
  }

  var p = ss.getSheetByName(HOJA_PRODUCTOS);
  if (!p) {
    p = ss.insertSheet(HOJA_PRODUCTOS);
    p.getRange(1, 1, 1, 5).setValues([['ID', 'Producto', 'Precio libra', 'Precio kilo', 'Disponible (SI/NO)']])
      .setFontWeight('bold').setBackground('#111111').setFontColor('#ffffff');
    p.getRange(2, 1, PRODUCTOS_INICIALES.length, 5).setValues(PRODUCTOS_INICIALES);
    p.getRange(2, 3, p.getMaxRows() - 1, 2).setNumberFormat('#,##0');
    p.setFrozenRows(1);
    p.setColumnWidth(1, 200);
    p.setColumnWidth(2, 220);
  }

  var c = ss.getSheetByName(HOJA_CONFIG);
  if (!c) {
    c = ss.insertSheet(HOJA_CONFIG);
    c.getRange(1, 2, c.getMaxRows(), 1).setNumberFormat('@');
    c.getRange(1, 1, 5, 3).setValues([
      ['Parámetro', 'Valor', 'Descripción'],
      ['CLAVE_ADMIN', claveAleatoria(), 'Clave del panel de alistamiento y despacho (rol administrador).'],
      ['CLAVE_DOMICILIARIO', claveAleatoria(), 'Clave para domiciliarios: solo ven despachos y marcan entregas.'],
      ['COSTO_DOMICILIO', '', 'Valor del domicilio en pesos (ej.: 5000). Vacío = "A convenir" y no se suma al total.'],
      ['PEDIDOS_ABIERTOS', 'SI', 'SI para recibir pedidos, NO para pausar la tienda.']
    ]);
    c.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#111111').setFontColor('#ffffff');
    c.setFrozenRows(1);
    c.setColumnWidth(1, 200);
    c.setColumnWidth(2, 180);
    c.setColumnWidth(3, 520);
  }

  cache.put('hojas_ok', '1', 3600);
}

function claveAleatoria() {
  var abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  var hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var out = '';
  for (var i = 0; i < 10; i++) out += abc.charAt(parseInt(hex.substr(i * 2, 2), 16) % abc.length);
  return out;
}

/* ======================= Utilidades ======================= */

function ahoraISO() {
  return Utilities.formatDate(new Date(), ZONA, "yyyy-MM-dd'T'HH:mm:ss") + '-05:00';
}
function hoy() {
  return Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
}
function texto(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function num(v) {
  if (typeof v === 'number') return v;
  var n = Number(String(v == null ? '' : v).replace(/[^\d]/g, ''));
  return isNaN(n) ? 0 : n;
}
function normalizarTelefono(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2);
  return /^(3\d{9}|60\d{8})$/.test(d) ? d : '';
}
function primerNombre(s) {
  return String(s || '').trim().split(/\s+/)[0] || '';
}
function unidadTxt(u, n) {
  if (u === 'KILO') return n === 1 ? 'kilo' : 'kilos';
  return n === 1 ? 'libra' : 'libras';
}
/** Evita que un texto escrito por el cliente se interprete como fórmula en la hoja. */
function seguro(v) {
  return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
}

/* ======================= Configuración y catálogo ======================= */

function leerConfig() {
  var h = libro().getSheetByName(HOJA_CONFIG);
  var out = {};
  var n = h.getLastRow();
  if (n >= 2) {
    h.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) {
      var k = String(r[0]).trim();
      if (k) out[k] = r[1];
    });
  }
  return out;
}
function escribirConfig(clave, valor) {
  var h = libro().getSheetByName(HOJA_CONFIG);
  var n = h.getLastRow();
  var claves = n >= 2 ? h.getRange(2, 1, n - 1, 1).getValues() : [];
  for (var i = 0; i < claves.length; i++) {
    if (String(claves[i][0]).trim() === clave) { h.getRange(i + 2, 2).setValue(valor); return; }
  }
  h.appendRow([clave, valor, '']);
}
function costoDomicilio(cfg) {
  var v = String(cfg.COSTO_DOMICILIO == null ? '' : cfg.COSTO_DOMICILIO).trim();
  return v === '' ? null : num(v);
}
function pedidosAbiertos(cfg) {
  return !/^no$/i.test(String(cfg.PEDIDOS_ABIERTOS == null ? 'SI' : cfg.PEDIDOS_ABIERTOS).trim());
}

function leerProductos() {
  var h = libro().getSheetByName(HOJA_PRODUCTOS);
  var n = h.getLastRow() - 1;
  if (n < 1) return [];
  return h.getRange(2, 1, n, 5).getValues()
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) {
      return {
        id: String(r[0]).trim(),
        nombre: String(r[1]).trim(),
        precioLibra: num(r[2]),
        precioKilo: num(r[3]),
        disponible: !/^no$/i.test(String(r[4]).trim())
      };
    });
}

function catalogo() {
  var cfg = leerConfig();
  return { productos: leerProductos(), costoDomicilio: costoDomicilio(cfg), abiertos: pedidosAbiertos(cfg) };
}

/* ======================= Pedidos: lectura y escritura ======================= */

function aFila(p) {
  var productosTxt = p.items.map(function (i) {
    return i.cantidad + ' ' + unidadTxt(i.unidad, i.cantidad) + ' · ' + i.nombre;
  }).join('\n');
  return [
    p.codigo, p.fecha, p.estado, p.tipoEntrega, p.cliente.nombre, p.cliente.telefono, p.cliente.correo,
    p.entrega.direccion, p.entrega.barrio, p.entrega.ciudad, p.entrega.indicaciones, p.entrega.fechaRecogida, p.entrega.franja,
    p.pago, productosTxt, p.subtotal, p.costoDomicilio == null ? '' : p.costoDomicilio, p.total, p.observaciones,
    p.domiciliario, p.actualizado, p.autorizacion, p.token,
    JSON.stringify(p.items), JSON.stringify(p.historial)
  ].map(seguro);
}

function deFila(r) {
  function s(v) {
    if (v instanceof Date) return Utilities.formatDate(v, ZONA, "yyyy-MM-dd'T'HH:mm:ss") + '-05:00';
    return String(v == null ? '' : v);
  }
  var items = [], historial = [];
  try { items = JSON.parse(s(r[23]) || '[]'); } catch (e) { items = []; }
  try { historial = JSON.parse(s(r[24]) || '[]'); } catch (e) { historial = []; }
  var fechaRecogida = r[11] instanceof Date ? Utilities.formatDate(r[11], ZONA, 'yyyy-MM-dd') : s(r[11]);
  return {
    codigo: s(r[0]), fecha: s(r[1]), estado: s(r[2]), tipoEntrega: s(r[3]),
    cliente: { nombre: s(r[4]), telefono: s(r[5]).replace(/\D/g, ''), correo: s(r[6]) },
    entrega: { direccion: s(r[7]), barrio: s(r[8]), ciudad: s(r[9]), indicaciones: s(r[10]), fechaRecogida: fechaRecogida, franja: s(r[12]) },
    pago: s(r[13]), items: items, subtotal: num(r[15]),
    costoDomicilio: String(r[16]).trim() === '' ? null : num(r[16]),
    total: num(r[17]), observaciones: s(r[18]), domiciliario: s(r[19]), actualizado: s(r[20]),
    autorizacion: s(r[21]), token: s(r[22]), historial: historial
  };
}

function leerPedidos() {
  var h = libro().getSheetByName(HOJA_PEDIDOS);
  var n = h.getLastRow() - 1;
  if (n < 1) return [];
  return h.getRange(2, 1, n, COLUMNAS.length).getValues()
    .map(function (r, i) { return { fila: i + 2, pedido: deFila(r) }; })
    .filter(function (x) { return x.pedido.codigo; });
}

/* ======================= Acciones públicas ======================= */

function crearPedido(req) {
  var p = req.pedido || {};
  if (p.web) throw fallo('Solicitud inválida.');
  var cfg = leerConfig();
  if (!pedidosAbiertos(cfg)) throw fallo('En este momento no estamos recibiendo pedidos. Intenta más tarde.');

  var nombre = texto(p.nombre, 80);
  if (nombre.length < 3) throw fallo('Escribe tu nombre completo.');
  var telefono = normalizarTelefono(p.telefono);
  if (!telefono) throw fallo('Escribe un número de celular válido de 10 dígitos.');
  var correo = texto(p.correo, 100);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) throw fallo('Revisa tu correo electrónico.');
  var tipo = p.tipoEntrega === 'RECOGER' ? 'RECOGER' : (p.tipoEntrega === 'DOMICILIO' ? 'DOMICILIO' : '');
  if (!tipo) throw fallo('Selecciona domicilio o recoger en sitio.');

  var entrega = { direccion: '', barrio: '', ciudad: '', indicaciones: '', fechaRecogida: '', franja: '' };
  if (tipo === 'DOMICILIO') {
    entrega.direccion = texto(p.direccion, 120);
    entrega.barrio = texto(p.barrio, 60);
    entrega.ciudad = texto(p.ciudad, 60);
    entrega.indicaciones = texto(p.indicaciones, 200);
    entrega.franja = texto(p.franja, 80);
    if (entrega.direccion.length < 5) throw fallo('Escribe la dirección de entrega.');
    if (!entrega.barrio) throw fallo('Escribe el barrio.');
    if (!entrega.ciudad) throw fallo('Escribe la ciudad.');
    if (!entrega.franja) throw fallo('Selecciona cuándo quieres recibir tu pedido.');
  } else {
    entrega.fechaRecogida = texto(p.fechaRecogida, 10);
    entrega.franja = texto(p.franjaRecogida, 80);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entrega.fechaRecogida)) throw fallo('Selecciona la fecha en que recogerás tu pedido.');
    if (entrega.fechaRecogida < hoy()) throw fallo('La fecha de recogida no puede ser anterior a hoy.');
    if (!entrega.franja) throw fallo('Selecciona la franja horaria de recogida.');
  }
  var pago = texto(p.pago, 80);
  if (!pago) throw fallo('Selecciona el medio de pago.');
  if (p.consentimiento !== true) throw fallo('Para enviar el pedido debes autorizar el tratamiento de tus datos personales.');

  var mapa = {};
  leerProductos().forEach(function (x) { mapa[x.id] = x; });
  var lineas = Array.isArray(p.items) ? p.items : [];
  if (!lineas.length) throw fallo('Tu pedido está vacío.');
  if (lineas.length > 30) throw fallo('Demasiados productos en un solo pedido.');
  var items = lineas.map(function (l) {
    var prod = mapa[String(l.id)];
    if (!prod) throw fallo('Uno de los productos ya no está disponible. Actualiza la página.');
    if (!prod.disponible) throw fallo(prod.nombre + ' está agotado en este momento. Quítalo de tu pedido para continuar.');
    var u = l.unidad === 'KILO' ? 'KILO' : (l.unidad === 'LIBRA' ? 'LIBRA' : '');
    if (!u) throw fallo('Unidad de venta inválida.');
    var cant = Number(l.cantidad);
    if (!(cant >= 1 && cant <= 50 && Math.floor(cant) === cant)) throw fallo('Cantidad inválida para ' + prod.nombre + '.');
    var precio = u === 'KILO' ? prod.precioKilo : prod.precioLibra;
    if (!precio) throw fallo(prod.nombre + ' no se vende por ' + unidadTxt(u, 1) + '.');
    return { id: prod.id, nombre: prod.nombre, unidad: u, cantidad: cant, precioUnitario: precio, subtotal: precio * cant };
  });
  var subtotal = items.reduce(function (s, x) { return s + x.subtotal; }, 0);
  var costo = tipo === 'DOMICILIO' ? costoDomicilio(cfg) : 0;

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var seq = Number(props.getProperty('SEQ') || '0') + 1;
    props.setProperty('SEQ', String(seq));
    var ahora = ahoraISO();
    var pedido = {
      codigo: 'LL-' + ('000' + seq).slice(-4),
      token: Utilities.getUuid().replace(/-/g, '').slice(0, 16),
      fecha: ahora,
      estado: 'RECIBIDO',
      tipoEntrega: tipo,
      cliente: { nombre: nombre, telefono: telefono, correo: correo },
      entrega: entrega,
      pago: pago,
      items: items,
      subtotal: subtotal,
      costoDomicilio: costo,
      total: subtotal + (costo || 0),
      observaciones: texto(p.observaciones, 300),
      domiciliario: '',
      actualizado: ahora,
      autorizacion: 'SI · v' + (texto(p.versionPolitica, 20) || '1.0') + ' · ' + ahora,
      historial: [{ estado: 'RECIBIDO', fecha: ahora, por: 'Cliente' }]
    };
    libro().getSheetByName(HOJA_PEDIDOS).appendRow(aFila(pedido));
    SpreadsheetApp.flush();
    return {
      codigo: pedido.codigo, token: pedido.token, estado: pedido.estado, fecha: pedido.fecha,
      tipoEntrega: tipo, subtotal: subtotal, costoDomicilio: costo, total: pedido.total
    };
  } finally {
    lock.releaseLock();
  }
}

function seguimiento(req) {
  var codigo = String(req.codigo || '').trim().toUpperCase();
  if (!codigo) throw fallo('Escribe el código de tu pedido.');
  var token = String(req.token || '').trim();
  var tel = normalizarTelefono(req.telefono);
  var x = leerPedidos().filter(function (z) { return z.pedido.codigo.toUpperCase() === codigo; })[0];
  var ok = x && ((token && x.pedido.token === token) || (tel && x.pedido.cliente.telefono === tel));
  if (!ok) throw fallo('No encontramos un pedido con esos datos. Revisa el código y el número de celular.');
  var p = x.pedido;
  return {
    codigo: p.codigo, token: p.token, fecha: p.fecha, estado: p.estado, tipoEntrega: p.tipoEntrega,
    nombre: primerNombre(p.cliente.nombre),
    items: p.items.map(function (i) { return { nombre: i.nombre, unidad: i.unidad, cantidad: i.cantidad, subtotal: i.subtotal }; }),
    subtotal: p.subtotal, costoDomicilio: p.costoDomicilio, total: p.total, pago: p.pago,
    franja: p.entrega.franja, fechaRecogida: p.entrega.fechaRecogida, barrio: p.entrega.barrio,
    domiciliario: primerNombre(p.domiciliario), historial: p.historial, actualizado: p.actualizado
  };
}

/* ======================= Acciones del equipo (con clave) ======================= */

function rolDe(clave) {
  clave = String(clave || '');
  var cache = CacheService.getScriptCache();
  var fallos = Number(cache.get('fallos_login') || 0);
  if (fallos >= 30) throw fallo('Demasiados intentos fallidos. Espera 10 minutos e intenta de nuevo.');
  var cfg = leerConfig();
  var admin = String(cfg.CLAVE_ADMIN || '').trim();
  var domi = String(cfg.CLAVE_DOMICILIARIO || '').trim();
  if (clave.length >= 4 && clave === admin) return 'admin';
  if (clave.length >= 4 && clave === domi) return 'domiciliario';
  cache.put('fallos_login', String(fallos + 1), 600);
  Utilities.sleep(700);
  throw fallo('Clave incorrecta.');
}

function vistaDomiciliario(p) {
  var c = JSON.parse(JSON.stringify(p));
  delete c.token;
  delete c.autorizacion;
  c.cliente.correo = '';
  return c;
}

function login(req) {
  return { rol: rolDe(req.clave) };
}

function listar(req) {
  var rol = rolDe(req.clave);
  var pedidos = leerPedidos().map(function (x) { return x.pedido; }).reverse();
  if (rol === 'domiciliario') {
    pedidos = pedidos.filter(function (p) {
      return p.tipoEntrega === 'DOMICILIO' && (p.estado === 'LISTO' || p.estado === 'EN_CAMINO');
    }).map(vistaDomiciliario);
  }
  return { rol: rol, pedidos: pedidos, abiertos: pedidosAbiertos(leerConfig()), ahora: ahoraISO() };
}

function transicionValida(p, nuevo, rol) {
  var e = p.estado, t = p.tipoEntrega;
  if (e === 'ENTREGADO' || e === 'CANCELADO') return false;
  if (nuevo === 'CANCELADO') return rol === 'admin';
  if (rol === 'domiciliario') {
    return t === 'DOMICILIO' && ((e === 'LISTO' && nuevo === 'EN_CAMINO') || (e === 'EN_CAMINO' && nuevo === 'ENTREGADO'));
  }
  var mapa = {
    RECIBIDO: ['ALISTAMIENTO'],
    ALISTAMIENTO: ['LISTO'],
    LISTO: t === 'DOMICILIO' ? ['EN_CAMINO'] : ['ENTREGADO'],
    EN_CAMINO: ['ENTREGADO']
  };
  return (mapa[e] || []).indexOf(nuevo) >= 0;
}

function actualizar(req) {
  var rol = rolDe(req.clave);
  var codigo = String(req.codigo || '').trim();
  var nuevo = String(req.estado || '');
  if (ESTADOS.indexOf(nuevo) < 0) throw fallo('Estado inválido.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var x = leerPedidos().filter(function (z) { return z.pedido.codigo === codigo; })[0];
    if (!x) throw fallo('Pedido no encontrado.');
    var p = x.pedido;
    if (!transicionValida(p, nuevo, rol)) throw fallo('Este pedido ya cambió de estado. Actualiza la lista.');
    if (nuevo === 'EN_CAMINO') {
      var dom = texto(req.domiciliario, 60);
      if (!dom) throw fallo('Escribe el nombre del domiciliario.');
      p.domiciliario = dom;
    }
    var ahora = ahoraISO();
    p.estado = nuevo;
    p.actualizado = ahora;
    var evento = {
      estado: nuevo,
      fecha: ahora,
      por: rol === 'admin' ? 'Administración' : 'Domiciliario: ' + (texto(req.usuario, 40) || p.domiciliario)
    };
    var nota = texto(req.nota, 200);
    if (nota) evento.nota = nota;
    p.historial.push(evento);
    libro().getSheetByName(HOJA_PEDIDOS).getRange(x.fila, 1, 1, COLUMNAS.length).setValues([aFila(p)]);
    SpreadsheetApp.flush();
    return { pedido: rol === 'domiciliario' ? vistaDomiciliario(p) : p };
  } finally {
    lock.releaseLock();
  }
}

function tienda(req) {
  if (rolDe(req.clave) !== 'admin') throw fallo('Solo el administrador puede cambiar este ajuste.');
  escribirConfig('PEDIDOS_ABIERTOS', req.abiertos ? 'SI' : 'NO');
  return { abiertos: !!req.abiertos };
}
