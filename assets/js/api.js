/* LLEGO · Chocopez — conexión con el backend (Google Apps Script) y modo demostración */
(function () {
  'use strict';
  var L = window.LLEGO;
  var CFG = window.LLEGO_CONFIG || {};
  var URL_API = String(CFG.API_URL || '').trim();
  var DEMO = !URL_API;

  /* ---------- Backend real: Google Apps Script ---------- */
  function remoto(action, datos) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);
    // Cuerpo como texto plano: evita la verificación previa CORS y es compatible con Apps Script.
    return fetch(URL_API, {
      method: 'POST',
      body: JSON.stringify(Object.assign({ action: action }, datos)),
      signal: ctrl ? ctrl.signal : undefined,
      redirect: 'follow'
    }).catch(function (e) {
      throw new Error(e && e.name === 'AbortError'
        ? 'El servidor tardó demasiado en responder. Intenta de nuevo.'
        : 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
    }).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { throw new Error('Respuesta inválida del servidor.'); });
    }).then(function (json) {
      if (!json || !json.ok) throw new Error((json && json.error) || 'Ocurrió un error. Intenta de nuevo.');
      return json.data;
    });
  }

  /* ---------- Modo demostración: mismo contrato, datos en este navegador ---------- */
  var KEY = 'llego_demo_v1';
  var memoria = null;
  function inicial() {
    return {
      seq: 0,
      pedidos: [],
      config: { CLAVE_ADMIN: 'admin123', CLAVE_DOMICILIARIO: 'domi123', COSTO_DOMICILIO: null, PEDIDOS_ABIERTOS: true }
    };
  }
  function cargar() {
    try { var raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* sin almacenamiento */ }
    return memoria || inicial();
  }
  function guardar(db) {
    memoria = db;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* sin almacenamiento */ }
  }
  function falla(msg) { throw new Error(msg); }
  function token() {
    var a = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function productosDemo() {
    return (window.LLEGO_PRODUCTOS || []).map(function (p) {
      return { id: p.id, nombre: p.nombre, precioLibra: p.precioLibra, precioKilo: p.precioKilo, disponible: p.disponible !== false };
    });
  }
  function rolDe(db, clave) {
    clave = String(clave || '');
    if (clave && clave === db.config.CLAVE_ADMIN) return 'admin';
    if (clave && clave === db.config.CLAVE_DOMICILIARIO) return 'domiciliario';
    falla('Clave incorrecta.');
  }
  function primerNombre(s) { return String(s || '').trim().split(/\s+/)[0] || ''; }
  function vistaCliente(p) {
    return {
      codigo: p.codigo, token: p.token, fecha: p.fecha, estado: p.estado, tipoEntrega: p.tipoEntrega,
      nombre: primerNombre(p.cliente.nombre),
      items: p.items.map(function (i) { return { nombre: i.nombre, unidad: i.unidad, cantidad: i.cantidad, subtotal: i.subtotal }; }),
      subtotal: p.subtotal, costoDomicilio: p.costoDomicilio, total: p.total, pago: p.pago,
      franja: p.entrega.franja, fechaRecogida: p.entrega.fechaRecogida, barrio: p.entrega.barrio,
      domiciliario: primerNombre(p.domiciliario), historial: p.historial, actualizado: p.actualizado
    };
  }
  function vistaDomiciliario(p) {
    var c = JSON.parse(JSON.stringify(p));
    delete c.token; delete c.autorizacion; c.cliente.correo = '';
    return c;
  }

  function demo(action, d) {
    return new Promise(function (r) { setTimeout(r, 250); }).then(function () {
      var db = cargar();
      var productos = productosDemo();
      switch (action) {
        case 'catalogo':
          return { productos: productos, costoDomicilio: db.config.COSTO_DOMICILIO, abiertos: db.config.PEDIDOS_ABIERTOS };

        case 'crearPedido': {
          var entrada = d.pedido || {};
          if (entrada.web) falla('Solicitud inválida.');
          if (!db.config.PEDIDOS_ABIERTOS) falla('En este momento no estamos recibiendo pedidos. Intenta más tarde.');
          var v = L.validarPedido(entrada, productos, { costoDomicilio: db.config.COSTO_DOMICILIO });
          if (v.error) falla(v.error);
          db.seq += 1;
          var ahora = L.ahoraISO();
          var p = v.pedido;
          p.codigo = 'LL-' + ('000' + db.seq).slice(-4);
          p.token = token();
          p.fecha = ahora;
          p.estado = 'RECIBIDO';
          p.domiciliario = '';
          p.actualizado = ahora;
          p.autorizacion = 'SI · v' + (L.texto(entrada.versionPolitica, 20) || '1.0') + ' · ' + ahora;
          p.historial = [{ estado: 'RECIBIDO', fecha: ahora, por: 'Cliente' }];
          db.pedidos.push(p);
          guardar(db);
          return { codigo: p.codigo, token: p.token, estado: p.estado, fecha: p.fecha, tipoEntrega: p.tipoEntrega, subtotal: p.subtotal, costoDomicilio: p.costoDomicilio, total: p.total };
        }

        case 'seguimiento': {
          var cod = String(d.codigo || '').trim().toUpperCase();
          if (!cod) falla('Escribe el código de tu pedido.');
          var tel = L.normalizarTelefono(d.telefono);
          var x = db.pedidos.filter(function (q) { return q.codigo === cod; })[0];
          var ok = x && ((d.token && x.token === d.token) || (tel && x.cliente.telefono === tel));
          if (!ok) falla('No encontramos un pedido con esos datos. Revisa el código y el número de celular.');
          return vistaCliente(x);
        }

        case 'login':
          return { rol: rolDe(db, d.clave) };

        case 'listar': {
          var rol = rolDe(db, d.clave);
          var lista = db.pedidos.slice().reverse();
          if (rol === 'domiciliario') {
            lista = lista.filter(function (q) { return q.tipoEntrega === 'DOMICILIO' && (q.estado === 'LISTO' || q.estado === 'EN_CAMINO'); }).map(vistaDomiciliario);
          }
          return { rol: rol, pedidos: lista, abiertos: db.config.PEDIDOS_ABIERTOS, ahora: L.ahoraISO() };
        }

        case 'actualizar': {
          var r = rolDe(db, d.clave);
          var nuevo = String(d.estado || '');
          if (L.ESTADOS.indexOf(nuevo) < 0) falla('Estado inválido.');
          var q = db.pedidos.filter(function (z) { return z.codigo === d.codigo; })[0];
          if (!q) falla('Pedido no encontrado.');
          if (!L.transicionValida(q, nuevo, r)) falla('Este pedido ya cambió de estado. Actualiza la lista.');
          if (nuevo === 'EN_CAMINO') {
            var dom = L.texto(d.domiciliario, 60);
            if (!dom) falla('Escribe el nombre del domiciliario.');
            q.domiciliario = dom;
          }
          var cuando = L.ahoraISO();
          q.estado = nuevo;
          q.actualizado = cuando;
          var ev = { estado: nuevo, fecha: cuando, por: r === 'admin' ? 'Administración' : 'Domiciliario: ' + (L.texto(d.usuario, 40) || q.domiciliario) };
          var nota = L.texto(d.nota, 200);
          if (nota) ev.nota = nota;
          q.historial.push(ev);
          guardar(db);
          return { pedido: r === 'domiciliario' ? vistaDomiciliario(q) : q };
        }

        case 'tienda': {
          if (rolDe(db, d.clave) !== 'admin') falla('Solo el administrador puede cambiar este ajuste.');
          db.config.PEDIDOS_ABIERTOS = !!d.abiertos;
          guardar(db);
          return { abiertos: db.config.PEDIDOS_ABIERTOS };
        }
      }
      falla('Acción no reconocida.');
    });
  }

  window.LLEGO_API = {
    demo: DEMO,
    call: function (action, datos) { return DEMO ? demo(action, datos || {}) : remoto(action, datos || {}); }
  };
})();
