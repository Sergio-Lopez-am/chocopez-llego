/* LLEGO · Chocopez — utilidades compartidas y reglas de negocio del cliente */
(function () {
  'use strict';
  var ZONA = 'America/Bogota';
  var L = {};

  L.$ = function (s, el) { return (el || document).querySelector(s); };
  L.$$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  L.dinero = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); };
  L.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  L.unidad = function (u, n) {
    if (u === 'KILO') return n === 1 ? 'kilo' : 'kilos';
    return n === 1 ? 'libra' : 'libras';
  };
  L.cantidadTxt = function (cantidad, u) { return cantidad + ' ' + L.unidad(u, cantidad); };
  L.telefonoFmt = function (t) {
    var d = String(t || '').replace(/\D/g, '');
    return d.length === 10 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d;
  };
  L.costoDomTxt = function (v) {
    if (v == null || v === '') return 'A convenir';
    return Number(v) === 0 ? 'Gratis' : L.dinero(v);
  };

  /* ---------- Fechas (hora Colombia, UTC-5 sin horario de verano) ---------- */
  L.ahoraISO = function () {
    return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 19) + '-05:00';
  };
  L.hoyISO = function () { return L.ahoraISO().slice(0, 10); };
  L.sumarDias = function (yyyyMmDd, dias) {
    var d = new Date(yyyyMmDd + 'T12:00:00-05:00');
    d.setUTCDate(d.getUTCDate() + dias);
    return new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  };
  function parse(iso) { var d = new Date(iso); return isNaN(d) ? null : d; }
  L.fechaHora = function (iso) {
    var d = parse(iso); if (!d) return '';
    return new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
  };
  L.hora = function (iso) {
    var d = parse(iso); if (!d) return '';
    return new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' }).format(d);
  };
  L.fechaLarga = function (yyyyMmDd) {
    var d = parse(String(yyyyMmDd).slice(0, 10) + 'T12:00:00-05:00'); if (!d) return String(yyyyMmDd || '');
    var t = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  L.hace = function (iso) {
    var d = parse(iso); if (!d) return '';
    var min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return 'hace ' + min + ' min';
    var h = Math.floor(min / 60);
    if (h < 24) return 'hace ' + h + ' h';
    return L.fechaHora(iso);
  };

  /* ---------- Almacenamiento local seguro ---------- */
  function almacen(tipo) {
    return {
      get: function (k, def) {
        try { var v = window[tipo].getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
      },
      set: function (k, v) { try { window[tipo].setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
      del: function (k) { try { window[tipo].removeItem(k); } catch (e) { /* sin almacenamiento */ } }
    };
  }
  L.store = almacen('localStorage');
  L.session = almacen('sessionStorage');

  /* ---------- Aviso flotante ---------- */
  var toastTimer = null;
  L.toast = function (msg, tipo) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (tipo ? ' ' + tipo : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 3200);
  };

  /* ---------- Estados del pedido ---------- */
  L.ESTADOS = ['RECIBIDO', 'ALISTAMIENTO', 'LISTO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'];
  L.etiquetaEstado = function (estado, tipo) {
    switch (estado) {
      case 'RECIBIDO': return 'Recibido';
      case 'ALISTAMIENTO': return 'En alistamiento';
      case 'LISTO': return tipo === 'RECOGER' ? 'Listo para recoger' : 'Listo para despacho';
      case 'EN_CAMINO': return 'En camino';
      case 'ENTREGADO': return 'Entregado';
      case 'CANCELADO': return 'Cancelado';
      default: return estado || '';
    }
  };
  L.pasos = function (tipo) {
    return tipo === 'RECOGER'
      ? ['RECIBIDO', 'ALISTAMIENTO', 'LISTO', 'ENTREGADO']
      : ['RECIBIDO', 'ALISTAMIENTO', 'LISTO', 'EN_CAMINO', 'ENTREGADO'];
  };
  L.badge = function (estado, tipo) {
    return '<span class="badge st-' + L.esc(estado) + '">' + L.esc(L.etiquetaEstado(estado, tipo)) + '</span>';
  };

  /* Reglas de cambio de estado (deben coincidir con backend/Code.gs) */
  L.transicionValida = function (p, nuevo, rol) {
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
  };

  /* ---------- Validación del pedido (misma lógica que backend/Code.gs) ---------- */
  function texto(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  L.texto = texto;
  L.normalizarTelefono = function (v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2);
    return /^(3\d{9}|60\d{8})$/.test(d) ? d : '';
  };

  L.validarPedido = function (p, productos, opciones) {
    opciones = opciones || {};
    function error(msg, campo) { return { error: msg, campo: campo || null }; }
    var nombre = texto(p.nombre, 80);
    if (nombre.length < 3) return error('Escribe tu nombre completo.', 'nombre');
    var telefono = L.normalizarTelefono(p.telefono);
    if (!telefono) return error('Escribe un número de celular válido de 10 dígitos.', 'telefono');
    var correo = texto(p.correo, 100);
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return error('Revisa tu correo electrónico.', 'correo');
    var tipo = p.tipoEntrega === 'RECOGER' ? 'RECOGER' : (p.tipoEntrega === 'DOMICILIO' ? 'DOMICILIO' : '');
    if (!tipo) return error('Selecciona domicilio o recoger en sitio.', 'tipoEntrega');
    var entrega = { direccion: '', barrio: '', ciudad: '', indicaciones: '', fechaRecogida: '', franja: '' };
    if (tipo === 'DOMICILIO') {
      entrega.direccion = texto(p.direccion, 120);
      entrega.barrio = texto(p.barrio, 60);
      entrega.ciudad = texto(p.ciudad, 60);
      entrega.indicaciones = texto(p.indicaciones, 200);
      entrega.franja = texto(p.franja, 80);
      if (entrega.direccion.length < 5) return error('Escribe la dirección de entrega.', 'direccion');
      if (!entrega.barrio) return error('Escribe el barrio.', 'barrio');
      if (!entrega.ciudad) return error('Escribe la ciudad.', 'ciudad');
      if (!entrega.franja) return error('Selecciona cuándo quieres recibir tu pedido.', 'franja');
    } else {
      entrega.fechaRecogida = texto(p.fechaRecogida, 10);
      entrega.franja = texto(p.franjaRecogida, 80);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entrega.fechaRecogida)) return error('Selecciona la fecha en que recogerás tu pedido.', 'fechaRecogida');
      if (entrega.fechaRecogida < L.hoyISO()) return error('La fecha de recogida no puede ser anterior a hoy.', 'fechaRecogida');
      if (!entrega.franja) return error('Selecciona la franja horaria de recogida.', 'franjaRecogida');
    }
    var pago = texto(p.pago, 80);
    if (!pago) return error('Selecciona el medio de pago.', 'pago');
    if (p.consentimiento !== true) return error('Para enviar el pedido debes autorizar el tratamiento de tus datos personales.', 'consentimiento');

    var mapa = {};
    (productos || []).forEach(function (x) { mapa[x.id] = x; });
    var lineas = Array.isArray(p.items) ? p.items : [];
    if (!lineas.length) return error('Tu pedido está vacío.');
    if (lineas.length > 30) return error('Demasiados productos en un solo pedido.');
    var items = [];
    for (var i = 0; i < lineas.length; i++) {
      var l = lineas[i], prod = mapa[String(l.id)];
      if (!prod) return error('Uno de los productos ya no está disponible. Actualiza la página.');
      if (!prod.disponible) return error(prod.nombre + ' está agotado en este momento. Quítalo de tu pedido para continuar.');
      var u = l.unidad === 'KILO' ? 'KILO' : (l.unidad === 'LIBRA' ? 'LIBRA' : '');
      if (!u) return error('Unidad de venta inválida.');
      var cant = Number(l.cantidad);
      if (!(cant >= 1 && cant <= 50 && Math.floor(cant) === cant)) return error('Cantidad inválida para ' + prod.nombre + '.');
      var precio = u === 'KILO' ? prod.precioKilo : prod.precioLibra;
      if (!precio) return error(prod.nombre + ' no se vende por ' + L.unidad(u, 1) + '.');
      items.push({ id: prod.id, nombre: prod.nombre, unidad: u, cantidad: cant, precioUnitario: precio, subtotal: precio * cant });
    }
    var subtotal = items.reduce(function (s, x) { return s + x.subtotal; }, 0);
    var costo = tipo === 'DOMICILIO' ? (opciones.costoDomicilio == null ? null : Number(opciones.costoDomicilio)) : 0;
    return {
      pedido: {
        tipoEntrega: tipo,
        cliente: { nombre: nombre, telefono: telefono, correo: correo },
        entrega: entrega,
        pago: pago,
        items: items,
        subtotal: subtotal,
        costoDomicilio: costo,
        total: subtotal + (costo || 0),
        observaciones: texto(p.observaciones, 300)
      }
    };
  };

  window.LLEGO = L;
})();
